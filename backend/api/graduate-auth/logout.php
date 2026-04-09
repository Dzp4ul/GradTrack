<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/graduate_auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

gradtrack_start_session_if_needed();
unset($_SESSION['graduate_account_id']);

echo json_encode([
    'success' => true,
    'message' => 'Logged out successfully'
]);
