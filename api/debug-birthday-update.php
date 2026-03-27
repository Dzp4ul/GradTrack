<?php
require_once __DIR__ . '/config/database.php';

$database = new Database();
$db = $database->getConnection();

try {
    // First, check the table structure
    $structStmt = $db->query("DESCRIBE survey_questions");
    $structure = $structStmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Try updating with explicit value
    $updateStmt = $db->prepare("
        UPDATE survey_questions 
        SET question_type = :type
        WHERE id = :id
    ");
    
    $updateStmt->execute([
        ':type' => 'date',
        ':id' => 384
    ]);
    
    $rowCount = $updateStmt->rowCount();
    
    // Verify the update
    $checkStmt = $db->prepare("SELECT id, question_text, question_type FROM survey_questions WHERE id = 384");
    $checkStmt->execute();
    $result = $checkStmt->fetch(PDO::FETCH_ASSOC);
    
    echo json_encode([
        "success" => true,
        "table_structure" => $structure,
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
