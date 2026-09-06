<?php

if (!function_exists('gradtrack_genai_ensure_conversation_schema')) {
    function gradtrack_genai_ensure_conversation_schema(PDO $db): void
    {
        if (!gradtrack_runtime_schema_changes_allowed()) return;
        $db->exec("CREATE TABLE IF NOT EXISTS ai_conversations (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            admin_user_id INT NOT NULL,
            role VARCHAR(40) NOT NULL,
            title VARCHAR(120) NOT NULL DEFAULT 'New conversation',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_ai_conversations_owner_activity (admin_user_id, role, updated_at, id),
            CONSTRAINT fk_ai_conversations_admin_user
                FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $db->exec("CREATE TABLE IF NOT EXISTS ai_messages (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            conversation_id BIGINT UNSIGNED NOT NULL,
            sender ENUM('user', 'assistant') NOT NULL,
            message MEDIUMTEXT NOT NULL,
            metadata JSON NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_ai_messages_conversation_created (conversation_id, created_at, id),
            CONSTRAINT fk_ai_messages_conversation
                FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }
}

if (!function_exists('gradtrack_genai_conversation_title')) {
    function gradtrack_genai_conversation_title(string $message): string
    {
        $title = trim((string) (preg_replace('/\s+/u', ' ', strip_tags($message)) ?? ''));
        $limit = 72;
        if (function_exists('mb_strlen') && function_exists('mb_substr')) {
            if (mb_strlen($title, 'UTF-8') > $limit) {
                $title = rtrim(mb_substr($title, 0, $limit - 1, 'UTF-8')) . '…';
            }
        } elseif (strlen($title) > $limit) {
            $title = rtrim(substr($title, 0, $limit - 3)) . '...';
        }

        return $title !== '' ? $title : 'New conversation';
    }
}

if (!function_exists('gradtrack_genai_find_conversation')) {
    function gradtrack_genai_find_conversation(PDO $db, int $conversationId, int $adminUserId, string $role): ?array
    {
        if ($conversationId <= 0) {
            return null;
        }

        $stmt = $db->prepare("SELECT id, admin_user_id, role, title, created_at, updated_at
                              FROM ai_conversations
                              WHERE id = :id AND admin_user_id = :admin_user_id AND role = :role
                              LIMIT 1");
        $stmt->execute([
            ':id' => $conversationId,
            ':admin_user_id' => $adminUserId,
            ':role' => $role,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        $row['id'] = (int) $row['id'];
        $row['admin_user_id'] = (int) $row['admin_user_id'];
        return $row;
    }
}

if (!function_exists('gradtrack_genai_create_conversation')) {
    function gradtrack_genai_create_conversation(PDO $db, int $adminUserId, string $role, string $title = 'New conversation'): array
    {
        $stmt = $db->prepare("INSERT INTO ai_conversations (admin_user_id, role, title)
                              VALUES (:admin_user_id, :role, :title)");
        $stmt->execute([
            ':admin_user_id' => $adminUserId,
            ':role' => $role,
            ':title' => $title,
        ]);

        $conversation = gradtrack_genai_find_conversation($db, (int) $db->lastInsertId(), $adminUserId, $role);
        if ($conversation === null) {
            throw new RuntimeException('Unable to create the AI conversation.');
        }
        return $conversation;
    }
}

if (!function_exists('gradtrack_genai_list_conversations')) {
    function gradtrack_genai_list_conversations(PDO $db, int $adminUserId, string $role, int $limit = 100): array
    {
        $limit = max(1, min(200, $limit));
        $stmt = $db->prepare("SELECT c.id, c.title, c.created_at, c.updated_at,
                                    lm.message AS last_message_preview,
                                    lm.sender AS last_message_sender,
                                    lm.created_at AS last_message_at,
                                    (SELECT COUNT(*) FROM ai_messages cm WHERE cm.conversation_id = c.id) AS message_count
                              FROM ai_conversations c
                              LEFT JOIN ai_messages lm ON lm.id = (
                                  SELECT m.id FROM ai_messages m
                                  WHERE m.conversation_id = c.id
                                  ORDER BY m.created_at DESC, m.id DESC
                                  LIMIT 1
                              )
                              WHERE c.admin_user_id = :admin_user_id AND c.role = :role
                                AND EXISTS (SELECT 1 FROM ai_messages visible WHERE visible.conversation_id = c.id)
                              ORDER BY c.updated_at DESC, c.id DESC
                              LIMIT :limit");
        $stmt->bindValue(':admin_user_id', $adminUserId, PDO::PARAM_INT);
        $stmt->bindValue(':role', $role, PDO::PARAM_STR);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();

        return array_map(static function (array $row): array {
            $preview = trim((string) ($row['last_message_preview'] ?? ''));
            if (function_exists('mb_substr')) {
                $preview = mb_substr($preview, 0, 140, 'UTF-8');
            } else {
                $preview = substr($preview, 0, 140);
            }
            return [
                'id' => (int) $row['id'],
                'title' => (string) $row['title'],
                'created_at' => (string) $row['created_at'],
                'updated_at' => (string) $row['updated_at'],
                'last_message_preview' => $preview,
                'last_message_sender' => $row['last_message_sender'] !== null ? (string) $row['last_message_sender'] : null,
                'last_message_at' => $row['last_message_at'] !== null ? (string) $row['last_message_at'] : null,
                'message_count' => (int) $row['message_count'],
            ];
        }, $stmt->fetchAll(PDO::FETCH_ASSOC));
    }
}

if (!function_exists('gradtrack_genai_load_messages')) {
    function gradtrack_genai_load_messages(PDO $db, int $conversationId, int $adminUserId, string $role, ?int $limit = null): array
    {
        if (gradtrack_genai_find_conversation($db, $conversationId, $adminUserId, $role) === null) {
            throw new OutOfBoundsException('AI conversation not found.');
        }

        if ($limit === null) {
            $stmt = $db->prepare("SELECT id, sender, message, metadata, created_at
                                  FROM ai_messages
                                  WHERE conversation_id = :conversation_id
                                  ORDER BY created_at ASC, id ASC");
        } else {
            $limit = max(1, min(100, $limit));
            $stmt = $db->prepare("SELECT recent.id, recent.sender, recent.message, recent.metadata, recent.created_at
                                  FROM (
                                      SELECT id, sender, message, metadata, created_at
                                      FROM ai_messages
                                      WHERE conversation_id = :conversation_id
                                      ORDER BY created_at DESC, id DESC
                                      LIMIT :limit
                                  ) recent
                                  ORDER BY recent.created_at ASC, recent.id ASC");
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        }
        $stmt->bindValue(':conversation_id', $conversationId, PDO::PARAM_INT);
        $stmt->execute();

        return array_map(static function (array $row): array {
            $metadata = null;
            if (is_string($row['metadata'] ?? null) && trim((string) $row['metadata']) !== '') {
                $decoded = json_decode((string) $row['metadata'], true);
                $metadata = is_array($decoded) ? $decoded : null;
            }
            return [
                'id' => (int) $row['id'],
                'sender' => (string) $row['sender'],
                'message' => (string) $row['message'],
                'metadata' => $metadata,
                'created_at' => (string) $row['created_at'],
            ];
        }, $stmt->fetchAll(PDO::FETCH_ASSOC));
    }
}

if (!function_exists('gradtrack_genai_append_message')) {
    function gradtrack_genai_append_message(PDO $db, int $conversationId, int $adminUserId, string $role, string $sender, string $message, ?array $metadata = null): array
    {
        if (!in_array($sender, ['user', 'assistant'], true)) {
            throw new InvalidArgumentException('Invalid AI message sender.');
        }
        $conversation = gradtrack_genai_find_conversation($db, $conversationId, $adminUserId, $role);
        if ($conversation === null) {
            throw new OutOfBoundsException('AI conversation not found.');
        }

        $stmt = $db->prepare("INSERT INTO ai_messages (conversation_id, sender, message, metadata)
                              VALUES (:conversation_id, :sender, :message, :metadata)");
        $stmt->execute([
            ':conversation_id' => $conversationId,
            ':sender' => $sender,
            ':message' => $message,
            ':metadata' => $metadata === null ? null : json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
        $messageId = (int) $db->lastInsertId();

        if ($sender === 'user') {
            $countStmt = $db->prepare("SELECT COUNT(*) FROM ai_messages WHERE conversation_id = :conversation_id AND sender = 'user'");
            $countStmt->execute([':conversation_id' => $conversationId]);
            if ((int) $countStmt->fetchColumn() === 1) {
                $titleStmt = $db->prepare("UPDATE ai_conversations SET title = :title, updated_at = CURRENT_TIMESTAMP WHERE id = :id");
                $titleStmt->execute([
                    ':title' => gradtrack_genai_conversation_title($message),
                    ':id' => $conversationId,
                ]);
            }
        }

        $db->prepare("UPDATE ai_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = :id")
            ->execute([':id' => $conversationId]);

        $rowStmt = $db->prepare("SELECT id, sender, message, metadata, created_at FROM ai_messages WHERE id = :id LIMIT 1");
        $rowStmt->execute([':id' => $messageId]);
        $row = $rowStmt->fetch(PDO::FETCH_ASSOC) ?: [];
        return [
            'id' => (int) ($row['id'] ?? $messageId),
            'sender' => (string) ($row['sender'] ?? $sender),
            'message' => (string) ($row['message'] ?? $message),
            'metadata' => $metadata,
            'created_at' => (string) ($row['created_at'] ?? date('Y-m-d H:i:s')),
        ];
    }
}

if (!function_exists('gradtrack_genai_delete_conversation')) {
    function gradtrack_genai_delete_conversation(PDO $db, int $conversationId, int $adminUserId, string $role): bool
    {
        $stmt = $db->prepare("DELETE FROM ai_conversations
                              WHERE id = :id AND admin_user_id = :admin_user_id AND role = :role");
        $stmt->execute([
            ':id' => $conversationId,
            ':admin_user_id' => $adminUserId,
            ':role' => $role,
        ]);
        return $stmt->rowCount() > 0;
    }
}

if (!function_exists('gradtrack_genai_recent_context')) {
    function gradtrack_genai_recent_context(array $messages, int $limit = 8): array
    {
        $tail = array_slice($messages, -max(1, $limit));
        $conversation = [];
        $lastDataTool = null;
        foreach ($tail as $message) {
            if (!is_array($message)) {
                continue;
            }
            $sender = (string) ($message['sender'] ?? '');
            if (in_array($sender, ['user', 'assistant'], true)) {
                $conversation[] = [
                    'role' => $sender,
                    'content' => (string) ($message['message'] ?? ''),
                ];
            }
            $metadata = is_array($message['metadata'] ?? null) ? $message['metadata'] : [];
            if (array_key_exists('data_tool', $metadata)) {
                $tool = $metadata['data_tool'];
                $lastDataTool = is_string($tool) && $tool !== '' ? $tool : null;
            } else {
                $tool = $metadata['response']['context']['dataTool'] ?? null;
                if (is_string($tool) && $tool !== '') {
                    $lastDataTool = $tool;
                }
            }
        }
        return ['conversation' => $conversation, 'last_data_tool' => $lastDataTool];
    }
}
