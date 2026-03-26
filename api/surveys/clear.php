<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $db->beginTransaction();
        
        // Delete all survey responses
        $db->exec("DELETE FROM survey_responses");
        
        // Delete all survey questions
        $db->exec("DELETE FROM survey_questions");
        
        // Delete all surveys
        $db->exec("DELETE FROM surveys");
        
        // Reset auto increment
        $db->exec("ALTER TABLE surveys AUTO_INCREMENT = 1");
        $db->exec("ALTER TABLE survey_questions AUTO_INCREMENT = 1");
        $db->exec("ALTER TABLE survey_responses AUTO_INCREMENT = 1");
        
        $db->commit();
        
        echo json_encode([
            "success" => true,
            "message" => "All survey data cleared successfully"
        ]);
    } catch (Exception $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode([
            "success" => false,
            "error" => $e->getMessage()
        ]);
    }
} else {
    http_response_code(405);
    echo json_encode([
        "success" => false,
        "error" => "Method not allowed"
    ]);
}
