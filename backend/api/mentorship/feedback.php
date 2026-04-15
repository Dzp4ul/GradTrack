<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

function gradtrack_feedback_column_exists(PDO $db, string $table, string $column): bool
{
    $stmt = $db->prepare("SELECT COUNT(*) AS total
                          FROM INFORMATION_SCHEMA.COLUMNS
                          WHERE TABLE_SCHEMA = DATABASE()
                            AND TABLE_NAME = :table
                            AND COLUMN_NAME = :column");
    $stmt->execute([
        ':table' => $table,
        ':column' => $column,
    ]);
    return (int) ($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0) > 0;
}

function gradtrack_ensure_feedback_schema(PDO $db): void
{
    if (!gradtrack_feedback_column_exists($db, 'mentorship_feedback', 'mentor_helpful')) {
        $db->exec('ALTER TABLE mentorship_feedback ADD COLUMN mentor_helpful TINYINT(1) NULL AFTER rating');
    }

    $db->exec("CREATE TABLE IF NOT EXISTS mentorship_mentor_feedback (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mentorship_request_id INT NOT NULL UNIQUE,
        mentor_account_id INT NOT NULL,
        mentee_attended TINYINT(1) NULL,
        session_completed TINYINT(1) NULL,
        remarks TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_mentor_feedback_request_alt FOREIGN KEY (mentorship_request_id) REFERENCES mentorship_requests(id) ON DELETE CASCADE,
        CONSTRAINT fk_mentor_feedback_account_alt FOREIGN KEY (mentor_account_id) REFERENCES graduate_accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

try {
    gradtrack_ensure_feedback_schema($db);

    if ($method === 'GET') {
        $mentorId = isset($_GET['mentor_id']) ? (int) $_GET['mentor_id'] : 0;
        if ($mentorId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'mentor_id is required']);
            exit;
        }

        $query = "SELECT mf.id, mf.rating, mf.mentor_helpful, mf.feedback_text, mf.created_at,
                         g.first_name, g.last_name
                  FROM mentorship_feedback mf
                  JOIN mentorship_requests mr ON mf.mentorship_request_id = mr.id
                  JOIN graduate_accounts ga ON mf.mentee_account_id = ga.id
                  JOIN graduates g ON ga.graduate_id = g.id
                  WHERE mr.mentor_id = :mentor_id
                  ORDER BY mf.created_at DESC";

        $stmt = $db->prepare($query);
        $stmt->bindParam(':mentor_id', $mentorId);
        $stmt->execute();

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$row) {
            $row['id'] = (int) $row['id'];
            $row['rating'] = (int) $row['rating'];
            $row['mentor_helpful'] = $row['mentor_helpful'] !== null ? (bool) $row['mentor_helpful'] : null;
        }

        echo json_encode(['success' => true, 'data' => $rows]);
        exit;
    }

    if ($method === 'POST') {
        $user = gradtrack_require_graduate_auth($db);
        $data = json_decode(file_get_contents('php://input'), true);
        $feedbackRole = isset($data['feedback_role']) ? trim((string) $data['feedback_role']) : 'mentee';

        $requestId = isset($data['mentorship_request_id']) ? (int) $data['mentorship_request_id'] : 0;

        if ($requestId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Valid mentorship_request_id is required']);
            exit;
        }

        if ($feedbackRole === 'mentor') {
            $menteeAttended = isset($data['mentee_attended']) ? (int) !!$data['mentee_attended'] : null;
            $sessionCompleted = isset($data['session_completed']) ? (int) !!$data['session_completed'] : null;
            $remarks = isset($data['remarks']) ? trim((string) $data['remarks']) : null;

            $requestStmt = $db->prepare("SELECT mr.status, m.graduate_account_id AS mentor_account_id
                                         FROM mentorship_requests mr
                                         JOIN mentors m ON mr.mentor_id = m.id
                                         WHERE mr.id = :id");
            $requestStmt->bindParam(':id', $requestId);
            $requestStmt->execute();
            $request = $requestStmt->fetch(PDO::FETCH_ASSOC);

            if (!$request) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Mentorship request not found']);
                exit;
            }

            if ((int) $request['mentor_account_id'] !== $user['account_id']) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'Only the mentor can submit mentor feedback']);
                exit;
            }

            if (!in_array($request['status'], ['accepted', 'completed'], true)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Mentor feedback can only be submitted after acceptance']);
                exit;
            }

            $feedbackStmt = $db->prepare("INSERT INTO mentorship_mentor_feedback
                                          (mentorship_request_id, mentor_account_id, mentee_attended, session_completed, remarks)
                                          VALUES (:request_id, :mentor_account_id, :mentee_attended, :session_completed, :remarks)
                                          ON DUPLICATE KEY UPDATE
                                            mentee_attended = VALUES(mentee_attended),
                                            session_completed = VALUES(session_completed),
                                            remarks = VALUES(remarks)");
            $feedbackStmt->bindParam(':request_id', $requestId);
            $feedbackStmt->bindParam(':mentor_account_id', $user['account_id']);
            $feedbackStmt->bindValue(':mentee_attended', $menteeAttended);
            $feedbackStmt->bindValue(':session_completed', $sessionCompleted);
            $feedbackStmt->bindParam(':remarks', $remarks);
            $feedbackStmt->execute();

            if ($sessionCompleted === 1) {
                $completeStmt = $db->prepare("UPDATE mentorship_requests
                                              SET status = 'completed', completed_at = COALESCE(completed_at, NOW())
                                              WHERE id = :id");
                $completeStmt->bindParam(':id', $requestId);
                $completeStmt->execute();
            }

            echo json_encode(['success' => true, 'message' => 'Mentor feedback submitted successfully']);
            exit;
        }

        $rating = isset($data['rating']) ? (int) $data['rating'] : 0;
        $mentorHelpful = isset($data['mentor_helpful']) ? (int) !!$data['mentor_helpful'] : null;
        $feedbackText = isset($data['feedback_text']) ? trim((string) $data['feedback_text']) : null;

        if ($rating < 1 || $rating > 5) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Rating must be from 1 to 5']);
            exit;
        }

        $requestStmt = $db->prepare('SELECT mentee_account_id, status FROM mentorship_requests WHERE id = :id');
        $requestStmt->bindParam(':id', $requestId);
        $requestStmt->execute();
        $request = $requestStmt->fetch(PDO::FETCH_ASSOC);

        if (!$request) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Mentorship request not found']);
            exit;
        }

        if ((int) $request['mentee_account_id'] !== $user['account_id']) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only the mentee can submit feedback']);
            exit;
        }

        if (!in_array($request['status'], ['accepted', 'completed'], true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Feedback can only be submitted after acceptance']);
            exit;
        }

        $feedbackStmt = $db->prepare("INSERT INTO mentorship_feedback (mentorship_request_id, mentee_account_id, rating, mentor_helpful, feedback_text)
                                      VALUES (:request_id, :mentee_account_id, :rating, :mentor_helpful, :feedback_text)
                                      ON DUPLICATE KEY UPDATE
                                        rating = VALUES(rating),
                                        mentor_helpful = VALUES(mentor_helpful),
                                        feedback_text = VALUES(feedback_text)");
        $feedbackStmt->bindParam(':request_id', $requestId);
        $feedbackStmt->bindParam(':mentee_account_id', $user['account_id']);
        $feedbackStmt->bindParam(':rating', $rating);
        $feedbackStmt->bindValue(':mentor_helpful', $mentorHelpful);
        $feedbackStmt->bindParam(':feedback_text', $feedbackText);
        $feedbackStmt->execute();

        $completeStmt = $db->prepare("UPDATE mentorship_requests
                                      SET status = 'completed', completed_at = COALESCE(completed_at, NOW())
                                      WHERE id = :id");
        $completeStmt->bindParam(':id', $requestId);
        $completeStmt->execute();

        echo json_encode(['success' => true, 'message' => 'Feedback submitted successfully']);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
