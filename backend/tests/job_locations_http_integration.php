<?php
declare(strict_types=1);

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';

$db = (new Database())->getConnection();
$baseUrl = rtrim((string) (getenv('GRADTRACK_HTTP_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();
$sessionId = null;
$failures = 0;

function job_locations_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function job_locations_request(string $path, ?string $sessionId = null): array
{
    global $baseUrl, $cookieName;
    $headers = ['Accept: application/json', 'Origin: http://localhost:5173'];
    if ($sessionId !== null) $headers[] = 'Cookie: ' . $cookieName . '=' . rawurlencode($sessionId);

    $context = stream_context_create(['http' => [
        'method' => 'GET',
        'header' => implode("\r\n", $headers),
        'ignore_errors' => true,
        'timeout' => 30,
    ]]);
    $raw = @file_get_contents($baseUrl . '/' . ltrim($path, '/'), false, $context);
    $status = 0;
    foreach ($http_response_header ?? [] as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $match) === 1) {
            $status = (int) $match[1];
            break;
        }
    }
    return ['status' => $status, 'json' => is_string($raw) ? json_decode($raw, true) : null];
}

try {
    $accountId = (int) $db->query("SELECT id FROM graduate_accounts
        WHERE status = 'active' AND alumni_verification_status = 'approved'
        ORDER BY id LIMIT 1")->fetchColumn();
    if ($accountId <= 0) throw new RuntimeException('At least one verified graduate account is required.');

    ini_set('session.use_strict_mode', '0');
    $sessionId = 'jl' . bin2hex(random_bytes(18));
    session_id($sessionId);
    session_start();
    $_SESSION = ['graduate_account_id' => $accountId, 'authenticated_at' => time()];
    session_write_close();

    $unauthenticated = job_locations_request('jobs/locations.php');
    job_locations_assert($unauthenticated['status'] === 401, 'location suggestions require a GradTrack session');

    $response = job_locations_request('jobs/locations.php', $sessionId);
    $items = is_array($response['json']['data'] ?? null) ? $response['json']['data'] : [];
    $makato = array_values(array_filter($items, static fn(array $item): bool => str_starts_with((string) ($item['name'] ?? ''), 'Makato,')));
    job_locations_assert($response['status'] === 200 && !empty($response['json']['success']), 'authenticated graduates can load PSGC suggestions');
    job_locations_assert(count($items) > 1000, 'the complete PSGC city and municipality collection is returned');
    job_locations_assert(($makato[0]['province'] ?? null) === 'Aklan', 'PSGC city suggestions include their province');
} catch (Throwable $error) {
    job_locations_assert(false, 'job locations integration completed without an exception: ' . $error->getMessage());
} finally {
    if ($sessionId !== null) {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        ini_set('session.use_strict_mode', '0');
        session_id($sessionId);
        if (@session_start()) {
            $_SESSION = [];
            session_destroy();
        }
    }
}

if ($failures > 0) {
    echo PHP_EOL . $failures . ' job location integration test(s) failed.' . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'Job locations HTTP integration test passed.' . PHP_EOL;
