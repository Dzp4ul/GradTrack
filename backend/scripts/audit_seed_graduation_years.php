<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/graduation_years.php';
require_once __DIR__ . '/../api/config/survey_response_analytics.php';
require_once __DIR__ . '/../api/config/demo_seed_years.php';

$db = (new Database())->getConnection();
$activeSurveyId = (int) ($db->query(
    "SELECT id FROM surveys WHERE status = 'active' AND archived_at IS NULL ORDER BY updated_at DESC, id DESC LIMIT 1"
)->fetchColumn() ?: 0);
$activeCoverage = $activeSurveyId > 0
    ? gradtrack_get_survey_graduation_year_coverage($db, $activeSurveyId)
    : ['years' => [], 'configured' => false];
$activeAnalytics = $activeSurveyId > 0 && !empty($activeCoverage['configured'])
    ? gradtrack_analytics_calculate($db, $activeSurveyId, [
        'allowed_graduation_years' => $activeCoverage['years'],
        'include_empty_programs' => true,
        'include_empty_years' => true,
    ])
    : ['summary' => [], 'by_year' => []];
$legacyDemoRows = $db->query(
    "SELECT id, student_id, program_id, year_graduated
       FROM graduates
      WHERE year_graduated BETWEEN 2021 AND 2025
        AND student_id REGEXP '^[0-9]{4}-[0-9]+$'
        AND CAST(LEFT(student_id, 4) AS UNSIGNED) = year_graduated - 4
      ORDER BY id"
)->fetchAll(PDO::FETCH_ASSOC);
$projectedAssignments = $legacyDemoRows !== []
    ? gradtrack_build_demo_year_assignments($legacyDemoRows)
    : [];

$tables = $db->query(
    'SELECT TABLE_NAME, TABLE_ROWS
       FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME'
)->fetchAll(PDO::FETCH_ASSOC);

$yearColumns = $db->query(
    "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND (
            COLUMN_NAME LIKE '%year%'
            OR COLUMN_NAME LIKE '%batch%'
            OR COLUMN_NAME IN ('student_id', 'graduate_id', 'linked_graduate_id')
        )
      ORDER BY TABLE_NAME, ORDINAL_POSITION"
)->fetchAll(PDO::FETCH_ASSOC);

$describeTables = [
    'graduates',
    'graduate_accounts',
    'graduate_profiles',
    'registered_alumni',
    'survey_responses',
    'survey_response_answers',
    'survey_questions',
];
$tableColumns = [];
foreach ($describeTables as $table) {
    $stmt = $db->prepare(
        'SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table
          ORDER BY ORDINAL_POSITION'
    );
    $stmt->execute([':table' => $table]);
    $tableColumns[$table] = $stmt->fetchAll(PDO::FETCH_ASSOC);
}

