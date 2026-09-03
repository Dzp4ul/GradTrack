<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/system_settings.php';
require_once __DIR__ . '/../config/audit_trail.php';
require_once __DIR__ . '/../config/admin_auth.php';

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$scope = strtolower(trim((string) ($_GET['scope'] ?? $_GET['action'] ?? 'admin')));

function gradtrack_settings_require_super_admin(PDO $db): array
{
    return gradtrack_require_admin_auth($db, ['super_admin'], 'Only super admin can manage system settings');
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

function gradtrack_settings_prepare_branding_promotions(array $incomingSettings, array $currentSettings): array
{
    $typeMap = gradtrack_system_upload_type_map();
    $prefixMap = gradtrack_system_branding_final_prefix_map();
    $promotions = [];

    foreach ($typeMap as $imageType => $settingKey) {
        if (!array_key_exists($settingKey, $incomingSettings)) continue;

        $reference = trim((string) $incomingSettings[$settingKey]);
        $stagingPrefix = 'staging/system-branding/' . $imageType . '/';
        if (strpos($reference, $stagingPrefix) === 0) {
            $fileName = basename($reference);
            if (!preg_match('/^[a-f0-9-]+\.(jpg|png|webp|gif|ico)$/', $fileName)) {
                throw new InvalidArgumentException('Invalid staged branding object.');
            }
            $destination = $prefixMap[$imageType] . '/' . $fileName;
            gradtrack_storage_copy($reference, $destination);
            $incomingSettings[$settingKey] = $destination;
            $promotions[] = [
                'source' => $reference,
                'destination' => $destination,
                'old' => $currentSettings[$settingKey] ?? null,
            ];
            continue;
        }

        $allowedReference = $reference === ''
            || strpos($reference, '/') === 0
            || strpos($reference, 'uploads/system-branding/') === 0
            || strpos($reference, 'system/branding/') === 0;
        if (!$allowedReference) throw new InvalidArgumentException('Invalid system branding reference.');
    }

    return ['settings' => $incomingSettings, 'promotions' => $promotions];
}

try {
    if ($method === 'GET' && $scope === 'asset') {
        $requestedPath = trim((string) ($_GET['path'] ?? ''));
        $settings = gradtrack_system_settings_assoc(gradtrack_load_system_settings($db));
        $allowedPaths = [];
        foreach (gradtrack_system_upload_type_map() as $settingKey) {
            if (!empty($settings[$settingKey])) $allowedPaths[] = (string) $settings[$settingKey];
        }
        if ($requestedPath === '' || !in_array($requestedPath, $allowedPaths, true) || !gradtrack_storage_is_s3_key($requestedPath)) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Asset not found']);
            exit;
        }
        header('Cache-Control: public, max-age=300');
        header('Location: ' . gradtrack_storage_presigned_url($requestedPath, null, null, false), true, 302);
        exit;
    }

    if ($method === 'GET' && in_array($scope, ['public', 'display'], true)) {
        echo json_encode(gradtrack_system_public_payload($db));
        exit;
    }

    $authUser = gradtrack_settings_require_super_admin($db);

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
            $prepared = gradtrack_settings_prepare_branding_promotions($incomingSettings, $before);
            $promotions = $prepared['promotions'];
            $db->beginTransaction();
            try {
                $settings = gradtrack_save_system_settings($db, $prepared['settings'], (int) $authUser['id']);
                $db->commit();
            } catch (Throwable $e) {
                if ($db->inTransaction()) $db->rollBack();
                foreach ($promotions as $promotion) gradtrack_storage_delete_quietly($promotion['destination']);
                throw $e;
            }
            foreach ($promotions as $promotion) {
                gradtrack_storage_delete_quietly($promotion['source']);
                if (!empty($promotion['old']) && $promotion['old'] !== $promotion['destination']) {
                    gradtrack_storage_delete_quietly($promotion['old']);
                }
            }
            $after = gradtrack_system_settings_assoc($settings);

            logAuditTrail(
                (int) $authUser['id'],
                trim((string) ($authUser['full_name'] ?? $authUser['username'] ?? 'Super Admin')),
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

            $upload = gradtrack_save_system_branding_upload($db, $imageType, $file, (int) $authUser['id']);
            logAuditTrail(
                (int) $authUser['id'],
                trim((string) ($authUser['full_name'] ?? $authUser['username'] ?? 'Super Admin')),
                'super_admin',
                null,
                'Upload',
                'System Settings',
                'Staged a system branding image pending Save Changes.',
                $upload['setting_key'],
                null,
                ['setting_key' => $upload['setting_key']]
            );

            echo json_encode([
                'success' => true,
                'message' => 'Branding image uploaded successfully.',
                'setting_key' => $upload['setting_key'],
                'file_path' => $upload['file_path'],
                'file_url' => $upload['file_url'],
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
