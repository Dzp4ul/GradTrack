<?php
require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();

try {
    // Get all questions that contain "Examination" in the text
    $stmt = $db->prepare("
        SELECT id, survey_id, question_text, question_type, options, sort_order
        FROM survey_questions 
        WHERE question_text LIKE '%Examination%'
        ORDER BY survey_id, sort_order
    ");
    
    $stmt->execute();
    $questions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "<h2>Questions containing 'Examination':</h2>";
    echo "<pre>";
    print_r($questions);
    echo "</pre>";
    
    // Also show all questions
    $stmt2 = $db->query("
        SELECT id, survey_id, question_text, question_type, options, sort_order
        FROM survey_questions 
        ORDER BY survey_id, sort_order
    ");
    
    $allQuestions = $stmt2->fetchAll(PDO::FETCH_ASSOC);
    
    echo "<h2>All Questions:</h2>";
    echo "<pre>";
    print_r($allQuestions);
    echo "</pre>";
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
