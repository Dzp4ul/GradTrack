<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/realtime_auth.php';
require_once __DIR__ . '/../config/system_settings.php';

header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$database = new Database();
$db = $database->getConnection();

if (gradtrack_system_maintenance_enabled($db)) {
    http_response_code(503);
    echo json_encode([
        'success' => false,
        'error' => 'System maintenance is currently enabled.',
    ]);
    exit;
}

$user = gradtrack_current_graduate_user($db);

if (!$user) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'error' => 'Graduate authentication required',
    ]);
    exit;
}

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

$token = gradtrack_create_realtime_token($user);

echo json_encode([
    'success' => true,
    'token' => $token['token'],
    'expires_at' => $token['expires_at'],
]);
