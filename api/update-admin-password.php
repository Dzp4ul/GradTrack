<?php
require_once 'config/database.php';

$database = new Database();
$conn = $database->getConnection();

try {
    // Hash the password
    $newPassword = "admin123";
    $hashedPassword = password_hash($newPassword, PASSWORD_BCRYPT);

    // Update the password
    $query = "UPDATE admin_users SET password = :password WHERE email = 'admin@norzagaray.edu.ph'";
    $stmt = $conn->prepare($query);
    $stmt->bindParam(':password', $hashedPassword);
    $stmt->execute();

    echo json_encode([
        "success" => true,
        "message" => "Admin password updated successfully",
        "email" => "admin@norzagaray.edu.ph",
        "password" => "admin123",
        "new_hash" => $hashedPassword
    ]);
} catch(Exception $e) {
    echo json_encode(["error" => "Database error: " . $e->getMessage()]);
}
?>
