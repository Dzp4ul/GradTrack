<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/chat.php';

function gradtrack_chat_attachments_json_error(int $statusCode, string $message): void
{
    http_response_code($statusCode);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}
    
function gradtrack_chat_attachments_secure_path(string $relativePath): string
{
    $base = realpath(__DIR__ . '/../../');
    if ($base === false) {
        throw new RuntimeException('Unable to resolve backend directory');
    }

    $normalizedRelative = str_replace(['\\', '../', '..\\'], ['/', '', ''], $relativePath);
    $absolute = realpath($base . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $normalizedRelative));
    $uploadsBase = realpath($base . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'chat-attachments');

    $uploadsBaseWithSeparator = $uploadsBase === false ? '' : rtrim($uploadsBase, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;

    if (
        $absolute === false
        || $uploadsBase === false
        || strpos($absolute, $uploadsBaseWithSeparator) !== 0
        || !is_file($absolute)
    ) {
        throw new RuntimeException('Attachment file is unavailable');
    }

    return $absolute;
}

function gradtrack_chat_attachments_load_authorized(PDO $db, int $attachmentId, int $graduateId): array
{
    $stmt = $db->prepare("SELECT a.id, a.room_id, a.message_id, a.uploaded_by, a.original_name, a.stored_name,
                                 a.storage_path, a.mime_type, a.file_size, a.attachment_type, a.created_at
                          FROM forum_chat_message_attachments a
                          JOIN forum_chat_members fcm
                            ON fcm.room_id = a.room_id
                           AND fcm.graduate_id = :graduate_id
                          WHERE a.id = :id
                            AND (a.message_id IS NOT NULL OR a.uploaded_by = :uploaded_by)
                          LIMIT 1");
    $stmt->execute([
        ':id' => $attachmentId,
        ':graduate_id' => $graduateId,
        ':uploaded_by' => $graduateId,
    ]);

    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        gradtrack_chat_attachments_json_error(404, 'Attachment not found');
    }

    return $row;
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    gradtrack_chat_prepare_schema($db);
    $user = gradtrack_require_graduate_auth($db);
    $currentGraduateId = (int) $user['graduate_id'];

    if ($method === 'POST') {
        $roomId = isset($_POST['room_id']) ? (int) $_POST['room_id'] : 0;
        if ($roomId <= 0) {
            gradtrack_chat_attachments_json_error(400, 'room_id is required');
        }

        try {
            gradtrack_chat_require_room_member($db, $roomId, $currentGraduateId);
        } catch (RuntimeException $e) {
            gradtrack_chat_attachments_json_error(404, 'Chat room not found');
        }

        if (!isset($_FILES['attachment'])) {
            gradtrack_chat_attachments_json_error(400, 'attachment is required');
        }

        $validated = gradtrack_chat_validate_attachment_file((array) $_FILES['attachment']);
        $storedName = uniqid('chat_', true) . '.' . $validated['extension'];
        $roomDir = gradtrack_chat_upload_room_dir($roomId);
        gradtrack_chat_create_dir($roomDir);

        $destinationPath = $roomDir . DIRECTORY_SEPARATOR . $storedName;
        if (!move_uploaded_file($validated['tmp_path'], $destinationPath)) {
            gradtrack_chat_attachments_json_error(500, 'Failed to save attachment');
        }

        $relativePath = gradtrack_chat_relative_attachment_path($roomId, $storedName);

        try {
            $stmt = $db->prepare("INSERT INTO forum_chat_message_attachments
                (room_id, uploaded_by, original_name, stored_name, storage_path, mime_type, file_size, attachment_type)
                VALUES (:room_id, :uploaded_by, :original_name, :stored_name, :storage_path, :mime_type, :file_size, :attachment_type)");
            $stmt->execute([
                ':room_id' => $roomId,
                ':uploaded_by' => $currentGraduateId,
                ':original_name' => $validated['original_name'],
                ':stored_name' => $storedName,
                ':storage_path' => $relativePath,
                ':mime_type' => $validated['mime_type'],
                ':file_size' => $validated['file_size'],
                ':attachment_type' => $validated['attachment_type'],
            ]);
        } catch (Throwable $e) {
            if (is_file($destinationPath)) {
                @unlink($destinationPath);
            }
            throw $e;
        }

        $attachmentId = (int) $db->lastInsertId();
        $attachment = gradtrack_chat_attachments_load_authorized($db, $attachmentId, $currentGraduateId);

        echo json_encode([
            'success' => true,
            'message' => 'Attachment uploaded',
            'data' => [
                'attachment' => gradtrack_chat_format_attachment($attachment),
            ],
        ]);
        exit;
    }

    if ($method === 'GET') {
        $attachmentId = isset($_GET['id']) ? (int) $_GET['id'] : 0;
        if ($attachmentId <= 0) {
            gradtrack_chat_attachments_json_error(400, 'Attachment id is required');
        }

        $attachment = gradtrack_chat_attachments_load_authorized($db, $attachmentId, $currentGraduateId);
        $absolutePath = gradtrack_chat_attachments_secure_path((string) $attachment['storage_path']);
        $download = isset($_GET['download']) && (string) $_GET['download'] === '1';
        $safeName = str_replace(['"', "\r", "\n"], '', (string) $attachment['original_name']);

        header_remove('Content-Type');
        header('Content-Type: ' . $attachment['mime_type']);
        header('Content-Length: ' . filesize($absolutePath));
        header('X-Content-Type-Options: nosniff');
        header('Content-Disposition: ' . ($download ? 'attachment' : 'inline') . '; filename="' . $safeName . '"');
        readfile($absolutePath);
        exit;
    }

    gradtrack_chat_attachments_json_error(405, 'Method not allowed');
} catch (Throwable $e) {
    error_log('GradTrack chat attachment API error: ' . $e->getMessage());
    gradtrack_chat_attachments_json_error(500, 'Unable to process the attachment right now');
}
