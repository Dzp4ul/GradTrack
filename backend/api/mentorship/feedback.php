<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'GET') {
        $mentorId = isset($_GET['mentor_id']) ? (int) $_GET['mentor_id'] : 0;
        if ($mentorId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'mentor_id is required']);
            exit;
        }

        $query = "SELECT mf.id, mf.rating, mf.feedback_text, mf.created_at,
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
        }

        echo json_encode(['success' => true, 'data' => $rows]);
        exit;
    }

    if ($method === 'POST') {
        $user = gradtrack_require_graduate_auth($db);
        $data = json_decode(file_get_contents('php://input'), true);

        $requestId = isset($data['mentorship_request_id']) ? (int) $data['mentorship_request_id'] : 0;
        $rating = isset($data['rating']) ? (int) $data['rating'] : 0;
        $feedbackText = isset($data['feedback_text']) ? trim((string) $data['feedback_text']) : null;

        if ($requestId <= 0 || $rating < 1 || $rating > 5) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Valid mentorship_request_id and rating are required']);
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

        $feedbackStmt = $db->prepare("INSERT INTO mentorship_feedback (mentorship_request_id, mentee_account_id, rating, feedback_text)
                                      VALUES (:request_id, :mentee_account_id, :rating, :feedback_text)
                                      ON DUPLICATE KEY UPDATE rating = VALUES(rating), feedback_text = VALUES(feedback_text)");
        $feedbackStmt->bindParam(':request_id', $requestId);
        $feedbackStmt->bindParam(':mentee_account_id', $user['account_id']);
        $feedbackStmt->bindParam(':rating', $rating);
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
