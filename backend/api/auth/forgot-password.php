<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/password_policy.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/email.php';

use PHPMailer\PHPMailer\Exception as MailException;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

function admin_reset_clean_text($value): string
{
    return trim((string) ($value ?? ''));
}

function admin_reset_ensure_table(PDO $db): void
{
    if (!gradtrack_runtime_schema_changes_allowed()) return;
    $db->exec("CREATE TABLE IF NOT EXISTS admin_password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_user_id INT NOT NULL,
        email VARCHAR(255) NOT NULL,
        otp_hash VARCHAR(255) NOT NULL,
        expires_at DATETIME NOT NULL,
        attempt_count INT NOT NULL DEFAULT 0,
        verified_at DATETIME NULL,
        verified_token_hash CHAR(64) NULL,
        verified_expires_at DATETIME NULL,
        used_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_admin_password_resets_email_created (email, created_at),
        INDEX idx_admin_password_resets_user_created (admin_user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function admin_reset_account_by_email(PDO $db, string $email): ?array
{
    $query = "SELECT id, email, full_name
              FROM admin_users
              WHERE LOWER(email) = :email
              LIMIT 1";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':email', $email);
    $stmt->execute();

    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    return $result ?: null;
}

function admin_reset_send_otp_email(string $email, string $fullName, string $otpCode): void
{
    $signinUrl = gradtrack_frontend_url() . '/admin/signin';
    $recipientName = $fullName !== '' ? $fullName : 'Admin User';
    gradtrack_email_send(
        $email,
        $recipientName,
        gradtrack_email_password_reset_message($recipientName, $otpCode, $signinUrl, true)
    );
}

function admin_reset_send_otp(PDO $db, string $email): void
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Please provide a valid email address']);
        exit;
    }

    $account = admin_reset_account_by_email($db, $email);

    if ($account) {
        $cooldownStmt = $db->prepare('SELECT created_at FROM admin_password_resets WHERE email = :email ORDER BY id DESC LIMIT 1');
        $cooldownStmt->bindParam(':email', $email);
        $cooldownStmt->execute();
        $latest = $cooldownStmt->fetch(PDO::FETCH_ASSOC);

        if ($latest && isset($latest['created_at']) && strtotime((string) $latest['created_at']) > (time() - 60)) {
            http_response_code(429);
            echo json_encode([
                'success' => false,
                'error' => 'Please wait at least 1 minute before requesting another OTP.'
            ]);
            exit;
        }

        $otpCode = (string) random_int(100000, 999999);
        $otpHash = password_hash($otpCode, PASSWORD_BCRYPT);
        $expiresAt = date('Y-m-d H:i:s', strtotime('+10 minutes'));

        $insertStmt = $db->prepare('INSERT INTO admin_password_resets
            (admin_user_id, email, otp_hash, expires_at)
            VALUES (:admin_user_id, :email, :otp_hash, :expires_at)');
        $insertStmt->bindParam(':admin_user_id', $account['id']);
        $insertStmt->bindParam(':email', $email);
        $insertStmt->bindParam(':otp_hash', $otpHash);
        $insertStmt->bindParam(':expires_at', $expiresAt);
        $insertStmt->execute();

        $fullName = trim((string) ($account['full_name'] ?? ''));
        admin_reset_send_otp_email($email, $fullName, $otpCode);
    }

    echo json_encode([
        'success' => true,
        'message' => 'If this email is registered, an OTP has been sent.'
    ]);
}

function admin_reset_verify_otp(PDO $db, string $email, string $otp): void
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Please provide a valid email address']);
        exit;
    }

    if (!preg_match('/^\d{6}$/', $otp)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'OTP must be a 6-digit code']);
        exit;
    }

    $stmt = $db->prepare('SELECT * FROM admin_password_resets
        WHERE email = :email AND used_at IS NULL AND expires_at >= NOW()
        ORDER BY id DESC LIMIT 1');
    $stmt->bindParam(':email', $email);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'OTP not found or already expired']);
        exit;
    }

    if ((int) ($row['attempt_count'] ?? 0) >= 5) {
        http_response_code(429);
        echo json_encode(['success' => false, 'error' => 'Too many invalid attempts. Please request a new OTP.']);
        exit;
    }

    if (!password_verify($otp, (string) $row['otp_hash'])) {
        $incStmt = $db->prepare('UPDATE admin_password_resets SET attempt_count = attempt_count + 1 WHERE id = :id');
        $incStmt->bindParam(':id', $row['id']);
        $incStmt->execute();

        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Invalid OTP code']);
        exit;
    }

    $resetToken = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $resetToken);
    $tokenExpiresAt = date('Y-m-d H:i:s', strtotime('+15 minutes'));

    $updateStmt = $db->prepare('UPDATE admin_password_resets
        SET verified_at = NOW(), verified_token_hash = :token_hash, verified_expires_at = :token_expires_at
        WHERE id = :id');
    $updateStmt->bindParam(':token_hash', $tokenHash);
    $updateStmt->bindParam(':token_expires_at', $tokenExpiresAt);
    $updateStmt->bindParam(':id', $row['id']);
    $updateStmt->execute();

    echo json_encode([
        'success' => true,
        'message' => 'OTP verified successfully.',
        'data' => [
            'reset_token' => $resetToken
        ]
    ]);
}

