<?php
declare(strict_types=1);

define('GRADTRACK_CHAT_MESSAGES_LIBRARY_ONLY', true);
define('GRADTRACK_NOTIFICATIONS_LIBRARY_ONLY', true);
$_SERVER['REQUEST_METHOD'] = 'CLI';
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/forum/chat-messages.php';
require_once __DIR__ . '/../api/notifications/index.php';

function job_save_share_assert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
    echo 'PASS: ' . $message . PHP_EOL;
}

$db = (new Database())->getConnection();

$graduates = $db->query("SELECT account.id AS account_id, account.graduate_id, graduate.year_graduated
                          FROM graduate_accounts account
                          JOIN graduates graduate ON graduate.id = account.graduate_id
                          WHERE account.status = 'active'
                            AND account.alumni_verification_status = 'approved'
                            AND graduate.status = 'active'
                          ORDER BY account.id
                          LIMIT 2")->fetchAll(PDO::FETCH_ASSOC);
$job = $db->query("SELECT id
                   FROM job_posts
                   WHERE approval_status = 'approved'
                     AND is_active = 1
                     AND archived_at IS NULL
                     AND (application_deadline IS NULL OR application_deadline >= CURDATE())
                   ORDER BY id DESC
                   LIMIT 1")->fetch(PDO::FETCH_ASSOC);

if (count($graduates) < 2 || !$job) {
    echo 'SKIP: Two active graduates and one visible job are required.' . PHP_EOL;
    exit(0);
}

$senderAccountId = (int) $graduates[0]['account_id'];
$senderGraduateId = (int) $graduates[0]['graduate_id'];
$recipientAccountId = (int) $graduates[1]['account_id'];
$recipientGraduateId = (int) $graduates[1]['graduate_id'];
$jobId = (int) $job['id'];
$clientId = 'job-share-test-' . bin2hex(random_bytes(10));

$db->beginTransaction();
try {
    $db->prepare('DELETE FROM saved_jobs WHERE graduate_account_id = :account_id AND job_post_id = :job_id')
        ->execute([':account_id' => $senderAccountId, ':job_id' => $jobId]);
    $saveStmt = $db->prepare('INSERT IGNORE INTO saved_jobs (graduate_account_id, job_post_id) VALUES (:account_id, :job_id)');
    $saveStmt->execute([':account_id' => $senderAccountId, ':job_id' => $jobId]);
    $saveStmt->execute([':account_id' => $senderAccountId, ':job_id' => $jobId]);
    $savedCountStmt = $db->prepare('SELECT COUNT(*) FROM saved_jobs WHERE graduate_account_id = :account_id AND job_post_id = :job_id');
    $savedCountStmt->execute([':account_id' => $senderAccountId, ':job_id' => $jobId]);
    job_save_share_assert((int) $savedCountStmt->fetchColumn() === 1, 'the account/job unique constraint prevents duplicate bookmarks');

    $first = gradtrack_forum_chat_messages_share_job(
        $db,
        $senderGraduateId,
        $recipientGraduateId,
        $jobId,
        'Integration test job share',
        $clientId
    );
    job_save_share_assert($first['message_type'] === 'job_share', 'job sharing creates a structured job_share message');
    job_save_share_assert((int) ($first['reference_id'] ?? 0) === $jobId, 'the structured message references the shared job');
    job_save_share_assert(!empty($first['job_share']['available']), 'a visible shared job is returned as available');

    $recipientNotifications = [];
    gradtrack_notifications_add_graduate($db, $recipientNotifications, [
        'account_id' => $recipientAccountId,
        'graduate_id' => $recipientGraduateId,
        'year_graduated' => $graduates[1]['year_graduated'] ?? null,
    ]);
    $shareNotification = array_values(array_filter(
        $recipientNotifications,
        static fn(array $notification): bool => ($notification['key'] ?? '') === 'job-share:' . (int) $first['id']
    ));
    job_save_share_assert(count($shareNotification) === 1, 'the recipient receives one notification for the shared job');
    job_save_share_assert(
        str_contains((string) ($shareNotification[0]['link'] ?? ''), 'room_id=' . (int) $first['room_id']),
        'the shared-job notification links to the reused conversation'
    );

    $replayed = gradtrack_forum_chat_messages_share_job(
        $db,
        $senderGraduateId,
        $recipientGraduateId,
        $jobId,
        'Integration test job share',
        $clientId
    );
    job_save_share_assert((int) $replayed['id'] === (int) $first['id'], 'replaying the client message ID does not duplicate a job share');

    $second = gradtrack_forum_chat_messages_share_job(
        $db,
        $senderGraduateId,
        $recipientGraduateId,
        $jobId,
        '',
        'job-share-test-' . bin2hex(random_bytes(10))
    );
    job_save_share_assert((int) $second['room_id'] === (int) $first['room_id'], 'job shares reuse the canonical existing direct conversation');

    $db->prepare('UPDATE job_posts SET archived_at = NOW() WHERE id = :id')->execute([':id' => $jobId]);
    $unavailable = gradtrack_forum_chat_messages_fetch_one($db, (int) $first['id'], $senderGraduateId);
    job_save_share_assert($unavailable !== null && empty($unavailable['job_share']['available']), 'an archived shared job is safely returned as unavailable');

    $db->rollBack();
    echo 'PASS: save/share integration transaction rolled back without changing production data' . PHP_EOL;
} catch (Throwable $error) {
    if ($db->inTransaction()) $db->rollBack();
    fwrite(STDERR, 'FAIL: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}

echo PHP_EOL . 'Saved Jobs and job sharing integration test passed.' . PHP_EOL;
