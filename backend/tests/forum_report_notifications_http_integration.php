<?php
declare(strict_types=1);

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';

$db = (new Database())->getConnection();
$baseUrl = rtrim((string) (getenv('GRADTRACK_HTTP_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();
$sessions = [];
$csrfTokens = [];
$postId = 0;
$reportId = 0;
$notificationKeys = [];
$accountIds = [];
$failures = 0;

function forum_report_http_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function forum_report_http_session(int $accountId): string
{
    global $sessions;
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    ini_set('session.use_strict_mode', '0');
    $sessionId = 'gtf' . bin2hex(random_bytes(18));
    session_id($sessionId);
    session_start();
    $_SESSION = ['graduate_account_id' => $accountId, 'authenticated_at' => time()];
    session_write_close();
    $sessions[] = $sessionId;
    return $sessionId;
}

function forum_report_http_request(string $path, string $sessionId, string $method = 'GET', ?array $body = null): array
{
    global $baseUrl, $cookieName, $csrfTokens;
    $headers = [
        'Accept: application/json',
        'Origin: http://localhost:5173',
        'Cookie: ' . $cookieName . '=' . rawurlencode($sessionId),
    ];
    if ($method !== 'GET') {
        if (!isset($csrfTokens[$sessionId])) {
            $csrf = forum_report_http_request('csrf.php', $sessionId);
            $csrfTokens[$sessionId] = (string) ($csrf['json']['csrf_token'] ?? '');
        }
        $headers[] = 'X-CSRF-Token: ' . $csrfTokens[$sessionId];
    }
    if ($body !== null) $headers[] = 'Content-Type: application/json';

    $context = stream_context_create(['http' => [
        'method' => $method,
        'header' => implode("\r\n", $headers),
        'content' => $body !== null ? json_encode($body) : '',
        'ignore_errors' => true,
        'timeout' => 60,
    ]]);
    $raw = @file_get_contents($baseUrl . '/' . ltrim($path, '/'), false, $context);
    $status = 0;
    foreach (($http_response_header ?? []) as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $matches) === 1) {
            $status = (int) $matches[1];
            break;
        }
    }
    return [
        'status' => $status,
        'json' => is_string($raw) ? json_decode($raw, true) : null,
    ];
}

function forum_report_http_find_notification(array $response, int $reportId): ?array
{
    foreach (($response['json']['data']['notifications'] ?? []) as $notification) {
        if (($notification['type'] ?? '') === 'forum_report'
            && str_contains((string) ($notification['link'] ?? ''), 'report_id=' . $reportId)) {
            return $notification;
        }
    }
    return null;
}

function forum_report_http_cleanup(): void
{
    global $db, $sessions, $postId, $reportId, $notificationKeys, $accountIds;
    try {
        foreach ($notificationKeys as $key) {
            foreach ($accountIds as $accountId) {
                $stmt = $db->prepare("DELETE FROM notification_reads
                                      WHERE target_type = 'graduate'
                                        AND target_id = :target_id
                                        AND notification_key = :notification_key");
                $stmt->execute([':target_id' => $accountId, ':notification_key' => $key]);
            }
        }
        if ($reportId > 0) $db->prepare('DELETE FROM forum_reports WHERE id = :id')->execute([':id' => $reportId]);
        if ($postId > 0) $db->prepare('DELETE FROM forum_posts WHERE id = :id')->execute([':id' => $postId]);
    } catch (Throwable $error) {
        echo 'CLEANUP WARNING: ' . $error->getMessage() . PHP_EOL;
    }
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

register_shutdown_function('forum_report_http_cleanup');

try {
    $principals = $db->query("SELECT ga.id AS account_id, ga.graduate_id
                              FROM graduate_accounts ga
                              JOIN graduates g ON g.id = ga.graduate_id
                              WHERE ga.status = 'active'
                                AND ga.alumni_verification_status = 'approved'
                                AND g.archived_at IS NULL
                              ORDER BY ga.id
                              LIMIT 3")->fetchAll(PDO::FETCH_ASSOC);
    forum_report_http_assert(count($principals) === 3, 'three active Graduate principals are available');
    if (count($principals) < 3) throw new RuntimeException('Three active Graduate principals are required.');

    [$owner, $reporter, $unrelated] = $principals;
    $accountIds = array_map(static fn (array $row): int => (int) $row['account_id'], $principals);
    $moderatorId = (int) ($db->query("SELECT id FROM admin_users WHERE role = 'alumni_president' AND is_active = 1 ORDER BY id LIMIT 1")->fetchColumn() ?: 0);
    forum_report_http_assert($moderatorId > 0, 'an active Alumni President moderator is available');

    $suffix = bin2hex(random_bytes(5));
    $postStmt = $db->prepare("INSERT INTO forum_posts (graduate_id, title, content, category, status)
                              VALUES (:graduate_id, :title, :content, 'General Discussion', 'approved')");
    $postStmt->execute([
        ':graduate_id' => (int) $owner['graduate_id'],
        ':title' => 'Moderation notification test ' . $suffix,
        ':content' => 'Fixture content for report notification authorization.',
    ]);
    $postId = (int) $db->lastInsertId();

    $reportStmt = $db->prepare("INSERT INTO forum_reports
        (reporter_graduate_id, target_type, post_id, reason, description, status, reviewed_at, reviewed_by)
        VALUES (:reporter, 'post', :post_id, 'Test report', 'Integration test', 'resolved', NOW(), :reviewed_by)");
    $reportStmt->execute([
        ':reporter' => (int) $reporter['graduate_id'],
        ':post_id' => $postId,
        ':reviewed_by' => $moderatorId,
    ]);
    $reportId = (int) $db->lastInsertId();
    $db->prepare("UPDATE forum_posts SET status = 'hidden' WHERE id = :id")->execute([':id' => $postId]);

    $ownerSession = forum_report_http_session((int) $owner['account_id']);
    $reporterSession = forum_report_http_session((int) $reporter['account_id']);
    $unrelatedSession = forum_report_http_session((int) $unrelated['account_id']);

    $reporterDetail = forum_report_http_request('forum/reports.php?id=' . $reportId, $reporterSession);
    $ownerDetail = forum_report_http_request('forum/reports.php?id=' . $reportId, $ownerSession);
    $unrelatedDetail = forum_report_http_request('forum/reports.php?id=' . $reportId, $unrelatedSession);
    forum_report_http_assert($reporterDetail['status'] === 200 && ($reporterDetail['json']['data']['viewer_relation'] ?? '') === 'reporter', 'reporter can open only their report detail');
    forum_report_http_assert($ownerDetail['status'] === 200 && ($ownerDetail['json']['data']['viewer_relation'] ?? '') === 'reported_user', 'reported content owner can open the report detail');
    forum_report_http_assert($unrelatedDetail['status'] === 403, 'unrelated Graduate receives 403 for the report detail');

    $reporterNotifications = forum_report_http_request('notifications/index.php?audience=graduate&limit=50', $reporterSession);
    $ownerNotifications = forum_report_http_request('notifications/index.php?audience=graduate&limit=50', $ownerSession);
    $reporterNotification = forum_report_http_find_notification($reporterNotifications, $reportId);
    $ownerNotification = forum_report_http_find_notification($ownerNotifications, $reportId);
    forum_report_http_assert(
        $reporterNotification !== null && ($reporterNotification['title'] ?? '') === 'Report reviewed',
        'reporter receives the reviewed/action-taken notification'
    );
    forum_report_http_assert(
        $ownerNotification !== null && ($ownerNotification['title'] ?? '') === 'Content hidden after moderation',
        'reported user receives the hidden-content notification'
    );

    if ($reporterNotification !== null) {
        $notificationKeys[] = (string) $reporterNotification['key'];
        $markRead = forum_report_http_request('notifications/index.php?audience=graduate', $reporterSession, 'POST', [
            'action' => 'mark_read',
            'key' => (string) $reporterNotification['key'],
        ]);
        $updatedNotification = forum_report_http_find_notification($markRead, $reportId);
        forum_report_http_assert($markRead['status'] === 200 && !empty($updatedNotification['read']), 'click workflow can mark the report notification as read');
    }
    if ($ownerNotification !== null) $notificationKeys[] = (string) $ownerNotification['key'];
} catch (Throwable $error) {
    forum_report_http_assert(false, $error->getMessage());
}

forum_report_http_cleanup();
if ($failures > 0) {
    echo PHP_EOL . "{$failures} forum report notification test(s) failed." . PHP_EOL;
    ob_end_flush();
    exit(1);
}

echo PHP_EOL . 'All forum report notification tests passed.' . PHP_EOL;
ob_end_flush();
