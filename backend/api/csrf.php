<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/csrf.php';

if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
    http_response_code(405);
    header('Allow: GET');
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

echo json_encode([
    'success' => true,
    'csrf_token' => gradtrack_csrf_token(),
]);
