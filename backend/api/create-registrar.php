<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) {
    http_response_code(405);
    echo json_encode(["success" => false, "error" => "Method not allowed"]);
    exit;
}

$registrarEmail = 'registrar@norzagaray.edu.ph';
$registrarPassword = 'Registrar2026';
$registrarUsername = 'registrar';
$registrarFullName = 'Registrar Account';
$registrarRole = 'registrar';
$passwordHash = password_hash($registrarPassword, PASSWORD_BCRYPT);

try {
    $database = new Database();
    $conn = $database->getConnection();

    $alterRoleColumn = $conn->prepare("
        ALTER TABLE admin_users
        MODIFY role ENUM('super_admin', 'admin', 'registrar') DEFAULT 'admin'
    ");
    $alterRoleColumn->execute();

    $checkStmt = $conn->prepare("SELECT id FROM admin_users WHERE email = :email");
    $checkStmt->execute([':email' => $registrarEmail]);
    $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);

    if ($existing) {
        $updateStmt = $conn->prepare("
            UPDATE admin_users
            SET username = :username, password = :password, full_name = :full_name, role = :role
            WHERE id = :id
        ");
        $updateStmt->execute([
            ':username' => $registrarUsername,
            ':password' => $passwordHash,
            ':full_name' => $registrarFullName,
            ':role' => $registrarRole,
            ':id' => $existing['id'],
        ]);

        echo json_encode([
            "success" => true,
            "message" => "Registrar account updated",
            "credentials" => [
                "email" => $registrarEmail,
                "password" => $registrarPassword,
            ],
        ]);
        exit;
    }

    $insertStmt = $conn->prepare("
        INSERT INTO admin_users (username, email, password, full_name, role)
        VALUES (:username, :email, :password, :full_name, :role)
    ");
    $insertStmt->execute([
        ':username' => $registrarUsername,
        ':email' => $registrarEmail,
        ':password' => $passwordHash,
        ':full_name' => $registrarFullName,
        ':role' => $registrarRole,
    ]);

    echo json_encode([
        "success" => true,
        "message" => "Registrar account created",
        "credentials" => [
            "email" => $registrarEmail,
            "password" => $registrarPassword,
        ],
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error" => $e->getMessage(),
    ]);
}
?>
