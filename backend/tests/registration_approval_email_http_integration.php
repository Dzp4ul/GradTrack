<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';
require_once __DIR__ . '/../api/config/alumni_registry.php';

function approval_email_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
    echo 'PASS: ' . $message . PHP_EOL;
}

function approval_email_request(string $url, string $sessionName, string $sessionId, string $csrfToken, array $payload): array
{
    $handle = curl_init($url);
    if ($handle === false) {
        throw new RuntimeException('Unable to initialize approval request');
    }
    curl_setopt_array($handle, [
        CURLOPT_CUSTOMREQUEST => 'PUT',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'X-CSRF-Token: ' . $csrfToken,
            'Cookie: ' . $sessionName . '=' . $sessionId,
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_THROW_ON_ERROR),
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 30,
    ]);
    $raw = curl_exec($handle);
    if ($raw === false) {
        $error = curl_error($handle);
        curl_close($handle);
        throw new RuntimeException('Approval HTTP request failed: ' . $error);
    }
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);
    $decoded = json_decode((string) $raw, true);
    return ['status' => $status, 'body' => is_array($decoded) ? $decoded : []];
}

if (!function_exists('curl_init')) {
    fwrite(STDERR, "FAIL: PHP cURL support is required for the approval email integration test.\n");
    exit(1);
}

$db = (new Database())->getConnection();
$baseUrl = rtrim((string) (getenv('GRADTRACK_API_BASE_URL') ?: 'http://localhost/GradTrack/backend'), '/');
$endpoint = $baseUrl . '/api/alumni-registry/index.php';
$suffix = bin2hex(random_bytes(6));
$adminId = 0;
$graduateId = 0;
$accountId = 0;
$registryId = 0;
$sessionId = '';

