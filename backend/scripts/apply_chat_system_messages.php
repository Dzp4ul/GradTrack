<?php
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../api/config/database.php';

try {
    $db = (new Database())->getConnection();
    $db->exec("ALTER TABLE forum_chat_messages
               MODIFY COLUMN message_type ENUM('text', 'image', 'file', 'mixed', 'system')
               NOT NULL DEFAULT 'text'");

    $stmt = $db->query("SELECT COLUMN_TYPE
                        FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE()
                          AND TABLE_NAME = 'forum_chat_messages'
                          AND COLUMN_NAME = 'message_type'
                        LIMIT 1");
    $columnType = (string) $stmt->fetchColumn();
    if (!str_contains($columnType, "'system'")) {
        throw new RuntimeException('The system message type was not installed');
    }

    echo 'Chat system-message migration applied successfully.' . PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, 'Chat system-message migration failed: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
