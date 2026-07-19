<?php

if (!function_exists('gradtrack_forum_categories')) {
    function gradtrack_forum_categories(): array
    {
        return [
            'Career Advice',
            'Work Experience',
            'Course-Related Discussion',
            'Graduate Concerns',
            'General Discussion',
        ];
    }
}

if (!function_exists('gradtrack_forum_moderator_roles')) {
    function gradtrack_forum_moderator_roles(): array
    {
        return ['alumni_admin'];
    }
}

if (!function_exists('gradtrack_forum_table_exists')) {
    function gradtrack_forum_table_exists(PDO $db, string $table): bool
    {
        $stmt = $db->prepare("SELECT COUNT(*) AS total
                              FROM INFORMATION_SCHEMA.TABLES
                              WHERE TABLE_SCHEMA = DATABASE()
                                AND TABLE_NAME = :table_name");
        $stmt->execute([':table_name' => $table]);
        return (int) ($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0) > 0;
    }
}

if (!function_exists('gradtrack_forum_column_exists')) {
    function gradtrack_forum_column_exists(PDO $db, string $table, string $column): bool
    {
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

if (!function_exists('gradtrack_forum_clean_text')) {
    function gradtrack_forum_clean_text($value): string
    {
        return trim((string) ($value ?? ''));
    }
}

if (!function_exists('gradtrack_forum_escape')) {
    function gradtrack_forum_escape($value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
    }
}

if (!function_exists('gradtrack_forum_valid_category')) {
    function gradtrack_forum_valid_category(string $category): bool
    {
        return in_array($category, gradtrack_forum_categories(), true);
    }
}

if (!function_exists('gradtrack_forum_upload_base_dir')) {
    function gradtrack_forum_upload_base_dir(): string
    {
        $base = realpath(__DIR__ . '/../../');
        if ($base === false) {
            throw new RuntimeException('Unable to resolve backend upload directory');
        }

        return $base . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'forum-posts';
    }
}

if (!function_exists('gradtrack_forum_upload_post_dir')) {
    function gradtrack_forum_upload_post_dir(int $postId): string
    {
        return gradtrack_forum_upload_base_dir() . DIRECTORY_SEPARATOR . $postId;
    }
}

if (!function_exists('gradtrack_forum_relative_media_path')) {
    function gradtrack_forum_relative_media_path(int $postId, string $storedName): string
    {
        return 'uploads/forum-posts/' . $postId . '/' . $storedName;
    }
}

if (!function_exists('gradtrack_forum_relative_image_path')) {
    function gradtrack_forum_relative_image_path(int $postId, string $storedName): string
    {
        return gradtrack_forum_relative_media_path($postId, $storedName);
    }
}

if (!function_exists('gradtrack_forum_create_dir')) {
    function gradtrack_forum_create_dir(string $dir): void
    {
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
    }
}

if (!function_exists('gradtrack_forum_sanitize_filename')) {
    function gradtrack_forum_sanitize_filename(string $name): string
    {
        $safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', $name);
        return $safe ?: ('forum_media_' . time());
    }
}

if (!function_exists('gradtrack_forum_abs_path_from_rel')) {
    function gradtrack_forum_abs_path_from_rel(string $relativePath): string
    {
        $base = realpath(__DIR__ . '/../../');
        if ($base === false) {
            throw new RuntimeException('Unable to resolve backend directory');
        }

        return $base . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
    }
}

if (!function_exists('gradtrack_forum_remove_post_file')) {
    function gradtrack_forum_remove_post_file(?string $relativePath): void
    {
        if (!$relativePath) {
            return;
        }

        $absolutePath = gradtrack_forum_abs_path_from_rel($relativePath);
        if (is_file($absolutePath)) {
            @unlink($absolutePath);
        }
    }
}

if (!function_exists('gradtrack_forum_remove_post_image')) {
    function gradtrack_forum_remove_post_image(?string $relativePath): void
    {
        gradtrack_forum_remove_post_file($relativePath);
    }
}

if (!function_exists('gradtrack_forum_media_config')) {
    function gradtrack_forum_media_config(): array
    {
        return [
            'image/jpeg' => ['media_type' => 'image', 'extension' => 'jpg', 'max_size' => 5 * 1024 * 1024],
            'image/png' => ['media_type' => 'image', 'extension' => 'png', 'max_size' => 5 * 1024 * 1024],
            'image/webp' => ['media_type' => 'image', 'extension' => 'webp', 'max_size' => 5 * 1024 * 1024],
            'image/gif' => ['media_type' => 'image', 'extension' => 'gif', 'max_size' => 5 * 1024 * 1024],
            'video/mp4' => ['media_type' => 'video', 'extension' => 'mp4', 'max_size' => 50 * 1024 * 1024],
            'video/webm' => ['media_type' => 'video', 'extension' => 'webm', 'max_size' => 50 * 1024 * 1024],
            'video/ogg' => ['media_type' => 'video', 'extension' => 'ogv', 'max_size' => 50 * 1024 * 1024],
            'video/quicktime' => ['media_type' => 'video', 'extension' => 'mov', 'max_size' => 50 * 1024 * 1024],
        ];
    }
}

if (!function_exists('gradtrack_forum_uploaded_files_from_field')) {
    function gradtrack_forum_uploaded_files_from_field(array $field): array
    {
        if (!isset($field['name'])) {
            return [];
        }

        if (!is_array($field['name'])) {
            return [(array) $field];
        }

        $files = [];
        foreach ($field['name'] as $index => $name) {
            $files[] = [
                'name' => $name,
                'type' => $field['type'][$index] ?? '',
                'tmp_name' => $field['tmp_name'][$index] ?? '',
                'error' => $field['error'][$index] ?? UPLOAD_ERR_NO_FILE,
                'size' => $field['size'][$index] ?? 0,
            ];
        }

        return $files;
    }
}

if (!function_exists('gradtrack_forum_uploaded_media_files')) {
    function gradtrack_forum_uploaded_media_files(array $filesSuperglobal): array
    {
        $files = [];

        foreach (['media', 'image'] as $fieldName) {
            if (isset($filesSuperglobal[$fieldName])) {
                $files = array_merge($files, gradtrack_forum_uploaded_files_from_field((array) $filesSuperglobal[$fieldName]));
            }
        }

        return array_values(array_filter($files, function (array $file): bool {
            return (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;
        }));
    }
}

if (!function_exists('gradtrack_forum_save_post_media')) {
    function gradtrack_forum_save_post_media(int $postId, array $file, int $sortOrder = 0): array
    {
        $errorCode = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($errorCode === UPLOAD_ERR_NO_FILE) {
            throw new RuntimeException('No forum media was uploaded');
        }
        if ($errorCode !== UPLOAD_ERR_OK) {
            throw new RuntimeException('Forum media upload failed');
        }

        $tmpPath = (string) ($file['tmp_name'] ?? '');
        if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
            throw new RuntimeException('Invalid uploaded forum media');
        }

        $fileSize = (int) ($file['size'] ?? 0);
        if ($fileSize <= 0) {
            throw new RuntimeException('Forum media must be at least 1 byte');
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($tmpPath) ?: 'application/octet-stream';
        $mediaConfig = gradtrack_forum_media_config();
        if (!isset($mediaConfig[$mimeType])) {
            throw new RuntimeException('Unsupported media type. Allowed: JPG, PNG, WEBP, GIF, MP4, WEBM, OGG, or MOV');
        }

        $config = $mediaConfig[$mimeType];
        $maxSizeBytes = (int) $config['max_size'];
        if ($fileSize > $maxSizeBytes) {
            $maxMb = (int) round($maxSizeBytes / 1024 / 1024);
            $label = $config['media_type'] === 'video' ? 'video' : 'image';
            throw new RuntimeException("Forum {$label} must be {$maxMb} MB or smaller");
        }

        $originalName = (string) ($file['name'] ?? 'forum-media');
        $safeName = gradtrack_forum_sanitize_filename($originalName);
        $extension = strtolower((string) pathinfo($safeName, PATHINFO_EXTENSION));
        $allowedExtensions = $config['media_type'] === 'video'
            ? ['mp4', 'webm', 'ogg', 'ogv', 'mov']
            : ['jpg', 'jpeg', 'png', 'webp', 'gif'];
        if (!in_array($extension, $allowedExtensions, true)) {
            $extension = (string) $config['extension'];
        }

        $storedName = uniqid('forum_', true) . '.' . $extension;
        $postDir = gradtrack_forum_upload_post_dir($postId);
        gradtrack_forum_create_dir($postDir);

        $destinationPath = $postDir . DIRECTORY_SEPARATOR . $storedName;
        if (!move_uploaded_file($tmpPath, $destinationPath)) {
            throw new RuntimeException('Failed to save forum media');
        }

        return [
            'media_type' => (string) $config['media_type'],
            'file_path' => gradtrack_forum_relative_media_path($postId, $storedName),
            'original_name' => $originalName,
            'mime_type' => $mimeType,
            'file_size_bytes' => $fileSize,
            'sort_order' => $sortOrder,
        ];
    }
}

if (!function_exists('gradtrack_forum_save_post_image')) {
    function gradtrack_forum_save_post_image(int $postId, array $file, ?string $existingPath = null): array
    {
        $media = gradtrack_forum_save_post_media($postId, $file);

        if ($existingPath) {
            gradtrack_forum_remove_post_file($existingPath);
        }

        return [
            'image_path' => $media['file_path'],
            'image_original_name' => $media['original_name'],
            'image_mime_type' => $media['mime_type'],
            'image_file_size_bytes' => $media['file_size_bytes'],
        ];
    }
}

if (!function_exists('gradtrack_forum_save_post_media_records')) {
    function gradtrack_forum_save_post_media_records(PDO $db, int $postId, array $files): array
    {
        if (count($files) === 0) {
            return [];
        }

        if (count($files) > 10) {
            throw new RuntimeException('You can attach up to 10 photos or videos per forum post');
        }

        $saved = [];
        $inserted = [];

        try {
            $insertStmt = $db->prepare("INSERT INTO forum_post_media
                (post_id, media_type, file_path, original_name, mime_type, file_size_bytes, sort_order)
                VALUES (:post_id, :media_type, :file_path, :original_name, :mime_type, :file_size_bytes, :sort_order)");

            foreach ($files as $index => $file) {
                $media = gradtrack_forum_save_post_media($postId, (array) $file, $index);
                $saved[] = $media['file_path'];

                $insertStmt->execute([
                    ':post_id' => $postId,
                    ':media_type' => $media['media_type'],
                    ':file_path' => $media['file_path'],
                    ':original_name' => $media['original_name'],
                    ':mime_type' => $media['mime_type'],
                    ':file_size_bytes' => $media['file_size_bytes'],
                    ':sort_order' => $media['sort_order'],
                ]);

                $media['id'] = (int) $db->lastInsertId();
                $media['post_id'] = $postId;
                $inserted[] = $media;
            }
        } catch (Throwable $e) {
            foreach ($saved as $path) {
                gradtrack_forum_remove_post_file($path);
            }
            throw $e;
        }

        return $inserted;
    }
}

if (!function_exists('gradtrack_forum_post_media_by_post_ids')) {
    function gradtrack_forum_post_media_by_post_ids(PDO $db, array $postIds): array
    {
        $postIds = array_values(array_unique(array_map('intval', $postIds)));
        if (count($postIds) === 0) {
            return [];
        }

        $placeholders = [];
        $params = [];
        foreach ($postIds as $index => $postId) {
            $placeholder = ':media_post_id_' . $index;
            $placeholders[] = $placeholder;
            $params[$placeholder] = $postId;
        }

        $stmt = $db->prepare("SELECT id, post_id, media_type, file_path, original_name, mime_type, file_size_bytes, sort_order, created_at
                              FROM forum_post_media
                              WHERE post_id IN (" . implode(', ', $placeholders) . ")
                              ORDER BY post_id ASC, sort_order ASC, id ASC");
        $stmt->execute($params);

        $grouped = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $postId = (int) $row['post_id'];
            if (!isset($grouped[$postId])) {
                $grouped[$postId] = [];
            }

            $row['id'] = (int) $row['id'];
            $row['post_id'] = $postId;
            $row['file_size_bytes'] = isset($row['file_size_bytes']) ? (int) $row['file_size_bytes'] : null;
            $row['sort_order'] = isset($row['sort_order']) ? (int) $row['sort_order'] : 0;
            $grouped[$postId][] = $row;
        }

        return $grouped;
    }
}

if (!function_exists('gradtrack_forum_attach_media_to_posts')) {
    function gradtrack_forum_attach_media_to_posts(PDO $db, array $posts): array
    {
        $postIds = [];
        foreach ($posts as $post) {
            if (isset($post['id'])) {
                $postIds[] = (int) $post['id'];
            }
        }

        $mediaByPost = gradtrack_forum_post_media_by_post_ids($db, $postIds);

        foreach ($posts as &$post) {
            $postId = (int) ($post['id'] ?? 0);
            $media = $mediaByPost[$postId] ?? [];

            if (count($media) === 0 && !empty($post['image_path'])) {
                $mimeType = (string) ($post['image_mime_type'] ?? '');
                $media[] = [
                    'id' => 0,
                    'post_id' => $postId,
                    'media_type' => strpos($mimeType, 'video/') === 0 ? 'video' : 'image',
                    'file_path' => $post['image_path'],
                    'original_name' => $post['image_original_name'] ?? null,
                    'mime_type' => $post['image_mime_type'] ?? null,
                    'file_size_bytes' => isset($post['image_file_size_bytes']) ? (int) $post['image_file_size_bytes'] : null,
                    'sort_order' => 0,
                    'created_at' => $post['created_at'] ?? null,
                ];
            }

            $post['media'] = $media;
            $post['media_count'] = count($media);

            if (count($media) > 0) {
                $firstMedia = $media[0];
                $post['image_path'] = $firstMedia['file_path'] ?? null;
                $post['image_original_name'] = $firstMedia['original_name'] ?? null;
                $post['image_mime_type'] = $firstMedia['mime_type'] ?? null;
                $post['image_file_size_bytes'] = $firstMedia['file_size_bytes'] ?? null;
            }
        }
        unset($post);

        return $posts;
    }
}

if (!function_exists('gradtrack_forum_remove_post_media_files')) {
    function gradtrack_forum_remove_post_media_files(PDO $db, int $postId): void
    {
        $paths = [];

        if (gradtrack_forum_table_exists($db, 'forum_post_media')) {
            $mediaStmt = $db->prepare('SELECT file_path FROM forum_post_media WHERE post_id = :post_id');
            $mediaStmt->execute([':post_id' => $postId]);
            foreach ($mediaStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                if (!empty($row['file_path'])) {
                    $paths[] = (string) $row['file_path'];
                }
            }

            $deleteStmt = $db->prepare('DELETE FROM forum_post_media WHERE post_id = :post_id');
            $deleteStmt->execute([':post_id' => $postId]);
        }

        $legacyStmt = $db->prepare('SELECT image_path FROM forum_posts WHERE id = :id LIMIT 1');
        $legacyStmt->execute([':id' => $postId]);
        $legacy = $legacyStmt->fetch(PDO::FETCH_ASSOC);
        if (!empty($legacy['image_path'])) {
            $paths[] = (string) $legacy['image_path'];
        }

        foreach (array_unique($paths) as $path) {
            gradtrack_forum_remove_post_file($path);
        }

        $clearStmt = $db->prepare("UPDATE forum_posts
                                   SET image_path = NULL,
                                       image_original_name = NULL,
                                       image_mime_type = NULL,
                                       image_file_size_bytes = NULL
                                   WHERE id = :id");
        $clearStmt->execute([':id' => $postId]);
    }
}

if (!function_exists('gradtrack_forum_sync_legacy_post_media_columns')) {
    function gradtrack_forum_sync_legacy_post_media_columns(PDO $db, int $postId): void
    {
        $stmt = $db->prepare("SELECT file_path, original_name, mime_type, file_size_bytes
                              FROM forum_post_media
                              WHERE post_id = :post_id
                              ORDER BY sort_order ASC, id ASC
                              LIMIT 1");
        $stmt->execute([':post_id' => $postId]);
        $media = $stmt->fetch(PDO::FETCH_ASSOC);

        $updateStmt = $db->prepare("UPDATE forum_posts
                                    SET image_path = :image_path,
                                        image_original_name = :image_original_name,
                                        image_mime_type = :image_mime_type,
                                        image_file_size_bytes = :image_file_size_bytes
                                    WHERE id = :id");
        $updateStmt->execute([
            ':image_path' => $media['file_path'] ?? null,
            ':image_original_name' => $media['original_name'] ?? null,
            ':image_mime_type' => $media['mime_type'] ?? null,
            ':image_file_size_bytes' => $media['file_size_bytes'] ?? null,
            ':id' => $postId,
        ]);
    }
}

if (!function_exists('gradtrack_forum_log_activity')) {
    function gradtrack_forum_log_activity(PDO $db, int $graduateId, string $action, ?int $postId = null, ?int $commentId = null, array $metadata = []): void
    {
        $stmt = $db->prepare("INSERT INTO forum_activity_logs
                              (graduate_id, action, post_id, comment_id, metadata_json)
                              VALUES (:graduate_id, :action, :post_id, :comment_id, :metadata_json)");
        $metadataJson = count($metadata) > 0 ? json_encode($metadata, JSON_UNESCAPED_SLASHES) : null;
        $stmt->execute([
            ':graduate_id' => $graduateId,
            ':action' => $action,
            ':post_id' => $postId,
            ':comment_id' => $commentId,
            ':metadata_json' => $metadataJson,
        ]);
    }
}

if (!function_exists('gradtrack_forum_ensure_schema')) {
    function gradtrack_forum_ensure_schema(PDO $db): void
    {
        if (function_exists('gradtrack_ensure_graduate_profile_image_table')) {
            gradtrack_ensure_graduate_profile_image_table($db);
        }

        $db->exec("CREATE TABLE IF NOT EXISTS forum_posts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            graduate_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            content TEXT NOT NULL,
            category VARCHAR(100) NOT NULL,
            status ENUM('approved', 'pending', 'hidden') NOT NULL DEFAULT 'pending',
            image_path VARCHAR(255) NULL,
            image_original_name VARCHAR(255) NULL,
            image_mime_type VARCHAR(120) NULL,
            image_file_size_bytes INT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_forum_posts_graduate (graduate_id),
            INDEX idx_forum_posts_status_created (status, created_at),
            INDEX idx_forum_posts_category (category),
            CONSTRAINT fk_forum_posts_graduate FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $postColumns = [
            'image_path' => "ALTER TABLE forum_posts ADD image_path VARCHAR(255) NULL AFTER status",
            'image_original_name' => "ALTER TABLE forum_posts ADD image_original_name VARCHAR(255) NULL AFTER image_path",
            'image_mime_type' => "ALTER TABLE forum_posts ADD image_mime_type VARCHAR(120) NULL AFTER image_original_name",
            'image_file_size_bytes' => "ALTER TABLE forum_posts ADD image_file_size_bytes INT NULL AFTER image_mime_type",
        ];

        foreach ($postColumns as $column => $alterSql) {
            if (!gradtrack_forum_column_exists($db, 'forum_posts', $column)) {
                $db->exec($alterSql);
            }
        }

        $db->exec("CREATE TABLE IF NOT EXISTS forum_post_media (
            id INT AUTO_INCREMENT PRIMARY KEY,
            post_id INT NOT NULL,
            media_type ENUM('image', 'video') NOT NULL DEFAULT 'image',
            file_path VARCHAR(255) NOT NULL,
            original_name VARCHAR(255) NULL,
            mime_type VARCHAR(120) NULL,
            file_size_bytes INT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_forum_post_media_path (post_id, file_path),
            INDEX idx_forum_post_media_post (post_id, sort_order, id),
            CONSTRAINT fk_forum_post_media_post FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $db->exec("INSERT IGNORE INTO forum_post_media
            (post_id, media_type, file_path, original_name, mime_type, file_size_bytes, sort_order, created_at)
            SELECT fp.id,
                   CASE WHEN fp.image_mime_type LIKE 'video/%' THEN 'video' ELSE 'image' END,
                   fp.image_path,
                   fp.image_original_name,
                   fp.image_mime_type,
                   fp.image_file_size_bytes,
                   0,
                   fp.created_at
            FROM forum_posts fp
            WHERE fp.image_path IS NOT NULL
              AND fp.image_path <> ''");

        $db->exec("CREATE TABLE IF NOT EXISTS forum_comments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            post_id INT NOT NULL,
            graduate_id INT NOT NULL,
            comment TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_forum_comments_post (post_id, created_at),
            INDEX idx_forum_comments_graduate (graduate_id),
            CONSTRAINT fk_forum_comments_post FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
            CONSTRAINT fk_forum_comments_graduate FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $db->exec("CREATE TABLE IF NOT EXISTS forum_post_likes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            post_id INT NOT NULL,
            graduate_id INT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_forum_post_like (post_id, graduate_id),
            INDEX idx_forum_post_likes_graduate (graduate_id),
            CONSTRAINT fk_forum_post_likes_post FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
            CONSTRAINT fk_forum_post_likes_graduate FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $db->exec("CREATE TABLE IF NOT EXISTS forum_chat_rooms (
            id INT AUTO_INCREMENT PRIMARY KEY,
            created_by INT NOT NULL,
            name VARCHAR(150) NULL,
            is_group TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_forum_chat_rooms_created_by (created_by),
            INDEX idx_forum_chat_rooms_updated (updated_at),
            CONSTRAINT fk_forum_chat_rooms_created_by FOREIGN KEY (created_by) REFERENCES graduates(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $db->exec("CREATE TABLE IF NOT EXISTS forum_chat_members (
            id INT AUTO_INCREMENT PRIMARY KEY,
            room_id INT NOT NULL,
            graduate_id INT NOT NULL,
            joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_forum_chat_member (room_id, graduate_id),
            INDEX idx_forum_chat_members_graduate (graduate_id),
            CONSTRAINT fk_forum_chat_members_room FOREIGN KEY (room_id) REFERENCES forum_chat_rooms(id) ON DELETE CASCADE,
            CONSTRAINT fk_forum_chat_members_graduate FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $db->exec("CREATE TABLE IF NOT EXISTS forum_chat_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            room_id INT NOT NULL,
            graduate_id INT NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_forum_chat_messages_room (room_id, created_at),
            INDEX idx_forum_chat_messages_graduate (graduate_id),
            CONSTRAINT fk_forum_chat_messages_room FOREIGN KEY (room_id) REFERENCES forum_chat_rooms(id) ON DELETE CASCADE,
            CONSTRAINT fk_forum_chat_messages_graduate FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $db->exec("CREATE TABLE IF NOT EXISTS forum_reports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            reporter_graduate_id INT NOT NULL,
            target_type ENUM('post', 'comment') NOT NULL,
            post_id INT NULL,
            comment_id INT NULL,
            reason TEXT NULL,
            status ENUM('pending', 'reviewed', 'dismissed') NOT NULL DEFAULT 'pending',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            reviewed_at DATETIME NULL,
            reviewed_by INT NULL,
            UNIQUE KEY uniq_forum_report_target (reporter_graduate_id, target_type, post_id, comment_id),
            INDEX idx_forum_reports_status (status, created_at),
            INDEX idx_forum_reports_post (post_id),
            INDEX idx_forum_reports_comment (comment_id),
            CONSTRAINT fk_forum_reports_reporter FOREIGN KEY (reporter_graduate_id) REFERENCES graduates(id) ON DELETE CASCADE,
            CONSTRAINT fk_forum_reports_post FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
            CONSTRAINT fk_forum_reports_comment FOREIGN KEY (comment_id) REFERENCES forum_comments(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $db->exec("CREATE TABLE IF NOT EXISTS forum_activity_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            graduate_id INT NOT NULL,
            action VARCHAR(80) NOT NULL,
            post_id INT NULL,
            comment_id INT NULL,
            metadata_json TEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_forum_activity_graduate (graduate_id, created_at),
            INDEX idx_forum_activity_post (post_id, created_at),
            INDEX idx_forum_activity_comment (comment_id, created_at),
            CONSTRAINT fk_forum_activity_graduate FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE,
            CONSTRAINT fk_forum_activity_post FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE SET NULL,
            CONSTRAINT fk_forum_activity_comment FOREIGN KEY (comment_id) REFERENCES forum_comments(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }
}

if (!function_exists('gradtrack_forum_current_moderator')) {
    function gradtrack_forum_current_moderator(PDO $db): ?array
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        if (!isset($_SESSION['user_id'])) {
            $sessionEmail = gradtrack_forum_clean_text($_SESSION['email'] ?? '');

            if ($sessionEmail !== '') {
                $stmt = $db->prepare('SELECT id, role, full_name, email FROM admin_users WHERE email = :email LIMIT 1');
                $stmt->execute([':email' => $sessionEmail]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);

                if ($row) {
                    $_SESSION['user_id'] = (int) $row['id'];
                    $_SESSION['role'] = (string) ($row['role'] ?? '');
                    $_SESSION['full_name'] = (string) ($row['full_name'] ?? '');
                }
            }
        }

        if (!isset($_SESSION['user_id'])) {
            return null;
        }

        $role = (string) ($_SESSION['role'] ?? '');
        if (!in_array($role, gradtrack_forum_moderator_roles(), true)) {
            return null;
        }

        return [
            'id' => (int) $_SESSION['user_id'],
            'role' => $role,
            'full_name' => (string) ($_SESSION['full_name'] ?? ''),
            'email' => (string) ($_SESSION['email'] ?? ''),
        ];
    }
}

if (!function_exists('gradtrack_forum_require_moderator')) {
    function gradtrack_forum_require_moderator(PDO $db): array
    {
        $moderator = gradtrack_forum_current_moderator($db);
        if ($moderator === null) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'Only Alumni Admin accounts can moderate the forum',
            ]);
            exit;
        }

        return $moderator;
    }
}