try {
    $program = $db->query('SELECT id, name, code FROM programs ORDER BY id LIMIT 1')->fetch(PDO::FETCH_ASSOC);
    if (!$program) {
        throw new RuntimeException('At least one program is required for the approval fixture');
    }

    $adminStmt = $db->prepare("INSERT INTO admin_users
        (username, email, password, full_name, role, is_active)
        VALUES (:username, :email, :password, 'Approval Email Test', 'alumni_president', 1)");
    $adminStmt->execute([
        ':username' => 'approval_email_' . $suffix,
        ':email' => 'approval-email-' . $suffix . '@example.invalid',
        ':password' => password_hash('Integration#Test123', PASSWORD_BCRYPT),
    ]);
    $adminId = (int) $db->lastInsertId();

    $recipientEmail = 'invalid-approval-email-' . $suffix;
    $firstName = 'Approval';
    $middleName = 'Email';
    $lastName = 'Fixture' . strtoupper(substr($suffix, 0, 4));
    $expectedName = "{$firstName} {$middleName} {$lastName}";
    $graduateStmt = $db->prepare("INSERT INTO graduates
        (student_id, first_name, middle_name, last_name, email, program_id, year_graduated, status)
        VALUES (:student_id, :first_name, :middle_name, :last_name, :email, :program_id, 2025, 'active')");
    $graduateStmt->execute([
        ':student_id' => 'APPR-' . strtoupper($suffix),
        ':first_name' => $firstName,
        ':middle_name' => $middleName,
        ':last_name' => $lastName,
        ':email' => $recipientEmail,
        ':program_id' => (int) $program['id'],
    ]);
    $graduateId = (int) $db->lastInsertId();

    $accountStmt = $db->prepare("INSERT INTO graduate_accounts
        (graduate_id, email, password_hash, status, alumni_verification_status, alumni_verification_submitted_at)
        VALUES (:graduate_id, :email, :password_hash, 'pending_verification', 'pending', NOW())");
    $accountStmt->execute([
        ':graduate_id' => $graduateId,
        ':email' => $recipientEmail,
        ':password_hash' => password_hash('Integration#Test123', PASSWORD_BCRYPT),
    ]);
    $accountId = (int) $db->lastInsertId();

    $registryStmt = $db->prepare("INSERT INTO registered_alumni
        (full_name, normalized_name, course_id, course_name, course_code, batch_year, registration_status, linked_user_id, source_file)
        VALUES (:full_name, :normalized_name, :course_id, :course_name, :course_code, 2025, 'Registered', :linked_user_id, 'approval-email-integration')");
    $registryStmt->execute([
        ':full_name' => strtoupper($expectedName),
        ':normalized_name' => gradtrack_alumni_registry_normalize_name($expectedName),
        ':course_id' => (int) $program['id'],
        ':course_name' => (string) $program['name'],
        ':course_code' => (string) $program['code'],
        ':linked_user_id' => $accountId,
    ]);
    $registryId = (int) $db->lastInsertId();

    gradtrack_start_session();
    if (!session_regenerate_id(true)) {
        throw new RuntimeException('Unable to create the approval test session');
    }
    $_SESSION = [
        'admin_user_id' => $adminId,
        'authenticated_at' => time(),
        'csrf_token' => bin2hex(random_bytes(32)),
    ];
    $sessionId = session_id();
    $sessionName = session_name();
    $csrfToken = (string) $_SESSION['csrf_token'];
    session_write_close();

    $url = $endpoint . '?action=approve_account';
    $first = approval_email_request($url, $sessionName, $sessionId, $csrfToken, ['graduate_account_id' => $accountId]);
    $retry = approval_email_request($url, $sessionName, $sessionId, $csrfToken, ['graduate_account_id' => $accountId]);

    approval_email_assert($first['status'] === 200 && ($first['body']['success'] ?? false) === true, 'pending registration approval succeeds');
    approval_email_assert($retry['status'] === 200 && ($retry['body']['success'] ?? false) === true, 'repeated approval remains an idempotent success');

    $approvedStmt = $db->prepare('SELECT status, alumni_verification_status FROM graduate_accounts WHERE id = :id');
    $approvedStmt->execute([':id' => $accountId]);
    $approved = $approvedStmt->fetch(PDO::FETCH_ASSOC);
    approval_email_assert(
        ($approved['status'] ?? '') === 'active' && ($approved['alumni_verification_status'] ?? '') === 'approved',
        'account is active and approved after the transaction commits'
    );

    $deliveryStmt = $db->prepare("SELECT recipient_email, recipient_name, status
        FROM email_notification_deliveries
        WHERE notification_type = 'graduate_registration_approved' AND entity_id = :account_id");
    $deliveryStmt->execute([':account_id' => $accountId]);
    $deliveries = $deliveryStmt->fetchAll(PDO::FETCH_ASSOC);
    approval_email_assert(count($deliveries) === 1, 'double approval creates exactly one approval email delivery record');
    approval_email_assert(
        ($deliveries[0]['recipient_email'] ?? '') === $recipientEmail
        && ($deliveries[0]['recipient_name'] ?? '') === strtoupper($expectedName),
        'approval notification uses the registered account email and complete graduate name'
    );
    approval_email_assert(
        ($deliveries[0]['status'] ?? '') === 'failed',
        'simulated invalid-recipient mail failure is logged without reversing approval'
    );

    $missing = approval_email_request($url, $sessionName, $sessionId, $csrfToken, ['graduate_account_id' => 2147483647]);
    approval_email_assert($missing['status'] === 404 && ($missing['body']['success'] ?? true) === false, 'failed approval does not report success');
    $missingDeliveryStmt = $db->query("SELECT COUNT(*) FROM email_notification_deliveries
        WHERE notification_type = 'graduate_registration_approved' AND entity_id = 2147483647");
    approval_email_assert((int) $missingDeliveryStmt->fetchColumn() === 0, 'failed approval does not create an email delivery');

    echo PHP_EOL . 'Registration approval email HTTP integration test passed.' . PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, 'FAIL: ' . $error->getMessage() . PHP_EOL);
    $exitCode = 1;
} finally {
    if ($accountId > 0) {
        $db->prepare("DELETE FROM email_notification_deliveries
                      WHERE notification_type = 'graduate_registration_approved' AND entity_id = :account_id")
            ->execute([':account_id' => $accountId]);
    }
    if ($registryId > 0) {
        $db->prepare('DELETE FROM registered_alumni WHERE id = :id')->execute([':id' => $registryId]);
    }
    if ($accountId > 0) {
        $db->prepare('DELETE FROM graduate_accounts WHERE id = :id')->execute([':id' => $accountId]);
    }
    if ($graduateId > 0) {
        $db->prepare('DELETE FROM graduates WHERE id = :id')->execute([':id' => $graduateId]);
    }
    if ($adminId > 0) {
        $db->prepare("DELETE FROM audit_trail WHERE user_id = :admin_id AND module = 'Alumni Account Verification'")
            ->execute([':admin_id' => $adminId]);
        $db->prepare('DELETE FROM admin_users WHERE id = :id')->execute([':id' => $adminId]);
    }
}

exit($exitCode ?? 0);
