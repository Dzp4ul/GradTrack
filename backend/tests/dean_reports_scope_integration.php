<?php

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';
require_once __DIR__ . '/../api/config/dean_program_scope.php';
require_once __DIR__ . '/../api/config/survey_response_analytics.php';
require_once __DIR__ . '/../api/config/graduation_years.php';

$failures = 0;
$sessionIds = [];
$baseUrl = rtrim((string)(getenv('GRADTRACK_DEAN_REPORTS_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();

function dean_reports_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) {
        $failures++;
    }
}

function dean_reports_seed_session(int $adminUserId): string
{
    global $sessionIds;
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }

    ini_set('session.use_strict_mode', '0');
    $sessionId = 'gtdr' . bin2hex(random_bytes(18));
    session_id($sessionId);
    session_start();
    $_SESSION = [
        'admin_user_id' => $adminUserId,
        'authenticated_at' => time(),
    ];
    session_write_close();
    $sessionIds[] = $sessionId;
    return $sessionId;
}

function dean_reports_request(string $path, ?string $sessionId = null): array
{
    global $baseUrl, $cookieName;
    $headers = ['Accept: application/json', 'Origin: http://localhost:5173'];
    if ($sessionId !== null) {
        $headers[] = 'Cookie: ' . $cookieName . '=' . rawurlencode($sessionId);
    }

    $context = stream_context_create(['http' => [
        'method' => 'GET',
        'header' => implode("\r\n", $headers),
        'ignore_errors' => true,
        'timeout' => 60,
    ]]);
    $body = @file_get_contents($baseUrl . $path, false, $context);
    $responseHeaders = $http_response_header ?? [];
    $status = 0;
    foreach ($responseHeaders as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $matches) === 1) {
            $status = (int)$matches[1];
            break;
        }
    }

    return [
        'status' => $status,
        'json' => is_string($body) ? json_decode($body, true) : null,
        'body' => is_string($body) ? $body : '',
    ];
}

function dean_reports_admin_for_role(PDO $db, string $role): ?array
{
    $stmt = $db->prepare(
        'SELECT id, role FROM admin_users
         WHERE role = :role AND COALESCE(is_active, 1) = 1
         ORDER BY id ASC LIMIT 1'
    );
    $stmt->execute([':role' => $role]);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

function dean_reports_cleanup(): void
{
    global $sessionIds;
    foreach ($sessionIds as $sessionId) {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }
        ini_set('session.use_strict_mode', '0');
        session_id($sessionId);
        session_start();
        $_SESSION = [];
        session_destroy();
    }
}

register_shutdown_function('dean_reports_cleanup');

$db = (new Database())->getConnection();
$csDean = dean_reports_admin_for_role($db, 'dean_cs');
$coedDean = dean_reports_admin_for_role($db, 'dean_coed');
$researchAdmin = dean_reports_admin_for_role($db, 'admin');

dean_reports_assert($csDean !== null, 'a CCS Dean fixture account is available');
dean_reports_assert($coedDean !== null, 'a COED Dean fixture account is available');
dean_reports_assert($researchAdmin !== null, 'an existing unrestricted report administrator is available');

if ($csDean === null || $coedDean === null || $researchAdmin === null) {
    exit(1);
}

$anonymous = dean_reports_request('/reports/index.php?type=report_context');
dean_reports_assert($anonymous['status'] === 401, 'anonymous users cannot access report context');
$emptySummary = gradtrack_analytics_summarize_records([]);
dean_reports_assert(
    $emptySummary['employment_rate'] === null && $emptySummary['alignment_rate'] === null,
    'zero-data calculations return null rates instead of NaN or division-by-zero values'
);

$csSession = dean_reports_seed_session((int)$csDean['id']);
$contextResponse = dean_reports_request('/reports/index.php?type=report_context', $csSession);
$contextData = $contextResponse['json']['data'] ?? [];
$scopeCodes = $contextData['scope']['program_codes'] ?? [];
dean_reports_assert($contextResponse['status'] === 200, 'CCS Dean can open Reports & Analytics');
dean_reports_assert($scopeCodes === ['BSCS', 'ACT'], 'CCS Dean context is server-scoped to BSCS and ACT');

