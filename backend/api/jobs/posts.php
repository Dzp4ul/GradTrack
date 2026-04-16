<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/alumni_rating.php';
require_once __DIR__ . '/../config/engagement_approval.php';

function gradtrack_jobs_request_data(): array
{
    $contentType = isset($_SERVER['CONTENT_TYPE']) ? strtolower((string) $_SERVER['CONTENT_TYPE']) : '';
    if (strpos($contentType, 'multipart/form-data') !== false) {
        return $_POST;
    }

    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function gradtrack_jobs_upload_base_dir(): string
{
    $base = realpath(__DIR__ . '/../../');
    if ($base === false) {
        throw new RuntimeException('Unable to resolve backend upload directory');
    }
    return $base . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'job-requirements';
}

function gradtrack_jobs_upload_job_dir(int $jobId): string
{
    return gradtrack_jobs_upload_base_dir() . DIRECTORY_SEPARATOR . $jobId;
}

function gradtrack_jobs_requirements_metadata_path(int $jobId): string
{
    return gradtrack_jobs_upload_job_dir($jobId) . DIRECTORY_SEPARATOR . 'metadata.json';
}

function gradtrack_jobs_requirements_relative_path(int $jobId, string $storedName): string
{
    return 'uploads/job-requirements/' . $jobId . '/' . $storedName;
}

function gradtrack_jobs_ensure_dir(string $dir): void
{
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
}

function gradtrack_jobs_cleanup_job_dir(int $jobId): void
{
    $jobDir = gradtrack_jobs_upload_job_dir($jobId);
    if (!is_dir($jobDir)) {
        return;
    }

    $items = scandir($jobDir);
    if ($items === false) {
        return;
    }

    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $path = $jobDir . DIRECTORY_SEPARATOR . $item;
        if (is_file($path)) {
            @unlink($path);
        }
    }

    @rmdir($jobDir);
}

function gradtrack_jobs_remove_requirements_file(int $jobId): void
{
    gradtrack_jobs_cleanup_job_dir($jobId);
}

function gradtrack_jobs_sanitize_filename(string $name): string
{
    $safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', $name);
    return $safe ?: ('requirements_' . time());
}

function gradtrack_jobs_save_requirements_file(int $jobId, array $file): array
{
    $errorCode = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($errorCode === UPLOAD_ERR_NO_FILE) {
        throw new RuntimeException('No requirements file was uploaded');
    }
    if ($errorCode !== UPLOAD_ERR_OK) {
        throw new RuntimeException('Requirements file upload failed');
    }

    $tmpPath = (string) ($file['tmp_name'] ?? '');
    if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
        throw new RuntimeException('Invalid uploaded requirements file');
    }

    $fileSize = (int) ($file['size'] ?? 0);
    $maxSizeBytes = 10 * 1024 * 1024;
    if ($fileSize <= 0 || $fileSize > $maxSizeBytes) {
        throw new RuntimeException('Requirements file must be between 1 byte and 10 MB');
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($tmpPath) ?: 'application/octet-stream';
    $allowedMimes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/png',
        'image/jpeg',
    ];

    if (!in_array($mimeType, $allowedMimes, true)) {
        throw new RuntimeException('Unsupported requirements file type. Allowed: PDF, DOC, DOCX, PNG, JPG');
    }

    $originalName = (string) ($file['name'] ?? 'requirements');
    $safeName = gradtrack_jobs_sanitize_filename($originalName);
    $extension = strtolower((string) pathinfo($safeName, PATHINFO_EXTENSION));
    $storedName = uniqid('requirements_', true) . ($extension !== '' ? ('.' . $extension) : '');

    $jobDir = gradtrack_jobs_upload_job_dir($jobId);
    gradtrack_jobs_ensure_dir($jobDir);

    $existing = scandir($jobDir);
    if ($existing !== false) {
        foreach ($existing as $item) {
            if ($item === '.' || $item === '..' || $item === 'metadata.json') {
                continue;
            }
            $itemPath = $jobDir . DIRECTORY_SEPARATOR . $item;
            if (is_file($itemPath)) {
                @unlink($itemPath);
            }
        }
    }

    $destinationPath = $jobDir . DIRECTORY_SEPARATOR . $storedName;
    if (!move_uploaded_file($tmpPath, $destinationPath)) {
        throw new RuntimeException('Failed to save uploaded requirements file');
    }

    $relativePath = gradtrack_jobs_requirements_relative_path($jobId, $storedName);
    $metadata = [
        'relative_path' => $relativePath,
        'file_name' => $originalName,
        'mime_type' => $mimeType,
        'file_size_bytes' => $fileSize,
        'uploaded_at' => date('c'),
    ];

    $metadataPath = gradtrack_jobs_requirements_metadata_path($jobId);
    file_put_contents($metadataPath, json_encode($metadata, JSON_UNESCAPED_SLASHES));

    return $metadata;
}

