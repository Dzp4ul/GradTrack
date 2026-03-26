<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

require_once '../config/database.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$database = new Database();
$conn = $database->getConnection();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);

    try {
        $conn->beginTransaction();
        
        // Insert survey response
        $query = "INSERT INTO survey_responses (survey_id, graduate_id, responses, submitted_at)
                  VALUES (:survey_id, :graduate_id, :responses, NOW())";

        $stmt = $conn->prepare($query);
        $responsesJson = json_encode($data['responses']);

        $stmt->bindParam(':survey_id', $data['survey_id']);
        $stmt->bindParam(':graduate_id', $data['graduate_id'] ?? null);
        $stmt->bindParam(':responses', $responsesJson);

        $stmt->execute();
        $responseId = $conn->lastInsertId();
        
        // Extract employment data from survey and create/update graduate and employment records
        $responses = $data['responses'];
        $graduateId = $data['graduate_id'];
        
        // If no graduate_id, create a new graduate record from survey data
        if (!$graduateId && isset($responses['sectionA']) && isset($responses['sectionB'])) {
            $sectionA = $responses['sectionA'];
            $sectionB = $responses['sectionB'];
            
            // Parse name from new format
            $lastName = $sectionA['lastName'] ?? '';
            $firstName = $sectionA['firstName'] ?? '';
            $middleName = $sectionA['middleName'] ?? '';
            $nameExtension = $sectionA['nameExtension'] ?? '';
            
            // Build full address
            $fullAddress = implode(', ', array_filter([
                $sectionA['streetAddress'] ?? '',
                $sectionA['barangay'] ?? '',
                $sectionA['city'] ?? '',
                $sectionA['province'] ?? '',
                $sectionA['region'] ?? ''
            ]));
            
            // Find or create program
            $programId = null;
            if (!empty($sectionB['degreeProgram'])) {
                $programQuery = "SELECT id FROM programs WHERE name LIKE :program LIMIT 1";
                $programStmt = $conn->prepare($programQuery);
                $programSearch = '%' . $sectionB['degreeProgram'] . '%';
                $programStmt->bindParam(':program', $programSearch);
                $programStmt->execute();
                $programResult = $programStmt->fetch(PDO::FETCH_ASSOC);
                $programId = $programResult['id'] ?? null;
            }
            
            // Create graduate record
            $graduateQuery = "INSERT INTO graduates (first_name, last_name, email, phone, program_id, year_graduated, address, status)
                             VALUES (:first_name, :last_name, :email, :phone, :program_id, :year_graduated, :address, 'active')";
            $graduateStmt = $conn->prepare($graduateQuery);
            $graduateStmt->bindParam(':first_name', $firstName);
            $graduateStmt->bindParam(':last_name', $lastName);
            $graduateStmt->bindParam(':email', $sectionA['email']);
            $graduateStmt->bindParam(':phone', $sectionA['mobile']);
            $graduateStmt->bindParam(':program_id', $programId);
            $graduateStmt->bindParam(':year_graduated', $sectionB['yearGraduated']);
            $graduateStmt->bindParam(':address', $fullAddress);
            $graduateStmt->execute();
            $graduateId = $conn->lastInsertId();
            
            // Update survey response with graduate_id
            $updateQuery = "UPDATE survey_responses SET graduate_id = :graduate_id WHERE id = :id";
            $updateStmt = $conn->prepare($updateQuery);
            $updateStmt->bindParam(':graduate_id', $graduateId);
            $updateStmt->bindParam(':id', $responseId);
            $updateStmt->execute();
        }
        
        // Create/update employment record if graduate exists
        if ($graduateId && isset($responses['sectionD'])) {
            $sectionD = $responses['sectionD'];
            $employmentStatus = ($sectionD['presentlyEmployed'] ?? 'no') === 'yes' ? 'employed' : 'unemployed';
            
            // Check if employment record exists
            $checkQuery = "SELECT id FROM employment WHERE graduate_id = :graduate_id";
            $checkStmt = $conn->prepare($checkQuery);
            $checkStmt->bindParam(':graduate_id', $graduateId);
            $checkStmt->execute();
            $existingEmployment = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if ($existingEmployment) {
                // Update existing record
                $empQuery = "UPDATE employment SET employment_status = :status, updated_at = NOW() WHERE graduate_id = :graduate_id";
                $empStmt = $conn->prepare($empQuery);
                $empStmt->bindParam(':status', $employmentStatus);
                $empStmt->bindParam(':graduate_id', $graduateId);
                $empStmt->execute();
            } else {
                // Create new employment record
                $empQuery = "INSERT INTO employment (graduate_id, employment_status, is_aligned, time_to_employment)
                            VALUES (:graduate_id, :status, 'not_aligned', 0)";
                $empStmt = $conn->prepare($empQuery);
                $empStmt->bindParam(':graduate_id', $graduateId);
                $empStmt->bindParam(':status', $employmentStatus);
                $empStmt->execute();
            }
        }
        
        $conn->commit();

        http_response_code(201);
        echo json_encode([
            "success" => true,
            "message" => "Survey response saved successfully",
            "id" => $responseId
        ]);
    } catch(PDOException $e) {
        $conn->rollBack();
        http_response_code(500);
        echo json_encode(["error" => "Database error: " . $e->getMessage()]);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $surveyId = $_GET['survey_id'] ?? null;

        if ($surveyId) {
            $query = "SELECT sr.*, g.first_name, g.last_name FROM survey_responses sr
                      LEFT JOIN graduates g ON sr.graduate_id = g.id
                      WHERE sr.survey_id = :survey_id
                      ORDER BY sr.submitted_at DESC";
            $stmt = $conn->prepare($query);
            $stmt->bindParam(':survey_id', $surveyId);
        } else {
            $query = "SELECT sr.*, g.first_name, g.last_name FROM survey_responses sr
                      LEFT JOIN graduates g ON sr.graduate_id = g.id
                      ORDER BY sr.submitted_at DESC";
            $stmt = $conn->prepare($query);
        }

        $stmt->execute();
        $responses = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Parse JSON responses
        foreach ($responses as &$response) {
            if ($response['responses']) {
                $response['responses'] = json_decode($response['responses'], true);
            }
        }

        http_response_code(200);
        echo json_encode([
            "success" => true,
            "data" => $responses
        ]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(["error" => "Database error: " . $e->getMessage()]);
    }
}
?>
