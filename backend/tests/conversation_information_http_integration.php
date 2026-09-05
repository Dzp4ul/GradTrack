<?php
ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';
require_once __DIR__ . '/../api/config/storage.php';

$failures = 0;
$sessionIds = [];
$createdBlock = null;
$groupPhotoCleanup = null;
$groupMembershipCleanup = null;
$addedGroupMembershipCleanup = null;
$systemMessageCleanup = [];
$groupTimelineCleanup = null;
$createdGroupRoomId = null;
$temporaryFiles = [];
$db = (new Database())->getConnection();
$baseUrl = rtrim((string) (getenv('GRADTRACK_CHAT_TEST_URL') ?: 'http://localhost/GradTrack/backend/api/forum'), '/');
$cookieName = gradtrack_session_cookie_name();

function conversation_http_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function conversation_http_session(int $accountId): string
{
    global $sessionIds;
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    ini_set('session.use_strict_mode', '0');
    $sessionId = 'gtchat' . bin2hex(random_bytes(16));
    session_id($sessionId);
    session_start();
    $_SESSION = ['graduate_account_id' => $accountId, 'authenticated_at' => time()];
    session_write_close();
    $sessionIds[] = $sessionId;
    return $sessionId;
}

function conversation_http_request(string $url, string $sessionId, string $method = 'GET', ?array $body = null): array
{
    global $cookieName;
    $headers = [
        'Accept: application/json',
        'Origin: http://localhost:5173',
        'Cookie: ' . $cookieName . '=' . rawurlencode($sessionId),
    ];
    if ($body !== null) $headers[] = 'Content-Type: application/json';
    $context = stream_context_create(['http' => [
        'method' => $method,
        'header' => implode("\r\n", $headers),
        'content' => $body === null ? '' : json_encode($body),
        'ignore_errors' => true,
        'timeout' => 30,
    ]]);
    $responseBody = @file_get_contents($url, false, $context);
    $responseHeaders = $http_response_header ?? [];
    $status = 0;
    foreach ($responseHeaders as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $match) === 1) {
            $status = (int) $match[1];
            break;
        }
    }
    return ['status' => $status, 'json' => is_string($responseBody) ? json_decode($responseBody, true) : null];
}

function conversation_http_multipart(string $url, string $sessionId, array $fields): array
{
    global $cookieName;
    $handle = curl_init($url);
    if ($handle === false) throw new RuntimeException('Unable to initialize cURL');
    curl_setopt_array($handle, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'Origin: http://localhost:5173',
            'Cookie: ' . $cookieName . '=' . rawurlencode($sessionId),
        ],
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $fields,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 60,
    ]);
    $body = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    $error = curl_error($handle);
    curl_close($handle);
    if ($body === false) throw new RuntimeException('Multipart request failed: ' . $error);
    return ['status' => $status, 'json' => json_decode((string) $body, true)];
}

function conversation_http_redirect(string $url, string $sessionId): array
{
    global $cookieName;
    $handle = curl_init($url);
    if ($handle === false) throw new RuntimeException('Unable to initialize cURL');
    curl_setopt_array($handle, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HTTPHEADER => ['Cookie: ' . $cookieName . '=' . rawurlencode($sessionId)],
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
    ]);
    $raw = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);
    return ['status' => $status, 'raw' => is_string($raw) ? $raw : ''];
}

