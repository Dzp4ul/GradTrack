<?php
require_once __DIR__ . '/config/database.php';

$database = new Database();
$db = $database->getConnection();

try {
    // Alter the table to add 'date' to the ENUM
    $alterStmt = $db->exec("
        ALTER TABLE survey_questions 
        MODIFY COLUMN question_type ENUM('text', 'date', 'multiple_choice', 'rating', 'checkbox') 
        DEFAULT 'text'
    ");
    
    // Now update the Birthday question
    $updateStmt = $db->prepare("
        UPDATE survey_questions 
        SET question_type = 'date' 
        WHERE id = 384
    ");
    $updateStmt->execute();
    
    // Verify the update
    $checkStmt = $db->prepare("SELECT id, question_text, question_type FROM survey_questions WHERE id = 384");
    $checkStmt->execute();
    $result = $checkStmt->fetch(PDO::FETCH_ASSOC);
    
    echo json_encode([
        "success" => true,
        "message" => "Table altered and Birthday question updated to date type",
        "updated_question" => $result
    ], JSON_PRETTY_PRINT);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false, 
        "error" => $e->getMessage()
    ]);
}
