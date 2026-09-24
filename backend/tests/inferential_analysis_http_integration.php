<?php

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';

$failures = 0;
$sessionIds = [];
$baseUrl = rtrim((string)(getenv('GRADTRACK_INFERENTIAL_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();

function inferential_http_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function inferential_http_session(int $adminUserId): array
{
    global $sessionIds;
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    ini_set('session.use_strict_mode', '0');
    $sessionId = 'gtia' . bin2hex(random_bytes(18));
    $csrfToken = bin2hex(random_bytes(32));
    session_id($sessionId);
    session_start();
    $_SESSION = [
        'admin_user_id' => $adminUserId,
        'authenticated_at' => time(),
        'csrf_token' => $csrfToken,
    ];
    session_write_close();
    $sessionIds[] = $sessionId;
    return ['id' => $sessionId, 'csrf' => $csrfToken];
}

function inferential_http_request(string $method, string $path, ?array $session = null, ?array $payload = null): array
{
    global $baseUrl, $cookieName;
    $headers = ['Accept: application/json', 'Origin: http://localhost:5173'];
    if ($session !== null) {
        $headers[] = 'Cookie: ' . $cookieName . '=' . rawurlencode($session['id']);
        if ($method !== 'GET') $headers[] = 'X-CSRF-Token: ' . $session['csrf'];
    }
    $content = null;
    if ($payload !== null) {
        $headers[] = 'Content-Type: application/json';
        $content = json_encode($payload);
    }
    $context = stream_context_create(['http' => [
        'method' => $method,
        'header' => implode("\r\n", $headers),
        'content' => $content,
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

function inferential_http_cleanup(): void
{
    global $sessionIds;
    foreach ($sessionIds as $sessionId) {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        ini_set('session.use_strict_mode', '0');
        session_id($sessionId);
        session_start();
        $_SESSION = [];
        session_destroy();
    }
}

register_shutdown_function('inferential_http_cleanup');

$db = (new Database())->getConnection();
$adminId = (int)($db->query(
    "SELECT id FROM admin_users WHERE role = 'research_coordinator' AND COALESCE(is_active, 1) = 1 ORDER BY id LIMIT 1"
)->fetchColumn() ?: 0);
$deanId = (int)($db->query(
    "SELECT id FROM admin_users WHERE role = 'dean_cs' AND COALESCE(is_active, 1) = 1 ORDER BY id LIMIT 1"
)->fetchColumn() ?: 0);
$surveyId = (int)($db->query(
    "SELECT id FROM surveys WHERE archived_at IS NULL ORDER BY (status = 'active') DESC, id DESC LIMIT 1"
)->fetchColumn() ?: 0);

inferential_http_assert($adminId > 0, 'an authorized Reports account is available');
inferential_http_assert($surveyId > 0, 'a survey is available for endpoint testing');

if ($adminId > 0 && $surveyId > 0) {
    $anonymous = inferential_http_request('GET', '/reports/inferential-analysis.php?survey_id=' . $surveyId);
    inferential_http_assert($anonymous['status'] === 401, 'anonymous requests cannot load inferential metadata');

    $session = inferential_http_session($adminId);
    $metadataResponse = inferential_http_request(
        'GET',
        '/reports/inferential-analysis.php?survey_id=' . $surveyId,
        $session
    );
    $metadata = $metadataResponse['json']['data'] ?? [];
    $variableKeys = array_column($metadata['variables'] ?? [], 'key');
    inferential_http_assert(
        $metadataResponse['status'] === 200 && !empty($metadataResponse['json']['success']),
        'authorized metadata request succeeds'
    );
    inferential_http_assert(
        in_array('program', $variableKeys, true) && in_array('graduation_year', $variableKeys, true),
        'metadata exposes database-backed categorical dimensions'
    );
    inferential_http_assert(
        in_array('employment_status', $variableKeys, true),
        'metadata exposes the stable employment analytics mapping for this survey'
    );

    $analysisResponse = inferential_http_request(
        'POST',
        '/reports/inferential-analysis.php',
        $session,
        [
            'surveyId' => $surveyId,
            'variable1' => 'program',
            'variable2' => 'employment_status',
            'filters' => ['graduationYear' => 'all', 'programId' => 'all'],
        ]
    );
    $analysis = $analysisResponse['json']['data']['analysis'] ?? [];
    inferential_http_assert(
        $analysisResponse['status'] === 200 && !empty($analysisResponse['json']['success']),
        'POST endpoint returns an inferential analysis from live data'
    );
    inferential_http_assert(
        isset($analysis['validResponses'], $analysis['excludedResponses'])
        && ($analysis['canCalculate'] === false || (
            is_numeric($analysis['chiSquare'])
            && is_numeric($analysis['pValue'])
            && is_numeric($analysis['cramersV'])
        )),
        'endpoint response contains safe counts and either complete statistics or an explicit non-calculable state'
    );

    $sameVariableResponse = inferential_http_request(
        'POST',
        '/reports/inferential-analysis.php',
        $session,
        [
            'surveyId' => $surveyId,
            'variable1' => 'program',
            'variable2' => 'program',
            'filters' => [],
        ]
    );
    inferential_http_assert(
        $sameVariableResponse['status'] === 422
        && ($sameVariableResponse['json']['error'] ?? '') === 'Please select two different variables for inferential analysis.',
        'same-variable POST requests are rejected with a clear validation message'
    );

    $missingCsrfResponse = inferential_http_request(
        'POST',
        '/reports/inferential-analysis.php',
        ['id' => $session['id'], 'csrf' => ''],
        [
            'surveyId' => $surveyId,
            'variable1' => 'program',
            'variable2' => 'employment_status',
            'filters' => [],
        ]
    );
    inferential_http_assert($missingCsrfResponse['status'] === 419, 'authenticated POST requests require CSRF protection');

    if ($deanId > 0) {
        $deanSession = inferential_http_session($deanId);
        $deanMetadataResponse = inferential_http_request(
            'GET',
            '/reports/inferential-analysis.php?survey_id=' . $surveyId,
            $deanSession
        );
        $deanPrograms = $deanMetadataResponse['json']['data']['filterOptions']['programs'] ?? [];
        $deanProgramCodes = array_values(array_unique(array_column($deanPrograms, 'code')));
        inferential_http_assert(
            $deanMetadataResponse['status'] === 200
            && array_diff($deanProgramCodes, ['BSCS', 'ACT']) === [],
            'Dean inferential metadata contains only programs in the authenticated department scope'
        );

        $foreignProgramId = (int)($db->query(
            "SELECT id FROM programs WHERE code NOT IN ('BSCS', 'ACT') ORDER BY id LIMIT 1"
        )->fetchColumn() ?: 0);
        if ($foreignProgramId > 0) {
            $deanAttack = inferential_http_request(
                'POST',
                '/reports/inferential-analysis.php',
                $deanSession,
                [
                    'surveyId' => $surveyId,
                    'variable1' => 'program',
                    'variable2' => 'employment_status',
                    'filters' => ['programId' => $foreignProgramId],
                ]
            );
            inferential_http_assert(
                $deanAttack['status'] === 403,
                'a manipulated inferential program filter cannot escape the authenticated Dean scope'
            );
        }
    }
}

inferential_http_cleanup();
$sessionIds = [];

if ($failures > 0) {
    echo PHP_EOL . "{$failures} inferential HTTP integration test(s) failed." . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All inferential HTTP integration tests passed.' . PHP_EOL;
