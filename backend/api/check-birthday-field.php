<?php
require_once __DIR__ . '/config/database.php';

$database = new Database();
$db = $database->getConnection();

try {
    // Check all Birthday questions
    $stmt = $db->prepare("
        SELECT id, survey_id, question_text, question_type, section
        FROM survey_questions 
        WHERE question_text LIKE '%Birthday%'
    ");
    
    $stmt->execute();
    $questions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode([
        "success" => true, 
        "data" => $questions,
        "count" => count($questions)
    ], JSON_PRETTY_PRINT);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false, 
        "error" => $e->getMessage()
    ]);
}
