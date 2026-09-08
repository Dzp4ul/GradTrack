<?php
declare(strict_types=1);

return static function (PDO $db): void {
    gradtrack_migration_add_column(
        $db,
        'forum_chat_rooms',
        'direct_pair_key',
        'direct_pair_key VARCHAR(50) NULL AFTER is_group'
    );

    $attachmentColumn = $db->query("SHOW COLUMNS FROM forum_chat_message_attachments LIKE 'room_id'")
        ->fetch(PDO::FETCH_ASSOC);
    if ($attachmentColumn && strtoupper((string) ($attachmentColumn['Null'] ?? 'NO')) !== 'YES') {
        $db->exec('ALTER TABLE forum_chat_message_attachments MODIFY room_id INT NULL');
    }

    $db->beginTransaction();
    try {
        $rooms = $db->query("SELECT room.id,
                                MIN(member.graduate_id) AS first_graduate_id,
                                MAX(member.graduate_id) AS second_graduate_id,
                                COUNT(DISTINCT message.id) AS message_count,
                                MAX(message.created_at) AS latest_message_at
                         FROM forum_chat_rooms room
                         JOIN forum_chat_members member ON member.room_id = room.id
                         LEFT JOIN forum_chat_messages message
                           ON message.room_id = room.id
                          AND message.deleted_at IS NULL
                         WHERE room.is_group = 0
                         GROUP BY room.id
                         HAVING COUNT(DISTINCT member.graduate_id) = 2")
            ->fetchAll(PDO::FETCH_ASSOC);

        $byPair = [];
        foreach ($rooms as $room) {
            $key = (int) $room['first_graduate_id'] . ':' . (int) $room['second_graduate_id'];
            $byPair[$key][] = $room;
        }

        foreach ($byPair as $pairKey => $pairRooms) {
            usort($pairRooms, static function (array $first, array $second): int {
                $messageComparison = (int) $second['message_count'] <=> (int) $first['message_count'];
                if ($messageComparison !== 0) return $messageComparison;
                $dateComparison = strcmp((string) ($second['latest_message_at'] ?? ''), (string) ($first['latest_message_at'] ?? ''));
                if ($dateComparison !== 0) return $dateComparison;
                return (int) $first['id'] <=> (int) $second['id'];
            });

            $canonicalRoomId = (int) $pairRooms[0]['id'];
            foreach (array_slice($pairRooms, 1) as $duplicateRoom) {
                $duplicateRoomId = (int) $duplicateRoom['id'];

                $clientIdStmt = $db->prepare("UPDATE forum_chat_messages
                                              SET client_message_id = CONCAT('legacy:', id)
                                              WHERE room_id = :room_id AND client_message_id IS NOT NULL");
                $clientIdStmt->execute([':room_id' => $duplicateRoomId]);

                $attachmentStmt = $db->prepare('UPDATE forum_chat_message_attachments
                                                SET room_id = :canonical_room_id
                                                WHERE room_id = :duplicate_room_id');
                $attachmentStmt->execute([
                    ':canonical_room_id' => $canonicalRoomId,
                    ':duplicate_room_id' => $duplicateRoomId,
                ]);

                $messageStmt = $db->prepare('UPDATE forum_chat_messages
                                             SET room_id = :canonical_room_id
                                             WHERE room_id = :duplicate_room_id');
                $messageStmt->execute([
                    ':canonical_room_id' => $canonicalRoomId,
                    ':duplicate_room_id' => $duplicateRoomId,
                ]);

                $db->prepare('DELETE FROM forum_chat_members WHERE room_id = :room_id')
                    ->execute([':room_id' => $duplicateRoomId]);
                $db->prepare('DELETE FROM forum_chat_rooms WHERE id = :room_id')
                    ->execute([':room_id' => $duplicateRoomId]);
            }

            $db->prepare('UPDATE forum_chat_rooms
                          SET direct_pair_key = :direct_pair_key,
                              last_message_at = (
                                  SELECT MAX(message.created_at)
                                  FROM forum_chat_messages message
                                  WHERE message.room_id = :message_room_id AND message.deleted_at IS NULL
                              )
                          WHERE id = :room_id')
                ->execute([
                    ':direct_pair_key' => $pairKey,
                    ':message_room_id' => $canonicalRoomId,
                    ':room_id' => $canonicalRoomId,
                ]);
        }

        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }

    if (!gradtrack_chat_index_exists(
        $db,
        'forum_chat_rooms',
        'uniq_forum_chat_direct_pair',
        ['direct_pair_key'],
        true
    )) {
        $db->exec('ALTER TABLE forum_chat_rooms ADD UNIQUE KEY uniq_forum_chat_direct_pair (direct_pair_key)');
    }
};
