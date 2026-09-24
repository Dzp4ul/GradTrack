<?php
declare(strict_types=1);

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';

$db = (new Database())->getConnection();
$baseUrl = rtrim((string) (getenv('GRADTRACK_HTTP_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();
$sessions = [];
$failures = 0;

function coordinator_auth_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function coordinator_auth_role_id(PDO $db, string $role): int
{
    $stmt = $db->prepare('SELECT id FROM admin_users WHERE role = :role AND is_active = 1 ORDER BY id LIMIT 1');
    $stmt->execute([':role' => $role]);
    return (int) ($stmt->fetchColumn() ?: 0);
}

function coordinator_auth_session(array $identity): string
{
    global $sessions;
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    ini_set('session.use_strict_mode', '0');
    $sessionId = 'gtc' . bin2hex(random_bytes(18));
    session_id($sessionId);
    session_start();
    $_SESSION = $identity + ['authenticated_at' => time()];
    session_write_close();
    $sessions[] = $sessionId;
    return $sessionId;
}

function coordinator_auth_request(string $path, string $sessionId): int
{
    global $baseUrl, $cookieName;
    $context = stream_context_create(['http' => [
        'method' => 'GET',
        'header' => implode("\r\n", [
            'Accept: application/json',
            'Origin: http://localhost:5173',
            'Cookie: ' . $cookieName . '=' . rawurlencode($sessionId),
        ]),
        'ignore_errors' => true,
        'timeout' => 60,
    ]]);
    @file_get_contents($baseUrl . '/' . ltrim($path, '/'), false, $context);
    foreach (($http_response_header ?? []) as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $matches) === 1) return (int) $matches[1];
    }
    return 0;
}

function coordinator_auth_cleanup(): void
{
    global $sessions;
    foreach ($sessions as $sessionId) {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        ini_set('session.use_strict_mode', '0');
        session_id($sessionId);
        if (@session_start()) {
            $_SESSION = [];
            session_destroy();
        }
    }
    $sessions = [];
}

register_shutdown_function('coordinator_auth_cleanup');

$roleIds = [];
foreach (['admin', 'research_coordinator', 'alumni_president', 'dean_cs', 'registrar'] as $role) {
    $roleIds[$role] = coordinator_auth_role_id($db, $role);
    coordinator_auth_assert($roleIds[$role] > 0, "an active {$role} test principal exists");
}

$graduateAccountId = (int) ($db->query("SELECT id FROM graduate_accounts WHERE status = 'active' ORDER BY id LIMIT 1")->fetchColumn() ?: 0);
coordinator_auth_assert($graduateAccountId > 0, 'an active Graduate test principal exists');

if (!in_array(0, $roleIds, true) && $graduateAccountId > 0) {
    $roleSessions = [];
    foreach ($roleIds as $role => $id) $roleSessions[$role] = coordinator_auth_session(['admin_user_id' => $id]);
    $graduateSession = coordinator_auth_session(['graduate_account_id' => $graduateAccountId]);

    $administrativeEndpoints = [
        'users/index.php' => 'User Management',
        'research-coordinator/auto-reminders.php?action=status' => 'Auto Email Reminders',
        'get_audit_trail.php?limit=1' => 'Audit Trail',
        'backup/index.php?action=summary' => 'Backup Database',
        'settings/index.php?scope=admin' => 'System Settings',
    ];

    foreach ($administrativeEndpoints as $path => $label) {
        coordinator_auth_assert(
            coordinator_auth_request($path, $roleSessions['admin']) === 200,
            "Admin can access {$label} API"
        );
        coordinator_auth_assert(
            coordinator_auth_request($path, $roleSessions['research_coordinator']) === 403,
            "Research Coordinator receives 403 from {$label} API"
        );
        coordinator_auth_assert(
            coordinator_auth_request($path, $roleSessions['alumni_president']) === 403,
            "Alumni President receives 403 from {$label} API"
        );
        coordinator_auth_assert(
            coordinator_auth_request($path, $roleSessions['dean_cs']) === 403,
            "Dean receives 403 from {$label} API"
        );
        coordinator_auth_assert(
            in_array(coordinator_auth_request($path, $graduateSession), [401, 403], true),
            "Graduate cannot access {$label} API"
        );
    }

    foreach (['research_coordinator', 'alumni_president', 'dean_cs'] as $role) {
        coordinator_auth_assert(
            coordinator_auth_request('jobs/posts.php?mine=1', $roleSessions[$role]) === 200,
            "{$role} can access the job-posting API"
        );
    }
    coordinator_auth_assert(
        coordinator_auth_request('jobs/posts.php?mine=1', $roleSessions['registrar']) === 403,
        'Registrar receives 403 from the job-posting management API'
    );

}

coordinator_auth_cleanup();
if ($failures > 0) {
    echo PHP_EOL . "{$failures} Research Coordinator authorization test(s) failed." . PHP_EOL;
    ob_end_flush();
    exit(1);
}

echo PHP_EOL . 'All Research Coordinator authorization tests passed.' . PHP_EOL;
ob_end_flush();
