<?php

require_once __DIR__ . '/storage.php';

if (!function_exists('gradtrack_system_setting_definitions')) {
    function gradtrack_system_setting_definitions(): array
    {
        return [
            'system_name' => ['default' => 'GradTrack', 'group' => 'general', 'type' => 'text', 'public' => true],
            'system_short_name' => ['default' => 'GradTrack', 'group' => 'general', 'type' => 'text', 'public' => true],
            'institution_name' => ['default' => 'Norzagaray College', 'group' => 'general', 'type' => 'text', 'public' => true],
            'system_description' => ['default' => 'A Web-Based Graduate Tracer System with Alumni Job Support System', 'group' => 'general', 'type' => 'textarea', 'public' => true],
            'contact_email' => ['default' => 'norzagaraycollege2007@gmail.com', 'group' => 'general', 'type' => 'email', 'public' => true],
            'contact_number' => ['default' => '', 'group' => 'general', 'type' => 'text', 'public' => true],
            'institution_address' => ['default' => 'Norzagaray, Bulacan', 'group' => 'general', 'type' => 'textarea', 'public' => true],
            'footer_text' => ['default' => 'Empowering graduates, strengthening connections.', 'group' => 'general', 'type' => 'textarea', 'public' => true],
            'copyright_text' => ['default' => '2026 Norzagaray College. All rights reserved.', 'group' => 'general', 'type' => 'text', 'public' => true],

            'system_logo_path' => ['default' => '/Gradtrack_small.png', 'group' => 'branding', 'type' => 'image', 'public' => true],
            'login_logo_path' => ['default' => '/GRADTRACK_LOGO1.png', 'group' => 'branding', 'type' => 'image', 'public' => true],
            'favicon_path' => ['default' => '/Gradtrack_small.png', 'group' => 'branding', 'type' => 'image', 'public' => true],
            'primary_theme_color' => ['default' => '#1d4ed8', 'group' => 'branding', 'type' => 'color', 'public' => true],
            'secondary_theme_color' => ['default' => '#f8c331', 'group' => 'branding', 'type' => 'color', 'public' => true],

            'login_page_title' => ['default' => 'Sign In', 'group' => 'login', 'type' => 'text', 'public' => true],
            'login_welcome_message' => ['default' => 'Welcome back.', 'group' => 'login', 'type' => 'text', 'public' => true],
            'login_subtitle' => ['default' => 'Access GradTrack with your authorized account.', 'group' => 'login', 'type' => 'textarea', 'public' => true],
            'login_background_image_path' => ['default' => '/520382375_1065446909052636_3412465913398569974_n.jpg', 'group' => 'login', 'type' => 'image', 'public' => true],
            'additional_login_text' => ['default' => '', 'group' => 'login', 'type' => 'textarea', 'public' => true],

            'feature_graduate_survey_enabled' => ['default' => 'true', 'group' => 'features', 'type' => 'boolean', 'public' => true],
            'feature_alumni_job_support_enabled' => ['default' => 'true', 'group' => 'features', 'type' => 'boolean', 'public' => true],
            'feature_community_forum_enabled' => ['default' => 'true', 'group' => 'features', 'type' => 'boolean', 'public' => true],
            'feature_notifications_enabled' => ['default' => 'true', 'group' => 'features', 'type' => 'boolean', 'public' => true],
            'feature_messaging_enabled' => ['default' => 'true', 'group' => 'features', 'type' => 'boolean', 'public' => true],

            'survey_title' => ['default' => 'Graduate Tracer Survey', 'group' => 'survey', 'type' => 'text', 'public' => true],
            'survey_instructions' => ['default' => 'Please verify your identity to access the active graduate tracer survey.', 'group' => 'survey', 'type' => 'textarea', 'public' => true],
            'survey_enabled' => ['default' => 'true', 'group' => 'survey', 'type' => 'boolean', 'public' => true],
            'survey_availability_message' => ['default' => 'The Graduate Tracer Survey is currently unavailable. Please check back later.', 'group' => 'survey', 'type' => 'textarea', 'public' => true],
            'survey_completion_message' => ['default' => 'Your survey has been submitted successfully.', 'group' => 'survey', 'type' => 'textarea', 'public' => true],

            'community_forum_enabled' => ['default' => 'true', 'group' => 'community', 'type' => 'boolean', 'public' => true],
            'community_guidelines' => ['default' => 'Keep discussions respectful, relevant, and helpful for fellow Norzagaray College alumni.', 'group' => 'community', 'type' => 'textarea', 'public' => true],
            'community_default_announcement' => ['default' => 'Welcome to the GradTrack Community Forum.', 'group' => 'community', 'type' => 'textarea', 'public' => true],
            'community_allow_media_uploads' => ['default' => 'true', 'group' => 'community', 'type' => 'boolean', 'public' => true],
            'community_require_moderation' => ['default' => 'true', 'group' => 'community', 'type' => 'boolean', 'public' => false],

            'maintenance_mode' => ['default' => 'false', 'group' => 'maintenance', 'type' => 'boolean', 'public' => true],
            'maintenance_page_title' => ['default' => 'GradTrack is under maintenance', 'group' => 'maintenance', 'type' => 'text', 'public' => true],
            'maintenance_message' => ['default' => 'We are performing scheduled maintenance to improve the system. Please check back soon.', 'group' => 'maintenance', 'type' => 'textarea', 'public' => true],
            'maintenance_expected_availability_message' => ['default' => '', 'group' => 'maintenance', 'type' => 'text', 'public' => true],

            // Legacy operational settings retained for existing reminder/report code paths.
            'site_name' => ['default' => 'GradTrack - Norzagaray College', 'group' => 'legacy', 'type' => 'text', 'public' => false],
            'site_description' => ['default' => 'Graduate Tracer System', 'group' => 'legacy', 'type' => 'textarea', 'public' => false],
            'contact_phone' => ['default' => '', 'group' => 'legacy', 'type' => 'text', 'public' => false],
            'academic_year' => ['default' => '2025-2026', 'group' => 'legacy', 'type' => 'text', 'public' => false],
            'active_semester' => ['default' => '1st Semester', 'group' => 'legacy', 'type' => 'text', 'public' => false],
            'current_tracer_batch' => ['default' => 'Batch 2025', 'group' => 'legacy', 'type' => 'text', 'public' => false],
            'default_graduation_year' => ['default' => '2025', 'group' => 'legacy', 'type' => 'number', 'public' => false],
            'survey_reminder_days' => ['default' => '3', 'group' => 'legacy', 'type' => 'number', 'public' => false],
            'survey_token_expiry_days' => ['default' => '60', 'group' => 'legacy', 'type' => 'number', 'public' => false],
            'allow_late_survey_responses' => ['default' => 'true', 'group' => 'legacy', 'type' => 'boolean', 'public' => false],
            'auto_close_inactive_surveys' => ['default' => 'false', 'group' => 'legacy', 'type' => 'boolean', 'public' => false],
            'enable_email_notifications' => ['default' => 'true', 'group' => 'legacy', 'type' => 'boolean', 'public' => false],
            'notify_admin_on_survey_response' => ['default' => 'true', 'group' => 'legacy', 'type' => 'boolean', 'public' => false],
            'reminder_sender_name' => ['default' => 'GradTrack Support', 'group' => 'legacy', 'type' => 'text', 'public' => false],
            'session_timeout_minutes' => ['default' => '60', 'group' => 'legacy', 'type' => 'number', 'public' => false],
            'minimum_password_length' => ['default' => '8', 'group' => 'legacy', 'type' => 'number', 'public' => false],
            'backup_reminder_days' => ['default' => '7', 'group' => 'legacy', 'type' => 'number', 'public' => false],
            'data_retention_years' => ['default' => '10', 'group' => 'legacy', 'type' => 'number', 'public' => false],
            'audit_log_retention_days' => ['default' => '365', 'group' => 'legacy', 'type' => 'number', 'public' => false],
        ];
    }
}

