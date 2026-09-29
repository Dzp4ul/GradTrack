<?php
declare(strict_types=1);

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';

$db = (new Database())->getConnection();
$baseUrl = rtrim((string) (getenv('GRADTRACK_HTTP_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();
$failures = 0;
$graduateId = $accountId = $jobId = 0;
$sessionId = null;

function saved_jobs_http_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function saved_jobs_http_request(string $path, string $sessionId, string $csrfToken = '', string $method = 'GET', ?array $body = null): array
{
    global $baseUrl, $cookieName;
    $headers = [
        'Accept: application/json',
        'Origin: http://localhost:5173',
        'Cookie: ' . $cookieName . '=' . rawurlencode($sessionId),
    ];
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
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $match) === 1) {
            $status = (int) $match[1];
            break;
        }
    }
    return ['status' => $status, 'json' => is_string($raw) ? json_decode($raw, true) : null];
}

function saved_jobs_http_cleanup(): void
{
    global $db, $graduateId, $accountId, $jobId, $sessionId;
    try {
        if ($accountId > 0 && $jobId > 0) {
            $db->prepare('DELETE FROM saved_jobs WHERE graduate_account_id = :account_id AND job_post_id = :job_id')
                ->execute([':account_id' => $accountId, ':job_id' => $jobId]);
        }
        if ($jobId > 0) $db->prepare('DELETE FROM job_posts WHERE id = :id')->execute([':id' => $jobId]);
        if ($accountId > 0) $db->prepare('DELETE FROM graduate_accounts WHERE id = :id')->execute([':id' => $accountId]);
        if ($graduateId > 0) $db->prepare('DELETE FROM graduates WHERE id = :id')->execute([':id' => $graduateId]);
    } catch (Throwable $error) {
        echo 'CLEANUP WARNING: ' . $error->getMessage() . PHP_EOL;
    }

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

$cleanupFinished = false;
register_shutdown_function(static function () use (&$cleanupFinished): void {
    if (!$cleanupFinished) saved_jobs_http_cleanup();
});

try {
    if (@file_get_contents($baseUrl . '/csrf.php', false, stream_context_create(['http' => ['ignore_errors' => true, 'timeout' => 10]])) === false) {
        throw new RuntimeException('Test API is not reachable at ' . $baseUrl);
    }

    $suffix = bin2hex(random_bytes(5));
    $programId = (int) $db->query('SELECT id FROM programs ORDER BY id LIMIT 1')->fetchColumn();
    if ($programId <= 0) throw new RuntimeException('At least one program is required.');

    $graduateStmt = $db->prepare("INSERT INTO graduates
        (student_id, first_name, last_name, email, program_id, year_graduated, status)
        VALUES (:student_id, 'Saved', 'Jobs Test', :email, :program_id, 2025, 'active')");
    $graduateStmt->execute([
        ':student_id' => 'SAVE-' . strtoupper($suffix),
        ':email' => 'saved-jobs-' . $suffix . '@example.invalid',
        ':program_id' => $programId,
    ]);
    $graduateId = (int) $db->lastInsertId();

    $accountStmt = $db->prepare("INSERT INTO graduate_accounts
        (graduate_id, email, password_hash, status, alumni_verification_status, alumni_verification_submitted_at, alumni_verification_reviewed_at)
        VALUES (:graduate_id, :email, :password, 'active', 'approved', NOW(), NOW())");
    $accountStmt->execute([
        ':graduate_id' => $graduateId,
        ':email' => 'saved-jobs-' . $suffix . '@example.invalid',
        ':password' => password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT),
    ]);
    $accountId = (int) $db->lastInsertId();

    $jobStmt = $db->prepare("INSERT INTO job_posts
        (posted_by_account_id, title, company, description, application_deadline, is_active, approval_status, approval_reviewed_at)
        VALUES (:account_id, :title, 'Saved Jobs Test Company', 'HTTP persistence test', DATE_ADD(CURDATE(), INTERVAL 30 DAY), 1, 'approved', NOW())");
    $jobStmt->execute([':account_id' => $accountId, ':title' => 'Saved Jobs HTTP ' . $suffix]);
    $jobId = (int) $db->lastInsertId();

    ini_set('session.use_strict_mode', '0');
    $sessionId = 'sj' . bin2hex(random_bytes(18));
    session_id($sessionId);
    session_start();
    $csrfToken = bin2hex(random_bytes(32));
    $_SESSION = ['graduate_account_id' => $accountId, 'csrf_token' => $csrfToken];
    session_write_close();

    $save = saved_jobs_http_request('jobs/saved.php', $sessionId, $csrfToken, 'POST', ['job_id' => $jobId]);
    saved_jobs_http_assert($save['status'] === 200 && !empty($save['json']['data']['is_saved']), 'authenticated Save creates the bookmark through the API');

    $refresh = saved_jobs_http_request('jobs/saved.php', $sessionId);
    $savedIds = array_map('intval', array_column($refresh['json']['data'] ?? [], 'id'));
    saved_jobs_http_assert($refresh['status'] === 200 && in_array($jobId, $savedIds, true), 'the saved job remains present after a fresh API load');

    saved_jobs_http_request('jobs/saved.php', $sessionId, $csrfToken, 'POST', ['job_id' => $jobId]);
    $countStmt = $db->prepare('SELECT COUNT(*) FROM saved_jobs WHERE graduate_account_id = :account_id AND job_post_id = :job_id');
    $countStmt->execute([':account_id' => $accountId, ':job_id' => $jobId]);
    saved_jobs_http_assert((int) $countStmt->fetchColumn() === 1, 'repeated Save requests do not create duplicate records');

    $remove = saved_jobs_http_request('jobs/saved.php?job_id=' . $jobId, $sessionId, $csrfToken, 'DELETE');
    saved_jobs_http_assert($remove['status'] === 200 && empty($remove['json']['data']['is_saved']), 'authenticated Unsave removes the bookmark through the API');

    $afterRemove = saved_jobs_http_request('jobs/saved.php', $sessionId);
    $remainingIds = array_map('intval', array_column($afterRemove['json']['data'] ?? [], 'id'));
    saved_jobs_http_assert(!in_array($jobId, $remainingIds, true), 'the removed job is absent from a fresh Saved Jobs load');
} catch (Throwable $error) {
    saved_jobs_http_assert(false, 'HTTP integration completed without an exception: ' . $error->getMessage());
}

saved_jobs_http_cleanup();
$cleanupFinished = true;
if ($failures > 0) {
    echo PHP_EOL . $failures . ' Saved Jobs HTTP integration test(s) failed.' . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'Saved Jobs HTTP integration test passed.' . PHP_EOL;
