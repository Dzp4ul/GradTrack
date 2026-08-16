<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/system_settings.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$database = new Database();
$db = $database->getConnection();

if (gradtrack_system_maintenance_enabled($db)) {
    echo json_encode([
        'authenticated' => false,
        'user' => null,
        'maintenance_mode' => true,
    ]);
    exit;
}

$user = gradtrack_current_graduate_user($db);

echo json_encode([
    'authenticated' => $user !== null,
    'user' => $user
]);
