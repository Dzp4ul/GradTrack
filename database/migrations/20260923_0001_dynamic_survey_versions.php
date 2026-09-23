<?php
declare(strict_types=1);

require_once __DIR__ . '/../../backend/api/config/survey_versioning.php';

return static function (PDO $db): void {
    $indexExists = static function (string $table, string $index) use ($db): bool {
        $statement = $db->prepare(
            'SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND INDEX_NAME = :index_name'
        );
        $statement->execute([':table' => $table, ':index_name' => $index]);
        return (int)$statement->fetchColumn() > 0;
    };

    $foreignKeyExists = static function (string $table, string $constraint) use ($db): bool {
        $statement = $db->prepare(
            'SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = :table
               AND CONSTRAINT_NAME = :constraint_name AND CONSTRAINT_TYPE = \'FOREIGN KEY\''
        );
        $statement->execute([':table' => $table, ':constraint_name' => $constraint]);
        return (int)$statement->fetchColumn() > 0;
    };

    $db->exec("CREATE TABLE IF NOT EXISTS survey_templates (
        id INT NOT NULL AUTO_INCREMENT,
        template_key CHAR(36) NOT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT NULL,
        current_version_id INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_survey_templates_key (template_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    foreach ([
        'template_id' => 'template_id INT NULL AFTER id',
        'version_number' => 'version_number INT UNSIGNED NOT NULL DEFAULT 1 AFTER template_id',
        'based_on_survey_id' => 'based_on_survey_id INT NULL AFTER version_number',
        'published_at' => 'published_at DATETIME NULL AFTER status',
        'locked_at' => 'locked_at DATETIME NULL AFTER published_at',
    ] as $column => $definition) {
        gradtrack_migration_add_column($db, 'surveys', $column, $definition);
    }

    foreach ([
        'section_id' => 'section_id INT NULL AFTER survey_id',
        'question_key' => 'question_key CHAR(36) NULL AFTER id',
        'analytics_key' => 'analytics_key VARCHAR(80) NULL AFTER question_key',
        'is_active' => 'is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER sort_order',
        'created_at' => 'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER is_active',
        'updated_at' => 'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
    ] as $column => $definition) {
        gradtrack_migration_add_column($db, 'survey_questions', $column, $definition);
    }

    gradtrack_migration_add_column(
        $db,
        'survey_responses',
        'survey_version_id',
        'survey_version_id INT NULL AFTER survey_id'
    );

    $db->exec("ALTER TABLE survey_questions MODIFY question_type
        ENUM('header','text','date','multiple_choice','radio','rating','checkbox') DEFAULT 'text'");

    $db->exec("CREATE TABLE IF NOT EXISTS survey_sections (
        id INT NOT NULL AUTO_INCREMENT,
        survey_id INT NOT NULL,
        section_key CHAR(36) NOT NULL,
        title VARCHAR(200) NOT NULL,
        display_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_survey_section_key (survey_id, section_key),
        UNIQUE KEY uq_survey_section_order (survey_id, display_order),
        CONSTRAINT fk_survey_sections_survey
            FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->exec("CREATE TABLE IF NOT EXISTS survey_question_options (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        survey_question_id INT NOT NULL,
        option_key CHAR(36) NOT NULL,
        option_value VARCHAR(500) NOT NULL,
        label VARCHAR(500) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_survey_question_option_key (survey_question_id, option_key),
        UNIQUE KEY uq_survey_question_option_value (survey_question_id, option_value),
        KEY idx_survey_question_options_order (survey_question_id, sort_order),
        CONSTRAINT fk_survey_question_options_question
            FOREIGN KEY (survey_question_id) REFERENCES survey_questions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->exec("CREATE TABLE IF NOT EXISTS survey_response_answers (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        survey_response_id INT NOT NULL,
        survey_question_id INT NOT NULL,
        question_key CHAR(36) NOT NULL,
        source_question_id INT NULL,
        is_canonical TINYINT(1) NOT NULL DEFAULT 1,
        answer_value JSON NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_survey_response_source (survey_response_id, source_question_id),
        KEY idx_survey_answers_question (survey_question_id),
        KEY idx_survey_answers_question_key (question_key),
        CONSTRAINT fk_survey_answers_response
            FOREIGN KEY (survey_response_id) REFERENCES survey_responses(id) ON DELETE CASCADE,
        CONSTRAINT fk_survey_answers_question
            FOREIGN KEY (survey_question_id) REFERENCES survey_questions(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    gradtrack_migration_add_column(
        $db,
        'survey_response_answers',
        'is_canonical',
        'is_canonical TINYINT(1) NOT NULL DEFAULT 1 AFTER source_question_id'
    );
    if (!$indexExists('survey_response_answers', 'idx_survey_answers_response')) {
        $db->exec('ALTER TABLE survey_response_answers ADD KEY idx_survey_answers_response (survey_response_id)');
    }
    if ($indexExists('survey_response_answers', 'uq_survey_response_question')) {
        $db->exec('ALTER TABLE survey_response_answers DROP INDEX uq_survey_response_question');
    }
    if (!$indexExists('survey_response_answers', 'uq_survey_response_source')) {
        $db->exec('ALTER TABLE survey_response_answers ADD UNIQUE KEY uq_survey_response_source (survey_response_id, source_question_id)');
    }

    $db->beginTransaction();
    try {
        $templateInsert = $db->prepare(
            'INSERT INTO survey_templates (template_key, title, description, current_version_id)
             VALUES (:template_key, :title, :description, :survey_id)'
        );
        $templateLink = $db->prepare(
            'UPDATE surveys
             SET template_id = :template_id,
                 version_number = COALESCE(NULLIF(version_number, 0), 1),
                 published_at = CASE WHEN status <> \'draft\' THEN COALESCE(published_at, created_at) ELSE published_at END,
                 locked_at = CASE WHEN status <> \'draft\' THEN COALESCE(locked_at, created_at) ELSE locked_at END
             WHERE id = :survey_id'
        );
        foreach ($db->query('SELECT id, title, description FROM surveys WHERE template_id IS NULL ORDER BY id') as $survey) {
            $templateInsert->execute([
                ':template_key' => gradtrack_survey_uuid(),
                ':title' => $survey['title'],
                ':description' => $survey['description'],
                ':survey_id' => (int)$survey['id'],
            ]);
            $templateLink->execute([
                ':template_id' => (int)$db->lastInsertId(),
                ':survey_id' => (int)$survey['id'],
            ]);
        }

        $questionUpdate = $db->prepare(
            'UPDATE survey_questions
             SET question_key = COALESCE(question_key, :question_key),
                 analytics_key = COALESCE(analytics_key, :analytics_key),
                 question_type = CASE
                    WHEN (question_type IS NULL OR question_type = \'\')
                         AND LOWER(question_text) LIKE \'professional examination(s) passed%\' THEN \'header\'
                    WHEN question_type IS NULL OR question_type = \'\' THEN \'text\'
                    ELSE question_type
                 END
             WHERE id = :id'
        );
        $questionsBySurvey = [];
        foreach ($db->query(
            'SELECT id, survey_id, section, question_text, question_type, options, is_required, sort_order,
                    question_key, analytics_key
             FROM survey_questions ORDER BY survey_id, sort_order, id'
        ) as $question) {
            $analyticsKey = trim((string)($question['analytics_key'] ?? ''));
            if ($analyticsKey === '') {
                $analyticsKey = gradtrack_survey_legacy_analytics_key($question['question_text']) ?? '';
            }
            $questionKey = trim((string)($question['question_key'] ?? '')) ?: gradtrack_survey_uuid();
            $questionUpdate->execute([
                ':question_key' => $questionKey,
                ':analytics_key' => $analyticsKey !== '' ? $analyticsKey : null,
                ':id' => (int)$question['id'],
            ]);
            $question['question_key'] = $questionKey;
            $question['analytics_key'] = $analyticsKey !== '' ? $analyticsKey : null;
            $questionsBySurvey[(int)$question['survey_id']][] = $question;
        }

        $sectionInsert = $db->prepare(
            'INSERT INTO survey_sections (survey_id, section_key, title, display_order)
             VALUES (:survey_id, :section_key, :title, :display_order)'
        );
        $sectionQuestionUpdate = $db->prepare(
            'UPDATE survey_questions SET section_id = :section_id WHERE id = :question_id'
        );
        foreach ($questionsBySurvey as $surveyId => $questions) {
            $sectionIds = [];
            foreach ($questions as $question) {
                $title = trim((string)($question['section'] ?? ''));
                if ($title === '') {
                    continue;
                }
                $normalized = gradtrack_survey_normalize_metadata_text($title);
                if (!isset($sectionIds[$normalized])) {
                    $sectionInsert->execute([
                        ':survey_id' => $surveyId,
                        ':section_key' => gradtrack_survey_uuid(),
                        ':title' => $title,
                        ':display_order' => count($sectionIds) + 1,
                    ]);
                    $sectionIds[$normalized] = (int)$db->lastInsertId();
                }
                $sectionQuestionUpdate->execute([
                    ':section_id' => $sectionIds[$normalized],
                    ':question_id' => (int)$question['id'],
                ]);
            }
        }

        $optionInsert = $db->prepare(
            'INSERT IGNORE INTO survey_question_options
             (survey_question_id, option_key, option_value, label, sort_order)
             VALUES (:question_id, :option_key, :option_value, :label, :sort_order)'
        );
        foreach ($questionsBySurvey as $questions) {
            foreach ($questions as $question) {
                foreach (gradtrack_survey_decode_options($question['options'] ?? null) as $index => $label) {
                    $optionInsert->execute([
                        ':question_id' => (int)$question['id'],
                        ':option_key' => gradtrack_survey_uuid(),
                        ':option_value' => $label,
                        ':label' => $label,
                        ':sort_order' => $index + 1,
                    ]);
                }
            }
        }

        $db->exec('UPDATE survey_responses SET survey_version_id = survey_id WHERE survey_version_id IS NULL');

        $answerRows = [];
        $flushAnswerRows = static function () use ($db, &$answerRows): void {
            if ($answerRows === []) return;
            $valueSql = [];
            $bindings = [];
            foreach ($answerRows as $row) {
                $valueSql[] = '(?, ?, ?, ?, ?, ?)';
                array_push(
                    $bindings,
                    $row['response_id'],
                    $row['question_id'],
                    $row['question_key'],
                    $row['source_question_id'],
                    $row['is_canonical'],
                    $row['answer_value']
                );
            }
            $statement = $db->prepare(
                'INSERT IGNORE INTO survey_response_answers
                 (survey_response_id, survey_question_id, question_key, source_question_id, is_canonical, answer_value)
                 VALUES ' . implode(', ', $valueSql)
            );
            $statement->execute($bindings);
            $answerRows = [];
        };
        $rawNumericAnswerCount = 0;
        foreach ($db->query('SELECT id, survey_id, responses FROM survey_responses ORDER BY id') as $response) {
            $surveyId = (int)$response['survey_id'];
            $questions = $questionsBySurvey[$surveyId] ?? [];
            $data = json_decode((string)$response['responses'], true);
            if (!is_array($data) || $questions === []) {
                continue;
            }

            $numericKeys = [];
            foreach (array_keys($data) as $key) {
                if (ctype_digit((string)$key)) {
                    $numericKeys[] = (int)$key;
                }
            }
            sort($numericKeys, SORT_NUMERIC);
            $rawNumericAnswerCount += count($numericKeys);
            if ($numericKeys === []) {
                continue;
            }

            $questionsById = [];
            foreach ($questions as $question) {
                $questionsById[(string)$question['id']] = $question;
            }
            $firstQuestionId = (int)$questions[0]['id'];
            $firstSortOrder = (int)$questions[0]['sort_order'];
            $firstResponseKey = min($numericKeys);
            $idOffset = $firstQuestionId - $firstResponseKey;
            $usedSourceKeys = [];

            foreach ($numericKeys as $numericSourceKey) {
                $sourceKey = (string)$numericSourceKey;
                $question = $questionsById[$sourceKey] ?? null;
                $isExact = $question !== null;
                if ($question === null) {
                    $legacyQuestionId = (string)($numericSourceKey + $idOffset);
                    $question = $questionsById[$legacyQuestionId] ?? null;
                }
                if ($question === null) {
                    $legacySortOrder = $firstSortOrder + ($numericSourceKey - $firstResponseKey);
                    foreach ($questions as $candidateQuestion) {
                        if ((int)$candidateQuestion['sort_order'] === $legacySortOrder) {
                            $question = $candidateQuestion;
                            break;
                        }
                    }
                }
                if ($question === null) continue;

                $usedSourceKeys[$sourceKey] = true;
                $answerRows[] = [
                    'response_id' => (int)$response['id'],
                    'question_id' => (int)$question['id'],
                    'question_key' => $question['question_key'],
                    'source_question_id' => (int)$sourceKey,
                    'is_canonical' => $isExact || !array_key_exists((string)$question['id'], $data) ? 1 : 0,
                    'answer_value' => json_encode($data[$sourceKey], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ];
                if (count($answerRows) >= 500) $flushAnswerRows();
            }

            if (count($usedSourceKeys) !== count($numericKeys)) {
                throw new RuntimeException(
                    'Historical response ' . (int)$response['id'] . ' mapped '
                    . count($usedSourceKeys) . ' of ' . count($numericKeys) . ' numeric answers.'
                );
            }
        }
        $flushAnswerRows();

        $normalizedAnswerCount = (int)$db->query('SELECT COUNT(*) FROM survey_response_answers')->fetchColumn();
        if ($normalizedAnswerCount !== $rawNumericAnswerCount) {
            throw new RuntimeException(
                "Survey answer migration count mismatch: {$rawNumericAnswerCount} source answers, "
                . "{$normalizedAnswerCount} normalized answers."
            );
        }

        $responseCount = (int)$db->query('SELECT COUNT(*) FROM survey_responses')->fetchColumn();
        $versionedResponseCount = (int)$db->query(
            'SELECT COUNT(*) FROM survey_responses WHERE survey_version_id = survey_id AND survey_version_id IS NOT NULL'
        )->fetchColumn();
        if ($responseCount !== $versionedResponseCount) {
            throw new RuntimeException('Not every historical response was attached to its original survey version.');
        }

        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }

    if (!$indexExists('surveys', 'uq_surveys_template_version')) {
        $db->exec('ALTER TABLE surveys ADD UNIQUE KEY uq_surveys_template_version (template_id, version_number)');
    }
    if (!$indexExists('surveys', 'idx_surveys_based_on')) {
        $db->exec('ALTER TABLE surveys ADD KEY idx_surveys_based_on (based_on_survey_id)');
    }
    if (!$indexExists('survey_questions', 'uq_survey_questions_key')) {
        $db->exec('ALTER TABLE survey_questions ADD UNIQUE KEY uq_survey_questions_key (survey_id, question_key)');
    }
    if (!$indexExists('survey_questions', 'uq_survey_questions_analytics_key')) {
        $db->exec('ALTER TABLE survey_questions ADD UNIQUE KEY uq_survey_questions_analytics_key (survey_id, analytics_key)');
    }
    if (!$indexExists('survey_questions', 'idx_survey_questions_section')) {
        $db->exec('ALTER TABLE survey_questions ADD KEY idx_survey_questions_section (section_id)');
    }
    if (!$indexExists('survey_responses', 'idx_survey_responses_version')) {
        $db->exec('ALTER TABLE survey_responses ADD KEY idx_survey_responses_version (survey_version_id)');
    }
    if (!$foreignKeyExists('surveys', 'fk_surveys_template')) {
        $db->exec('ALTER TABLE surveys ADD CONSTRAINT fk_surveys_template FOREIGN KEY (template_id) REFERENCES survey_templates(id) ON DELETE RESTRICT');
    }
    if (!$foreignKeyExists('surveys', 'fk_surveys_based_on')) {
        $db->exec('ALTER TABLE surveys ADD CONSTRAINT fk_surveys_based_on FOREIGN KEY (based_on_survey_id) REFERENCES surveys(id) ON DELETE RESTRICT');
    }
    if (!$foreignKeyExists('survey_questions', 'fk_survey_questions_section')) {
        $db->exec('ALTER TABLE survey_questions ADD CONSTRAINT fk_survey_questions_section FOREIGN KEY (section_id) REFERENCES survey_sections(id) ON DELETE RESTRICT');
    }
    if (!$foreignKeyExists('survey_responses', 'fk_survey_responses_version')) {
        $db->exec('ALTER TABLE survey_responses ADD CONSTRAINT fk_survey_responses_version FOREIGN KEY (survey_version_id) REFERENCES surveys(id) ON DELETE RESTRICT');
    }
};