$summary = [
    'database' => (string) $db->query('SELECT DATABASE()')->fetchColumn(),
    'projected_target_distribution' => $projectedAssignments !== []
        ? gradtrack_demo_assignment_distribution($projectedAssignments)
        : [],
    'migration_validation' => [
        'legacy_graduates_remaining' => (int)$db->query(
            'SELECT COUNT(*) FROM graduates WHERE year_graduated BETWEEN 2021 AND 2025'
        )->fetchColumn(),
        'migrated_demo_graduates' => (int)$db->query(
            "SELECT COUNT(*) FROM graduates
              WHERE year_graduated BETWEEN 2016 AND 2020
                AND student_id REGEXP '^[0-9]{4}-[0-9]+$'
                AND CAST(LEFT(student_id, 4) AS UNSIGNED) = year_graduated - 4"
        )->fetchColumn(),
        'target_distribution' => $db->query(
            "SELECT year_graduated, COUNT(*) AS total
               FROM graduates
              WHERE year_graduated BETWEEN 2016 AND 2020
                AND student_id REGEXP '^[0-9]{4}-[0-9]+$'
                AND CAST(LEFT(student_id, 4) AS UNSIGNED) = year_graduated - 4
              GROUP BY year_graduated ORDER BY year_graduated"
        )->fetchAll(PDO::FETCH_ASSOC),
        'duplicate_student_numbers' => (int)$db->query(
            'SELECT COUNT(*) FROM (
                SELECT student_id FROM graduates WHERE student_id IS NOT NULL
                 GROUP BY student_id HAVING COUNT(*) > 1
             ) duplicate_student_ids'
        )->fetchColumn(),
        'seeded_registry_legacy_years' => (int)$db->query(
            "SELECT COUNT(*) FROM registered_alumni
              WHERE source_file = 'Example seed: 75 survey responders + 50 non-responders'
                AND batch_year BETWEEN 2021 AND 2025"
        )->fetchColumn(),
        'seeded_registry_target_years' => (int)$db->query(
            "SELECT COUNT(*) FROM registered_alumni
              WHERE source_file = 'Example seed: 75 survey responders + 50 non-responders'
                AND batch_year BETWEEN 2016 AND 2020"
        )->fetchColumn(),
        'foreign_key_orphans' => [
            'survey_responses' => (int)$db->query(
                'SELECT COUNT(*) FROM survey_responses sr
                  LEFT JOIN graduates g ON g.id = sr.graduate_id
                 WHERE sr.graduate_id IS NOT NULL AND g.id IS NULL'
            )->fetchColumn(),
            'graduate_accounts' => (int)$db->query(
                'SELECT COUNT(*) FROM graduate_accounts ga
                  LEFT JOIN graduates g ON g.id = ga.graduate_id
                 WHERE g.id IS NULL'
            )->fetchColumn(),
            'employment' => (int)$db->query(
                'SELECT COUNT(*) FROM employment e
                  LEFT JOIN graduates g ON g.id = e.graduate_id
                 WHERE g.id IS NULL'
            )->fetchColumn(),
            'graduate_profiles' => (int)$db->query(
                'SELECT COUNT(*) FROM graduate_profiles gp
                  LEFT JOIN graduate_accounts ga ON ga.id = gp.graduate_account_id
                 WHERE ga.id IS NULL'
            )->fetchColumn(),
            'registered_alumni' => (int)$db->query(
                'SELECT COUNT(*) FROM registered_alumni ra
                  LEFT JOIN graduate_accounts ga ON ga.id = ra.linked_user_id
                 WHERE ra.linked_user_id IS NOT NULL AND ga.id IS NULL'
            )->fetchColumn(),
        ],
    ],
    'active_survey_analytics' => [
        'survey_id' => $activeSurveyId,
        'coverage_years' => $activeCoverage['years'] ?? [],
        'summary' => $activeAnalytics['summary'] ?? [],
        'by_year' => $activeAnalytics['by_year'] ?? [],
    ],
    'seed_year_settings' => $db->query(
        "SELECT setting_key, setting_value
           FROM system_settings
          WHERE setting_key IN ('current_tracer_batch', 'default_graduation_year')
          ORDER BY setting_key"
    )->fetchAll(PDO::FETCH_ASSOC),
    'tables' => $tables,
    'year_and_identity_columns' => $yearColumns,
    'relevant_table_columns' => $tableColumns,
    'graduates_by_year_and_prefix' => $db->query(
        'SELECT year_graduated, LEFT(student_id, 4) AS student_prefix, COUNT(*) AS total,
                MIN(id) AS first_id, MAX(id) AS last_id
           FROM graduates
          GROUP BY year_graduated, LEFT(student_id, 4)
          ORDER BY year_graduated, student_prefix'
    )->fetchAll(PDO::FETCH_ASSOC),
    'graduates_by_created_date' => $db->query(
        'SELECT DATE(created_at) AS created_date, COUNT(*) AS total,
                MIN(id) AS first_id, MAX(id) AS last_id
           FROM graduates
          GROUP BY DATE(created_at)
          ORDER BY created_date'
    )->fetchAll(PDO::FETCH_ASSOC),
    'survey_responses' => $db->query(
        "SELECT COUNT(*) AS total,
                SUM(JSON_VALID(responses) AND JSON_UNQUOTE(JSON_EXTRACT(responses, '$.\"100\"')) = 'Seeded for analytics testing') AS marked_seeded,
                COUNT(DISTINCT graduate_id) AS linked_graduates,
                MIN(id) AS first_id, MAX(id) AS last_id
           FROM survey_responses"
    )->fetch(PDO::FETCH_ASSOC),
    'survey_year_mismatches' => (int) $db->query(
        "SELECT COUNT(*)
           FROM survey_responses sr
           JOIN graduates g ON g.id = sr.graduate_id
          WHERE JSON_VALID(sr.responses)
            AND JSON_UNQUOTE(JSON_EXTRACT(sr.responses, '$.\"84\"')) REGEXP '^[0-9]{4}$'
            AND CAST(JSON_UNQUOTE(JSON_EXTRACT(sr.responses, '$.\"84\"')) AS UNSIGNED) <> g.year_graduated"
    )->fetchColumn(),
    'target_cohort' => $db->query(
        "SELECT COUNT(*) AS graduates,
                COUNT(DISTINCT g.student_id) AS unique_student_ids,
                COUNT(DISTINCT sr.graduate_id) AS answered_graduates,
                COUNT(DISTINCT ga.graduate_id) AS graduate_accounts,
                COUNT(DISTINCT gp.id) AS graduate_profiles,
                COUNT(DISTINCT e.graduate_id) AS employment_rows
           FROM graduates g
           LEFT JOIN survey_responses sr ON sr.graduate_id = g.id AND sr.submitted_at IS NOT NULL
           LEFT JOIN graduate_accounts ga ON ga.graduate_id = g.id
           LEFT JOIN graduate_profiles gp ON gp.graduate_account_id = ga.id
           LEFT JOIN employment e ON e.graduate_id = g.id
          WHERE g.student_id REGEXP '^[0-9]{4}-[0-9]+$'
            AND CAST(LEFT(g.student_id, 4) AS UNSIGNED) = g.year_graduated - 4
            AND (g.year_graduated BETWEEN 2016 AND 2020 OR g.year_graduated BETWEEN 2021 AND 2025)"
    )->fetch(PDO::FETCH_ASSOC),
    'student_suffix_groups' => $db->query(
        "SELECT COUNT(*) AS distinct_suffixes,
                MAX(suffix_total) AS largest_group,
                SUM(suffix_total > 5) AS groups_too_large
           FROM (
                SELECT SUBSTRING_INDEX(student_id, '-', -1) AS suffix, COUNT(*) AS suffix_total
                  FROM graduates
                 WHERE student_id REGEXP '^[0-9]{4}-[0-9]+$'
                   AND CAST(LEFT(student_id, 4) AS UNSIGNED) = year_graduated - 4
                   AND (year_graduated BETWEEN 2016 AND 2020 OR year_graduated BETWEEN 2021 AND 2025)
                 GROUP BY SUBSTRING_INDEX(student_id, '-', -1)
           ) suffix_groups"
    )->fetch(PDO::FETCH_ASSOC),
    'profile_mismatches' => $db->query(
        "SELECT COUNT(*) AS total,
                SUM(gp.graduation_year IS NOT NULL AND gp.graduation_year <> g.year_graduated) AS year_mismatches
           FROM graduate_profiles gp
           JOIN graduate_accounts ga ON ga.id = gp.graduate_account_id
           JOIN graduates g ON g.id = ga.graduate_id"
    )->fetch(PDO::FETCH_ASSOC),
    'target_profile_mismatches' => $db->query(
        "SELECT COUNT(*) AS linked_profiles,
                SUM(gp.graduation_year IS NOT NULL AND gp.graduation_year <> g.year_graduated) AS year_mismatches
           FROM graduate_profiles gp
           JOIN graduate_accounts ga ON ga.id = gp.graduate_account_id
           JOIN graduates g ON g.id = ga.graduate_id
          WHERE g.student_id REGEXP '^[0-9]{4}-[0-9]+$'
            AND CAST(LEFT(g.student_id, 4) AS UNSIGNED) = g.year_graduated - 4
            AND (g.year_graduated BETWEEN 2016 AND 2020 OR g.year_graduated BETWEEN 2021 AND 2025)"
    )->fetch(PDO::FETCH_ASSOC),
    'registered_alumni_by_year' => $db->query(
        'SELECT batch_year, registration_status, COUNT(*) AS total
           FROM registered_alumni
          GROUP BY batch_year, registration_status
          ORDER BY batch_year, registration_status'
    )->fetchAll(PDO::FETCH_ASSOC),
    'registered_alumni_sources' => $db->query(
        'SELECT COALESCE(source_file, \'(none)\') AS source_file,
                DATE(created_at) AS created_date, COUNT(*) AS total,
                SUM(linked_user_id IS NOT NULL) AS linked
           FROM registered_alumni
          GROUP BY COALESCE(source_file, \'(none)\'), DATE(created_at)
          ORDER BY created_date, source_file'
    )->fetchAll(PDO::FETCH_ASSOC),
    'linked_registry_mismatches' => $db->query(
        "SELECT COUNT(*) AS linked_rows,
                SUM(ra.batch_year <> g.year_graduated) AS year_mismatches
           FROM registered_alumni ra
           JOIN graduate_accounts ga ON ga.id = ra.linked_user_id
           JOIN graduates g ON g.id = ga.graduate_id
          WHERE ra.linked_user_id IS NOT NULL"
    )->fetch(PDO::FETCH_ASSOC),
    'surveys' => $db->query(
        "SELECT s.id, s.title, s.status,
                COUNT(DISTINCT sr.id) AS responses,
                COUNT(DISTINCT CASE
                    WHEN g.student_id REGEXP '^[0-9]{4}-[0-9]+$'
                     AND CAST(LEFT(g.student_id, 4) AS UNSIGNED) = g.year_graduated - 4
                     AND (g.year_graduated BETWEEN 2016 AND 2020 OR g.year_graduated BETWEEN 2021 AND 2025)
                    THEN sr.graduate_id END) AS target_cohort_responses
           FROM surveys s
           LEFT JOIN survey_responses sr ON sr.survey_id = s.id AND sr.submitted_at IS NOT NULL
           LEFT JOIN graduates g ON g.id = sr.graduate_id
          GROUP BY s.id, s.title, s.status
          ORDER BY s.id"
    )->fetchAll(PDO::FETCH_ASSOC),
    'graduation_year_questions' => $db->query(
        "SELECT id, survey_id, question_key, analytics_key, question_type, options, is_active
           FROM survey_questions
          WHERE analytics_key = 'graduation_year'
          ORDER BY survey_id, id"
    )->fetchAll(PDO::FETCH_ASSOC),
    'target_normalized_year_answers' => $db->query(
        "SELECT sq.survey_id, sra.source_question_id,
                JSON_UNQUOTE(sra.answer_value) AS answer, COUNT(*) AS total
           FROM survey_response_answers sra
           JOIN survey_questions sq ON sq.id = sra.survey_question_id
           JOIN survey_responses sr ON sr.id = sra.survey_response_id
           JOIN graduates g ON g.id = sr.graduate_id
          WHERE sq.analytics_key = 'graduation_year'
            AND g.student_id REGEXP '^[0-9]{4}-[0-9]+$'
            AND CAST(LEFT(g.student_id, 4) AS UNSIGNED) = g.year_graduated - 4
            AND (g.year_graduated BETWEEN 2016 AND 2020 OR g.year_graduated BETWEEN 2021 AND 2025)
          GROUP BY sq.survey_id, sra.source_question_id, JSON_UNQUOTE(sra.answer_value)
          ORDER BY sq.survey_id, sra.source_question_id, answer"
    )->fetchAll(PDO::FETCH_ASSOC),
    'graduation_year_option_rows' => $db->query(
        "SELECT sq.survey_id, sqo.survey_question_id, sqo.option_value, sqo.label, sqo.sort_order
           FROM survey_question_options sqo
           JOIN survey_questions sq ON sq.id = sqo.survey_question_id
          WHERE sq.analytics_key = 'graduation_year'
          ORDER BY sq.survey_id, sqo.sort_order, sqo.id"
    )->fetchAll(PDO::FETCH_ASSOC),
];

echo json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;
