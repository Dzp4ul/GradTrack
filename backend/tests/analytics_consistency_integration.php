<?php

$_SERVER['REQUEST_METHOD'] = 'GET';
define('GRADTRACK_REPORTS_INDEX_NO_RUN', true);
require_once __DIR__ . '/../api/reports/index.php';

$failures = 0;

function analytics_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) {
        $failures++;
    }
}

function analytics_sum(array $rows, string $key): int
{
    return array_sum(array_map(static fn (array $row): int => (int)($row[$key] ?? 0), $rows));
}

function analytics_expected_rate(int $count, int $total): ?float
{
    return $total > 0 ? round(($count / $total) * 100, 1) : null;
}

try {
    $db = (new Database())->getConnection();
    $surveyId = (int)($db->query(
        "SELECT id FROM surveys
         WHERE status = 'active' AND archived_at IS NULL
         ORDER BY created_at DESC, id DESC LIMIT 1"
    )->fetchColumn() ?: 0);
    analytics_assert($surveyId > 0, 'an active, non-archived survey is available');

    if ($surveyId > 0) {
        $analytics = gradtrack_analytics_calculate($db, $surveyId, [
            'include_empty_programs' => true,
            'include_empty_years' => true,
        ]);
        $summary = $analytics['summary'];
        $programs = $analytics['by_program'];
        $years = $analytics['by_year'];

        analytics_assert(
            count(array_filter($programs, static fn (array $program): bool => (int)$program['active_graduate_count'] <= 0)) === 0,
            'analytics program dimensions only include programs represented by active graduates'
        );

        $reportSummary = gradtrack_analytics_summarize_records(
            gradtrack_analytics_build_records(
                getSurveyResponses($db, $surveyId),
                getSurveyQuestions($db, $surveyId)
            )
        );
        foreach (['response_count', 'employed', 'employment_total', 'aligned', 'not_aligned', 'alignment_total', 'employment_rate', 'alignment_rate'] as $key) {
            analytics_assert(
                $reportSummary[$key] === $summary[$key],
                "Reports and Dashboard source data agree on {$key}"
            );
        }

        $eligibleStmt = $db->prepare(
            "SELECT COUNT(DISTINCT sr.graduate_id)
             FROM survey_responses sr
             INNER JOIN graduates g ON g.id = sr.graduate_id
             WHERE sr.survey_id = :survey_id
               AND sr.submitted_at IS NOT NULL
               AND g.status = 'active'
               AND g.archived_at IS NULL"
        );
        $eligibleStmt->execute([':survey_id' => $surveyId]);
        analytics_assert(
            (int)$summary['response_count'] === (int)$eligibleStmt->fetchColumn(),
            'responses are counted once and require an active, non-archived graduate'
        );

        analytics_assert(
            count($analytics['responses']) === count(array_unique(array_column($analytics['responses'], 'graduate_id'))),
            'duplicate responses cannot inflate analytics totals'
        );
        analytics_assert(
            !in_array(null, array_column($analytics['responses'], 'graduate_id'), true),
            'detached historical responses are excluded from active analytics'
        );

        foreach (['response_count', 'employed', 'unemployed', 'employment_total', 'aligned', 'not_aligned', 'alignment_total'] as $key) {
            analytics_assert(
                analytics_sum($programs, $key) === (int)$summary[$key],
                "overall {$key} equals the sum of program {$key} values"
            );
        }

        analytics_assert(
            (int)$summary['employed'] + (int)$summary['unemployed'] === (int)$summary['employment_total'],
            'employment numerator categories reconcile with the valid employment denominator'
        );
        analytics_assert(
            (int)$summary['aligned'] + (int)$summary['not_aligned'] === (int)$summary['alignment_total'],
            'binary alignment distribution reconciles with the valid applicable denominator'
        );
        analytics_assert(
            $summary['employment_rate'] === analytics_expected_rate((int)$summary['employed'], (int)$summary['employment_total']),
            'employment rate uses employed divided by valid employment-status responses'
        );
        analytics_assert(
            $summary['alignment_rate'] === analytics_expected_rate((int)$summary['aligned'], (int)$summary['alignment_total']),
            'alignment rate uses aligned divided by valid applicable alignment responses'
        );

        foreach ($programs as $program) {
            $code = (string)$program['code'];
            analytics_assert(
                (int)$program['aligned'] + (int)$program['not_aligned'] === (int)$program['alignment_total'],
                "{$code} alignment distribution reconciles"
            );
            analytics_assert(
                $program['employment_rate'] === analytics_expected_rate((int)$program['employed'], (int)$program['employment_total']),
                "{$code} employment rate uses its valid denominator"
            );
            analytics_assert(
                $program['alignment_rate'] === analytics_expected_rate((int)$program['aligned'], (int)$program['alignment_total']),
                "{$code} alignment rate uses its valid applicable denominator"
            );
        }

        $expectedYears = array_map(
            static fn (array $row): int => (int)$row['year'],
            gradtrack_analytics_fetch_year_dimensions($db)
        );
        $actualYears = array_map(static fn (array $row): int => (int)$row['year'], $years);
        analytics_assert($actualYears === $expectedYears, 'trend years exactly match active graduate years');
        $sortedYears = $actualYears;
        sort($sortedYears, SORT_NUMERIC);
        analytics_assert($actualYears === $sortedYears, 'trend years are sorted ascending without a generated date window');

        $empty = gradtrack_analytics_finalize_bucket(gradtrack_analytics_empty_bucket());
        analytics_assert($empty['employment_rate'] === null, 'no employment answers returns No data instead of a fake 0%');
        analytics_assert($empty['alignment_rate'] === null, 'no alignment answers returns No data instead of a fake 0%');
        analytics_assert(gradtrack_analytics_classify_employment(null) === null, 'null employment answers are invalid');
        analytics_assert(gradtrack_analytics_classify_alignment(null) === null, 'null alignment answers are invalid');
        analytics_assert(gradtrack_analytics_classify_alignment('Partially related') === 'partially_aligned', 'partial alignment is a valid applicable response');

        $db->beginTransaction();
        try {
            $programId = (int)$db->query('SELECT id FROM programs ORDER BY id ASC LIMIT 1')->fetchColumn();
            $suffix = bin2hex(random_bytes(4));
            $graduateStmt = $db->prepare(
                "INSERT INTO graduates
                 (student_id, first_name, last_name, email, program_id, year_graduated, status)
                 VALUES (:student_id, 'Analytics', 'Fixture', :email, :program_id, 2026, 'active')"
            );
            $graduateStmt->execute([
                ':student_id' => 'AN-' . $suffix,
                ':email' => 'analytics-' . $suffix . '@example.invalid',
                ':program_id' => $programId,
            ]);
            $graduateId = (int)$db->lastInsertId();

            $surveyStmt = $db->prepare(
                "INSERT INTO surveys (title, description, status)
                 VALUES (:title, 'Analytics consistency fixture', 'draft')"
            );
            $surveyStmt->execute([':title' => 'Analytics fixture ' . $suffix]);
            $fixtureSurveyId = (int)$db->lastInsertId();

            $questionStmt = $db->prepare(
                "INSERT INTO survey_questions
                 (survey_id, section, question_text, question_type, is_required, sort_order)
                 VALUES (:survey_id, 'Employment', :question_text, 'radio', 1, :sort_order)"
            );
            $questionStmt->execute([
                ':survey_id' => $fixtureSurveyId,
                ':question_text' => 'Are you presently employed?',
                ':sort_order' => 1,
            ]);
            $employmentQuestionId = (int)$db->lastInsertId();
            $questionStmt->execute([
                ':survey_id' => $fixtureSurveyId,
                ':question_text' => 'Is your first job related to the course you took?',
                ':sort_order' => 2,
            ]);
            $alignmentQuestionId = (int)$db->lastInsertId();

            $responseStmt = $db->prepare(
                'INSERT INTO survey_responses (survey_id, graduate_id, responses, submitted_at)
                 VALUES (:survey_id, :graduate_id, :responses, NOW())'
            );
            $responseStmt->execute([
                ':survey_id' => $fixtureSurveyId,
                ':graduate_id' => $graduateId,
                ':responses' => json_encode([
                    (string)$employmentQuestionId => 'No',
                    (string)$alignmentQuestionId => 'No',
                ]),
            ]);
            $responseStmt->execute([
                ':survey_id' => $fixtureSurveyId,
                ':graduate_id' => $graduateId,
                ':responses' => json_encode([
                    (string)$employmentQuestionId => 'Yes',
                    (string)$alignmentQuestionId => 'Yes',
                ]),
            ]);

            $fixture = gradtrack_analytics_calculate($db, $fixtureSurveyId);
            analytics_assert((int)$fixture['summary']['response_count'] === 1, 'legacy duplicate responses are de-duplicated by graduate');
            analytics_assert((int)$fixture['summary']['employed'] === 1, 'the latest submitted duplicate is the canonical response');
            analytics_assert((int)$fixture['summary']['aligned'] === 1, 'the canonical duplicate supplies alignment statistics');

            $archiveStmt = $db->prepare('UPDATE graduates SET archived_at = NOW() WHERE id = :graduate_id');
            $archiveStmt->execute([':graduate_id' => $graduateId]);
            $archivedFixture = gradtrack_analytics_calculate($db, $fixtureSurveyId);
            analytics_assert((int)$archivedFixture['summary']['response_count'] === 0, 'archiving a graduate immediately removes all of their responses from active analytics');
        } finally {
            $db->rollBack();
        }
    }
} catch (Throwable $error) {
    if (isset($db) && $db instanceof PDO && $db->inTransaction()) {
        $db->rollBack();
    }
    analytics_assert(false, 'analytics consistency test completed without an exception: ' . $error->getMessage());
}

if ($failures > 0) {
    echo PHP_EOL . "{$failures} analytics consistency test(s) failed." . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All analytics consistency tests passed.' . PHP_EOL;
