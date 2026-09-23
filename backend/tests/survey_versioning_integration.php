<?php

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/survey_response_analytics.php';

$failures = 0;

function survey_versioning_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function survey_versioning_numeric_answer_count(PDO $db): int
{
    $count = 0;
    foreach ($db->query('SELECT responses FROM survey_responses') as $row) {
        $decoded = json_decode((string)$row['responses'], true);
        if (!is_array($decoded)) continue;
        foreach (array_keys($decoded) as $key) {
            if (ctype_digit((string)$key)) $count++;
        }
    }
    return $count;
}

try {
    $db = (new Database())->getConnection();
    $responseCount = (int)$db->query('SELECT COUNT(*) FROM survey_responses')->fetchColumn();
    $versionedResponseCount = (int)$db->query(
        'SELECT COUNT(*) FROM survey_responses WHERE survey_version_id = survey_id AND survey_version_id IS NOT NULL'
    )->fetchColumn();
    survey_versioning_assert($responseCount === $versionedResponseCount, 'every response references its exact survey version');

    $rawAnswerCount = survey_versioning_numeric_answer_count($db);
    $normalizedAnswerCount = (int)$db->query('SELECT COUNT(*) FROM survey_response_answers')->fetchColumn();
    survey_versioning_assert($rawAnswerCount === $normalizedAnswerCount, 'historical numeric answer count is unchanged after normalization');

    $questionCount = (int)$db->query('SELECT COUNT(*) FROM survey_questions')->fetchColumn();
    $stableQuestionCount = (int)$db->query(
        "SELECT COUNT(*) FROM survey_questions WHERE question_key IS NOT NULL AND question_key <> ''"
    )->fetchColumn();
    survey_versioning_assert($questionCount === $stableQuestionCount, 'every survey question has a permanent question key');

    $duplicateAnalyticsKeys = (int)$db->query(
        "SELECT COUNT(*) FROM (
            SELECT survey_id, analytics_key
            FROM survey_questions
            WHERE analytics_key IS NOT NULL
            GROUP BY survey_id, analytics_key
            HAVING COUNT(*) > 1
        ) duplicates"
    )->fetchColumn();
    survey_versioning_assert($duplicateAnalyticsKeys === 0, 'analytics keys are unique within each survey version');

    $surveyId = (int)($db->query(
        'SELECT survey_id FROM survey_responses GROUP BY survey_id ORDER BY COUNT(*) DESC LIMIT 1'
    )->fetchColumn() ?: 0);
    survey_versioning_assert($surveyId > 0, 'a historical survey is available for version-safety tests');

    if ($surveyId > 0) {
        $questions = gradtrack_analytics_fetch_questions($db, $surveyId);
        $responses = gradtrack_analytics_fetch_valid_responses($db, $surveyId);
        $baseline = gradtrack_analytics_summarize_records(
            gradtrack_analytics_build_records($responses, $questions)
        );

        $reordered = array_reverse($questions);
        foreach ($reordered as $index => &$question) $question['sort_order'] = $index + 1;
        unset($question);
        $afterReorder = gradtrack_analytics_summarize_records(
            gradtrack_analytics_build_records($responses, $reordered)
        );
        foreach (['employed', 'employment_total', 'aligned', 'alignment_total', 'employment_rate', 'alignment_rate'] as $metric) {
            survey_versioning_assert(
                $afterReorder[$metric] === $baseline[$metric],
                "reordering does not change {$metric}"
            );
        }

        $withNewQuestion = $reordered;
        array_splice($withNewQuestion, 2, 0, [[
            'id' => 999999999,
            'survey_id' => $surveyId,
            'question_key' => 'test-new-question',
            'analytics_key' => null,
            'question_text' => 'Professional certification after graduation?',
            'question_type' => 'radio',
            'sort_order' => 3,
        ]]);
        $afterInsert = gradtrack_analytics_summarize_records(
            gradtrack_analytics_build_records($responses, $withNewQuestion)
        );
        survey_versioning_assert($afterInsert === $afterReorder, 'inserting an unrelated question does not change canonical analytics');

        $withoutCivilStatus = array_values(array_filter(
            $questions,
            static fn (array $question): bool => ($question['analytics_key'] ?? null) !== 'civil_status'
        ));
        $afterUnrelatedDelete = gradtrack_analytics_summarize_records(
            gradtrack_analytics_build_records($responses, $withoutCivilStatus)
        );
        survey_versioning_assert($afterUnrelatedDelete === $baseline, 'deleting an unrelated question does not change canonical analytics');

        $withoutEmployment = array_values(array_filter(
            $questions,
            static fn (array $question): bool => ($question['analytics_key'] ?? null) !== 'employment_status'
        ));
        $missingEmployment = gradtrack_analytics_summarize_records(
            gradtrack_analytics_build_records($responses, $withoutEmployment)
        );
        survey_versioning_assert($missingEmployment['employment_rate'] === null, 'removing Employment Status returns unavailable instead of 0%');
        survey_versioning_assert((int)$missingEmployment['employment_total'] === 0, 'no other question is substituted for Employment Status');

        echo 'BASELINE: ' . json_encode([
            'survey_id' => $surveyId,
            'responses' => $baseline['response_count'],
            'employed' => $baseline['employed'],
            'employment_total' => $baseline['employment_total'],
            'employment_rate' => $baseline['employment_rate'],
            'aligned' => $baseline['aligned'],
            'alignment_total' => $baseline['alignment_total'],
            'alignment_rate' => $baseline['alignment_rate'],
            'employed_local' => $baseline['employed_local'],
            'employed_abroad' => $baseline['employed_abroad'],
        ], JSON_UNESCAPED_UNICODE) . PHP_EOL;
    }
} catch (Throwable $error) {
    survey_versioning_assert(false, 'versioning integration test completed without an exception: ' . $error->getMessage());
}

if ($failures > 0) {
    echo PHP_EOL . "{$failures} survey versioning test(s) failed." . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All survey versioning tests passed.' . PHP_EOL;

