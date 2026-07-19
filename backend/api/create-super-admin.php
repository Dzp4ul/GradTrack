<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/admin_roles.php';

if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) {
    http_response_code(405);
    echo json_encode(["success" => false, "error" => "Method not allowed"]);
    exit;
}

$email = 'superadmin@gradtrack.com';
$password = 'Superadin2026';
$username = 'superadmin';
$fullName = 'Super Administrator';
$role = 'super_admin';
$passwordHash = password_hash($password, PASSWORD_BCRYPT);

try {
    $database = new Database();
    $conn = $database->getConnection();

    gradtrack_ensure_admin_role_column($conn);
    gradtrack_ensure_admin_is_active_column($conn);

    $checkStmt = $conn->prepare("SELECT id FROM admin_users WHERE email = :email");
    $checkStmt->execute([':email' => $email]);
    $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);

    if ($existing) {
        $updateStmt = $conn->prepare("
            UPDATE admin_users
            SET username = :username, password = :password, full_name = :full_name, role = :role, is_active = 1
            WHERE id = :id
        ");
        $updateStmt->execute([
            ':username' => $username,
            ':password' => $passwordHash,
            ':full_name' => $fullName,
            ':role' => $role,
            ':id' => $existing['id'],
        ]);

        echo json_encode([
            "success" => true,
            "message" => "Super admin account updated",
            "credentials" => [
                "email" => $email,
                "password" => $password,
            ],
        ]);
        exit;
    }

    $insertStmt = $conn->prepare("
        INSERT INTO admin_users (username, email, password, full_name, role, is_active)
        VALUES (:username, :email, :password, :full_name, :role, 1)
    ");
    $insertStmt->execute([
        ':username' => $username,
        ':email' => $email,
        ':password' => $passwordHash,
        ':full_name' => $fullName,
        ':role' => $role,
    ]);

    echo json_encode([
        "success" => true,
        "message" => "Super admin account created",
        "credentials" => [
            "email" => $email,
            "password" => $password,
        ],
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