$surveys = is_array($contextData['surveys'] ?? null) ? $contextData['surveys'] : [];
$selectedSurvey = null;
foreach ($surveys as $survey) {
    if (($survey['status'] ?? '') === 'active' && empty($survey['archived_at'])) {
        $selectedSurvey = $survey;
        break;
    }
}
$selectedSurvey = $selectedSurvey ?? ($surveys[0] ?? null);
$surveyId = isset($selectedSurvey['id']) ? (int)$selectedSurvey['id'] : 0;
dean_reports_assert($surveyId > 0, 'report context provides a selectable tracer survey');

if ($surveyId > 0) {
    $coverage = gradtrack_get_survey_graduation_year_coverage($db, $surveyId);
    $expectedOptions = ['program_codes' => ['BSCS', 'ACT']];
    if ($coverage['configured']) {
        $expectedOptions['allowed_graduation_years'] = $coverage['years'];
    }
    $expectedAnalytics = gradtrack_analytics_calculate($db, $surveyId, $expectedOptions);
    $expectedSummary = $expectedAnalytics['summary'];
    $expectedResponseCount = (int)$expectedSummary['response_count'];

    $dashboardResponse = dean_reports_request(
        '/dashboard/stats.php?' . http_build_query(['survey_id' => $surveyId]),
        $csSession
    );
    $dashboard = $dashboardResponse['json']['data'] ?? [];
    $dashboardProgramCodes = array_values(array_unique(array_map(
        static fn (array $row): string => strtoupper((string)($row['code'] ?? '')),
        is_array($dashboard['program_stats'] ?? null) ? $dashboard['program_stats'] : []
    )));
    dean_reports_assert($dashboardResponse['status'] === 200, 'CCS Dean can open the department dashboard');
    dean_reports_assert(
        ($dashboard['scope']['program_codes'] ?? []) === ['BSCS', 'ACT']
        && array_diff($dashboardProgramCodes, ['BSCS', 'ACT']) === [],
        'dashboard scope and program cards contain only the authenticated Dean programs'
    );
    dean_reports_assert(
        (int)($dashboard['total_responses'] ?? -1) === $expectedResponseCount
        && (int)($dashboard['total_employed'] ?? -1) === (int)$expectedSummary['employed']
        && ($dashboard['employment_rate'] ?? null) == $expectedSummary['employment_rate']
        && ($dashboard['alignment_rate'] ?? null) == $expectedSummary['alignment_rate'],
        'dashboard response, employment, and alignment metrics match canonical scoped analytics'
    );

    $dashboardDepartmentAttack = dean_reports_request(
        '/dashboard/stats.php?' . http_build_query([
            'survey_id' => $surveyId,
            'department' => 'BSED',
        ]),
        $csSession
    );
    dean_reports_assert(
        $dashboardDepartmentAttack['status'] === 403,
        'dashboard rejects a manipulated foreign department parameter'
    );

    $overviewResponse = dean_reports_request(
        '/reports/index.php?' . http_build_query(['type' => 'overview', 'survey_id' => $surveyId]),
        $csSession
    );
    $overview = $overviewResponse['json']['data'] ?? [];
    dean_reports_assert(
        (int)($overview['total_graduates'] ?? -1) === $expectedResponseCount
        && (int)($overview['total_employed'] ?? -1) === (int)$expectedSummary['employed']
        && ($overview['employment_rate'] ?? null) == $expectedSummary['employment_rate'],
        'overview counts and employment rate match the canonical scoped calculation'
    );

    $programResponse = dean_reports_request(
        '/reports/index.php?' . http_build_query(['type' => 'by_program', 'survey_id' => $surveyId]),
        $csSession
    );
    $programRows = $programResponse['json']['data'] ?? [];
    $returnedCodes = array_values(array_unique(array_map(
        static fn (array $row): string => strtoupper((string)($row['code'] ?? '')),
        is_array($programRows) ? $programRows : []
    )));
    dean_reports_assert($programResponse['status'] === 200, 'CCS Dean can load program report data');
    dean_reports_assert(
        array_diff($returnedCodes, ['BSCS', 'ACT']) === [],
        'By Program never returns a program outside the authenticated Dean scope'
    );

    $batchTrendResponse = dean_reports_request(
        '/reports/index.php?' . http_build_query(['type' => 'by_batch_trends', 'survey_id' => $surveyId]),
        $csSession
    );
    $batchTrendRows = is_array($batchTrendResponse['json']['data'] ?? null)
        ? $batchTrendResponse['json']['data']
        : [];
    $batchTrendYears = array_map(
        static fn (array $row): int => (int)($row['year_graduated'] ?? 0),
        $batchTrendRows
    );
    $sortedBatchTrendYears = $batchTrendYears;
    sort($sortedBatchTrendYears, SORT_NUMERIC);
    dean_reports_assert(
        $batchTrendResponse['status'] === 200
        && !empty($batchTrendResponse['json']['success'])
        && $batchTrendYears === $sortedBatchTrendYears,
        'Dean batch trend analytics load in chronological order'
    );

    $expectedBatchOptions = $expectedOptions;
    $expectedBatchOptions['include_empty_years'] = true;
    $expectedBatchRows = gradtrack_analytics_calculate($db, $surveyId, $expectedBatchOptions)['by_year'];
    $expectedBatchByYear = [];
    foreach ($expectedBatchRows as $row) {
        $expectedBatchByYear[(int)($row['year'] ?? 0)] = $row;
    }
    $batchTrendValuesMatch = count($batchTrendRows) === count($expectedBatchRows);
    foreach ($batchTrendRows as $row) {
        $year = (int)($row['year_graduated'] ?? 0);
        $expected = $expectedBatchByYear[$year] ?? null;
        $graduates = (int)($expected['active_graduate_count'] ?? 0);
        $responses = (int)($expected['response_count'] ?? 0);
        $expectedRetrievalRate = $graduates > 0
            ? gradtrack_survey_percentage($responses, $graduates, 1)
            : null;
        $actualRetrievalRate = $row['retrieval_rate'] ?? null;
        $retrievalRateMatches = $expectedRetrievalRate === null
            ? $actualRetrievalRate === null
            : is_numeric($actualRetrievalRate)
                && abs((float)$actualRetrievalRate - $expectedRetrievalRate) < 0.0001;
        if (
            $expected === null
            || (int)($row['total_graduates'] ?? -1) !== $graduates
            || (int)($row['survey_responses'] ?? -1) !== $responses
            || !$retrievalRateMatches
            || (int)($row['employed'] ?? -1) !== (int)$expected['employed']
            || (int)($row['unemployed'] ?? -1) !== (int)$expected['unemployed']
            || (int)($row['aligned'] ?? -1) !== (int)$expected['aligned']
            || (int)($row['partially_aligned'] ?? -1) !== (int)$expected['partially_aligned']
            || (int)($row['not_aligned'] ?? -1) !== (int)$expected['explicit_not_aligned']
            || (int)($row['aligned'] ?? 0)
                + (int)($row['partially_aligned'] ?? 0)
                + (int)($row['not_aligned'] ?? 0)
                !== (int)($row['alignment_total'] ?? -1)
        ) {
            $batchTrendValuesMatch = false;
            break;
        }
    }
    dean_reports_assert(
        $batchTrendValuesMatch,
        'batch employment, alignment, graduate totals, responses, and retrieval rates match canonical scoped data'
    );

    $departmentAttack = dean_reports_request(
        '/reports/index.php?' . http_build_query([
            'type' => 'overview',
            'survey_id' => $surveyId,
            'department' => 'BSED',
        ]),
        $csSession
    );
    dean_reports_assert($departmentAttack['status'] === 403, 'manipulated department parameters are rejected');

    $batchTrendDepartmentAttack = dean_reports_request(
        '/reports/index.php?' . http_build_query([
            'type' => 'by_batch_trends',
            'survey_id' => $surveyId,
            'department' => 'BSED',
        ]),
        $csSession
    );
    dean_reports_assert(
        $batchTrendDepartmentAttack['status'] === 403,
        'batch trend analytics reject a foreign department parameter'
    );

    $exportAttack = dean_reports_request(
        '/reports/index.php?' . http_build_query([
            'type' => 'overview',
            'survey_id' => $surveyId,
            'department' => 'BSED',
            'audit_action' => 'export_pdf',
        ]),
        $csSession
    );
    dean_reports_assert($exportAttack['status'] === 403, 'export requests cannot bypass the Dean program scope');

    $csvExportAttack = dean_reports_request(
        '/reports/export.php?' . http_build_query([
            'type' => 'overview',
            'format' => 'csv',
            'survey_id' => $surveyId,
            'department' => 'BSED',
        ]),
        $csSession
    );
    dean_reports_assert($csvExportAttack['status'] === 403, 'the backend export endpoint also rejects a foreign department');

    $scopedCsvExport = dean_reports_request(
        '/reports/export.php?' . http_build_query([
            'type' => 'by_program',
            'format' => 'csv',
            'survey_id' => $surveyId,
        ]),
        $csSession
    );
    dean_reports_assert(
        $scopedCsvExport['status'] === 200
        && stripos($scopedCsvExport['body'], 'BSED') === false
        && stripos($scopedCsvExport['body'], 'BEED') === false
        && stripos($scopedCsvExport['body'], 'BSHM') === false,
        'exported report data contains only programs inside the Dean scope'
    );

    $foreignProgramStmt = $db->prepare("SELECT id FROM programs WHERE code = 'BSED' LIMIT 1");
    $foreignProgramStmt->execute();
    $foreignProgramId = (int)($foreignProgramStmt->fetchColumn() ?: 0);
    if ($foreignProgramId > 0) {
        $programAttack = dean_reports_request(
            '/reports/index.php?' . http_build_query([
                'type' => 'overview',
                'survey_id' => $surveyId,
                'programId' => $foreignProgramId,
            ]),
            $csSession
        );
        dean_reports_assert($programAttack['status'] === 403, 'manipulated program IDs are rejected');

        $dashboardProgramAttack = dean_reports_request(
            '/dashboard/stats.php?' . http_build_query([
                'survey_id' => $surveyId,
                'programId' => $foreignProgramId,
            ]),
            $csSession
        );
        dean_reports_assert(
            $dashboardProgramAttack['status'] === 403,
            'dashboard rejects a manipulated foreign program ID'
        );
    }

    $analyticsResponse = dean_reports_request(
        '/surveys/analytics.php?' . http_build_query([
            'survey_id' => $surveyId,
            'program' => 'BSED,BEED',
        ]),
        $csSession
    );
    $analytics = $analyticsResponse['json']['data'] ?? [];
    dean_reports_assert($analyticsResponse['status'] === 200, 'CCS Dean can load Survey Analytics');
    dean_reports_assert(
        ($analytics['selected_programs'] ?? []) === ['BSCS', 'ACT'],
        'Survey Analytics ignores a manipulated foreign program filter and enforces the account scope'
    );
    dean_reports_assert(
        (int)($analytics['total_responses'] ?? -1) === $expectedResponseCount,
        'Survey Analytics N equals only valid responses inside the authenticated Dean scope'
    );
    $serializedTables = json_encode($analytics['report_tables'] ?? []);
    dean_reports_assert(
        is_string($serializedTables)
        && stripos($serializedTables, 'BSED') === false
        && stripos($serializedTables, 'BEED') === false
        && stripos($serializedTables, 'BSHM') === false,
        'Survey Analytics tables do not expose foreign program labels or columns'
    );

    $yearOptions = $contextData['filter_options']['years'] ?? [];
    if (is_array($yearOptions) && $yearOptions !== []) {
        $selectedYear = (string)$yearOptions[0];
        foreach (['by_program', 'by_year', 'by_batch_trends', 'employment_status', 'salary_distribution'] as $reportType) {
            $batchReport = dean_reports_request(
                '/reports/index.php?' . http_build_query([
                    'type' => $reportType,
                    'survey_id' => $surveyId,
                    'year' => $selectedYear,
                    'graduationYear' => $selectedYear,
                ]),
                $csSession
            );
            dean_reports_assert(
                $batchReport['status'] === 200 && !empty($batchReport['json']['success']),
                "{$reportType} accepts and applies the shared Dean batch filter"
            );
            if ($reportType === 'by_year' || $reportType === 'by_batch_trends') {
                $returnedYears = array_values(array_unique(array_map(
                    static fn (array $row): string => (string)($row['year_graduated'] ?? ''),
                    $batchReport['json']['data'] ?? []
                )));
                dean_reports_assert(
                    array_diff($returnedYears, [$selectedYear]) === [],
                    $reportType . ' does not mix another batch into the selected batch result'
                );
            }
        }

        $yearAnalyticsResponse = dean_reports_request(
            '/surveys/analytics.php?' . http_build_query([
                'survey_id' => $surveyId,
                'graduation_year' => $selectedYear,
                'program' => 'BSED',
            ]),
            $csSession
        );
        $yearAnalytics = $yearAnalyticsResponse['json']['data'] ?? [];
        $expectedYearOptions = $expectedOptions;
        $expectedYearOptions['graduation_year'] = (int)$selectedYear;
        $expectedYearResponseCount = count(
            gradtrack_analytics_fetch_valid_responses($db, $surveyId, $expectedYearOptions)
        );
        dean_reports_assert($yearAnalyticsResponse['status'] === 200, 'Dean Survey Analytics accepts an authorized batch');
        dean_reports_assert(
            (string)($yearAnalytics['selected_graduation_year'] ?? '') === $selectedYear,
            'Survey Analytics reports the same selected batch used by the page'
        );
        dean_reports_assert(
            (int)($yearAnalytics['total_responses'] ?? -1) === $expectedYearResponseCount,
            'Survey Analytics N also respects the selected batch'
        );

        $zeroResponseYear = null;
        foreach ($yearOptions as $candidateYear) {
            $candidateOptions = $expectedOptions;
            $candidateOptions['graduation_year'] = (int)$candidateYear;
            if (gradtrack_analytics_fetch_valid_responses($db, $surveyId, $candidateOptions) === []) {
                $zeroResponseYear = (string)$candidateYear;
                break;
            }
        }
        if ($zeroResponseYear !== null) {
            $emptyOverview = dean_reports_request(
                '/reports/index.php?' . http_build_query([
                    'type' => 'overview',
                    'survey_id' => $surveyId,
                    'graduationYear' => $zeroResponseYear,
                ]),
                $csSession
            );
            $emptyData = $emptyOverview['json']['data'] ?? [];
            dean_reports_assert(
                $emptyOverview['status'] === 200
                && (int)($emptyData['total_graduates'] ?? -1) === 0
                && ($emptyData['employment_rate'] ?? null) === null
                && ($emptyData['alignment_rate'] ?? null) === null,
                'a zero-response batch returns a safe empty report without invalid percentages'
            );

            $emptyBatchTrend = dean_reports_request(
                '/reports/index.php?' . http_build_query([
                    'type' => 'by_batch_trends',
                    'survey_id' => $surveyId,
                    'graduationYear' => $zeroResponseYear,
                ]),
                $csSession
            );
            $emptyBatchTrendRow = $emptyBatchTrend['json']['data'][0] ?? [];
            dean_reports_assert(
                $emptyBatchTrend['status'] === 200
                && (int)($emptyBatchTrendRow['total_graduates'] ?? 0) > 0
                && (int)($emptyBatchTrendRow['survey_responses'] ?? -1) === 0
                && (float)($emptyBatchTrendRow['retrieval_rate'] ?? -1) === 0.0,
                'a graduate batch with no responses returns a safe 0% retrieval rate'
            );
        }
    }
}

