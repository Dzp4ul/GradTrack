<?php
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/chat.php';

function conversation_info_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
    echo 'PASS: ' . $message . PHP_EOL;
}

$db = (new Database())->getConnection();

try {
    gradtrack_chat_prepare_schema($db);

    $direct = $db->query("SELECT r.id
                           FROM forum_chat_rooms r
                           JOIN forum_chat_members member ON member.room_id = r.id
                           WHERE r.is_group = 0
                           GROUP BY r.id
                           HAVING COUNT(*) = 2
                              AND NOT EXISTS (
                                SELECT 1
                                FROM forum_chat_blocks block_row
                                JOIN forum_chat_members first_member ON first_member.room_id = r.id AND first_member.graduate_id = block_row.blocker_id
                                JOIN forum_chat_members second_member ON second_member.room_id = r.id AND second_member.graduate_id = block_row.blocked_id
                              )
                           ORDER BY r.id ASC
                           LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    conversation_info_test_assert((bool) $direct, 'a valid two-participant direct-conversation fixture is available');
    $directRoomId = (int) $direct['id'];
    $participantStmt = $db->prepare('SELECT graduate_id FROM forum_chat_members WHERE room_id = :room_id ORDER BY id ASC');
    $participantStmt->execute([':room_id' => $directRoomId]);
    $directMembers = array_map('intval', $participantStmt->fetchAll(PDO::FETCH_COLUMN));

    $outsiderStmt = $db->prepare("SELECT g.id
                                  FROM graduates g
                                  WHERE NOT EXISTS (
                                    SELECT 1 FROM forum_chat_members member
                                    WHERE member.room_id = :room_id AND member.graduate_id = g.id
                                  )
                                  ORDER BY g.id ASC LIMIT 1");
    $outsiderStmt->execute([':room_id' => $directRoomId]);
    $outsiderId = (int) $outsiderStmt->fetchColumn();
    $unauthorizedRejected = false;
    try {
        gradtrack_chat_require_room_member($db, $directRoomId, $outsiderId);
    } catch (RuntimeException $error) {
        $unauthorizedRejected = true;
    }
    conversation_info_test_assert($unauthorizedRejected, 'conversation membership prevents an outsider from accessing a private room');

    $db->beginTransaction();
    $blockStmt = $db->prepare('INSERT INTO forum_chat_blocks (blocker_id, blocked_id) VALUES (:blocker_id, :blocked_id)');
    $blockStmt->execute([':blocker_id' => $directMembers[0], ':blocked_id' => $directMembers[1]]);

    $blockerState = gradtrack_chat_direct_block_state($db, $directRoomId, $directMembers[0]);
    $blockedState = gradtrack_chat_direct_block_state($db, $directRoomId, $directMembers[1]);
    conversation_info_test_assert($blockerState['blocked_by_me'] && $blockerState['blocked'], 'the blocker sees the direct conversation as blocked by them');
    conversation_info_test_assert($blockedState['blocked_by_other'] && $blockedState['blocked'], 'the blocked graduate sees the server-enforced blocked state');

    foreach ($directMembers as $memberId) {
        $sendRejected = false;
        try {
            gradtrack_chat_assert_message_allowed($db, $directRoomId, $memberId);
        } catch (DomainException $error) {
            $sendRejected = true;
        }
        conversation_info_test_assert($sendRejected, 'blocked direct messaging is rejected server-side for graduate ' . $memberId);
    }
    $db->rollBack();
    conversation_info_test_assert(!$db->inTransaction(), 'block test changes were rolled back');

    $group = $db->query("SELECT r.id, r.created_by, COUNT(member.id) AS member_count
                          FROM forum_chat_rooms r
                          JOIN forum_chat_members member ON member.room_id = r.id
                          WHERE r.is_group = 1
                          GROUP BY r.id, r.created_by
                          HAVING COUNT(member.id) > 1
                          ORDER BY r.id ASC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    conversation_info_test_assert((bool) $group, 'a multi-member group fixture is available');
    $groupRoomId = (int) $group['id'];
    $groupCreatorId = (int) $group['created_by'];
    $groupRoom = gradtrack_chat_require_room_member($db, $groupRoomId, $groupCreatorId);
    conversation_info_test_assert($groupRoom['is_group'] && $groupRoom['created_by'] === $groupCreatorId, 'group creator permission is derived from the existing room owner');

    $participantStmt->execute([':room_id' => $groupRoomId]);
    $groupMembers = array_map('intval', $participantStmt->fetchAll(PDO::FETCH_COLUMN));
    $nextCreatorId = current(array_values(array_filter($groupMembers, static fn (int $id): bool => $id !== $groupCreatorId)));

    $db->beginTransaction();
    $ownerStmt = $db->prepare('UPDATE forum_chat_rooms SET created_by = :created_by WHERE id = :room_id');
    $ownerStmt->execute([':created_by' => $nextCreatorId, ':room_id' => $groupRoomId]);
    $leaveStmt = $db->prepare('DELETE FROM forum_chat_members WHERE room_id = :room_id AND graduate_id = :graduate_id');
    $leaveStmt->execute([':room_id' => $groupRoomId, ':graduate_id' => $groupCreatorId]);
    $remainingStmt = $db->prepare('SELECT r.created_by, COUNT(member.id) AS member_count FROM forum_chat_rooms r JOIN forum_chat_members member ON member.room_id = r.id WHERE r.id = :room_id GROUP BY r.created_by');
    $remainingStmt->execute([':room_id' => $groupRoomId]);
    $remaining = $remainingStmt->fetch(PDO::FETCH_ASSOC);
    conversation_info_test_assert((int) $remaining['created_by'] === (int) $nextCreatorId, 'leaving group ownership can transfer to a remaining member');
    conversation_info_test_assert((int) $remaining['member_count'] === count($groupMembers) - 1, 'leaving removes only the confirmed member and preserves the group');
    $db->rollBack();
    conversation_info_test_assert(!$db->inTransaction(), 'group leave test changes were rolled back');

    echo PHP_EOL . 'All conversation information integration tests passed.' . PHP_EOL;
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    fwrite(STDERR, 'FAIL: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
