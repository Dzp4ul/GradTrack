<?php

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/graduation_years.php';
require_once __DIR__ . '/../api/config/survey_response_analytics.php';
require_once __DIR__ . '/../api/config/inferential_analysis.php';

$failures = 0;

function inferential_integration_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function inferential_integration_result_is_safe(array $result): bool
{
    if (!in_array($result['status'] ?? '', ['complete', 'insufficient_variation'], true)) return false;
    $analysis = $result['analysis'] ?? [];
    if (($analysis['validResponses'] ?? -1) < 0 || ($analysis['excludedResponses'] ?? -1) < 0) return false;
    if (($analysis['canCalculate'] ?? false) !== true) {
        return ($analysis['chiSquare'] ?? null) === null
            && ($analysis['pValue'] ?? null) === null
            && ($analysis['cramersV'] ?? null) === null;
    }

    foreach (['chiSquare', 'pValue', 'cramersV'] as $key) {
        if (!isset($analysis[$key]) || !is_finite((float)$analysis[$key])) return false;
    }
    return (float)$analysis['pValue'] >= 0.0 && (float)$analysis['pValue'] <= 1.0;
}

function inferential_integration_signature(array $result): string
{
    return json_encode([
        'analysis' => $result['analysis'],
        'contingencyTable' => $result['contingencyTable'],
        'expectedFrequencies' => $result['expectedFrequencies'],
        'assumptions' => $result['assumptions'],
    ], JSON_PRESERVE_ZERO_FRACTION);
}

