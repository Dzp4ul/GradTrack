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
        return ['super_admin', 'admin', 'mis_staff', 'research_coordinator'];
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

if (!function_exists('gradtrack_forum_relative_image_path')) {
    function gradtrack_forum_relative_image_path(int $postId, string $storedName): string
    {
        return 'uploads/forum-posts/' . $postId . '/' . $storedName;
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
        return $safe ?: ('forum_image_' . time());
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

if (!function_exists('gradtrack_forum_remove_post_image')) {
    function gradtrack_forum_remove_post_image(?string $relativePath): void
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

if (!function_exists('gradtrack_forum_save_post_image')) {
    function gradtrack_forum_save_post_image(int $postId, array $file, ?string $existingPath = null): array
    {
        $errorCode = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($errorCode === UPLOAD_ERR_NO_FILE) {
            throw new RuntimeException('No forum image was uploaded');
        }
        if ($errorCode !== UPLOAD_ERR_OK) {
            throw new RuntimeException('Forum image upload failed');
        }

        $tmpPath = (string) ($file['tmp_name'] ?? '');
        if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
            throw new RuntimeException('Invalid uploaded forum image');
        }

        $fileSize = (int) ($file['size'] ?? 0);
        $maxSizeBytes = 5 * 1024 * 1024;
        if ($fileSize <= 0 || $fileSize > $maxSizeBytes) {
            throw new RuntimeException('Forum image must be between 1 byte and 5 MB');
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($tmpPath) ?: 'application/octet-stream';
        $allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!in_array($mimeType, $allowedMimes, true)) {
            throw new RuntimeException('Unsupported image type. Allowed: JPG, PNG, WEBP, or GIF');
        }

        $originalName = (string) ($file['name'] ?? 'forum-image');
        $safeName = gradtrack_forum_sanitize_filename($originalName);
        $extension = strtolower((string) pathinfo($safeName, PATHINFO_EXTENSION));
        $storedName = uniqid('forum_', true) . ($extension !== '' ? ('.' . $extension) : '');
        $postDir = gradtrack_forum_upload_post_dir($postId);
        gradtrack_forum_create_dir($postDir);

        $destinationPath = $postDir . DIRECTORY_SEPARATOR . $storedName;
        if (!move_uploaded_file($tmpPath, $destinationPath)) {
            throw new RuntimeException('Failed to save forum image');
        }

        if ($existingPath) {
            gradtrack_forum_remove_post_image($existingPath);
        }

        return [
            'image_path' => gradtrack_forum_relative_image_path($postId, $storedName),
            'image_original_name' => $originalName,
            'image_mime_type' => $mimeType,
            'image_file_size_bytes' => $fileSize,
        ];
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
                'error' => 'Only Admin, MIS Staff, or Research Coordinator accounts can moderate the forum',
            ]);
            exit;
        }

        return $moderator;
    }
}
