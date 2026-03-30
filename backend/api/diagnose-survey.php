<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

require_once '../config/database.php';

$database = new Database();
$conn = $database->getConnection();

try {
    // Check if survey_responses table exists
    $stmt = $conn->query("SHOW TABLES LIKE 'survey_responses'");
    $tableExists = $stmt->rowCount() > 0;
    
    if (!$tableExists) {
        echo json_encode([
            "success" => false,
            "error" => "survey_responses table does not exist",
            "fix" => "Please create the table first"
        ]);
        exit;
    }
    
    // Check table structure
    $stmt = $conn->query("DESCRIBE survey_responses");
    $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $graduateIdColumn = null;
    foreach ($columns as $col) {
        if ($col['Field'] === 'graduate_id') {
            $graduateIdColumn = $col;
            break;
        }
    }
    
    $issues = [];
    $fixes = [];
    
    if (!$graduateIdColumn) {
        $issues[] = "graduate_id column is missing";
        $fixes[] = "ALTER TABLE survey_responses ADD COLUMN graduate_id INT NULL";
    } else {
        if (strpos($graduateIdColumn['Null'], 'NO') !== false) {
            $issues[] = "graduate_id column does NOT allow NULL values";
            $fixes[] = "ALTER TABLE survey_responses MODIFY COLUMN graduate_id INT NULL";
        }
    }
    
    // Check if surveys table has data
    $stmt = $conn->query("SELECT COUNT(*) as count FROM surveys WHERE status = 'active'");
    $activeSurveys = $stmt->fetch(PDO::FETCH_ASSOC)['count'];
    
    if ($activeSurveys == 0) {
        $issues[] = "No active surveys found";
        $fixes[] = "Create a survey and set its status to 'active'";
    }
    
    // Test insert
    if (empty($issues)) {
        try {
            $testData = json_encode(["test" => "data"]);
            $stmt = $conn->prepare("INSERT INTO survey_responses (survey_id, graduate_id, responses, submitted_at) VALUES (1, NULL, :responses, NOW())");
            $stmt->bindParam(':responses', $testData);
            $stmt->execute();
            $testId = $conn->lastInsertId();
            
            // Delete test record
            $conn->exec("DELETE FROM survey_responses WHERE id = $testId");
            
            $issues[] = "✅ Test insert successful!";
        } catch (PDOException $e) {
            $issues[] = "Test insert failed: " . $e->getMessage();
            $fixes[] = "Check the error message above";
        }
    }
    
    echo json_encode([
        "success" => empty($fixes),
        "table_exists" => $tableExists,
        "active_surveys" => $activeSurveys,
        "graduate_id_column" => $graduateIdColumn,
        "issues" => $issues,
        "fixes" => $fixes,
        "table_structure" => $columns
    ], JSON_PRETTY_PRINT);
    
} catch (Exception $e) {
    echo json_encode([
        "success" => false,
        "error" => $e->getMessage()
    ]);
}
?>
