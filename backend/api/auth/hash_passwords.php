<?php
require_once '../config/database.php';

$database = new Database();
$conn = $database->getConnection();

try {
    // Get all users with non-bcrypt passwords
    $query = "SELECT id, password FROM admin_users WHERE password NOT LIKE '$2%'";
    $stmt = $conn->prepare($query);
    $stmt->execute();
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($users as $user) {
        $hashedPassword = password_hash($user['password'], PASSWORD_BCRYPT);
        $updateQuery = "UPDATE admin_users SET password = :password WHERE id = :id";
        $updateStmt = $conn->prepare($updateQuery);
        $updateStmt->bindParam(':password', $hashedPassword);
        $updateStmt->bindParam(':id', $user['id']);
        $updateStmt->execute();
        echo "✓ Updated user ID: {$user['id']}\n";
    }

    echo "\n✅ All passwords have been securely hashed!";
} catch(Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
