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
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_forum_posts_graduate (graduate_id),
            INDEX idx_forum_posts_status_created (status, created_at),
            INDEX idx_forum_posts_category (category),
            CONSTRAINT fk_forum_posts_graduate FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

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
