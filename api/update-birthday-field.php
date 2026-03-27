<?php
require_once __DIR__ . '/config/database.php';

$database = new Database();
$db = $database->getConnection();

try {
    // Update all Birthday questions to use 'date' type
    $stmt = $db->prepare("
        UPDATE survey_questions 
        SET question_type = 'date' 
        WHERE question_text = 'Birthday' AND question_type = 'text'
    ");
    
    $stmt->execute();
    $rowCount = $stmt->rowCount();
    
    echo json_encode([
        "success" => true, 
        "message" => "Updated $rowCount Birthday question(s) to date type",
        "rows_affected" => $rowCount
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false, 
        "error" => $e->getMessage()
    ]);
}
