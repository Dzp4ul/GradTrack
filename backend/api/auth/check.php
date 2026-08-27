<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/admin_profile_image.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["error" => "Method not allowed"]);
    exit;
}

session_start();

if (isset($_SESSION['user_id'])) {
    $profileImagePath = array_key_exists('profile_image_path', $_SESSION)
        ? $_SESSION['profile_image_path']
        : null;

    http_response_code(200);
    echo json_encode([
        "authenticated" => true,
        "user" => [
            "id" => $_SESSION['user_id'],
            "email" => $_SESSION['email'],
            "username" => $_SESSION['username'],
            "full_name" => $_SESSION['full_name'],
            "role" => $_SESSION['role'],
            "profile_image_path" => $profileImagePath,
        ]
    ]);
} else {
    http_response_code(200);
    echo json_encode(["authenticated" => false]);
}
?>
