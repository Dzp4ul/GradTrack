<?php

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';

$failures = 0;
$sessionId = null;
$csrfToken = null;
$baseUrl = rtrim((string)(getenv('GRADTRACK_PORTAL_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();

function graduate_portal_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) {
        $failures++;
    }
}

function graduate_portal_seed_session(int $accountId): string
{
    global $csrfToken;
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }

    ini_set('session.use_strict_mode', '0');
    $seededSessionId = 'gtpa' . bin2hex(random_bytes(18));
    $csrfToken = bin2hex(random_bytes(32));
    session_id($seededSessionId);
    session_start();
    $_SESSION = [
        'graduate_account_id' => $accountId,
        'authenticated_at' => time(),
        'csrf_token' => $csrfToken,
    ];
    session_write_close();

    return $seededSessionId;
}

function graduate_portal_request(string $path, string $sessionId, string $method = 'GET', array $data = []): array
{
    global $baseUrl, $cookieName, $csrfToken;
    $headers = [
        'Accept: application/json',
        'Origin: http://localhost:5173',
        'Cookie: ' . $cookieName . '=' . rawurlencode($sessionId),
    ];
    $options = [
        'method' => $method,
        'header' => implode("\r\n", $headers),
        'ignore_errors' => true,
        'timeout' => 60,
    ];
    if ($method !== 'GET') {
        $headers[] = 'Content-Type: application/x-www-form-urlencoded';
        $headers[] = 'X-CSRF-Token: ' . $csrfToken;
        $options['header'] = implode("\r\n", $headers);
        $options['content'] = http_build_query($data);
    }

    $context = stream_context_create(['http' => $options]);
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

function graduate_portal_cleanup_session(): void
{
    global $sessionId;
    if (!is_string($sessionId) || $sessionId === '') {
        return;
    }
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    ini_set('session.use_strict_mode', '0');
    session_id($sessionId);
    session_start();
    $_SESSION = [];
    session_destroy();
}

register_shutdown_function('graduate_portal_cleanup_session');

$db = (new Database())->getConnection();
$accountStmt = $db->query(
    "SELECT ga.id AS account_id, gp.program_course, gp.graduation_year
     FROM graduate_accounts ga
     INNER JOIN graduates g ON g.id = ga.graduate_id
     INNER JOIN graduate_profiles gp ON gp.graduate_account_id = ga.id
     WHERE ga.status = 'active'
       AND ga.alumni_verification_status = 'approved'
       AND g.archived_at IS NULL
     ORDER BY ga.id ASC
     LIMIT 1"
);
$account = $accountStmt->fetch(PDO::FETCH_ASSOC) ?: null;
graduate_portal_assert($account !== null, 'an approved graduate portal fixture account is available');

if ($account === null) {
    exit(1);
}

$accountId = (int)$account['account_id'];
$sessionId = graduate_portal_seed_session($accountId);

$announcements = graduate_portal_request('/announcements/index.php?page=1&per_page=9', $sessionId);
$announcementRows = is_array($announcements['json']['data'] ?? null)
    ? $announcements['json']['data']
    : [];
$onlyPublished = array_reduce(
    $announcementRows,
    static fn (bool $allowed, array $row): bool => $allowed && ($row['status'] ?? '') === 'published',
    true
);
graduate_portal_assert(
    $announcements['status'] === 200 && !empty($announcements['json']['success']),
    'an authenticated graduate can load the announcement feed'
);
graduate_portal_assert($onlyPublished, 'the graduate announcement feed contains only published announcements');

$educationAttack = graduate_portal_request('/graduate-profile/index.php', $sessionId, 'POST', [
    'update_profile' => '1',
    'program_course' => 'Unauthorized Program Edit',
    'graduation_year' => '2025',
]);
$educationAttackRejected = $educationAttack['status'] === 403
    && ($educationAttack['json']['code'] ?? '') === 'EDUCATION_FIELDS_READ_ONLY';
if (!$educationAttackRejected) {
    echo 'Education update rejection response: HTTP ' . $educationAttack['status'] . ' ' . $educationAttack['body'] . PHP_EOL;
}
graduate_portal_assert(
    $educationAttackRejected,
    'the Graduate Profile API rejects direct education-field updates'
);

$profileStmt = $db->prepare(
    'SELECT program_course, graduation_year FROM graduate_profiles WHERE graduate_account_id = :account_id LIMIT 1'
);
$profileStmt->execute([':account_id' => $accountId]);
$educationAfter = $profileStmt->fetch(PDO::FETCH_ASSOC) ?: [];
graduate_portal_assert(
    ($educationAfter['program_course'] ?? null) === $account['program_course']
    && ($educationAfter['graduation_year'] ?? null) === $account['graduation_year'],
    'a rejected education update leaves the stored profile education unchanged'
);

if ($failures > 0) {
    echo PHP_EOL . $failures . ' graduate portal access test(s) failed.' . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All graduate portal access integration tests passed.' . PHP_EOL;
