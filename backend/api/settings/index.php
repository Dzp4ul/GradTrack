<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(["success" => false, "error" => "Authentication required"]);
    exit;
}

if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'super_admin') {
    http_response_code(403);
    echo json_encode(["success" => false, "error" => "Only super admin can manage system settings"]);
    exit;
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

$defaultSettings = [
    ['setting_key' => 'institution_name', 'setting_value' => 'Norzagaray College', 'setting_group' => 'institution'],
    ['setting_key' => 'institution_address', 'setting_value' => 'Norzagaray, Bulacan', 'setting_group' => 'institution'],
    ['setting_key' => 'site_name', 'setting_value' => 'GradTrack - Norzagaray College', 'setting_group' => 'institution'],
    ['setting_key' => 'site_description', 'setting_value' => 'Graduate Tracer System', 'setting_group' => 'institution'],
    ['setting_key' => 'contact_email', 'setting_value' => 'norzagaraycollege2007@gmail.com', 'setting_group' => 'institution'],
    ['setting_key' => 'contact_phone', 'setting_value' => '', 'setting_group' => 'institution'],
    ['setting_key' => 'academic_year', 'setting_value' => '2025-2026', 'setting_group' => 'academic'],
    ['setting_key' => 'active_semester', 'setting_value' => '1st Semester', 'setting_group' => 'academic'],
    ['setting_key' => 'current_tracer_batch', 'setting_value' => 'Batch 2025', 'setting_group' => 'academic'],
    ['setting_key' => 'default_graduation_year', 'setting_value' => '2025', 'setting_group' => 'academic'],
    ['setting_key' => 'survey_reminder_days', 'setting_value' => '30', 'setting_group' => 'surveys'],
    ['setting_key' => 'survey_token_expiry_days', 'setting_value' => '60', 'setting_group' => 'surveys'],
    ['setting_key' => 'allow_late_survey_responses', 'setting_value' => 'true', 'setting_group' => 'surveys'],
    ['setting_key' => 'auto_close_inactive_surveys', 'setting_value' => 'false', 'setting_group' => 'surveys'],
    ['setting_key' => 'enable_email_notifications', 'setting_value' => 'true', 'setting_group' => 'notifications'],
    ['setting_key' => 'notify_admin_on_survey_response', 'setting_value' => 'true', 'setting_group' => 'notifications'],
    ['setting_key' => 'reminder_sender_name', 'setting_value' => 'GradTrack Support', 'setting_group' => 'notifications'],
    ['setting_key' => 'maintenance_mode', 'setting_value' => 'false', 'setting_group' => 'security'],
    ['setting_key' => 'session_timeout_minutes', 'setting_value' => '60', 'setting_group' => 'security'],
    ['setting_key' => 'minimum_password_length', 'setting_value' => '8', 'setting_group' => 'security'],
    ['setting_key' => 'backup_reminder_days', 'setting_value' => '7', 'setting_group' => 'data'],
    ['setting_key' => 'data_retention_years', 'setting_value' => '10', 'setting_group' => 'data'],
    ['setting_key' => 'audit_log_retention_days', 'setting_value' => '365', 'setting_group' => 'data'],
];

function ensureSystemSettingsTable(PDO $db): void
{
    $db->exec("
        CREATE TABLE IF NOT EXISTS system_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            setting_key VARCHAR(100) NOT NULL UNIQUE,
            setting_value TEXT NULL,
            setting_group VARCHAR(50) DEFAULT 'general',
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    ");
}

function settingsByKey(array $settings): array
{
    $byKey = [];
    foreach ($settings as $setting) {
        $byKey[$setting['setting_key']] = $setting;
    }
    return $byKey;
}

function seedDefaultSettings(PDO $db, array $defaultSettings): void
{
    $stmt = $db->prepare("
        INSERT INTO system_settings (setting_key, setting_value, setting_group)
        VALUES (:key, :value, :group)
        ON DUPLICATE KEY UPDATE setting_key = setting_key
    ");

    foreach ($defaultSettings as $setting) {
        $stmt->execute([
            ':key' => $setting['setting_key'],
            ':value' => $setting['setting_value'],
            ':group' => $setting['setting_group'],
        ]);
    }
}

function loadSettings(PDO $db, array $defaultSettings): array
{
    $stmt = $db->query("SELECT * FROM system_settings");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $rowsByKey = settingsByKey($rows);

    $ordered = [];
    foreach ($defaultSettings as $default) {
        $key = $default['setting_key'];
        $setting = $rowsByKey[$key] ?? $default;
        $setting['setting_group'] = $default['setting_group'];
        $ordered[] = $setting;
        unset($rowsByKey[$key]);
    }

    foreach ($rowsByKey as $extraSetting) {
        $ordered[] = $extraSetting;
    }

    return $ordered;
}

function groupSettings(array $settings): array
{
    $grouped = [];
    foreach ($settings as $setting) {
        $grouped[$setting['setting_group']][] = $setting;
    }
    return $grouped;
}

function normalizeSettingValue($value): string
{
    if (is_bool($value)) {
        return $value ? 'true' : 'false';
    }

    if ($value === null) {
        return '';
    }

    return trim((string) $value);
}

function validateKnownSetting(array $setting, array $defaultSettingsByKey): ?string
{
    $key = isset($setting['setting_key']) ? trim((string) $setting['setting_key']) : '';
    if ($key === '') {
        return 'Each setting must include a setting_key.';
    }

    if (!isset($defaultSettingsByKey[$key])) {
        return "Unknown setting: $key";
    }

    return null;
}

try {
    ensureSystemSettingsTable($db);
    seedDefaultSettings($db, $defaultSettings);
    $defaultSettingsByKey = settingsByKey($defaultSettings);

    switch ($method) {
        case 'GET':
            $settings = loadSettings($db, $defaultSettings);
            echo json_encode([
                "success" => true,
                "data" => $settings,
                "grouped" => groupSettings($settings),
            ]);
            break;

        case 'PUT':
            $data = json_decode(file_get_contents("php://input"), true);

            if (!isset($data['settings']) || !is_array($data['settings'])) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "Settings array is required"]);
                break;
            }

            foreach ($data['settings'] as $setting) {
                $validationError = validateKnownSetting($setting, $defaultSettingsByKey);
                if ($validationError !== null) {
                    http_response_code(400);
                    echo json_encode(["success" => false, "error" => $validationError]);
                    exit;
                }
            }

            $stmt = $db->prepare("
                INSERT INTO system_settings (setting_key, setting_value, setting_group)
                VALUES (:key, :value, :group)
                ON DUPLICATE KEY UPDATE
                    setting_value = VALUES(setting_value),
                    setting_group = VALUES(setting_group)
            ");

            foreach ($data['settings'] as $setting) {
                $key = trim((string) $setting['setting_key']);
                $default = $defaultSettingsByKey[$key];

                $stmt->execute([
                    ':key' => $key,
                    ':value' => normalizeSettingValue($setting['setting_value'] ?? ''),
                    ':group' => $default['setting_group'],
                ]);
            }

            $settings = loadSettings($db, $defaultSettings);
            echo json_encode([
                "success" => true,
                "message" => "Settings updated",
                "data" => $settings,
                "grouped" => groupSettings($settings),
            ]);
            break;

        default:
            http_response_code(405);
            echo json_encode(["success" => false, "error" => "Method not allowed"]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