function gradtrack_jobs_read_requirements_file(int $jobId): ?array
{
    $metadataPath = gradtrack_jobs_requirements_metadata_path($jobId);
    if (!is_file($metadataPath)) {
        return null;
    }

    $content = file_get_contents($metadataPath);
    if ($content === false) {
        return null;
    }

    $decoded = json_decode($content, true);
    if (!is_array($decoded) || empty($decoded['relative_path'])) {
        return null;
    }

    $absolute = realpath(__DIR__ . '/../../') . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, (string) $decoded['relative_path']);
    if (!is_file($absolute)) {
        return null;
    }

    return $decoded;
}

function gradtrack_jobs_attach_requirements_data(array &$row): void
{
    $jobId = isset($row['id']) ? (int) $row['id'] : 0;
    $requirements = $jobId > 0 ? gradtrack_jobs_read_requirements_file($jobId) : null;

    $row['requirements_file_path'] = $requirements['relative_path'] ?? null;
    $row['requirements_file_name'] = $requirements['file_name'] ?? null;
    $row['requirements_mime_type'] = $requirements['mime_type'] ?? null;
    $row['requirements_file_size_bytes'] = isset($requirements['file_size_bytes']) ? (int) $requirements['file_size_bytes'] : null;
}

function gradtrack_jobs_str_or_null(array $data, string $key): ?string
{
    if (!isset($data[$key])) {
        return null;
    }
    $value = trim((string) $data[$key]);
    return $value !== '' ? $value : null;
}

function gradtrack_jobs_ensure_schema(PDO $db): void
{
    $columns = [
        'salary_range' => "ALTER TABLE job_posts ADD salary_range VARCHAR(120) NULL AFTER location",
        'course_program_fit' => "ALTER TABLE job_posts ADD course_program_fit VARCHAR(255) NULL AFTER required_skills",
        'contact_email' => "ALTER TABLE job_posts ADD contact_email VARCHAR(180) NULL AFTER application_deadline",
        'application_link' => "ALTER TABLE job_posts ADD application_link VARCHAR(255) NULL AFTER contact_email",
    ];

    foreach ($columns as $column => $alterSql) {
        $stmt = $db->prepare('SHOW COLUMNS FROM job_posts LIKE :column_name');
        $stmt->execute([':column_name' => $column]);

        if (!$stmt->fetch(PDO::FETCH_ASSOC)) {
            $db->exec($alterSql);
        }
    }
}

function gradtrack_jobs_validate_contact_email(?string $email): void
{
    if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Please provide a valid contact email']);
        exit;
    }
}

function gradtrack_jobs_normalize_application_link(?string $link): ?string
{
    if ($link === null) {
        return null;
    }

    $normalized = preg_match('/^https?:\/\//i', $link) ? $link : 'https://' . $link;
    if (!filter_var($normalized, FILTER_VALIDATE_URL)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Please provide a valid application link']);
        exit;
    }

    return $normalized;
}

