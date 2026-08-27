<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$email = trim((string) ($_GET['email'] ?? ''));
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'A valid email query parameter is required.']);
    exit;
}

try {
    $database = new Database();
    $conn = $database->getConnection();

    $stmt = $conn->prepare('SELECT id, email, username, full_name, role, COALESCE(is_active, 1) AS is_active FROM admin_users WHERE email = :email LIMIT 1');
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'user_exists' => $user !== false,
        'user' => $user ? [
            'id' => (int) $user['id'],
            'email' => $user['email'],
            'username' => $user['username'],
            'full_name' => $user['full_name'],
            'role' => $user['role'],
            'is_active' => (int) $user['is_active'] === 1,
        ] : null,
    ]);
} catch (Throwable $e) {
    error_log('Admin diagnostic failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Unable to connect to the server. Please try again later.']);
}
