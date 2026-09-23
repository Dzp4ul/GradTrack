<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/graduation_years.php';
require_once __DIR__ . '/../api/config/survey_response_analytics.php';
require_once __DIR__ . '/../api/config/demo_seed_years.php';

$failures = 0;

function demo_year_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) {
        $failures++;
    }
}

$db = (new Database())->getConnection();
$targetYears = gradtrack_demo_target_graduation_years();
$expectedDistribution = array_fill_keys($targetYears, 231);
$seedCondition = "g.year_graduated BETWEEN 2016 AND 2020
    AND g.student_id REGEXP '^[0-9]{4}-[0-9]+$'
    AND CAST(LEFT(g.student_id, 4) AS UNSIGNED) = g.year_graduated - 4";

$distribution = array_fill_keys($targetYears, 0);
foreach ($db->query(
    "SELECT year_graduated, COUNT(*) AS total
       FROM graduates g
      WHERE {$seedCondition}
      GROUP BY year_graduated ORDER BY year_graduated"
)->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $distribution[(int)$row['year_graduated']] = (int)$row['total'];
}

demo_year_assert($distribution === $expectedDistribution, 'the 1,155 demo graduates are balanced 231 per year from 2016 through 2020');
demo_year_assert(
    (int)$db->query('SELECT COUNT(*) FROM graduates WHERE year_graduated BETWEEN 2021 AND 2025')->fetchColumn() === 0,
    'no graduate record remains in the legacy 2021-2025 seed range'
);
demo_year_assert(
    (int)$db->query(
        "SELECT COUNT(*) FROM graduates g
          WHERE g.year_graduated BETWEEN 2016 AND 2020
            AND NOT ({$seedCondition})"
    )->fetchColumn() === 0,
    'every 2016-2020 demo student-number prefix equals Year Graduated minus four'
);
demo_year_assert(
    (int)$db->query(
        'SELECT COUNT(*) FROM (
            SELECT student_id FROM graduates WHERE student_id IS NOT NULL
             GROUP BY student_id HAVING COUNT(*) > 1
         ) duplicate_student_ids'
    )->fetchColumn() === 0,
    'student numbers remain unique'
);

$activeSurveyId = (int)($db->query(
    "SELECT id FROM surveys WHERE status = 'active' AND archived_at IS NULL ORDER BY updated_at DESC, id DESC LIMIT 1"
)->fetchColumn() ?: 0);
$coverage = $activeSurveyId > 0
    ? gradtrack_get_survey_graduation_year_coverage($db, $activeSurveyId)
    : ['configured' => false, 'years' => []];
demo_year_assert($activeSurveyId > 0, 'an active survey is available');
demo_year_assert(
    !empty($coverage['configured']) && ($coverage['years'] ?? []) === $targetYears,
    'the active survey and Admin/MIS year filter expose exactly 2016-2020'
);

$analytics = gradtrack_analytics_calculate($db, $activeSurveyId, [
    'allowed_graduation_years' => $targetYears,
    'include_empty_programs' => true,
    'include_empty_years' => true,
]);
$summary = $analytics['summary'];
$expectedSummary = [
    'response_count' => 857,
    'employed' => 660,
    'unemployed' => 197,
    'employed_local' => 583,
    'employed_abroad' => 77,
    'aligned' => 413,
    'not_aligned' => 246,
];
foreach ($expectedSummary as $metric => $expected) {
    demo_year_assert((int)($summary[$metric] ?? -1) === $expected, "analytics preserve {$metric} = {$expected}");
}
demo_year_assert((float)($summary['employment_rate'] ?? -1) === 77.0, 'employment rate remains 77.0%');
demo_year_assert((float)($summary['alignment_rate'] ?? -1) === 62.7, 'alignment rate remains 62.7%');

$preservedTableCounts = [
    'graduates' => 1195,
    'graduate_accounts' => 20,
    'graduate_profiles' => 11,
    'employment' => 45,
    'registered_alumni' => 126,
    'survey_responses' => 871,
    'survey_response_answers' => 38438,
];
foreach ($preservedTableCounts as $table => $expectedCount) {
    $actualCount = (int)$db->query("SELECT COUNT(*) FROM `{$table}`")->fetchColumn();
    demo_year_assert($actualCount === $expectedCount, "{$table} record count remains {$expectedCount}");
}

$yearRows = $analytics['by_year'] ?? [];
demo_year_assert(
    array_map(static fn (array $row): int => (int)$row['year'], $yearRows) === $targetYears,
    'Reports & Analytics groups results only under 2016-2020'
);
demo_year_assert(
    array_sum(array_map(static fn (array $row): int => (int)$row['response_count'], $yearRows)) === 857,
    'By Year response counts reconcile to the preserved answered total'
);

$participationStmt = $db->prepare(
    "SELECT COUNT(*) AS total,
            COUNT(DISTINCT CASE WHEN sr.id IS NOT NULL THEN g.id END) AS answered
       FROM graduates g
       LEFT JOIN survey_responses sr
         ON sr.graduate_id = g.id
        AND sr.survey_id = :survey_id
        AND sr.submitted_at IS NOT NULL
      WHERE {$seedCondition}"
);
$participationStmt->execute([':survey_id' => $activeSurveyId]);
$participation = $participationStmt->fetch(PDO::FETCH_ASSOC);
demo_year_assert((int)$participation['total'] === 1155, 'the demo graduate total remains 1,155');
demo_year_assert((int)$participation['answered'] === 857, 'the answered graduate total remains 857');
demo_year_assert((int)$participation['total'] - (int)$participation['answered'] === 298, 'the no-response total remains 298');

