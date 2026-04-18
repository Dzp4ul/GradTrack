<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/alumni_rating.php';
require_once __DIR__ . '/../config/engagement_approval.php';

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

function gradtrack_column_info(PDO $db, string $table, string $column): ?array
{
    $stmt = $db->prepare("SELECT DATA_TYPE, COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH
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

function gradtrack_table_exists(PDO $db, string $table): bool
{
        $stmt = $db->prepare("SELECT 1
                                                    FROM INFORMATION_SCHEMA.TABLES
                                                    WHERE TABLE_SCHEMA = DATABASE()
                                                        AND TABLE_NAME = :table
                                                    LIMIT 1");
        $stmt->execute([':table' => $table]);
        return (bool) $stmt->fetchColumn();
}

function gradtrack_ensure_mentor_schema(PDO $db): void
{
    gradtrack_ensure_graduate_profile_image_table($db);

    $availabilityInfo = gradtrack_column_info($db, 'mentors', 'availability_status');
    if ($availabilityInfo
        && (($availabilityInfo['DATA_TYPE'] ?? '') !== 'varchar'
            || (int) ($availabilityInfo['CHARACTER_MAXIMUM_LENGTH'] ?? 0) < 160)) {
        $db->exec("ALTER TABLE mentors
                   MODIFY availability_status VARCHAR(160) NULL DEFAULT 'Available: Saturday 2 PM - 5 PM'");
    }

    if (!gradtrack_column_info($db, 'mentors', 'job_alignment')) {
        $db->exec("ALTER TABLE mentors ADD COLUMN job_alignment VARCHAR(120) NULL AFTER industry");
    }

    if (!gradtrack_column_info($db, 'mentors', 'mentor_type')) {
        $db->exec("ALTER TABLE mentors ADD COLUMN mentor_type VARCHAR(120) NULL AFTER job_alignment");
    }

    if (!gradtrack_column_info($db, 'mentors', 'max_members')) {
        $db->exec("ALTER TABLE mentors ADD COLUMN max_members INT UNSIGNED NOT NULL DEFAULT 5 AFTER mentor_type");
    }

    if (!gradtrack_column_info($db, 'mentors', 'post_status')) {
        $db->exec("ALTER TABLE mentors ADD COLUMN post_status ENUM('open','closed') NOT NULL DEFAULT 'open' AFTER max_members");
    }

    gradtrack_ensure_engagement_approval_schema($db);
}

try {
    gradtrack_ensure_mentor_schema($db);

    if ($method === 'GET') {
        if (isset($_GET['mine']) && $_GET['mine'] === '1') {
            $user = gradtrack_require_graduate_auth($db);

            $mineQuery = "SELECT m.*, p.name AS program_name, p.code AS program_code,
                                 g.first_name, g.middle_name, g.last_name, g.year_graduated,
                                 ga.email AS contact_email,
                                 gpi.file_path AS profile_image_path
                          FROM mentors m
                          LEFT JOIN graduate_accounts ga ON m.graduate_account_id = ga.id
                          JOIN graduates g ON m.graduate_id = g.id
                          LEFT JOIN programs p ON g.program_id = p.id
                          LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
                          WHERE (m.graduate_account_id = :account_id OR m.graduate_id = :graduate_id)
                          ORDER BY CASE WHEN m.graduate_account_id = :account_id_priority THEN 0 ELSE 1 END,
                                   m.id DESC
                          LIMIT 1";
            $mineStmt = $db->prepare($mineQuery);
            $mineStmt->execute([
                ':account_id' => $user['account_id'],
                ':graduate_id' => $user['graduate_id'],
                ':account_id_priority' => $user['account_id'],
            ]);
            $mine = $mineStmt->fetch(PDO::FETCH_ASSOC);

            if ($mine && (!isset($mine['graduate_account_id']) || (int) ($mine['graduate_account_id'] ?? 0) === 0)) {
                $backfillStmt = $db->prepare('UPDATE mentors
                                             SET graduate_account_id = :account_id
                                             WHERE id = :id');
                $backfillStmt->execute([
                    ':account_id' => $user['account_id'],
                    ':id' => (int) $mine['id'],
                ]);
                $mine['graduate_account_id'] = (int) $user['account_id'];
            }

            if ($mine && (empty($mine['contact_email']) || $mine['contact_email'] === null)) {
                $mine['contact_email'] = $user['email'] ?? null;
            }

            echo json_encode(['success' => true, 'data' => $mine ?: null]);
            exit;
        }

        $search = isset($_GET['search']) ? trim((string) $_GET['search']) : '';
        $industry = isset($_GET['industry']) ? trim((string) $_GET['industry']) : '';
        $skills = isset($_GET['skills']) ? trim((string) $_GET['skills']) : '';
        $program = isset($_GET['program']) ? trim((string) $_GET['program']) : '';
        $jobAlignment = isset($_GET['job_alignment']) ? trim((string) $_GET['job_alignment']) : '';
        $mentorType = isset($_GET['mentor_type']) ? trim((string) $_GET['mentor_type']) : '';
        $yearGraduated = isset($_GET['year_graduated']) && is_numeric($_GET['year_graduated'])
            ? (int) $_GET['year_graduated']
            : null;

                $sql = "SELECT m.id, m.current_job_title, m.company, m.industry, m.skills, m.bio,
                       m.job_alignment, m.mentor_type,
                                             m.availability_status, m.preferred_topics, m.max_members, m.post_status, m.created_at,
                       m.approval_status, m.approval_reviewed_at, m.approval_notes,
                                             COALESCE(active_requests.active_mentees_count, 0) AS active_mentees_count,
                       g.id AS graduate_id, g.first_name, g.middle_name, g.last_name, g.year_graduated,
                       ga.email AS contact_email,
                       gpi.file_path AS profile_image_path,
                       p.name AS program_name, p.code AS program_code
                FROM mentors m
                JOIN graduate_accounts ga ON m.graduate_account_id = ga.id
                JOIN graduates g ON m.graduate_id = g.id
                LEFT JOIN programs p ON g.program_id = p.id
                LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
                                LEFT JOIN (
                                        SELECT mentor_id, COUNT(*) AS active_mentees_count
                                        FROM mentorship_requests
                                        WHERE status IN ('pending', 'accepted')
                                        GROUP BY mentor_id
                                ) active_requests ON active_requests.mentor_id = m.id
                WHERE m.is_active = 1
                  AND m.approval_status = 'approved'";

        $params = [];

        if ($search !== '') {
            $sql .= " AND (
                g.first_name LIKE :search
                OR g.last_name LIKE :search
                OR m.current_job_title LIKE :search
                OR m.company LIKE :search
                OR m.bio LIKE :search
                OR m.industry LIKE :search
                OR m.skills LIKE :search
                OR m.preferred_topics LIKE :search
                OR m.job_alignment LIKE :search
                OR m.mentor_type LIKE :search
                OR p.name LIKE :search
                OR p.code LIKE :search
            )";
            $params[':search'] = '%' . $search . '%';
        }

        if ($industry !== '') {
            $sql .= ' AND m.industry LIKE :industry';
            $params[':industry'] = '%' . $industry . '%';
        }

        if ($skills !== '') {
            $sql .= ' AND m.skills LIKE :skills';
            $params[':skills'] = '%' . $skills . '%';
        }

        if ($jobAlignment !== '') {
            $sql .= ' AND m.job_alignment LIKE :job_alignment';
            $params[':job_alignment'] = '%' . $jobAlignment . '%';
        }

        if ($mentorType !== '') {
            $sql .= ' AND m.mentor_type LIKE :mentor_type';
            $params[':mentor_type'] = '%' . $mentorType . '%';
        }

        if ($program !== '') {
            $sql .= ' AND (p.code = :program OR p.name LIKE :program_name)';
            $params[':program'] = $program;
            $params[':program_name'] = '%' . $program . '%';
        }

        if ($yearGraduated !== null) {
            $sql .= ' AND g.year_graduated = :year_graduated';
            $params[':year_graduated'] = $yearGraduated;
        }

        $sql .= ' ORDER BY m.created_at DESC';

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $mentorIds = array_column($rows, 'id');
        $ratings = [];
        if (!empty($mentorIds)) {
            $placeholders = implode(',', array_fill(0, count($mentorIds), '?'));
            $ratingStmt = $db->prepare(
                "SELECT mr.mentor_id, 
                        COALESCE(AVG(mf.rating), 0) AS avg_rating,
                        COUNT(mf.id) AS feedback_count
                 FROM mentorship_requests mr
                 LEFT JOIN mentorship_feedback mf ON mf.mentorship_request_id = mr.id
                 WHERE mr.mentor_id IN ($placeholders)
                 GROUP BY mr.mentor_id"
            );
            $ratingStmt->execute($mentorIds);
            foreach ($ratingStmt->fetchAll(PDO::FETCH_ASSOC) as $rating) {
                $ratings[(int)$rating['mentor_id']] = [
                    'avg_rating' => round((float)$rating['avg_rating'], 1),
                    'feedback_count' => (int)$rating['feedback_count']
                ];
            }
        }

        foreach ($rows as &$row) {
            $row['id'] = (int) $row['id'];
            $row['graduate_id'] = (int) $row['graduate_id'];
            $row['year_graduated'] = $row['year_graduated'] !== null ? (int) $row['year_graduated'] : null;
            $row['max_members'] = isset($row['max_members']) ? max(1, (int) $row['max_members']) : 1;
            $row['active_mentees_count'] = isset($row['active_mentees_count']) ? (int) $row['active_mentees_count'] : 0;
            $row['avg_rating'] = $ratings[$row['id']]['avg_rating'] ?? 0.0;
            $row['feedback_count'] = $ratings[$row['id']]['feedback_count'] ?? 0;
        }

        echo json_encode(['success' => true, 'data' => $rows]);
        exit;
    }

    if ($method === 'POST') {
        $user = gradtrack_require_graduate_auth($db);
        gradtrack_require_feature_access($db, $user, 'mentor_registration');
        $data = json_decode(file_get_contents('php://input'), true);

        $currentJobTitle = isset($data['current_job_title']) ? trim((string) $data['current_job_title']) : null;
        $company = isset($data['company']) ? trim((string) $data['company']) : null;
        $industry = isset($data['industry']) ? trim((string) $data['industry']) : null;
        $jobAlignment = isset($data['job_alignment']) ? trim((string) $data['job_alignment']) : null;
        $mentorType = isset($data['mentor_type']) ? trim((string) $data['mentor_type']) : null;
        $skills = isset($data['skills']) ? trim((string) $data['skills']) : null;
        $bio = isset($data['bio']) ? trim((string) $data['bio']) : null;
        $availability = isset($data['availability_status']) ? trim((string) $data['availability_status']) : 'Available: Saturday 2 PM - 5 PM';
        $postStatus = isset($data['post_status']) ? strtolower(trim((string) $data['post_status'])) : 'open';
        $maxMembers = isset($data['max_members']) ? (int) $data['max_members'] : 5;
        $preferredTopics = isset($data['preferred_topics']) ? trim((string) $data['preferred_topics']) : null;
        $isActive = isset($data['is_active']) ? (int) !!$data['is_active'] : 1;

        if ($availability === '') {
            $availability = 'Available: Saturday 2 PM - 5 PM';
        }

        if (!in_array($postStatus, ['open', 'closed'], true)) {
            $postStatus = 'open';
        }

        if ($maxMembers < 1) {
            $maxMembers = 1;
        }

        if ($maxMembers > 100) {
            $maxMembers = 100;
        }

        $existingStmt = $db->prepare('SELECT id, graduate_account_id
                                      FROM mentors
                                      WHERE graduate_account_id = :account_id
                                         OR graduate_id = :graduate_id
                                      ORDER BY CASE WHEN graduate_account_id = :account_id_priority THEN 0 ELSE 1 END,
                                               id DESC
                                      LIMIT 1');
        $existingStmt->execute([
            ':account_id' => $user['account_id'],
            ':graduate_id' => $user['graduate_id'],
            ':account_id_priority' => $user['account_id'],
        ]);
        $existing = $existingStmt->fetch(PDO::FETCH_ASSOC);

        if ($existing) {
            $mentorId = (int) $existing['id'];
            $updateQuery = "UPDATE mentors
                            SET current_job_title = :current_job_title,
                                graduate_account_id = :graduate_account_id,
                                company = :company,
                                industry = :industry,
                                job_alignment = :job_alignment,
                                mentor_type = :mentor_type,
                                max_members = :max_members,
                                post_status = :post_status,
                                skills = :skills,
                                bio = :bio,
                                availability_status = :availability_status,
                                preferred_topics = :preferred_topics,
                                is_active = :is_active,
                                approval_status = 'pending',
                                approval_reviewed_by = NULL,
                                approval_reviewed_at = NULL,
                                approval_notes = NULL
                            WHERE id = :id";
            $updateStmt = $db->prepare($updateQuery);
            $updateStmt->bindParam(':id', $mentorId);
            $updateStmt->bindParam(':current_job_title', $currentJobTitle);
            $updateStmt->bindParam(':graduate_account_id', $user['account_id']);
            $updateStmt->bindParam(':company', $company);
            $updateStmt->bindParam(':industry', $industry);
            $updateStmt->bindParam(':job_alignment', $jobAlignment);
            $updateStmt->bindParam(':mentor_type', $mentorType);
            $updateStmt->bindParam(':max_members', $maxMembers);
            $updateStmt->bindParam(':post_status', $postStatus);
            $updateStmt->bindParam(':skills', $skills);
            $updateStmt->bindParam(':bio', $bio);
            $updateStmt->bindParam(':availability_status', $availability);
            $updateStmt->bindParam(':preferred_topics', $preferredTopics);
            $updateStmt->bindParam(':is_active', $isActive);
            $updateStmt->execute();
        } else {
            $insertQuery = "INSERT INTO mentors
                            (graduate_account_id, graduate_id, current_job_title, company, industry, job_alignment, mentor_type, max_members, post_status, skills, bio, availability_status, preferred_topics, is_active, approval_status)
                            VALUES
                            (:account_id, :graduate_id, :current_job_title, :company, :industry, :job_alignment, :mentor_type, :max_members, :post_status, :skills, :bio, :availability_status, :preferred_topics, :is_active, 'pending')";
            $insertStmt = $db->prepare($insertQuery);
            $insertStmt->bindParam(':account_id', $user['account_id']);
            $insertStmt->bindParam(':graduate_id', $user['graduate_id']);
            $insertStmt->bindParam(':current_job_title', $currentJobTitle);
            $insertStmt->bindParam(':company', $company);
            $insertStmt->bindParam(':industry', $industry);
            $insertStmt->bindParam(':job_alignment', $jobAlignment);
            $insertStmt->bindParam(':mentor_type', $mentorType);
            $insertStmt->bindParam(':max_members', $maxMembers);
            $insertStmt->bindParam(':post_status', $postStatus);
            $insertStmt->bindParam(':skills', $skills);
            $insertStmt->bindParam(':bio', $bio);
            $insertStmt->bindParam(':availability_status', $availability);
            $insertStmt->bindParam(':preferred_topics', $preferredTopics);
            $insertStmt->bindParam(':is_active', $isActive);
            $insertStmt->execute();
            $mentorId = (int) $db->lastInsertId();
        }

        echo json_encode([
            'success' => true,
            'message' => 'Mentor profile submitted for approval',
            'mentor_id' => $mentorId,
            'approval_status' => 'pending'
        ]);
        exit;
    }

    if ($method === 'DELETE') {
        $user = gradtrack_require_graduate_auth($db);

        $mentorStmt = $db->prepare('SELECT id FROM mentors WHERE graduate_account_id = :account_id LIMIT 1');
        $mentorStmt->execute([':account_id' => $user['account_id']]);
        $mentor = $mentorStmt->fetch(PDO::FETCH_ASSOC);

        if (!$mentor) {
            echo json_encode([
                'success' => true,
                'message' => 'No mentor profile found for this account',
                'deleted' => false,
            ]);
            exit;
        }

        $mentorId = (int) $mentor['id'];

        $db->beginTransaction();
        try {
            if (gradtrack_table_exists($db, 'mentorship_feedback')) {
                $feedbackDeleteStmt = $db->prepare("DELETE FROM mentorship_feedback
                                                   WHERE mentorship_request_id IN (
                                                       SELECT id FROM mentorship_requests WHERE mentor_id = :mentor_id
                                                   )");
                $feedbackDeleteStmt->execute([':mentor_id' => $mentorId]);
            }

            if (gradtrack_table_exists($db, 'mentorship_mentor_feedback')) {
                $mentorFeedbackDeleteStmt = $db->prepare("DELETE FROM mentorship_mentor_feedback
                                                         WHERE mentorship_request_id IN (
                                                             SELECT id FROM mentorship_requests WHERE mentor_id = :mentor_id
                                                         )");
                $mentorFeedbackDeleteStmt->execute([':mentor_id' => $mentorId]);
            }

            if (gradtrack_table_exists($db, 'mentorship_requests')) {
                $requestsDeleteStmt = $db->prepare('DELETE FROM mentorship_requests WHERE mentor_id = :mentor_id');
                $requestsDeleteStmt->execute([':mentor_id' => $mentorId]);
            }

            $deleteStmt = $db->prepare('DELETE FROM mentors WHERE id = :id AND graduate_account_id = :account_id');
            $deleteStmt->execute([
                ':id' => $mentorId,
                ':account_id' => $user['account_id'],
            ]);

            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }

        echo json_encode([
            'success' => true,
            'message' => 'Mentor profile deleted successfully',
            'deleted' => true,
        ]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
