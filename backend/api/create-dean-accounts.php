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

    gradtrack_ensure_admin_role_column($conn);
    gradtrack_ensure_admin_is_active_column($conn);

    $ensureActProgram = $conn->prepare("
        INSERT INTO programs (name, code, description)
        SELECT 'Associate in Computer Technology', 'ACT', 'Associate in Computer Technology program'
        WHERE NOT EXISTS (SELECT 1 FROM programs WHERE code = 'ACT')
    ");
    $ensureActProgram->execute();

    $accounts = [
        [
            'username' => 'dean_cs',
            'email' => 'deancs@gradtrack.com',
            'password' => 'COMSCIE2026',
            'full_name' => 'Dean - College of Computer Studies',
            'role' => 'dean_cs',
        ],
        [
            'username' => 'dean_coed',
            'email' => 'deancoed@gradtrack.com',
            'password' => 'COED2026',
            'full_name' => 'Dean - College of Education',
            'role' => 'dean_coed',
        ],
        [
            'username' => 'dean_hm',
            'email' => 'deanhm@gradtrack.com',
            'password' => 'HostManagement2026',
            'full_name' => 'Dean - Hospitality Management',
            'role' => 'dean_hm',
        ],
    ];

    $checkStmt = $conn->prepare("SELECT id FROM admin_users WHERE email = :email");
    $updateStmt = $conn->prepare("
        UPDATE admin_users
        SET username = :username, password = :password, full_name = :full_name, role = :role, is_active = 1
        WHERE id = :id
    ");
    $insertStmt = $conn->prepare("
        INSERT INTO admin_users (username, email, password, full_name, role, is_active)
        VALUES (:username, :email, :password, :full_name, :role, 1)
    ");

    $results = [];

    foreach ($accounts as $account) {
        $checkStmt->execute([':email' => $account['email']]);
        $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);

        $payload = [
            ':username' => $account['username'],
            ':email' => $account['email'],
            ':password' => password_hash($account['password'], PASSWORD_BCRYPT),
            ':full_name' => $account['full_name'],
            ':role' => $account['role'],
        ];

        if ($existing) {
            $payload[':id'] = $existing['id'];
            $updateStmt->execute($payload);
            $results[] = ['email' => $account['email'], 'status' => 'updated'];
        } else {
            $insertStmt->execute($payload);
            $results[] = ['email' => $account['email'], 'status' => 'created'];
        }
    }

    echo json_encode([
        "success" => true,
        "message" => "Dean accounts are ready",
        "accounts" => $results,
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
