<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/alumni_rating.php';
require_once __DIR__ . '/../config/engagement_approval.php';

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

function gradtrack_request_column_info(PDO $db, string $table, string $column): ?array
{
    $stmt = $db->prepare("SELECT DATA_TYPE, COLUMN_TYPE
                          FROM INFORMATION_SCHEMA.COLUMNS
                          WHERE TABLE_SCHEMA = DATABASE()
                            AND TABLE_NAME = :table
                            AND COLUMN_NAME = :column
                          LIMIT 1");
    $stmt->execute([
        ':table' => $table,
        ':column' => $column,
    ]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function gradtrack_ensure_request_column(PDO $db, string $column, string $definition): void
{
    if (!gradtrack_request_column_info($db, 'mentorship_requests', $column)) {
        $db->exec("ALTER TABLE mentorship_requests ADD COLUMN {$definition}");
    }
}

function gradtrack_ensure_mentorship_request_schema(PDO $db): void
{
    $statusInfo = gradtrack_request_column_info($db, 'mentorship_requests', 'status');
    if ($statusInfo && strpos((string) ($statusInfo['COLUMN_TYPE'] ?? ''), 'cancelled') === false) {
        $db->exec("ALTER TABLE mentorship_requests
                   MODIFY status ENUM('pending','accepted','declined','completed','cancelled') DEFAULT 'pending'");
    }

    gradtrack_ensure_request_column($db, 'mentee_name', 'mentee_name VARCHAR(160) NULL AFTER mentee_account_id');
    gradtrack_ensure_request_column($db, 'mentee_email', 'mentee_email VARCHAR(160) NULL AFTER mentee_name');
    gradtrack_ensure_request_column($db, 'mentee_program', 'mentee_program VARCHAR(160) NULL AFTER mentee_email');
    gradtrack_ensure_request_column($db, 'reason_for_request', 'reason_for_request TEXT NULL AFTER request_message');
    gradtrack_ensure_request_column($db, 'topic', 'topic VARCHAR(150) NULL AFTER reason_for_request');
    gradtrack_ensure_request_column($db, 'preferred_schedule', 'preferred_schedule VARCHAR(150) NULL AFTER topic');
    gradtrack_ensure_request_column($db, 'session_date', 'session_date DATE NULL AFTER preferred_schedule');
    gradtrack_ensure_request_column($db, 'session_time', 'session_time VARCHAR(80) NULL AFTER session_date');
    gradtrack_ensure_request_column($db, 'session_type', 'session_type VARCHAR(50) NULL AFTER session_time');
    gradtrack_ensure_request_column($db, 'meeting_link', 'meeting_link VARCHAR(255) NULL AFTER session_type');
    gradtrack_ensure_request_column($db, 'meeting_location', 'meeting_location VARCHAR(255) NULL AFTER meeting_link');
    gradtrack_ensure_request_column($db, 'session_notes', 'session_notes TEXT NULL AFTER meeting_location');

    if (!gradtrack_request_column_info($db, 'mentorship_feedback', 'mentor_helpful')) {
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
        CONSTRAINT fk_mentor_feedback_request FOREIGN KEY (mentorship_request_id) REFERENCES mentorship_requests(id) ON DELETE CASCADE,
        CONSTRAINT fk_mentor_feedback_account FOREIGN KEY (mentor_account_id) REFERENCES graduate_accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

try {
    $user = gradtrack_require_graduate_auth($db);
    gradtrack_ensure_mentorship_request_schema($db);
    gradtrack_ensure_engagement_approval_schema($db);

    if ($method === 'GET') {
        $type = isset($_GET['type']) ? trim((string) $_GET['type']) : 'outgoing';

        if ($type === 'incoming') {
            $query = "SELECT mr.*, m.id AS mentor_id,
                             COALESCE(mr.mentee_email, ga.email) AS mentee_email,
                             COALESCE(mr.mentee_name, CONCAT(g.first_name, ' ', g.last_name)) AS mentee_name,
                             COALESCE(mr.mentee_program, p.code, p.name) AS mentee_program,
                             g.first_name AS mentee_first_name,
                             g.last_name AS mentee_last_name,
                             mf.rating AS mentee_feedback_rating,
                             mf.feedback_text AS mentee_feedback_text,
                             mf.mentor_helpful AS mentee_found_helpful,
                             mmf.mentee_attended AS mentor_feedback_attended,
                             mmf.session_completed AS mentor_feedback_completed,
                             mmf.remarks AS mentor_feedback_remarks
                      FROM mentorship_requests mr
                      JOIN mentors m ON mr.mentor_id = m.id
                      JOIN graduate_accounts ga ON mr.mentee_account_id = ga.id
                      JOIN graduates g ON ga.graduate_id = g.id
                      LEFT JOIN programs p ON g.program_id = p.id
                      LEFT JOIN mentorship_feedback mf ON mf.mentorship_request_id = mr.id
                      LEFT JOIN mentorship_mentor_feedback mmf ON mmf.mentorship_request_id = mr.id
                      WHERE m.graduate_account_id = :account_id
                      ORDER BY mr.requested_at DESC";
            $stmt = $db->prepare($query);
            $stmt->bindParam(':account_id', $user['account_id']);
            $stmt->execute();
        } else {
            $query = "SELECT mr.*, m.id AS mentor_id,
                             mg.first_name AS mentor_first_name,
                             mg.last_name AS mentor_last_name,
                             m.current_job_title, m.company, m.industry,
                             m.job_alignment, m.mentor_type, m.availability_status,
                             gpi.file_path AS mentor_profile_image_path,
                             mf.rating AS mentee_feedback_rating,
                             mf.feedback_text AS mentee_feedback_text,
                             mf.mentor_helpful AS mentee_found_helpful,
                             mmf.mentee_attended AS mentor_feedback_attended,
                             mmf.session_completed AS mentor_feedback_completed,
                             mmf.remarks AS mentor_feedback_remarks
                      FROM mentorship_requests mr
                      JOIN mentors m ON mr.mentor_id = m.id
                      JOIN graduates mg ON m.graduate_id = mg.id
                      JOIN graduate_accounts mga ON m.graduate_account_id = mga.id
                      LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = mga.id
                      LEFT JOIN mentorship_feedback mf ON mf.mentorship_request_id = mr.id
                      LEFT JOIN mentorship_mentor_feedback mmf ON mmf.mentorship_request_id = mr.id
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
            if (isset($row['mentee_feedback_rating'])) {
                $row['mentee_feedback_rating'] = $row['mentee_feedback_rating'] !== null ? (int) $row['mentee_feedback_rating'] : null;
            }
            if (isset($row['mentee_found_helpful'])) {
                $row['mentee_found_helpful'] = $row['mentee_found_helpful'] !== null ? (bool) $row['mentee_found_helpful'] : null;
            }
            if (isset($row['mentor_feedback_attended'])) {
                $row['mentor_feedback_attended'] = $row['mentor_feedback_attended'] !== null ? (bool) $row['mentor_feedback_attended'] : null;
            }
            if (isset($row['mentor_feedback_completed'])) {
                $row['mentor_feedback_completed'] = $row['mentor_feedback_completed'] !== null ? (bool) $row['mentor_feedback_completed'] : null;
            }
        }

        echo json_encode(['success' => true, 'data' => $rows]);
        exit;
    }

    if ($method === 'POST') {
        gradtrack_require_feature_access($db, $user, 'mentorship_request');
        $data = json_decode(file_get_contents('php://input'), true);
        $mentorId = isset($data['mentor_id']) ? (int) $data['mentor_id'] : 0;
        $requestMessage = isset($data['request_message']) ? trim((string) $data['request_message']) : null;
        $menteeName = isset($data['mentee_name']) ? trim((string) $data['mentee_name']) : '';
        $menteeEmail = isset($data['mentee_email']) ? trim((string) $data['mentee_email']) : '';
        $menteeProgram = isset($data['mentee_program']) ? trim((string) $data['mentee_program']) : '';
        $reasonForRequest = isset($data['reason_for_request']) ? trim((string) $data['reason_for_request']) : null;
        $topic = isset($data['topic']) ? trim((string) $data['topic']) : null;
        $preferredSchedule = isset($data['preferred_schedule']) ? trim((string) $data['preferred_schedule']) : null;

        if ($menteeName === '') {
            $menteeName = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''));
        }

        if ($menteeEmail === '') {
            $menteeEmail = (string) ($user['email'] ?? '');
        }

        if ($menteeProgram === '') {
            $menteeProgram = (string) (($user['program_code'] ?? '') ?: ($user['program_name'] ?? ''));
        }

        if ($mentorId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'mentor_id is required']);
            exit;
        }

        $mentorOwnerStmt = $db->prepare("SELECT graduate_account_id
                                         FROM mentors
                                         WHERE id = :id
                                           AND is_active = 1
                                           AND approval_status = 'approved'");
        $mentorOwnerStmt->bindParam(':id', $mentorId);
        $mentorOwnerStmt->execute();
        $mentor = $mentorOwnerStmt->fetch(PDO::FETCH_ASSOC);

        if (!$mentor) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Mentor not found, inactive, or not yet approved']);
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

        $insertStmt = $db->prepare("INSERT INTO mentorship_requests
                                    (mentor_id, mentee_account_id, mentee_name, mentee_email, mentee_program,
                                     request_message, reason_for_request, topic, preferred_schedule)
                                    VALUES
                                    (:mentor_id, :mentee_account_id, :mentee_name, :mentee_email, :mentee_program,
                                     :request_message, :reason_for_request, :topic, :preferred_schedule)");
        $insertStmt->bindParam(':mentor_id', $mentorId);
        $insertStmt->bindParam(':mentee_account_id', $user['account_id']);
        $insertStmt->bindParam(':mentee_name', $menteeName);
        $insertStmt->bindParam(':mentee_email', $menteeEmail);
        $insertStmt->bindParam(':mentee_program', $menteeProgram);
        $insertStmt->bindParam(':request_message', $requestMessage);
        $insertStmt->bindParam(':reason_for_request', $reasonForRequest);
        $insertStmt->bindParam(':topic', $topic);
        $insertStmt->bindParam(':preferred_schedule', $preferredSchedule);
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

            if ($status === 'accepted') {
                $sessionDate = array_key_exists('session_date', $data) ? trim((string) $data['session_date']) : (string) ($request['session_date'] ?? '');
                $sessionTime = array_key_exists('session_time', $data) ? trim((string) $data['session_time']) : (string) ($request['session_time'] ?? '');
                $sessionType = array_key_exists('session_type', $data) ? trim((string) $data['session_type']) : (string) ($request['session_type'] ?? '');
                $meetingLink = array_key_exists('meeting_link', $data) ? trim((string) $data['meeting_link']) : (string) ($request['meeting_link'] ?? '');
                $meetingLocation = array_key_exists('meeting_location', $data) ? trim((string) $data['meeting_location']) : (string) ($request['meeting_location'] ?? '');
                $sessionNotes = array_key_exists('session_notes', $data) ? trim((string) $data['session_notes']) : (string) ($request['session_notes'] ?? '');

                $sessionDate = $sessionDate !== '' ? $sessionDate : null;
                $sessionTime = $sessionTime !== '' ? $sessionTime : null;
                $sessionType = $sessionType !== '' ? $sessionType : null;
                $meetingLink = $meetingLink !== '' ? $meetingLink : null;
                $meetingLocation = $meetingLocation !== '' ? $meetingLocation : null;
                $sessionNotes = $sessionNotes !== '' ? $sessionNotes : null;

                $updateStmt = $db->prepare("UPDATE mentorship_requests
                                            SET status = 'accepted',
                                                responded_at = NOW(),
                                                session_date = :session_date,
                                                session_time = :session_time,
                                                session_type = :session_type,
                                                meeting_link = :meeting_link,
                                                meeting_location = :meeting_location,
                                                session_notes = :session_notes
                                            WHERE id = :id");
                $updateStmt->bindValue(':session_date', $sessionDate);
                $updateStmt->bindValue(':session_time', $sessionTime);
                $updateStmt->bindValue(':session_type', $sessionType);
                $updateStmt->bindValue(':meeting_link', $meetingLink);
                $updateStmt->bindValue(':meeting_location', $meetingLocation);
                $updateStmt->bindValue(':session_notes', $sessionNotes);
                $updateStmt->bindParam(':id', $requestId);
                $updateStmt->execute();
            } else {
                $updateStmt = $db->prepare('UPDATE mentorship_requests SET status = :status, responded_at = NOW() WHERE id = :id');
                $updateStmt->bindParam(':status', $status);
                $updateStmt->bindParam(':id', $requestId);
                $updateStmt->execute();
            }
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
        } elseif ($status === 'cancelled') {
            $isParticipant = (int) $request['mentor_account_id'] === $user['account_id']
                || (int) $request['mentee_account_id'] === $user['account_id'];

            if (!$isParticipant) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'Only participants can cancel this mentorship']);
                exit;
            }

            $updateStmt = $db->prepare("UPDATE mentorship_requests
                                        SET status = 'cancelled'
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