$coedSession = dean_reports_seed_session((int)$coedDean['id']);
$coedContext = dean_reports_request('/reports/index.php?type=report_context', $coedSession);
dean_reports_assert(
    ($coedContext['json']['data']['scope']['program_codes'] ?? []) === ['BSED', 'BEED'],
    'a different Dean account automatically receives its own department programs'
);
if ($surveyId > 0) {
    $coedDashboard = dean_reports_request('/dashboard/stats.php?survey_id=' . $surveyId, $coedSession);
    dean_reports_assert(
        ($coedDashboard['json']['data']['scope']['program_codes'] ?? []) === ['BSED', 'BEED'],
        'a different Dean dashboard automatically receives its own department programs'
    );
}

$adminSession = dean_reports_seed_session((int)$researchAdmin['id']);
$adminContext = dean_reports_request('/reports/index.php?type=report_context', $adminSession);
dean_reports_assert(
    ($adminContext['json']['data']['scope']['restricted'] ?? true) === false,
    'the existing administrator report context remains unrestricted'
);
if ($surveyId > 0) {
    $adminDashboard = dean_reports_request('/dashboard/stats.php?survey_id=' . $surveyId, $adminSession);
    dean_reports_assert(
        $adminDashboard['status'] === 200
        && ($adminDashboard['json']['data']['scope']['restricted'] ?? true) === false,
        'the existing administrator dashboard remains unrestricted and functional'
    );
}
if ($surveyId > 0) {
    $adminDepartmentRequest = dean_reports_request(
        '/reports/index.php?' . http_build_query([
            'type' => 'overview',
            'survey_id' => $surveyId,
            'department' => 'BSED',
        ]),
        $adminSession
    );
    dean_reports_assert(
        $adminDepartmentRequest['status'] === 200,
        'Dean authorization does not restrict the existing administrator department filters'
    );
}

dean_reports_cleanup();
$sessionIds = [];

if ($failures > 0) {
    echo PHP_EOL . "{$failures} Dean report scope integration test(s) failed." . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All Dean report scope integration tests passed.' . PHP_EOL;