function conversation_http_cleanup(): void
{
    global $sessionIds, $createdBlock, $groupPhotoCleanup, $groupMembershipCleanup, $addedGroupMembershipCleanup, $systemMessageCleanup, $groupTimelineCleanup, $createdGroupRoomId, $temporaryFiles, $db;
    if (is_array($createdBlock)) {
        $stmt = $db->prepare('DELETE FROM forum_chat_blocks WHERE blocker_id = :blocker_id AND blocked_id = :blocked_id');
        $stmt->execute([':blocker_id' => $createdBlock[0], ':blocked_id' => $createdBlock[1]]);
    }
    if (is_array($groupPhotoCleanup)) {
        $restore = $db->prepare("UPDATE forum_chat_rooms
                                 SET group_image_path = :path,
                                     group_image_original_name = :original_name,
                                     group_image_mime_type = :mime_type,
                                     group_image_updated_at = :image_updated_at,
                                     updated_at = :updated_at
                                 WHERE id = :room_id");
        $restore->execute([
            ':path' => $groupPhotoCleanup['old']['group_image_path'],
            ':original_name' => $groupPhotoCleanup['old']['group_image_original_name'],
            ':mime_type' => $groupPhotoCleanup['old']['group_image_mime_type'],
            ':image_updated_at' => $groupPhotoCleanup['old']['group_image_updated_at'],
            ':updated_at' => $groupPhotoCleanup['old']['updated_at'],
            ':room_id' => $groupPhotoCleanup['room_id'],
        ]);
        gradtrack_storage_delete_quietly($groupPhotoCleanup['new_reference']);
        $groupPhotoCleanup = null;
    }
    if (is_array($groupMembershipCleanup)) {
        $restoreMember = $db->prepare("INSERT IGNORE INTO forum_chat_members (id, room_id, graduate_id, joined_at)
                                       VALUES (:id, :room_id, :graduate_id, :joined_at)");
        $restoreMember->execute([
            ':id' => $groupMembershipCleanup['id'],
            ':room_id' => $groupMembershipCleanup['room_id'],
            ':graduate_id' => $groupMembershipCleanup['graduate_id'],
            ':joined_at' => $groupMembershipCleanup['joined_at'],
        ]);
        $groupMembershipCleanup = null;
    }
    if (is_array($addedGroupMembershipCleanup)) {
        $removeAddedMember = $db->prepare('DELETE FROM forum_chat_members WHERE room_id = :room_id AND graduate_id = :graduate_id');
        $removeAddedMember->execute([
            ':room_id' => $addedGroupMembershipCleanup['room_id'],
            ':graduate_id' => $addedGroupMembershipCleanup['graduate_id'],
        ]);
        $addedGroupMembershipCleanup = null;
    }
    if (count($systemMessageCleanup) > 0) {
        $placeholders = implode(',', array_fill(0, count($systemMessageCleanup), '?'));
        $deleteSystemMessages = $db->prepare("DELETE FROM forum_chat_messages WHERE id IN ($placeholders) AND message_type = 'system'");
        $deleteSystemMessages->execute(array_values(array_unique(array_map('intval', $systemMessageCleanup))));
        $systemMessageCleanup = [];
    }
    if (is_array($groupTimelineCleanup)) {
        $restoreTimeline = $db->prepare('UPDATE forum_chat_rooms SET last_message_at = :last_message_at, updated_at = :updated_at WHERE id = :room_id');
        $restoreTimeline->execute([
            ':last_message_at' => $groupTimelineCleanup['last_message_at'],
            ':updated_at' => $groupTimelineCleanup['updated_at'],
            ':room_id' => $groupTimelineCleanup['room_id'],
        ]);
        $groupTimelineCleanup = null;
    }
    if (is_int($createdGroupRoomId) && $createdGroupRoomId > 0) {
        $deleteGroup = $db->prepare('DELETE FROM forum_chat_rooms WHERE id = :room_id');
        $deleteGroup->execute([':room_id' => $createdGroupRoomId]);
        $createdGroupRoomId = null;
    }
    foreach ($temporaryFiles as $path) {
        if (is_string($path) && is_file($path)) @unlink($path);
    }
    $temporaryFiles = [];
    foreach ($sessionIds as $sessionId) {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        ini_set('session.use_strict_mode', '0');
        session_id($sessionId);
        session_start();
        $_SESSION = [];
        session_destroy();
    }
}

register_shutdown_function('conversation_http_cleanup');

try {
    $direct = $db->query("SELECT r.id
                          FROM forum_chat_rooms r
                          JOIN forum_chat_members member ON member.room_id = r.id
                          WHERE r.is_group = 0
                          GROUP BY r.id
                          HAVING COUNT(*) = 2
                             AND NOT EXISTS (
                               SELECT 1
                               FROM forum_chat_blocks block_row
                               JOIN forum_chat_members blocker ON blocker.room_id = r.id AND blocker.graduate_id = block_row.blocker_id
                               JOIN forum_chat_members blocked ON blocked.room_id = r.id AND blocked.graduate_id = block_row.blocked_id
                             )
                          ORDER BY r.id ASC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    if (!$direct) throw new RuntimeException('No unblocked direct-conversation fixture is available');

    $roomId = (int) $direct['id'];
    $memberStmt = $db->prepare('SELECT graduate_id FROM forum_chat_members WHERE room_id = :room_id ORDER BY id ASC');
    $memberStmt->execute([':room_id' => $roomId]);
    $memberIds = array_map('intval', $memberStmt->fetchAll(PDO::FETCH_COLUMN));
    $firstId = $memberIds[0];
    $secondId = $memberIds[1];
    $accountStmt = $db->prepare('SELECT id FROM graduate_accounts WHERE graduate_id = :graduate_id AND status = \'active\' LIMIT 1');
    $accountStmt->execute([':graduate_id' => $firstId]);
    $firstAccountId = (int) $accountStmt->fetchColumn();
    $accountStmt->execute([':graduate_id' => $secondId]);
    $secondAccountId = (int) $accountStmt->fetchColumn();
    if (!$firstAccountId || !$secondAccountId) throw new RuntimeException('Direct chat fixtures need active graduate accounts');

    $outsiderStmt = $db->prepare("SELECT ga.id
                                  FROM graduate_accounts ga
                                  WHERE ga.status = 'active'
                                    AND NOT EXISTS (
                                      SELECT 1 FROM forum_chat_members member
                                      WHERE member.room_id = :room_id AND member.graduate_id = ga.graduate_id
                                    )
                                  ORDER BY ga.id ASC LIMIT 1");
    $outsiderStmt->execute([':room_id' => $roomId]);
    $outsiderAccountId = (int) $outsiderStmt->fetchColumn();
    if (!$outsiderAccountId) throw new RuntimeException('No outsider graduate fixture is available');

    $firstSession = conversation_http_session($firstAccountId);
    $secondSession = conversation_http_session($secondAccountId);
    $outsiderSession = conversation_http_session($outsiderAccountId);

    $firstInfo = conversation_http_request($baseUrl . '/conversation-info.php?room_id=' . $roomId, $firstSession);
    conversation_http_assert($firstInfo['status'] === 200 && ($firstInfo['json']['data']['room']['id'] ?? 0) === $roomId, 'first authenticated browser can load its conversation information');
    $attachments = array_merge($firstInfo['json']['data']['photos'] ?? [], $firstInfo['json']['data']['files'] ?? []);
    conversation_http_assert(count(array_filter($attachments, static fn (array $attachment): bool => (int) ($attachment['room_id'] ?? 0) !== $roomId)) === 0, 'photo and file metadata is scoped to the selected conversation');

    $outsiderInfo = conversation_http_request($baseUrl . '/conversation-info.php?room_id=' . $roomId, $outsiderSession);
    conversation_http_assert($outsiderInfo['status'] === 404, 'a separate outsider browser cannot load private conversation information');

    $block = conversation_http_request($baseUrl . '/conversation-info.php', $firstSession, 'POST', ['room_id' => $roomId, 'action' => 'block']);
    $createdBlock = [$firstId, $secondId];
    conversation_http_assert($block['status'] === 200 && !empty($block['json']['data']['block']['blocked_by_me']), 'block confirmation writes the authenticated blocker relation');

    $blockedSend = conversation_http_request($baseUrl . '/chat-messages.php', $secondSession, 'POST', [
        'room_id' => $roomId,
        'message' => 'This message must not be stored',
        'client_message_id' => 'blocked-http-test-' . bin2hex(random_bytes(8)),
        'attachment_ids' => [],
    ]);
    conversation_http_assert($blockedSend['status'] === 403, 'the real message endpoint rejects the blocked participant server-side');

    $secondInfo = conversation_http_request($baseUrl . '/conversation-info.php?room_id=' . $roomId, $secondSession);
    conversation_http_assert($secondInfo['status'] === 200 && !empty($secondInfo['json']['data']['block']['blocked_by_other']), 'the second browser receives the reciprocal blocked state');

    $unblock = conversation_http_request($baseUrl . '/conversation-info.php', $firstSession, 'POST', ['room_id' => $roomId, 'action' => 'unblock']);
    conversation_http_assert($unblock['status'] === 200 && empty($unblock['json']['data']['block']['blocked']), 'unblock restores the direct-conversation policy');
    $createdBlock = null;

    $group = $db->query("SELECT r.id, r.created_by, r.last_message_at, r.updated_at
                         FROM forum_chat_rooms r
                         JOIN forum_chat_members member ON member.room_id = r.id
                         WHERE r.is_group = 1
                           AND r.group_image_path IS NULL
                         GROUP BY r.id, r.created_by
                         HAVING COUNT(member.id) > 1
                         ORDER BY r.id ASC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    if (!$group) {
        $groupSeedRows = $db->query("SELECT account.id AS account_id, account.graduate_id
                                     FROM graduate_accounts account
                                     JOIN graduates graduate ON graduate.id = account.graduate_id
                                     WHERE account.status = 'active'
                                       AND account.alumni_verification_status = 'approved'
                                       AND graduate.status = 'active'
                                     ORDER BY account.id ASC
                                     LIMIT 3")->fetchAll(PDO::FETCH_ASSOC);
        if (count($groupSeedRows) < 3) throw new RuntimeException('At least three active graduates are required for the temporary group fixture');
        $temporaryCreatorSession = conversation_http_session((int) $groupSeedRows[0]['account_id']);
        $createGroup = conversation_http_request($baseUrl . '/chats.php', $temporaryCreatorSession, 'POST', [
            'is_group' => true,
            'name' => 'GradTrack Integration Group ' . bin2hex(random_bytes(4)),
            'participant_ids' => [(int) $groupSeedRows[1]['graduate_id'], (int) $groupSeedRows[2]['graduate_id']],
        ]);
        $createdGroupRoomId = (int) ($createGroup['json']['room_id'] ?? 0);
        if ($createGroup['status'] !== 200 || $createdGroupRoomId <= 0) throw new RuntimeException('Unable to create the temporary group fixture');
        $temporaryGroupStmt = $db->prepare('SELECT id, created_by, last_message_at, updated_at FROM forum_chat_rooms WHERE id = :room_id');
        $temporaryGroupStmt->execute([':room_id' => $createdGroupRoomId]);
        $group = $temporaryGroupStmt->fetch(PDO::FETCH_ASSOC);
    }
    $groupRoomId = (int) $group['id'];
    $groupTimelineCleanup = [
        'room_id' => $groupRoomId,
        'last_message_at' => $group['last_message_at'],
        'updated_at' => $group['updated_at'],
    ];
    $accountStmt->execute([':graduate_id' => (int) $group['created_by']]);
    $creatorSession = conversation_http_session((int) $accountStmt->fetchColumn());
    $groupInfo = conversation_http_request($baseUrl . '/conversation-info.php?room_id=' . $groupRoomId, $creatorSession);
    conversation_http_assert($groupInfo['status'] === 200 && !empty($groupInfo['json']['data']['permissions']['can_change_group_photo']), 'the group creator can change the group photo');
    conversation_http_assert(
        !empty($groupInfo['json']['data']['permissions']['can_add_members'])
            && count($groupInfo['json']['data']['room']['participants'] ?? []) === (int) ($groupInfo['json']['data']['room']['participant_count'] ?? -1),
        'the group creator receives a database-backed member list and add-member permission'
    );

    $leaverStmt = $db->prepare("SELECT member.id, member.room_id, member.graduate_id, member.joined_at,
                                      account.id AS account_id
                                 FROM forum_chat_members member
                                 JOIN graduate_accounts account
                                   ON account.graduate_id = member.graduate_id
                                  AND account.status = 'active'
                                WHERE member.room_id = :room_id
                                  AND member.graduate_id <> :creator_id
                                ORDER BY member.joined_at DESC, member.id DESC
                                LIMIT 1");
    $leaverStmt->execute([':room_id' => $groupRoomId, ':creator_id' => (int) $group['created_by']]);
    $leaver = $leaverStmt->fetch(PDO::FETCH_ASSOC);
    if (!$leaver) throw new RuntimeException('No active non-owner group member is available for the group-photo test');
    $memberSession = conversation_http_session((int) $leaver['account_id']);
    $memberGroupInfo = conversation_http_request($baseUrl . '/conversation-info.php?room_id=' . $groupRoomId, $memberSession);
    conversation_http_assert(
        $memberGroupInfo['status'] === 200 && !empty($memberGroupInfo['json']['data']['permissions']['can_change_group_photo']),
        'a current non-owner group member can change the group photo'
    );
    conversation_http_assert(empty($memberGroupInfo['json']['data']['permissions']['can_add_members']), 'a regular group member cannot add members');

    $groupOutsiderStmt = $db->prepare("SELECT account.id
                                       FROM graduate_accounts account
                                       JOIN graduates graduate ON graduate.id = account.graduate_id
                                       WHERE account.status = 'active'
                                         AND account.alumni_verification_status = 'approved'
                                         AND graduate.status = 'active'
                                         AND NOT EXISTS (
                                           SELECT 1 FROM forum_chat_members member
                                           WHERE member.room_id = :room_id
                                             AND member.graduate_id = account.graduate_id
                                         )
                                       ORDER BY account.id ASC
                                       LIMIT 1");
    $groupOutsiderStmt->execute([':room_id' => $groupRoomId]);
    $groupOutsiderAccountId = (int) $groupOutsiderStmt->fetchColumn();
    if (!$groupOutsiderAccountId) throw new RuntimeException('No non-member graduate is available for the group authorization test');
    $groupOutsiderSession = conversation_http_session($groupOutsiderAccountId);

    $regularEligible = conversation_http_request($baseUrl . '/conversation-info.php?room_id=' . $groupRoomId . '&action=eligible_members', $memberSession);
    conversation_http_assert($regularEligible['status'] === 403, 'the server rejects eligible-member discovery by a regular group member');

    $eligible = conversation_http_request($baseUrl . '/conversation-info.php?room_id=' . $groupRoomId . '&action=eligible_members', $creatorSession);
    $candidate = $eligible['json']['data']['candidates'][0] ?? null;
    if (!$candidate) throw new RuntimeException('No eligible graduate is available for the add-member test');
    $candidateId = (int) $candidate['graduate_id'];
    $addMember = conversation_http_request($baseUrl . '/conversation-info.php', $creatorSession, 'POST', [
        'room_id' => $groupRoomId,
        'action' => 'add_members',
        'participant_ids' => [$candidateId],
    ]);
    $addedGroupMembershipCleanup = ['room_id' => $groupRoomId, 'graduate_id' => $candidateId];
    $addedSystemMessageId = (int) ($addMember['json']['data']['system_message_id'] ?? 0);
    if ($addedSystemMessageId > 0) $systemMessageCleanup[] = $addedSystemMessageId;
    $systemTypeStmt = $db->prepare('SELECT message_type FROM forum_chat_messages WHERE id = :message_id');
    $systemTypeStmt->execute([':message_id' => $addedSystemMessageId]);
    conversation_http_assert(
        $addMember['status'] === 200
            && (int) ($addMember['json']['data']['room']['participant_count'] ?? 0) === (int) ($groupInfo['json']['data']['room']['participant_count'] ?? 0) + 1
            && $systemTypeStmt->fetchColumn() === 'system',
        'adding an eligible graduate persists membership and a system event in one transaction'
    );
    $duplicateAdd = conversation_http_request($baseUrl . '/conversation-info.php', $creatorSession, 'POST', [
        'room_id' => $groupRoomId,
        'action' => 'add_members',
        'participant_ids' => [$candidateId],
    ]);
    $duplicateCountStmt = $db->prepare('SELECT COUNT(*) FROM forum_chat_members WHERE room_id = :room_id AND graduate_id = :graduate_id');
    $duplicateCountStmt->execute([':room_id' => $groupRoomId, ':graduate_id' => $candidateId]);
    conversation_http_assert($duplicateAdd['status'] === 400 && (int) $duplicateCountStmt->fetchColumn() === 1, 'duplicate member submissions are rejected without a duplicate row');

    $oldPhotoStmt = $db->prepare('SELECT group_image_path, group_image_original_name, group_image_mime_type, group_image_updated_at, updated_at FROM forum_chat_rooms WHERE id = :room_id');
    $oldPhotoStmt->execute([':room_id' => $groupRoomId]);
    $oldPhoto = $oldPhotoStmt->fetch(PDO::FETCH_ASSOC);
    $imagePath = tempnam(sys_get_temp_dir(), 'gradtrack-group-photo-');
    if ($imagePath === false) throw new RuntimeException('Unable to create the temporary group photo');
    $temporaryFiles[] = $imagePath;
    $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', true);
    if (!is_string($png) || file_put_contents($imagePath, $png) === false) throw new RuntimeException('Unable to write the temporary group photo');

    $outsiderPhotoUpload = conversation_http_multipart($baseUrl . '/conversation-info.php', $groupOutsiderSession, [
        'room_id' => (string) $groupRoomId,
        'action' => 'group_photo',
        'photo' => new CURLFile($imagePath, 'image/png', 'group-photo-test.png'),
    ]);
    conversation_http_assert(in_array($outsiderPhotoUpload['status'], [403, 404], true), 'a non-member cannot change the group photo');

    $photoUpload = conversation_http_multipart($baseUrl . '/conversation-info.php', $memberSession, [
        'room_id' => (string) $groupRoomId,
        'action' => 'group_photo',
        'photo' => new CURLFile($imagePath, 'image/png', 'group-photo-test.png'),
    ]);
    $newPhotoStmt = $db->prepare('SELECT group_image_path FROM forum_chat_rooms WHERE id = :room_id');
    $newPhotoStmt->execute([':room_id' => $groupRoomId]);
    $newPhotoReference = (string) $newPhotoStmt->fetchColumn();
    $groupPhotoCleanup = ['room_id' => $groupRoomId, 'old' => $oldPhoto, 'new_reference' => $newPhotoReference];
    conversation_http_assert($photoUpload['status'] === 200 && !empty($photoUpload['json']['data']['room']['group_image_url']), 'authorized multipart upload returns an immediately usable group photo reference');
    conversation_http_assert(str_starts_with($newPhotoReference, 'private/chat/rooms/' . $groupRoomId . '/avatar/'), 'the database stores only the private S3 group photo key');
    conversation_http_assert(gradtrack_storage_exists($newPhotoReference), 'the uploaded group photo exists in the configured S3 storage');

    $avatarUrl = 'http://localhost/GradTrack/backend/' . ltrim((string) $photoUpload['json']['data']['room']['group_image_url'], '/');
    $avatarResponse = conversation_http_redirect($avatarUrl, $memberSession);
    conversation_http_assert($avatarResponse['status'] === 302 && stripos($avatarResponse['raw'], 'Location: https://') !== false, 'authorized group photo access uses a fresh private S3 redirect');
    $outsiderAvatar = conversation_http_redirect($avatarUrl, $groupOutsiderSession);
    conversation_http_assert($outsiderAvatar['status'] === 404, 'a non-member cannot access the private group photo');

    $groupMembershipCleanup = $leaver;
    $leave = conversation_http_request($baseUrl . '/conversation-info.php', $memberSession, 'POST', [
        'room_id' => $groupRoomId,
        'action' => 'leave_group',
    ]);
    $leaveSystemMessageId = (int) ($leave['json']['data']['system_message_id'] ?? 0);
    if ($leaveSystemMessageId > 0) $systemMessageCleanup[] = $leaveSystemMessageId;
    $membershipCheck = $db->prepare('SELECT COUNT(*) FROM forum_chat_members WHERE room_id = :room_id AND graduate_id = :graduate_id');
    $membershipCheck->execute([':room_id' => $groupRoomId, ':graduate_id' => (int) $leaver['graduate_id']]);
    $groupStillExists = $db->prepare('SELECT COUNT(*) FROM forum_chat_rooms WHERE id = :room_id');
    $groupStillExists->execute([':room_id' => $groupRoomId]);
    conversation_http_assert(
        $leave['status'] === 200 && (int) $membershipCheck->fetchColumn() === 0,
        'confirmed leave-group removes only the authenticated membership'
    );
    conversation_http_assert((int) $groupStillExists->fetchColumn() === 1, 'leaving a group does not delete the conversation');
    $leaverChats = conversation_http_request($baseUrl . '/chats.php', $memberSession);
    $activeRooms = $leaverChats['json']['data']['rooms'] ?? [];
    conversation_http_assert(
        $leaverChats['status'] === 200
            && count(array_filter($activeRooms, static fn (array $chat): bool => (int) ($chat['id'] ?? 0) === $groupRoomId)) === 0,
        'the departed member no longer sees the group in the active conversation list'
    );

    conversation_http_cleanup();
    $sessionIds = [];
    $createdBlock = null;
} catch (Throwable $error) {
    fwrite(STDERR, 'FAIL: ' . $error->getMessage() . PHP_EOL);
    $failures++;
}

if ($failures > 0) {
    conversation_http_cleanup();
    $sessionIds = [];
    echo PHP_EOL . $failures . ' conversation HTTP integration test(s) failed.' . PHP_EOL;
    ob_end_flush();
    exit(1);
}

echo PHP_EOL . 'All conversation HTTP integration tests passed.' . PHP_EOL;
ob_end_flush();
