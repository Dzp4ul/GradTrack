<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';

function gradtrack_profile_upload_root(): string
{
    return realpath(__DIR__ . '/../../') . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'profile-images';
}

function gradtrack_profile_upload_relative_path(int $accountId, string $fileName): string
{
    return 'uploads/profile-images/' . $accountId . '/' . $fileName;
}

function gradtrack_profile_create_dir(string $dir): void
{
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
}

function gradtrack_profile_sanitize_filename(string $name): string
{
    $safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', $name);
    return $safe ?: ('profile_' . time());
}

function gradtrack_profile_abs_path_from_rel(string $relativePath): string
{
    return realpath(__DIR__ . '/../../') . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    $user = gradtrack_require_graduate_auth($db);
    $accountId = (int) $user['account_id'];
    $graduateId = (int) $user['graduate_id'];

    if ($method === 'GET') {
        echo json_encode([
            'success' => true,
            'data' => [
                'user' => gradtrack_current_graduate_user($db),
            ],
        ]);
        exit;
    }

    if ($method === 'POST') {
        $firstName = isset($_POST['first_name']) ? trim((string) $_POST['first_name']) : (string) ($user['first_name'] ?? '');
        $middleName = isset($_POST['middle_name']) ? trim((string) $_POST['middle_name']) : (string) ($user['middle_name'] ?? '');
        $lastName = isset($_POST['last_name']) ? trim((string) $_POST['last_name']) : (string) ($user['last_name'] ?? '');
        $email = isset($_POST['email']) ? trim((string) $_POST['email']) : (string) ($user['email'] ?? '');
        $phone = isset($_POST['phone']) ? trim((string) $_POST['phone']) : (string) ($user['phone'] ?? '');
        $address = isset($_POST['address']) ? trim((string) $_POST['address']) : (string) ($user['address'] ?? '');
        $password = isset($_POST['password']) ? (string) $_POST['password'] : '';

        if ($firstName === '' || $lastName === '' || $email === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'first_name, last_name, and email are required']);
            exit;
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid email format']);
            exit;
        }

        $dupStmt = $db->prepare('SELECT id FROM graduate_accounts WHERE email = :email AND id <> :account_id LIMIT 1');
        $dupStmt->bindParam(':email', $email);
        $dupStmt->bindParam(':account_id', $accountId);
        $dupStmt->execute();
        if ($dupStmt->fetch(PDO::FETCH_ASSOC)) {
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => 'Email is already in use by another account']);
            exit;
        }

        $db->beginTransaction();

        $updateGraduate = $db->prepare('UPDATE graduates
                                        SET first_name = :first_name,
                                            middle_name = :middle_name,
                                            last_name = :last_name,
                                            email = :email,
                                            phone = :phone,
                                            address = :address
                                        WHERE id = :graduate_id');
        $updateGraduate->bindParam(':first_name', $firstName);
        $updateGraduate->bindParam(':middle_name', $middleName);
        $updateGraduate->bindParam(':last_name', $lastName);
        $updateGraduate->bindParam(':email', $email);
        $updateGraduate->bindParam(':phone', $phone);
        $updateGraduate->bindParam(':address', $address);
        $updateGraduate->bindParam(':graduate_id', $graduateId);
        $updateGraduate->execute();

        $updateAccount = $db->prepare('UPDATE graduate_accounts SET email = :email WHERE id = :account_id');
        $updateAccount->bindParam(':email', $email);
        $updateAccount->bindParam(':account_id', $accountId);
        $updateAccount->execute();

        if ($password !== '') {
            $hashed = password_hash($password, PASSWORD_DEFAULT);
            $updatePassword = $db->prepare('UPDATE graduate_accounts SET password_hash = :password_hash WHERE id = :account_id');
            $updatePassword->bindParam(':password_hash', $hashed);
            $updatePassword->bindParam(':account_id', $accountId);
            $updatePassword->execute();
        }

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

            $existingStmt = $db->prepare('SELECT file_path FROM graduate_profile_images WHERE graduate_account_id = :account_id LIMIT 1');
            $existingStmt->bindParam(':account_id', $accountId);
            $existingStmt->execute();
            $existingPath = $existingStmt->fetch(PDO::FETCH_ASSOC)['file_path'] ?? null;

            $uploadRoot = gradtrack_profile_upload_root();
            $accountDir = $uploadRoot . DIRECTORY_SEPARATOR . $accountId;
            gradtrack_profile_create_dir($accountDir);

            $originalName = (string) ($file['name'] ?? 'profile');
            $safeOriginalName = gradtrack_profile_sanitize_filename($originalName);
            $extension = pathinfo($safeOriginalName, PATHINFO_EXTENSION);
            $storedName = uniqid('profile_', true) . ($extension ? ('.' . strtolower($extension)) : '');
            $destinationPath = $accountDir . DIRECTORY_SEPARATOR . $storedName;

            if (!move_uploaded_file($tmpPath, $destinationPath)) {
                throw new RuntimeException('Failed to save uploaded profile image');
            }

            $relativePath = gradtrack_profile_upload_relative_path($accountId, $storedName);

            $upsertStmt = $db->prepare('INSERT INTO graduate_profile_images
                                        (graduate_account_id, file_path, original_file_name, mime_type, file_size_bytes)
                                        VALUES (:account_id, :file_path, :original_file_name, :mime_type, :file_size_bytes)
                                        ON DUPLICATE KEY UPDATE
                                            file_path = VALUES(file_path),
                                            original_file_name = VALUES(original_file_name),
                                            mime_type = VALUES(mime_type),
                                            file_size_bytes = VALUES(file_size_bytes)');
            $upsertStmt->bindParam(':account_id', $accountId);
            $upsertStmt->bindParam(':file_path', $relativePath);
            $upsertStmt->bindParam(':original_file_name', $originalName);
            $upsertStmt->bindParam(':mime_type', $mimeType);
            $upsertStmt->bindParam(':file_size_bytes', $fileSize);
            $upsertStmt->execute();

            if ($existingPath) {
                $absOld = gradtrack_profile_abs_path_from_rel($existingPath);
                if (is_file($absOld)) {
                    @unlink($absOld);
                }
            }
        }

        $db->commit();

        echo json_encode([
            'success' => true,
            'message' => 'Profile updated successfully',
            'data' => [
                'user' => gradtrack_current_graduate_user($db),
            ],
        ]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
} catch (Throwable $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
