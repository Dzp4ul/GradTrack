<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$database = new Database();
$db = $database->getConnection();

$user = gradtrack_current_graduate_user($db);

echo json_encode([
    'authenticated' => $user !== null,
    'user' => $user
]);
