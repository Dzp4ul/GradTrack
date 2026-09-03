<?php

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';

$failures = 0;
$sessionIds = [];
$baseUrl = rtrim((string) (getenv('GRADTRACK_AUTH_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();

function auth_isolation_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) {
        $failures++;
    }
}

function auth_isolation_seed_session(string $identityKey, int $identityId): string
{
    global $sessionIds;
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }

    ini_set('session.use_strict_mode', '0');
    $sessionId = 'gti' . bin2hex(random_bytes(18));
    session_id($sessionId);
    session_start();
    $_SESSION = [
        $identityKey => $identityId,
        'authenticated_at' => time(),
    ];
    session_write_close();
    $sessionIds[] = $sessionId;
    return $sessionId;
}

function auth_isolation_request(
    string $url,
    ?string $sessionId = null,
    string $method = 'GET',
    ?array $jsonBody = null
): array
{
    global $cookieName;
    $headers = ['Accept: application/json', 'Origin: http://localhost:5173'];
    if ($sessionId !== null) {
        $headers[] = 'Cookie: ' . $cookieName . '=' . rawurlencode($sessionId);
    }
    if ($jsonBody !== null) {
        $headers[] = 'Content-Type: application/json';
    }

    $context = stream_context_create([
        'http' => [
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'content' => $jsonBody !== null ? json_encode($jsonBody) : '',
            'ignore_errors' => true,
            'timeout' => 30,
        ],
    ]);
    $body = @file_get_contents($url, false, $context);
    $responseHeaders = $http_response_header ?? [];
    $status = 0;
    foreach ($responseHeaders as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $matches) === 1) {
            $status = (int) $matches[1];
            break;
        }
    }

    return [
        'status' => $status,
        'json' => is_string($body) ? json_decode($body, true) : null,
        'headers' => $responseHeaders,
    ];
}

function auth_isolation_response_cookie(array $response): ?string
{
    global $cookieName;
    $cookie = null;
    foreach ($response['headers'] as $header) {
        if (preg_match('/^Set-Cookie:\s*' . preg_quote($cookieName, '/') . '=([^;]*)/i', $header, $matches) === 1) {
            $cookie = rawurldecode($matches[1]);
        }
    }
    return $cookie !== '' ? $cookie : null;
}

