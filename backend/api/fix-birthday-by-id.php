<?php
require_once __DIR__ . '/config/database.php';

$database = new Database();
$db = $database->getConnection();

try {
    // Update the specific Birthday question (id = 384)
    $stmt = $db->prepare("
        UPDATE survey_questions 
        SET question_type = 'date' 
        WHERE id = 384
    ");
    
    $stmt->execute();
    $rowCount = $stmt->rowCount();
    
    // Verify the update
    $checkStmt = $db->prepare("SELECT id, question_text, question_type FROM survey_questions WHERE id = 384");
    $checkStmt->execute();
    $result = $checkStmt->fetch(PDO::FETCH_ASSOC);
    
    echo json_encode([
        "success" => true, 
        "message" => "Updated Birthday question to date type",
        "rows_affected" => $rowCount,
        "updated_question" => $result
    ], JSON_PRETTY_PRINT);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false, 
        "error" => $e->getMessage()
    ]);
}
