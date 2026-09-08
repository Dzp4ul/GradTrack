<?php
declare(strict_types=1);

define('GRADTRACK_CHAT_MESSAGES_LIBRARY_ONLY', true);
$_SERVER['REQUEST_METHOD'] = 'CLI';
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/forum/chat-messages.php';

function direct_first_message_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
    echo 'PASS: ' . $message . PHP_EOL;
}

$db = (new Database())->getConnection();
$graduates = $db->query("SELECT account.graduate_id
                          FROM graduate_accounts account
                          JOIN graduates graduate ON graduate.id = account.graduate_id
                          WHERE account.status = 'active'
                            AND account.alumni_verification_status = 'approved'
                            AND graduate.status = 'active'
                          ORDER BY account.graduate_id ASC
                          LIMIT 2")
    ->fetchAll(PDO::FETCH_COLUMN);

if (count($graduates) < 2) {
    echo 'SKIP: Two active approved graduate accounts are required.' . PHP_EOL;
    exit(0);
}

$senderId = (int) $graduates[0];
$recipientId = (int) $graduates[1];
$pairKey = gradtrack_chat_direct_pair_key($senderId, $recipientId);
$beforeRoomId = gradtrack_chat_find_direct_room($db, $senderId, $recipientId);
$firstClientId = 'direct-first-test-' . bin2hex(random_bytes(10));
$secondClientId = 'direct-race-test-' . bin2hex(random_bytes(10));

$db->beginTransaction();
try {
    $firstMessages = gradtrack_forum_chat_messages_insert(
        $db,
        0,
        $senderId,
        'First direct message transaction test',
        $firstClientId,
        [],
        $recipientId
    );
    $roomId = (int) ($firstMessages[0]['room_id'] ?? 0);
    direct_first_message_assert($roomId > 0, 'first send resolves a persistent direct room');

    $memberStmt = $db->prepare('SELECT COUNT(DISTINCT graduate_id) FROM forum_chat_members WHERE room_id = :room_id');
    $memberStmt->execute([':room_id' => $roomId]);
    direct_first_message_assert((int) $memberStmt->fetchColumn() === 2, 'resolved direct room has exactly two participants');

    $keyStmt = $db->prepare('SELECT direct_pair_key FROM forum_chat_rooms WHERE id = :room_id');
    $keyStmt->execute([':room_id' => $roomId]);
    direct_first_message_assert($keyStmt->fetchColumn() === $pairKey, 'direct room stores the normalized canonical pair key');

    $secondMessages = gradtrack_forum_chat_messages_insert(
        $db,
        0,
        $senderId,
        'Concurrent-style second first request',
        $secondClientId,
        [],
        $recipientId
    );
    direct_first_message_assert(
        (int) ($secondMessages[0]['room_id'] ?? 0) === $roomId,
        'a second first-message request resolves to the same direct room'
    );

    $pairStmt = $db->prepare('SELECT COUNT(*) FROM forum_chat_rooms WHERE direct_pair_key = :direct_pair_key');
    $pairStmt->execute([':direct_pair_key' => $pairKey]);
    direct_first_message_assert((int) $pairStmt->fetchColumn() === 1, 'the database unique pair key permits only one canonical direct room');

    $stagedName = 'direct-staged-' . bin2hex(random_bytes(8)) . '.png';
    $stagedAttachmentStmt = $db->prepare("INSERT INTO forum_chat_message_attachments
        (room_id, message_id, uploaded_by, original_name, stored_name, storage_path, mime_type, file_size, attachment_type)
        VALUES (NULL, NULL, :uploaded_by, 'first-message.png', :stored_name, :storage_path, 'image/png', 128, 'image')");
    $stagedAttachmentStmt->execute([
        ':uploaded_by' => $senderId,
        ':stored_name' => $stagedName,
        ':storage_path' => 'staging/chat/direct/' . $senderId . '/' . $stagedName,
    ]);
    $stagedAttachmentId = (int) $db->lastInsertId();
    $attachmentMessages = gradtrack_forum_chat_messages_insert(
        $db,
        0,
        $senderId,
        '',
        'direct-attachment-test-' . bin2hex(random_bytes(8)),
        [$stagedAttachmentId],
        $recipientId
    );
    $claimedAttachmentStmt = $db->prepare('SELECT room_id, message_id FROM forum_chat_message_attachments WHERE id = :id');
    $claimedAttachmentStmt->execute([':id' => $stagedAttachmentId]);
    $claimedAttachment = $claimedAttachmentStmt->fetch(PDO::FETCH_ASSOC);
    direct_first_message_assert(
        (int) ($claimedAttachment['room_id'] ?? 0) === $roomId
        && (int) ($claimedAttachment['message_id'] ?? 0) === (int) ($attachmentMessages[0]['id'] ?? 0),
        'a staged first-message attachment is claimed by the resolved direct room and saved message'
    );

    try {
        gradtrack_forum_chat_messages_insert(
            $db,
            0,
            $senderId,
            '',
            'direct-empty-test-' . bin2hex(random_bytes(8)),
            [],
            $recipientId
        );
        throw new RuntimeException('An empty first message was unexpectedly accepted');
    } catch (GradtrackChatMessageRequestException $error) {
        direct_first_message_assert($error->getStatusCode() === 400, 'an empty first send is rejected before it can create a conversation');
    }

    $db->rollBack();
    direct_first_message_assert(
        gradtrack_chat_find_direct_room($db, $senderId, $recipientId) === $beforeRoomId,
        'integration test rollback leaves existing production conversations unchanged'
    );
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    fwrite(STDERR, 'FAIL: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}

echo PHP_EOL . 'Direct first-message integration test passed.' . PHP_EOL;
