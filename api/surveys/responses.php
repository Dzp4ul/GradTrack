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
        $stmt->bindParam(':graduate_id', $data['graduate_id']);
        $stmt->bindParam(':responses', $responsesJson);

        $stmt->execute();
        $responseId = $conn->lastInsertId();
        
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
