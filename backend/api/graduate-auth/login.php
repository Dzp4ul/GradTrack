<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/audit_trail.php';
require_once __DIR__ . '/../config/system_settings.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$email = isset($data['email']) ? strtolower(trim($data['email'])) : '';
$password = $data['password'] ?? '';

if ($email === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Email and password are required']);
    exit;
}

$database = new Database();
$db = $database->getConnection();

try {
    gradtrack_system_block_if_maintenance($db, 'graduate');

    gradtrack_ensure_graduate_account_verification_schema($db);

    $query = "SELECT id, password_hash, status, alumni_verification_status, alumni_verification_reason
              FROM graduate_accounts
              WHERE email = :email";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':email', $email);
    $stmt->execute();
    $account = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$account || !password_verify($password, $account['password_hash'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Invalid email or password']);
        exit;
    }

    $accessError = gradtrack_graduate_account_access_error($account);
    if ($accessError !== null) {
        http_response_code(403);
        echo json_encode(array_merge(['success' => false], $accessError));
        exit;
    }

    gradtrack_start_session_if_needed();
    $_SESSION['graduate_account_id'] = (int) $account['id'];

    $touchLoginStmt = $db->prepare('UPDATE graduate_accounts SET last_login_at = NOW() WHERE id = :id');
    $touchLoginStmt->bindParam(':id', $account['id']);
    $touchLoginStmt->execute();

    $user = gradtrack_current_graduate_user($db);

    if ($user) {
        // Audit Trail: call logAuditTrail() after a graduate login session is successfully created.
        logAuditTrail(
            $user['graduate_id'],
            gradtrack_audit_graduate_name($user),
            'graduate',
            $user['program_code'] ?? null,
            'Login',
            'Authentication',
            'Logged in to the graduate portal.'
        );
    }

    echo json_encode([
        'success' => true,
        'user' => $user
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Login failed: ' . $e->getMessage()]);
}
