<?php
require_once __DIR__ . '/config/cors.php';

http_response_code(403);
echo json_encode([
    'success' => false,
    'error' => 'Public Alumni President bootstrap is disabled. Manage personnel accounts through the authenticated User Management module.',
]);
