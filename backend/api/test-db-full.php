<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

try {
    $database = new Database();
    $conn = $database->getConnection();

    $graduates = $conn->query('SELECT COUNT(*) AS count FROM graduates')->fetch(PDO::FETCH_ASSOC);

    echo json_encode([
        'status' => 'success',
        'message' => 'Database connected successfully',
        'graduate_count' => (int) ($graduates['count'] ?? 0),
    ]);
} catch (Throwable $e) {
    error_log('Full database diagnostic failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to connect to the server. Please try again later.',
    ]);
}
