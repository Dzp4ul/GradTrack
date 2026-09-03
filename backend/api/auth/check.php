<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/admin_profile_image.php';
require_once __DIR__ . '/../config/storage.php';
require_once __DIR__ . '/../config/admin_auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["error" => "Method not allowed"]);
    exit;
}

$database = new Database();
$db = $database->getConnection();
$user = gradtrack_current_admin_user($db);
gradtrack_send_private_no_store_headers();

if ($user !== null) {

    http_response_code(200);
    echo json_encode([
        "authenticated" => true,
        "user" => gradtrack_public_admin_user($user)
    ]);
} else {
    http_response_code(200);
    echo json_encode(["authenticated" => false]);
}
?>