function auth_isolation_admin_for_role(PDO $db, string $role): ?array
{
    $stmt = $db->prepare('SELECT id, role FROM admin_users WHERE role = :role AND COALESCE(is_active, 1) = 1 ORDER BY id ASC LIMIT 1');
    $stmt->execute([':role' => $role]);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

function auth_isolation_cleanup(): void
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

function auth_isolation_remove_temporary_admin(PDO $db, int $adminId): void
{
    if ($adminId <= 0) {
        return;
    }

    try {
        $deleteAudit = $db->prepare("DELETE FROM audit_trail WHERE user_id = :id AND module = 'Authentication'");
        $deleteAudit->execute([':id' => $adminId]);
    } catch (Throwable $ignored) {
        // The audit table may not exist in a minimal test database.
    }

    $deleteAdmin = $db->prepare('DELETE FROM admin_users WHERE id = :id');
    $deleteAdmin->execute([':id' => $adminId]);
}

$db = (new Database())->getConnection();
$temporaryAdminId = 0;
$cleanupFinished = false;
register_shutdown_function(static function () use ($db, &$temporaryAdminId, &$cleanupFinished): void {
    if ($cleanupFinished) {
        return;
    }
    auth_isolation_cleanup();
    auth_isolation_remove_temporary_admin($db, $temporaryAdminId);
});

$fixtureSuffix = bin2hex(random_bytes(8));
$fixtureEmail = 'auth-isolation-' . $fixtureSuffix . '@example.invalid';
$fixturePassword = bin2hex(random_bytes(24));
$insertFixture = $db->prepare('INSERT INTO admin_users (username, email, password, full_name, role, is_active)
                               VALUES (:username, :email, :password, :full_name, :role, 1)');
$insertFixture->execute([
    ':username' => 'auth_isolation_' . $fixtureSuffix,
    ':email' => $fixtureEmail,
    ':password' => password_hash($fixturePassword, PASSWORD_DEFAULT),
    ':full_name' => 'Authentication Isolation Test',
    ':role' => 'super_admin',
]);
$temporaryAdminId = (int) $db->lastInsertId();

$anonymousBeforeLogin = auth_isolation_request($baseUrl . '/auth/check.php');
$anonymousSessionId = auth_isolation_response_cookie($anonymousBeforeLogin);
if ($anonymousSessionId !== null) {
    $sessionIds[] = $anonymousSessionId;
}
$liveLogin = auth_isolation_request($baseUrl . '/auth/login.php', $anonymousSessionId, 'POST', [
    'email' => $fixtureEmail,
    'password' => $fixturePassword,
]);
$liveLoginSessionId = auth_isolation_response_cookie($liveLogin);
if ($liveLoginSessionId !== null) {
    $sessionIds[] = $liveLoginSessionId;
}
$liveLoginMe = $liveLoginSessionId !== null
    ? auth_isolation_request($baseUrl . '/auth/check.php', $liveLoginSessionId)
    : ['status' => 0, 'json' => null, 'headers' => []];
auth_isolation_assert(
    $liveLogin['status'] === 200
        && ($liveLogin['json']['user']['id'] ?? null) === $temporaryAdminId,
    'the real HTTP login endpoint authenticates the requested account'
);
auth_isolation_assert(
    $anonymousSessionId !== null
        && $liveLoginSessionId !== null
        && $liveLoginSessionId !== $anonymousSessionId,
    'the real HTTP login endpoint replaces the anonymous session ID'
);
auth_isolation_assert(
    ($liveLoginMe['json']['user']['id'] ?? null) === $temporaryAdminId
        && ($liveLoginMe['json']['user']['role'] ?? null) === 'super_admin',
    'auth restoration resolves the live-login user and role from that session cookie'
);

$passwordRows = $db->query('SELECT password FROM admin_users WHERE COALESCE(is_active, 1) = 1')->fetchAll(PDO::FETCH_COLUMN);
$unhashedPasswordCount = count(array_filter($passwordRows, static function ($password): bool {
    return empty(password_get_info((string) $password)['algo']);
}));
auth_isolation_assert($unhashedPasswordCount === 0, 'all active administrator passwords use password_hash-compatible storage');
$alumniAdmin = auth_isolation_admin_for_role($db, 'alumni_admin');
$admin = auth_isolation_admin_for_role($db, 'admin');
$registrar = auth_isolation_admin_for_role($db, 'registrar');
$graduateStmt = $db->query("SELECT ga.id
                            FROM graduate_accounts ga
                            JOIN graduates g ON g.id = ga.graduate_id
                            WHERE ga.status = 'active'
                              AND ga.alumni_verification_status = 'approved'
                              AND g.archived_at IS NULL
                            ORDER BY ga.id ASC LIMIT 1");
$graduateAccountId = (int) ($graduateStmt->fetchColumn() ?: 0);

auth_isolation_assert($alumniAdmin !== null, 'an active Alumni Admin test principal exists');
auth_isolation_assert($admin !== null, 'an active Admin test principal exists');
auth_isolation_assert($registrar !== null, 'an active Registrar test principal exists');
auth_isolation_assert($graduateAccountId > 0, 'an active verified Graduate test principal exists');

if ($alumniAdmin && $admin && $registrar && $graduateAccountId > 0) {
    $preLoginSession = auth_isolation_seed_session('admin_user_id', (int) $alumniAdmin['id']);
    ini_set('session.use_strict_mode', '1');
    session_id($preLoginSession);
    gradtrack_establish_session_identity('admin_user_id', (int) $admin['id']);
    $rotatedLoginSession = session_id();
    session_write_close();
    $sessionIds[] = $rotatedLoginSession;

    $oldSessionAfterRotation = auth_isolation_request($baseUrl . '/auth/check.php', $preLoginSession);
    $newSessionAfterRotation = auth_isolation_request($baseUrl . '/auth/check.php', $rotatedLoginSession);
    auth_isolation_assert($rotatedLoginSession !== $preLoginSession, 'successful authentication rotates the session ID');
    auth_isolation_assert(
        empty($oldSessionAfterRotation['json']['authenticated'])
            && ($newSessionAfterRotation['json']['user']['id'] ?? null) === (int) $admin['id'],
        'session rotation invalidates the pre-login ID and preserves the authenticated identity only on the new ID'
    );

    $alumniSession = auth_isolation_seed_session('admin_user_id', (int) $alumniAdmin['id']);
    $adminSession = auth_isolation_seed_session('admin_user_id', (int) $admin['id']);
    $registrarSession = auth_isolation_seed_session('admin_user_id', (int) $registrar['id']);
    $graduateSession = auth_isolation_seed_session('graduate_account_id', $graduateAccountId);

    auth_isolation_assert(count(array_unique([$alumniSession, $adminSession, $registrarSession, $graduateSession])) === 4, 'four browser sessions use four unique session IDs');

    $alumniMe = auth_isolation_request($baseUrl . '/auth/check.php', $alumniSession);
    $adminMe = auth_isolation_request($baseUrl . '/auth/check.php', $adminSession);
    $registrarMe = auth_isolation_request($baseUrl . '/auth/check.php', $registrarSession);
    $graduateMe = auth_isolation_request($baseUrl . '/graduate-auth/check.php', $graduateSession);

    auth_isolation_assert(($alumniMe['json']['user']['role'] ?? null) === 'alumni_admin', 'Chrome-equivalent session remains Alumni Admin');
    auth_isolation_assert(($adminMe['json']['user']['role'] ?? null) === 'admin', 'Incognito-equivalent session remains Admin');
    auth_isolation_assert(($registrarMe['json']['user']['role'] ?? null) === 'registrar', 'independent-browser session remains Registrar');
    auth_isolation_assert(($graduateMe['json']['user']['role'] ?? null) === 'graduate', 'independent-browser session remains Graduate');

    $adminRefresh = auth_isolation_request($baseUrl . '/auth/check.php', $adminSession);
    $alumniRefresh = auth_isolation_request($baseUrl . '/auth/check.php', $alumniSession);
    $graduateRefresh = auth_isolation_request($baseUrl . '/graduate-auth/check.php', $graduateSession);
    auth_isolation_assert(($adminRefresh['json']['user']['id'] ?? null) === (int) $admin['id'], 'Admin identity survives refresh');
    auth_isolation_assert(($alumniRefresh['json']['user']['id'] ?? null) === (int) $alumniAdmin['id'], 'Alumni Admin identity survives refresh');
    auth_isolation_assert(($graduateRefresh['json']['user']['account_id'] ?? null) === $graduateAccountId, 'Graduate identity survives refresh');

    $alumniReports = auth_isolation_request($baseUrl . '/reports/index.php?type=overview', $alumniSession);
    $adminModeration = auth_isolation_request($baseUrl . '/forum/moderation.php', $adminSession);
    $registrarUsers = auth_isolation_request($baseUrl . '/users/index.php', $registrarSession);
    auth_isolation_assert($alumniReports['status'] === 403, 'Alumni Admin is forbidden from Admin reports API');
    auth_isolation_assert($adminModeration['status'] === 403, 'Admin is forbidden from Alumni Admin moderation API');
    auth_isolation_assert($registrarUsers['status'] === 403, 'Registrar is forbidden from Super Admin user API');

    $logout = auth_isolation_request($baseUrl . '/auth/logout.php', $adminSession, 'POST');
    $adminAfterLogout = auth_isolation_request($baseUrl . '/auth/check.php', $adminSession);
    $alumniAfterOtherLogout = auth_isolation_request($baseUrl . '/auth/check.php', $alumniSession);
    $graduateAfterOtherLogout = auth_isolation_request($baseUrl . '/graduate-auth/check.php', $graduateSession);
    auth_isolation_assert($logout['status'] === 200, 'Admin logout succeeds');
    auth_isolation_assert(empty($adminAfterLogout['json']['authenticated']), 'logout invalidates only the presented Admin session');
    auth_isolation_assert(($alumniAfterOtherLogout['json']['user']['role'] ?? null) === 'alumni_admin', 'Alumni Admin remains signed in after another session logs out');
    auth_isolation_assert(($graduateAfterOtherLogout['json']['user']['role'] ?? null) === 'graduate', 'Graduate remains signed in after another session logs out');
}

$anonymous = auth_isolation_request($baseUrl . '/auth/check.php');
$headerText = implode("\n", $anonymous['headers']);
auth_isolation_assert(stripos($headerText, 'Set-Cookie: ' . $cookieName . '=') !== false, 'API uses the GradTrack-specific session cookie name');
auth_isolation_assert(stripos($headerText, 'HttpOnly') !== false, 'session cookie is HttpOnly');
auth_isolation_assert(stripos($headerText, 'SameSite=Lax') !== false, 'development session cookie uses SameSite=Lax');
auth_isolation_assert(stripos($headerText, 'Cache-Control: no-store') !== false, 'authentication responses cannot be shared-cached');

auth_isolation_cleanup();
auth_isolation_remove_temporary_admin($db, $temporaryAdminId);
$fixtureCleanupCheck = $db->prepare('SELECT COUNT(*) FROM admin_users WHERE id = :id');
$fixtureCleanupCheck->execute([':id' => $temporaryAdminId]);
auth_isolation_assert((int) $fixtureCleanupCheck->fetchColumn() === 0, 'the disposable live-login account is removed after the test');
$temporaryAdminId = 0;
$cleanupFinished = true;

if ($failures > 0) {
    echo PHP_EOL . $failures . ' authentication/session isolation test(s) failed.' . PHP_EOL;
    ob_end_flush();
    exit(1);
}

echo PHP_EOL . 'All authentication/session isolation tests passed.' . PHP_EOL;
ob_end_flush();
