<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/audit_trail.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$auditUser = gradtrack_audit_current_admin_context();

// Audit Trail: call logAuditTrail() before clearing the session so user details are still available.
logAuditTrail(
    $auditUser['user_id'],
    $auditUser['user_name'],
    $auditUser['user_role'],
    $auditUser['department'],
    'Logout',
    'Authentication',
    $auditUser['user_name'] . ' logged out.'
);

$_SESSION = [];

if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires' => time() - 42000,
        'path' => $params['path'] ?: '/',
        'domain' => $params['domain'] ?: '',
        'secure' => (bool) $params['secure'],
        'httponly' => (bool) $params['httponly'],
        'samesite' => $params['samesite'] ?: 'Lax'
    ]);
}

session_destroy();

http_response_code(200);
echo json_encode(['success' => true, 'message' => 'Logged out successfully']);
?>
