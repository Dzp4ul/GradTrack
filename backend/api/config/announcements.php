<?php
require_once __DIR__ . '/storage.php';

if (!function_exists('gradtrack_announcements_column_exists')) {
    function gradtrack_announcements_column_exists(PDO $db, string $column): bool
    {
        $stmt = $db->prepare("SELECT COUNT(*) AS total
                              FROM INFORMATION_SCHEMA.COLUMNS
                              WHERE TABLE_SCHEMA = DATABASE()
                                AND TABLE_NAME = 'announcements'
                                AND COLUMN_NAME = :column_name");
        $stmt->execute([':column_name' => $column]);
        return (int) ($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0) > 0;
    }
}

if (!function_exists('gradtrack_announcements_index_exists')) {
    function gradtrack_announcements_index_exists(PDO $db, string $index): bool
    {
        $stmt = $db->prepare("SELECT COUNT(*) AS total
                              FROM INFORMATION_SCHEMA.STATISTICS
                              WHERE TABLE_SCHEMA = DATABASE()
                                AND TABLE_NAME = 'announcements'
                                AND INDEX_NAME = :index_name");
        $stmt->execute([':index_name' => $index]);
        return (int) ($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0) > 0;
    }
}

if (!function_exists('gradtrack_announcements_foreign_key_exists')) {
    function gradtrack_announcements_foreign_key_exists(PDO $db, string $column): bool
    {
        $stmt = $db->prepare("SELECT COUNT(*) AS total
                              FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                              WHERE TABLE_SCHEMA = DATABASE()
                                AND TABLE_NAME = 'announcements'
                                AND COLUMN_NAME = :column_name
                                AND REFERENCED_TABLE_NAME IS NOT NULL");
        $stmt->execute([':column_name' => $column]);
        return (int) ($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0) > 0;
    }
}

if (!function_exists('gradtrack_announcements_ensure_schema')) {
    function gradtrack_announcements_ensure_schema(PDO $db): void
    {
        $db->exec("CREATE TABLE IF NOT EXISTS announcements (
            id INT AUTO_INCREMENT PRIMARY KEY,
            graduate_id INT NULL,
            created_by_admin_id INT NULL,
            title VARCHAR(255) NOT NULL,
            summary VARCHAR(500) NULL,
            content TEXT NOT NULL,
            category VARCHAR(50) NOT NULL DEFAULT 'general',
            event_date DATE NULL,
            cover_image_path VARCHAR(255) NULL,
            cover_image_original_name VARCHAR(255) NULL,
            cover_image_mime_type VARCHAR(120) NULL,
            cover_image_file_size_bytes INT NULL,
            status ENUM('draft','published','archived') NOT NULL DEFAULT 'published',
            published_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_announcements_graduate (graduate_id),
            INDEX idx_announcements_status_created (status, created_at),
            INDEX idx_announcements_category_created (category, created_at),
            CONSTRAINT fk_announcements_graduate FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE,
            CONSTRAINT fk_announcements_admin FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $db->exec("CREATE TABLE IF NOT EXISTS announcement_images (
            id INT AUTO_INCREMENT PRIMARY KEY,
            announcement_id INT NOT NULL,
            file_path VARCHAR(255) NOT NULL,
            original_name VARCHAR(255) NOT NULL,
            mime_type VARCHAR(120) NOT NULL,
            file_size_bytes INT NOT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_announcement_images_announcement_order (announcement_id, sort_order, id),
            CONSTRAINT fk_announcement_images_announcement
                FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $columns = [
            'graduate_id' => "ALTER TABLE announcements ADD graduate_id INT NULL AFTER id",
            'created_by_admin_id' => "ALTER TABLE announcements ADD created_by_admin_id INT NULL AFTER graduate_id",
            'summary' => "ALTER TABLE announcements ADD summary VARCHAR(500) NULL AFTER title",
            'event_date' => "ALTER TABLE announcements ADD event_date DATE NULL AFTER category",
            'cover_image_path' => "ALTER TABLE announcements ADD cover_image_path VARCHAR(255) NULL AFTER event_date",
            'cover_image_original_name' => "ALTER TABLE announcements ADD cover_image_original_name VARCHAR(255) NULL AFTER cover_image_path",
            'cover_image_mime_type' => "ALTER TABLE announcements ADD cover_image_mime_type VARCHAR(120) NULL AFTER cover_image_original_name",
            'cover_image_file_size_bytes' => "ALTER TABLE announcements ADD cover_image_file_size_bytes INT NULL AFTER cover_image_mime_type",
        ];

        foreach ($columns as $column => $sql) {
            if (!gradtrack_announcements_column_exists($db, $column)) {
                $db->exec($sql);
            }
        }

        $indexes = [
            'idx_announcements_graduate' => 'CREATE INDEX idx_announcements_graduate ON announcements (graduate_id)',
            'idx_announcements_status_created' => 'CREATE INDEX idx_announcements_status_created ON announcements (status, created_at)',
            'idx_announcements_category_created' => 'CREATE INDEX idx_announcements_category_created ON announcements (category, created_at)',
        ];

        foreach ($indexes as $index => $sql) {
            if (!gradtrack_announcements_index_exists($db, $index)) {
                $db->exec($sql);
            }
        }

        if (!gradtrack_announcements_foreign_key_exists($db, 'graduate_id')) {
            $db->exec('ALTER TABLE announcements ADD CONSTRAINT fk_announcements_graduate FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE');
        }

        if (!gradtrack_announcements_foreign_key_exists($db, 'created_by_admin_id')) {
            $db->exec('ALTER TABLE announcements ADD CONSTRAINT fk_announcements_admin FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL');
        }
    }
}

if (!function_exists('gradtrack_announcements_upload_root')) {
    function gradtrack_announcements_upload_root(): string
    {
        $backendRoot = realpath(__DIR__ . '/../../');
        if ($backendRoot === false) {
            throw new RuntimeException('Unable to resolve the announcement upload directory');
        }

        return $backendRoot . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'announcements';
    }
}

if (!function_exists('gradtrack_announcements_remove_cover')) {
    function gradtrack_announcements_remove_cover(?string $relativePath): void
    {
        gradtrack_storage_delete_quietly($relativePath);
    }
}

if (!function_exists('gradtrack_announcements_save_cover')) {
    function gradtrack_announcements_save_cover(
        int $announcementId,
        array $file,
        ?string $existingPath = null,
        string $kind = 'cover'
    ): array
    {
        $errorCode = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($errorCode !== UPLOAD_ERR_OK) {
            throw new InvalidArgumentException('Announcement image upload failed');
        }

        $fileSize = (int) ($file['size'] ?? 0);
        if ($fileSize <= 0 || $fileSize > 5 * 1024 * 1024) {
            throw new InvalidArgumentException('Announcement image must be between 1 byte and 5 MB');
        }

        $tmpPath = (string) ($file['tmp_name'] ?? '');
        if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
            throw new InvalidArgumentException('Invalid uploaded announcement image');
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($tmpPath) ?: 'application/octet-stream';
        $extensionByMime = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
        ];

        if (!isset($extensionByMime[$mimeType])) {
            throw new InvalidArgumentException('Unsupported image type. Allowed: JPG, PNG, WEBP, GIF');
        }

        $originalName = gradtrack_storage_safe_download_name((string) ($file['name'] ?? 'announcement-image'));
        if (gradtrack_storage_filename_has_dangerous_segment($originalName)) {
            throw new InvalidArgumentException('The announcement image filename is not allowed.');
        }
        $originalExtension = strtolower((string) pathinfo($originalName, PATHINFO_EXTENSION));
        $allowedExtensions = [
            'image/jpeg' => ['jpg', 'jpeg'],
            'image/png' => ['png'],
            'image/webp' => ['webp'],
            'image/gif' => ['gif'],
        ];
        if (!in_array($originalExtension, $allowedExtensions[$mimeType], true)) {
            throw new InvalidArgumentException('The announcement image extension does not match its contents.');
        }

        $dimensions = @getimagesize($tmpPath);
        if ($dimensions === false || (int) $dimensions[0] <= 0 || (int) $dimensions[1] <= 0) {
            throw new InvalidArgumentException('The announcement upload is not a valid image.');
        }
        if ((int) $dimensions[0] > 8192 || (int) $dimensions[1] > 8192) {
            throw new InvalidArgumentException('Announcement images must not exceed 8192 pixels on either side.');
        }

        $kind = $kind === 'gallery' ? 'gallery' : 'cover';
        $storedName = gradtrack_storage_uuid_filename($extensionByMime[$mimeType]);
        $legacyPath = 'uploads/announcements/' . $announcementId . '/' . $storedName;
        $storageResult = gradtrack_storage_put_file(
            $tmpPath,
            'media/announcements/' . $announcementId . '/' . $kind . '/' . $storedName,
            $legacyPath,
            $mimeType,
            ['category' => 'announcement-' . $kind]
        );

        return [
            'path' => (string) $storageResult['reference'],
            'old_path' => $existingPath,
            'original_name' => $originalName,
            'mime_type' => $mimeType,
            'file_size_bytes' => $fileSize,
        ];
    }
}

if (!function_exists('gradtrack_announcements_save_gallery_image')) {
    function gradtrack_announcements_save_gallery_image(int $announcementId, array $file): array
    {
        return gradtrack_announcements_save_cover($announcementId, $file, null, 'gallery');
    }
}

if (!function_exists('gradtrack_announcements_remove_all_uploads')) {
    function gradtrack_announcements_remove_all_uploads(int $announcementId): void
    {
        if ($announcementId <= 0) {
            return;
        }

        $directory = gradtrack_announcements_upload_root() . DIRECTORY_SEPARATOR . $announcementId;
        if (!is_dir($directory)) {
            return;
        }

        $items = scandir($directory);
        if (!is_array($items)) {
            return;
        }

        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $path = $directory . DIRECTORY_SEPARATOR . $item;
            if (is_file($path)) {
                @unlink($path);
            }
        }
        @rmdir($directory);
    }
}
