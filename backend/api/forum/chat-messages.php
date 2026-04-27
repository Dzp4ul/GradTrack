<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/forum.php';

function gradtrack_forum_chat_messages_request_data(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function gradtrack_forum_chat_messages_json_error(int $statusCode, string $message): void
{
    http_response_code($statusCode);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function gradtrack_forum_chat_messages_placeholders(array $ids, string $prefix, array &$params): string
{
    $placeholders = [];
    foreach ($ids as $index => $id) {
        $placeholder = ':' . $prefix . '_' . $index;
        $placeholders[] = $placeholder;
        $params[$placeholder] = (int) $id;
    }

    return implode(', ', $placeholders);
}

function gradtrack_forum_chat_messages_room_context(PDO $db, int $roomId, int $currentGraduateId): array
{
    $stmt = $db->prepare("SELECT r.id, r.created_by, r.name, r.is_group, r.created_at, r.updated_at
                          FROM forum_chat_rooms r
                          JOIN forum_chat_members mine
                            ON mine.room_id = r.id
                           AND mine.graduate_id = :graduate_id
                          WHERE r.id = :room_id
                          LIMIT 1");
    $stmt->execute([
        ':graduate_id' => $currentGraduateId,
        ':room_id' => $roomId,
    ]);

    $room = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$room) {
        gradtrack_forum_chat_messages_json_error(404, 'Chat room not found');
    }

    $room['id'] = (int) $room['id'];
    $room['created_by'] = (int) $room['created_by'];
    $room['is_group'] = (int) ($room['is_group'] ?? 0) === 1;

    return $room;
}

function gradtrack_forum_chat_messages_participants(PDO $db, int $roomId): array
{
    $stmt = $db->prepare("SELECT g.id AS graduate_id,
                                 TRIM(CONCAT(COALESCE(g.first_name, ''), ' ', COALESCE(g.last_name, ''))) AS full_name,
                                 p.code AS program_code,
                                 gpi.file_path AS profile_image_path
                          FROM forum_chat_members fcm
                          JOIN graduates g ON g.id = fcm.graduate_id
                          LEFT JOIN graduate_accounts ga ON ga.graduate_id = g.id
                          LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
                          LEFT JOIN programs p ON p.id = g.program_id
                          WHERE fcm.room_id = :room_id
                          ORDER BY g.first_name ASC, g.last_name ASC");
    $stmt->execute([':room_id' => $roomId]);

    $participants = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $participants[] = [
            'graduate_id' => (int) $row['graduate_id'],
            'full_name' => trim((string) ($row['full_name'] ?? '')) ?: 'Graduate',
            'program_code' => $row['program_code'] ?? null,
            'profile_image_path' => $row['profile_image_path'] ?? null,
        ];
    }

    return $participants;
}

function gradtrack_forum_chat_messages_fetch(PDO $db, int $roomId, int $currentGraduateId): array
{
    $stmt = $db->prepare("SELECT fcm.id, fcm.room_id, fcm.graduate_id, fcm.message, fcm.created_at,
                                 g.first_name, g.last_name,
                                 p.code AS sender_program_code,
                                 gpi.file_path AS sender_profile_image_path
                          FROM forum_chat_messages fcm
                          JOIN graduates g ON g.id = fcm.graduate_id
                          LEFT JOIN graduate_accounts ga ON ga.graduate_id = g.id
                          LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
                          LEFT JOIN programs p ON p.id = g.program_id
                          WHERE fcm.room_id = :room_id
                          ORDER BY fcm.created_at ASC, fcm.id ASC");
    $stmt->execute([':room_id' => $roomId]);

    $messages = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $graduateId = (int) $row['graduate_id'];
        $messages[] = [
            'id' => (int) $row['id'],
            'room_id' => (int) $row['room_id'],
            'graduate_id' => $graduateId,
            'message' => (string) $row['message'],
            'created_at' => $row['created_at'],
            'sender_name' => trim((string) ($row['first_name'] ?? '') . ' ' . (string) ($row['last_name'] ?? '')) ?: 'Graduate',
            'sender_program_code' => $row['sender_program_code'] ?? null,
            'sender_profile_image_path' => $row['sender_profile_image_path'] ?? null,
            'is_mine' => $graduateId === $currentGraduateId,
        ];
    }

    return $messages;
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    gradtrack_forum_ensure_schema($db);
    $user = gradtrack_require_graduate_auth($db);
    $currentGraduateId = (int) $user['graduate_id'];

    if ($method === 'GET') {
        $roomId = isset($_GET['room_id']) ? (int) $_GET['room_id'] : 0;
        if ($roomId <= 0) {
            gradtrack_forum_chat_messages_json_error(400, 'room_id is required');
        }

        $room = gradtrack_forum_chat_messages_room_context($db, $roomId, $currentGraduateId);
        $room['participants'] = gradtrack_forum_chat_messages_participants($db, $roomId);
        $room['participant_count'] = count($room['participants']);

        echo json_encode([
            'success' => true,
            'data' => [
                'room' => $room,
                'messages' => gradtrack_forum_chat_messages_fetch($db, $roomId, $currentGraduateId),
            ],
        ]);
        exit;
    }

    if ($method === 'POST') {
        $data = gradtrack_forum_chat_messages_request_data();
        $roomId = isset($data['room_id']) ? (int) $data['room_id'] : 0;
        $message = gradtrack_forum_clean_text($data['message'] ?? '');

        if ($roomId <= 0) {
            gradtrack_forum_chat_messages_json_error(400, 'room_id is required');
        }

        if ($message === '') {
            gradtrack_forum_chat_messages_json_error(400, 'message is required');
        }

        gradtrack_forum_chat_messages_room_context($db, $roomId, $currentGraduateId);

        $insertStmt = $db->prepare("INSERT INTO forum_chat_messages (room_id, graduate_id, message)
                                    VALUES (:room_id, :graduate_id, :message)");
        $insertStmt->execute([
            ':room_id' => $roomId,
            ':graduate_id' => $currentGraduateId,
            ':message' => $message,
        ]);

        $updateRoomStmt = $db->prepare('UPDATE forum_chat_rooms SET updated_at = NOW() WHERE id = :room_id');
        $updateRoomStmt->execute([':room_id' => $roomId]);

        echo json_encode([
            'success' => true,
            'message' => 'Message sent',
            'id' => (int) $db->lastInsertId(),
        ]);
        exit;
    }

    gradtrack_forum_chat_messages_json_error(405, 'Method not allowed');
} catch (Throwable $e) {
    gradtrack_forum_chat_messages_json_error(500, $e->getMessage());
}
