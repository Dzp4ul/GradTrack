<?php
require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();

try {
    // Update the "Name of Examination" question to radio type with options
    $stmt = $db->prepare("
        UPDATE survey_questions 
        SET question_type = 'radio',
            options = :options
        WHERE question_text = 'Name of Examination'
    ");
    
    $options = json_encode(['Licensure Examination for Teachers', 'Civil Service Examination']);
    $stmt->bindParam(':options', $options);
    $stmt->execute();
    
    $rowCount = $stmt->rowCount();
    
    if ($rowCount > 0) {
        echo json_encode([
            "success" => true, 
            "message" => "Updated $rowCount question(s) successfully",
            "updated_to" => "radio",
            "options" => json_decode($options)
        ]);
    } else {
        echo json_encode([
            "success" => false, 
            "message" => "No questions found with text 'Name of Examination'"
        ]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false, 
        "error" => $e->getMessage()
    ]);
}
