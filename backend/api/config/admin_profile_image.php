<?php

if (!function_exists('gradtrack_admin_profile_upload_root')) {
    function gradtrack_admin_profile_upload_root(): string
    {
        return realpath(__DIR__ . '/../../') . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'admin-profile-images';
    }
}

if (!function_exists('gradtrack_admin_profile_upload_relative_path')) {
    function gradtrack_admin_profile_upload_relative_path(int $adminId, string $fileName): string
    {
        return 'uploads/admin-profile-images/' . $adminId . '/' . $fileName;
    }
}

if (!function_exists('gradtrack_admin_profile_create_dir')) {
    function gradtrack_admin_profile_create_dir(string $dir): void
    {
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
    }
}

if (!function_exists('gradtrack_admin_profile_sanitize_filename')) {
    function gradtrack_admin_profile_sanitize_filename(string $name): string
    {
        $safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', $name);
        return $safe ?: ('profile_' . time());
    }
}

if (!function_exists('gradtrack_admin_profile_abs_path_from_rel')) {
    function gradtrack_admin_profile_abs_path_from_rel(string $relativePath): string
    {
        return realpath(__DIR__ . '/../../') . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
    }
}

if (!function_exists('gradtrack_ensure_admin_profile_image_table')) {
    function gradtrack_ensure_admin_profile_image_table(PDO $db): void
    {
        $db->exec("CREATE TABLE IF NOT EXISTS admin_profile_images (
            id INT AUTO_INCREMENT PRIMARY KEY,
            admin_user_id INT NOT NULL UNIQUE,
            file_path VARCHAR(255) NOT NULL,
            original_file_name VARCHAR(255) NULL,
            mime_type VARCHAR(120) NULL,
            file_size_bytes INT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_admin_profile_image_user FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }
}

if (!function_exists('gradtrack_admin_profile_image_path')) {
    function gradtrack_admin_profile_image_path(PDO $db, int $adminUserId): ?string
    {
        gradtrack_ensure_admin_profile_image_table($db);

        $stmt = $db->prepare('SELECT file_path FROM admin_profile_images WHERE admin_user_id = :admin_user_id LIMIT 1');
        $stmt->execute([':admin_user_id' => $adminUserId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row['file_path'] ?? null;
    }
}
