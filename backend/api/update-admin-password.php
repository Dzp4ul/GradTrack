<?php
require_once __DIR__ . '/config/cors.php';

http_response_code(403);
echo json_encode([
    'success' => false,
    'error' => 'This password reset utility is disabled. Use the authenticated admin profile flow or forgot-password flow.',
]);
