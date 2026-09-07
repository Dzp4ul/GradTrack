<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/system_settings.php';
require_once __DIR__ . '/../config/archive.php';

$database = new Database();
$conn = $database->getConnection();
gradtrack_ensure_archive_schema($conn, 'surveys', true);
gradtrack_ensure_archive_schema($conn, 'graduates');
gradtrack_system_require_feature_enabled($conn, 'graduate_survey', 'Graduate Tracer Survey');

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
        $query = "SELECT st.*, (st.expires_at < NOW()) AS is_expired,
              g.first_name, g.middle_name, g.last_name, g.student_id,
              g.email, g.phone, g.year_graduated, g.address, g.program_id,
              p.name AS program_name, p.code AS program_code,
              s.title as survey_title, s.status as survey_status
                  FROM survey_tokens st
                  JOIN graduates g ON st.graduate_id = g.id
              LEFT JOIN programs p ON g.program_id = p.id
                  JOIN surveys s ON st.survey_id = s.id
                  WHERE st.token = :token
                    AND g.archived_at IS NULL
                    AND s.archived_at IS NULL";
        
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

        if ((int) ($tokenData['is_expired'] ?? 0) === 1) {
            http_response_code(410);
            echo json_encode([
                'success' => false,
                'error' => 'Survey token expired',
                'message' => 'This survey link has expired. Please verify your graduate record again.',
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

        // Block legacy duplicates where a response exists but token row was never marked submitted.
        $responseCheckQuery = "SELECT id FROM survey_responses
                              WHERE survey_id = :survey_id
                              AND graduate_id = :graduate_id
                              LIMIT 1";
        $responseCheckStmt = $conn->prepare($responseCheckQuery);
        $responseCheckStmt->bindParam(':survey_id', $tokenData['survey_id']);
        $responseCheckStmt->bindParam(':graduate_id', $tokenData['graduate_id']);
        $responseCheckStmt->execute();

        if ($responseCheckStmt->fetch()) {
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
                "expires_at" => $tokenData['expires_at'],
                "profile" => [
                    "student_id" => $tokenData['student_id'],
                    "first_name" => $tokenData['first_name'],
                    "middle_name" => $tokenData['middle_name'],
                    "last_name" => $tokenData['last_name'],
                    "email" => $tokenData['email'],
                    "phone" => $tokenData['phone'],
                    "year_graduated" => $tokenData['year_graduated'],
                    "address" => $tokenData['address'],
                    "program_id" => $tokenData['program_id'],
                    "program_name" => $tokenData['program_name'],
                    "program_code" => $tokenData['program_code']
                ]
            ]
        ]);
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode([
            "success" => false,
            "error" => gradtrack_public_exception_message($e, 'Unable to validate the survey link right now.', 'Survey token validation API')
        ]);
    }
}
?>
