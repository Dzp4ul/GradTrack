<?php
require_once __DIR__ . '/../config/cors.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["error" => "Method not allowed"]);
    exit;
}

session_start();

if (isset($_SESSION['user_id'])) {
    http_response_code(200);
    echo json_encode([
        "authenticated" => true,
        "user" => [
            "id" => $_SESSION['user_id'],
            "email" => $_SESSION['email'],
            "username" => $_SESSION['username'],
            "full_name" => $_SESSION['full_name'],
            "role" => $_SESSION['role']
        ]
    ]);
} else {
    http_response_code(200);
    echo json_encode(["authenticated" => false]);
}
?>
