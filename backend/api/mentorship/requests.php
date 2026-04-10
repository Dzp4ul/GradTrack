<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/alumni_rating.php';

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    $user = gradtrack_require_graduate_auth($db);

    if ($method === 'GET') {
        $type = isset($_GET['type']) ? trim((string) $_GET['type']) : 'outgoing';

        if ($type === 'incoming') {
            $query = "SELECT mr.*, m.id AS mentor_id,
                             ga.email AS mentee_email,
                             g.first_name AS mentee_first_name,
                             g.last_name AS mentee_last_name
                      FROM mentorship_requests mr
                      JOIN mentors m ON mr.mentor_id = m.id
                      JOIN graduate_accounts ga ON mr.mentee_account_id = ga.id
                      JOIN graduates g ON ga.graduate_id = g.id
                      WHERE m.graduate_account_id = :account_id
                      ORDER BY mr.requested_at DESC";
            $stmt = $db->prepare($query);
            $stmt->bindParam(':account_id', $user['account_id']);
            $stmt->execute();
        } else {
            $query = "SELECT mr.*, m.id AS mentor_id,
                             mg.first_name AS mentor_first_name,
                             mg.last_name AS mentor_last_name,
                             m.current_job_title, m.company, m.industry
                      FROM mentorship_requests mr
                      JOIN mentors m ON mr.mentor_id = m.id
                      JOIN graduates mg ON m.graduate_id = mg.id
                      WHERE mr.mentee_account_id = :account_id
                      ORDER BY mr.requested_at DESC";
            $stmt = $db->prepare($query);
            $stmt->bindParam(':account_id', $user['account_id']);
            $stmt->execute();
        }

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$row) {
            $row['id'] = (int) $row['id'];
            $row['mentor_id'] = (int) $row['mentor_id'];
            $row['mentee_account_id'] = (int) $row['mentee_account_id'];
        }

        echo json_encode(['success' => true, 'data' => $rows]);
        exit;
    }

    if ($method === 'POST') {
        gradtrack_require_feature_access($db, $user, 'mentorship_request');
        $data = json_decode(file_get_contents('php://input'), true);
        $mentorId = isset($data['mentor_id']) ? (int) $data['mentor_id'] : 0;
        $requestMessage = isset($data['request_message']) ? trim((string) $data['request_message']) : null;

        if ($mentorId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'mentor_id is required']);
            exit;
        }

        $mentorOwnerStmt = $db->prepare('SELECT graduate_account_id FROM mentors WHERE id = :id AND is_active = 1');
        $mentorOwnerStmt->bindParam(':id', $mentorId);
        $mentorOwnerStmt->execute();
        $mentor = $mentorOwnerStmt->fetch(PDO::FETCH_ASSOC);

        if (!$mentor) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Mentor not found or inactive']);
            exit;
        }

        if ((int) $mentor['graduate_account_id'] === $user['account_id']) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'You cannot send a request to yourself']);
            exit;
        }

        $dupStmt = $db->prepare("SELECT id FROM mentorship_requests
                                 WHERE mentor_id = :mentor_id
                                   AND mentee_account_id = :mentee_account_id
                                   AND status = 'pending'");
        $dupStmt->bindParam(':mentor_id', $mentorId);
        $dupStmt->bindParam(':mentee_account_id', $user['account_id']);
        $dupStmt->execute();

        if ($dupStmt->fetch(PDO::FETCH_ASSOC)) {
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => 'You already have a pending request for this mentor']);
            exit;
        }

        $insertStmt = $db->prepare("INSERT INTO mentorship_requests (mentor_id, mentee_account_id, request_message)
                                    VALUES (:mentor_id, :mentee_account_id, :request_message)");
        $insertStmt->bindParam(':mentor_id', $mentorId);
        $insertStmt->bindParam(':mentee_account_id', $user['account_id']);
        $insertStmt->bindParam(':request_message', $requestMessage);
        $insertStmt->execute();

        echo json_encode([
            'success' => true,
            'message' => 'Mentorship request sent',
            'request_id' => (int) $db->lastInsertId()
        ]);
        exit;
    }

    if ($method === 'PUT') {
        $data = json_decode(file_get_contents('php://input'), true);
        $requestId = isset($data['id']) ? (int) $data['id'] : 0;
        $status = isset($data['status']) ? trim((string) $data['status']) : '';

        if ($requestId <= 0 || $status === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'id and status are required']);
            exit;
        }

        $requestStmt = $db->prepare("SELECT mr.*, m.graduate_account_id AS mentor_account_id
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

        if (in_array($status, ['accepted', 'declined'], true)) {
            if ((int) $request['mentor_account_id'] !== $user['account_id']) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'Only the mentor can respond to this request']);
                exit;
            }

            $updateStmt = $db->prepare('UPDATE mentorship_requests SET status = :status, responded_at = NOW() WHERE id = :id');
            $updateStmt->bindParam(':status', $status);
            $updateStmt->bindParam(':id', $requestId);
            $updateStmt->execute();
        } elseif ($status === 'completed') {
            $isParticipant = (int) $request['mentor_account_id'] === $user['account_id']
                || (int) $request['mentee_account_id'] === $user['account_id'];

            if (!$isParticipant) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'Only participants can complete this mentorship']);
                exit;
            }

            $updateStmt = $db->prepare("UPDATE mentorship_requests
                                        SET status = 'completed', completed_at = NOW()
                                        WHERE id = :id");
            $updateStmt->bindParam(':id', $requestId);
            $updateStmt->execute();
        } else {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid status transition']);
            exit;
        }

        echo json_encode(['success' => true, 'message' => 'Mentorship request updated']);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