if (!function_exists('gradtrack_system_settings_default_rows')) {
    function gradtrack_system_settings_default_rows(): array
    {
        $rows = [];
        foreach (gradtrack_system_setting_definitions() as $key => $definition) {
            $rows[] = [
                'setting_key' => $key,
                'setting_value' => (string) $definition['default'],
                'setting_group' => (string) $definition['group'],
            ];
        }
        return $rows;
    }
}

if (!function_exists('gradtrack_ensure_system_settings_table')) {
    function gradtrack_ensure_system_settings_table(PDO $db): void
    {
        $db->exec("
            CREATE TABLE IF NOT EXISTS system_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                setting_key VARCHAR(100) NOT NULL UNIQUE,
                setting_value TEXT NULL,
                setting_group VARCHAR(50) DEFAULT 'general',
                updated_by_admin_user_id INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_system_settings_group (setting_group)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");

        $columns = [];
        $stmt = $db->query("SHOW COLUMNS FROM system_settings");
        foreach ($stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [] as $column) {
            $columns[strtolower((string) ($column['Field'] ?? ''))] = true;
        }

        if (!isset($columns['updated_by_admin_user_id'])) {
            $db->exec("ALTER TABLE system_settings ADD COLUMN updated_by_admin_user_id INT NULL AFTER setting_group");
        }
        if (!isset($columns['created_at'])) {
            $db->exec("ALTER TABLE system_settings ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER updated_by_admin_user_id");
        }
    }
}

if (!function_exists('gradtrack_seed_system_settings')) {
    function gradtrack_seed_system_settings(PDO $db): void
    {
        $stmt = $db->prepare("
            INSERT INTO system_settings (setting_key, setting_value, setting_group)
            VALUES (:setting_key, :setting_value, :setting_group)
            ON DUPLICATE KEY UPDATE setting_key = setting_key
        ");

        foreach (gradtrack_system_settings_default_rows() as $row) {
            $stmt->execute([
                ':setting_key' => $row['setting_key'],
                ':setting_value' => $row['setting_value'],
                ':setting_group' => $row['setting_group'],
            ]);
        }
    }
}

if (!function_exists('gradtrack_system_settings_rows_by_key')) {
    function gradtrack_system_settings_rows_by_key(array $rows): array
    {
        $byKey = [];
        foreach ($rows as $row) {
            $byKey[(string) $row['setting_key']] = $row;
        }
        return $byKey;
    }
}

if (!function_exists('gradtrack_load_system_settings')) {
    function gradtrack_load_system_settings(PDO $db): array
    {
        gradtrack_ensure_system_settings_table($db);
        gradtrack_seed_system_settings($db);

        $stmt = $db->query("SELECT * FROM system_settings");
        $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
        $rowsByKey = gradtrack_system_settings_rows_by_key($rows);
        $definitions = gradtrack_system_setting_definitions();
        $ordered = [];

        foreach ($definitions as $key => $definition) {
            $setting = $rowsByKey[$key] ?? [
                'setting_key' => $key,
                'setting_value' => (string) $definition['default'],
                'setting_group' => (string) $definition['group'],
                'updated_at' => null,
            ];
            $setting['setting_group'] = (string) $definition['group'];
            $setting['setting_value'] = (string) ($setting['setting_value'] ?? '');
            $ordered[] = $setting;
            unset($rowsByKey[$key]);
        }

        foreach ($rowsByKey as $extra) {
            $extra['setting_value'] = (string) ($extra['setting_value'] ?? '');
            $ordered[] = $extra;
        }

        return $ordered;
    }
}

if (!function_exists('gradtrack_group_system_settings')) {
    function gradtrack_group_system_settings(array $settings): array
    {
        $grouped = [];
        foreach ($settings as $setting) {
            $group = (string) ($setting['setting_group'] ?? 'general');
            if (!isset($grouped[$group])) {
                $grouped[$group] = [];
            }
            $grouped[$group][] = $setting;
        }
        return $grouped;
    }
}

if (!function_exists('gradtrack_system_settings_assoc')) {
    function gradtrack_system_settings_assoc(array $settings, bool $publicOnly = false): array
    {
        $definitions = gradtrack_system_setting_definitions();
        $assoc = [];

        foreach ($settings as $setting) {
            $key = (string) ($setting['setting_key'] ?? '');
            if ($key === '') {
                continue;
            }
            if ($publicOnly && empty($definitions[$key]['public'])) {
                continue;
            }
            $assoc[$key] = (string) ($setting['setting_value'] ?? '');
        }

        return gradtrack_system_apply_aliases($assoc, $publicOnly);
    }
}

if (!function_exists('gradtrack_system_apply_aliases')) {
    function gradtrack_system_apply_aliases(array $settings, bool $publicOnly = false): array
    {
        if (($settings['system_name'] ?? '') === '' && isset($settings['site_name'])) {
            $settings['system_name'] = $settings['site_name'];
        }
        if (($settings['system_description'] ?? '') === '' && isset($settings['site_description'])) {
            $settings['system_description'] = $settings['site_description'];
        }
        if (($settings['contact_number'] ?? '') === '' && isset($settings['contact_phone'])) {
            $settings['contact_number'] = $settings['contact_phone'];
        }

        $surveyFeatureEnabled = gradtrack_system_truthy($settings['feature_graduate_survey_enabled'] ?? 'true');
        $surveyEnabled = gradtrack_system_truthy($settings['survey_enabled'] ?? 'true');
        $settings['survey_available'] = ($surveyFeatureEnabled && $surveyEnabled) ? 'true' : 'false';

        $communityFeatureEnabled = gradtrack_system_truthy($settings['feature_community_forum_enabled'] ?? 'true');
        $communityEnabled = gradtrack_system_truthy($settings['community_forum_enabled'] ?? 'true');
        $settings['community_available'] = ($communityFeatureEnabled && $communityEnabled) ? 'true' : 'false';

        if ($publicOnly) {
            unset($settings['site_name'], $settings['site_description'], $settings['contact_phone']);
        }

        return $settings;
    }
}

if (!function_exists('gradtrack_system_public_payload')) {
    function gradtrack_system_public_payload(PDO $db): array
    {
        $settings = gradtrack_load_system_settings($db);
        return [
            'success' => true,
            'settings' => gradtrack_system_settings_assoc($settings, true),
        ];
    }
}

if (!function_exists('gradtrack_system_truthy')) {
    function gradtrack_system_truthy($value): bool
    {
        return in_array(strtolower(trim((string) $value)), ['1', 'true', 'yes', 'on', 'enabled'], true);
    }
}

if (!function_exists('gradtrack_system_get_setting')) {
    function gradtrack_system_get_setting(PDO $db, string $key, ?string $fallback = null): string
    {
        $settings = gradtrack_system_settings_assoc(gradtrack_load_system_settings($db));
        if (array_key_exists($key, $settings)) {
            return (string) $settings[$key];
        }

        $definitions = gradtrack_system_setting_definitions();
        if (isset($definitions[$key])) {
            return (string) $definitions[$key]['default'];
        }

        return (string) ($fallback ?? '');
    }
}

if (!function_exists('gradtrack_system_maintenance_enabled')) {
    function gradtrack_system_maintenance_enabled(PDO $db): bool
    {
        return gradtrack_system_truthy(gradtrack_system_get_setting($db, 'maintenance_mode', 'false'));
    }
}

if (!function_exists('gradtrack_system_feature_enabled')) {
    function gradtrack_system_feature_enabled(PDO $db, string $featureKey): bool
    {
        $settings = gradtrack_system_settings_assoc(gradtrack_load_system_settings($db));
        $map = [
            'graduate_survey' => ['feature_graduate_survey_enabled', 'survey_enabled'],
            'survey' => ['feature_graduate_survey_enabled', 'survey_enabled'],
            'community_forum' => ['feature_community_forum_enabled', 'community_forum_enabled'],
            'community' => ['feature_community_forum_enabled', 'community_forum_enabled'],
            'jobs' => ['feature_alumni_job_support_enabled'],
            'job_support' => ['feature_alumni_job_support_enabled'],
            'job_posting' => ['feature_alumni_job_support_enabled'],
            'notifications' => ['feature_notifications_enabled'],
            'messaging' => ['feature_messaging_enabled', 'feature_community_forum_enabled', 'community_forum_enabled'],
        ];

        $keys = $map[$featureKey] ?? [$featureKey];
        foreach ($keys as $key) {
            if (!gradtrack_system_truthy($settings[$key] ?? 'true')) {
                return false;
            }
        }

        return true;
    }
}

if (!function_exists('gradtrack_system_block_if_maintenance')) {
    function gradtrack_system_block_if_maintenance(PDO $db, string $role = ''): void
    {
        if (!gradtrack_system_maintenance_enabled($db) || $role === 'super_admin') {
            return;
        }

        http_response_code(503);
        echo json_encode([
            'success' => false,
            'error' => gradtrack_system_get_setting($db, 'maintenance_message', 'The system is temporarily unavailable.'),
            'maintenance_mode' => true,
            'maintenance_title' => gradtrack_system_get_setting($db, 'maintenance_page_title', 'GradTrack is under maintenance'),
        ]);
        exit;
    }
}

if (!function_exists('gradtrack_system_require_feature_enabled')) {
    function gradtrack_system_require_feature_enabled(PDO $db, string $featureKey, string $label = 'This feature'): void
    {
        if (gradtrack_system_feature_enabled($db, $featureKey)) {
            return;
        }

        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => $label . ' is currently unavailable.',
            'feature_disabled' => true,
            'feature_key' => $featureKey,
        ]);
        exit;
    }
}

