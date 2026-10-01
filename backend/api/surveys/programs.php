<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/survey_program_scope.php';

$database = new Database();
$conn = $database->getConnection();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $requestedSurveyId = $_GET['survey_id'] ?? null;
        if ($requestedSurveyId !== null) {
            if (filter_var($requestedSurveyId, FILTER_VALIDATE_INT) === false || (int) $requestedSurveyId <= 0) {
                http_response_code(400);
                echo json_encode([
                    'success' => false,
                    'code' => 'INVALID_SURVEY_ID',
                    'error' => 'A valid survey ID is required.',
                ]);
                exit;
            }

            $scope = gradtrack_get_survey_program_scope($conn, (int) $requestedSurveyId);
            if ($scope['survey'] === null) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'code' => 'SURVEY_NOT_FOUND',
                    'error' => 'Survey not found.',
                ]);
                exit;
            }
            if (($scope['survey']['status'] ?? '') !== 'active' || !empty($scope['survey']['archived_at'])) {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'code' => 'SURVEY_NOT_ACTIVE',
                    'error' => 'This Graduate Tracer Survey is not active or is no longer available.',
                ]);
                exit;
            }

            header('Cache-Control: no-store, max-age=0');
            http_response_code(200);
            echo json_encode([
                'success' => true,
                'survey_id' => (int) $scope['survey']['id'],
                'title' => (string) $scope['survey']['title'],
                'configured' => (bool) $scope['configured'],
                'departments' => $scope['departments'],
                // Preserve the endpoint's existing data array for current clients.
                'data' => $scope['departments'],
                'error' => $scope['error'],
            ]);
            exit;
        }

        // Other authenticated GradTrack screens use this endpoint as the
        // program master list. Survey verification always supplies survey_id
        // and therefore never receives this unscoped list.
        $query = "SELECT id, name, code, description FROM programs ORDER BY name ASC";
        $stmt = $conn->prepare($query);
        $stmt->execute();
        $programs = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        http_response_code(200);
        echo json_encode([
            "success" => true,
            "data" => $programs
        ]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode([
            "success" => false,
            "error" => gradtrack_public_exception_message($e, 'Unable to load programs right now.', 'Survey programs API')
        ]);
    }
}
?>
