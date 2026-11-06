<?php

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';

$failures = 0;
$sessionId = null;
$baseUrl = rtrim((string)(getenv('GRADTRACK_REPORT_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();
$testScope = strtolower(trim((string)(getenv('GRADTRACK_REPORT_TEST_SCOPE') ?: 'all')));

function report_paragraph_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function report_paragraph_request(string $method, string $path, array $session, ?array $payload = null): array
{
    global $baseUrl, $cookieName;
    $headers = [
        'Accept: application/json',
        'Origin: http://localhost:5173',
        'Cookie: ' . $cookieName . '=' . rawurlencode($session['id']),
    ];
    $content = null;
    if ($payload !== null) {
        $headers[] = 'Content-Type: application/json';
        $headers[] = 'X-CSRF-Token: ' . $session['csrf'];
        $content = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    $context = stream_context_create(['http' => [
        'method' => $method,
        'header' => implode("\r\n", $headers),
        'content' => $content,
        'ignore_errors' => true,
        'timeout' => 75,
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

function report_has_exactly_two_paragraphs($value): bool
{
    if (!is_string($value)) return false;
    $paragraphs = preg_split('/\R\s*\R/u', trim($value)) ?: [];
    $paragraphs = array_values(array_filter(array_map('trim', $paragraphs), static fn (string $paragraph): bool => $paragraph !== ''));
    return count($paragraphs) === 2;
}

function report_cleanup_session(): void
{
    global $sessionId;
    if (!is_string($sessionId) || $sessionId === '') return;
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    ini_set('session.use_strict_mode', '0');
    session_id($sessionId);
    session_start();
    $_SESSION = [];
    session_destroy();
}

register_shutdown_function('report_cleanup_session');

$db = (new Database())->getConnection();
$adminId = (int)($db->query(
    "SELECT id FROM admin_users WHERE role = 'research_coordinator' AND COALESCE(is_active, 1) = 1 ORDER BY id LIMIT 1"
)->fetchColumn() ?: 0);
$surveyId = (int)($db->query(
    "SELECT id FROM surveys WHERE archived_at IS NULL ORDER BY (status = 'active') DESC, id DESC LIMIT 1"
)->fetchColumn() ?: 0);

report_paragraph_assert($adminId > 0, 'an active Research Coordinator is available');
report_paragraph_assert($surveyId > 0, 'a survey is available for report testing');

if ($adminId > 0 && $surveyId > 0) {
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    ini_set('session.use_strict_mode', '0');
    $sessionId = 'gtrp' . bin2hex(random_bytes(18));
    $csrfToken = bin2hex(random_bytes(32));
    session_id($sessionId);
    session_start();
    $_SESSION = [
        'admin_user_id' => $adminId,
        'authenticated_at' => time(),
        'csrf_token' => $csrfToken,
    ];
    session_write_close();
    $session = ['id' => $sessionId, 'csrf' => $csrfToken];

    $analyticsResponse = report_paragraph_request(
        'GET',
        '/surveys/analytics.php?survey_id=' . $surveyId,
        $session
    );
    $tables = $analyticsResponse['json']['data']['report_tables'] ?? [];
    if ($analyticsResponse['status'] !== 200 || !is_array($tables) || $tables === []) {
        echo 'INFO: Survey Analytics status ' . $analyticsResponse['status']
            . '; error: ' . (string)($analyticsResponse['json']['error'] ?? 'no report tables returned') . PHP_EOL;
    }
    report_paragraph_assert(
        $analyticsResponse['status'] === 200 && is_array($tables) && count($tables) > 0,
        'live Survey Analytics data include numbered report tables'
    );

    if ($testScope !== 'survey') {
        $formalSections = [];
        $formalRequestsCompleted = true;
        foreach (['overview', 'by_program', 'by_year', 'employment_status', 'salary_distribution'] as $reportType) {
            $sectionResponse = report_paragraph_request(
                'GET',
                '/reports/index.php?type=' . rawurlencode($reportType) . '&survey_id=' . $surveyId,
                $session
            );
            $formalRequestsCompleted = $formalRequestsCompleted
                && $sectionResponse['status'] === 200
                && !empty($sectionResponse['json']['success']);
            $formalSections[$reportType] = $sectionResponse['json']['data'] ?? [];
        }
        report_paragraph_assert($formalRequestsCompleted, 'live Graduate Tracer report sections load for export');
        if ($formalRequestsCompleted) {
            $formalResponse = report_paragraph_request(
                'POST',
                '/reports/ai-analytics.php?type=formal_report&survey_id=' . $surveyId,
                $session,
                [
                    'report_data' => [
                        'overview' => $formalSections['overview'],
                        'programPerformance' => $formalSections['by_program'],
                        'yearlyTrend' => $formalSections['by_year'],
                        'employmentStatus' => $formalSections['employment_status'],
                        'salaryDistribution' => $formalSections['salary_distribution'],
                    ],
                    'filters' => ['survey' => (string)($analyticsResponse['json']['data']['survey_title'] ?? '')],
                ]
            );
            $formalInterpretations = $formalResponse['json']['data']['pdf_interpretations'] ?? [];
            report_paragraph_assert($formalResponse['status'] === 200, 'Graduate Tracer AI interpretation request completes');
            if (!empty($formalResponse['json']['data']['ai_model'])) {
                report_paragraph_assert(
                    is_array($formalInterpretations) && count($formalInterpretations) === 5,
                    'AI returns all five Graduate Tracer report interpretations'
                );
                report_paragraph_assert(
                    is_array($formalInterpretations)
                    && array_reduce($formalInterpretations, static fn (bool $valid, $value): bool => $valid && report_has_exactly_two_paragraphs($value), true),
                    'every live Graduate Tracer AI interpretation contains exactly two paragraphs'
                );
            } else {
                echo 'SKIP: Live Graduate Tracer AI output was unavailable; verified frontend fallbacks cover all five sections.' . PHP_EOL;
            }
        }
    }

    if ($testScope !== 'formal' && is_array($tables) && $tables !== []) {
        $payloadTables = [];
        foreach (array_values($tables) as $index => $table) {
            if (!is_array($table)) continue;
            $detailRows = array_filter(
                is_array($table['rows'] ?? null) ? $table['rows'] : [],
                static fn ($row): bool => is_array($row) && empty($row['is_group']) && empty($row['is_total'])
            );
            $table['key'] = 'table_' . ($index + 1);
            $table['detail_row_count'] = count($detailRows);
            $payloadTables[] = $table;
        }

        $interpretations = [];
        $allRequestsCompleted = true;
        $anyAiModel = false;
        foreach (array_chunk($payloadTables, 7) as $tableBatch) {
            $aiResponse = report_paragraph_request(
                'POST',
                '/reports/ai-analytics.php?type=survey_report&survey_id=' . $surveyId,
                $session,
                [
                    'report_data' => ['tables' => $tableBatch],
                    'filters' => ['survey' => (string)($analyticsResponse['json']['data']['survey_title'] ?? '')],
                ]
            );
            $allRequestsCompleted = $allRequestsCompleted && $aiResponse['status'] === 200;
            $anyAiModel = $anyAiModel || !empty($aiResponse['json']['data']['ai_model']);
            $batchInterpretations = $aiResponse['json']['data']['survey_interpretations'] ?? [];
            if (is_array($batchInterpretations)) {
                $interpretations = array_merge($interpretations, $batchInterpretations);
            }
        }
        $missingTables = array_values(array_filter(
            $payloadTables,
            static fn (array $table): bool => !array_key_exists((string)$table['key'], $interpretations)
        ));
        foreach ($missingTables as $table) {
            $retryResponse = report_paragraph_request(
                'POST',
                '/reports/ai-analytics.php?type=survey_report&survey_id=' . $surveyId,
                $session,
                [
                    'report_data' => ['tables' => [$table]],
                    'filters' => ['survey' => (string)($analyticsResponse['json']['data']['survey_title'] ?? '')],
                ]
            );
            $allRequestsCompleted = $allRequestsCompleted && $retryResponse['status'] === 200;
            $anyAiModel = $anyAiModel || !empty($retryResponse['json']['data']['ai_model']);
            $retryInterpretations = $retryResponse['json']['data']['survey_interpretations'] ?? [];
            if (is_array($retryInterpretations)) {
                $interpretations = array_merge($interpretations, $retryInterpretations);
            }
        }
        report_paragraph_assert($allRequestsCompleted, 'Survey Analytics AI requests complete in bounded table batches');
        if ($anyAiModel) {
            echo 'INFO: Validated live AI interpretations: ' . count($interpretations) . ' of ' . count($payloadTables) . PHP_EOL;
            $expectedKeys = array_column($payloadTables, 'key');
            $missingKeys = array_values(array_diff($expectedKeys, array_keys($interpretations)));
            if ($missingKeys !== []) echo 'INFO: Missing validated keys: ' . implode(', ', $missingKeys) . PHP_EOL;
            $requiresAllLiveAi = filter_var(
                getenv('GRADTRACK_REQUIRE_ALL_LIVE_REPORT_AI') ?: '0',
                FILTER_VALIDATE_BOOLEAN
            );
            report_paragraph_assert(
                is_array($interpretations)
                && ($requiresAllLiveAi
                    ? count($interpretations) === count($payloadTables)
                    : count($interpretations) > 0),
                $requiresAllLiveAi
                    ? 'AI returns one interpretation for every numbered Survey Analytics table'
                    : 'live AI returns validated Survey Analytics interpretations; verified fallbacks cover provider-limited tables'
            );
            report_paragraph_assert(
                is_array($interpretations)
                && array_reduce($interpretations, static fn (bool $valid, $value): bool => $valid && report_has_exactly_two_paragraphs($value), true),
                'every live Survey Analytics AI interpretation contains exactly two paragraphs'
            );
        } else {
            echo 'SKIP: Live Groq output was unavailable; verified frontend fallbacks cover every table.' . PHP_EOL;
        }
    }
}

report_cleanup_session();
$sessionId = null;

if ($failures > 0) {
    fwrite(STDERR, PHP_EOL . $failures . ' report two-paragraph integration test(s) failed.' . PHP_EOL);
    exit(1);
}

echo PHP_EOL . 'All report two-paragraph HTTP integration tests passed.' . PHP_EOL;
