<?php

define('GRADTRACK_CHAT_MESSAGES_LIBRARY_ONLY', true);
$_SERVER['REQUEST_METHOD'] = 'CLI';
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/forum/chat-messages.php';

function gradtrack_unread_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }

    echo 'PASS: ' . $message . PHP_EOL;
}

function gradtrack_unread_test_count(PDO $db, int $graduateId, ?int $roomId = null): int
{
    $roomSql = $roomId ? ' AND member.room_id = :room_id' : '';
    $stmt = $db->prepare("SELECT COUNT(message.id)
                          FROM forum_chat_members member
                          JOIN forum_chat_messages message
                            ON message.room_id = member.room_id
                           AND message.graduate_id <> member.graduate_id
                           AND message.deleted_at IS NULL
                           AND message.id > COALESCE(member.last_read_message_id, 0)
                          WHERE member.graduate_id = :graduate_id{$roomSql}");
    $params = [':graduate_id' => $graduateId];
    if ($roomId) {
        $params[':room_id'] = $roomId;
    }
    $stmt->execute($params);
    return (int) $stmt->fetchColumn();
}

$database = new Database();
$db = $database->getConnection();

try {
    gradtrack_chat_ensure_schema($db);

    $fixtureStmt = $db->query("SELECT member.graduate_id
                               FROM forum_chat_members member
                               JOIN forum_chat_messages message
                                 ON message.room_id = member.room_id
                                AND message.graduate_id <> member.graduate_id
                                AND message.deleted_at IS NULL
                               GROUP BY member.graduate_id
                               HAVING COUNT(DISTINCT member.room_id) >= 2
                               ORDER BY member.graduate_id
                               LIMIT 1");
    $graduateId = (int) ($fixtureStmt->fetchColumn() ?: 0);
    if ($graduateId <= 0) {
        throw new RuntimeException('No graduate with incoming messages in two conversations is available');
    }

    $roomsStmt = $db->prepare("SELECT member.room_id, MAX(message.id) AS newest_incoming_id
                               FROM forum_chat_members member
                               JOIN forum_chat_messages message
                                 ON message.room_id = member.room_id
                                AND message.graduate_id <> member.graduate_id
                                AND message.deleted_at IS NULL
                               WHERE member.graduate_id = :graduate_id
                               GROUP BY member.room_id
                               ORDER BY member.room_id
                               LIMIT 2");
    $roomsStmt->execute([':graduate_id' => $graduateId]);
    $rooms = $roomsStmt->fetchAll(PDO::FETCH_ASSOC);
    gradtrack_unread_test_assert(count($rooms) === 2, 'fixture contains two independently readable conversations');

    $db->beginTransaction();
    $roomIds = array_map(fn(array $room): int => (int) $room['room_id'], $rooms);
    $placeholders = implode(',', array_fill(0, count($roomIds), '?'));
    $resetStmt = $db->prepare("UPDATE forum_chat_members
                               SET last_read_at = NULL, last_read_message_id = NULL
                               WHERE graduate_id = ? AND room_id IN ({$placeholders})");
    $resetStmt->execute(array_merge([$graduateId], $roomIds));

    $initialTotal = gradtrack_unread_test_count($db, $graduateId);
    $firstRoomUnread = gradtrack_unread_test_count($db, $graduateId, $roomIds[0]);
    $secondRoomUnread = gradtrack_unread_test_count($db, $graduateId, $roomIds[1]);
    gradtrack_unread_test_assert($firstRoomUnread > 0 && $secondRoomUnread > 0, 'both conversations begin with persisted unread messages');

    gradtrack_forum_chat_messages_mark_read($db, $roomIds[0], $graduateId, (int) $rooms[0]['newest_incoming_id']);
    gradtrack_unread_test_assert(
        gradtrack_unread_test_count($db, $graduateId) === $initialTotal - $firstRoomUnread,
        'reading conversation A removes only conversation A from the unified total'
    );
    gradtrack_unread_test_assert(
        gradtrack_unread_test_count($db, $graduateId, $roomIds[1]) === $secondRoomUnread,
        'conversation B remains unread after conversation A is read'
    );

    gradtrack_forum_chat_messages_mark_read($db, $roomIds[1], $graduateId, (int) $rooms[1]['newest_incoming_id']);
    gradtrack_unread_test_assert(
        gradtrack_unread_test_count($db, $graduateId) === $initialTotal - $firstRoomUnread - $secondRoomUnread,
        'reading conversation B removes its messages from the unified total'
    );

    $db->rollBack();
    echo 'PASS: unread-state test transaction rolled back without changing chat history or receipts' . PHP_EOL;
} catch (Throwable $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    fwrite(STDERR, 'FAIL: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
