<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(["success" => false, "error" => "Authentication required"]);
    exit;
}

$allowedMethods = ['GET', 'PUT'];
$method = $_SERVER['REQUEST_METHOD'];

if (!in_array($method, $allowedMethods, true)) {
    http_response_code(405);
    echo json_encode(["success" => false, "error" => "Method not allowed"]);
    exit;
}

$database = new Database();
$db = $database->getConnection();

function gradtrack_admin_is_active_select(PDO $db): string
{
    try {
        $columnStmt = $db->query("SHOW COLUMNS FROM admin_users LIKE 'is_active'");
        if ($columnStmt !== false && $columnStmt->rowCount() > 0) {
            return 'is_active';
        }
    } catch (Throwable $ignored) {
        return '1 AS is_active';
    }

    return '1 AS is_active';
}

function gradtrack_find_current_admin_user(PDO $db): ?array
{
    $id = isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : 0;
    $email = isset($_SESSION['email']) ? trim((string) $_SESSION['email']) : '';
    $isActiveSelect = gradtrack_admin_is_active_select($db);

    if ($id > 0) {
        $stmt = $db->prepare("
            SELECT id, username, email, full_name, role, password, $isActiveSelect
            FROM admin_users
            WHERE id = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $id]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user) {
            return $user;
        }
    }

    if ($email !== '') {
        $stmt = $db->prepare("
            SELECT id, username, email, full_name, role, password, $isActiveSelect
            FROM admin_users
            WHERE email = :email
            LIMIT 1
        ");
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user) {
            return $user;
        }
    }

    return null;
}

function gradtrack_public_admin_user(array $user): array
{
    return [
        "id" => (int) $user['id'],
        "username" => $user['username'],
        "email" => $user['email'],
        "full_name" => $user['full_name'] ?? '',
        "role" => $user['role'],
    ];
}

function gradtrack_update_admin_session(array $user): void
{
    $_SESSION['user_id'] = (int) $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['email'] = $user['email'];
    $_SESSION['full_name'] = $user['full_name'] ?? '';
    $_SESSION['role'] = $user['role'];
}

try {
    $currentUser = gradtrack_find_current_admin_user($db);

    if (!$currentUser) {
        http_response_code(404);
        echo json_encode([
            "success" => false,
            "error" => "This account cannot be edited because it was not found in admin users"
        ]);
        exit;
    }

    if (isset($currentUser['is_active']) && (int) $currentUser['is_active'] === 0) {
        http_response_code(403);
        echo json_encode(["success" => false, "error" => "This account is deactivated"]);
        exit;
    }

    if ($method === 'GET') {
        unset($currentUser['password']);
        echo json_encode(["success" => true, "user" => gradtrack_public_admin_user($currentUser)]);
        exit;
    }

    $data = json_decode(file_get_contents("php://input"), true);

    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Invalid request body"]);
        exit;
    }

    $fullName = trim((string) ($data['full_name'] ?? ''));
    $currentPassword = (string) ($data['current_password'] ?? '');
    $newPassword = (string) ($data['new_password'] ?? '');

    $updateParams = [
        ':full_name' => $fullName !== '' ? $fullName : null,
        ':id' => (int) $currentUser['id'],
    ];

    if (trim($newPassword) !== '') {
        if ($currentPassword === '') {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Current password is required to set a new password"]);
            exit;
        }

        $storedPassword = (string) ($currentUser['password'] ?? '');
        $passwordMatches = password_verify($currentPassword, $storedPassword)
            || hash_equals($storedPassword, $currentPassword);

        if (!$passwordMatches) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Current password is incorrect"]);
            exit;
        }

        if (strlen($newPassword) < 8) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "New password must be at least 8 characters"]);
            exit;
        }

        $updateParams[':password'] = password_hash($newPassword, PASSWORD_BCRYPT);

        $updateStmt = $db->prepare("
            UPDATE admin_users
            SET full_name = :full_name,
                password = :password
            WHERE id = :id
        ");
    } else {
        $updateStmt = $db->prepare("
            UPDATE admin_users
            SET full_name = :full_name
            WHERE id = :id
        ");
    }

    $updateStmt->execute($updateParams);

    $isActiveSelect = gradtrack_admin_is_active_select($db);
    $freshStmt = $db->prepare("
        SELECT id, username, email, full_name, role, $isActiveSelect
        FROM admin_users
        WHERE id = :id
        LIMIT 1
    ");
    $freshStmt->execute([':id' => (int) $currentUser['id']]);
    $freshUser = $freshStmt->fetch(PDO::FETCH_ASSOC);

    if (!$freshUser) {
        throw new RuntimeException('Unable to reload updated profile');
    }

    gradtrack_update_admin_session($freshUser);

    echo json_encode([
        "success" => true,
        "message" => "Profile updated successfully",
        "user" => gradtrack_public_admin_user($freshUser),
    ]);
} catch (PDOException $e) {
    $message = strpos($e->getMessage(), 'Duplicate entry') !== false
        ? 'Email or username already exists'
        : $e->getMessage();

    http_response_code(500);
    echo json_encode(["success" => false, "error" => $message]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
?>
