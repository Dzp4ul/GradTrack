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

            echo json_encode(['success' => true, 'message' => 'You left the group', 'data' => ['room_id' => $roomId]]);
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
