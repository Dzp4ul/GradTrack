<?php
header("Content-Type: application/json");
require_once 'config/database.php';

$database = new Database();
$conn = $database->getConnection();

try {
    $query = "SELECT id, email, username, full_name, password FROM admin_users WHERE email = 'admin@norzagaray.edu.ph'";
    $stmt = $conn->prepare($query);
    $stmt->execute();

    if ($stmt->rowCount() === 0) {
        echo json_encode(["error" => "Admin user not found in database"]);
        exit;
    }

    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    // Test password verification
    $testPassword = "admin123";
    $passwordMatch = password_verify($testPassword, $user['password']);

    echo json_encode([
        "user_exists" => true,
        "email" => $user['email'],
        "username" => $user['username'],
        "full_name" => $user['full_name'],
        "password_hash" => $user['password'],
        "test_password" => $testPassword,
        "password_verify_result" => $passwordMatch
    ]);
} catch(Exception $e) {
    echo json_encode(["error" => "Database error: " . $e->getMessage()]);
}
?>
