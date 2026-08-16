<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

require_once '../config/database.php';
require_once '../config/system_settings.php';

function survey_verification_graduate_name(array $graduate): string
{
    return trim(($graduate['first_name'] ?? '') . ' ' . ($graduate['last_name'] ?? ''));
}

function survey_verification_graduate_profile(array $graduate): array
{
    return [
        "student_id" => $graduate['student_id'],
        "first_name" => $graduate['first_name'],
        "middle_name" => $graduate['middle_name'],
        "last_name" => $graduate['last_name'],
        "email" => $graduate['email'],
        "phone" => $graduate['phone'],
        "year_graduated" => $graduate['year_graduated'],
        "address" => $graduate['address'],
        "program_id" => $graduate['program_id'],
        "program_name" => $graduate['program_name'],
        "program_code" => $graduate['program_code']
    ];
}

function survey_verification_send_already_answered(
    PDO $conn,
    array $graduate,
    array $graduateProfile,
    ?array $surveyResponse
): void {
    $graduateId = (int) $graduate['id'];
    $surveyResponseId = $surveyResponse && isset($surveyResponse['id']) ? (int) $surveyResponse['id'] : null;

    $accountStmt = $conn->prepare("SELECT id FROM graduate_accounts WHERE graduate_id = :graduate_id LIMIT 1");
    $accountStmt->execute([':graduate_id' => $graduateId]);
    $existingAccount = $accountStmt->fetch(PDO::FETCH_ASSOC);
    $hasAccount = (bool) $existingAccount;
    $canCreateAccount = !$hasAccount && $surveyResponseId !== null && $surveyResponseId > 0;

    http_response_code(409);
    echo json_encode([
        "success" => false,
        "error" => "Survey already submitted",
        "message" => $hasAccount
            ? "You have already completed this survey and already have a Graduate Portal account"
            : "You have already completed this survey",
        "data" => [
            "already_answered" => true,
            "account_exists" => $hasAccount,
            "can_create_account" => $canCreateAccount,
            "graduate_id" => $graduateId,
            "graduate_name" => survey_verification_graduate_name($graduate),
            "program" => $graduate['program_name'],
            "survey_response_id" => $surveyResponseId,
            "profile" => $graduateProfile
        ]
    ]);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$database = new Database();
$conn = $database->getConnection();
gradtrack_system_require_feature_enabled($conn, 'graduate_survey', 'Graduate Tracer Survey');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    
    $verificationMethod = $data['verification_method'] ?? 'student_number';
    $studentNumber = trim($data['student_number'] ?? '');
    $email = strtolower(trim($data['email'] ?? ''));
    $lastName = trim($data['last_name'] ?? '');
    $program = trim($data['program'] ?? '');
    $surveyId = $data['survey_id'] ?? null;
    $verificationMethod = $verificationMethod === 'email' ? 'email' : 'student_number';
    $identifierLabel = $verificationMethod === 'email' ? 'email address' : 'student number';
    $identifierValue = $verificationMethod === 'email' ? $email : $studentNumber;
    
    // Validate required fields
    if (empty($identifierValue) || empty($lastName) || empty($program)) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error" => ucfirst($identifierLabel) . ", last name, and program are required"
        ]);
        exit();
    }

    if ($verificationMethod === 'email' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error" => "Invalid email address",
            "message" => "Please enter a valid email address"
        ]);
        exit();
    }
    
    try {
        // Step 1: Verify graduate exists in registrar database
        $identifierColumn = $verificationMethod === 'email' ? 'LOWER(g.email)' : 'g.student_id';
        $identifierParam = $verificationMethod === 'email' ? ':email' : ':student_number';
        $query = "SELECT g.*, p.name as program_name, p.code as program_code 
                  FROM graduates g
                  LEFT JOIN programs p ON g.program_id = p.id
                  WHERE {$identifierColumn} = {$identifierParam}
                  AND g.last_name LIKE :last_name";
        
        $stmt = $conn->prepare($query);
        $lastNamePattern = "%{$lastName}%";
        if ($verificationMethod === 'email') {
            $stmt->bindParam(':email', $email);
        } else {
            $stmt->bindParam(':student_number', $studentNumber);
        }
        $stmt->bindParam(':last_name', $lastNamePattern);
        $stmt->execute();
        
        $graduate = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$graduate) {
            http_response_code(404);
            echo json_encode([
                "success" => false,
                "error" => "Graduate not found in registrar records",
                "message" => "Please check your {$identifierLabel} and last name"
            ]);
            exit();
        }
        
        // Step 2: Verify program
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

        $graduateProfile = survey_verification_graduate_profile($graduate);
        
        // Step 3: Check if survey exists
        if ($surveyId) {
            $surveyQuery = "SELECT * FROM surveys WHERE id = :survey_id";
            $surveyStmt = $conn->prepare($surveyQuery);
            $surveyStmt->bindParam(':survey_id', $surveyId);
            $surveyStmt->execute();
            $survey = $surveyStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$survey) {
                http_response_code(404);
                echo json_encode([
                    "success" => false,
                    "error" => "Survey not found"
                ]);
                exit();
            }

            // Step 4: Block if a response already exists for this graduate/survey
            $responseCheckQuery = "SELECT id, graduate_account_id FROM survey_responses
                                  WHERE survey_id = :survey_id
                                  AND graduate_id = :graduate_id
                                  ORDER BY submitted_at DESC, id DESC
                                  LIMIT 1";
            $responseCheckStmt = $conn->prepare($responseCheckQuery);
            $responseCheckStmt->bindParam(':survey_id', $surveyId);
            $responseCheckStmt->bindParam(':graduate_id', $graduate['id']);
            $responseCheckStmt->execute();
            $existingSurveyResponse = $responseCheckStmt->fetch(PDO::FETCH_ASSOC);

            if ($existingSurveyResponse) {
                survey_verification_send_already_answered($conn, $graduate, $graduateProfile, $existingSurveyResponse);
            }
            
            // Step 5: Check if already submitted via token record
            $checkQuery = "SELECT * FROM survey_tokens 
                          WHERE survey_id = :survey_id 
                          AND graduate_id = :graduate_id 
                          AND submitted_at IS NOT NULL";
            $checkStmt = $conn->prepare($checkQuery);
            $checkStmt->bindParam(':survey_id', $surveyId);
            $checkStmt->bindParam(':graduate_id', $graduate['id']);
            $checkStmt->execute();
            
            if ($checkStmt->fetch()) {
                $submittedResponseStmt = $conn->prepare("SELECT id, graduate_account_id FROM survey_responses
                                                       WHERE survey_id = :survey_id
                                                       AND graduate_id = :graduate_id
                                                       ORDER BY submitted_at DESC, id DESC
                                                       LIMIT 1");
                $submittedResponseStmt->bindParam(':survey_id', $surveyId);
                $submittedResponseStmt->bindParam(':graduate_id', $graduate['id']);
                $submittedResponseStmt->execute();
                $submittedResponse = $submittedResponseStmt->fetch(PDO::FETCH_ASSOC) ?: null;

                survey_verification_send_already_answered($conn, $graduate, $graduateProfile, $submittedResponse);
            }

            if (($survey['status'] ?? '') !== 'active') {
                http_response_code(404);
                echo json_encode([
                    "success" => false,
                    "error" => "Survey not active",
                    "message" => "This survey is no longer active"
                ]);
                exit();
            }
            
            // Step 6: Generate or retrieve token
            $tokenQuery = "SELECT token, expires_at FROM survey_tokens 
                          WHERE survey_id = :survey_id 
                          AND graduate_id = :graduate_id 
                          AND submitted_at IS NULL";
            $tokenStmt = $conn->prepare($tokenQuery);
            $tokenStmt->bindParam(':survey_id', $surveyId);
            $tokenStmt->bindParam(':graduate_id', $graduate['id']);
            $tokenStmt->execute();
            $existingToken = $tokenStmt->fetch(PDO::FETCH_ASSOC);
            
            if ($existingToken) {
                // Reuse the unfinished survey token so graduates can resume later.
                $token = $existingToken['token'];
            } else {
                // Generate new token
                $token = bin2hex(random_bytes(32));
                $expiresAt = '9999-12-31 23:59:59';
                
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
            
            // Return success with token
            http_response_code(200);
            echo json_encode([
                "success" => true,
                "message" => "Verification successful",
                "data" => [
                    "token" => $token,
                    "graduate_id" => $graduate['id'],
                    "graduate_name" => survey_verification_graduate_name($graduate),
                    "program" => $graduate['program_name'],
                    "profile" => $graduateProfile
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
                    "graduate_name" => survey_verification_graduate_name($graduate),
                    "program" => $graduate['program_name'],
                    "profile" => $graduateProfile
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
