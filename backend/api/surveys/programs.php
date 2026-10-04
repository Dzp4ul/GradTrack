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

        // Other GradTrack screens use this endpoint as the program master
        // list. Job-posting forms can request only programs represented by at
        // least one Registrar graduate record, without deleting unused master
        // programs that may be needed by future imports.
        $withGraduateRecords = filter_var(
            $_GET['with_graduate_records'] ?? false,
            FILTER_VALIDATE_BOOLEAN
        );
        $query = "SELECT p.id, p.name, p.code, p.description
                  FROM programs p";
        if ($withGraduateRecords) {
            $query .= " WHERE EXISTS (
                            SELECT 1
                            FROM graduates g
                            WHERE g.program_id = p.id
                        )";
        }
        $query .= " ORDER BY p.name ASC";
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
