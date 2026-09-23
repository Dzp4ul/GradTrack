<?php
declare(strict_types=1);

require_once __DIR__ . '/../../backend/api/config/demo_seed_years.php';

return static function (PDO $db): void {
    foreach (['graduates', 'graduate_accounts', 'survey_responses', 'survey_questions'] as $table) {
        if (!gradtrack_migration_table_exists($db, $table)) {
            throw new RuntimeException("Required table {$table} is missing.");
        }
    }

    $legacyYears = gradtrack_demo_legacy_graduation_years();
    $targetYears = gradtrack_demo_target_graduation_years();
    $expectedLegacyDistribution = gradtrack_demo_expected_legacy_distribution();
    $expectedDemoCount = array_sum($expectedLegacyDistribution);

    $legacyRows = $db->query(
        "SELECT id, student_id, program_id, year_graduated
           FROM graduates
          WHERE year_graduated BETWEEN 2021 AND 2025
            AND student_id REGEXP '^[0-9]{4}-[0-9]+$'
            AND CAST(LEFT(student_id, 4) AS UNSIGNED) = year_graduated - 4
          ORDER BY id"
    )->fetchAll(PDO::FETCH_ASSOC);

    if ($legacyRows === []) {
        // A fresh installation without the legacy demo import, or an already
        // normalized data set, has nothing to migrate.
        return;
    }

    $allRowsInLegacyYears = (int)$db->query(
        'SELECT COUNT(*) FROM graduates WHERE year_graduated BETWEEN 2021 AND 2025'
    )->fetchColumn();
    if ($allRowsInLegacyYears !== count($legacyRows)) {
        throw new RuntimeException(
            'Refusing demo-year migration because 2021-2025 contains records outside the known demo signature.'
        );
    }

    $actualLegacyDistribution = array_fill_keys($legacyYears, 0);
    foreach ($legacyRows as $row) {
        $actualLegacyDistribution[(int)$row['year_graduated']]++;
    }
    if (count($legacyRows) !== $expectedDemoCount || $actualLegacyDistribution !== $expectedLegacyDistribution) {
        throw new RuntimeException(
            'Refusing demo-year migration because the legacy cohort does not match the expected 1,155-row seed distribution.'
        );
    }

    $assignments = gradtrack_build_demo_year_assignments($legacyRows);
    $targetDistribution = gradtrack_demo_assignment_distribution($assignments);
    $minimumTargetCount = min($targetDistribution);
    $maximumTargetCount = max($targetDistribution);
    if ($maximumTargetCount - $minimumTargetCount > 1) {
        throw new RuntimeException('The generated demo-year distribution is not balanced.');
    }

    $allStudentIds = [];
    foreach ($db->query('SELECT id, student_id FROM graduates WHERE student_id IS NOT NULL')->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $allStudentIds[(string)$row['student_id']] = (int)$row['id'];
    }
    $plannedStudentIds = [];
    foreach ($assignments as $graduateId => $assignment) {
        $newStudentId = $assignment['new_student_id'];
        if (isset($plannedStudentIds[$newStudentId])) {
            throw new RuntimeException("The demo-year plan would duplicate student number {$newStudentId}.");
        }
        $plannedStudentIds[$newStudentId] = $graduateId;

        $existingGraduateId = $allStudentIds[$newStudentId] ?? null;
        if ($existingGraduateId !== null && !isset($assignments[$existingGraduateId])) {
            throw new RuntimeException("Student number {$newStudentId} already belongs to a non-demo graduate.");
        }
    }

    $seedRegistrySource = 'Example seed: 75 survey responders + 50 non-responders';
    $registryPlan = [];
    if (gradtrack_migration_table_exists($db, 'registered_alumni')) {
        $registryStmt = $db->prepare(
            'SELECT ra.id, ra.normalized_name, ra.course_code, ra.batch_year, ga.graduate_id
               FROM registered_alumni ra
               LEFT JOIN graduate_accounts ga ON ga.id = ra.linked_user_id
              WHERE ra.source_file = :source_file
              ORDER BY ra.id'
        );
        $registryStmt->execute([':source_file' => $seedRegistrySource]);
        $seedRegistryRows = $registryStmt->fetchAll(PDO::FETCH_ASSOC);

        if ($seedRegistryRows !== [] && count($seedRegistryRows) !== 125) {
            throw new RuntimeException('Refusing to migrate an incomplete seeded alumni registry population.');
        }

        foreach ($seedRegistryRows as $row) {
            $oldYear = (int)$row['batch_year'];
            if (!in_array($oldYear, $legacyYears, true)) {
                throw new RuntimeException('A seeded alumni registry row is outside the legacy 2021-2025 range.');
            }

            $linkedGraduateId = (int)($row['graduate_id'] ?? 0);
            if ($linkedGraduateId > 0 && !isset($assignments[$linkedGraduateId])) {
                throw new RuntimeException('A seeded alumni registry row is linked to a non-demo graduate.');
            }

            $registryPlan[(int)$row['id']] = [
                'normalized_name' => (string)$row['normalized_name'],
                'course_code' => strtoupper((string)$row['course_code']),
                'new_year' => $linkedGraduateId > 0
                    ? $assignments[$linkedGraduateId]['new_year']
                    : $oldYear - 5,
            ];
        }

        $registryIdentityKeys = [];
        foreach ($db->query(
            'SELECT id, normalized_name, course_code, batch_year FROM registered_alumni ORDER BY id'
        )->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $registryId = (int)$row['id'];
            $newYear = $registryPlan[$registryId]['new_year'] ?? (int)$row['batch_year'];
            $identityKey = strtolower((string)$row['normalized_name'])
                . '|' . strtoupper((string)$row['course_code'])
                . '|' . $newYear;
            if (isset($registryIdentityKeys[$identityKey])) {
                throw new RuntimeException('The demo-year plan would duplicate an official alumni registry identity.');
            }
            $registryIdentityKeys[$identityKey] = $registryId;
        }
    }

    $baseline = [
        'graduates' => (int)$db->query('SELECT COUNT(*) FROM graduates')->fetchColumn(),
        'survey_responses' => (int)$db->query('SELECT COUNT(*) FROM survey_responses')->fetchColumn(),
        'graduate_accounts' => (int)$db->query('SELECT COUNT(*) FROM graduate_accounts')->fetchColumn(),
        'employment' => gradtrack_migration_table_exists($db, 'employment')
            ? (int)$db->query('SELECT COUNT(*) FROM employment')->fetchColumn()
            : null,
        'registered_alumni' => gradtrack_migration_table_exists($db, 'registered_alumni')
            ? (int)$db->query('SELECT COUNT(*) FROM registered_alumni')->fetchColumn()
            : null,
        'survey_response_answers' => gradtrack_migration_table_exists($db, 'survey_response_answers')
            ? (int)$db->query('SELECT COUNT(*) FROM survey_response_answers')->fetchColumn()
            : null,
    ];

    $db->beginTransaction();
    try {
        $updateGraduate = $db->prepare(
            'UPDATE graduates
                SET student_id = :student_id, year_graduated = :year_graduated
              WHERE id = :id AND student_id = :old_student_id AND year_graduated = :old_year'
        );
        foreach ($assignments as $assignment) {
            $updateGraduate->execute([
                ':student_id' => $assignment['new_student_id'],
                ':year_graduated' => $assignment['new_year'],
                ':id' => $assignment['graduate_id'],
                ':old_student_id' => $assignment['old_student_id'],
                ':old_year' => $assignment['old_year'],
            ]);
            if ($updateGraduate->rowCount() !== 1) {
                throw new RuntimeException('A demo graduate changed while the migration was being applied.');
            }
        }

        if (gradtrack_migration_table_exists($db, 'graduate_profiles')) {
            $updateProfile = $db->prepare(
                'UPDATE graduate_profiles gp
                 JOIN graduate_accounts ga ON ga.id = gp.graduate_account_id
                    SET gp.graduation_year = :year_graduated
                  WHERE ga.graduate_id = :graduate_id'
            );
            foreach ($assignments as $assignment) {
                $updateProfile->execute([
                    ':year_graduated' => $assignment['new_year'],
                    ':graduate_id' => $assignment['graduate_id'],
                ]);
            }
        }

        if ($registryPlan !== []) {
            $updateRegistry = $db->prepare(
                'UPDATE registered_alumni SET batch_year = :batch_year WHERE id = :id AND source_file = :source_file'
            );
            foreach ($registryPlan as $registryId => $registryAssignment) {
                $updateRegistry->execute([
                    ':batch_year' => $registryAssignment['new_year'],
                    ':id' => $registryId,
                    ':source_file' => $seedRegistrySource,
                ]);
                if ($updateRegistry->rowCount() !== 1) {
                    throw new RuntimeException('A seeded official alumni registry row changed during migration.');
                }
            }
        }

        $responseRows = [];
        $assignmentIds = array_keys($assignments);
        foreach (array_chunk($assignmentIds, 400) as $idChunk) {
            $placeholders = implode(',', array_fill(0, count($idChunk), '?'));
            $stmt = $db->prepare(
                "SELECT id, survey_id, graduate_id, responses
                   FROM survey_responses
                  WHERE graduate_id IN ({$placeholders})
                  ORDER BY id"
            );
            $stmt->execute($idChunk);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $response) {
                $responseRows[(int)$response['id']] = $response;
            }
        }

        $answersByResponse = [];
        if ($responseRows !== [] && gradtrack_migration_table_exists($db, 'survey_response_answers')) {
            foreach (array_chunk(array_keys($responseRows), 400) as $responseIdChunk) {
                $placeholders = implode(',', array_fill(0, count($responseIdChunk), '?'));
                $stmt = $db->prepare(
                    "SELECT sra.id, sra.survey_response_id, sra.survey_question_id,
                            sra.question_key, sra.source_question_id
                       FROM survey_response_answers sra
                       JOIN survey_questions sq ON sq.id = sra.survey_question_id
                      WHERE sq.analytics_key = 'graduation_year'
                        AND sra.survey_response_id IN ({$placeholders})
                      ORDER BY sra.id"
                );
                $stmt->execute($responseIdChunk);
                foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $answer) {
                    $answersByResponse[(int)$answer['survey_response_id']][] = $answer;
                }
            }
        }

        $updateAnswer = $db->prepare(
            'UPDATE survey_response_answers SET answer_value = :answer_value WHERE id = :id'
        );
        $updateResponse = $db->prepare(
            'UPDATE survey_responses SET responses = :responses WHERE id = :id'
        );
        $affectedSurveyIds = [];
        foreach ($responseRows as $responseId => $response) {
            $assignment = $assignments[(int)$response['graduate_id']];
            $newYear = (string)$assignment['new_year'];
            $affectedSurveyIds[(int)$response['survey_id']] = true;
            $decoded = json_decode((string)$response['responses'], true);
            if (!is_array($decoded)) {
                throw new RuntimeException("Survey response {$responseId} does not contain a valid JSON object.");
            }

            $changed = false;
            foreach ($answersByResponse[$responseId] ?? [] as $answer) {
                $updateAnswer->execute([
                    ':answer_value' => json_encode($newYear, JSON_THROW_ON_ERROR),
                    ':id' => (int)$answer['id'],
                ]);

                foreach (array_unique(array_filter([
                    (string)($answer['source_question_id'] ?? ''),
                    (string)($answer['survey_question_id'] ?? ''),
                    (string)($answer['question_key'] ?? ''),
                ])) as $responseKey) {
                    if (array_key_exists($responseKey, $decoded)) {
                        $decoded[$responseKey] = $newYear;
                        $changed = true;
                    }
                }
            }

            foreach (['year_graduated', 'graduation_year', 'batch_year', 'graduate_year'] as $semanticKey) {
                if (array_key_exists($semanticKey, $decoded)) {
                    $decoded[$semanticKey] = $newYear;
                    $changed = true;
                }
            }

            if ($changed) {
                $updateResponse->execute([
                    ':responses' => json_encode($decoded, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
                    ':id' => $responseId,
                ]);
            }
        }

        if ($affectedSurveyIds !== []) {
            $surveyIdList = array_keys($affectedSurveyIds);
            $placeholders = implode(',', array_fill(0, count($surveyIdList), '?'));
            $questionStmt = $db->prepare(
                "SELECT id, options
                   FROM survey_questions
                  WHERE analytics_key = 'graduation_year'
                    AND is_active = 1
                    AND survey_id IN ({$placeholders})
                  ORDER BY id"
            );
            $questionStmt->execute($surveyIdList);
            $updateQuestion = $db->prepare('UPDATE survey_questions SET options = :options WHERE id = :id');
            $updateOption = $db->prepare(
                'UPDATE survey_question_options
                    SET option_value = :option_value, label = :label
                  WHERE id = :id AND survey_question_id = :question_id'
            );

            foreach ($questionStmt->fetchAll(PDO::FETCH_ASSOC) as $question) {
                $options = json_decode((string)$question['options'], true);
                $normalizedOptions = is_array($options) ? array_map('strval', array_values($options)) : [];
                if ($normalizedOptions !== array_map('strval', $legacyYears)) {
                    continue;
                }

                $questionId = (int)$question['id'];
                $updateQuestion->execute([
                    ':options' => json_encode(array_map('strval', $targetYears), JSON_THROW_ON_ERROR),
                    ':id' => $questionId,
                ]);

                if (gradtrack_migration_table_exists($db, 'survey_question_options')) {
                    $optionStmt = $db->prepare(
                        'SELECT id FROM survey_question_options
                          WHERE survey_question_id = :question_id
                          ORDER BY sort_order, id'
                    );
                    $optionStmt->execute([':question_id' => $questionId]);
                    $optionRows = $optionStmt->fetchAll(PDO::FETCH_ASSOC);
                    if ($optionRows !== [] && count($optionRows) !== count($targetYears)) {
                        throw new RuntimeException('Graduation-year option rows do not match the five configured seed years.');
                    }
                    foreach ($optionRows as $index => $optionRow) {
                        $yearText = (string)$targetYears[$index];
                        $updateOption->execute([
                            ':option_value' => $yearText,
                            ':label' => $yearText,
                            ':id' => (int)$optionRow['id'],
                            ':question_id' => $questionId,
                        ]);
                    }
                }
            }
        }

        if (gradtrack_migration_table_exists($db, 'system_settings')) {
            $settingsUpdate = $db->prepare(
                'UPDATE system_settings
                    SET setting_value = :new_value
                  WHERE setting_key = :setting_key AND setting_value = :old_value'
            );
            foreach ([
                ['current_tracer_batch', 'Batch 2025', 'Batch 2020'],
                ['default_graduation_year', '2025', '2020'],
            ] as [$settingKey, $oldValue, $newValue]) {
                $settingsUpdate->execute([
                    ':new_value' => $newValue,
                    ':setting_key' => $settingKey,
                    ':old_value' => $oldValue,
                ]);
            }
        }

        $remainingLegacyGraduates = (int)$db->query(
            'SELECT COUNT(*) FROM graduates WHERE year_graduated BETWEEN 2021 AND 2025'
        )->fetchColumn();
        if ($remainingLegacyGraduates !== 0) {
            throw new RuntimeException('Legacy 2021-2025 demo graduates remain after migration.');
        }

        foreach ($assignments as $assignment) {
            $parts = gradtrack_demo_student_number_parts($assignment['new_student_id']);
            if ($parts === null || $parts['prefix'] !== $assignment['new_year'] - 4) {
                throw new RuntimeException('A migrated student number does not follow the graduation-year-minus-four rule.');
            }
        }

        $duplicateStudentIds = (int)$db->query(
            'SELECT COUNT(*) FROM (
                SELECT student_id FROM graduates
                 WHERE student_id IS NOT NULL
                 GROUP BY student_id HAVING COUNT(*) > 1
             ) duplicate_student_ids'
        )->fetchColumn();
        if ($duplicateStudentIds !== 0) {
            throw new RuntimeException('Duplicate student numbers were detected after demo-year migration.');
        }

        if (gradtrack_migration_table_exists($db, 'survey_response_answers')) {
            $mismatchedYearAnswers = (int)$db->query(
                "SELECT COUNT(*)
                   FROM survey_response_answers sra
                   JOIN survey_questions sq ON sq.id = sra.survey_question_id
                   JOIN survey_responses sr ON sr.id = sra.survey_response_id
                   JOIN graduates g ON g.id = sr.graduate_id
                  WHERE sq.analytics_key = 'graduation_year'
                    AND g.year_graduated BETWEEN 2016 AND 2020
                    AND JSON_UNQUOTE(sra.answer_value) <> CAST(g.year_graduated AS CHAR)"
            )->fetchColumn();
            if ($mismatchedYearAnswers !== 0) {
                throw new RuntimeException('A normalized survey graduation-year answer does not match its graduate.');
            }
        }

        $after = [
            'graduates' => (int)$db->query('SELECT COUNT(*) FROM graduates')->fetchColumn(),
            'survey_responses' => (int)$db->query('SELECT COUNT(*) FROM survey_responses')->fetchColumn(),
            'graduate_accounts' => (int)$db->query('SELECT COUNT(*) FROM graduate_accounts')->fetchColumn(),
            'employment' => gradtrack_migration_table_exists($db, 'employment')
                ? (int)$db->query('SELECT COUNT(*) FROM employment')->fetchColumn()
                : null,
            'registered_alumni' => gradtrack_migration_table_exists($db, 'registered_alumni')
                ? (int)$db->query('SELECT COUNT(*) FROM registered_alumni')->fetchColumn()
                : null,
            'survey_response_answers' => gradtrack_migration_table_exists($db, 'survey_response_answers')
                ? (int)$db->query('SELECT COUNT(*) FROM survey_response_answers')->fetchColumn()
                : null,
        ];
        if ($after !== $baseline) {
            throw new RuntimeException('Record counts changed during the demo-year migration.');
        }

        $db->commit();
    } catch (Throwable $exception) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $exception;
    }
};
