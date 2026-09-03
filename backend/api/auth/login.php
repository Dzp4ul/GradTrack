<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/admin_profile_image.php';
require_once __DIR__ . '/../config/audit_trail.php';
require_once __DIR__ . '/../config/system_settings.php';
require_once __DIR__ . '/../config/admin_auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["error" => "Method not allowed"]);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);

if (!isset($data['email']) || !isset($data['password'])) {
    http_response_code(400);
    echo json_encode(["error" => "Email and password are required"]);
    exit;
}

$email = trim($data['email']);
$password = $data['password'];

$database = new Database();
$conn = $database->getConnection();
gradtrack_ensure_admin_profile_image_table($conn);

try {
    $hasIsActive = false;
    try {
        $columnStmt = $conn->query("SHOW COLUMNS FROM admin_users LIKE 'is_active'");
        $hasIsActive = $columnStmt !== false && $columnStmt->rowCount() > 0;
    } catch (Exception $ignored) {
        $hasIsActive = false;
    }

    $query = $hasIsActive
        ? "SELECT id, username, email, full_name, role, password, is_active FROM admin_users WHERE email = :email"
        : "SELECT id, username, email, full_name, role, password, 1 AS is_active FROM admin_users WHERE email = :email";
    $stmt = $conn->prepare($query);
    $stmt->bindParam(':email', $email);
    $stmt->execute();

    if ($stmt->rowCount() === 0) {
        http_response_code(401);
        echo json_encode(["error" => "Invalid email or password"]);
        exit;
    }

    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (isset($user['is_active']) && (int) $user['is_active'] === 0) {
        http_response_code(403);
        echo json_encode(["error" => "Account is deactivated. Please contact super admin."]);
        exit;
    }

    $storedPassword = (string) $user['password'];
    $passwordInfo = password_get_info($storedPassword);
    $isLegacyPlaintext = empty($passwordInfo['algo']);
    $passwordValid = $isLegacyPlaintext
        ? hash_equals($storedPassword, (string) $password)
        : password_verify($password, $storedPassword);

    if (!$passwordValid) {
        http_response_code(401);
        echo json_encode(["error" => "Invalid email or password"]);
        exit;
    }

    if ($isLegacyPlaintext || password_needs_rehash($storedPassword, PASSWORD_DEFAULT)) {
        $passwordUpgradeStmt = $conn->prepare('UPDATE admin_users SET password = :password WHERE id = :id');
        $passwordUpgradeStmt->execute([
            ':password' => password_hash((string) $password, PASSWORD_DEFAULT),
            ':id' => (int) $user['id'],
        ]);
    }

    gradtrack_system_block_if_maintenance($conn, (string) $user['role']);

    unset($user['password']);
    unset($user['is_active']);

    $profileImagePath = gradtrack_admin_profile_image_path($conn, (int) $user['id']);
    $user['profile_image_path'] = $profileImagePath;

    // Rotate the cookie-backed session and store only the server-side identity.
    // Role and profile data are reloaded from the database for every request.
    gradtrack_establish_session_identity('admin_user_id', (int) $user['id']);

    $loginName = trim((string)($user['full_name'] ?? '')) ?: ($user['username'] ?? $user['email']);
    // Audit Trail: call logAuditTrail() after a login session is successfully created.
    logAuditTrail(
        $user['id'],
        $loginName,
        $user['role'],
        gradtrack_audit_role_department((string)$user['role']),
        'Login',
        'Authentication',
        'Logged in to the administrative portal.'
    );

    http_response_code(200);
    echo json_encode([
        "success" => true,
        "user" => gradtrack_public_admin_user($user)
    ]);

} catch(PDOException $e) {
    error_log('Admin login database error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(["error" => "Unable to connect to the server. Please try again later."]);
}
?>
