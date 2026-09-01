<?php

define('GRADTRACK_NOTIFICATIONS_LIBRARY_ONLY', true);
$_SERVER['REQUEST_METHOD'] = 'CLI';
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/notifications/index.php';

function gradtrack_job_notification_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
    echo 'PASS: ' . $message . PHP_EOL;
}

$database = new Database();
$db = $database->getConnection();

try {
    gradtrack_notifications_ensure_schema($db);
    $fixtureStmt = $db->query("SELECT account.id AS account_id, account.graduate_id
                               FROM graduate_accounts account
                               WHERE EXISTS (
                                   SELECT 1 FROM job_posts own_job
                                   WHERE own_job.posted_by_account_id = account.id
                               )
                                 AND EXISTS (
                                   SELECT 1 FROM job_posts available_job
                                   WHERE available_job.posted_by_account_id <> account.id
                                     AND available_job.approval_status = 'approved'
                                     AND COALESCE(available_job.is_active, 1) = 1
                               )
                               ORDER BY account.id
                               LIMIT 1");
    $fixture = $fixtureStmt->fetch(PDO::FETCH_ASSOC);
    if (!$fixture) {
        throw new RuntimeException('No graduate with both owned and available job notification fixtures is available');
    }

    $auth = [
        'target_type' => 'graduate',
        'target_id' => (int) $fixture['account_id'],
        'role' => 'graduate',
        'user' => [
            'account_id' => (int) $fixture['account_id'],
            'graduate_id' => (int) $fixture['graduate_id'],
        ],
    ];
    $notifications = gradtrack_notifications_generate($db, $auth);
    $jobNotifications = array_values(array_filter(
        $notifications,
        fn(array $notification): bool => in_array(
            gradtrack_notifications_category($notification),
            ['browse_jobs', 'job_posting'],
            true
        )
    ));
    $categories = array_values(array_unique(array_map('gradtrack_notifications_category', $jobNotifications)));
    gradtrack_job_notification_test_assert(in_array('browse_jobs', $categories, true), 'approved opportunities map to the Browse Jobs badge');
    gradtrack_job_notification_test_assert(in_array('job_posting', $categories, true), 'owned job status events map to the Job Posting badge');

    $db->beginTransaction();
    $deleteStmt = $db->prepare("DELETE FROM notification_reads
                                WHERE target_type = 'graduate'
                                  AND target_id = :target_id
                                  AND notification_key = :notification_key");
    foreach ($jobNotifications as $notification) {
        $deleteStmt->execute([
            ':target_id' => $auth['target_id'],
            ':notification_key' => $notification['key'],
        ]);
    }

    $unreadPayload = gradtrack_notifications_apply_read_state($db, $auth, $notifications, 50);
    gradtrack_job_notification_test_assert($unreadPayload['unread_by_category']['browse_jobs'] > 0, 'Browse Jobs unread state is persisted by notification key');
    gradtrack_job_notification_test_assert($unreadPayload['unread_by_category']['job_posting'] > 0, 'Job Posting unread state is persisted by notification key');

    foreach (['browse_jobs', 'job_posting'] as $category) {
        $keys = array_map(
            fn(array $notification): string => (string) $notification['key'],
            array_values(array_filter(
                $notifications,
                fn(array $notification): bool => gradtrack_notifications_category($notification) === $category
            ))
        );
        gradtrack_notifications_mark_read($db, 'graduate', $auth['target_id'], $keys);
    }

    $readPayload = gradtrack_notifications_apply_read_state($db, $auth, $notifications, 50);
    gradtrack_job_notification_test_assert($readPayload['unread_by_category']['browse_jobs'] === 0, 'viewed Browse Jobs notifications stay read in the database');
    gradtrack_job_notification_test_assert($readPayload['unread_by_category']['job_posting'] === 0, 'viewed Job Posting status notifications stay read in the database');

    $db->rollBack();
    echo 'PASS: job-notification test transaction rolled back without changing notification history' . PHP_EOL;
} catch (Throwable $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    fwrite(STDERR, 'FAIL: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
