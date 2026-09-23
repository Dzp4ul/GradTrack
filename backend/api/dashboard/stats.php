<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/survey_response_analytics.php';
require_once __DIR__ . '/../config/archive.php';
require_once __DIR__ . '/../config/admin_auth.php';
require_once __DIR__ . '/../config/dean_program_scope.php';
require_once __DIR__ . '/../config/graduation_years.php';

$database = new Database();
$db = $database->getConnection();
$dashboardUser = gradtrack_require_admin_auth(
    $db,
    array_merge(['admin', 'mis_staff', 'research_coordinator'], gradtrack_dean_roles()),
    'Your role cannot access administrative dashboard statistics'
);
$deanScope = gradtrack_dean_program_scope($db, $dashboardUser);
gradtrack_ensure_archive_schema($db, 'graduates');
gradtrack_ensure_archive_schema($db, 'surveys', true);

if ($deanScope !== null) {
    $allowedScopeValues = array_merge(
        $deanScope['program_codes'],
        [(string)$deanScope['department_code']]
    );
    foreach (['department', 'department_code', 'program', 'program_code'] as $scopeParameter) {
        if (!array_key_exists($scopeParameter, $_GET)) {
            continue;
        }
        $requestedValues = is_array($_GET[$scopeParameter])
            ? $_GET[$scopeParameter]
            : preg_split('/\s*,\s*/', (string)$_GET[$scopeParameter]);
        $requestedValues = array_values(array_filter(array_map(
            static fn ($value): string => strtoupper(trim((string)$value)),
            $requestedValues ?: []
        )));
        if (array_diff($requestedValues, $allowedScopeValues) !== []) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'Unauthorized department filter',
            ]);
            exit;
        }
    }

    foreach (['program_id', 'programId'] as $programIdParameter) {
        if (!array_key_exists($programIdParameter, $_GET)) {
            continue;
        }
        $requestedProgramIds = is_array($_GET[$programIdParameter])
            ? $_GET[$programIdParameter]
            : preg_split('/\s*,\s*/', (string)$_GET[$programIdParameter]);
        $requestedProgramIds = array_values(array_filter(array_map('intval', $requestedProgramIds ?: [])));
        if (array_diff($requestedProgramIds, $deanScope['program_ids']) !== []) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'Unauthorized program filter',
            ]);
            exit;
        }
    }
}