if (!function_exists('gradtrack_normalize_system_setting_value')) {
    function gradtrack_normalize_system_setting_value($value, string $type): string
    {
        if ($type === 'boolean') {
            return gradtrack_system_truthy($value) ? 'true' : 'false';
        }

        if ($value === null) {
            return '';
        }

        return trim((string) $value);
    }
}

if (!function_exists('gradtrack_validate_system_setting')) {
    function gradtrack_validate_system_setting(string $key, $value): ?string
    {
        $definitions = gradtrack_system_setting_definitions();
        if (!isset($definitions[$key])) {
            return "Unknown setting: {$key}";
        }

        $definition = $definitions[$key];
        $type = (string) ($definition['type'] ?? 'text');
        $normalized = gradtrack_normalize_system_setting_value($value, $type);

        if ($type === 'email' && $normalized !== '' && !filter_var($normalized, FILTER_VALIDATE_EMAIL)) {
            return "{$key} must be a valid email address.";
        }

        if ($type === 'color' && preg_match('/^#[0-9a-fA-F]{6}$/', $normalized) !== 1) {
            return "{$key} must be a 6-digit hex color.";
        }

        if ($type === 'number' && $normalized !== '' && !is_numeric($normalized)) {
            return "{$key} must be a number.";
        }

        if (in_array($type, ['text', 'textarea'], true) && strlen($normalized) > 5000) {
            return "{$key} is too long.";
        }

        if ($type === 'image' && strlen($normalized) > 255) {
            return "{$key} image path is too long.";
        }

        return null;
    }
}

