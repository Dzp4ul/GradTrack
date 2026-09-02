<?php

ob_start();
require_once __DIR__ . '/../api/config/database.php';

$failures = 0;
$sessions = [];
$endpoint = getenv('GRADTRACK_GENAI_TEST_URL') ?: 'http://localhost/GradTrack/backend/api/genai/assistant.php';

function genai_auth_test_assert(bool $condition, string $message): void
{
    global $failures;
    if (!$condition) {
        $failures++;
        echo "FAIL: {$message}" . PHP_EOL;
        return;
    }

    echo "PASS: {$message}" . PHP_EOL;
}

function genai_auth_test_session(array $values): string
{
    global $sessions;
    $sessionId = 'gtgenai' . bin2hex(random_bytes(8));
    session_id($sessionId);
    session_start();
    $_SESSION = $values;
    session_write_close();
    $sessions[] = $sessionId;
    return $sessionId;
}

function genai_auth_test_request(string $endpoint, ?string $sessionId = null): array
{
    $headers = ['Accept: application/json'];
    if ($sessionId !== null) {
        $headers[] = 'Cookie: PHPSESSID=' . $sessionId;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => implode("\r\n", $headers),
            'ignore_errors' => true,
            'timeout' => 15,
        ],
    ]);
    $body = @file_get_contents($endpoint . '?role=super_admin', false, $context);
    $status = 0;
    foreach (($http_response_header ?? []) as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $matches) === 1) {
            $status = (int)$matches[1];
            break;
        }
    }

    return [
        'status' => $status,
        'json' => is_string($body) ? json_decode($body, true) : null,
    ];
}

ini_set('session.use_cookies', '0');
ini_set('session.use_only_cookies', '0');
session_cache_limiter('');

$database = new Database();
$db = $database->getConnection();
$assistantSource = (string)file_get_contents(__DIR__ . '/../api/genai/assistant.php');
genai_auth_test_assert(
    preg_match('/\$payload\s*\[\s*[\'\"]role[\'\"]\s*\]/', $assistantSource) !== 1,
    'chatbot authorization never reads a role from the request payload'
);

$unauthenticated = genai_auth_test_request($endpoint);
genai_auth_test_assert($unauthenticated['status'] === 401, 'unauthenticated endpoint request is rejected');

$graduateSession = genai_auth_test_session([
    'graduate_account_id' => 1,
    'role' => 'super_admin',
]);
$graduateResponse = genai_auth_test_request($endpoint, $graduateSession);
genai_auth_test_assert($graduateResponse['status'] === 401, 'graduate-only session cannot access the chatbot endpoint');

$expectedLabels = [
    'admin' => 'Admin',
    'super_admin' => 'Super Admin',
    'alumni_admin' => 'Alumni Admin',
    'registrar' => 'Registrar',
    'dean_cs' => 'Dean - CCS',
    'dean_coed' => 'Dean - COED',
    'dean_hm' => 'Dean - HM',
];

$stmt = $db->prepare('SELECT id FROM admin_users WHERE role = :role ORDER BY id ASC');
foreach ($expectedLabels as $role => $expectedLabel) {
    $stmt->execute([':role' => $role]);
    $userIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
    $matched = false;

    foreach ($userIds as $userId) {
        $sessionId = genai_auth_test_session([
            'user_id' => (int)$userId,
            'role' => $role === 'super_admin' ? 'admin' : 'super_admin',
        ]);
        $response = genai_auth_test_request($endpoint, $sessionId);
        $label = $response['json']['data']['assistantConfig']['roleLabel'] ?? null;
        if ($response['status'] === 200 && $label === $expectedLabel) {
            $matched = true;
            break;
        }
    }

    genai_auth_test_assert(
        $matched,
        "{$role} endpoint scope comes from the database role, not the forged session/query role"
    );
}

foreach ($sessions as $sessionId) {
    session_id($sessionId);
    session_start();
    $_SESSION = [];
    session_destroy();
}

if ($failures > 0) {
    echo PHP_EOL . "{$failures} GenAI endpoint authorization test(s) failed." . PHP_EOL;
    ob_end_flush();
    exit(1);
}

echo PHP_EOL . 'All GenAI endpoint authorization tests passed.' . PHP_EOL;
ob_end_flush();
