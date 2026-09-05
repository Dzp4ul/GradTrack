<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/forum.php';
require_once __DIR__ . '/../config/chat.php';

function gradtrack_forum_chats_request_data(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function gradtrack_forum_chats_json_error(int $statusCode, string $message): void
{
    http_response_code($statusCode);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function gradtrack_forum_chats_normalize_participants(array $rawIds, int $currentGraduateId): array
{
    $participantIds = [];

    foreach ($rawIds as $rawId) {
        $id = (int) $rawId;
        if ($id > 0 && $id !== $currentGraduateId) {
            $participantIds[$id] = $id;
        }
    }

    return array_values($participantIds);
}

function gradtrack_forum_chats_placeholders(array $ids, string $prefix, array &$params): string
{
    $placeholders = [];
    foreach ($ids as $index => $id) {
        $placeholder = ':' . $prefix . '_' . $index;
        $placeholders[] = $placeholder;
        $params[$placeholder] = (int) $id;
    }

    return implode(', ', $placeholders);
}

function gradtrack_forum_chats_validate_participants(PDO $db, array $participantIds): array
{
    if (count($participantIds) === 0) {
        return [];
    }

    $params = [];
    $placeholders = gradtrack_forum_chats_placeholders($participantIds, 'graduate_id', $params);
    $stmt = $db->prepare("SELECT g.id AS graduate_id,
                                 TRIM(CONCAT(COALESCE(g.first_name, ''), ' ', COALESCE(g.last_name, ''))) AS full_name,
                                 p.code AS program_code,
                                 g.year_graduated,
                                 gpi.file_path AS profile_image_path
                          FROM graduate_accounts ga
                          JOIN graduates g ON g.id = ga.graduate_id
                          LEFT JOIN programs p ON p.id = g.program_id
                          LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
                          WHERE ga.status = 'active'
                            AND ga.alumni_verification_status = 'approved'
                            AND g.status = 'active'
                            AND g.id IN ($placeholders)");
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $validated = [];
    foreach ($rows as $row) {
        $graduateId = (int) $row['graduate_id'];
        $validated[$graduateId] = [
            'graduate_id' => $graduateId,
            'full_name' => trim((string) ($row['full_name'] ?? '')) ?: 'Graduate',
            'program_code' => $row['program_code'] ?? null,
            'year_graduated' => $row['year_graduated'] !== null ? (int) $row['year_graduated'] : null,
            'profile_image_path' => gradtrack_storage_media_access_reference($row['profile_image_path'] ?? null),
        ];
    }

    return $validated;
}

function gradtrack_forum_chats_directory(PDO $db, int $currentGraduateId): array
{
    $stmt = $db->prepare("SELECT g.id AS graduate_id,
                                 TRIM(CONCAT(COALESCE(g.first_name, ''), ' ', COALESCE(g.last_name, ''))) AS full_name,
                                 p.code AS program_code,
                                 g.year_graduated,
                                 gpi.file_path AS profile_image_path
                          FROM graduate_accounts ga
                          JOIN graduates g ON g.id = ga.graduate_id
                          LEFT JOIN programs p ON p.id = g.program_id
                          LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
                          WHERE ga.status = 'active'
                            AND ga.alumni_verification_status = 'approved'
                            AND g.status = 'active'
                            AND g.id <> :graduate_id
                          ORDER BY g.first_name ASC, g.last_name ASC");
    $stmt->execute([':graduate_id' => $currentGraduateId]);

    $directory = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $directory[] = [
            'graduate_id' => (int) $row['graduate_id'],
            'full_name' => trim((string) ($row['full_name'] ?? '')) ?: 'Graduate',
            'program_code' => $row['program_code'] ?? null,
            'year_graduated' => $row['year_graduated'] !== null ? (int) $row['year_graduated'] : null,
            'profile_image_path' => gradtrack_storage_media_access_reference($row['profile_image_path'] ?? null),
        ];
    }

    return $directory;
}

function gradtrack_forum_chats_participants_by_room(PDO $db, array $roomIds): array
{
    if (count($roomIds) === 0) {
        return [];
    }

    $params = [];
    $placeholders = gradtrack_forum_chats_placeholders($roomIds, 'room_id', $params);
    $stmt = $db->prepare("SELECT fcm.room_id,
                                 g.id AS graduate_id,
                                 TRIM(CONCAT(COALESCE(g.first_name, ''), ' ', COALESCE(g.last_name, ''))) AS full_name,
                                 p.code AS program_code,
                                 g.year_graduated,
                                 gpi.file_path AS profile_image_path,
                                 gp.last_active_at,
                                 room.created_by
                          FROM forum_chat_members fcm
                          JOIN forum_chat_rooms room ON room.id = fcm.room_id
                          JOIN graduates g ON g.id = fcm.graduate_id
                          LEFT JOIN graduate_accounts ga ON ga.graduate_id = g.id
                          LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
                          LEFT JOIN programs p ON p.id = g.program_id
                          LEFT JOIN graduate_presence gp ON gp.graduate_id = g.id
                          WHERE fcm.room_id IN ($placeholders)
                          ORDER BY g.first_name ASC, g.last_name ASC");
    $stmt->execute($params);

    $grouped = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $roomId = (int) $row['room_id'];
        if (!isset($grouped[$roomId])) {
            $grouped[$roomId] = [];
        }

        $grouped[$roomId][] = [
            'graduate_id' => (int) $row['graduate_id'],
            'full_name' => trim((string) ($row['full_name'] ?? '')) ?: 'Graduate',
            'program_code' => $row['program_code'] ?? null,
            'year_graduated' => $row['year_graduated'] !== null ? (int) $row['year_graduated'] : null,
            'profile_image_path' => gradtrack_storage_media_access_reference($row['profile_image_path'] ?? null),
            'last_active_at' => gradtrack_chat_datetime_iso($row['last_active_at'] ?? null),
            'is_online' => false,
            'role' => (int) ($row['created_by'] ?? 0) === (int) $row['graduate_id'] ? 'admin' : 'member',
        ];
    }

    return $grouped;
}

function gradtrack_forum_chats_rooms(PDO $db, int $currentGraduateId): array
{
    $stmt = $db->prepare("SELECT r.id, r.created_by, r.name, r.is_group, r.group_image_path,
                                 r.group_image_original_name, r.group_image_mime_type, r.group_image_updated_at,
                                 r.created_at, r.updated_at,
                                 lm.message AS last_message,
                                 lm.message_type AS last_message_type,
                                 lm.created_at AS last_message_at,
                                 lm.graduate_id AS last_message_sender_id,
                                 (
                                     SELECT COUNT(*)
                                     FROM forum_chat_messages unread
                                     WHERE unread.room_id = r.id
                                       AND unread.graduate_id <> :unread_graduate_id
                                       AND unread.deleted_at IS NULL
                                       AND unread.id > COALESCE(mine.last_read_message_id, 0)
                                 ) AS unread_count
                          FROM forum_chat_rooms r
                          JOIN forum_chat_members mine
                            ON mine.room_id = r.id
                           AND mine.graduate_id = :graduate_id
                          LEFT JOIN forum_chat_messages lm
                            ON lm.id = (
                                SELECT msg.id
                                FROM forum_chat_messages msg
                                WHERE msg.room_id = r.id
                                  AND msg.deleted_at IS NULL
                                ORDER BY msg.created_at DESC, msg.id DESC
                                LIMIT 1
                            )
                          ORDER BY COALESCE(lm.created_at, r.last_message_at, r.updated_at, r.created_at) DESC, r.id DESC");
    $stmt->execute([
        ':graduate_id' => $currentGraduateId,
        ':unread_graduate_id' => $currentGraduateId,
    ]);
    $rooms = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $roomIds = [];
    foreach ($rooms as &$room) {
        $room['id'] = (int) $room['id'];
        $room['created_by'] = (int) $room['created_by'];
        $room['is_group'] = (int) ($room['is_group'] ?? 0) === 1;
        $room['last_message_sender_id'] = isset($room['last_message_sender_id']) ? (int) $room['last_message_sender_id'] : null;
        $room['last_message'] = gradtrack_chat_message_preview($room['last_message'] ?? null, $room['last_message_type'] ?? null);
        $room['unread_count'] = (int) ($room['unread_count'] ?? 0);
        $room['created_at'] = gradtrack_chat_datetime_iso($room['created_at'] ?? null);
        $room['updated_at'] = gradtrack_chat_datetime_iso($room['updated_at'] ?? null);
        $room['last_message_at'] = gradtrack_chat_datetime_iso($room['last_message_at'] ?? null);
        $room['group_image_updated_at'] = gradtrack_chat_datetime_iso($room['group_image_updated_at'] ?? null);
        $room['group_image_url'] = $room['is_group'] && !empty($room['group_image_path'])
            ? 'api/forum/conversation-info.php?room_id=' . $room['id'] . '&avatar=1&v=' . rawurlencode((string) ($room['group_image_updated_at'] ?? ''))
            : null;
        unset($room['group_image_path'], $room['group_image_original_name'], $room['group_image_mime_type']);
        $roomIds[] = $room['id'];
    }
    unset($room);

    $participantsByRoom = gradtrack_forum_chats_participants_by_room($db, $roomIds);
    foreach ($rooms as &$room) {
        $participants = $participantsByRoom[$room['id']] ?? [];
        $room['participants'] = $participants;
        $room['participant_count'] = count($participants);
    }
    unset($room);

    return $rooms;
}

function gradtrack_forum_chats_existing_direct_room(PDO $db, int $currentGraduateId, int $targetGraduateId): ?int
{
    $stmt = $db->prepare("SELECT r.id
                          FROM forum_chat_rooms r
                          JOIN forum_chat_members fcm ON fcm.room_id = r.id
                          WHERE r.is_group = 0
                          GROUP BY r.id
                          HAVING COUNT(*) = 2
                             AND SUM(CASE WHEN fcm.graduate_id = :graduate_id THEN 1 ELSE 0 END) = 1
                             AND SUM(CASE WHEN fcm.graduate_id = :target_graduate_id THEN 1 ELSE 0 END) = 1
                          LIMIT 1");
    $stmt->execute([
        ':graduate_id' => $currentGraduateId,
        ':target_graduate_id' => $targetGraduateId,
    ]);

    $room = $stmt->fetch(PDO::FETCH_ASSOC);
    return $room ? (int) $room['id'] : null;
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    gradtrack_chat_prepare_schema($db);
    $user = gradtrack_require_graduate_auth($db);
    $currentGraduateId = (int) $user['graduate_id'];

    if ($method === 'GET') {
        echo json_encode([
            'success' => true,
            'data' => [
                'rooms' => gradtrack_forum_chats_rooms($db, $currentGraduateId),
                'directory' => gradtrack_forum_chats_directory($db, $currentGraduateId),
            ],
        ]);
        exit;
    }

    if ($method === 'POST') {
        $data = gradtrack_forum_chats_request_data();
        $isGroup = !empty($data['is_group']);
        $name = gradtrack_forum_clean_text($data['name'] ?? '');
        $participantIds = gradtrack_forum_chats_normalize_participants((array) ($data['participant_ids'] ?? []), $currentGraduateId);

        if ($isGroup) {
            if ($name === '') {
                gradtrack_forum_chats_json_error(400, 'Group chat name is required');
            }

            if (count($participantIds) < 2) {
                gradtrack_forum_chats_json_error(400, 'Select at least two graduates for a group chat');
            }
        } else {
            if (count($participantIds) !== 1) {
                gradtrack_forum_chats_json_error(400, 'Select exactly one graduate for a direct chat');
            }
        }

        $validatedParticipants = gradtrack_forum_chats_validate_participants($db, $participantIds);
        if (count($validatedParticipants) !== count($participantIds)) {
            gradtrack_forum_chats_json_error(400, 'One or more selected graduates are unavailable for chat');
        }

        if (!$isGroup) {
            $targetGraduateId = $participantIds[0];
            $existingRoomId = gradtrack_forum_chats_existing_direct_room($db, $currentGraduateId, $targetGraduateId);

            if ($existingRoomId !== null) {
                echo json_encode([
                    'success' => true,
                    'message' => 'Direct chat opened',
                    'room_id' => $existingRoomId,
                ]);
                exit;
            }
        }

        $db->beginTransaction();

        try {
            $roomStmt = $db->prepare("INSERT INTO forum_chat_rooms (created_by, name, is_group)
                                      VALUES (:created_by, :name, :is_group)");
            $roomStmt->execute([
                ':created_by' => $currentGraduateId,
                ':name' => $isGroup ? $name : null,
                ':is_group' => $isGroup ? 1 : 0,
            ]);

            $roomId = (int) $db->lastInsertId();
            $memberIds = array_merge([$currentGraduateId], $participantIds);

            $memberStmt = $db->prepare("INSERT INTO forum_chat_members (room_id, graduate_id)
                                        VALUES (:room_id, :graduate_id)");
            foreach ($memberIds as $graduateId) {
                $memberStmt->execute([
                    ':room_id' => $roomId,
                    ':graduate_id' => (int) $graduateId,
                ]);
            }

            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }

        echo json_encode([
            'success' => true,
            'message' => $isGroup ? 'Group chat created successfully' : 'Direct chat created successfully',
            'room_id' => $roomId,
        ]);
        exit;
    }

    gradtrack_forum_chats_json_error(405, 'Method not allowed');
} catch (Throwable $e) {
    error_log('GradTrack chats API error: ' . $e->getMessage());
    gradtrack_forum_chats_json_error(500, 'Unable to process chats right now');
}
