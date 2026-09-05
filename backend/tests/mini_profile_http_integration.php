<?php
ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';
require_once __DIR__ . '/../api/config/storage.php';

$failures = 0;
$sessionId = '';
$db = (new Database())->getConnection();
$url = (string) (getenv('GRADTRACK_MINI_PROFILE_TEST_URL') ?: 'http://localhost/GradTrack/backend/api/graduate-profile/mini.php');
$cookieName = gradtrack_session_cookie_name();

function mini_profile_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function mini_profile_request(string $url, string $sessionId, string $cookieName): array
{
    $context = stream_context_create(['http' => [
        'method' => 'GET',
        'header' => implode("\r\n", [
            'Accept: application/json',
            'Origin: http://localhost:5173',
            'Cookie: ' . $cookieName . '=' . rawurlencode($sessionId),
        ]),
        'ignore_errors' => true,
        'timeout' => 30,
    ]]);
    $body = @file_get_contents($url, false, $context);
    $headers = $http_response_header ?? [];
    $status = 0;
    foreach ($headers as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $match) === 1) {
            $status = (int) $match[1];
            break;
        }
    }
    return ['status' => $status, 'json' => is_string($body) ? json_decode($body, true) : null];
}

function mini_profile_destroy_session(string $sessionId): void
{
    if ($sessionId === '') return;
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    ini_set('session.use_strict_mode', '0');
    session_id($sessionId);
    session_start();
    $_SESSION = [];
    session_destroy();
}

try {
    $rows = $db->query("SELECT account.id AS account_id,
                               graduate.id AS graduate_id,
                               TRIM(CONCAT(COALESCE(graduate.first_name, ''), ' ', COALESCE(graduate.last_name, ''))) AS full_name,
                               image.file_path AS profile_image_path
                        FROM graduate_accounts account
                        JOIN graduates graduate ON graduate.id = account.graduate_id
                        LEFT JOIN graduate_profile_images image ON image.graduate_account_id = account.id
                        WHERE account.status = 'active'
                          AND account.alumni_verification_status = 'approved'
                          AND graduate.status = 'active'
                        ORDER BY account.id ASC
                        LIMIT 2")->fetchAll(PDO::FETCH_ASSOC);
    if (count($rows) < 2) throw new RuntimeException('Two approved graduate fixtures are required');

    ini_set('session.use_strict_mode', '0');
    $sessionId = 'gtmini' . bin2hex(random_bytes(16));
    session_id($sessionId);
    session_start();
    $_SESSION = ['graduate_account_id' => (int) $rows[0]['account_id'], 'authenticated_at' => time()];
    session_write_close();

    $target = $rows[1];
    $response = mini_profile_request($url . '?graduate_id=' . (int) $target['graduate_id'], $sessionId, $cookieName);
    $profile = $response['json']['data']['profile'] ?? [];
    mini_profile_assert($response['status'] === 200, 'an authenticated graduate can load a community mini profile');
    mini_profile_assert((int) ($profile['graduate_id'] ?? 0) === (int) $target['graduate_id'], 'the mini profile returns the requested graduate ID rather than the viewer ID');
    mini_profile_assert((string) ($profile['full_name'] ?? '') === (string) $target['full_name'], 'the mini profile name comes from the requested graduate record');
    mini_profile_assert(
        ($profile['profile_image_path'] ?? null) === gradtrack_storage_media_access_reference($target['profile_image_path'] ?? null),
        'the mini profile photo comes from the requested graduate account storage record'
    );

    $missing = mini_profile_request($url . '?graduate_id=2147483647', $sessionId, $cookieName);
    mini_profile_assert($missing['status'] === 404, 'an unavailable graduate ID cannot resolve to another graduate profile');
} catch (Throwable $error) {
    fwrite(STDERR, 'FAIL: ' . $error->getMessage() . PHP_EOL);
    $failures++;
}

mini_profile_destroy_session($sessionId);
$sessionId = '';

if ($failures > 0) {
    echo PHP_EOL . $failures . ' mini-profile integration test(s) failed.' . PHP_EOL;
    ob_end_flush();
    exit(1);
}

echo PHP_EOL . 'All mini-profile HTTP integration tests passed.' . PHP_EOL;
ob_end_flush();
