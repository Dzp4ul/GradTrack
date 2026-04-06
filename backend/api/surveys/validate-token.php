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
    
    $token = $data['token'] ?? '';
    
    if (empty($token)) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error" => "Token is required"
        ]);
        exit();
    }
    
    try {
        // Validate token
        $query = "SELECT st.*, g.first_name, g.last_name, g.student_id, 
                  s.title as survey_title, s.status as survey_status
                  FROM survey_tokens st
                  JOIN graduates g ON st.graduate_id = g.id
                  JOIN surveys s ON st.survey_id = s.id
                  WHERE st.token = :token";
        
        $stmt = $conn->prepare($query);
        $stmt->bindParam(':token', $token);
        $stmt->execute();
        
        $tokenData = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$tokenData) {
            http_response_code(404);
            echo json_encode([
                "success" => false,
                "error" => "Invalid token",
                "message" => "This survey link is invalid"
            ]);
            exit();
        }
        
        // Check if token expired
        if (strtotime($tokenData['expires_at']) < time()) {
            http_response_code(403);
            echo json_encode([
                "success" => false,
                "error" => "Token expired",
                "message" => "This survey link has expired. Please verify your identity again."
            ]);
            exit();
        }
        
        // Check if already submitted
        if ($tokenData['submitted_at'] !== null) {
            http_response_code(409);
            echo json_encode([
                "success" => false,
                "error" => "Survey already submitted",
                "message" => "You have already completed this survey"
            ]);
            exit();
        }
        
        // Check if survey is still active
        if ($tokenData['survey_status'] !== 'active') {
            http_response_code(403);
            echo json_encode([
                "success" => false,
                "error" => "Survey inactive",
                "message" => "This survey is no longer active"
            ]);
            exit();
        }
        
        // Token is valid
        http_response_code(200);
        echo json_encode([
            "success" => true,
            "message" => "Token is valid",
            "data" => [
                "survey_id" => $tokenData['survey_id'],
                "graduate_id" => $tokenData['graduate_id'],
                "graduate_name" => $tokenData['first_name'] . ' ' . $tokenData['last_name'],
                "student_id" => $tokenData['student_id'],
                "survey_title" => $tokenData['survey_title'],
                "expires_at" => $tokenData['expires_at']
            ]
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode([
            "success" => false,
            "error" => "Database error: " . $e->getMessage()
        ]);
    }
}
?>
