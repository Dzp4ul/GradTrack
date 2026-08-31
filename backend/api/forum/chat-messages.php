<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/forum.php';
require_once __DIR__ . '/../config/chat.php';

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
    try {
        return gradtrack_chat_require_room_member($db, $roomId, $currentGraduateId);
    } catch (RuntimeException $e) {
        gradtrack_forum_chat_messages_json_error(404, 'Chat room not found');
    }
}

function gradtrack_forum_chat_messages_participants(PDO $db, int $roomId): array
{
    return gradtrack_chat_participants($db, $roomId);
}

function gradtrack_forum_chat_messages_fetch(PDO $db, int $roomId, int $currentGraduateId, ?int $beforeId = null, ?int $afterId = null, int $limit = 30): array
{
    $limit = max(1, min($limit, 60));
    $params = [':room_id' => $roomId];
    $where = 'fcm.room_id = :room_id AND fcm.deleted_at IS NULL';
    $order = 'fcm.created_at DESC, fcm.id DESC';

    if ($afterId !== null && $afterId > 0) {
        $where .= ' AND fcm.id > :after_id';
        $params[':after_id'] = $afterId;
        $order = 'fcm.created_at ASC, fcm.id ASC';
    } elseif ($beforeId !== null && $beforeId > 0) {
        $where .= ' AND fcm.id < :before_id';
        $params[':before_id'] = $beforeId;
    }

    $stmt = $db->prepare("SELECT fcm.id, fcm.room_id, fcm.graduate_id, fcm.message, fcm.message_type,
                                 fcm.client_message_id, fcm.delivered_at, fcm.read_at, fcm.created_at, fcm.updated_at,
                                 g.first_name, g.last_name,
                                 p.code AS sender_program_code,
                                 gpi.file_path AS sender_profile_image_path
                          FROM forum_chat_messages fcm
                          JOIN graduates g ON g.id = fcm.graduate_id
                          LEFT JOIN graduate_accounts ga ON ga.graduate_id = g.id
                          LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
                          LEFT JOIN programs p ON p.id = g.program_id
                          WHERE {$where}
                          ORDER BY {$order}
                          LIMIT " . ($limit + 1));
    $stmt->execute($params);

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $hasMore = count($rows) > $limit;
    $rows = array_slice($rows, 0, $limit);

    if ($afterId === null || $afterId <= 0) {
        $rows = array_reverse($rows);
    }

    $messageIds = array_map(function ($row) {
        return (int) $row['id'];
    }, $rows);
    $attachmentsByMessage = gradtrack_chat_attachments_by_message_ids($db, $messageIds);

    $messages = array_map(function ($row) use ($currentGraduateId, $attachmentsByMessage) {
        $messageId = (int) $row['id'];
        return gradtrack_chat_format_message($row, $currentGraduateId, $attachmentsByMessage[$messageId] ?? []);
    }, $rows);

    return [
        'messages' => $messages,
        'pagination' => [
            'limit' => $limit,
            'has_more_older' => $hasMore && ($afterId === null || $afterId <= 0),
            'has_more_newer' => $hasMore && $afterId !== null && $afterId > 0,
            'oldest_id' => count($messages) > 0 ? (int) $messages[0]['id'] : null,
            'newest_id' => count($messages) > 0 ? (int) $messages[count($messages) - 1]['id'] : null,
        ],
    ];
}

function gradtrack_forum_chat_messages_fetch_one(PDO $db, int $messageId, int $currentGraduateId): ?array
{
    $stmt = $db->prepare("SELECT fcm.id, fcm.room_id, fcm.graduate_id, fcm.message, fcm.message_type,
                                 fcm.client_message_id, fcm.delivered_at, fcm.read_at, fcm.created_at, fcm.updated_at,
                                 g.first_name, g.last_name,
                                 p.code AS sender_program_code,
                                 gpi.file_path AS sender_profile_image_path
                          FROM forum_chat_messages fcm
                          JOIN graduates g ON g.id = fcm.graduate_id
                          LEFT JOIN graduate_accounts ga ON ga.graduate_id = g.id
                          LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
                          LEFT JOIN programs p ON p.id = g.program_id
                          WHERE fcm.id = :id
                            AND fcm.deleted_at IS NULL
                          LIMIT 1");
    $stmt->execute([':id' => $messageId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return null;
    }

    $attachments = gradtrack_chat_attachments_by_message_ids($db, [$messageId]);
    return gradtrack_chat_format_message($row, $currentGraduateId, $attachments[$messageId] ?? []);
}

function gradtrack_forum_chat_messages_attachment_client_id(string $clientMessageId): string
{
    $suffix = ':attachment';
    if (strlen($clientMessageId) + strlen($suffix) <= 80) {
        return $clientMessageId . $suffix;
    }

    return 'split:' . hash('sha256', $clientMessageId . $suffix);
}

function gradtrack_forum_chat_messages_fetch_client_batch(PDO $db, int $roomId, int $currentGraduateId, string $clientMessageId): array
{
    $attachmentClientMessageId = gradtrack_forum_chat_messages_attachment_client_id($clientMessageId);
    $stmt = $db->prepare("SELECT id
                          FROM forum_chat_messages
                          WHERE room_id = :room_id
                            AND graduate_id = :graduate_id
                            AND client_message_id IN (:client_message_id, :attachment_client_message_id)
                            AND deleted_at IS NULL
                          ORDER BY id ASC");
    $stmt->execute([
        ':room_id' => $roomId,
        ':graduate_id' => $currentGraduateId,
        ':client_message_id' => $clientMessageId,
        ':attachment_client_message_id' => $attachmentClientMessageId,
    ]);

    $messages = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $savedMessage = gradtrack_forum_chat_messages_fetch_one($db, (int) $row['id'], $currentGraduateId);
        if ($savedMessage) {
            $messages[] = $savedMessage;
        }
    }

    return $messages;
}

function gradtrack_forum_chat_messages_insert(PDO $db, int $roomId, int $currentGraduateId, string $message, string $clientMessageId, array $attachmentIds): array
{
    $message = gradtrack_chat_normalize_message($message);
    $messageLength = function_exists('mb_strlen') ? mb_strlen($message, 'UTF-8') : strlen($message);
    if ($messageLength > 5000) {
        gradtrack_forum_chat_messages_json_error(400, 'Message is too long');
    }

    $attachmentIds = array_values(array_unique(array_filter(array_map('intval', $attachmentIds), function ($id) {
        return $id > 0;
    })));

    if ($message === '' && count($attachmentIds) === 0) {
        gradtrack_forum_chat_messages_json_error(400, 'Message or attachment is required');
    }

    if ($clientMessageId === '' || strlen($clientMessageId) > 80 || !preg_match('/^[a-zA-Z0-9._:-]+$/', $clientMessageId)) {
        gradtrack_forum_chat_messages_json_error(400, 'Valid client_message_id is required');
    }

    $existingMessages = gradtrack_forum_chat_messages_fetch_client_batch($db, $roomId, $currentGraduateId, $clientMessageId);
    if (count($existingMessages) > 0) {
        return $existingMessages;
    }

    $attachmentType = null;
    if (count($attachmentIds) > 0) {
        $params = [
            ':room_id' => $roomId,
            ':uploaded_by' => $currentGraduateId,
        ];
        $placeholders = gradtrack_chat_placeholders($attachmentIds, 'attachment_id', $params);
        $attachmentStmt = $db->prepare("SELECT id, attachment_type, storage_path, stored_name
                                        FROM forum_chat_message_attachments
                                        WHERE id IN ($placeholders)
                                          AND room_id = :room_id
                                          AND uploaded_by = :uploaded_by
                                          AND message_id IS NULL");
        $attachmentStmt->execute($params);
        $attachmentRows = $attachmentStmt->fetchAll(PDO::FETCH_ASSOC);

        if (count($attachmentRows) !== count($attachmentIds)) {
            gradtrack_forum_chat_messages_json_error(400, 'One or more attachments are unavailable');
        }

        $types = array_values(array_unique(array_map(function ($row) {
            return (string) $row['attachment_type'];
        }, $attachmentRows)));
        $attachmentType = count($types) === 1 ? $types[0] : 'mixed';
    }

    $hasAttachments = count($attachmentIds) > 0;
    $attachmentMessageType = $attachmentType === 'image' ? 'image' : 'file';
    $messageSpecs = [];

    if ($message !== '' && $hasAttachments) {
        $messageSpecs[] = [
            'message' => $message,
            'message_type' => 'text',
            'client_message_id' => $clientMessageId,
            'attachment_ids' => [],
        ];
        $messageSpecs[] = [
            'message' => null,
            'message_type' => $attachmentMessageType,
            'client_message_id' => gradtrack_forum_chat_messages_attachment_client_id($clientMessageId),
            'attachment_ids' => $attachmentIds,
        ];
    } else {
        $messageSpecs[] = [
            'message' => $message !== '' ? $message : null,
            'message_type' => $hasAttachments ? $attachmentMessageType : 'text',
            'client_message_id' => $clientMessageId,
            'attachment_ids' => $attachmentIds,
        ];
    }

    $ownsTransaction = !$db->inTransaction();
    if ($ownsTransaction) {
        $db->beginTransaction();
    }
    $messageIds = [];
    $storagePromotions = [];

    if ($ownsTransaction && gradtrack_storage_uses_s3() && !empty($attachmentRows)) {
        try {
            foreach ($attachmentRows as $attachmentRow) {
                $sourceReference = (string) ($attachmentRow['storage_path'] ?? '');
                if (strpos($sourceReference, 'staging/chat/') !== 0) {
                    continue;
                }
                $storedExtension = strtolower((string) pathinfo((string) $attachmentRow['stored_name'], PATHINFO_EXTENSION));
                $destinationReference = 'private/chat/rooms/' . $roomId . '/attachments/'
                    . gradtrack_storage_uuid_filename($storedExtension);
                $destinationReference = gradtrack_storage_copy($sourceReference, $destinationReference);
                $storagePromotions[(int) $attachmentRow['id']] = [
                    'source' => $sourceReference,
                    'destination' => $destinationReference,
                ];
            }
        } catch (Throwable $promotionError) {
            foreach ($storagePromotions as $promotion) {
                gradtrack_storage_delete_quietly($promotion['destination']);
            }
            if ($ownsTransaction && $db->inTransaction()) {
                $db->rollBack();
            }
            throw $promotionError;
        }
    }

    try {
        if (!empty($storagePromotions)) {
            $updateStorageStmt = $db->prepare("UPDATE forum_chat_message_attachments
                                               SET storage_path = :storage_path
                                               WHERE id = :id
                                                 AND room_id = :room_id
                                                 AND uploaded_by = :uploaded_by
                                                 AND message_id IS NULL");
            foreach ($storagePromotions as $attachmentId => $promotion) {
                $updateStorageStmt->execute([
                    ':storage_path' => $promotion['destination'],
                    ':id' => $attachmentId,
                    ':room_id' => $roomId,
                    ':uploaded_by' => $currentGraduateId,
                ]);
                if ($updateStorageStmt->rowCount() !== 1) {
                    throw new RuntimeException('Failed to promote an uploaded chat attachment.');
                }
            }
        }

        $insertStmt = $db->prepare("INSERT INTO forum_chat_messages (room_id, graduate_id, message, message_type, client_message_id)
                                    VALUES (:room_id, :graduate_id, :message, :message_type, :client_message_id)");
        foreach ($messageSpecs as $specIndex => $messageSpec) {
            $insertStmt->execute([
                ':room_id' => $roomId,
                ':graduate_id' => $currentGraduateId,
                ':message' => $messageSpec['message'],
                ':message_type' => $messageSpec['message_type'],
                ':client_message_id' => $messageSpec['client_message_id'],
            ]);

            $messageId = (int) $db->lastInsertId();
            $messageIds[] = $messageId;
            $specAttachmentIds = $messageSpec['attachment_ids'];

            if (count($specAttachmentIds) > 0) {
                $params = [
                    ':message_id' => $messageId,
                    ':room_id' => $roomId,
                    ':uploaded_by' => $currentGraduateId,
                ];
                $placeholders = gradtrack_chat_placeholders($specAttachmentIds, 'claim_attachment_' . $specIndex, $params);
                $updateAttachmentStmt = $db->prepare("UPDATE forum_chat_message_attachments
                                                      SET message_id = :message_id
                                                      WHERE id IN ($placeholders)
                                                        AND room_id = :room_id
                                                        AND uploaded_by = :uploaded_by
                                                        AND message_id IS NULL");
                $updateAttachmentStmt->execute($params);

                if ($updateAttachmentStmt->rowCount() !== count($specAttachmentIds)) {
                    throw new RuntimeException('Failed to attach uploaded files to message');
                }
            }
        }

        $updateRoomStmt = $db->prepare('UPDATE forum_chat_rooms SET last_message_at = NOW(), updated_at = NOW() WHERE id = :room_id');
        $updateRoomStmt->execute([':room_id' => $roomId]);

        if ($ownsTransaction) {
            $db->commit();
        }
    } catch (Throwable $e) {
        if ($ownsTransaction && $db->inTransaction()) {
            $db->rollBack();
        }
        foreach ($storagePromotions as $promotion) {
            gradtrack_storage_delete_quietly($promotion['destination']);
        }
        if ($e instanceof PDOException && $e->getCode() === '23000') {
            $duplicateMessages = gradtrack_forum_chat_messages_fetch_client_batch($db, $roomId, $currentGraduateId, $clientMessageId);
            if (count($duplicateMessages) > 0) {
                return $duplicateMessages;
            }
        }
        throw $e;
    }

    foreach ($storagePromotions as $promotion) {
        gradtrack_storage_delete_quietly($promotion['source']);
    }

    $savedMessages = [];
    foreach ($messageIds as $messageId) {
        $messageRow = gradtrack_forum_chat_messages_fetch_one($db, $messageId, $currentGraduateId);
        if (!$messageRow) {
            throw new RuntimeException('Unable to load saved message');
        }
        $savedMessages[] = $messageRow;
    }

    return $savedMessages;
}

function gradtrack_forum_chat_messages_mark_read(PDO $db, int $roomId, int $currentGraduateId, int $upToMessageId): array
{
    if ($upToMessageId <= 0) {
        gradtrack_forum_chat_messages_json_error(400, 'up_to_message_id is required');
    }

    $boundaryStmt = $db->prepare("SELECT created_at
                                  FROM forum_chat_messages
                                  WHERE id = :message_id
                                    AND room_id = :room_id
                                    AND deleted_at IS NULL
                                  LIMIT 1");
    $boundaryStmt->execute([
        ':message_id' => $upToMessageId,
        ':room_id' => $roomId,
    ]);
    $boundary = $boundaryStmt->fetch(PDO::FETCH_ASSOC);
    if (!$boundary) {
        gradtrack_forum_chat_messages_json_error(400, 'Message is not part of this conversation');
    }

    $updateMemberStmt = $db->prepare("UPDATE forum_chat_members
                                      SET last_read_at = CASE
                                          WHEN last_read_at IS NULL OR last_read_at < :read_at_compare THEN :read_at_value
                                          ELSE last_read_at
                                      END
                                      WHERE room_id = :room_id
                                        AND graduate_id = :graduate_id");
    $updateMemberStmt->execute([
        ':read_at_compare' => $boundary['created_at'],
        ':read_at_value' => $boundary['created_at'],
        ':room_id' => $roomId,
        ':graduate_id' => $currentGraduateId,
    ]);

    $updateMessagesStmt = $db->prepare("UPDATE forum_chat_messages
                                        SET read_at = COALESCE(read_at, NOW()),
                                            delivered_at = COALESCE(delivered_at, NOW())
                                        WHERE room_id = :room_id
                                          AND graduate_id <> :graduate_id
                                          AND id <= :up_to_message_id
                                          AND deleted_at IS NULL");
    $updateMessagesStmt->execute([
        ':room_id' => $roomId,
        ':graduate_id' => $currentGraduateId,
        ':up_to_message_id' => $upToMessageId,
    ]);

    $stmt = $db->prepare("SELECT id, read_at
                          FROM forum_chat_messages
                          WHERE room_id = :room_id
                            AND graduate_id <> :graduate_id
                            AND id <= :up_to_message_id
                            AND read_at IS NOT NULL
                          ORDER BY id ASC");
    $stmt->execute([
        ':room_id' => $roomId,
        ':graduate_id' => $currentGraduateId,
        ':up_to_message_id' => $upToMessageId,
    ]);

    return array_map(function ($row) {
        return [
            'id' => (int) $row['id'],
            'read_at' => gradtrack_chat_datetime_iso($row['read_at'] ?? null),
        ];
    }, $stmt->fetchAll(PDO::FETCH_ASSOC));
}

if (defined('GRADTRACK_CHAT_MESSAGES_LIBRARY_ONLY') && GRADTRACK_CHAT_MESSAGES_LIBRARY_ONLY) {
    return;
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    gradtrack_chat_prepare_schema($db);
    $user = gradtrack_require_graduate_auth($db);
    $currentGraduateId = (int) $user['graduate_id'];

    if ($method === 'GET') {
        $roomId = isset($_GET['room_id']) ? (int) $_GET['room_id'] : 0;
        $beforeId = isset($_GET['before_id']) ? (int) $_GET['before_id'] : null;
        $afterId = isset($_GET['after_id']) ? (int) $_GET['after_id'] : null;
        $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 30;
        if ($roomId <= 0) {
            gradtrack_forum_chat_messages_json_error(400, 'room_id is required');
        }

        $room = gradtrack_forum_chat_messages_room_context($db, $roomId, $currentGraduateId);
        $room['participants'] = gradtrack_forum_chat_messages_participants($db, $roomId);
        $room['participant_count'] = count($room['participants']);

        $messagePage = gradtrack_forum_chat_messages_fetch($db, $roomId, $currentGraduateId, $beforeId, $afterId, $limit);

        echo json_encode([
            'success' => true,
            'data' => [
                'room' => $room,
                'messages' => $messagePage['messages'],
                'pagination' => $messagePage['pagination'],
            ],
        ]);
        exit;
    }

    if ($method === 'POST') {
        $data = gradtrack_forum_chat_messages_request_data();
        $roomId = isset($data['room_id']) ? (int) $data['room_id'] : 0;
        $message = gradtrack_forum_clean_text($data['message'] ?? '');
        $clientMessageId = gradtrack_forum_clean_text($data['client_message_id'] ?? '');
        $attachmentIds = (array) ($data['attachment_ids'] ?? []);
        $action = gradtrack_forum_clean_text($data['action'] ?? 'send');

        if ($roomId <= 0) {
            gradtrack_forum_chat_messages_json_error(400, 'room_id is required');
        }

        gradtrack_forum_chat_messages_room_context($db, $roomId, $currentGraduateId);

        if ($action === 'read') {
            $readRows = gradtrack_forum_chat_messages_mark_read($db, $roomId, $currentGraduateId, (int) ($data['up_to_message_id'] ?? 0));

            echo json_encode([
                'success' => true,
                'message' => 'Messages marked as read',
                'data' => [
                    'read_messages' => $readRows,
                ],
            ]);
            exit;
        }

        $savedMessages = gradtrack_forum_chat_messages_insert($db, $roomId, $currentGraduateId, $message, $clientMessageId, $attachmentIds);
        $savedMessage = $savedMessages[count($savedMessages) - 1];

        echo json_encode([
            'success' => true,
            'message' => 'Message sent',
            'id' => (int) $savedMessage['id'],
            'data' => [
                'message' => $savedMessage,
                'messages' => $savedMessages,
            ],
        ]);
        exit;
    }

    gradtrack_forum_chat_messages_json_error(405, 'Method not allowed');
} catch (Throwable $e) {
    error_log('GradTrack chat messages API error: ' . $e->getMessage());
    gradtrack_forum_chat_messages_json_error(500, 'Unable to process messages right now');
}