try {
    $db = (new Database())->getConnection();
    $surveyId = (int)($db->query(
        "SELECT s.id
         FROM surveys s
         WHERE s.archived_at IS NULL
         ORDER BY (s.status = 'active') DESC,
                  (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) DESC,
                  s.id DESC
         LIMIT 1"
    )->fetchColumn() ?: 0);
    inferential_integration_assert($surveyId > 0, 'a survey is available for live inferential checks');

    if ($surveyId > 0) {
        $coverage = gradtrack_get_survey_graduation_year_coverage($db, $surveyId);
        $options = $coverage['configured'] ? ['allowed_graduation_years' => $coverage['years']] : [];
        $responses = gradtrack_analytics_fetch_valid_responses($db, $surveyId, $options);
        $questions = gradtrack_analytics_fetch_questions($db, $surveyId);
        $records = gradtrack_inferential_complete_record_set(
            $responses,
            gradtrack_analytics_build_records($responses, $questions)
        );
        $roles = gradtrack_analytics_question_roles($questions);

        inferential_integration_assert(count($records) === count($responses), 'canonical records are built once per eligible response');
        inferential_integration_assert(count($records) > 0, 'the selected survey contains live eligible responses');

        $analyses = [
            ['program', 'employment_status', !empty($roles['employment'])],
            ['program', 'job_course_alignment', !empty($roles['alignment'])],
            ['graduation_year', 'employment_status', !empty($roles['employment'])],
            ['graduation_year', 'job_course_alignment', !empty($roles['alignment'])],
            ['employment_status', 'work_location', !empty($roles['employment']) && !empty($roles['work_location'])],
        ];

        foreach ($analyses as [$variable1, $variable2, $available]) {
            if (!$available) {
                echo "SKIP: {$variable1} x {$variable2} is unavailable in this survey version." . PHP_EOL;
                continue;
            }
            $result = gradtrack_inferential_analyze_records($records, $variable1, $variable2);
            $label = "{$variable1} x {$variable2}";
            inferential_integration_assert(inferential_integration_result_is_safe($result), "{$label} returns a safe statistical result");
            inferential_integration_assert(
                (int)$result['analysis']['validResponses'] + (int)$result['analysis']['excludedResponses'] === count($records),
                "{$label} uses one consistent valid-plus-excluded denominator"
            );
            inferential_integration_assert(
                array_sum($result['contingencyTable']['columnTotals']) === (int)$result['analysis']['validResponses'],
                "{$label} contingency totals reconcile with valid paired responses"
            );
            echo sprintf(
                "RESULT: %s | valid=%d | excluded=%d | chi2=%s | df=%s | p=%s | V=%s%s",
                $label,
                $result['analysis']['validResponses'],
                $result['analysis']['excludedResponses'],
                $result['analysis']['chiSquare'] === null ? 'not calculated' : number_format((float)$result['analysis']['chiSquare'], 6, '.', ''),
                $result['analysis']['degreesOfFreedom'] ?? 'not calculated',
                $result['analysis']['pValue'] === null ? 'not calculated' : number_format((float)$result['analysis']['pValue'], 9, '.', ''),
                $result['analysis']['cramersV'] === null ? 'not calculated' : number_format((float)$result['analysis']['cramersV'], 6, '.', ''),
                PHP_EOL
            );
        }

        $availableRecordYears = array_values(array_unique(array_filter(array_map(
            static fn (array $record): int => (int)($record['year'] ?? 0),
            $records
        ))));
        sort($availableRecordYears, SORT_NUMERIC);
        if ($availableRecordYears !== [] && !empty($roles['employment'])) {
            $selectedYear = $availableRecordYears[0];
            $yearRecords = gradtrack_analytics_filter_records($records, ['graduation_year' => $selectedYear]);
            $yearResult = gradtrack_inferential_analyze_records($yearRecords, 'program', 'employment_status');
            inferential_integration_assert(
                count(array_filter($yearRecords, static fn (array $record): bool => (int)$record['year'] !== $selectedYear)) === 0,
                'a graduation-year filter does not retain responses from another year'
            );
            inferential_integration_assert(
                (int)$yearResult['analysis']['validResponses'] + (int)$yearResult['analysis']['excludedResponses'] === count($yearRecords),
                'all statistical outputs recalculate from the filtered-year dataset'
            );
        }

        if (!empty($roles['employment'])) {
            $baseline = gradtrack_inferential_analyze_records($records, 'program', 'employment_status');
            $baselineSignature = inferential_integration_signature($baseline);
            $db->beginTransaction();
            try {
                $maxOrderStatement = $db->prepare('SELECT COALESCE(MAX(sort_order), 0) FROM survey_questions WHERE survey_id = :survey_id');
                $maxOrderStatement->execute([':survey_id' => $surveyId]);
                $sortOrder = (int)$maxOrderStatement->fetchColumn() + 1000;
                $insert = $db->prepare(
                    "INSERT INTO survey_questions
                     (survey_id, question_key, analytics_key, section, question_text, question_type, options, is_required, sort_order, is_active)
                     VALUES (:survey_id, :question_key, NULL, 'Integration Test', 'Unrelated inferential stability question', 'text', NULL, 0, :sort_order, 1)"
                );
                $insert->execute([
                    ':survey_id' => $surveyId,
                    ':question_key' => sprintf(
                        '%08s-%04s-%04s-%04s-%012s',
                        bin2hex(random_bytes(4)),
                        bin2hex(random_bytes(2)),
                        bin2hex(random_bytes(2)),
                        bin2hex(random_bytes(2)),
                        bin2hex(random_bytes(6))
                    ),
                    ':sort_order' => $sortOrder,
                ]);
                $insertedQuestionId = (int)$db->lastInsertId();
                $withUnrelatedQuestion = gradtrack_inferential_analyze_records(
                    gradtrack_analytics_build_records($responses, gradtrack_analytics_fetch_questions($db, $surveyId)),
                    'program',
                    'employment_status'
                );
                inferential_integration_assert(
                    inferential_integration_signature($withUnrelatedQuestion) === $baselineSignature,
                    'adding an unrelated survey question does not shift inferential mappings or results'
                );

                $delete = $db->prepare('DELETE FROM survey_questions WHERE id = :id');
                $delete->execute([':id' => $insertedQuestionId]);
                $afterDelete = gradtrack_inferential_analyze_records(
                    gradtrack_analytics_build_records($responses, gradtrack_analytics_fetch_questions($db, $surveyId)),
                    'program',
                    'employment_status'
                );
                inferential_integration_assert(
                    inferential_integration_signature($afterDelete) === $baselineSignature,
                    'deleting an unrelated survey question does not shift inferential mappings or results'
                );
                $db->rollBack();
            } catch (Throwable $exception) {
                if ($db->inTransaction()) $db->rollBack();
                throw $exception;
            }
        }

        $otherSurveyIdStatement = $db->prepare(
            'SELECT id FROM surveys WHERE id <> :survey_id ORDER BY id DESC LIMIT 1'
        );
        $otherSurveyIdStatement->execute([':survey_id' => $surveyId]);
        $otherSurveyId = (int)($otherSurveyIdStatement->fetchColumn() ?: 0);
        if ($otherSurveyId > 0) {
            $otherResponses = gradtrack_analytics_fetch_valid_responses($db, $otherSurveyId);
            $selectedSurveyResponseIds = array_column($responses, 'response_id');
            $otherSurveyResponseIds = array_column($otherResponses, 'response_id');
            inferential_integration_assert(
                array_intersect($selectedSurveyResponseIds, $otherSurveyResponseIds) === [],
                'changing surveys produces an isolated response dataset with no stale response IDs'
            );
        }
    }
} catch (Throwable $exception) {
    inferential_integration_assert(false, 'live inferential integration checks completed: ' . $exception->getMessage());
}

if ($failures > 0) {
    echo PHP_EOL . "{$failures} inferential integration test(s) failed." . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All inferential analysis integration tests passed.' . PHP_EOL;
