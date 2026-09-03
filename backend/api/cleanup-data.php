<?php
require_once __DIR__ . '/config/cors.php';

http_response_code(410);
echo json_encode([
    'success' => false,
    'error' => 'This destructive data-reset endpoint has been permanently disabled. Use the authorized archive and restore workflows instead.',
]);
