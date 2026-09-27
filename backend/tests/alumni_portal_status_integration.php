<?php
declare(strict_types=1);

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';
require_once __DIR__ . '/../api/config/graduate_auth.php';
require_once __DIR__ . '/../api/config/alumni_registry.php';

$db = (new Database())->getConnection();
gradtrack_ensure_graduate_account_verification_schema($db);
gradtrack_alumni_registry_ensure_schema($db);
$baseUrl = rtrim((string)(getenv('GRADTRACK_HTTP_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();
$failures = 0;
$adminId = $graduateId = $accountId = $registryId = $inactiveRegistryId = 0;
$sessionIds = [];

function portal_status_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function portal_status_session(array $identity): array
{
    global $sessionIds;
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    ini_set('session.use_strict_mode', '0');
    $sessionId = 'aps' . bin2hex(random_bytes(18));
    session_id($sessionId); session_start();
    $csrf = bin2hex(random_bytes(32));
    $_SESSION = $identity + ['csrf_token' => $csrf];
    session_write_close();
    $sessionIds[] = $sessionId;
    return [$sessionId, $csrf];
}

function portal_status_request(string $path, ?string $sessionId = null, string $csrf = '', string $method = 'GET', ?array $body = null): array
{
    global $baseUrl, $cookieName;
    $headers = ['Accept: application/json', 'Origin: http://localhost:5173'];
    if ($sessionId !== null) $headers[] = 'Cookie: ' . $cookieName . '=' . rawurlencode($sessionId);
    if ($csrf !== '') $headers[] = 'X-CSRF-Token: ' . $csrf;
    if ($body !== null) $headers[] = 'Content-Type: application/json';
    $context = stream_context_create(['http' => [
        'method' => $method,
        'header' => implode("\r\n", $headers),
        'content' => $body === null ? '' : json_encode($body),
        'ignore_errors' => true,
        'timeout' => 30,
    ]]);
    $raw = @file_get_contents($baseUrl . '/' . ltrim($path, '/'), false, $context);
    $status = 0;
    foreach ($http_response_header ?? [] as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $match) === 1) { $status = (int)$match[1]; break; }
    }
    return ['status' => $status, 'json' => is_string($raw) ? json_decode($raw, true) : null, 'raw' => $raw ?: ''];
}

function portal_status_cleanup(): void
{
    global $db, $adminId, $graduateId, $accountId, $registryId, $inactiveRegistryId, $sessionIds;
    try {
        foreach ([$registryId, $inactiveRegistryId] as $id) {
            if ($id > 0) $db->prepare('DELETE FROM registered_alumni WHERE id = :id')->execute([':id' => $id]);
        }
        if ($adminId > 0) $db->prepare('DELETE FROM audit_trail WHERE user_id = :id')->execute([':id' => $adminId]);
        if ($accountId > 0) $db->prepare('DELETE FROM graduate_accounts WHERE id = :id')->execute([':id' => $accountId]);
        if ($graduateId > 0) $db->prepare('DELETE FROM graduates WHERE id = :id')->execute([':id' => $graduateId]);
        if ($adminId > 0) $db->prepare('DELETE FROM admin_users WHERE id = :id')->execute([':id' => $adminId]);
    } catch (Throwable $error) {
        echo 'CLEANUP WARNING: ' . $error->getMessage() . PHP_EOL;
    }
    foreach ($sessionIds as $sessionId) {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        ini_set('session.use_strict_mode', '0');
        session_id($sessionId);
        if (@session_start()) { $_SESSION = []; session_destroy(); }
    }
}

$cleanupFinished = false;
register_shutdown_function(static function () use (&$cleanupFinished): void { if (!$cleanupFinished) portal_status_cleanup(); });

try {
    if (@file_get_contents($baseUrl . '/csrf.php', false, stream_context_create(['http' => ['ignore_errors' => true, 'timeout' => 10]])) === false) {
        throw new RuntimeException('Test API is not reachable at ' . $baseUrl);
    }
    $suffix = bin2hex(random_bytes(5));
    $program = $db->query('SELECT id, code, name FROM programs ORDER BY id LIMIT 1')->fetch(PDO::FETCH_ASSOC);
    if (!$program) throw new RuntimeException('At least one program is required.');

    $adminStmt = $db->prepare("INSERT INTO admin_users (username, email, password, full_name, role, is_active) VALUES (:username, :email, :password, 'Portal Status Test', 'alumni_president', 1)");
    $adminStmt->execute([
        ':username' => 'portal_status_' . $suffix,
        ':email' => 'portal-status-admin-' . $suffix . '@example.invalid',
        ':password' => password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT),
    ]);
    $adminId = (int)$db->lastInsertId();

    $email = 'portal-status-graduate-' . $suffix . '@example.invalid';
    $password = 'Safe-Test-' . $suffix . '!9Aa';
    $graduateStmt = $db->prepare("INSERT INTO graduates (student_id, first_name, last_name, email, phone, address, program_id, year_graduated, status) VALUES (:student_id, 'PORTAL', 'STATUS', :email, '09171234567', 'Test Address', :program_id, 2025, 'active')");
    $graduateStmt->execute([':student_id' => 'PORTAL-' . strtoupper($suffix), ':email' => $email, ':program_id' => (int)$program['id']]);
    $graduateId = (int)$db->lastInsertId();
    $accountStmt = $db->prepare("INSERT INTO graduate_accounts (graduate_id, email, password_hash, status, alumni_verification_status, alumni_verification_submitted_at, alumni_verification_reviewed_at, last_login_at) VALUES (:graduate_id, :email, :password, 'active', 'approved', NOW(), NOW(), DATE_SUB(NOW(), INTERVAL 365 DAY))");
    $accountStmt->execute([':graduate_id' => $graduateId, ':email' => $email, ':password' => password_hash($password, PASSWORD_DEFAULT)]);
    $accountId = (int)$db->lastInsertId();

    $registryStmt = $db->prepare("INSERT INTO registered_alumni (full_name, normalized_name, course_id, course_name, course_code, batch_year, registration_status, linked_user_id, source_file) VALUES (:full_name, :normalized_name, :course_id, :course_name, :course_code, 2025, 'Verified', :account_id, 'portal-status-test')");
    $registryStmt->execute([
        ':full_name' => 'PORTAL STATUS ' . strtoupper($suffix), ':normalized_name' => 'portal status ' . $suffix,
        ':course_id' => (int)$program['id'], ':course_name' => (string)$program['name'], ':course_code' => (string)$program['code'], ':account_id' => $accountId,
    ]);
    $registryId = (int)$db->lastInsertId();
    $registryStmt->execute([
        ':full_name' => 'INACTIVE REGISTRY ' . strtoupper($suffix), ':normalized_name' => 'inactive registry ' . $suffix,
        ':course_id' => (int)$program['id'], ':course_name' => (string)$program['name'], ':course_code' => (string)$program['code'], ':account_id' => null,
    ]);
    $inactiveRegistryId = (int)$db->lastInsertId();

    [$graduateSession] = portal_status_session(['graduate_account_id' => $accountId]);
    $checkExpired = portal_status_request('graduate-auth/check.php', $graduateSession);
    $statusAfterCutoff = (string)$db->query('SELECT status FROM graduate_accounts WHERE id = ' . $accountId)->fetchColumn();
    portal_status_assert(empty($checkExpired['json']['authenticated']) && $statusAfterCutoff === 'disabled', 'an account at the exact 365-day inactivity cutoff is disabled by backend API enforcement');

    [$adminSession, $adminCsrf] = portal_status_session(['admin_user_id' => $adminId]);
    $inactiveDetail = portal_status_request('alumni-registry/index.php?action=detail&id=' . $inactiveRegistryId, $adminSession, $adminCsrf);
    portal_status_assert(($inactiveDetail['json']['data']['account_status'] ?? '') === 'inactive', 'a registry record without a portal account is reported as Inactive');

    $payload = [
        'id' => $registryId, 'full_name' => 'PORTAL STATUS ' . strtoupper($suffix),
        'course_code' => (string)$program['code'], 'batch_year' => '2025', 'registration_status' => 'Verified',
        'portal_account_status' => 'active', 'linked_first_name' => 'PORTAL', 'linked_middle_name' => '',
        'linked_last_name' => 'STATUS', 'linked_student_id' => 'PORTAL-' . strtoupper($suffix),
        'linked_email' => $email, 'linked_phone' => '09171234567', 'linked_address' => 'Test Address',
    ];
    $reactivate = portal_status_request('alumni-registry/index.php?action=update', $adminSession, $adminCsrf, 'PUT', $payload);
    $reactivated = $db->query('SELECT status, last_login_at, reactivated_at FROM graduate_accounts WHERE id = ' . $accountId)->fetch(PDO::FETCH_ASSOC);
    portal_status_assert($reactivate['status'] === 200 && ($reactivated['status'] ?? '') === 'active' && !empty($reactivated['reactivated_at']), 'Alumni President can explicitly reactivate a disabled approved account');
    portal_status_assert(!empty($reactivated['last_login_at']), 'reactivation preserves the historical last-login timestamp');

    [$reactivatedSession] = portal_status_session(['graduate_account_id' => $accountId]);
    $checkActive = portal_status_request('graduate-auth/check.php', $reactivatedSession);
    portal_status_assert(!empty($checkActive['json']['authenticated']), 'reactivated graduate can access authenticated graduate APIs');

    $payload['portal_account_status'] = 'disabled';
    $disable = portal_status_request('alumni-registry/index.php?action=update', $adminSession, $adminCsrf, 'PUT', $payload);
    portal_status_assert($disable['status'] === 200 && (string)$db->query('SELECT status FROM graduate_accounts WHERE id = ' . $accountId)->fetchColumn() === 'disabled', 'Alumni President can explicitly disable an approved portal account');

    [$disabledSession] = portal_status_session(['graduate_account_id' => $accountId]);
    $checkDisabled = portal_status_request('graduate-auth/check.php', $disabledSession);
    portal_status_assert(empty($checkDisabled['json']['authenticated']), 'disabled graduate is denied authenticated graduate API access');

    [$loginSession, $loginCsrf] = portal_status_session([]);
    $login = portal_status_request('graduate-auth/login.php', $loginSession, $loginCsrf, 'POST', ['email' => $email, 'password' => $password]);
    portal_status_assert($login['status'] === 403 && ($login['json']['code'] ?? '') === 'disabled' && str_contains((string)($login['json']['error'] ?? ''), 'contact the Alumni Office'), 'disabled graduate receives the safe inactivity message at login');

    $invalidActivationPayload = [
        'id' => $inactiveRegistryId, 'full_name' => 'INACTIVE REGISTRY ' . strtoupper($suffix),
        'course_code' => (string)$program['code'], 'batch_year' => '2025', 'registration_status' => 'Verified',
        'portal_account_status' => 'active',
    ];
    $invalidActivation = portal_status_request('alumni-registry/index.php?action=update', $adminSession, $adminCsrf, 'PUT', $invalidActivationPayload);
    portal_status_assert($invalidActivation['status'] === 409, 'a registry record without an account cannot be activated through the dropdown');
} catch (Throwable $error) {
    portal_status_assert(false, 'integration test completed without an exception: ' . $error->getMessage());
}

portal_status_cleanup();
$cleanupFinished = true;
if ($failures > 0) {
    echo PHP_EOL . $failures . ' alumni portal status integration test(s) failed.' . PHP_EOL;
    exit(1);
}
echo PHP_EOL . 'All alumni portal status integration tests passed.' . PHP_EOL;
