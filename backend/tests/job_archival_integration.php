<?php
declare(strict_types=1);

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';
require_once __DIR__ . '/../api/config/engagement_approval.php';

$db = (new Database())->getConnection();
gradtrack_ensure_engagement_approval_schema($db);
$baseUrl = rtrim((string)(getenv('GRADTRACK_HTTP_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();
$failures = 0;
$adminId = $graduateId = $accountId = $jobId = 0;
$adminSessionId = $graduateSessionId = null;

function job_archive_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function job_archive_request(string $path, string $sessionId, string $csrfToken = '', string $method = 'GET', ?array $body = null): array
{
    global $baseUrl, $cookieName;
    $headers = ['Accept: application/json', 'Origin: http://localhost:5173', 'Cookie: ' . $cookieName . '=' . rawurlencode($sessionId)];
    if ($csrfToken !== '') $headers[] = 'X-CSRF-Token: ' . $csrfToken;
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

function job_archive_destroy_session(?string $sessionId): void
{
    if ($sessionId === null) return;
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    ini_set('session.use_strict_mode', '0');
    session_id($sessionId);
    if (@session_start()) { $_SESSION = []; session_destroy(); }
}

function job_archive_cleanup(): void
{
    global $db, $adminId, $graduateId, $accountId, $jobId, $adminSessionId, $graduateSessionId;
    try {
        if ($jobId > 0) {
            $db->prepare('DELETE FROM job_applications WHERE job_post_id = :id')->execute([':id' => $jobId]);
            $db->prepare('DELETE FROM job_posts WHERE id = :id')->execute([':id' => $jobId]);
        }
        if ($adminId > 0) $db->prepare('DELETE FROM audit_trail WHERE user_id = :id')->execute([':id' => $adminId]);
        if ($accountId > 0) $db->prepare('DELETE FROM graduate_accounts WHERE id = :id')->execute([':id' => $accountId]);
        if ($graduateId > 0) $db->prepare('DELETE FROM graduates WHERE id = :id')->execute([':id' => $graduateId]);
        if ($adminId > 0) $db->prepare('DELETE FROM admin_users WHERE id = :id')->execute([':id' => $adminId]);
    } catch (Throwable $error) {
        echo 'CLEANUP WARNING: ' . $error->getMessage() . PHP_EOL;
    }
    job_archive_destroy_session($adminSessionId);
    job_archive_destroy_session($graduateSessionId);
}

$cleanupFinished = false;
register_shutdown_function(static function () use (&$cleanupFinished): void { if (!$cleanupFinished) job_archive_cleanup(); });

try {
    if (@file_get_contents($baseUrl . '/csrf.php', false, stream_context_create(['http' => ['ignore_errors' => true, 'timeout' => 10]])) === false) {
        throw new RuntimeException('Test API is not reachable at ' . $baseUrl);
    }
    $suffix = bin2hex(random_bytes(5));
    $programId = (int)$db->query('SELECT id FROM programs ORDER BY id LIMIT 1')->fetchColumn();
    if ($programId <= 0) throw new RuntimeException('At least one program is required.');

    $adminStmt = $db->prepare("INSERT INTO admin_users (username, email, password, full_name, role, is_active) VALUES (:username, :email, :password, 'Job Archive Test', 'alumni_president', 1)");
    $adminStmt->execute([
        ':username' => 'job_archive_' . $suffix,
        ':email' => 'job-archive-admin-' . $suffix . '@example.invalid',
        ':password' => password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT),
    ]);
    $adminId = (int)$db->lastInsertId();

    $graduateStmt = $db->prepare("INSERT INTO graduates (student_id, first_name, last_name, email, program_id, year_graduated, status) VALUES (:student_id, 'Archive', 'Graduate', :email, :program_id, 2025, 'active')");
    $graduateStmt->execute([
        ':student_id' => 'ARCH-' . strtoupper($suffix),
        ':email' => 'job-archive-graduate-' . $suffix . '@example.invalid',
        ':program_id' => $programId,
    ]);
    $graduateId = (int)$db->lastInsertId();
    $accountStmt = $db->prepare("INSERT INTO graduate_accounts (graduate_id, email, password_hash, status, alumni_verification_status, alumni_verification_submitted_at, alumni_verification_reviewed_at, last_login_at) VALUES (:graduate_id, :email, :password, 'active', 'approved', NOW(), NOW(), NOW())");
    $accountStmt->execute([
        ':graduate_id' => $graduateId,
        ':email' => 'job-archive-graduate-' . $suffix . '@example.invalid',
        ':password' => password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT),
    ]);
    $accountId = (int)$db->lastInsertId();

    $jobTitle = 'Archive Integration ' . $suffix;
    $jobStmt = $db->prepare("INSERT INTO job_posts (posted_by_account_id, title, company, description, contact_email, application_deadline, is_active, approval_status, approval_reviewed_by, approval_reviewed_at) VALUES (:account_id, :title, 'GradTrack Test Company', 'Integration test record', :email, DATE_ADD(CURDATE(), INTERVAL 30 DAY), 1, 'approved', :admin_id, NOW())");
    $jobStmt->execute([
        ':account_id' => $accountId, ':title' => $jobTitle,
        ':email' => 'jobs-' . $suffix . '@example.invalid', ':admin_id' => $adminId,
    ]);
    $jobId = (int)$db->lastInsertId();

    ini_set('session.use_strict_mode', '0');
    $adminSessionId = 'ja' . bin2hex(random_bytes(18));
    session_id($adminSessionId); session_start();
    $adminCsrf = bin2hex(random_bytes(32));
    $_SESSION = ['admin_user_id' => $adminId, 'csrf_token' => $adminCsrf]; session_write_close();
    $graduateSessionId = 'jg' . bin2hex(random_bytes(18));
    session_id($graduateSessionId); session_start();
    $_SESSION = ['graduate_account_id' => $accountId, 'csrf_token' => bin2hex(random_bytes(32))]; session_write_close();

    $visibleBefore = job_archive_request('jobs/posts.php?id=' . $jobId, $graduateSessionId);
    job_archive_assert($visibleBefore['status'] === 200 && !empty($visibleBefore['json']['success']), 'approved job is visible to a graduate before archival');

    $archive = job_archive_request('moderation/approvals.php', $adminSessionId, $adminCsrf, 'PUT', ['item_type' => 'job', 'id' => $jobId, 'action' => 'archive']);
    job_archive_assert($archive['status'] === 200 && !empty($archive['json']['success']), 'Alumni President can archive an approved job');
    $stored = $db->query('SELECT archived_at, approval_status FROM job_posts WHERE id = ' . $jobId)->fetch(PDO::FETCH_ASSOC);
    job_archive_assert(!empty($stored['archived_at']) && ($stored['approval_status'] ?? '') === 'approved', 'archival preserves the approved job record');

    $direct = job_archive_request('jobs/posts.php?id=' . $jobId, $graduateSessionId);
    job_archive_assert($direct['status'] === 404, 'archived direct job API access is hidden from graduates');
    $list = job_archive_request('jobs/posts.php?search=' . rawurlencode($jobTitle), $graduateSessionId);
    $listedIds = array_map('intval', array_column($list['json']['data'] ?? [], 'id'));
    job_archive_assert($list['status'] === 200 && !in_array($jobId, $listedIds, true), 'archived job is excluded from graduate search and listings');

    $archivedAdmin = job_archive_request('moderation/approvals.php?status=archived&search=' . rawurlencode($jobTitle), $adminSessionId, $adminCsrf);
    $archivedIds = array_map('intval', array_column($archivedAdmin['json']['data']['jobs'] ?? [], 'id'));
    job_archive_assert($archivedAdmin['status'] === 200 && in_array($jobId, $archivedIds, true), 'archived job remains available in administrative history');

    $restore = job_archive_request('moderation/approvals.php', $adminSessionId, $adminCsrf, 'PUT', ['item_type' => 'job', 'id' => $jobId, 'action' => 'restore']);
    job_archive_assert($restore['status'] === 200 && !empty($restore['json']['success']), 'eligible archived job can be restored');
    $visibleAfter = job_archive_request('jobs/posts.php?id=' . $jobId, $graduateSessionId);
    job_archive_assert($visibleAfter['status'] === 200 && !empty($visibleAfter['json']['success']), 'restored job is visible to graduates again');
} catch (Throwable $error) {
    job_archive_assert(false, 'integration test completed without an exception: ' . $error->getMessage());
}

job_archive_cleanup();
$cleanupFinished = true;
if ($failures > 0) {
    echo PHP_EOL . $failures . ' job archival integration test(s) failed.' . PHP_EOL;
    exit(1);
}
echo PHP_EOL . 'All job archival integration tests passed.' . PHP_EOL;
