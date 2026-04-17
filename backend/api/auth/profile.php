<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/admin_profile_image.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(["success" => false, "error" => "Authentication required"]);
    exit;
}

$allowedMethods = ['GET', 'PUT', 'POST'];
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
        "profile_image_path" => $user['profile_image_path'] ?? null,
    ];
}

function gradtrack_update_admin_session(array $user): void
{
    $_SESSION['user_id'] = (int) $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['email'] = $user['email'];
    $_SESSION['full_name'] = $user['full_name'] ?? '';
    $_SESSION['role'] = $user['role'];
    $_SESSION['profile_image_path'] = $user['profile_image_path'] ?? null;
}

try {
    gradtrack_ensure_admin_profile_image_table($db);

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
        $currentUser['profile_image_path'] = gradtrack_admin_profile_image_path($db, (int) $currentUser['id']);
        unset($currentUser['password']);
        echo json_encode(["success" => true, "user" => gradtrack_public_admin_user($currentUser)]);
        exit;
    }

    $isMultipart = $method === 'POST';
    $data = [];

    if ($isMultipart) {
        $data = $_POST;
    } else {
        $decoded = json_decode(file_get_contents("php://input"), true);
        if (!is_array($decoded)) {
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Invalid request body"]);
            exit;
        }
        $data = $decoded;
    }

    $fullName = trim((string) ($data['full_name'] ?? ''));
    $currentPassword = (string) ($data['current_password'] ?? '');
    $newPassword = (string) ($data['new_password'] ?? '');

    $updateParams = [
        ':full_name' => $fullName !== '' ? $fullName : null,
        ':id' => (int) $currentUser['id'],
    ];

    $db->beginTransaction();

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

    if (isset($_FILES['profile_image']) && (int) ($_FILES['profile_image']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
        $file = $_FILES['profile_image'];
        if ((int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new RuntimeException('Profile image upload failed');
        }

        $maxSizeBytes = 5 * 1024 * 1024;
        $fileSize = (int) ($file['size'] ?? 0);
        if ($fileSize <= 0 || $fileSize > $maxSizeBytes) {
            throw new RuntimeException('Profile image must be between 1 byte and 5 MB');
        }

        $tmpPath = (string) $file['tmp_name'];
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($tmpPath) ?: 'application/octet-stream';
        $allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!in_array($mimeType, $allowedMimes, true)) {
            throw new RuntimeException('Unsupported image type. Allowed: JPG, PNG, WEBP, GIF');
        }

        $existingPath = gradtrack_admin_profile_image_path($db, (int) $currentUser['id']);

        $uploadRoot = gradtrack_admin_profile_upload_root();
        $accountDir = $uploadRoot . DIRECTORY_SEPARATOR . (int) $currentUser['id'];
        gradtrack_admin_profile_create_dir($accountDir);

        $originalName = (string) ($file['name'] ?? 'profile');
        $safeOriginalName = gradtrack_admin_profile_sanitize_filename($originalName);
        $extension = pathinfo($safeOriginalName, PATHINFO_EXTENSION);
        $storedName = uniqid('profile_', true) . ($extension ? ('.' . strtolower($extension)) : '');
        $destinationPath = $accountDir . DIRECTORY_SEPARATOR . $storedName;

        if (!move_uploaded_file($tmpPath, $destinationPath)) {
            throw new RuntimeException('Failed to save uploaded profile image');
        }

        $relativePath = gradtrack_admin_profile_upload_relative_path((int) $currentUser['id'], $storedName);

        $upsertStmt = $db->prepare('INSERT INTO admin_profile_images
                                    (admin_user_id, file_path, original_file_name, mime_type, file_size_bytes)
                                    VALUES (:admin_user_id, :file_path, :original_file_name, :mime_type, :file_size_bytes)
                                    ON DUPLICATE KEY UPDATE
                                        file_path = VALUES(file_path),
                                        original_file_name = VALUES(original_file_name),
                                        mime_type = VALUES(mime_type),
                                        file_size_bytes = VALUES(file_size_bytes)');
        $upsertStmt->execute([
            ':admin_user_id' => (int) $currentUser['id'],
            ':file_path' => $relativePath,
            ':original_file_name' => $originalName,
            ':mime_type' => $mimeType,
            ':file_size_bytes' => $fileSize,
        ]);

        if ($existingPath) {
            $absOld = gradtrack_admin_profile_abs_path_from_rel($existingPath);
            if (is_file($absOld)) {
                @unlink($absOld);
            }
        }
    }

    $db->commit();

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

    $freshUser['profile_image_path'] = gradtrack_admin_profile_image_path($db, (int) $freshUser['id']);
    gradtrack_update_admin_session($freshUser);

    echo json_encode([
        "success" => true,
        "message" => "Profile updated successfully",
        "user" => gradtrack_public_admin_user($freshUser),
    ]);
} catch (PDOException $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    $message = strpos($e->getMessage(), 'Duplicate entry') !== false
        ? 'Email or username already exists'
        : $e->getMessage();

    http_response_code(500);
    echo json_encode(["success" => false, "error" => $message]);
} catch (Throwable $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
?>
