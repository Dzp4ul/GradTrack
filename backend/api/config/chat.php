<?php
require_once __DIR__ . '/storage.php';

require_once __DIR__ . '/forum.php';

if (!function_exists('gradtrack_chat_datetime_iso')) {
    function gradtrack_chat_datetime_iso($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if ($value instanceof DateTimeInterface) {
            return $value->format(DateTimeInterface::ATOM);
        }

        $rawTimezone = trim(function_exists('gradtrack_env') ? (string) gradtrack_env('DB_TIMEZONE', '+08:00') : '+08:00');
        try {
            $databaseTimezone = new DateTimeZone($rawTimezone);
        } catch (Throwable $e) {
            $databaseTimezone = new DateTimeZone('Asia/Manila');
        }

        $rawValue = trim((string) $value);
        $date = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $rawValue, $databaseTimezone);
        if (!$date) {
            try {
                $date = new DateTimeImmutable($rawValue, $databaseTimezone);
            } catch (Throwable $e) {
                return $rawValue;
            }
        }

        return $date->format(DateTimeInterface::ATOM);
    }
}

if (!function_exists('gradtrack_chat_column_exists')) {
    function gradtrack_chat_column_exists(PDO $db, string $table, string $column): bool
    {
        if (function_exists('gradtrack_forum_column_exists')) {
            return gradtrack_forum_column_exists($db, $table, $column);
        }

        $stmt = $db->prepare("SELECT COUNT(*) AS total
                              FROM INFORMATION_SCHEMA.COLUMNS
                              WHERE TABLE_SCHEMA = DATABASE()
                                AND TABLE_NAME = :table_name
                                AND COLUMN_NAME = :column_name");
        $stmt->execute([
            ':table_name' => $table,
            ':column_name' => $column,
        ]);

        return (int) ($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0) > 0;
    }
}

if (!function_exists('gradtrack_chat_index_exists')) {
    function gradtrack_chat_index_exists(
        PDO $db,
        string $table,
        string $index,
        array $columns = [],
        bool $requireUnique = false
    ): bool
    {
        $stmt = $db->prepare("SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX
                              FROM INFORMATION_SCHEMA.STATISTICS
                              WHERE TABLE_SCHEMA = DATABASE()
                                AND TABLE_NAME = :table_name
                              ORDER BY INDEX_NAME, SEQ_IN_INDEX");
        $stmt->execute([':table_name' => $table]);

        $indexes = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $name = (string) $row['INDEX_NAME'];
            if (!isset($indexes[$name])) {
                $indexes[$name] = [
                    'non_unique' => (int) $row['NON_UNIQUE'],
                    'columns' => [],
                ];
            }
            $indexes[$name]['columns'][] = (string) $row['COLUMN_NAME'];
        }

        if (isset($indexes[$index])) {
            return true;
        }

        foreach ($indexes as $existing) {
            if ($existing['columns'] === $columns && (!$requireUnique || $existing['non_unique'] === 0)) {
                return true;
            }
        }

        return false;
    }
}

if (!function_exists('gradtrack_chat_column_is_nullable')) {
    function gradtrack_chat_column_is_nullable(PDO $db, string $table, string $column): bool
    {
        $stmt = $db->prepare("SELECT IS_NULLABLE
                              FROM INFORMATION_SCHEMA.COLUMNS
                              WHERE TABLE_SCHEMA = DATABASE()
                                AND TABLE_NAME = :table_name
                                AND COLUMN_NAME = :column_name
                              LIMIT 1");
        $stmt->execute([
            ':table_name' => $table,
            ':column_name' => $column,
        ]);

        return strtoupper((string) ($stmt->fetch(PDO::FETCH_ASSOC)['IS_NULLABLE'] ?? 'NO')) === 'YES';
    }
}

if (!function_exists('gradtrack_chat_ensure_schema')) {
    function gradtrack_chat_ensure_schema(PDO $db): void
    {
        gradtrack_forum_ensure_schema($db);

        $roomColumns = [
            'last_message_at' => "ALTER TABLE forum_chat_rooms ADD last_message_at DATETIME NULL AFTER updated_at",
        ];

        foreach ($roomColumns as $column => $sql) {
            if (!gradtrack_chat_column_exists($db, 'forum_chat_rooms', $column)) {
                $db->exec($sql);
            }
        }

        $memberColumns = [
            'last_read_at' => "ALTER TABLE forum_chat_members ADD last_read_at DATETIME NULL AFTER joined_at",
            'last_read_message_id' => "ALTER TABLE forum_chat_members ADD last_read_message_id INT NULL AFTER last_read_at",
            'created_at' => "ALTER TABLE forum_chat_members ADD created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER last_read_message_id",
            'updated_at' => "ALTER TABLE forum_chat_members ADD updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at",
        ];

        foreach ($memberColumns as $column => $sql) {
            if (!gradtrack_chat_column_exists($db, 'forum_chat_members', $column)) {
                $db->exec($sql);
            }
        }

        if (
            gradtrack_chat_column_exists($db, 'forum_chat_messages', 'message')
            && !gradtrack_chat_column_is_nullable($db, 'forum_chat_messages', 'message')
        ) {
            $db->exec("ALTER TABLE forum_chat_messages MODIFY message TEXT NULL");
        }

        $messageColumns = [
            'message_type' => "ALTER TABLE forum_chat_messages ADD message_type ENUM('text', 'image', 'file', 'mixed') NOT NULL DEFAULT 'text' AFTER message",
            'client_message_id' => "ALTER TABLE forum_chat_messages ADD client_message_id VARCHAR(80) NULL AFTER message_type",
            'delivered_at' => "ALTER TABLE forum_chat_messages ADD delivered_at DATETIME NULL AFTER client_message_id",
            'read_at' => "ALTER TABLE forum_chat_messages ADD read_at DATETIME NULL AFTER delivered_at",
            'updated_at' => "ALTER TABLE forum_chat_messages ADD updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at",
            'deleted_at' => "ALTER TABLE forum_chat_messages ADD deleted_at DATETIME NULL AFTER updated_at",
        ];

        foreach ($messageColumns as $column => $sql) {
            if (!gradtrack_chat_column_exists($db, 'forum_chat_messages', $column)) {
                $db->exec($sql);
            }
        }

        $indexes = [
            'forum_chat_rooms' => [
                'idx_forum_chat_rooms_last_message' => [['last_message_at', 'updated_at', 'id'], false, "ALTER TABLE forum_chat_rooms ADD INDEX idx_forum_chat_rooms_last_message (last_message_at, updated_at, id)"],
            ],
            'forum_chat_members' => [
                'idx_forum_chat_members_read' => [['room_id', 'graduate_id', 'last_read_at'], false, "ALTER TABLE forum_chat_members ADD INDEX idx_forum_chat_members_read (room_id, graduate_id, last_read_at)"],
                'idx_forum_chat_members_read_message' => [['room_id', 'graduate_id', 'last_read_message_id'], false, "ALTER TABLE forum_chat_members ADD INDEX idx_forum_chat_members_read_message (room_id, graduate_id, last_read_message_id)"],
            ],
            'forum_chat_messages' => [
                'idx_forum_chat_messages_room_id' => [['room_id', 'id'], false, "ALTER TABLE forum_chat_messages ADD INDEX idx_forum_chat_messages_room_id (room_id, id)"],
                'idx_forum_chat_messages_sender_created' => [['graduate_id', 'created_at'], false, "ALTER TABLE forum_chat_messages ADD INDEX idx_forum_chat_messages_sender_created (graduate_id, created_at)"],
                'idx_forum_chat_messages_created' => [['created_at', 'id'], false, "ALTER TABLE forum_chat_messages ADD INDEX idx_forum_chat_messages_created (created_at, id)"],
                'uniq_forum_chat_client_message' => [['room_id', 'graduate_id', 'client_message_id'], true, "ALTER TABLE forum_chat_messages ADD UNIQUE KEY uniq_forum_chat_client_message (room_id, graduate_id, client_message_id)"],
            ],
        ];

        foreach ($indexes as $table => $tableIndexes) {
            foreach ($tableIndexes as $index => $definition) {
                [$columns, $requireUnique, $sql] = $definition;
                if (!gradtrack_chat_index_exists($db, $table, $index, $columns, $requireUnique)) {
                    $db->exec($sql);
                }
            }
        }

        $db->exec("CREATE TABLE IF NOT EXISTS forum_chat_message_attachments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            room_id INT NOT NULL,
            message_id INT NULL,
            uploaded_by INT NOT NULL,
            original_name VARCHAR(255) NOT NULL,
            stored_name VARCHAR(255) NOT NULL,
            storage_path VARCHAR(255) NOT NULL,
            mime_type VARCHAR(120) NOT NULL,
            file_size INT NOT NULL,
            attachment_type ENUM('image', 'file') NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_forum_chat_attachment_path (storage_path),
            INDEX idx_forum_chat_attachment_message (message_id),
            INDEX idx_forum_chat_attachment_room (room_id, created_at),
            INDEX idx_forum_chat_attachment_uploader (uploaded_by),
            CONSTRAINT fk_forum_chat_attachment_room FOREIGN KEY (room_id) REFERENCES forum_chat_rooms(id) ON DELETE CASCADE,
            CONSTRAINT fk_forum_chat_attachment_message FOREIGN KEY (message_id) REFERENCES forum_chat_messages(id) ON DELETE CASCADE,
            CONSTRAINT fk_forum_chat_attachment_uploader FOREIGN KEY (uploaded_by) REFERENCES graduates(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $db->exec("CREATE TABLE IF NOT EXISTS graduate_presence (
            graduate_id INT PRIMARY KEY,
            last_active_at DATETIME NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_graduate_presence_graduate FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $db->exec("UPDATE forum_chat_rooms r
                   SET r.last_message_at = (
                       SELECT MAX(fcm.created_at)
                       FROM forum_chat_messages fcm
                       WHERE fcm.room_id = r.id
                         AND fcm.deleted_at IS NULL
                   )
                   WHERE r.last_message_at IS NULL");

        $db->exec("UPDATE forum_chat_members member
                   SET member.last_read_message_id = (
                       SELECT MAX(message.id)
                       FROM forum_chat_messages message
                       WHERE message.room_id = member.room_id
                         AND message.deleted_at IS NULL
                         AND member.last_read_at IS NOT NULL
                         AND message.created_at <= member.last_read_at
                   )
                   WHERE member.last_read_message_id IS NULL
                     AND member.last_read_at IS NOT NULL");
    }
}

if (!function_exists('gradtrack_chat_prepare_schema')) {
    function gradtrack_chat_prepare_schema(PDO $db): void
    {
        static $prepared = false;
        if ($prepared) {
            return;
        }

        $autoMigrate = filter_var(getenv('CHAT_AUTO_MIGRATE') ?: 'false', FILTER_VALIDATE_BOOLEAN);
        if ($autoMigrate) {
            gradtrack_chat_ensure_schema($db);
        }

        $prepared = true;
    }
}

if (!function_exists('gradtrack_chat_normalize_message')) {
    function gradtrack_chat_normalize_message($value): string
    {
        $message = str_replace(["\r\n", "\r"], "\n", (string) ($value ?? ''));
        $message = preg_replace('/[\x00\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $message);
        return trim((string) $message);
    }
}

if (!function_exists('gradtrack_chat_placeholders')) {
    function gradtrack_chat_placeholders(array $ids, string $prefix, array &$params): string
    {
        $placeholders = [];
        foreach ($ids as $index => $id) {
            $placeholder = ':' . $prefix . '_' . $index;
            $placeholders[] = $placeholder;
            $params[$placeholder] = (int) $id;
        }

        return implode(', ', $placeholders);
    }
}

if (!function_exists('gradtrack_chat_require_room_member')) {
    function gradtrack_chat_require_room_member(PDO $db, int $roomId, int $graduateId): array
    {
        $stmt = $db->prepare("SELECT r.id, r.created_by, r.name, r.is_group, r.created_at, r.updated_at, r.last_message_at
                              FROM forum_chat_rooms r
                              JOIN forum_chat_members fcm
                                ON fcm.room_id = r.id
                               AND fcm.graduate_id = :graduate_id
                              WHERE r.id = :room_id
                              LIMIT 1");
        $stmt->execute([
            ':graduate_id' => $graduateId,
            ':room_id' => $roomId,
        ]);

        $room = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$room) {
            throw new RuntimeException('Chat room not found');
        }

        $room['id'] = (int) $room['id'];
        $room['created_by'] = (int) $room['created_by'];
        $room['is_group'] = (int) ($room['is_group'] ?? 0) === 1;
        $room['created_at'] = gradtrack_chat_datetime_iso($room['created_at'] ?? null);
        $room['updated_at'] = gradtrack_chat_datetime_iso($room['updated_at'] ?? null);
        $room['last_message_at'] = gradtrack_chat_datetime_iso($room['last_message_at'] ?? null);

        return $room;
    }
}

if (!function_exists('gradtrack_chat_participants')) {
    function gradtrack_chat_participants(PDO $db, int $roomId): array
    {
        $stmt = $db->prepare("SELECT g.id AS graduate_id,
                                     TRIM(CONCAT(COALESCE(g.first_name, ''), ' ', COALESCE(g.last_name, ''))) AS full_name,
                                     p.code AS program_code,
                                     g.year_graduated,
                                     gpi.file_path AS profile_image_path,
                                     gp.last_active_at
                              FROM forum_chat_members fcm
                              JOIN graduates g ON g.id = fcm.graduate_id
                              LEFT JOIN graduate_accounts ga ON ga.graduate_id = g.id
                              LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
                              LEFT JOIN programs p ON p.id = g.program_id
                              LEFT JOIN graduate_presence gp ON gp.graduate_id = g.id
                              WHERE fcm.room_id = :room_id
                              ORDER BY g.first_name ASC, g.last_name ASC");
        $stmt->execute([':room_id' => $roomId]);

        $participants = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $participants[] = [
                'graduate_id' => (int) $row['graduate_id'],
                'full_name' => trim((string) ($row['full_name'] ?? '')) ?: 'Graduate',
                'program_code' => $row['program_code'] ?? null,
                'year_graduated' => $row['year_graduated'] !== null ? (int) $row['year_graduated'] : null,
                'profile_image_path' => gradtrack_storage_media_access_reference($row['profile_image_path'] ?? null),
                'last_active_at' => gradtrack_chat_datetime_iso($row['last_active_at'] ?? null),
                'is_online' => false,
            ];
        }

        return $participants;
    }
}

if (!function_exists('gradtrack_chat_format_attachment')) {
    function gradtrack_chat_format_attachment(array $row): array
    {
        $id = (int) $row['id'];

        return [
            'id' => $id,
            'message_id' => isset($row['message_id']) ? (int) $row['message_id'] : null,
            'room_id' => (int) $row['room_id'],
            'original_name' => (string) $row['original_name'],
            'stored_name' => (string) $row['stored_name'],
            'mime_type' => (string) $row['mime_type'],
            'file_size' => (int) $row['file_size'],
            'attachment_type' => (string) $row['attachment_type'],
            'created_at' => gradtrack_chat_datetime_iso($row['created_at'] ?? null),
            'url' => 'api/forum/chat-attachments.php?id=' . $id,
            'download_url' => 'api/forum/chat-attachments.php?id=' . $id . '&download=1',
        ];
    }
}

if (!function_exists('gradtrack_chat_attachments_by_message_ids')) {
    function gradtrack_chat_attachments_by_message_ids(PDO $db, array $messageIds): array
    {
        $messageIds = array_values(array_unique(array_filter(array_map('intval', $messageIds))));
        if (count($messageIds) === 0) {
            return [];
        }

        $params = [];
        $placeholders = gradtrack_chat_placeholders($messageIds, 'message_id', $params);
        $stmt = $db->prepare("SELECT id, room_id, message_id, original_name, stored_name, storage_path, mime_type, file_size, attachment_type, created_at
                              FROM forum_chat_message_attachments
                              WHERE message_id IN ($placeholders)
                              ORDER BY id ASC");
        $stmt->execute($params);

        $grouped = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $messageId = (int) $row['message_id'];
            if (!isset($grouped[$messageId])) {
                $grouped[$messageId] = [];
            }
            $grouped[$messageId][] = gradtrack_chat_format_attachment($row);
        }

        return $grouped;
    }
}

if (!function_exists('gradtrack_chat_format_message')) {
    function gradtrack_chat_format_message(array $row, int $currentGraduateId, array $attachments = []): array
    {
        $senderId = (int) $row['graduate_id'];

        return [
            'id' => (int) $row['id'],
            'room_id' => (int) $row['room_id'],
            'graduate_id' => $senderId,
            'message' => (string) ($row['message'] ?? ''),
            'message_type' => (string) ($row['message_type'] ?? 'text'),
            'client_message_id' => $row['client_message_id'] ?? null,
            'created_at' => gradtrack_chat_datetime_iso($row['created_at'] ?? null),
            'updated_at' => gradtrack_chat_datetime_iso($row['updated_at'] ?? $row['created_at'] ?? null),
            'delivered_at' => gradtrack_chat_datetime_iso($row['delivered_at'] ?? null),
            'read_at' => gradtrack_chat_datetime_iso($row['read_at'] ?? null),
            'sender_name' => trim((string) ($row['first_name'] ?? '') . ' ' . (string) ($row['last_name'] ?? '')) ?: 'Graduate',
            'sender_program_code' => $row['sender_program_code'] ?? null,
            'sender_profile_image_path' => gradtrack_storage_media_access_reference($row['sender_profile_image_path'] ?? null),
            'is_mine' => $senderId === $currentGraduateId,
            'attachments' => $attachments,
            'status' => $senderId === $currentGraduateId
                ? (($row['read_at'] ?? null) ? 'read' : (($row['delivered_at'] ?? null) ? 'delivered' : 'sent'))
                : 'received',
        ];
    }
}

if (!function_exists('gradtrack_chat_message_preview')) {
    function gradtrack_chat_message_preview(?string $message, ?string $messageType): string
    {
        $clean = trim((string) ($message ?? ''));
        if ($clean !== '') {
            return $clean;
        }

        if ($messageType === 'image') {
            return 'Photo';
        }

        if ($messageType === 'file') {
            return 'Attachment';
        }

        if ($messageType === 'mixed') {
            return 'Message with attachment';
        }

        return 'No messages yet';
    }
}

if (!function_exists('gradtrack_chat_upload_base_dir')) {
    function gradtrack_chat_upload_base_dir(): string
    {
        $base = realpath(__DIR__ . '/../../');
        if ($base === false) {
            throw new RuntimeException('Unable to resolve backend upload directory');
        }

        return $base . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'chat-attachments';
    }
}

if (!function_exists('gradtrack_chat_upload_room_dir')) {
    function gradtrack_chat_upload_room_dir(int $roomId): string
    {
        return gradtrack_chat_upload_base_dir() . DIRECTORY_SEPARATOR . $roomId;
    }
}

if (!function_exists('gradtrack_chat_relative_attachment_path')) {
    function gradtrack_chat_relative_attachment_path(int $roomId, string $storedName): string
    {
        return 'uploads/chat-attachments/' . $roomId . '/' . $storedName;
    }
}

if (!function_exists('gradtrack_chat_create_dir')) {
    function gradtrack_chat_create_dir(string $dir): void
    {
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
    }
}

if (!function_exists('gradtrack_chat_sanitize_filename')) {
    function gradtrack_chat_sanitize_filename(string $name): string
    {
        $base = basename(str_replace('\\', '/', $name));
        $safe = preg_replace('/[^a-zA-Z0-9._ -]/', '_', $base);
        $safe = preg_replace('/\s+/', ' ', trim((string) $safe));
        return $safe !== '' && $safe !== '.' && $safe !== '..' ? $safe : 'attachment';
    }
}

if (!function_exists('gradtrack_chat_attachment_config')) {
    function gradtrack_chat_attachment_config(): array
    {
        $imageMaxMb = (int) (getenv('CHAT_IMAGE_MAX_MB') ?: 10);
        $documentMaxMb = (int) (getenv('CHAT_DOCUMENT_MAX_MB') ?: 25);
        $imageMax = max(1, $imageMaxMb) * 1024 * 1024;
        $documentMax = max(1, $documentMaxMb) * 1024 * 1024;

        return [
            'image/jpeg' => ['attachment_type' => 'image', 'extension' => 'jpg', 'max_size' => $imageMax, 'extensions' => ['jpg', 'jpeg']],
            'image/png' => ['attachment_type' => 'image', 'extension' => 'png', 'max_size' => $imageMax, 'extensions' => ['png']],
            'image/webp' => ['attachment_type' => 'image', 'extension' => 'webp', 'max_size' => $imageMax, 'extensions' => ['webp']],
            'application/pdf' => ['attachment_type' => 'file', 'extension' => 'pdf', 'max_size' => $documentMax, 'extensions' => ['pdf']],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => ['attachment_type' => 'file', 'extension' => 'docx', 'max_size' => $documentMax, 'extensions' => ['docx']],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => ['attachment_type' => 'file', 'extension' => 'xlsx', 'max_size' => $documentMax, 'extensions' => ['xlsx']],
            'application/vnd.openxmlformats-officedocument.presentationml.presentation' => ['attachment_type' => 'file', 'extension' => 'pptx', 'max_size' => $documentMax, 'extensions' => ['pptx']],
            'text/plain' => ['attachment_type' => 'file', 'extension' => 'txt', 'max_size' => $documentMax, 'extensions' => ['txt']],
            'text/csv' => ['attachment_type' => 'file', 'extension' => 'csv', 'max_size' => $documentMax, 'extensions' => ['csv']],
        ];
    }
}

if (!function_exists('gradtrack_chat_validate_attachment_file')) {
    function gradtrack_chat_validate_attachment_file(array $file): array
    {
        $errorCode = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($errorCode === UPLOAD_ERR_NO_FILE) {
            throw new RuntimeException('No attachment was uploaded');
        }
        if ($errorCode !== UPLOAD_ERR_OK) {
            throw new RuntimeException('Attachment upload failed');
        }

        $tmpPath = (string) ($file['tmp_name'] ?? '');
        if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
            throw new RuntimeException('Invalid uploaded attachment');
        }

        $fileSize = (int) ($file['size'] ?? 0);
        if ($fileSize <= 0) {
            throw new RuntimeException('Attachment must be at least 1 byte');
        }

        $originalName = gradtrack_chat_sanitize_filename((string) ($file['name'] ?? 'attachment'));
        $extension = strtolower((string) pathinfo($originalName, PATHINFO_EXTENSION));
        $dangerousExtensions = ['exe', 'bat', 'cmd', 'sh', 'js', 'mjs', 'cjs', 'php', 'php3', 'php4', 'php5', 'php7', 'php8', 'phtml', 'phar', 'jar', 'msi', 'com', 'scr', 'vbs', 'ps1', 'html', 'htm', 'svg', 'xhtml'];
        $nameSegments = array_map('strtolower', explode('.', $originalName));
        if (count(array_intersect($nameSegments, $dangerousExtensions)) > 0) {
            throw new RuntimeException('This file type is not allowed');
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($tmpPath) ?: 'application/octet-stream';
        $config = gradtrack_chat_attachment_config();
        if (!isset($config[$mimeType])) {
            throw new RuntimeException('Unsupported attachment type');
        }

        $attachmentConfig = $config[$mimeType];
        if ($fileSize > (int) $attachmentConfig['max_size']) {
            $maxMb = (int) round(((int) $attachmentConfig['max_size']) / 1024 / 1024);
            throw new RuntimeException('Attachment must be ' . $maxMb . ' MB or smaller');
        }

        if (!in_array($extension, $attachmentConfig['extensions'], true)) {
            throw new RuntimeException('Attachment extension does not match its content');
        }

        if ((string) $attachmentConfig['attachment_type'] === 'image') {
            $imageInfo = @getimagesize($tmpPath);
            if ($imageInfo === false || (int) $imageInfo[0] < 1 || (int) $imageInfo[1] < 1
                || (int) $imageInfo[0] > 8192 || (int) $imageInfo[1] > 8192) {
                throw new RuntimeException('Attachment image is malformed or has unsafe dimensions');
            }
        }

        $officeMimes = [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ];
        if (in_array($mimeType, $officeMimes, true)) {
            if (!class_exists('ZipArchive')) {
                throw new RuntimeException('Office document validation is unavailable on this server');
            }
            $archive = new ZipArchive();
            if ($archive->open($tmpPath) !== true) {
                throw new RuntimeException('Office document is malformed');
            }
            $hasMacro = $archive->locateName('word/vbaProject.bin', ZipArchive::FL_NOCASE) !== false
                || $archive->locateName('xl/vbaProject.bin', ZipArchive::FL_NOCASE) !== false
                || $archive->locateName('ppt/vbaProject.bin', ZipArchive::FL_NOCASE) !== false;
            $archive->close();
            if ($hasMacro) throw new RuntimeException('Macro-enabled Office documents are not allowed');
        }

        return [
            'tmp_path' => $tmpPath,
            'original_name' => $originalName,
            'extension' => $extension,
            'mime_type' => $mimeType,
            'file_size' => $fileSize,
            'attachment_type' => (string) $attachmentConfig['attachment_type'],
        ];
    }
}