$normalizedMismatchStmt = $db->query(
    "SELECT COUNT(*)
       FROM survey_response_answers sra
       JOIN survey_questions sq ON sq.id = sra.survey_question_id
       JOIN survey_responses sr ON sr.id = sra.survey_response_id
       JOIN graduates g ON g.id = sr.graduate_id
      WHERE sq.analytics_key = 'graduation_year'
        AND {$seedCondition}
        AND JSON_UNQUOTE(sra.answer_value) <> CAST(g.year_graduated AS CHAR)"
);
demo_year_assert((int)$normalizedMismatchStmt->fetchColumn() === 0, 'normalized survey graduation-year answers match their graduate records');

$rawMismatchStmt = $db->query(
    "SELECT COUNT(*)
       FROM survey_response_answers sra
       JOIN survey_questions sq ON sq.id = sra.survey_question_id
       JOIN survey_responses sr ON sr.id = sra.survey_response_id
       JOIN graduates g ON g.id = sr.graduate_id
      WHERE sq.analytics_key = 'graduation_year'
        AND {$seedCondition}
        AND (
            JSON_EXTRACT(sr.responses, CONCAT('$.\"', sra.source_question_id, '\"')) IS NULL
            OR JSON_UNQUOTE(JSON_EXTRACT(sr.responses, CONCAT('$.\"', sra.source_question_id, '\"')))
               <> CAST(g.year_graduated AS CHAR)
        )"
);
demo_year_assert((int)$rawMismatchStmt->fetchColumn() === 0, 'raw survey response JSON matches the authoritative graduate year');

$profileMismatchStmt = $db->query(
    "SELECT COUNT(*)
       FROM graduate_profiles gp
       JOIN graduate_accounts ga ON ga.id = gp.graduate_account_id
       JOIN graduates g ON g.id = ga.graduate_id
      WHERE {$seedCondition}
        AND (gp.graduation_year IS NULL OR gp.graduation_year <> g.year_graduated)"
);
demo_year_assert((int)$profileMismatchStmt->fetchColumn() === 0, 'graduate profile years match their authoritative graduate records');

$registrySource = $db->quote('Example seed: 75 survey responders + 50 non-responders');
demo_year_assert(
    (int)$db->query("SELECT COUNT(*) FROM registered_alumni WHERE source_file = {$registrySource}")->fetchColumn() === 125,
    'the seeded official alumni registry count remains 125'
);
demo_year_assert(
    (int)$db->query(
        "SELECT COUNT(*) FROM registered_alumni
          WHERE source_file = {$registrySource} AND batch_year BETWEEN 2021 AND 2025"
    )->fetchColumn() === 0,
    'no seeded official alumni registry row remains in 2021-2025'
);
demo_year_assert(
    (int)$db->query(
        "SELECT COUNT(*) FROM registered_alumni
          WHERE source_file = {$registrySource} AND batch_year BETWEEN 2016 AND 2020"
    )->fetchColumn() === 125,
    'all seeded official alumni registry rows use 2016-2020'
);
demo_year_assert(
    (int)$db->query(
        'SELECT COUNT(*)
           FROM registered_alumni ra
           JOIN graduate_accounts ga ON ga.id = ra.linked_user_id
           JOIN graduates g ON g.id = ga.graduate_id
          WHERE ra.batch_year <> g.year_graduated'
    )->fetchColumn() === 0,
    'linked official registry years match their graduate records'
);

$registrarYears = gradtrack_fetch_graduate_years($db, 'active');
demo_year_assert(
    count(array_intersect($registrarYears, [2021, 2022, 2023, 2024, 2025])) === 0,
    'Registrar year options no longer contain 2021-2025'
);
demo_year_assert(
    count(array_intersect($registrarYears, $targetYears)) === count($targetYears),
    'Registrar year options contain every target demo year'
);

$settingStmt = $db->query(
    "SELECT setting_key, setting_value
       FROM system_settings
      WHERE setting_key IN ('current_tracer_batch', 'default_graduation_year')"
);
$seedYearSettings = [];
foreach ($settingStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $seedYearSettings[(string)$row['setting_key']] = (string)$row['setting_value'];
}
demo_year_assert(
    ($seedYearSettings['current_tracer_batch'] ?? null) === 'Batch 2020',
    'the legacy tracer-batch seed default is Batch 2020'
);
demo_year_assert(
    ($seedYearSettings['default_graduation_year'] ?? null) === '2020',
    'the legacy default graduation year is 2020'
);

$orphanChecks = [
    'survey responses' => 'SELECT COUNT(*) FROM survey_responses sr LEFT JOIN graduates g ON g.id = sr.graduate_id WHERE sr.graduate_id IS NOT NULL AND g.id IS NULL',
    'graduate accounts' => 'SELECT COUNT(*) FROM graduate_accounts ga LEFT JOIN graduates g ON g.id = ga.graduate_id WHERE g.id IS NULL',
    'employment rows' => 'SELECT COUNT(*) FROM employment e LEFT JOIN graduates g ON g.id = e.graduate_id WHERE g.id IS NULL',
    'graduate profiles' => 'SELECT COUNT(*) FROM graduate_profiles gp LEFT JOIN graduate_accounts ga ON ga.id = gp.graduate_account_id WHERE ga.id IS NULL',
    'official registry links' => 'SELECT COUNT(*) FROM registered_alumni ra LEFT JOIN graduate_accounts ga ON ga.id = ra.linked_user_id WHERE ra.linked_user_id IS NOT NULL AND ga.id IS NULL',
];
foreach ($orphanChecks as $label => $query) {
    demo_year_assert((int)$db->query($query)->fetchColumn() === 0, "no broken foreign-key relationship exists for {$label}");
}

if ($failures > 0) {
    fwrite(STDERR, "\n{$failures} demo seed graduation-year integration assertion(s) failed.\n");
    exit(1);
}

echo "\nAll demo seed graduation-year migration checks passed.\n";
