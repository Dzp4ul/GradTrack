<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

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

try {
    switch ($method) {
        case 'GET':
            $group = isset($_GET['group']) ? $_GET['group'] : null;
            $sql = "SELECT * FROM system_settings";
            $params = [];

            if ($group) {
                $sql .= " WHERE setting_group = :group";
                $params[':group'] = $group;
            }
            $sql .= " ORDER BY setting_group, setting_key";

            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            $settings = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Group settings
            $grouped = [];
            foreach ($settings as $s) {
                $grouped[$s['setting_group']][] = $s;
            }

            echo json_encode(["success" => true, "data" => $settings, "grouped" => $grouped]);
            break;

        case 'PUT':
            $data = json_decode(file_get_contents("php://input"), true);

            if (isset($data['settings']) && is_array($data['settings'])) {
                $stmt = $db->prepare("
                    INSERT INTO system_settings (setting_key, setting_value, setting_group) 
                    VALUES (:key, :value, :group)
                    ON DUPLICATE KEY UPDATE setting_value = :value2
                ");
                foreach ($data['settings'] as $setting) {
                    $stmt->execute([
                        ':key' => $setting['setting_key'],
                        ':value' => $setting['setting_value'],
                        ':group' => $setting['setting_group'] ?? 'general',
                        ':value2' => $setting['setting_value']
                    ]);
                }
                echo json_encode(["success" => true, "message" => "Settings updated"]);
            } else {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "Settings array is required"]);
            }
            break;

        default:
            http_response_code(405);
            echo json_encode(["success" => false, "error" => "Method not allowed"]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
