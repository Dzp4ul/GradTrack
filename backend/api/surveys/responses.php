<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

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
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        if (!isset($_SESSION['user_id'])) {
            http_response_code(401);
            echo json_encode(["success" => false, "error" => "Authentication required"]);
            exit();
        }

        $role = $_SESSION['role'] ?? '';
        $roleProgramScopes = [
            'dean_cs' => ['BSCS', 'ACT'],
            'dean_coed' => ['BSED', 'BEED'],
            'dean_hm' => ['BSHM'],
        ];

        if ($role !== 'admin' && !isset($roleProgramScopes[$role])) {
            http_response_code(403);
            echo json_encode(["success" => false, "error" => "Not authorized to view survey responses"]);
            exit();
        }

        $surveyId = isset($_GET['survey_id']) && (int) $_GET['survey_id'] > 0 ? (int) $_GET['survey_id'] : null;
        $graduateId = isset($_GET['graduate_id']) && (int) $_GET['graduate_id'] > 0 ? (int) $_GET['graduate_id'] : null;
        $whereParts = [];
        $params = [];

        if ($surveyId !== null) {
            $whereParts[] = 'sr.survey_id = :survey_id';
            $params[':survey_id'] = $surveyId;
        }

        if ($graduateId !== null) {
            $whereParts[] = 'sr.graduate_id = :graduate_id';
            $params[':graduate_id'] = $graduateId;
        }

        if (isset($roleProgramScopes[$role])) {
            $programPlaceholders = [];
            foreach ($roleProgramScopes[$role] as $index => $code) {
                $placeholder = ':program_code_' . $index;
                $programPlaceholders[] = $placeholder;
                $params[$placeholder] = $code;
            }
            $whereParts[] = 'p.code IN (' . implode(', ', $programPlaceholders) . ')';
        }

        $whereClause = count($whereParts) > 0 ? 'WHERE ' . implode(' AND ', $whereParts) : '';

        $query = "
            SELECT
                sr.*,
                g.student_id,
                g.first_name,
                g.middle_name,
                g.last_name,
                g.email,
                g.year_graduated,
                p.code AS program_code,
                p.name AS program_name,
                s.title AS survey_title
            FROM survey_responses sr
            LEFT JOIN graduates g ON g.id = sr.graduate_id
            LEFT JOIN programs p ON p.id = g.program_id
            LEFT JOIN surveys s ON s.id = sr.survey_id
            $whereClause
            ORDER BY sr.submitted_at DESC, sr.id DESC
        ";
        $stmt = $conn->prepare($query);
        $stmt->execute($params);
        $responses = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $questionCache = [];
        foreach ($responses as &$response) {
            $responseSurveyId = (int) $response['survey_id'];
            if (!isset($questionCache[$responseSurveyId])) {
                $questionStmt = $conn->prepare("
                    SELECT id, section, question_text, question_type, sort_order
                    FROM survey_questions
                    WHERE survey_id = :survey_id
                    ORDER BY sort_order ASC, id ASC
                ");
                $questionStmt->execute([':survey_id' => $responseSurveyId]);
                $questions = $questionStmt->fetchAll(PDO::FETCH_ASSOC);

                $questionsById = [];
                foreach ($questions as $question) {
                    $questionsById[(string) $question['id']] = $question;
                }

                $questionCache[$responseSurveyId] = [
                    'ordered' => $questions,
                    'by_id' => $questionsById,
                ];
            }

            $decodedResponses = [];
            if ($response['responses']) {
                $decoded = json_decode((string) $response['responses'], true);
                $decodedResponses = is_array($decoded) ? $decoded : [];
            }

            $answers = [];
            $orderedQuestions = $questionCache[$responseSurveyId]['ordered'];
            $questionsById = $questionCache[$responseSurveyId]['by_id'];
            $answerIndex = 0;
            $questionIdOffset = null;

            foreach (array_keys($decodedResponses) as $responseQuestionId) {
                $responseQuestionKey = (string) $responseQuestionId;
                if (isset($questionsById[$responseQuestionKey]) || !isset($orderedQuestions[0])) {
                    break;
                }

                if (is_numeric($responseQuestionKey) && is_numeric($orderedQuestions[0]['id'])) {
                    $questionIdOffset = (int) $orderedQuestions[0]['id'] - (int) $responseQuestionKey;
                }
                break;
            }

            foreach ($decodedResponses as $questionId => $answer) {
                $questionKey = (string) $questionId;
                $offsetQuestion = null;
                if ($questionIdOffset !== null && is_numeric($questionKey)) {
                    $offsetQuestionKey = (string) ((int) $questionKey + $questionIdOffset);
                    $offsetQuestion = $questionsById[$offsetQuestionKey] ?? null;
                }

                $question = $questionsById[$questionKey] ?? $offsetQuestion ?? ($orderedQuestions[$answerIndex] ?? null);
                $answers[] = [
                    'question_id' => $questionKey,
                    'question_text' => $question['question_text'] ?? ('Question ' . $questionKey),
                    'question_type' => $question['question_type'] ?? null,
                    'section' => $question['section'] ?? null,
                    'sort_order' => isset($question['sort_order']) ? (int) $question['sort_order'] : $answerIndex + 1,
                    'answer' => $answer,
                ];
                $answerIndex++;
            }

            $response['id'] = (int) $response['id'];
            $response['survey_id'] = (int) $response['survey_id'];
            $response['graduate_id'] = $response['graduate_id'] !== null ? (int) $response['graduate_id'] : null;
            $response['responses'] = $decodedResponses;
            $response['answers'] = $answers;
        }
        unset($response);

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
