<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/audit_trail.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

gradtrack_start_session_if_needed();

$graduateAccountId = isset($_SESSION['graduate_account_id']) ? (int) $_SESSION['graduate_account_id'] : null;

if ($graduateAccountId !== null) {
    // Audit Trail: call logAuditTrail() before clearing graduate session details.
    logAuditTrail(
        $graduateAccountId,
        'Graduate Account #' . $graduateAccountId,
        'graduate',
        null,
        'Logout',
        'Authentication',
        'Graduate Account #' . $graduateAccountId . ' logged out of the graduate portal.'
    );
}

unset($_SESSION['graduate_account_id']);

echo json_encode([
    'success' => true,
    'message' => 'Logged out successfully'
]);
