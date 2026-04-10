<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/alumni_rating.php';

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'GET') {
        $jobId = isset($_GET['id']) ? (int) $_GET['id'] : 0;
        $mineOnly = isset($_GET['mine']) && $_GET['mine'] === '1';

        if ($jobId > 0) {
            $detailQuery = "SELECT jp.*, g.first_name, g.last_name, ga.email AS poster_email,
                                   (SELECT COUNT(*) FROM job_applications ja WHERE ja.job_post_id = jp.id) AS application_count
                            FROM job_posts jp
                            JOIN graduate_accounts ga ON jp.posted_by_account_id = ga.id
                            JOIN graduates g ON ga.graduate_id = g.id
                            WHERE jp.id = :id";
            $detailStmt = $db->prepare($detailQuery);
            $detailStmt->bindParam(':id', $jobId);
            $detailStmt->execute();
            $job = $detailStmt->fetch(PDO::FETCH_ASSOC);

            if (!$job) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Job not found']);
                exit;
            }

            $job['id'] = (int) $job['id'];
            $job['posted_by_account_id'] = (int) $job['posted_by_account_id'];
            $job['is_active'] = (int) $job['is_active'];
            $job['application_count'] = (int) $job['application_count'];

            echo json_encode(['success' => true, 'data' => $job]);
            exit;
        }

        $search = isset($_GET['search']) ? trim((string) $_GET['search']) : '';
        $jobType = isset($_GET['job_type']) ? trim((string) $_GET['job_type']) : '';
        $location = isset($_GET['location']) ? trim((string) $_GET['location']) : '';
        $industry = isset($_GET['industry']) ? trim((string) $_GET['industry']) : '';
        $activeOnly = !isset($_GET['include_inactive']) || $_GET['include_inactive'] !== '1';

        $currentUser = null;
        if ($mineOnly) {
            $currentUser = gradtrack_require_graduate_auth($db);
            $activeOnly = false;
        }

        $sql = "SELECT jp.id, jp.title, jp.company, jp.location, jp.job_type, jp.industry,
                       jp.application_deadline, jp.is_active, jp.created_at,
                       g.first_name, g.last_name
                FROM job_posts jp
                JOIN graduate_accounts ga ON jp.posted_by_account_id = ga.id
                JOIN graduates g ON ga.graduate_id = g.id
                WHERE 1=1";

        $params = [];

        if ($activeOnly) {
            $sql .= ' AND jp.is_active = 1';
        }

        if ($mineOnly && $currentUser) {
            $sql .= ' AND jp.posted_by_account_id = :mine_account_id';
            $params[':mine_account_id'] = $currentUser['account_id'];
        }

        if ($search !== '') {
            $sql .= " AND (
                jp.title LIKE :search
                OR jp.company LIKE :search2
                OR jp.description LIKE :search3
                OR jp.required_skills LIKE :search4
            )";
            $params[':search'] = '%' . $search . '%';
            $params[':search2'] = '%' . $search . '%';
            $params[':search3'] = '%' . $search . '%';
            $params[':search4'] = '%' . $search . '%';
        }

        if ($jobType !== '') {
            $sql .= ' AND jp.job_type = :job_type';
            $params[':job_type'] = $jobType;
        }

        if ($location !== '') {
            $sql .= ' AND jp.location LIKE :location';
            $params[':location'] = '%' . $location . '%';
        }

        if ($industry !== '') {
            $sql .= ' AND jp.industry LIKE :industry';
            $params[':industry'] = '%' . $industry . '%';
        }

        $sql .= ' ORDER BY jp.created_at DESC';

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($rows as &$row) {
            $row['id'] = (int) $row['id'];
            $row['is_active'] = (int) $row['is_active'];
        }

        echo json_encode(['success' => true, 'data' => $rows]);
        exit;
    }

    if ($method === 'POST') {
        $user = gradtrack_require_graduate_auth($db);
        gradtrack_require_feature_access($db, $user, 'job_posting');
        $data = json_decode(file_get_contents('php://input'), true);

        $title = isset($data['title']) ? trim((string) $data['title']) : '';
        $company = isset($data['company']) ? trim((string) $data['company']) : '';
        $description = isset($data['description']) ? trim((string) $data['description']) : '';

        if ($title === '' || $company === '' || $description === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'title, company, and description are required']);
            exit;
        }

        $location = isset($data['location']) ? trim((string) $data['location']) : null;
        $jobType = isset($data['job_type']) ? trim((string) $data['job_type']) : 'full_time';
        $industry = isset($data['industry']) ? trim((string) $data['industry']) : null;
        $qualifications = isset($data['qualifications']) ? trim((string) $data['qualifications']) : null;
        $requiredSkills = isset($data['required_skills']) ? trim((string) $data['required_skills']) : null;
        $applicationDeadline = isset($data['application_deadline']) ? trim((string) $data['application_deadline']) : null;
        $applicationMethod = isset($data['application_method']) ? trim((string) $data['application_method']) : null;

        $allowedTypes = ['full_time', 'part_time', 'contract', 'internship', 'remote'];
        if (!in_array($jobType, $allowedTypes, true)) {
            $jobType = 'full_time';
        }

        $insertQuery = "INSERT INTO job_posts
                        (posted_by_account_id, title, company, location, job_type, industry, description, qualifications, required_skills, application_deadline, application_method)
                        VALUES
                        (:posted_by_account_id, :title, :company, :location, :job_type, :industry, :description, :qualifications, :required_skills, :application_deadline, :application_method)";

        $stmt = $db->prepare($insertQuery);
        $stmt->bindParam(':posted_by_account_id', $user['account_id']);
        $stmt->bindParam(':title', $title);
        $stmt->bindParam(':company', $company);
        $stmt->bindParam(':location', $location);
        $stmt->bindParam(':job_type', $jobType);
        $stmt->bindParam(':industry', $industry);
        $stmt->bindParam(':description', $description);
        $stmt->bindParam(':qualifications', $qualifications);
        $stmt->bindParam(':required_skills', $requiredSkills);
        $stmt->bindParam(':application_deadline', $applicationDeadline);
        $stmt->bindParam(':application_method', $applicationMethod);
        $stmt->execute();

        echo json_encode([
            'success' => true,
            'message' => 'Job post created successfully',
            'id' => (int) $db->lastInsertId()
        ]);
        exit;
    }

    if ($method === 'PUT') {
        $user = gradtrack_require_graduate_auth($db);
        gradtrack_require_feature_access($db, $user, 'job_posting');
        $data = json_decode(file_get_contents('php://input'), true);

        $jobId = isset($data['id']) ? (int) $data['id'] : 0;
        if ($jobId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'id is required']);
            exit;
        }

        $ownerStmt = $db->prepare('SELECT posted_by_account_id FROM job_posts WHERE id = :id');
        $ownerStmt->bindParam(':id', $jobId);
        $ownerStmt->execute();
        $owner = $ownerStmt->fetch(PDO::FETCH_ASSOC);

        if (!$owner) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Job post not found']);
            exit;
        }

        if ((int) $owner['posted_by_account_id'] !== $user['account_id']) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only the poster can update this job']);
            exit;
        }

        $title = isset($data['title']) ? trim((string) $data['title']) : '';
        $company = isset($data['company']) ? trim((string) $data['company']) : '';
        $description = isset($data['description']) ? trim((string) $data['description']) : '';

        if ($title === '' || $company === '' || $description === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'title, company, and description are required']);
            exit;
        }

        $location = isset($data['location']) ? trim((string) $data['location']) : null;
        $jobType = isset($data['job_type']) ? trim((string) $data['job_type']) : 'full_time';
        $industry = isset($data['industry']) ? trim((string) $data['industry']) : null;
        $qualifications = isset($data['qualifications']) ? trim((string) $data['qualifications']) : null;
        $requiredSkills = isset($data['required_skills']) ? trim((string) $data['required_skills']) : null;
        $applicationDeadline = isset($data['application_deadline']) ? trim((string) $data['application_deadline']) : null;
        $applicationMethod = isset($data['application_method']) ? trim((string) $data['application_method']) : null;
        $isActive = isset($data['is_active']) ? (int) !!$data['is_active'] : 1;

        $allowedTypes = ['full_time', 'part_time', 'contract', 'internship', 'remote'];
        if (!in_array($jobType, $allowedTypes, true)) {
            $jobType = 'full_time';
        }

        $updateQuery = "UPDATE job_posts
                        SET title = :title,
                            company = :company,
                            location = :location,
                            job_type = :job_type,
                            industry = :industry,
                            description = :description,
                            qualifications = :qualifications,
                            required_skills = :required_skills,
                            application_deadline = :application_deadline,
                            application_method = :application_method,
                            is_active = :is_active
                        WHERE id = :id";

        $updateStmt = $db->prepare($updateQuery);
        $updateStmt->bindParam(':id', $jobId);
        $updateStmt->bindParam(':title', $title);
        $updateStmt->bindParam(':company', $company);
        $updateStmt->bindParam(':location', $location);
        $updateStmt->bindParam(':job_type', $jobType);
        $updateStmt->bindParam(':industry', $industry);
        $updateStmt->bindParam(':description', $description);
        $updateStmt->bindParam(':qualifications', $qualifications);
        $updateStmt->bindParam(':required_skills', $requiredSkills);
        $updateStmt->bindParam(':application_deadline', $applicationDeadline);
        $updateStmt->bindParam(':application_method', $applicationMethod);
        $updateStmt->bindParam(':is_active', $isActive);
        $updateStmt->execute();

        echo json_encode(['success' => true, 'message' => 'Job post updated successfully']);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