if (!function_exists('gradtrack_save_system_settings')) {
    function gradtrack_save_system_settings(PDO $db, array $incomingSettings, ?int $adminUserId = null): array
    {
        gradtrack_ensure_system_settings_table($db);
        gradtrack_seed_system_settings($db);
        $definitions = gradtrack_system_setting_definitions();
        $normalizedSettings = [];

        foreach ($incomingSettings as $key => $value) {
            if (is_array($value) && isset($value['setting_key'])) {
                $key = (string) $value['setting_key'];
                $value = $value['setting_value'] ?? '';
            }

            $key = trim((string) $key);
            $validationError = gradtrack_validate_system_setting($key, $value);
            if ($validationError !== null) {
                throw new InvalidArgumentException($validationError);
            }

            $type = (string) ($definitions[$key]['type'] ?? 'text');
            $normalizedSettings[$key] = gradtrack_normalize_system_setting_value($value, $type);
        }

        $stmt = $db->prepare("
            INSERT INTO system_settings (setting_key, setting_value, setting_group, updated_by_admin_user_id)
            VALUES (:setting_key, :setting_value, :setting_group, :updated_by_admin_user_id)
            ON DUPLICATE KEY UPDATE
                setting_value = VALUES(setting_value),
                setting_group = VALUES(setting_group),
                updated_by_admin_user_id = VALUES(updated_by_admin_user_id)
        ");

        foreach ($normalizedSettings as $key => $value) {
            $stmt->execute([
                ':setting_key' => $key,
                ':setting_value' => $value,
                ':setting_group' => (string) $definitions[$key]['group'],
                ':updated_by_admin_user_id' => $adminUserId,
            ]);
        }

        return gradtrack_load_system_settings($db);
    }
}

if (!function_exists('gradtrack_system_upload_base_dir')) {
    function gradtrack_system_upload_base_dir(): string
    {
        $base = realpath(__DIR__ . '/../../');
        if ($base === false) {
            throw new RuntimeException('Unable to resolve backend directory');
        }
        return $base . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'system-branding';
    }
}

if (!function_exists('gradtrack_system_upload_type_map')) {
    function gradtrack_system_upload_type_map(): array
    {
        return [
            'system_logo' => 'system_logo_path',
            'login_logo' => 'login_logo_path',
            'favicon' => 'favicon_path',
            'login_background' => 'login_background_image_path',
        ];
    }
}

if (!function_exists('gradtrack_system_branding_final_prefix_map')) {
    function gradtrack_system_branding_final_prefix_map(): array
    {
        return [
            'system_logo' => 'system/branding/system-logo',
            'login_logo' => 'system/branding/login-logo',
            'favicon' => 'system/branding/favicon',
            'login_background' => 'system/branding/login-background',
        ];
    }
}

if (!function_exists('gradtrack_save_system_branding_upload')) {
    function gradtrack_save_system_branding_upload(PDO $db, string $imageType, array $file, ?int $adminUserId = null): array
    {
        $typeMap = gradtrack_system_upload_type_map();
        if (!isset($typeMap[$imageType])) {
            throw new InvalidArgumentException('Invalid branding image type.');
        }

        $errorCode = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($errorCode === UPLOAD_ERR_NO_FILE) {
            throw new RuntimeException('No image was uploaded.');
        }
        if ($errorCode !== UPLOAD_ERR_OK) {
            throw new RuntimeException('Image upload failed.');
        }

        $tmpPath = (string) ($file['tmp_name'] ?? '');
        if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
            throw new RuntimeException('Invalid uploaded image.');
        }

        $fileSize = (int) ($file['size'] ?? 0);
        $maxSizeBytes = $imageType === 'login_background' ? 5 * 1024 * 1024 : 2 * 1024 * 1024;
        if ($fileSize <= 0 || $fileSize > $maxSizeBytes) {
            throw new RuntimeException('Image must be between 1 byte and ' . (int) ($maxSizeBytes / 1024 / 1024) . ' MB.');
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($tmpPath) ?: '';
        $allowed = [
            'image/png' => 'png',
            'image/jpeg' => 'jpg',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            'image/x-icon' => 'ico',
            'image/vnd.microsoft.icon' => 'ico',
        ];

        if (!isset($allowed[$mimeType])) {
            throw new RuntimeException('Unsupported image type. Allowed: PNG, JPG, WEBP, GIF, ICO.');
        }

        if ($imageType !== 'favicon' && $allowed[$mimeType] === 'ico') {
            throw new RuntimeException('ICO files are only allowed for the favicon.');
        }

        if ($allowed[$mimeType] !== 'ico') {
            $imageInfo = @getimagesize($tmpPath);
            if ($imageInfo === false || (int) $imageInfo[0] < 1 || (int) $imageInfo[1] < 1
                || (int) $imageInfo[0] > 8192 || (int) $imageInfo[1] > 8192) {
                throw new RuntimeException('Branding image is malformed or has unsafe dimensions.');
            }
        }

        $originalName = gradtrack_storage_safe_download_name((string) ($file['name'] ?? 'branding-image'));
        if (gradtrack_storage_filename_has_dangerous_segment($originalName)) {
            throw new RuntimeException('Branding image filename is not allowed.');
        }
        $submittedExtension = strtolower((string) pathinfo($originalName, PATHINFO_EXTENSION));
        $expectedExtensions = $mimeType === 'image/jpeg' ? ['jpg', 'jpeg'] : [$allowed[$mimeType]];
        if (!in_array($submittedExtension, $expectedExtensions, true)) {
            throw new RuntimeException('Branding image extension does not match its content.');
        }

        $storedName = gradtrack_storage_uuid_filename($allowed[$mimeType]);
        $storageResult = gradtrack_storage_put_file(
            $tmpPath,
            'staging/system-branding/' . $imageType . '/' . $storedName,
            'uploads/system-branding/staging/' . $imageType . '/' . $storedName,
            $mimeType,
            ['category' => 'pending-system-branding', 'image-type' => $imageType]
        );
        $relativePath = (string) $storageResult['reference'];
        $settingKey = $typeMap[$imageType];

        return [
            'setting_key' => $settingKey,
            'file_path' => $relativePath,
            'file_url' => gradtrack_storage_access_reference($relativePath),
            'settings' => gradtrack_load_system_settings($db),
        ];
    }
}
