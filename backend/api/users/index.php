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

if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'super_admin') {
    http_response_code(403);
    echo json_encode(["success" => false, "error" => "Only super admin can manage users"]);
    exit;
}

$allowedRoles = ['super_admin', 'admin', 'mis_staff', 'research_coordinator', 'registrar', 'dean_cs', 'dean_coed', 'dean_hm'];
$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

function ensureIsActiveColumn(PDO $conn): void
{
    $columnStmt = $conn->query("SHOW COLUMNS FROM admin_users LIKE 'is_active'");
    if ($columnStmt === false || $columnStmt->rowCount() === 0) {
        $conn->exec("ALTER TABLE admin_users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1");
    }
}

$db->exec("
    ALTER TABLE admin_users
    MODIFY role ENUM('super_admin', 'admin', 'mis_staff', 'research_coordinator', 'registrar', 'dean_cs', 'dean_coed', 'dean_hm') DEFAULT 'admin'
");
ensureIsActiveColumn($db);

try {
    switch ($method) {
        case 'GET':
            $where = [];
            $params = [];

            if (isset($_GET['search']) && trim((string) $_GET['search']) !== '') {
                $search = '%' . trim((string) $_GET['search']) . '%';
                $where[] = '(username LIKE :search1 OR email LIKE :search2 OR full_name LIKE :search3)';
                $params[':search1'] = $search;
                $params[':search2'] = $search;
                $params[':search3'] = $search;
            }

            if (isset($_GET['role']) && trim((string) $_GET['role']) !== '') {
                $where[] = 'role = :role';
                $params[':role'] = trim((string) $_GET['role']);
            }

            if (isset($_GET['is_active']) && $_GET['is_active'] !== '') {
                $where[] = 'is_active = :is_active';
                $params[':is_active'] = (int) $_GET['is_active'] === 1 ? 1 : 0;
            }

            $whereClause = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';
            $sql = "
                SELECT id, username, email, full_name, role, is_active, created_at
                FROM admin_users
                $whereClause
                ORDER BY created_at DESC
            ";

            $stmt = $db->prepare($sql);
            $stmt->execute($params);
            $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode(["success" => true, "data" => $users]);
            break;

        case 'POST':
            $data = json_decode(file_get_contents("php://input"), true);

            $email = trim((string) ($data['email'] ?? ''));
            $username = trim((string) ($data['username'] ?? ''));
            $fullName = trim((string) ($data['full_name'] ?? ''));
            $password = (string) ($data['password'] ?? '');
            $role = (string) ($data['role'] ?? '');
            $isActive = isset($data['is_active']) ? ((int) $data['is_active'] === 1 ? 1 : 0) : 1;

            if ($email === '' || $username === '' || $password === '' || $role === '') {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "email, username, password, and role are required"]);
                break;
            }

            if (!in_array($role, $allowedRoles, true)) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "Invalid role"]);
                break;
            }

            $hash = password_hash($password, PASSWORD_BCRYPT);

            $stmt = $db->prepare("
                INSERT INTO admin_users (username, email, password, full_name, role, is_active)
                VALUES (:username, :email, :password, :full_name, :role, :is_active)
            ");
            $stmt->execute([
                ':username' => $username,
                ':email' => $email,
                ':password' => $hash,
                ':full_name' => $fullName !== '' ? $fullName : null,
                ':role' => $role,
                ':is_active' => $isActive,
            ]);

            echo json_encode(["success" => true, "message" => "User created"]);
            break;

        case 'PUT':
            $data = json_decode(file_get_contents("php://input"), true);
            $id = isset($data['id']) ? (int) $data['id'] : 0;

            if ($id <= 0) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "Valid id is required"]);
                break;
            }

            $existingStmt = $db->prepare("
                SELECT id, username, email, full_name, role, is_active
                FROM admin_users
                WHERE id = :id
            ");
            $existingStmt->execute([':id' => $id]);
            $existing = $existingStmt->fetch(PDO::FETCH_ASSOC);

            if (!$existing) {
                http_response_code(404);
                echo json_encode(["success" => false, "error" => "User not found"]);
                break;
            }

            $nextUsername = isset($data['username']) ? trim((string) $data['username']) : $existing['username'];
            $nextEmail = isset($data['email']) ? trim((string) $data['email']) : $existing['email'];
            $nextFullName = isset($data['full_name']) ? trim((string) $data['full_name']) : ($existing['full_name'] ?? '');
            $nextRole = isset($data['role']) ? (string) $data['role'] : $existing['role'];
            $nextIsActive = array_key_exists('is_active', $data) ? ((int) $data['is_active'] === 1 ? 1 : 0) : (int) $existing['is_active'];
            $newPassword = isset($data['password']) ? trim((string) $data['password']) : '';

            if ($nextUsername === '' || $nextEmail === '' || $nextRole === '') {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "username, email, and role cannot be empty"]);
                break;
            }

            if (!in_array($nextRole, $allowedRoles, true)) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "Invalid role"]);
                break;
            }

            if (
                $nextIsActive === 0
                && (int) $_SESSION['user_id'] === $id
                && ($_SESSION['role'] ?? '') === 'super_admin'
            ) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "Logged-in super admin account cannot be deactivated"]);
                break;
            }

            if ($newPassword !== '') {
                $updateStmt = $db->prepare("
                    UPDATE admin_users
                    SET username = :username, email = :email, full_name = :full_name, role = :role, is_active = :is_active, password = :password
                    WHERE id = :id
                ");
                $updateStmt->execute([
                    ':username' => $nextUsername,
                    ':email' => $nextEmail,
                    ':full_name' => $nextFullName !== '' ? $nextFullName : null,
                    ':role' => $nextRole,
                    ':is_active' => $nextIsActive,
                    ':password' => password_hash($newPassword, PASSWORD_BCRYPT),
                    ':id' => $id,
                ]);
            } else {
                $updateStmt = $db->prepare("
                    UPDATE admin_users
                    SET username = :username, email = :email, full_name = :full_name, role = :role, is_active = :is_active
                    WHERE id = :id
                ");
                $updateStmt->execute([
                    ':username' => $nextUsername,
                    ':email' => $nextEmail,
                    ':full_name' => $nextFullName !== '' ? $nextFullName : null,
                    ':role' => $nextRole,
                    ':is_active' => $nextIsActive,
                    ':id' => $id,
                ]);
            }

            echo json_encode(["success" => true, "message" => "User updated"]);
            break;

        default:
            http_response_code(405);
            echo json_encode(["success" => false, "error" => "Method not allowed"]);
    }
} catch (PDOException $e) {
    $message = strpos($e->getMessage(), 'Duplicate entry') !== false
        ? 'Email or username already exists'
        : $e->getMessage();

    http_response_code(500);
    echo json_encode(["success" => false, "error" => $message]);
}
