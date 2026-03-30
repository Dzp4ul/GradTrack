<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

require_once __DIR__ . '/config/database.php';

try {
    $database = new Database();
    $conn = $database->getConnection();
    
    // Test query
    $stmt = $conn->query("SELECT COUNT(*) as count FROM graduates");
    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    
    $stmt2 = $conn->query("SELECT COUNT(*) as count FROM survey_responses");
    $result2 = $stmt2->fetch(PDO::FETCH_ASSOC);
    
    $stmt3 = $conn->query("SELECT COUNT(*) as count FROM admin_users");
    $result3 = $stmt3->fetch(PDO::FETCH_ASSOC);
    
    echo json_encode([
        "status" => "success",
        "message" => "Database connected successfully",
        "database" => [
            "host" => getenv('DB_HOST'),
            "name" => getenv('DB_NAME'),
            "graduates_count" => $result['count'],
            "survey_responses_count" => $result2['count'],
            "admin_users_count" => $result3['count']
        ]
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "status" => "error",
        "message" => "Database connection failed",
        "error" => $e->getMessage()
    ]);
}
