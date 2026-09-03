<?php
http_response_code(403);
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, private');

echo json_encode([
    'success' => false,
    'message' => 'This maintenance operation is not available over HTTP.',
]);
