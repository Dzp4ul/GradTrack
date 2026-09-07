<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/archive.php';
require_once __DIR__ . '/../config/login_throttle.php';
require_once __DIR__ . '/../../vendor/autoload.php';

use PHPMailer\PHPMailer\Exception as MailException;
use PHPMailer\PHPMailer\PHPMailer;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

function gradtrack_reset_clean_text($value): string
{
    return trim((string) ($value ?? ''));
}

function gradtrack_reset_frontend_url(): string
{
    return gradtrack_frontend_url();
}

function gradtrack_reset_create_mailer(): PHPMailer
{
    $host = gradtrack_reset_clean_text(getenv('MAIL_HOST') ?: 'smtp.gmail.com');
    $username = gradtrack_reset_clean_text(getenv('MAIL_USERNAME') ?: '');
    $password = str_replace(' ', '', gradtrack_reset_clean_text(getenv('MAIL_PASSWORD') ?: ''));
    $fromAddress = gradtrack_reset_clean_text(getenv('MAIL_FROM_ADDRESS') ?: $username);
    $fromName = gradtrack_reset_clean_text(getenv('MAIL_FROM_NAME') ?: 'GRADTRACK');

    if ($host === '' || $username === '' || $password === '' || $fromAddress === '') {
        throw new RuntimeException('Mail credentials are not configured.');
    }

    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = $host;
    $mail->SMTPAuth = true;
    $mail->Username = $username;
    $mail->Password = $password;
    $mail->Port = (int) (getenv('MAIL_PORT') ?: 587);
    $mail->CharSet = 'UTF-8';

    $encryption = strtolower(gradtrack_reset_clean_text(getenv('MAIL_ENCRYPTION') ?: 'tls'));
    if ($encryption === 'ssl' || $encryption === 'smtps') {
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
    } elseif ($encryption === 'tls' || $encryption === 'starttls') {
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    }

    $mail->setFrom($fromAddress, $fromName);
    $mail->addReplyTo($fromAddress, $fromName);

    return $mail;
}