function gradtrack_jobs_require_application_contact(?string $contactEmail, ?string $applicationLink, ?string $applicationMethod): void
{
    if ($contactEmail === null && $applicationLink === null && $applicationMethod === null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Add a contact email, application link, or contact details']);
        exit;
    }
}

$database = new Database();
$db = $database->getConnection();
gradtrack_jobs_ensure_schema($db);
gradtrack_ensure_engagement_approval_schema($db);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST' && isset($_POST['_method']) && strtoupper((string) $_POST['_method']) === 'PUT') {
    $method = 'PUT';
}

try {
    if ($method === 'GET') {
        $jobId = isset($_GET['id']) ? (int) $_GET['id'] : 0;
        $mineOnly = isset($_GET['mine']) && $_GET['mine'] === '1';

        if ($jobId > 0) {
            $detailQuery = "SELECT jp.*, g.first_name, g.last_name, ga.email AS poster_email,
                                   p.name AS poster_program_name, p.code AS poster_program_code
                            FROM job_posts jp
                            JOIN graduate_accounts ga ON jp.posted_by_account_id = ga.id
                            JOIN graduates g ON ga.graduate_id = g.id
                            LEFT JOIN programs p ON g.program_id = p.id
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

            $currentUser = gradtrack_current_graduate_user($db);
            $isOwner = $currentUser && (int) $job['posted_by_account_id'] === (int) $currentUser['account_id'];
            if (($job['approval_status'] ?? 'approved') !== 'approved' && !$isOwner) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Job not found']);
                exit;
            }

            $job['id'] = (int) $job['id'];
            $job['posted_by_account_id'] = (int) $job['posted_by_account_id'];
            $job['is_active'] = (int) $job['is_active'];
            gradtrack_jobs_attach_requirements_data($job);

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

        $sql = "SELECT jp.id, jp.title, jp.company, jp.location, jp.salary_range, jp.job_type, jp.industry,
                       jp.description, jp.required_skills, jp.course_program_fit,
                       jp.application_deadline, jp.contact_email, jp.application_link, jp.application_method,
                       jp.is_active, jp.approval_status, jp.approval_reviewed_at, jp.approval_notes, jp.created_at,
                       g.first_name, g.last_name,
                       p.name AS poster_program_name, p.code AS poster_program_code
                FROM job_posts jp
                JOIN graduate_accounts ga ON jp.posted_by_account_id = ga.id
                JOIN graduates g ON ga.graduate_id = g.id
                LEFT JOIN programs p ON g.program_id = p.id
                WHERE 1=1";

        $params = [];

        if ($activeOnly) {
            $sql .= ' AND jp.is_active = 1';
        }

        if (!$mineOnly) {
            $sql .= " AND jp.approval_status = 'approved'";
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
                OR jp.salary_range LIKE :search5
                OR jp.course_program_fit LIKE :search6
                OR jp.contact_email LIKE :search7
                OR jp.application_link LIKE :search8
            )";
            $params[':search'] = '%' . $search . '%';
            $params[':search2'] = '%' . $search . '%';
            $params[':search3'] = '%' . $search . '%';
            $params[':search4'] = '%' . $search . '%';
            $params[':search5'] = '%' . $search . '%';
            $params[':search6'] = '%' . $search . '%';
            $params[':search7'] = '%' . $search . '%';
            $params[':search8'] = '%' . $search . '%';
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
            gradtrack_jobs_attach_requirements_data($row);
        }

        echo json_encode(['success' => true, 'data' => $rows]);
        exit;
    }

    if ($method === 'POST') {
        $user = gradtrack_require_graduate_auth($db);
        gradtrack_require_feature_access($db, $user, 'job_posting');
        $data = gradtrack_jobs_request_data();

        $title = isset($data['title']) ? trim((string) $data['title']) : '';
        $company = isset($data['company']) ? trim((string) $data['company']) : '';
        $description = isset($data['description']) ? trim((string) $data['description']) : '';

        if ($title === '' || $company === '' || $description === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'title, company, and description are required']);
            exit;
        }

        $location = gradtrack_jobs_str_or_null($data, 'location');
        $jobType = isset($data['job_type']) ? trim((string) $data['job_type']) : 'full_time';
        $industry = gradtrack_jobs_str_or_null($data, 'industry');
        $salaryRange = gradtrack_jobs_str_or_null($data, 'salary_range');
        $qualifications = gradtrack_jobs_str_or_null($data, 'qualifications');
        $requiredSkills = gradtrack_jobs_str_or_null($data, 'required_skills');
        $courseProgramFit = gradtrack_jobs_str_or_null($data, 'course_program_fit');
        $applicationDeadline = gradtrack_jobs_str_or_null($data, 'application_deadline');
        $contactEmail = gradtrack_jobs_str_or_null($data, 'contact_email');
        $applicationLink = gradtrack_jobs_normalize_application_link(gradtrack_jobs_str_or_null($data, 'application_link'));
        $applicationMethod = gradtrack_jobs_str_or_null($data, 'application_method');
        gradtrack_jobs_validate_contact_email($contactEmail);
        gradtrack_jobs_require_application_contact($contactEmail, $applicationLink, $applicationMethod);

        $allowedTypes = ['full_time', 'part_time', 'contract', 'internship', 'remote'];
        if (!in_array($jobType, $allowedTypes, true)) {
            $jobType = 'full_time';
        }

        $insertQuery = "INSERT INTO job_posts
                        (posted_by_account_id, title, company, location, salary_range, job_type, industry, description, qualifications, required_skills, course_program_fit, application_deadline, contact_email, application_link, application_method, approval_status)
                        VALUES
                        (:posted_by_account_id, :title, :company, :location, :salary_range, :job_type, :industry, :description, :qualifications, :required_skills, :course_program_fit, :application_deadline, :contact_email, :application_link, :application_method, 'pending')";

        $stmt = $db->prepare($insertQuery);
        $stmt->bindParam(':posted_by_account_id', $user['account_id']);
        $stmt->bindParam(':title', $title);
        $stmt->bindParam(':company', $company);
        $stmt->bindParam(':location', $location);
        $stmt->bindParam(':salary_range', $salaryRange);
        $stmt->bindParam(':job_type', $jobType);
        $stmt->bindParam(':industry', $industry);
        $stmt->bindParam(':description', $description);
        $stmt->bindParam(':qualifications', $qualifications);
        $stmt->bindParam(':required_skills', $requiredSkills);
        $stmt->bindParam(':course_program_fit', $courseProgramFit);
        $stmt->bindParam(':application_deadline', $applicationDeadline);
        $stmt->bindParam(':contact_email', $contactEmail);
        $stmt->bindParam(':application_link', $applicationLink);
        $stmt->bindParam(':application_method', $applicationMethod);
        $stmt->execute();

        $newJobId = (int) $db->lastInsertId();
        if (isset($_FILES['requirements_file'])) {
            $fileError = (int) ($_FILES['requirements_file']['error'] ?? UPLOAD_ERR_NO_FILE);
            if ($fileError !== UPLOAD_ERR_NO_FILE) {
                gradtrack_jobs_save_requirements_file($newJobId, $_FILES['requirements_file']);
            }
        }

        echo json_encode([
            'success' => true,
            'message' => 'Job post submitted for approval',
            'id' => $newJobId,
            'approval_status' => 'pending'
        ]);
        exit;
    }

    if ($method === 'PUT') {
        $user = gradtrack_require_graduate_auth($db);
        gradtrack_require_feature_access($db, $user, 'job_posting');
        $data = gradtrack_jobs_request_data();

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

        $location = gradtrack_jobs_str_or_null($data, 'location');
        $jobType = isset($data['job_type']) ? trim((string) $data['job_type']) : 'full_time';
        $industry = gradtrack_jobs_str_or_null($data, 'industry');
        $salaryRange = gradtrack_jobs_str_or_null($data, 'salary_range');
        $qualifications = gradtrack_jobs_str_or_null($data, 'qualifications');
        $requiredSkills = gradtrack_jobs_str_or_null($data, 'required_skills');
        $courseProgramFit = gradtrack_jobs_str_or_null($data, 'course_program_fit');
        $applicationDeadline = gradtrack_jobs_str_or_null($data, 'application_deadline');
        $contactEmail = gradtrack_jobs_str_or_null($data, 'contact_email');
        $applicationLink = gradtrack_jobs_normalize_application_link(gradtrack_jobs_str_or_null($data, 'application_link'));
        $applicationMethod = gradtrack_jobs_str_or_null($data, 'application_method');
        gradtrack_jobs_validate_contact_email($contactEmail);
        gradtrack_jobs_require_application_contact($contactEmail, $applicationLink, $applicationMethod);
        $isActive = isset($data['is_active']) ? (int) ((string) $data['is_active'] === '1' || (string) $data['is_active'] === 'true') : 1;
        $removeRequirementsFile = isset($data['remove_requirements_file'])
            && ((string) $data['remove_requirements_file'] === '1' || (string) $data['remove_requirements_file'] === 'true');

        $allowedTypes = ['full_time', 'part_time', 'contract', 'internship', 'remote'];
        if (!in_array($jobType, $allowedTypes, true)) {
            $jobType = 'full_time';
        }

        $updateQuery = "UPDATE job_posts
                        SET title = :title,
                            company = :company,
                            location = :location,
                            salary_range = :salary_range,
                            job_type = :job_type,
                            industry = :industry,
                            description = :description,
                            qualifications = :qualifications,
                            required_skills = :required_skills,
                            course_program_fit = :course_program_fit,
                            application_deadline = :application_deadline,
                            contact_email = :contact_email,
                            application_link = :application_link,
                            application_method = :application_method,
                            is_active = :is_active,
                            approval_status = 'pending',
                            approval_reviewed_by = NULL,
                            approval_reviewed_at = NULL,
                            approval_notes = NULL
                        WHERE id = :id";

        $updateStmt = $db->prepare($updateQuery);
        $updateStmt->bindParam(':id', $jobId);
        $updateStmt->bindParam(':title', $title);
        $updateStmt->bindParam(':company', $company);
        $updateStmt->bindParam(':location', $location);
        $updateStmt->bindParam(':salary_range', $salaryRange);
        $updateStmt->bindParam(':job_type', $jobType);
        $updateStmt->bindParam(':industry', $industry);
        $updateStmt->bindParam(':description', $description);
        $updateStmt->bindParam(':qualifications', $qualifications);
        $updateStmt->bindParam(':required_skills', $requiredSkills);
        $updateStmt->bindParam(':course_program_fit', $courseProgramFit);
        $updateStmt->bindParam(':application_deadline', $applicationDeadline);
        $updateStmt->bindParam(':contact_email', $contactEmail);
        $updateStmt->bindParam(':application_link', $applicationLink);
        $updateStmt->bindParam(':application_method', $applicationMethod);
        $updateStmt->bindParam(':is_active', $isActive);
        $updateStmt->execute();

        if ($removeRequirementsFile) {
            gradtrack_jobs_remove_requirements_file($jobId);
        }

        if (isset($_FILES['requirements_file'])) {
            $fileError = (int) ($_FILES['requirements_file']['error'] ?? UPLOAD_ERR_NO_FILE);
            if ($fileError !== UPLOAD_ERR_NO_FILE) {
                gradtrack_jobs_save_requirements_file($jobId, $_FILES['requirements_file']);
            }
        }

        echo json_encode(['success' => true, 'message' => 'Job post submitted for approval', 'approval_status' => 'pending']);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
