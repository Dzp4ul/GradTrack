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
        if (isset($_GET['mine']) && $_GET['mine'] === '1') {
            $user = gradtrack_require_graduate_auth($db);

            $mineQuery = "SELECT m.*, p.name AS program_name, p.code AS program_code,
                                 g.first_name, g.middle_name, g.last_name, g.year_graduated
                          FROM mentors m
                          JOIN graduates g ON m.graduate_id = g.id
                          LEFT JOIN programs p ON g.program_id = p.id
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
        $yearGraduated = isset($_GET['year_graduated']) && is_numeric($_GET['year_graduated'])
            ? (int) $_GET['year_graduated']
            : null;

        $sql = "SELECT m.id, m.current_job_title, m.company, m.industry, m.skills, m.bio,
                       m.availability_status, m.preferred_topics, m.created_at,
                       g.id AS graduate_id, g.first_name, g.middle_name, g.last_name, g.year_graduated,
                       p.name AS program_name, p.code AS program_code,
                       COALESCE(AVG(mf.rating), 0) AS avg_rating,
                       COUNT(mf.id) AS feedback_count
                FROM mentors m
                JOIN graduates g ON m.graduate_id = g.id
                LEFT JOIN programs p ON g.program_id = p.id
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
            )";
            $params[':search'] = '%' . $search . '%';
            $params[':search2'] = '%' . $search . '%';
            $params[':search3'] = '%' . $search . '%';
            $params[':search4'] = '%' . $search . '%';
            $params[':search5'] = '%' . $search . '%';
        }

        if ($industry !== '') {
            $sql .= ' AND m.industry LIKE :industry';
            $params[':industry'] = '%' . $industry . '%';
        }

        if ($skills !== '') {
            $sql .= ' AND m.skills LIKE :skills';
            $params[':skills'] = '%' . $skills . '%';
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
        gradtrack_require_alumni_score($db, $user, 70, 'Mentor registration');
        $data = json_decode(file_get_contents('php://input'), true);

        $currentJobTitle = isset($data['current_job_title']) ? trim((string) $data['current_job_title']) : null;
        $company = isset($data['company']) ? trim((string) $data['company']) : null;
        $industry = isset($data['industry']) ? trim((string) $data['industry']) : null;
        $skills = isset($data['skills']) ? trim((string) $data['skills']) : null;
        $bio = isset($data['bio']) ? trim((string) $data['bio']) : null;
        $availability = isset($data['availability_status']) ? trim((string) $data['availability_status']) : 'available';
        $preferredTopics = isset($data['preferred_topics']) ? trim((string) $data['preferred_topics']) : null;
        $isActive = isset($data['is_active']) ? (int) !!$data['is_active'] : 1;

        $allowedAvailability = ['available', 'busy', 'unavailable'];
        if (!in_array($availability, $allowedAvailability, true)) {
            $availability = 'available';
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
            $updateStmt->bindParam(':skills', $skills);
            $updateStmt->bindParam(':bio', $bio);
            $updateStmt->bindParam(':availability_status', $availability);
            $updateStmt->bindParam(':preferred_topics', $preferredTopics);
            $updateStmt->bindParam(':is_active', $isActive);
            $updateStmt->execute();
        } else {
            $insertQuery = "INSERT INTO mentors
                            (graduate_account_id, graduate_id, current_job_title, company, industry, skills, bio, availability_status, preferred_topics, is_active)
                            VALUES
                            (:account_id, :graduate_id, :current_job_title, :company, :industry, :skills, :bio, :availability_status, :preferred_topics, :is_active)";
            $insertStmt = $db->prepare($insertQuery);
            $insertStmt->bindParam(':account_id', $user['account_id']);
            $insertStmt->bindParam(':graduate_id', $user['graduate_id']);
            $insertStmt->bindParam(':current_job_title', $currentJobTitle);
            $insertStmt->bindParam(':company', $company);
            $insertStmt->bindParam(':industry', $industry);
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
