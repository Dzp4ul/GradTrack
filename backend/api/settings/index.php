<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/system_settings.php';
require_once __DIR__ . '/../config/audit_trail.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$scope = strtolower(trim((string) ($_GET['scope'] ?? $_GET['action'] ?? 'admin')));

function gradtrack_settings_require_super_admin(): void
{
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Authentication required']);
        exit;
    }

    if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'super_admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Only super admin can manage system settings']);
        exit;
    }
}

function gradtrack_settings_request_payload(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function gradtrack_settings_normalize_update_payload(array $payload): array
{
    $settings = $payload['settings'] ?? $payload;

    if (!is_array($settings)) {
        throw new InvalidArgumentException('Settings payload is required.');
    }

    $normalized = [];
    foreach ($settings as $key => $value) {
        if (is_array($value) && isset($value['setting_key'])) {
            $normalized[] = $value;
            continue;
        }

        $normalized[(string) $key] = $value;
    }

    return $normalized;
}

try {
    if ($method === 'GET' && in_array($scope, ['public', 'display'], true)) {
        echo json_encode(gradtrack_system_public_payload($db));
        exit;
    }

    gradtrack_settings_require_super_admin();

    switch ($method) {
        case 'GET':
            $settings = gradtrack_load_system_settings($db);
            echo json_encode([
                'success' => true,
                'data' => $settings,
                'settings' => gradtrack_system_settings_assoc($settings),
                'grouped' => gradtrack_group_system_settings($settings),
            ]);
            break;

        case 'PUT':
            $payload = gradtrack_settings_request_payload();
            $incomingSettings = gradtrack_settings_normalize_update_payload($payload);
            $before = gradtrack_system_settings_assoc(gradtrack_load_system_settings($db));
            $settings = gradtrack_save_system_settings($db, $incomingSettings, (int) $_SESSION['user_id']);
            $after = gradtrack_system_settings_assoc($settings);

            logAuditTrail(
                (int) $_SESSION['user_id'],
                trim((string) ($_SESSION['full_name'] ?? $_SESSION['username'] ?? 'Super Admin')),
                'super_admin',
                null,
                'Update',
                'System Settings',
                'Updated system customization settings.',
                null,
                $before,
                $after
            );

            echo json_encode([
                'success' => true,
                'message' => 'System settings updated successfully.',
                'data' => $settings,
                'settings' => $after,
                'grouped' => gradtrack_group_system_settings($settings),
            ]);
            break;

        case 'POST':
            $action = strtolower(trim((string) ($_GET['action'] ?? $_POST['action'] ?? '')));
            if ($action !== 'upload') {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Unsupported settings action.']);
                break;
            }

            $imageType = strtolower(trim((string) ($_POST['image_type'] ?? $_GET['image_type'] ?? '')));
            $file = $_FILES['image'] ?? $_FILES['file'] ?? null;
            if (!is_array($file)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Image file is required.']);
                break;
            }

            $upload = gradtrack_save_system_branding_upload($db, $imageType, $file, (int) $_SESSION['user_id']);
            logAuditTrail(
                (int) $_SESSION['user_id'],
                trim((string) ($_SESSION['full_name'] ?? $_SESSION['username'] ?? 'Super Admin')),
                'super_admin',
                null,
                'Update',
                'System Settings',
                'Uploaded a system branding image.',
                $upload['setting_key'],
                null,
                ['setting_key' => $upload['setting_key']]
            );

            echo json_encode([
                'success' => true,
                'message' => 'Branding image uploaded successfully.',
                'setting_key' => $upload['setting_key'],
                'file_path' => $upload['file_path'],
                'data' => $upload['settings'],
                'settings' => gradtrack_system_settings_assoc($upload['settings']),
                'grouped' => gradtrack_group_system_settings($upload['settings']),
            ]);
            break;

        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
