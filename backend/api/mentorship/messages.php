<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

function loadRequestContext(PDO $db, int $requestId): ?array
{
    $stmt = $db->prepare("SELECT mr.id, mr.mentee_account_id, m.graduate_account_id AS mentor_account_id
                         FROM mentorship_requests mr
                         JOIN mentors m ON mr.mentor_id = m.id
                         WHERE mr.id = :id");
    $stmt->bindParam(':id', $requestId);
    $stmt->execute();

    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

try {
    $user = gradtrack_require_graduate_auth($db);

    if ($method === 'GET') {
        $requestId = isset($_GET['request_id']) ? (int) $_GET['request_id'] : 0;
        if ($requestId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'request_id is required']);
            exit;
        }

        $context = loadRequestContext($db, $requestId);
        if (!$context) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Mentorship request not found']);
            exit;
        }

        $isParticipant = (int) $context['mentee_account_id'] === $user['account_id']
            || (int) $context['mentor_account_id'] === $user['account_id'];

        if (!$isParticipant) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Access denied']);
            exit;
        }

        $query = "SELECT mm.id, mm.mentorship_request_id, mm.sender_account_id, mm.message_text, mm.created_at,
                         g.first_name, g.last_name
                  FROM mentorship_messages mm
                  JOIN graduate_accounts ga ON mm.sender_account_id = ga.id
                  JOIN graduates g ON ga.graduate_id = g.id
                  WHERE mm.mentorship_request_id = :request_id
                  ORDER BY mm.created_at ASC";
        $stmt = $db->prepare($query);
        $stmt->bindParam(':request_id', $requestId);
        $stmt->execute();
        $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($messages as &$message) {
            $message['id'] = (int) $message['id'];
            $message['sender_account_id'] = (int) $message['sender_account_id'];
            $message['is_mine'] = (int) $message['sender_account_id'] === $user['account_id'];
        }

        echo json_encode(['success' => true, 'data' => $messages]);
        exit;
    }

    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);
        $requestId = isset($data['request_id']) ? (int) $data['request_id'] : 0;
        $messageText = isset($data['message_text']) ? trim((string) $data['message_text']) : '';

        if ($requestId <= 0 || $messageText === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'request_id and message_text are required']);
            exit;
        }

        $context = loadRequestContext($db, $requestId);
        if (!$context) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Mentorship request not found']);
            exit;
        }

        $isParticipant = (int) $context['mentee_account_id'] === $user['account_id']
            || (int) $context['mentor_account_id'] === $user['account_id'];

        if (!$isParticipant) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Access denied']);
            exit;
        }

        $insertStmt = $db->prepare("INSERT INTO mentorship_messages (mentorship_request_id, sender_account_id, message_text)
                                    VALUES (:request_id, :sender_account_id, :message_text)");
        $insertStmt->bindParam(':request_id', $requestId);
        $insertStmt->bindParam(':sender_account_id', $user['account_id']);
        $insertStmt->bindParam(':message_text', $messageText);
        $insertStmt->execute();

        echo json_encode(['success' => true, 'message' => 'Message sent', 'id' => (int) $db->lastInsertId()]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
