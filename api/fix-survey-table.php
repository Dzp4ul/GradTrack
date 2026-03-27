<?php
require_once 'config/database.php';

$database = new Database();
$conn = $database->getConnection();

try {
    // Fix graduate_id to allow NULL
    $conn->exec("ALTER TABLE survey_responses MODIFY COLUMN graduate_id INT NULL");
    
    echo json_encode([
        "success" => true,
        "message" => "Survey responses table fixed successfully! graduate_id now allows NULL values."
    ]);
} catch (PDOException $e) {
    echo json_encode([
        "success" => false,
        "error" => $e->getMessage()
    ]);
}
?>
