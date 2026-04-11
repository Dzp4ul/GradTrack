<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            if (isset($_GET['id'])) {
                $stmt = $db->prepare("SELECT * FROM surveys WHERE id = :id");
                $stmt->bindParam(':id', $_GET['id']);
                $stmt->execute();
                $survey = $stmt->fetch(PDO::FETCH_ASSOC);

                if ($survey) {
                    // Get questions
                    $qStmt = $db->prepare("SELECT * FROM survey_questions WHERE survey_id = :id ORDER BY sort_order ASC");
                    $qStmt->bindParam(':id', $_GET['id']);
                    $qStmt->execute();
                    $survey['questions'] = $qStmt->fetchAll(PDO::FETCH_ASSOC);

                    // Get response count
                    $rStmt = $db->prepare("SELECT COUNT(*) as count FROM survey_responses WHERE survey_id = :id");
                    $rStmt->bindParam(':id', $_GET['id']);
                    $rStmt->execute();
                    $survey['response_count'] = (int)$rStmt->fetch(PDO::FETCH_ASSOC)['count'];

                    echo json_encode(["success" => true, "data" => $survey]);
                } else {
                    http_response_code(404);
                    echo json_encode(["success" => false, "error" => "Survey not found"]);
                }
            } else {
                $stmt = $db->query("
                    SELECT s.*, 
                        (SELECT COUNT(*) FROM survey_questions WHERE survey_id = s.id) as question_count,
                        (SELECT COUNT(*) FROM survey_responses WHERE survey_id = s.id) as response_count
                    FROM surveys s
                    ORDER BY s.created_at DESC
                ");
                $surveys = $stmt->fetchAll(PDO::FETCH_ASSOC);
                echo json_encode(["success" => true, "data" => $surveys]);
            }
            break;

        case 'POST':
            $data = json_decode(file_get_contents("php://input"), true);

            $activeStmt = $db->query("SELECT id, title FROM surveys WHERE status = 'active' ORDER BY created_at DESC, id DESC LIMIT 1");
            $activeSurvey = $activeStmt->fetch(PDO::FETCH_ASSOC);
            if ($activeSurvey) {
                http_response_code(409);
                echo json_encode([
                    "success" => false,
                    "error" => "An active survey already exists. Please set it to inactive before creating a new survey.",
                    "active_survey" => $activeSurvey
                ]);
                break;
            }

            $status = $data['status'] ?? 'draft';

            $db->beginTransaction();

            $stmt = $db->prepare("INSERT INTO surveys (title, description, status) VALUES (:title, :desc, :status)");
            $stmt->execute([
                ':title' => $data['title'],
                ':desc' => $data['description'] ?? '',
                ':status' => $status
            ]);
            $surveyId = $db->lastInsertId();

            if (isset($data['questions']) && is_array($data['questions'])) {
                $qStmt = $db->prepare("
                    INSERT INTO survey_questions (survey_id, section, question_text, question_type, options, is_required, sort_order)
                    VALUES (:survey_id, :section, :text, :type, :options, :required, :sort)
                ");
                foreach ($data['questions'] as $i => $q) {
                    $qStmt->execute([
                        ':survey_id' => $surveyId,
                        ':section' => $q['section'] ?? null,
                        ':text' => $q['question_text'],
                        ':type' => $q['question_type'] ?? 'text',
                        ':options' => isset($q['options']) ? json_encode($q['options']) : null,
                        ':required' => $q['is_required'] ?? 1,
                        ':sort' => $i + 1
                    ]);
                }
            }

            $db->commit();
            echo json_encode(["success" => true, "message" => "Survey created", "id" => $surveyId]);
            break;

        case 'PUT':
            $data = json_decode(file_get_contents("php://input"), true);
            if (!isset($data['id'])) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "ID is required"]);
                break;
            }

            $db->beginTransaction();

            $status = $data['status'] ?? 'draft';
            if ($status === 'active') {
                $activeStmt = $db->prepare("SELECT id, title FROM surveys WHERE status = 'active' AND id <> :id LIMIT 1");
                $activeStmt->execute([':id' => $data['id']]);
                $activeSurvey = $activeStmt->fetch(PDO::FETCH_ASSOC);
                if ($activeSurvey) {
                    $db->rollBack();
                    http_response_code(409);
                    echo json_encode([
                        "success" => false,
                        "error" => "Another active survey already exists. Please set it to inactive before activating this survey.",
                        "active_survey" => $activeSurvey
                    ]);
                    break;
                }
            }

            $stmt = $db->prepare("UPDATE surveys SET title = :title, description = :desc, status = :status WHERE id = :id");
            $stmt->execute([
                ':id' => $data['id'],
                ':title' => $data['title'],
                ':desc' => $data['description'] ?? '',
                ':status' => $status
            ]);

            if (isset($data['questions']) && is_array($data['questions'])) {
                $existingStmt = $db->prepare("SELECT id FROM survey_questions WHERE survey_id = :id");
                $existingStmt->execute([':id' => $data['id']]);
                $existingIds = [];
                foreach ($existingStmt->fetchAll(PDO::FETCH_ASSOC) as $existingQuestion) {
                    $existingIds[(int)$existingQuestion['id']] = true;
                }

                $updateQuestionStmt = $db->prepare("
                    UPDATE survey_questions
                    SET section = :section,
                        question_text = :text,
                        question_type = :type,
                        options = :options,
                        is_required = :required,
                        sort_order = :sort
                    WHERE id = :id AND survey_id = :survey_id
                ");

                $insertQuestionStmt = $db->prepare("
                    INSERT INTO survey_questions (survey_id, section, question_text, question_type, options, is_required, sort_order)
                    VALUES (:survey_id, :section, :text, :type, :options, :required, :sort)
                ");

                $keptIds = [];
                foreach ($data['questions'] as $i => $q) {
                    $questionId = isset($q['id']) ? (int)$q['id'] : 0;
                    $questionData = [
                        ':survey_id' => $data['id'],
                        ':section' => $q['section'] ?? null,
                        ':text' => $q['question_text'],
                        ':type' => $q['question_type'] ?? 'text',
                        ':options' => isset($q['options']) ? json_encode($q['options']) : null,
                        ':required' => $q['is_required'] ?? 1,
                        ':sort' => $i + 1
                    ];

                    if ($questionId > 0 && isset($existingIds[$questionId])) {
                        $updateQuestionStmt->execute($questionData + [':id' => $questionId]);
                        $keptIds[] = $questionId;
                    } else {
                        $insertQuestionStmt->execute($questionData);
                        $keptIds[] = (int)$db->lastInsertId();
                    }
                }

                $idsToDelete = array_values(array_diff(array_keys($existingIds), $keptIds));
                if (!empty($idsToDelete)) {
                    $placeholders = implode(',', array_fill(0, count($idsToDelete), '?'));
                    $deleteQuestionStmt = $db->prepare("DELETE FROM survey_questions WHERE survey_id = ? AND id IN ($placeholders)");
                    $deleteQuestionStmt->execute(array_merge([(int)$data['id']], $idsToDelete));
                }
            }

            $db->commit();
            echo json_encode(["success" => true, "message" => "Survey updated"]);
            break;

        case 'DELETE':
            $data = json_decode(file_get_contents("php://input"), true);
            if (!isset($data['id'])) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "ID is required"]);
                break;
            }
            $stmt = $db->prepare("DELETE FROM surveys WHERE id = :id");
            $stmt->execute([':id' => $data['id']]);
            echo json_encode(["success" => true, "message" => "Survey deleted"]);
            break;

        default:
            http_response_code(405);
            echo json_encode(["success" => false, "error" => "Method not allowed"]);
    }
} catch (Exception $e) {
    if ($db->inTransaction()) $db->rollBack();
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
