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
    
    $token = $data['token'] ?? null;
    $surveyId = $data['survey_id'] ?? null;
    $graduateId = $data['graduate_id'] ?? null;
    $responses = $data['responses'] ?? [];

    try {
        $conn->beginTransaction();
        
        // If token provided, validate it
        if ($token) {
            $tokenQuery = "SELECT * FROM survey_tokens 
                          WHERE token = :token 
                          AND survey_id = :survey_id
                          AND submitted_at IS NULL";
            $tokenStmt = $conn->prepare($tokenQuery);
            $tokenStmt->bindParam(':token', $token);
            $tokenStmt->bindParam(':survey_id', $surveyId);
            $tokenStmt->execute();
            $tokenData = $tokenStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$tokenData) {
                $conn->rollBack();
                http_response_code(403);
                echo json_encode([
                    "success" => false,
                    "error" => "Invalid or expired token"
                ]);
                exit();
            }
            
            // Check if token expired
            if (strtotime($tokenData['expires_at']) < time()) {
                $conn->rollBack();
                http_response_code(403);
                echo json_encode([
                    "success" => false,
                    "error" => "Token has expired"
                ]);
                exit();
            }
            
            // Use graduate_id from token
            $graduateId = $tokenData['graduate_id'];
            
            // Get client IP
            $ipAddress = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null;
        }
        
        // Check for duplicate submission
        if ($graduateId && $surveyId) {
            $dupQuery = "SELECT id FROM survey_responses 
                        WHERE survey_id = :survey_id 
                        AND graduate_id = :graduate_id";
            $dupStmt = $conn->prepare($dupQuery);
            $dupStmt->bindParam(':survey_id', $surveyId);
            $dupStmt->bindParam(':graduate_id', $graduateId);
            $dupStmt->execute();
            
            if ($dupStmt->fetch()) {
                $conn->rollBack();
                http_response_code(409);
                echo json_encode([
                    "success" => false,
                    "error" => "Survey already submitted"
                ]);
                exit();
            }
        }
        
        // Insert survey response
        $query = "INSERT INTO survey_responses (survey_id, graduate_id, responses, submitted_at)
                  VALUES (:survey_id, :graduate_id, :responses, NOW())";

        $stmt = $conn->prepare($query);
        $responsesJson = json_encode($responses);

        $stmt->bindParam(':survey_id', $surveyId);
        $stmt->bindParam(':graduate_id', $graduateId);
        $stmt->bindParam(':responses', $responsesJson);

        $stmt->execute();
        $responseId = $conn->lastInsertId();
        
        // Mark token as submitted if token was used
        if ($token && isset($tokenData)) {
            $updateTokenQuery = "UPDATE survey_tokens 
                                SET submitted_at = NOW(), ip_address = :ip_address 
                                WHERE token = :token";
            $updateTokenStmt = $conn->prepare($updateTokenQuery);
            $updateTokenStmt->bindParam(':ip_address', $ipAddress);
            $updateTokenStmt->bindParam(':token', $token);
            $updateTokenStmt->execute();
        }
        
        $conn->commit();

        http_response_code(201);
        echo json_encode([
            "success" => true,
            "message" => "Survey response saved successfully",
            "id" => $responseId,
            "survey_response_id" => $responseId
        ]);
    } catch(PDOException $e) {
        $conn->rollBack();
        http_response_code(500);
        echo json_encode([
            "success" => false,
            "error" => "Database error: " . $e->getMessage(),
            "hint" => "Please ensure graduate_id column allows NULL values"
        ]);
    } catch(Exception $e) {
        if (isset($conn) && $conn->inTransaction()) {
            $conn->rollBack();
        }
        http_response_code(500);
        echo json_encode([
            "success" => false,
            "error" => "Error: " . $e->getMessage()
        ]);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $surveyId = $_GET['survey_id'] ?? null;

        if ($surveyId) {
            $query = "SELECT sr.* FROM survey_responses sr
                      WHERE sr.survey_id = :survey_id
                      ORDER BY sr.submitted_at DESC";
            $stmt = $conn->prepare($query);
            $stmt->bindParam(':survey_id', $surveyId);
        } else {
            $query = "SELECT sr.* FROM survey_responses sr
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
