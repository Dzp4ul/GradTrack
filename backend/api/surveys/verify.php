<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
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
    
    $studentNumber = $data['student_number'] ?? '';
    $lastName = $data['last_name'] ?? '';
    $program = $data['program'] ?? '';
    $surveyId = $data['survey_id'] ?? null;
    
    // Validate required fields
    if (empty($studentNumber) || empty($lastName)) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error" => "Student number and last name are required"
        ]);
        exit();
    }
    
    try {
        // Step 1: Verify graduate exists in registrar database
        $query = "SELECT g.*, p.name as program_name, p.code as program_code 
                  FROM graduates g
                  LEFT JOIN programs p ON g.program_id = p.id
                  WHERE g.student_id = :student_number 
                  AND g.last_name LIKE :last_name";
        
        $stmt = $conn->prepare($query);
        $lastNamePattern = "%{$lastName}%";
        $stmt->bindParam(':student_number', $studentNumber);
        $stmt->bindParam(':last_name', $lastNamePattern);
        $stmt->execute();
        
        $graduate = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$graduate) {
            http_response_code(404);
            echo json_encode([
                "success" => false,
                "error" => "Graduate not found in registrar records",
                "message" => "Please check your student number and last name"
            ]);
            exit();
        }
        
        // Step 2: Verify program if provided
        if (!empty($program)) {
            $programMatch = (
                stripos($graduate['program_name'], $program) !== false ||
                stripos($graduate['program_code'], $program) !== false ||
                $graduate['program_id'] == $program
            );
            
            if (!$programMatch) {
                http_response_code(403);
                echo json_encode([
                    "success" => false,
                    "error" => "Program does not match registrar records",
                    "message" => "The program you selected does not match your records"
                ]);
                exit();
            }
        }
        
        // Step 3: Check if survey exists and is active
        if ($surveyId) {
            $surveyQuery = "SELECT * FROM surveys WHERE id = :survey_id AND status = 'active'";
            $surveyStmt = $conn->prepare($surveyQuery);
            $surveyStmt->bindParam(':survey_id', $surveyId);
            $surveyStmt->execute();
            $survey = $surveyStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$survey) {
                http_response_code(404);
                echo json_encode([
                    "success" => false,
                    "error" => "Survey not found or inactive"
                ]);
                exit();
            }
            
            // Step 4: Check if already submitted
            $checkQuery = "SELECT * FROM survey_tokens 
                          WHERE survey_id = :survey_id 
                          AND graduate_id = :graduate_id 
                          AND submitted_at IS NOT NULL";
            $checkStmt = $conn->prepare($checkQuery);
            $checkStmt->bindParam(':survey_id', $surveyId);
            $checkStmt->bindParam(':graduate_id', $graduate['id']);
            $checkStmt->execute();
            
            if ($checkStmt->fetch()) {
                http_response_code(409);
                echo json_encode([
                    "success" => false,
                    "error" => "Survey already submitted",
                    "message" => "You have already completed this survey"
                ]);
                exit();
            }
            
            // Step 5: Generate or retrieve token
            $tokenQuery = "SELECT token, expires_at FROM survey_tokens 
                          WHERE survey_id = :survey_id 
                          AND graduate_id = :graduate_id 
                          AND submitted_at IS NULL";
            $tokenStmt = $conn->prepare($tokenQuery);
            $tokenStmt->bindParam(':survey_id', $surveyId);
            $tokenStmt->bindParam(':graduate_id', $graduate['id']);
            $tokenStmt->execute();
            $existingToken = $tokenStmt->fetch(PDO::FETCH_ASSOC);
            
            if ($existingToken && strtotime($existingToken['expires_at']) > time()) {
                // Use existing valid token
                $token = $existingToken['token'];
            } else {
                // Generate new token
                $token = bin2hex(random_bytes(32));
                $expiresAt = date('Y-m-d H:i:s', strtotime('+30 minutes'));
                
                if ($existingToken) {
                    // Update existing token
                    $updateQuery = "UPDATE survey_tokens 
                                   SET token = :token, expires_at = :expires_at 
                                   WHERE survey_id = :survey_id AND graduate_id = :graduate_id";
                    $updateStmt = $conn->prepare($updateQuery);
                    $updateStmt->bindParam(':token', $token);
                    $updateStmt->bindParam(':expires_at', $expiresAt);
                    $updateStmt->bindParam(':survey_id', $surveyId);
                    $updateStmt->bindParam(':graduate_id', $graduate['id']);
                    $updateStmt->execute();
                } else {
                    // Insert new token
                    $insertQuery = "INSERT INTO survey_tokens (survey_id, graduate_id, token, expires_at) 
                                   VALUES (:survey_id, :graduate_id, :token, :expires_at)";
                    $insertStmt = $conn->prepare($insertQuery);
                    $insertStmt->bindParam(':survey_id', $surveyId);
                    $insertStmt->bindParam(':graduate_id', $graduate['id']);
                    $insertStmt->bindParam(':token', $token);
                    $insertStmt->bindParam(':expires_at', $expiresAt);
                    $insertStmt->execute();
                }
            }
            
            // Return success with token
            http_response_code(200);
            echo json_encode([
                "success" => true,
                "message" => "Verification successful",
                "data" => [
                    "token" => $token,
                    "graduate_id" => $graduate['id'],
                    "graduate_name" => $graduate['first_name'] . ' ' . $graduate['last_name'],
                    "program" => $graduate['program_name']
                ]
            ]);
        } else {
            // No survey ID provided, just verify identity
            http_response_code(200);
            echo json_encode([
                "success" => true,
                "message" => "Graduate verified",
                "data" => [
                    "graduate_id" => $graduate['id'],
                    "graduate_name" => $graduate['first_name'] . ' ' . $graduate['last_name'],
                    "program" => $graduate['program_name']
                ]
            ]);
        }
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode([
            "success" => false,
            "error" => "Database error: " . $e->getMessage()
        ]);
    }
}
?>
