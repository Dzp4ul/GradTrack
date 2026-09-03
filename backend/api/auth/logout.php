<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/audit_trail.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/admin_auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$database = new Database();
$db = $database->getConnection();
$currentUser = gradtrack_current_admin_user($db);
$auditUser = $currentUser !== null
    ? gradtrack_admin_audit_context($currentUser)
    : ['user_id' => null, 'user_name' => 'Guest', 'user_role' => 'guest', 'department' => null];

// Audit Trail: call logAuditTrail() before clearing the session so user details are still available.
logAuditTrail(
    $auditUser['user_id'],
    $auditUser['user_name'],
    $auditUser['user_role'],
    $auditUser['department'],
    'Logout',
    'Authentication',
    'Logged out of the administrative portal.'
);

gradtrack_destroy_current_session();

http_response_code(200);
echo json_encode(['success' => true, 'message' => 'Logged out successfully']);
?>