function getSelectedSurveyId(PDO $db): ?int
{
    if (array_key_exists('survey_id', $_GET)) {
        $surveyId = is_scalar($_GET['survey_id']) ? (int)$_GET['survey_id'] : 0;
        if ($surveyId <= 0) {
            return null;
        }

        $stmt = $db->prepare('SELECT id FROM surveys WHERE id = :id LIMIT 1');
        $stmt->bindValue(':id', $surveyId, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchColumn() !== false ? $surveyId : null;
    }

    $stmt = $db->query("
        SELECT id
        FROM surveys
        WHERE status = 'active' AND archived_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1
    ");
    $surveyId = $stmt->fetchColumn();
    return $surveyId !== false ? (int)$surveyId : null;
}

function getSurveyTitle(PDO $db, ?int $surveyId): string
{
    if ($surveyId === null) {
        return '';
    }

    $stmt = $db->prepare('SELECT title FROM surveys WHERE id = :survey_id LIMIT 1');
    $stmt->bindValue(':survey_id', $surveyId, PDO::PARAM_INT);
    $stmt->execute();
    return (string)($stmt->fetchColumn() ?: '');
}

function getTotalEligibleGraduates(PDO $db, ?array $allowedYears = null, ?array $programCodes = null): int
{
    $where = [gradtrack_analytics_active_graduate_condition('g')];
    $params = [];
    if (is_array($allowedYears)) {
        gradtrack_append_graduation_year_coverage_filter(
            $where,
            $params,
            'g.year_graduated',
            $allowedYears,
            'dashboard_coverage_year'
        );
    }

    $normalizedProgramCodes = gradtrack_analytics_normalize_program_codes($programCodes);
    if ($normalizedProgramCodes !== []) {
        $placeholders = [];
        foreach ($normalizedProgramCodes as $index => $programCode) {
            $placeholder = ':dashboard_program_' . $index;
            $placeholders[] = $placeholder;
            $params[$placeholder] = $programCode;
        }
        $where[] = 'p.code IN (' . implode(', ', $placeholders) . ')';
    }

    $stmt = $db->prepare(
        'SELECT COUNT(*) FROM graduates g LEFT JOIN programs p ON p.id = g.program_id WHERE '
        . implode(' AND ', $where)
    );
    $stmt->execute($params);
    return (int)$stmt->fetchColumn();
}

function getAverageTimeToEmployment(PDO $db, ?array $programCodes = null): ?float
{
    $where = [
        gradtrack_analytics_active_graduate_condition('g'),
        "e.employment_status IN ('employed', 'self_employed', 'freelance')",
        'e.time_to_employment > 0',
    ];
    $params = [];
    $normalizedProgramCodes = gradtrack_analytics_normalize_program_codes($programCodes);
    if ($normalizedProgramCodes !== []) {
        $placeholders = [];
        foreach ($normalizedProgramCodes as $index => $programCode) {
            $placeholder = ':dashboard_average_program_' . $index;
            $placeholders[] = $placeholder;
            $params[$placeholder] = $programCode;
        }
        $where[] = 'p.code IN (' . implode(', ', $placeholders) . ')';
    }

    $stmt = $db->prepare("
        SELECT AVG(e.time_to_employment)
        FROM employment e
        INNER JOIN graduates g ON g.id = e.graduate_id
        LEFT JOIN programs p ON p.id = g.program_id
        WHERE " . implode(' AND ', $where) . "
    ");
    $stmt->execute($params);
    $value = $stmt->fetchColumn();
    return $value !== false && $value !== null ? round((float)$value, 1) : null;
}

function dashboardProgramStats(array $programs): array
{
    return array_map(static function (array $stats): array {
        return [
            'program_id' => $stats['program_id'],
            'code' => $stats['code'],
            'name' => $stats['name'],
            'active_graduate_count' => (int)$stats['active_graduate_count'],
            'total_graduates' => (int)$stats['response_count'],
            'response_count' => (int)$stats['response_count'],
            'employed_count' => (int)$stats['employed'],
            'unemployed_count' => (int)$stats['unemployed'],
            'employment_total' => (int)$stats['employment_total'],
            'aligned_count' => (int)$stats['aligned'],
            'not_aligned_count' => (int)$stats['not_aligned'],
            'partially_aligned_count' => (int)$stats['partially_aligned'],
            'alignment_total' => (int)$stats['alignment_total'],
            // Employability Index has historically meant the survey employment rate.
            'employability_index' => $stats['employment_rate'],
            'alignment_index' => $stats['alignment_rate'],
            'alignment_distribution' => $stats['distribution'],
        ];
    }, $programs);
}

function dashboardMetricPrograms(array $programs, string $metric): array
{
    return array_map(static function (array $stats) use ($metric): array {
        $employment = $metric === 'employment';
        return [
            'program_id' => $stats['program_id'],
            'code' => $stats['code'],
            'name' => $stats['name'],
            'rate' => $employment ? $stats['employment_rate'] : $stats['alignment_rate'],
            'count' => (int)($employment ? $stats['employed'] : $stats['aligned']),
            'total' => (int)($employment ? $stats['employment_total'] : $stats['alignment_total']),
            'distribution' => $employment ? [] : $stats['distribution'],
        ];
    }, $programs);
}

function dashboardMetricYears(array $years, string $metric): array
{
    return array_map(static function (array $stats) use ($metric): array {
        $employment = $metric === 'employment';
        return [
            'year' => (int)$stats['year'],
            'rate' => $employment ? $stats['employment_rate'] : $stats['alignment_rate'],
            'count' => (int)($employment ? $stats['employed'] : $stats['aligned']),
            'total' => (int)($employment ? $stats['employment_total'] : $stats['alignment_total']),
        ];
    }, $years);
}

try {
    $allowedProgramCodes = $deanScope['program_codes'] ?? null;
    $selectedSurveyId = getSelectedSurveyId($db);
    $allowedYears = null;
    if ($selectedSurveyId !== null) {
        $coverage = gradtrack_get_survey_graduation_year_coverage($db, $selectedSurveyId);
        if ($coverage['configured']) {
            $allowedYears = $coverage['years'];
        } elseif (($coverage['survey']['status'] ?? '') === 'active' && empty($coverage['survey']['archived_at'])) {
            http_response_code(422);
            echo json_encode([
                'success' => false,
                'code' => 'GRADUATION_YEAR_COVERAGE_NOT_CONFIGURED',
                'error' => 'Graduation year coverage has not been configured for the active survey.',
            ]);
            exit;
        }
    }
    $totalEligibleGraduates = getTotalEligibleGraduates($db, $allowedYears, $allowedProgramCodes);
    $activeSurveys = (int)$db->query(
        "SELECT COUNT(*) FROM surveys WHERE status = 'active' AND archived_at IS NULL"
    )->fetchColumn();

    $analyticsOptions = [
            'include_empty_programs' => true,
            'include_empty_years' => true,
        ];
    if (is_array($allowedYears)) {
        $analyticsOptions['allowed_graduation_years'] = $allowedYears;
    }
    if (is_array($allowedProgramCodes)) {
        $analyticsOptions['program_codes'] = $allowedProgramCodes;
    }
    $analytics = $selectedSurveyId !== null
        ? gradtrack_analytics_calculate($db, $selectedSurveyId, $analyticsOptions)
        : [
            'summary' => array_merge(gradtrack_analytics_empty_bucket(), [
                'distribution' => gradtrack_analytics_distribution(gradtrack_analytics_empty_bucket()),
            ]),
            'by_program' => [],
            'by_year' => [],
        ];

    $summary = $analytics['summary'];
    $programStats = dashboardProgramStats($analytics['by_program']);
    $atRiskPrograms = array_values(array_map(
        static function (array $program): string {
            return (string)$program['code'];
        },
        array_filter($programStats, static function (array $program): bool {
            return $program['employability_index'] !== null
                && (float)$program['employability_index'] < 70;
        })
    ));

    $trends = array_map(static function (array $year): array {
        return [
            'year' => (int)$year['year'],
            'employment_rate' => $year['employment_rate'],
            'alignment_rate' => $year['alignment_rate'],
            'employed' => (int)$year['employed'],
            'employment_total' => (int)$year['employment_total'],
            'aligned' => (int)$year['aligned'],
            'not_aligned' => (int)$year['not_aligned'],
            'alignment_total' => (int)$year['alignment_total'],
            'response_count' => (int)$year['response_count'],
            'active_graduate_count' => (int)$year['active_graduate_count'],
        ];
    }, $analytics['by_year']);

    $totalResponses = (int)$summary['response_count'];
    $pendingResponses = max($totalEligibleGraduates - $totalResponses, 0);
    $surveyCompletionRate = $totalEligibleGraduates > 0
        ? gradtrack_survey_percentage($totalResponses, $totalEligibleGraduates, 1)
        : null;

    $actions = [];
    foreach ($atRiskPrograms as $programCode) {
        $actions[] = "Review {$programCode} outcomes with program faculty";
    }
    if ($pendingResponses > 0 && ($surveyCompletionRate === null || $surveyCompletionRate < 85)) {
        $actions[] = "Send reminders to {$pendingResponses} graduates without survey responses";
    }
    if ($summary['employment_rate'] !== null && $summary['employment_rate'] < 75) {
        $actions[] = 'Enhance Career Placement Programs';
    }
    if ($summary['alignment_rate'] !== null && $summary['alignment_rate'] < 70) {
        $actions[] = 'Review course-to-career alignment with industry partners';
    }
    if ($actions === []) {
        $actions[] = 'Maintain monthly outcome review';
    }

    $employmentPrograms = dashboardMetricPrograms($analytics['by_program'], 'employment');
    $alignmentPrograms = dashboardMetricPrograms($analytics['by_program'], 'alignment');
    $employmentYears = dashboardMetricYears($analytics['by_year'], 'employment');
    $alignmentYears = dashboardMetricYears($analytics['by_year'], 'alignment');

    echo json_encode([
        'success' => true,
        'data' => [
            // Existing fields are retained for backward compatibility.
            'total_graduates' => $totalResponses,
            'total_employed' => (int)$summary['employed'],
            'total_unemployed' => (int)$summary['unemployed'],
            'total_employment_known' => (int)$summary['employment_total'],
            'total_employment_unknown' => (int)$summary['employment_unknown'],
            'total_aligned' => (int)$summary['aligned'],
            'total_not_aligned' => (int)$summary['not_aligned'],
            'total_alignment_known' => (int)$summary['alignment_total'],
            'employment_rate' => $summary['employment_rate'],
            'alignment_rate' => $summary['alignment_rate'],
            'avg_time_to_employment' => getAverageTimeToEmployment($db, $allowedProgramCodes),
            'selected_survey_id' => $selectedSurveyId,
            'at_risk_programs' => $atRiskPrograms,
            'program_stats' => $programStats,
            'employment_trends' => $trends,
            'alignment_distribution' => $summary['distribution'],
            'employment' => [
                'rate' => $summary['employment_rate'],
                'employed' => (int)$summary['employed'],
                'total' => (int)$summary['employment_total'],
                'by_program' => $employmentPrograms,
                'by_year' => $employmentYears,
            ],
            'alignment' => [
                'rate' => $summary['alignment_rate'],
                'aligned' => (int)$summary['aligned'],
                'not_aligned' => (int)$summary['not_aligned'],
                'total' => (int)$summary['alignment_total'],
                'distribution' => $summary['distribution'],
                'by_program' => $alignmentPrograms,
                'by_year' => $alignmentYears,
            ],
            'field_availability' => $analytics['field_availability'] ?? [],
            'unavailable_reasons' => $analytics['unavailable_reasons'] ?? [],
            'top_jobs' => [],
            'recommended_actions' => array_slice($actions, 0, 5),
            'total_responses' => $totalResponses,
            'active_surveys' => $activeSurveys,
            'selected_survey_title' => getSurveyTitle($db, $selectedSurveyId),
            'total_eligible_graduates' => $totalEligibleGraduates,
            'pending_responses' => $pendingResponses,
            'survey_completion_rate' => $surveyCompletionRate,
            'scope' => $deanScope ?? [
                'restricted' => false,
                'display_name' => 'Norzagaray College',
                'program_codes' => null,
                'programs' => [],
            ],
        ],
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => gradtrack_public_exception_message(
            $e,
            'Unable to load dashboard statistics right now.',
            'Dashboard statistics API'
        ),
    ]);
}
