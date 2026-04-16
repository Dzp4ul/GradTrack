<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/engagement_approval.php';

$database = new Database();
$db = $database->getConnection();
gradtrack_ensure_engagement_approval_schema($db);
$method = $_SERVER['REQUEST_METHOD'];

try {
    $user = gradtrack_require_graduate_auth($db);

    if ($method === 'GET') {
        $type = isset($_GET['type']) ? trim((string) $_GET['type']) : 'my';

        if ($type === 'received') {
            $query = "SELECT ja.*, jp.title, jp.company,
                             g.first_name, g.last_name, ga.email AS applicant_email
                      FROM job_applications ja
                      JOIN job_posts jp ON ja.job_post_id = jp.id
                      JOIN graduate_accounts ga ON ja.applicant_account_id = ga.id
                      JOIN graduates g ON ga.graduate_id = g.id
                      WHERE jp.posted_by_account_id = :account_id
                      ORDER BY ja.applied_at DESC";
            $stmt = $db->prepare($query);
            $stmt->bindParam(':account_id', $user['account_id']);
            $stmt->execute();
        } else {
            $query = "SELECT ja.*, jp.title, jp.company, jp.location, jp.job_type, jp.industry
                      FROM job_applications ja
                      JOIN job_posts jp ON ja.job_post_id = jp.id
                      WHERE ja.applicant_account_id = :account_id
                      ORDER BY ja.applied_at DESC";
            $stmt = $db->prepare($query);
            $stmt->bindParam(':account_id', $user['account_id']);
            $stmt->execute();
        }

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$row) {
            $row['id'] = (int) $row['id'];
            $row['job_post_id'] = (int) $row['job_post_id'];
            $row['applicant_account_id'] = (int) $row['applicant_account_id'];
        }

        echo json_encode(['success' => true, 'data' => $rows]);
        exit;
    }

    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);
        $jobPostId = isset($data['job_post_id']) ? (int) $data['job_post_id'] : 0;
        $applicationNote = isset($data['application_note']) ? trim((string) $data['application_note']) : null;

        if ($jobPostId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'job_post_id is required']);
            exit;
        }

        $jobStmt = $db->prepare('SELECT posted_by_account_id, is_active, approval_status FROM job_posts WHERE id = :id');
        $jobStmt->bindParam(':id', $jobPostId);
        $jobStmt->execute();
        $job = $jobStmt->fetch(PDO::FETCH_ASSOC);

        if (!$job) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Job post not found']);
            exit;
        }

        if ((int) $job['is_active'] !== 1) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'This job post is not active']);
            exit;
        }

        if (($job['approval_status'] ?? '') !== 'approved') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'This job post is not yet approved']);
            exit;
        }

        if ((int) $job['posted_by_account_id'] === $user['account_id']) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'You cannot apply to your own job post']);
            exit;
        }

        $dupStmt = $db->prepare('SELECT id FROM job_applications WHERE job_post_id = :job_post_id AND applicant_account_id = :account_id');
        $dupStmt->bindParam(':job_post_id', $jobPostId);
        $dupStmt->bindParam(':account_id', $user['account_id']);
        $dupStmt->execute();

        if ($dupStmt->fetch(PDO::FETCH_ASSOC)) {
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => 'You already applied for this job']);
            exit;
        }

        $insertStmt = $db->prepare('INSERT INTO job_applications (job_post_id, applicant_account_id, application_note) VALUES (:job_post_id, :account_id, :application_note)');
        $insertStmt->bindParam(':job_post_id', $jobPostId);
        $insertStmt->bindParam(':account_id', $user['account_id']);
        $insertStmt->bindParam(':application_note', $applicationNote);
        $insertStmt->execute();

        echo json_encode([
            'success' => true,
            'message' => 'Application submitted successfully',
            'id' => (int) $db->lastInsertId()
        ]);
        exit;
    }

    if ($method === 'PUT') {
        $data = json_decode(file_get_contents('php://input'), true);
        $applicationId = isset($data['id']) ? (int) $data['id'] : 0;
        $status = isset($data['status']) ? trim((string) $data['status']) : '';

        if ($applicationId <= 0 || $status === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'id and status are required']);
            exit;
        }

        $allowedStatuses = ['pending', 'reviewed', 'shortlisted', 'rejected', 'hired'];
        if (!in_array($status, $allowedStatuses, true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid application status']);
            exit;
        }

        $ownershipStmt = $db->prepare("SELECT ja.id, jp.posted_by_account_id
                                      FROM job_applications ja
                                      JOIN job_posts jp ON ja.job_post_id = jp.id
                                      WHERE ja.id = :id");
        $ownershipStmt->bindParam(':id', $applicationId);
        $ownershipStmt->execute();
        $ownership = $ownershipStmt->fetch(PDO::FETCH_ASSOC);

        if (!$ownership) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Application not found']);
            exit;
        }

        if ((int) $ownership['posted_by_account_id'] !== $user['account_id']) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only the job poster can update application status']);
            exit;
        }

        $updateStmt = $db->prepare('UPDATE job_applications SET status = :status WHERE id = :id');
        $updateStmt->bindParam(':status', $status);
        $updateStmt->bindParam(':id', $applicationId);
        $updateStmt->execute();

        echo json_encode(['success' => true, 'message' => 'Application status updated']);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
