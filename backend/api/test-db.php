<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';

try {
    $database = new Database();
    $conn = $database->getConnection();

    $selectOne = $conn->query('SELECT 1 AS ok')->fetch(PDO::FETCH_ASSOC);
    $tables = $conn->query('SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = DATABASE()')->fetch(PDO::FETCH_ASSOC);
    $admins = $conn->query('SELECT COUNT(*) AS admin_count FROM admin_users')->fetch(PDO::FETCH_ASSOC);

    echo json_encode([
        'status' => 'success',
        'message' => 'Database connected successfully',
        'checks' => [
            'select_1' => (int) ($selectOne['ok'] ?? 0),
            'table_count' => (int) ($tables['table_count'] ?? 0),
            'admin_count' => (int) ($admins['admin_count'] ?? 0),
        ],
    ]);
} catch (Throwable $e) {
    error_log('Database diagnostic failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to connect to the server. Please try again later.',
    ]);
}