function admin_reset_password(PDO $db, string $email, string $resetToken, string $newPassword, string $confirmPassword): void
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Please provide a valid email address']);
        exit;
    }

    $passwordError = gradtrack_admin_password_error($newPassword);
    if ($passwordError !== null) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => $passwordError
        ]);
        exit;
    }

    if ($newPassword !== $confirmPassword) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Password and confirm password do not match']);
        exit;
    }

    if ($resetToken === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Reset token is required']);
        exit;
    }

    $tokenHash = hash('sha256', $resetToken);
    $stmt = $db->prepare('SELECT * FROM admin_password_resets
        WHERE email = :email
        AND verified_token_hash = :token_hash
        AND verified_at IS NOT NULL
        AND verified_expires_at >= NOW()
        AND used_at IS NULL
        ORDER BY id DESC
        LIMIT 1');
    $stmt->bindParam(':email', $email);
    $stmt->bindParam(':token_hash', $tokenHash);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Verification session is invalid or expired']);
        exit;
    }

    $passwordHash = password_hash($newPassword, PASSWORD_BCRYPT);

    $db->beginTransaction();
    try {
        $updatePasswordStmt = $db->prepare('UPDATE admin_users SET password = :password_hash WHERE id = :admin_user_id');
        $updatePasswordStmt->bindParam(':password_hash', $passwordHash);
        $updatePasswordStmt->bindParam(':admin_user_id', $row['admin_user_id']);
        $updatePasswordStmt->execute();

        $markUsedStmt = $db->prepare('UPDATE admin_password_resets SET used_at = NOW() WHERE id = :id');
        $markUsedStmt->bindParam(':id', $row['id']);
        $markUsedStmt->execute();

        $db->commit();
    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }

    echo json_encode([
        'success' => true,
        'message' => 'Password reset successful. You can now sign in with your new password.'
    ]);
}

$database = new Database();
$db = $database->getConnection();
$data = json_decode(file_get_contents('php://input'), true);
$action = admin_reset_clean_text($data['action'] ?? '');

try {
    admin_reset_ensure_table($db);

    if ($action === 'send_otp') {
        $email = strtolower(admin_reset_clean_text($data['email'] ?? ''));
        admin_reset_send_otp($db, $email);
        exit;
    }

    if ($action === 'verify_otp') {
        $email = strtolower(admin_reset_clean_text($data['email'] ?? ''));
        $otp = admin_reset_clean_text($data['otp'] ?? '');
        admin_reset_verify_otp($db, $email, $otp);
        exit;
    }

    if ($action === 'reset_password') {
        $email = strtolower(admin_reset_clean_text($data['email'] ?? ''));
        $resetToken = admin_reset_clean_text($data['reset_token'] ?? '');
        $newPassword = (string) ($data['new_password'] ?? '');
        $confirmPassword = (string) ($data['confirm_password'] ?? '');
        admin_reset_password($db, $email, $resetToken, $newPassword, $confirmPassword);
        exit;
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid action']);
} catch (MailException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Unable to send OTP email right now. Please try again later.']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => gradtrack_public_exception_message($e, 'Password reset request failed. Please try again later.', 'Admin password reset API')]);
}
