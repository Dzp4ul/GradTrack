<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/chat.php';
require_once __DIR__ . '/../config/storage.php';

function gradtrack_conversation_info_error(int $statusCode, string $message): never
{
    http_response_code($statusCode);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function gradtrack_conversation_info_request_data(): array
{
    if (!empty($_POST)) {
        return $_POST;
    }

    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function gradtrack_conversation_info_room(PDO $db, int $roomId, int $graduateId): array
{
    $room = gradtrack_chat_require_room_member($db, $roomId, $graduateId);
    $room['participants'] = gradtrack_chat_participants($db, $roomId);
    $room['participant_count'] = count($room['participants']);
    unset($room['group_image_path'], $room['group_image_original_name'], $room['group_image_mime_type']);
    return $room;
}

function gradtrack_conversation_info_attachments(PDO $db, int $roomId): array
{
    $stmt = $db->prepare("SELECT a.id, a.room_id, a.message_id, a.original_name, a.stored_name,
                                 a.mime_type, a.file_size, a.attachment_type, a.created_at
                          FROM forum_chat_message_attachments a
                          JOIN forum_chat_messages m
                            ON m.id = a.message_id
                           AND m.room_id = a.room_id
                           AND m.deleted_at IS NULL
                          WHERE a.room_id = :room_id
                          ORDER BY a.created_at DESC, a.id DESC");
    $stmt->execute([':room_id' => $roomId]);

    $photos = [];
    $files = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $attachment = gradtrack_chat_format_attachment($row);
        if (($row['attachment_type'] ?? '') === 'image') {
            $photos[] = $attachment;
        } else {
            $files[] = $attachment;
        }
    }

    return ['photos' => $photos, 'files' => $files];
}

function gradtrack_conversation_info_assert_group_creator(array $room, int $graduateId): void
{
    if (empty($room['is_group'])) {
        throw new RuntimeException('This action is only available for group conversations');
    }
    if ((int) $room['created_by'] !== $graduateId) {
        throw new DomainException('Only the group administrator can add members');
    }
}

function gradtrack_conversation_info_eligible_members(PDO $db, int $roomId, int $graduateId, string $query): array
{
    $room = gradtrack_chat_require_room_member($db, $roomId, $graduateId);
    gradtrack_conversation_info_assert_group_creator($room, $graduateId);

    $trimmedQuery = trim($query);
    $boundedQuery = function_exists('mb_substr')
        ? mb_substr($trimmedQuery, 0, 100)
        : substr($trimmedQuery, 0, 100);
    $search = '%' . $boundedQuery . '%';
    $stmt = $db->prepare("SELECT g.id AS graduate_id,
                                 TRIM(CONCAT(COALESCE(g.first_name, ''), ' ', COALESCE(g.last_name, ''))) AS full_name,
                                 p.code AS program_code,
                                 g.year_graduated,
                                 gpi.file_path AS profile_image_path,
                                 presence.last_active_at
                          FROM graduates g
                          JOIN graduate_accounts account
                            ON account.graduate_id = g.id
                           AND account.status = 'active'
                           AND account.alumni_verification_status = 'approved'
                          LEFT JOIN programs p ON p.id = g.program_id
                          LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = account.id
                          LEFT JOIN graduate_presence presence ON presence.graduate_id = g.id
                          WHERE g.status = 'active'
                            AND NOT EXISTS (
                                SELECT 1
                                FROM forum_chat_members member
                                WHERE member.room_id = :room_id
                                  AND member.graduate_id = g.id
                            )
                            AND (
                                :empty_query = ''
                                OR CONCAT_WS(' ', g.first_name, g.middle_name, g.last_name) LIKE :name_query
                                OR COALESCE(p.code, '') LIKE :program_query
                                OR COALESCE(p.name, '') LIKE :program_name_query
                                OR CAST(g.year_graduated AS CHAR) LIKE :year_query
                            )
                          ORDER BY g.first_name ASC, g.last_name ASC
                          LIMIT 50");
    $stmt->execute([
        ':room_id' => $roomId,
        ':empty_query' => trim($query),
        ':name_query' => $search,
        ':program_query' => $search,
        ':program_name_query' => $search,
        ':year_query' => $search,
    ]);

    return array_map(static function (array $row): array {
        return [
            'graduate_id' => (int) $row['graduate_id'],
            'full_name' => trim((string) ($row['full_name'] ?? '')) ?: 'Graduate',
            'program_code' => $row['program_code'] ?? null,
            'year_graduated' => $row['year_graduated'] !== null ? (int) $row['year_graduated'] : null,
            'profile_image_path' => gradtrack_storage_media_access_reference($row['profile_image_path'] ?? null),
            'last_active_at' => gradtrack_chat_datetime_iso($row['last_active_at'] ?? null),
            'is_online' => false,
            'role' => 'member',
        ];
    }, $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function gradtrack_conversation_info_member_event_names(array $members): string
{
    $names = array_values(array_map(
        static fn (array $member): string => trim((string) ($member['full_name'] ?? '')) ?: 'a graduate',
        $members
    ));
    if (count($names) <= 2) {
        return implode(' and ', $names);
    }
    return $names[0] . ', ' . $names[1] . ', and ' . (count($names) - 2) . ' others';
}

function gradtrack_conversation_info_system_message(
    PDO $db,
    int $roomId,
    int $graduateId,
    string $message,
    string $eventType
): int {
    $clientMessageId = 'system-' . $eventType . '-' . bin2hex(random_bytes(12));
    $stmt = $db->prepare("INSERT INTO forum_chat_messages
                            (room_id, graduate_id, message, message_type, client_message_id)
                          VALUES
                            (:room_id, :graduate_id, :message, 'system', :client_message_id)");
    $stmt->execute([
        ':room_id' => $roomId,
        ':graduate_id' => $graduateId,
        ':message' => $message,
        ':client_message_id' => $clientMessageId,
    ]);
    $messageId = (int) $db->lastInsertId();

    $roomStmt = $db->prepare('UPDATE forum_chat_rooms SET last_message_at = NOW(), updated_at = NOW() WHERE id = :room_id');
    $roomStmt->execute([':room_id' => $roomId]);
    return $messageId;
}

function gradtrack_conversation_info_add_members(PDO $db, int $roomId, int $graduateId, array $rawIds): array
{
    $requestedIds = [];
    foreach ($rawIds as $rawId) {
        $id = (int) $rawId;
        if ($id > 0) {
            $requestedIds[$id] = $id;
        }
    }
    $requestedIds = array_values($requestedIds);
    if (count($requestedIds) === 0 || count($requestedIds) > 50) {
        throw new RuntimeException('Select between 1 and 50 eligible graduates');
    }

    $db->beginTransaction();
    try {
        $roomStmt = $db->prepare('SELECT id, created_by, is_group FROM forum_chat_rooms WHERE id = :room_id FOR UPDATE');
        $roomStmt->execute([':room_id' => $roomId]);
        $room = $roomStmt->fetch(PDO::FETCH_ASSOC);
        if (!$room) {
            throw new RuntimeException('Group conversation not found');
        }
        $room['is_group'] = (int) $room['is_group'] === 1;
        gradtrack_conversation_info_assert_group_creator($room, $graduateId);

        $membershipStmt = $db->prepare('SELECT graduate_id FROM forum_chat_members WHERE room_id = :room_id FOR UPDATE');
        $membershipStmt->execute([':room_id' => $roomId]);
        $existingIds = array_map('intval', $membershipStmt->fetchAll(PDO::FETCH_COLUMN));
        if (!in_array($graduateId, $existingIds, true)) {
            throw new DomainException('You are no longer a member of this group');
        }
        if (array_intersect($requestedIds, $existingIds)) {
            throw new RuntimeException('One or more selected graduates are already members');
        }

        $params = [];
        $placeholders = gradtrack_chat_placeholders($requestedIds, 'new_member', $params);
        $graduateStmt = $db->prepare("SELECT g.id AS graduate_id,
                                             TRIM(CONCAT(COALESCE(g.first_name, ''), ' ', COALESCE(g.last_name, ''))) AS full_name
                                      FROM graduates g
                                      JOIN graduate_accounts account
                                        ON account.graduate_id = g.id
                                       AND account.status = 'active'
                                       AND account.alumni_verification_status = 'approved'
                                      WHERE g.status = 'active'
                                        AND g.id IN ($placeholders)
                                      ORDER BY g.first_name ASC, g.last_name ASC");
        $graduateStmt->execute($params);
        $eligible = $graduateStmt->fetchAll(PDO::FETCH_ASSOC);
        if (count($eligible) !== count($requestedIds)) {
            throw new RuntimeException('One or more selected graduates are unavailable');
        }

        $insertStmt = $db->prepare('INSERT INTO forum_chat_members (room_id, graduate_id) VALUES (:room_id, :graduate_id)');
        foreach ($requestedIds as $newMemberId) {
            $insertStmt->execute([':room_id' => $roomId, ':graduate_id' => $newMemberId]);
        }

        $actorStmt = $db->prepare("SELECT TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))) FROM graduates WHERE id = :graduate_id");
        $actorStmt->execute([':graduate_id' => $graduateId]);
        $actorName = trim((string) $actorStmt->fetchColumn()) ?: 'A group administrator';
        $systemMessageId = gradtrack_conversation_info_system_message(
            $db,
            $roomId,
            $graduateId,
            $actorName . ' added ' . gradtrack_conversation_info_member_event_names($eligible) . ' to the group.',
            'members-added'
        );

        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }

    $room = gradtrack_conversation_info_room($db, $roomId, $graduateId);
    $addedIdLookup = array_fill_keys($requestedIds, true);
    $addedMembers = array_values(array_filter(
        $room['participants'],
        static fn (array $participant): bool => isset($addedIdLookup[(int) $participant['graduate_id']])
    ));

    return [
        'room' => $room,
        'added_members' => $addedMembers,
        'system_message_id' => $systemMessageId,
    ];
}

function gradtrack_conversation_info_serve_avatar(PDO $db, int $roomId, int $graduateId): never
{
    $room = gradtrack_chat_require_room_member($db, $roomId, $graduateId);
    if (empty($room['is_group']) || empty($room['group_image_path'])) {
        gradtrack_conversation_info_error(404, 'Group photo not found');
    }

    $reference = (string) $room['group_image_path'];
    $mimeType = (string) ($room['group_image_mime_type'] ?: 'image/jpeg');
    $originalName = (string) ($room['group_image_original_name'] ?: 'group-photo');

    if (gradtrack_storage_is_s3_key($reference)) {
        $url = gradtrack_storage_presigned_url($reference, $originalName, $mimeType, false);
        header_remove('Content-Type');
        header('Cache-Control: private, max-age=300');
        header('Location: ' . $url, true, 302);
        exit;
    }

    $path = gradtrack_storage_local_absolute_path($reference, true);
    header_remove('Content-Type');
    header('Content-Type: ' . $mimeType);
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: private, max-age=300');
    header('X-Content-Type-Options: nosniff');
    header('Content-Disposition: inline; filename="' . addcslashes(gradtrack_storage_safe_download_name($originalName, 'group-photo'), '"\\') . '"');
    readfile($path);
    exit;
}

function gradtrack_conversation_info_change_photo(PDO $db, int $roomId, int $graduateId): array
{
    $room = gradtrack_chat_require_room_member($db, $roomId, $graduateId);
    if (empty($room['is_group'])) {
        gradtrack_conversation_info_error(400, 'Group photos are only available for group conversations');
    }
    if (!isset($_FILES['photo'])) {
        gradtrack_conversation_info_error(400, 'photo is required');
    }

    try {
        $validated = gradtrack_chat_validate_attachment_file((array) $_FILES['photo']);
    } catch (RuntimeException $error) {
        gradtrack_conversation_info_error(400, $error->getMessage());
    }
    if (($validated['attachment_type'] ?? '') !== 'image') {
        gradtrack_conversation_info_error(400, 'The group photo must be a supported image');
    }

    $storedName = gradtrack_storage_uuid_filename((string) $validated['extension']);
    $storage = gradtrack_storage_put_file(
        (string) $validated['tmp_path'],
        'private/chat/rooms/' . $roomId . '/avatar/' . $storedName,
        'uploads/chat-group-images/' . $roomId . '/' . $storedName,
        (string) $validated['mime_type'],
        ['category' => 'chat-group-avatar', 'room-id' => $roomId]
    );
    $newReference = (string) $storage['reference'];
    $oldReference = (string) ($room['group_image_path'] ?? '');

    try {
        $stmt = $db->prepare("UPDATE forum_chat_rooms room
                              JOIN forum_chat_members member
                                ON member.room_id = room.id
                               AND member.graduate_id = :graduate_id
                              SET room.group_image_path = :path,
                                  room.group_image_original_name = :original_name,
                                  room.group_image_mime_type = :mime_type,
                                  room.group_image_updated_at = NOW(),
                                  room.updated_at = NOW()
                              WHERE room.id = :room_id
                                AND room.is_group = 1");
        $stmt->execute([
            ':path' => $newReference,
            ':original_name' => $validated['original_name'],
            ':mime_type' => $validated['mime_type'],
            ':room_id' => $roomId,
            ':graduate_id' => $graduateId,
        ]);
        if ($stmt->rowCount() !== 1) {
            throw new RuntimeException('Group photo permission changed before the upload completed');
        }
    } catch (Throwable $error) {
        gradtrack_storage_delete_quietly($newReference);
        throw $error;
    }

    if ($oldReference !== '' && $oldReference !== $newReference) {
        gradtrack_storage_delete_quietly($oldReference);
    }

    return gradtrack_conversation_info_room($db, $roomId, $graduateId);
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    gradtrack_chat_prepare_schema($db);
    $user = gradtrack_require_graduate_auth($db);
    $currentGraduateId = (int) $user['graduate_id'];

    if ($method === 'GET') {
        $roomId = (int) ($_GET['room_id'] ?? 0);
        if ($roomId <= 0) {
            gradtrack_conversation_info_error(400, 'room_id is required');
        }
        if ((string) ($_GET['avatar'] ?? '') === '1') {
            gradtrack_conversation_info_serve_avatar($db, $roomId, $currentGraduateId);
        }

        if ((string) ($_GET['action'] ?? '') === 'eligible_members') {
            echo json_encode([
                'success' => true,
                'data' => [
                    'candidates' => gradtrack_conversation_info_eligible_members(
                        $db,
                        $roomId,
                        $currentGraduateId,
                        (string) ($_GET['q'] ?? '')
                    ),
                ],
            ]);
            exit;
        }

        $room = gradtrack_conversation_info_room($db, $roomId, $currentGraduateId);
        $attachments = gradtrack_conversation_info_attachments($db, $roomId);
        $block = !empty($room['is_group']) ? null : gradtrack_chat_direct_block_state($db, $roomId, $currentGraduateId);

        echo json_encode([
            'success' => true,
            'data' => [
                'room' => $room,
                'photos' => $attachments['photos'],
                'files' => $attachments['files'],
                'block' => $block,
                'permissions' => [
                    'can_change_group_photo' => !empty($room['is_group']),
                    'can_leave_group' => !empty($room['is_group']) && (int) $room['participant_count'] > 1,
                    'can_add_members' => !empty($room['is_group']) && (int) $room['created_by'] === $currentGraduateId,
                ],
            ],
        ]);
        exit;
    }

    if ($method === 'POST') {
        $data = gradtrack_conversation_info_request_data();
        $roomId = (int) ($data['room_id'] ?? 0);
        $action = trim((string) ($data['action'] ?? ''));
        if ($roomId <= 0 || $action === '') {
            gradtrack_conversation_info_error(400, 'room_id and action are required');
        }

        if ($action === 'group_photo') {
            $room = gradtrack_conversation_info_change_photo($db, $roomId, $currentGraduateId);
            echo json_encode(['success' => true, 'message' => 'Group photo updated', 'data' => ['room' => $room]]);
            exit;
        }

        if ($action === 'add_members') {
            $result = gradtrack_conversation_info_add_members(
                $db,
                $roomId,
                $currentGraduateId,
                (array) ($data['participant_ids'] ?? [])
            );
            echo json_encode([
                'success' => true,
                'message' => count($result['added_members']) === 1 ? 'Member added' : 'Members added',
                'data' => $result,
            ]);
            exit;
        }

        if ($action === 'block' || $action === 'unblock') {
            $state = gradtrack_chat_direct_block_state($db, $roomId, $currentGraduateId);
            $peerId = (int) $state['peer_id'];
            if ($action === 'block') {
                $stmt = $db->prepare("INSERT INTO forum_chat_blocks (blocker_id, blocked_id)
                                      VALUES (:blocker_id, :blocked_id)
                                      ON DUPLICATE KEY UPDATE updated_at = NOW()");
                $stmt->execute([':blocker_id' => $currentGraduateId, ':blocked_id' => $peerId]);
            } else {
                $stmt = $db->prepare("DELETE FROM forum_chat_blocks
                                      WHERE blocker_id = :blocker_id AND blocked_id = :blocked_id");
                $stmt->execute([':blocker_id' => $currentGraduateId, ':blocked_id' => $peerId]);
            }

            echo json_encode([
                'success' => true,
                'message' => $action === 'block' ? 'Graduate blocked' : 'Graduate unblocked',
                'data' => ['block' => gradtrack_chat_direct_block_state($db, $roomId, $currentGraduateId)],
            ]);
            exit;
        }

        if ($action === 'leave_group') {
            $room = gradtrack_chat_require_room_member($db, $roomId, $currentGraduateId);
            if (empty($room['is_group'])) {
                gradtrack_conversation_info_error(400, 'Only group conversations can be left');
            }

            $roomLockStmt = $db->prepare("SELECT created_by, is_group FROM forum_chat_rooms WHERE id = :room_id FOR UPDATE");
            $memberStmt = $db->prepare("SELECT graduate_id FROM forum_chat_members WHERE room_id = :room_id ORDER BY joined_at ASC, id ASC FOR UPDATE");
            $db->beginTransaction();
            $systemMessageId = 0;
            try {
                $roomLockStmt->execute([':room_id' => $roomId]);
                $lockedRoom = $roomLockStmt->fetch(PDO::FETCH_ASSOC);
                if (!$lockedRoom || empty($lockedRoom['is_group'])) {
                    throw new RuntimeException('Group conversation not found');
                }

                $memberStmt->execute([':room_id' => $roomId]);
                $memberIds = array_map('intval', $memberStmt->fetchAll(PDO::FETCH_COLUMN));
                if (!in_array($currentGraduateId, $memberIds, true)) {
                    throw new RuntimeException('Group membership changed before the request completed');
                }
                if (count($memberIds) <= 1) {
                    $db->rollBack();
                    gradtrack_conversation_info_error(409, 'The only remaining member cannot leave this group');
                }

                if ((int) $lockedRoom['created_by'] === $currentGraduateId) {
                    $nextCreator = current(array_values(array_filter($memberIds, static fn (int $id): bool => $id !== $currentGraduateId)));
                    $ownerStmt = $db->prepare("UPDATE forum_chat_rooms SET created_by = :created_by, updated_at = NOW() WHERE id = :room_id");
                    $ownerStmt->execute([':created_by' => $nextCreator, ':room_id' => $roomId]);
                }

                $leaverStmt = $db->prepare("SELECT TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))) FROM graduates WHERE id = :graduate_id");
                $leaverStmt->execute([':graduate_id' => $currentGraduateId]);
                $leaverName = trim((string) $leaverStmt->fetchColumn()) ?: 'A graduate';
                $systemMessageId = gradtrack_conversation_info_system_message(
                    $db,
                    $roomId,
                    $currentGraduateId,
                    $leaverName . ' left the group.',
                    'member-left'
                );

                $leaveStmt = $db->prepare("DELETE FROM forum_chat_members WHERE room_id = :room_id AND graduate_id = :graduate_id");
                $leaveStmt->execute([':room_id' => $roomId, ':graduate_id' => $currentGraduateId]);
                if ($leaveStmt->rowCount() !== 1) {
                    throw new RuntimeException('Group membership changed before the request completed');
                }
                $db->commit();
            } catch (Throwable $error) {
                if ($db->inTransaction()) {
                    $db->rollBack();
                }
                throw $error;
            }

            echo json_encode([
                'success' => true,
                'message' => 'You left the group',
                'data' => ['room_id' => $roomId, 'system_message_id' => $systemMessageId],
            ]);
            exit;
        }

        gradtrack_conversation_info_error(400, 'Unsupported conversation action');
    }

    gradtrack_conversation_info_error(405, 'Method not allowed');
} catch (DomainException $error) {
    gradtrack_conversation_info_error(403, $error->getMessage());
} catch (RuntimeException $error) {
    $message = $error->getMessage();
    $status = str_contains($message, 'not found') ? 404 : 400;
    gradtrack_conversation_info_error($status, $message);
} catch (Throwable $error) {
    error_log('GradTrack conversation information API error: ' . $error->getMessage());
    gradtrack_conversation_info_error(500, 'Unable to update this conversation right now');
}
