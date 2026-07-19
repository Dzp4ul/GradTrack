<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/admin_roles.php';

if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) {
    http_response_code(405);
    echo json_encode(["success" => false, "error" => "Method not allowed"]);
    exit;
}

try {
    $database = new Database();
    $conn = $database->getConnection();
    $result = gradtrack_upsert_alumni_admin_account($conn);

    echo json_encode([
        "success" => true,
        "message" => "Alumni admin account is ready",
        "credentials" => [
            "email" => $result['email'],
            "username" => $result['email'],
            "password" => $result['password'],
        ],
        "status" => $result['status'],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
?>
