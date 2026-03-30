<?php
require_once __DIR__ . '/config/database.php';

try {
    $database = new Database();
    $db = $database->getConnection();
    
    echo "Updating survey_questions table to support 'radio' question type...\n";
    
    $sql = "ALTER TABLE survey_questions 
            MODIFY COLUMN question_type ENUM('text', 'date', 'multiple_choice', 'radio', 'rating', 'checkbox') 
            DEFAULT 'text'";
    
    $db->exec($sql);
    
    echo "✓ Successfully added 'radio' to question_type ENUM\n";
    echo "You can now use radio button question types in your surveys!\n";
    
} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
}
