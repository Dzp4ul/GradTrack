<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

try {
    $database = new Database();
    $conn = $database->getConnection();

    $graduates = $conn->query('SELECT COUNT(*) AS count FROM graduates')->fetch(PDO::FETCH_ASSOC);
    $responses = $conn->query('SELECT COUNT(*) AS count FROM survey_responses')->fetch(PDO::FETCH_ASSOC);
    $admins = $conn->query('SELECT COUNT(*) AS count FROM admin_users')->fetch(PDO::FETCH_ASSOC);

    echo json_encode([
        'status' => 'success',
        'message' => 'Database connected successfully',
        'database' => [
            'graduates_count' => (int) ($graduates['count'] ?? 0),
            'survey_responses_count' => (int) ($responses['count'] ?? 0),
            'admin_users_count' => (int) ($admins['count'] ?? 0),
        ],
    ]);
} catch (Throwable $e) {
    error_log('Database connection diagnostic failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to connect to the server. Please try again later.',
    ]);
}
