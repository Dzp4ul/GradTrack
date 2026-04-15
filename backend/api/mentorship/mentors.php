<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/alumni_rating.php';

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
                          JOIN graduate_accounts ga ON m.graduate_account_id = ga.id
                          JOIN graduates g ON m.graduate_id = g.id
                          LEFT JOIN programs p ON g.program_id = p.id
                          LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
                          WHERE m.graduate_account_id = :account_id";
            $mineStmt = $db->prepare($mineQuery);
            $mineStmt->bindParam(':account_id', $user['account_id']);
            $mineStmt->execute();
            $mine = $mineStmt->fetch(PDO::FETCH_ASSOC);

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
                       m.availability_status, m.preferred_topics, m.created_at,
                       g.id AS graduate_id, g.first_name, g.middle_name, g.last_name, g.year_graduated,
                       ga.email AS contact_email,
                       gpi.file_path AS profile_image_path,
                       p.name AS program_name, p.code AS program_code,
                       COALESCE(AVG(mf.rating), 0) AS avg_rating,
                       COUNT(mf.id) AS feedback_count
                FROM mentors m
                JOIN graduate_accounts ga ON m.graduate_account_id = ga.id
                JOIN graduates g ON m.graduate_id = g.id
                LEFT JOIN programs p ON g.program_id = p.id
                LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
                LEFT JOIN mentorship_requests mr ON mr.mentor_id = m.id
                LEFT JOIN mentorship_feedback mf ON mf.mentorship_request_id = mr.id
                WHERE m.is_active = 1";

        $params = [];

        if ($search !== '') {
            $sql .= " AND (
                g.first_name LIKE :search
                OR g.last_name LIKE :search2
                OR m.current_job_title LIKE :search3
                OR m.company LIKE :search4
                OR m.bio LIKE :search5
                OR m.industry LIKE :search6
                OR m.skills LIKE :search7
                OR m.preferred_topics LIKE :search8
                OR m.job_alignment LIKE :search9
                OR m.mentor_type LIKE :search10
                OR p.name LIKE :search11
                OR p.code LIKE :search12
            )";
            $params[':search'] = '%' . $search . '%';
            $params[':search2'] = '%' . $search . '%';
            $params[':search3'] = '%' . $search . '%';
            $params[':search4'] = '%' . $search . '%';
            $params[':search5'] = '%' . $search . '%';
            $params[':search6'] = '%' . $search . '%';
            $params[':search7'] = '%' . $search . '%';
            $params[':search8'] = '%' . $search . '%';
            $params[':search9'] = '%' . $search . '%';
            $params[':search10'] = '%' . $search . '%';
            $params[':search11'] = '%' . $search . '%';
            $params[':search12'] = '%' . $search . '%';
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

        $sql .= ' GROUP BY m.id ORDER BY m.created_at DESC';

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($rows as &$row) {
            $row['id'] = (int) $row['id'];
            $row['graduate_id'] = (int) $row['graduate_id'];
            $row['year_graduated'] = $row['year_graduated'] !== null ? (int) $row['year_graduated'] : null;
            $row['avg_rating'] = round((float) $row['avg_rating'], 1);
            $row['feedback_count'] = (int) $row['feedback_count'];
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
        $preferredTopics = isset($data['preferred_topics']) ? trim((string) $data['preferred_topics']) : null;
        $isActive = isset($data['is_active']) ? (int) !!$data['is_active'] : 1;

        if ($availability === '') {
            $availability = 'Available: Saturday 2 PM - 5 PM';
        }

        $existingStmt = $db->prepare('SELECT id FROM mentors WHERE graduate_account_id = :account_id');
        $existingStmt->bindParam(':account_id', $user['account_id']);
        $existingStmt->execute();
        $existing = $existingStmt->fetch(PDO::FETCH_ASSOC);

        if ($existing) {
            $mentorId = (int) $existing['id'];
            $updateQuery = "UPDATE mentors
                            SET current_job_title = :current_job_title,
                                company = :company,
                                industry = :industry,
                                job_alignment = :job_alignment,
                                mentor_type = :mentor_type,
                                skills = :skills,
                                bio = :bio,
                                availability_status = :availability_status,
                                preferred_topics = :preferred_topics,
                                is_active = :is_active
                            WHERE id = :id";
            $updateStmt = $db->prepare($updateQuery);
            $updateStmt->bindParam(':id', $mentorId);
            $updateStmt->bindParam(':current_job_title', $currentJobTitle);
            $updateStmt->bindParam(':company', $company);
            $updateStmt->bindParam(':industry', $industry);
            $updateStmt->bindParam(':job_alignment', $jobAlignment);
            $updateStmt->bindParam(':mentor_type', $mentorType);
            $updateStmt->bindParam(':skills', $skills);
            $updateStmt->bindParam(':bio', $bio);
            $updateStmt->bindParam(':availability_status', $availability);
            $updateStmt->bindParam(':preferred_topics', $preferredTopics);
            $updateStmt->bindParam(':is_active', $isActive);
            $updateStmt->execute();
        } else {
            $insertQuery = "INSERT INTO mentors
                            (graduate_account_id, graduate_id, current_job_title, company, industry, job_alignment, mentor_type, skills, bio, availability_status, preferred_topics, is_active)
                            VALUES
                            (:account_id, :graduate_id, :current_job_title, :company, :industry, :job_alignment, :mentor_type, :skills, :bio, :availability_status, :preferred_topics, :is_active)";
            $insertStmt = $db->prepare($insertQuery);
            $insertStmt->bindParam(':account_id', $user['account_id']);
            $insertStmt->bindParam(':graduate_id', $user['graduate_id']);
            $insertStmt->bindParam(':current_job_title', $currentJobTitle);
            $insertStmt->bindParam(':company', $company);
            $insertStmt->bindParam(':industry', $industry);
            $insertStmt->bindParam(':job_alignment', $jobAlignment);
            $insertStmt->bindParam(':mentor_type', $mentorType);
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
            'message' => 'Mentor profile saved successfully',
            'mentor_id' => $mentorId
        ]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
