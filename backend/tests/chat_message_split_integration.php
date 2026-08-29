<?php

define('GRADTRACK_CHAT_MESSAGES_LIBRARY_ONLY', true);
$_SERVER['REQUEST_METHOD'] = 'CLI';
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/forum/chat-messages.php';

function gradtrack_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }

    echo 'PASS: ' . $message . PHP_EOL;
}

$database = new Database();
$db = $database->getConnection();

try {
    gradtrack_chat_prepare_schema($db);

    $fixtureStmt = $db->query("SELECT fcm.room_id, fcm.graduate_id
                               FROM forum_chat_members fcm
                               JOIN forum_chat_rooms room ON room.id = fcm.room_id
                               JOIN graduate_accounts account
                                 ON account.graduate_id = fcm.graduate_id
                                AND account.status = 'active'
                               ORDER BY fcm.room_id ASC, fcm.graduate_id ASC
                               LIMIT 1");
    $fixture = $fixtureStmt ? $fixtureStmt->fetch(PDO::FETCH_ASSOC) : false;
    if (!$fixture) {
        throw new RuntimeException('No authenticated chat member fixture is available');
    }

    $roomId = (int) $fixture['room_id'];
    $graduateId = (int) $fixture['graduate_id'];
    $clientMessageId = 'split-test-' . bin2hex(random_bytes(12));
    $storedName = 'split-test-' . bin2hex(random_bytes(12)) . '.png';
    $storagePath = 'uploads/chat-attachments/' . $roomId . '/' . $storedName;

    $db->beginTransaction();

    $attachmentStmt = $db->prepare("INSERT INTO forum_chat_message_attachments
        (room_id, uploaded_by, original_name, stored_name, storage_path, mime_type, file_size, attachment_type)
        VALUES (:room_id, :uploaded_by, :original_name, :stored_name, :storage_path, 'image/png', 68, 'image')");
    $attachmentStmt->execute([
        ':room_id' => $roomId,
        ':uploaded_by' => $graduateId,
        ':original_name' => 'split-test.png',
        ':stored_name' => $storedName,
        ':storage_path' => $storagePath,
    ]);
    $attachmentId = (int) $db->lastInsertId();

    $messages = gradtrack_forum_chat_messages_insert(
        $db,
        $roomId,
        $graduateId,
        'Ganda nung Spider-Man',
        $clientMessageId,
        [$attachmentId]
    );

    gradtrack_test_assert(count($messages) === 2, 'a caption plus image creates exactly two canonical messages');
    gradtrack_test_assert($messages[0]['message_type'] === 'text' && $messages[0]['message'] === 'Ganda nung Spider-Man', 'the caption is stored as a normal text message first');
    gradtrack_test_assert(count($messages[0]['attachments']) === 0, 'the text message does not retain attachment metadata');
    gradtrack_test_assert($messages[1]['message_type'] === 'image' && $messages[1]['message'] === '', 'the image is stored as a standalone attachment message second');
    gradtrack_test_assert(count($messages[1]['attachments']) === 1 && (int) $messages[1]['attachments'][0]['id'] === $attachmentId, 'the uploaded image belongs only to the standalone image message');
    gradtrack_test_assert((int) $messages[0]['id'] < (int) $messages[1]['id'], 'database IDs preserve caption-then-image ordering');

    $replayedMessages = gradtrack_forum_chat_messages_insert(
        $db,
        $roomId,
        $graduateId,
        'Ganda nung Spider-Man',
        $clientMessageId,
        [$attachmentId]
    );
    gradtrack_test_assert(
        count($replayedMessages) === 2
        && (int) $replayedMessages[0]['id'] === (int) $messages[0]['id']
        && (int) $replayedMessages[1]['id'] === (int) $messages[1]['id'],
        'replaying the client message ID returns the same two rows without duplication'
    );

    $db->rollBack();
    echo 'PASS: split-message test transaction rolled back without changing message history' . PHP_EOL;
} catch (Throwable $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    fwrite(STDERR, 'FAIL: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