function gradtrack_reset_ensure_table(PDO $db): void
{
    if (!gradtrack_runtime_schema_changes_allowed()) return;
    $db->exec("CREATE TABLE IF NOT EXISTS graduate_password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        graduate_account_id INT NOT NULL,
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
        INDEX idx_grad_password_resets_email_created (email, created_at),
        INDEX idx_grad_password_resets_account_created (graduate_account_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function gradtrack_reset_account_by_email(PDO $db, string $email): ?array
{
    $query = "SELECT ga.id AS account_id, ga.email, g.first_name, g.last_name
              FROM graduate_accounts ga
              JOIN graduates g ON ga.graduate_id = g.id AND g.archived_at IS NULL
              WHERE LOWER(ga.email) = :email
              LIMIT 1";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':email', $email);
    $stmt->execute();

    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    return $result ?: null;
}

function gradtrack_reset_retry_response(int $retryAfter): never
{
    $retryAfter = max(1, $retryAfter);
    $serverTime = time();
    http_response_code(429);
    header('Retry-After: ' . $retryAfter);
    header('Cache-Control: no-store');
    echo json_encode([
        'success' => false,
        'error' => 'Please wait before requesting another OTP.',
        'data' => [
            'retry_after_seconds' => $retryAfter,
            'server_time' => $serverTime,
            'resend_available_at' => $serverTime + $retryAfter,
        ],
    ]);
    exit;
}

function gradtrack_reset_reserve_otp_request(string $email): int
{
    $emailRetry = gradtrack_login_throttle_mutate(
        'graduate-reset-otp-email',
        $email,
        static function (array &$state): int {
            $now = time();
            $nextAllowedAt = (int) ($state['next_allowed_at'] ?? 0);
            if ($nextAllowedAt > $now) {
                return $nextAllowedAt - $now;
            }

            $state = ['next_allowed_at' => $now + 60];
            return 0;
        }
    );
    if ($emailRetry > 0) {
        return $emailRetry;
    }

    return gradtrack_login_throttle_mutate(
        'graduate-reset-otp-ip',
        gradtrack_login_client_ip(),
        static function (array &$state): int {
            $now = time();
            $attempts = array_values(array_filter(
                is_array($state['attempts'] ?? null) ? $state['attempts'] : [],
                static fn ($attempt): bool => is_int($attempt) && $attempt > $now - 60
            ));
            $blockedUntil = (int) ($state['blocked_until'] ?? 0);
            if ($blockedUntil > $now) {
                $state = ['attempts' => $attempts, 'blocked_until' => $blockedUntil];
                return $blockedUntil - $now;
            }
            if (count($attempts) >= 10) {
                $state = ['attempts' => $attempts, 'blocked_until' => $now + 60];
                return 60;
            }

            $attempts[] = $now;
            $state = ['attempts' => $attempts, 'blocked_until' => 0];
            return 0;
        }
    );
}

function gradtrack_reset_send_otp_email(string $email, string $fullName, string $otpCode): void
{
    $safeName = htmlspecialchars($fullName, ENT_QUOTES, 'UTF-8');
    $safeOtp = htmlspecialchars($otpCode, ENT_QUOTES, 'UTF-8');
    $signinUrl = gradtrack_reset_frontend_url() . '/graduate/signin';
    $safeSigninUrl = htmlspecialchars($signinUrl, ENT_QUOTES, 'UTF-8');

    $subject = 'GradTrack Password Reset OTP';
    $html = <<<HTML
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#14213d;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #dbe4f0;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#173b80;padding:22px 28px;border-bottom:4px solid #f4c400;">
                <div style="font-size:24px;font-weight:800;color:#ffffff;">Grad<span style="color:#f4c400;">Track</span></div>
                <div style="margin-top:8px;font-size:13px;color:#dce8ff;">Norzagaray College Graduate Tracer Study</div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 10px;">
                <h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;color:#10213f;">Password Reset Verification</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#41516d;">Hello {$safeName},</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#41516d;">Use this OTP code to verify your password reset request:</p>
                <div style="display:inline-block;font-size:28px;letter-spacing:4px;font-weight:800;color:#173b80;background:#eaf2ff;padding:14px 18px;border-radius:8px;">{$safeOtp}</div>
                <p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#5d6b83;">This code expires in 10 minutes. If you did not request a password reset, you can ignore this email.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 30px;">
                <div style="border-top:1px solid #e4eaf3;padding-top:18px;font-size:13px;line-height:1.7;color:#6b778d;">
                  Log in: <a href="{$safeSigninUrl}" style="color:#173b80;">{$safeSigninUrl}</a><br>
                  <strong style="color:#10213f;">GRADTRACK</strong>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
HTML;

    $mail = gradtrack_reset_create_mailer();
    $mail->addAddress($email, $fullName !== '' ? $fullName : 'Graduate');
    $mail->Subject = $subject;
    $mail->isHTML(true);
    $mail->Body = $html;
    $mail->AltBody = "Your GradTrack OTP code is {$otpCode}. It expires in 10 minutes.";
    $mail->send();
}

function gradtrack_reset_send_otp(PDO $db, string $email): void
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Please provide a valid email address']);
        exit;
    }

    $throttleRetry = gradtrack_reset_reserve_otp_request($email);
    if ($throttleRetry > 0) {
        gradtrack_reset_retry_response($throttleRetry);
    }

    $account = gradtrack_reset_account_by_email($db, $email);

    if ($account) {
        $cooldownStmt = $db->prepare('SELECT GREATEST(0, 60 - TIMESTAMPDIFF(SECOND, created_at, NOW())) AS retry_after_seconds
            FROM graduate_password_resets WHERE email = :email ORDER BY id DESC LIMIT 1');
        $cooldownStmt->bindParam(':email', $email);
        $cooldownStmt->execute();
        $latest = $cooldownStmt->fetch(PDO::FETCH_ASSOC);

        $databaseRetry = (int) ($latest['retry_after_seconds'] ?? 0);
        if ($databaseRetry > 0) {
            gradtrack_reset_retry_response($databaseRetry);
        }

        $otpCode = (string) random_int(100000, 999999);
        $otpHash = password_hash($otpCode, PASSWORD_BCRYPT);
        $expiresAt = date('Y-m-d H:i:s', strtotime('+10 minutes'));

        $db->beginTransaction();
        try {
            $invalidateStmt = $db->prepare('UPDATE graduate_password_resets
                SET used_at = COALESCE(used_at, NOW())
                WHERE graduate_account_id = :account_id AND used_at IS NULL');
            $invalidateStmt->execute([':account_id' => $account['account_id']]);

            $insertStmt = $db->prepare('INSERT INTO graduate_password_resets
                (graduate_account_id, email, otp_hash, expires_at)
                VALUES (:account_id, :email, :otp_hash, :expires_at)');
            $insertStmt->execute([
                ':account_id' => $account['account_id'],
                ':email' => $email,
                ':otp_hash' => $otpHash,
                ':expires_at' => $expiresAt,
            ]);
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }

        $fullName = trim((string) ($account['first_name'] ?? '') . ' ' . (string) ($account['last_name'] ?? ''));
        gradtrack_reset_send_otp_email($email, $fullName, $otpCode);
    }

    $serverTime = time();
    header('Cache-Control: no-store');
    echo json_encode([
        'success' => true,
        'message' => 'If this email is registered, an OTP has been sent.',
        'data' => [
            'retry_after_seconds' => 60,
            'server_time' => $serverTime,
            'resend_available_at' => $serverTime + 60,
        ],
    ]);
}

function gradtrack_reset_verify_otp(PDO $db, string $email, string $otp): void
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

    $stmt = $db->prepare('SELECT * FROM graduate_password_resets
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
        $incStmt = $db->prepare('UPDATE graduate_password_resets SET attempt_count = attempt_count + 1 WHERE id = :id');
        $incStmt->bindParam(':id', $row['id']);
        $incStmt->execute();

        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Invalid OTP code']);
        exit;
    }

    $resetToken = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $resetToken);
    $tokenExpiresAt = date('Y-m-d H:i:s', strtotime('+15 minutes'));

    $updateStmt = $db->prepare('UPDATE graduate_password_resets
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

function gradtrack_reset_password(PDO $db, string $email, string $resetToken, string $newPassword, string $confirmPassword): void
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Please provide a valid email address']);
        exit;
    }

    if (!preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/', $newPassword)) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol'
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
    $stmt = $db->prepare('SELECT * FROM graduate_password_resets
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
        $updatePasswordStmt = $db->prepare('UPDATE graduate_accounts SET password_hash = :password_hash WHERE id = :account_id');
        $updatePasswordStmt->bindParam(':password_hash', $passwordHash);
        $updatePasswordStmt->bindParam(':account_id', $row['graduate_account_id']);
        $updatePasswordStmt->execute();

        $markUsedStmt = $db->prepare('UPDATE graduate_password_resets SET used_at = NOW() WHERE id = :id');
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
        'message' => 'Password reset successful. You can now log in with your new password.'
    ]);
}

$database = new Database();
$db = $database->getConnection();
gradtrack_ensure_archive_schema($db, 'graduates');
$data = json_decode(file_get_contents('php://input'), true);
$action = gradtrack_reset_clean_text($data['action'] ?? '');

try {
    gradtrack_reset_ensure_table($db);

    if ($action === 'send_otp') {
        $email = strtolower(gradtrack_reset_clean_text($data['email'] ?? ''));
        gradtrack_reset_send_otp($db, $email);
        exit;
    }

    if ($action === 'verify_otp') {
        $email = strtolower(gradtrack_reset_clean_text($data['email'] ?? ''));
        $otp = gradtrack_reset_clean_text($data['otp'] ?? '');
        gradtrack_reset_verify_otp($db, $email, $otp);
        exit;
    }

    if ($action === 'reset_password') {
        $email = strtolower(gradtrack_reset_clean_text($data['email'] ?? ''));
        $resetToken = gradtrack_reset_clean_text($data['reset_token'] ?? '');
        $newPassword = (string) ($data['new_password'] ?? '');
        $confirmPassword = (string) ($data['confirm_password'] ?? '');
        gradtrack_reset_password($db, $email, $resetToken, $newPassword, $confirmPassword);
        exit;
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid action']);
} catch (MailException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Unable to send OTP email right now. Please try again later.']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => gradtrack_public_exception_message($e, 'Password reset request failed. Please try again later.', 'Graduate password reset API')]);
}
