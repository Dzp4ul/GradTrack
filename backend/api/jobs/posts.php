<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/alumni_rating.php';
require_once __DIR__ . '/../config/engagement_approval.php';
require_once __DIR__ . '/../config/audit_trail.php';
require_once __DIR__ . '/../config/storage.php';
require_once __DIR__ . '/../config/admin_auth.php';
require_once __DIR__ . '/../config/admin_roles.php';
require_once __DIR__ . '/../config/realtime.php';

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

function gradtrack_jobs_current_actor(PDO $db): ?array
{
    $graduate = gradtrack_current_graduate_user($db);
    if ($graduate) {
        return ['type' => 'graduate', 'id' => (int) $graduate['account_id'], 'user' => $graduate];
    }

    $admin = gradtrack_current_admin_user($db);
    if ($admin && in_array((string) ($admin['role'] ?? ''), gradtrack_job_posting_admin_roles(), true)) {
        return ['type' => 'admin', 'id' => (int) $admin['id'], 'user' => $admin];
    }

    return null;
}

function gradtrack_jobs_require_actor(PDO $db): array
{
    $actor = gradtrack_jobs_current_actor($db);
    if (!$actor) {
        $admin = gradtrack_current_admin_user($db);
        $status = $admin === null ? 401 : 403;
        http_response_code($status);
        echo json_encode([
            'success' => false,
            'error' => $admin === null
                ? 'Graduate or authorized personnel authentication required'
                : 'Your personnel role is not authorized to manage job postings',
        ]);
        exit;
    }
    return $actor;
}

function gradtrack_jobs_actor_can_auto_approve(array $actor): bool
{
    return $actor['type'] === 'admin'
        && in_array((string) ($actor['user']['role'] ?? ''), gradtrack_job_posting_auto_approval_roles(), true);
}

function gradtrack_jobs_select_sql(): string
{
    return "SELECT jp.id, jp.posted_by_account_id, jp.created_by_admin_id, jp.title, jp.company, jp.location,
                   jp.salary_range, jp.job_type, jp.industry, jp.description, jp.qualifications,
                   jp.required_skills, jp.course_program_fit, jp.application_deadline, jp.contact_email,
                   jp.application_link, jp.application_method, jp.requirements_file_path,
                   jp.requirements_file_name, jp.requirements_mime_type, jp.requirements_file_size_bytes,
                   jp.requirements_uploaded_at, jp.is_active, jp.approval_status, jp.approval_reviewed_at,
                   jp.approval_notes, jp.created_at, jp.updated_at,
                   ga.id AS poster_account_id, ga.email AS poster_email, g.id AS poster_graduate_id,
                   COALESCE(NULLIF(gp.first_name, ''), g.first_name) AS first_name,
                   COALESCE(NULLIF(gp.middle_name, ''), g.middle_name) AS middle_name,
                   COALESCE(NULLIF(gp.last_name, ''), g.last_name) AS last_name,
                   COALESCE(
                       NULLIF(TRIM(CONCAT_WS(' ', gp.first_name, gp.middle_name, gp.last_name)), ''),
                       NULLIF(TRIM(CONCAT_WS(' ', g.first_name, g.middle_name, g.last_name)), ''),
                       NULLIF(TRIM(admin.full_name), ''),
                       'GradTrack Personnel'
                   ) AS poster_full_name,
                   COALESCE(NULLIF(gp.program_course, ''), p.name) AS poster_program_name,
                   p.code AS poster_program_code, gpi.file_path AS poster_profile_image_path
            FROM job_posts jp
            LEFT JOIN graduate_accounts ga ON jp.posted_by_account_id = ga.id
            LEFT JOIN graduates g ON ga.graduate_id = g.id
            LEFT JOIN graduate_profiles gp ON gp.graduate_account_id = ga.id
            LEFT JOIN programs p ON g.program_id = p.id
            LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
            LEFT JOIN admin_users admin ON admin.id = jp.created_by_admin_id";
}

function gradtrack_jobs_find(PDO $db, int $jobId, bool $canAccessPrivateFile = true): ?array
{
    $stmt = $db->prepare(gradtrack_jobs_select_sql() . ' WHERE jp.id = :id LIMIT 1');
    $stmt->execute([':id' => $jobId]);
    $job = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$job) {
        return null;
    }
    gradtrack_jobs_normalize_row($job, $canAccessPrivateFile);
    return $job;
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

function gradtrack_jobs_remove_requirements_file(int $jobId, ?string $storageReference = null): void
{
    if ($storageReference !== null) {
        gradtrack_storage_delete_quietly($storageReference);
    }
    $metadataPath = gradtrack_jobs_requirements_metadata_path($jobId);
    if (is_file($metadataPath)) {
        @unlink($metadataPath);
    }

    $jobDir = gradtrack_jobs_upload_job_dir($jobId);
    if (is_dir($jobDir) && empty(array_diff(scandir($jobDir) ?: [], ['.', '..']))) {
        @rmdir($jobDir);
    }
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
        'application/pdf' => ['extension' => 'pdf', 'extensions' => ['pdf']],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => ['extension' => 'docx', 'extensions' => ['docx']],
        'image/png' => ['extension' => 'png', 'extensions' => ['png']],
        'image/jpeg' => ['extension' => 'jpg', 'extensions' => ['jpg', 'jpeg']],
    ];

    if (!isset($allowedMimes[$mimeType])) {
        throw new RuntimeException('Unsupported requirements file type. Allowed: PDF, DOCX, PNG, JPG');
    }

    $originalName = gradtrack_storage_safe_download_name((string) ($file['name'] ?? 'requirements'));
    if (gradtrack_storage_filename_has_dangerous_segment($originalName)) {
        throw new RuntimeException('Requirements filename is not allowed');
    }
    $submittedExtension = strtolower((string) pathinfo($originalName, PATHINFO_EXTENSION));
    $mimeConfig = $allowedMimes[$mimeType];
    if (!in_array($submittedExtension, $mimeConfig['extensions'], true)) {
        throw new RuntimeException('Requirements file extension does not match its content');
    }

    if (strpos($mimeType, 'image/') === 0) {
        $imageInfo = @getimagesize($tmpPath);
        if ($imageInfo === false || (int) $imageInfo[0] < 1 || (int) $imageInfo[1] < 1
            || (int) $imageInfo[0] > 8192 || (int) $imageInfo[1] > 8192) {
            throw new RuntimeException('Requirements image is malformed or has unsafe dimensions');
        }
    }

    if ($mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        if (!class_exists('ZipArchive')) {
            throw new RuntimeException('DOCX validation is unavailable on this server');
        }
        $archive = new ZipArchive();
        if ($archive->open($tmpPath) !== true) {
            throw new RuntimeException('Requirements DOCX file is malformed');
        }
        $hasMacro = $archive->locateName('word/vbaProject.bin', ZipArchive::FL_NOCASE) !== false;
        $archive->close();
        if ($hasMacro) {
            throw new RuntimeException('Macro-enabled Office documents are not allowed');
        }
    }

    $storedName = gradtrack_storage_uuid_filename((string) $mimeConfig['extension']);
    $storageResult = gradtrack_storage_put_file(
        $tmpPath,
        'private/job-support/job-posts/' . $jobId . '/requirements/' . $storedName,
        gradtrack_jobs_requirements_relative_path($jobId, $storedName),
        $mimeType,
        ['category' => 'job-requirement', 'job-id' => (string) $jobId]
    );
    $relativePath = (string) $storageResult['reference'];
    $metadata = [
        'requirements_file_path' => $relativePath,
        'requirements_file_name' => $originalName,
        'requirements_mime_type' => $mimeType,
        'requirements_file_size_bytes' => $fileSize,
        'requirements_uploaded_at' => date('Y-m-d H:i:s'),
    ];

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

function gradtrack_jobs_attach_requirements_data(array &$row, bool $canAccessPrivateFile): void
{
    $jobId = isset($row['id']) ? (int) $row['id'] : 0;
    $legacy = empty($row['requirements_file_path']) && $jobId > 0 ? gradtrack_jobs_read_requirements_file($jobId) : null;

    if ($legacy) {
        $row['requirements_file_path'] = $legacy['relative_path'] ?? null;
        $row['requirements_file_name'] = $legacy['file_name'] ?? null;
        $row['requirements_mime_type'] = $legacy['mime_type'] ?? null;
        $row['requirements_file_size_bytes'] = isset($legacy['file_size_bytes']) ? (int) $legacy['file_size_bytes'] : null;
    }

    $rawReference = $row['requirements_file_path'] ?? null;
    $row['requirements_file_path'] = $canAccessPrivateFile
        ? gradtrack_storage_access_reference(
            $rawReference,
            $row['requirements_file_name'] ?? null,
            $row['requirements_mime_type'] ?? null,
            true
        )
        : null;
    $row['requirements_file_size_bytes'] = isset($row['requirements_file_size_bytes'])
        ? (int) $row['requirements_file_size_bytes']
        : null;
}

function gradtrack_jobs_normalize_row(array &$row, bool $canAccessPrivateFile = false): void
{
    $row['id'] = isset($row['id']) ? (int) $row['id'] : 0;
    $row['is_active'] = isset($row['is_active']) ? (int) $row['is_active'] : 0;

    foreach (['posted_by_account_id', 'created_by_admin_id', 'poster_account_id', 'poster_graduate_id'] as $idKey) {
        $row[$idKey] = isset($row[$idKey]) ? (int) $row[$idKey] : null;
    }

    $nameParts = [
        trim((string) ($row['first_name'] ?? '')),
        trim((string) ($row['middle_name'] ?? '')),
        trim((string) ($row['last_name'] ?? '')),
    ];
    $fallbackName = trim(preg_replace('/\s+/', ' ', implode(' ', array_filter($nameParts))) ?? '');
    $posterName = trim((string) ($row['poster_full_name'] ?? ''));
    $row['poster_full_name'] = $posterName !== '' ? $posterName : $fallbackName;
    $row['poster_profile_image_path'] = gradtrack_storage_media_access_reference($row['poster_profile_image_path'] ?? null);

    gradtrack_jobs_attach_requirements_data($row, $canAccessPrivateFile);
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
    if (!gradtrack_runtime_schema_changes_allowed()) return;
    $columns = [
        'salary_range' => "ALTER TABLE job_posts ADD salary_range VARCHAR(120) NULL AFTER location",
        'course_program_fit' => "ALTER TABLE job_posts ADD course_program_fit VARCHAR(255) NULL AFTER required_skills",
        'contact_email' => "ALTER TABLE job_posts ADD contact_email VARCHAR(180) NULL AFTER application_deadline",
        'application_link' => "ALTER TABLE job_posts ADD application_link VARCHAR(255) NULL AFTER contact_email",
        'created_by_admin_id' => "ALTER TABLE job_posts ADD created_by_admin_id INT NULL AFTER posted_by_account_id",
    ];

    foreach ($columns as $column => $alterSql) {
        $stmt = $db->prepare("SELECT COUNT(*) AS total
                              FROM INFORMATION_SCHEMA.COLUMNS
                              WHERE TABLE_SCHEMA = DATABASE()
                                AND TABLE_NAME = 'job_posts'
                                AND COLUMN_NAME = :column_name");
        $stmt->execute([':column_name' => $column]);

        if ((int) ($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0) === 0) {
            $db->exec($alterSql);
        }
    }

    $postedByStmt = $db->query("SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
                                WHERE TABLE_SCHEMA = DATABASE()
                                  AND TABLE_NAME = 'job_posts'
                                  AND COLUMN_NAME = 'posted_by_account_id'
                                LIMIT 1");
    $postedByColumn = $postedByStmt ? $postedByStmt->fetch(PDO::FETCH_ASSOC) : false;
    if ($postedByColumn && strtoupper((string) ($postedByColumn['IS_NULLABLE'] ?? 'NO')) !== 'YES') {
        $db->exec('ALTER TABLE job_posts MODIFY posted_by_account_id INT NULL');
    }

    $adminIndexStmt = $db->query("SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.STATISTICS
                                  WHERE TABLE_SCHEMA = DATABASE()
                                    AND TABLE_NAME = 'job_posts'
                                    AND INDEX_NAME = 'idx_job_posts_admin'");
    if ((int) ($adminIndexStmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0) === 0) {
        $db->exec('ALTER TABLE job_posts ADD INDEX idx_job_posts_admin (created_by_admin_id)');
    }

    $adminForeignKeyStmt = $db->query("SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                                       WHERE TABLE_SCHEMA = DATABASE()
                                         AND TABLE_NAME = 'job_posts'
                                         AND COLUMN_NAME = 'created_by_admin_id'
                                         AND REFERENCED_TABLE_NAME = 'admin_users'");
    if ((int) ($adminForeignKeyStmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0) === 0) {
        $db->exec('ALTER TABLE job_posts ADD CONSTRAINT fk_job_posts_admin FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL');
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
gradtrack_ensure_graduate_profile_image_table($db);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST' && isset($_POST['_method']) && strtoupper((string) $_POST['_method']) === 'PUT') {
    $method = 'PUT';
}

try {
    if ($method === 'GET') {
        $jobId = isset($_GET['id']) ? (int) $_GET['id'] : 0;
        $mineOnly = isset($_GET['mine']) && $_GET['mine'] === '1';

        if ($jobId > 0) {
            $actor = gradtrack_jobs_current_actor($db);
            $job = gradtrack_jobs_find($db, $jobId, $actor !== null);

            if (!$job) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Job not found']);
                exit;
            }

            $isOwner = $actor && (
                ($actor['type'] === 'graduate' && (int) ($job['posted_by_account_id'] ?? 0) === (int) $actor['id'])
                || ($actor['type'] === 'admin' && (int) ($job['created_by_admin_id'] ?? 0) === (int) $actor['id'])
            );
            if ((($job['approval_status'] ?? 'approved') !== 'approved' || (int) ($job['is_active'] ?? 0) !== 1) && !$isOwner) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Job not found']);
                exit;
            }

            echo json_encode(['success' => true, 'data' => $job]);
            exit;
        }

        $search = isset($_GET['search']) ? trim((string) $_GET['search']) : '';
        $jobType = isset($_GET['job_type']) ? trim((string) $_GET['job_type']) : '';
        $location = isset($_GET['location']) ? trim((string) $_GET['location']) : '';
        $industry = isset($_GET['industry']) ? trim((string) $_GET['industry']) : '';
        $activeOnly = !isset($_GET['include_inactive']) || $_GET['include_inactive'] !== '1';

        $actor = gradtrack_jobs_current_actor($db);
        if ($mineOnly) {
            $actor = gradtrack_jobs_require_actor($db);
            $activeOnly = false;
        }

        $sql = gradtrack_jobs_select_sql() . ' WHERE 1=1';

        $params = [];

        if ($activeOnly) {
            $sql .= ' AND jp.is_active = 1';
        }

        if (!$mineOnly) {
            $sql .= " AND jp.approval_status = 'approved'";
        }

        if ($mineOnly && $actor) {
            if ($actor['type'] === 'admin') {
                $sql .= ' AND jp.created_by_admin_id = :mine_admin_id';
                $params[':mine_admin_id'] = $actor['id'];
            } else {
                $sql .= ' AND jp.posted_by_account_id = :mine_account_id';
                $params[':mine_account_id'] = $actor['id'];
            }
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
                OR COALESCE(NULLIF(gp.first_name, ''), g.first_name) LIKE :search9
                OR COALESCE(NULLIF(gp.last_name, ''), g.last_name) LIKE :search10
                OR p.code LIKE :search11
                OR p.name LIKE :search12
                OR ga.email LIKE :search13
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
            $params[':search13'] = '%' . $search . '%';
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
            gradtrack_jobs_normalize_row($row, $actor !== null);
        }

        echo json_encode(['success' => true, 'data' => $rows]);
        exit;
    }

    if ($method === 'POST') {
        $actor = gradtrack_jobs_require_actor($db);
        $user = $actor['user'];
        $autoApprove = gradtrack_jobs_actor_can_auto_approve($actor);
        if ($actor['type'] === 'graduate') {
            gradtrack_require_feature_access($db, $user, 'job_posting');
        }
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
        $isActive = isset($data['is_active'])
            ? (int) ((string) $data['is_active'] === '1' || (string) $data['is_active'] === 'true')
            : 1;
        gradtrack_jobs_validate_contact_email($contactEmail);
        gradtrack_jobs_require_application_contact($contactEmail, $applicationLink, $applicationMethod);

        $allowedTypes = ['full_time', 'part_time', 'contract', 'internship', 'remote'];
        if (!in_array($jobType, $allowedTypes, true)) {
            $jobType = 'full_time';
        }

        $insertQuery = "INSERT INTO job_posts
                        (posted_by_account_id, created_by_admin_id, title, company, location, salary_range, job_type, industry, description, qualifications, required_skills, course_program_fit, application_deadline, contact_email, application_link, application_method, is_active, approval_status, approval_reviewed_by, approval_reviewed_at)
                        VALUES
                        (:posted_by_account_id, :created_by_admin_id, :title, :company, :location, :salary_range, :job_type, :industry, :description, :qualifications, :required_skills, :course_program_fit, :application_deadline, :contact_email, :application_link, :application_method, :is_active, :approval_status, :approval_reviewed_by, :approval_reviewed_at)";

        $newRequirementsReference = null;
        $db->beginTransaction();
        try {
            $stmt = $db->prepare($insertQuery);
            $stmt->execute([
                ':posted_by_account_id' => $actor['type'] === 'graduate' ? $actor['id'] : null,
                ':created_by_admin_id' => $actor['type'] === 'admin' ? $actor['id'] : null,
                ':title' => $title,
                ':company' => $company,
                ':location' => $location,
                ':salary_range' => $salaryRange,
                ':job_type' => $jobType,
                ':industry' => $industry,
                ':description' => $description,
                ':qualifications' => $qualifications,
                ':required_skills' => $requiredSkills,
                ':course_program_fit' => $courseProgramFit,
                ':application_deadline' => $applicationDeadline,
                ':contact_email' => $contactEmail,
                ':application_link' => $applicationLink,
                ':application_method' => $applicationMethod,
                ':is_active' => $isActive,
                ':approval_status' => $autoApprove ? 'approved' : 'pending',
                ':approval_reviewed_by' => $autoApprove ? $actor['id'] : null,
                ':approval_reviewed_at' => $autoApprove ? date('Y-m-d H:i:s') : null,
            ]);

            $newJobId = (int) $db->lastInsertId();
            if (isset($_FILES['requirements_file'])) {
                $fileError = (int) ($_FILES['requirements_file']['error'] ?? UPLOAD_ERR_NO_FILE);
                if ($fileError !== UPLOAD_ERR_NO_FILE) {
                    $requirementsMeta = gradtrack_jobs_save_requirements_file($newJobId, $_FILES['requirements_file']);
                    $newRequirementsReference = $requirementsMeta['requirements_file_path'];
                    $requirementsStmt = $db->prepare("UPDATE job_posts
                        SET requirements_file_path = :file_path,
                            requirements_file_name = :file_name,
                            requirements_mime_type = :mime_type,
                            requirements_file_size_bytes = :file_size,
                            requirements_uploaded_at = :uploaded_at
                        WHERE id = :id");
                    $requirementsStmt->execute([
                        ':file_path' => $requirementsMeta['requirements_file_path'],
                        ':file_name' => $requirementsMeta['requirements_file_name'],
                        ':mime_type' => $requirementsMeta['requirements_mime_type'],
                        ':file_size' => $requirementsMeta['requirements_file_size_bytes'],
                        ':uploaded_at' => $requirementsMeta['requirements_uploaded_at'],
                        ':id' => $newJobId,
                    ]);
                }
            }
            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            if ($newRequirementsReference !== null) {
                gradtrack_storage_delete_quietly($newRequirementsReference);
            }
            throw $e;
        }

        if ($actor['type'] === 'graduate') {
            logAuditTrail(
                $user['graduate_id'],
                gradtrack_audit_graduate_name($user),
                'graduate',
                $user['program_code'] ?? null,
                'Create',
                'Job Posting',
                "Created job posting with record ID {$newJobId}.",
                $newJobId
            );
        } else {
            $auditUser = gradtrack_admin_audit_context($user);
            logAuditTrail(
                $auditUser['user_id'],
                $auditUser['user_name'],
                $auditUser['user_role'],
                $auditUser['department'],
                'Create',
                'Job Posting',
                'Created ' . gradtrack_role_label((string) ($user['role'] ?? '')) . " job posting with record ID {$newJobId}.",
                $newJobId
            );
        }

        $createdJob = gradtrack_jobs_find($db, $newJobId, true);
        gradtrack_realtime_publish('job', $autoApprove && $isActive === 1 ? 'created' : 'updated', $newJobId, [
            'actor_type' => $actor['type'],
            'actor_id' => (int) $actor['id'],
        ]);

        echo json_encode([
            'success' => true,
            'message' => $autoApprove
                ? ($isActive === 1 ? 'Job post published successfully' : 'Job post saved as inactive')
                : 'Job post submitted for approval',
            'id' => $newJobId,
            'approval_status' => $autoApprove ? 'approved' : 'pending',
            'data' => $createdJob,
        ]);
        exit;
    }

    if ($method === 'PUT') {
        $actor = gradtrack_jobs_require_actor($db);
        $user = $actor['user'];
        $autoApprove = gradtrack_jobs_actor_can_auto_approve($actor);
        if ($actor['type'] === 'graduate') {
            gradtrack_require_feature_access($db, $user, 'job_posting');
        }
        $data = gradtrack_jobs_request_data();

        $jobId = isset($data['id']) ? (int) $data['id'] : 0;
        if ($jobId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'id is required']);
            exit;
        }

        $ownerStmt = $db->prepare('SELECT posted_by_account_id, created_by_admin_id, requirements_file_path,
                                         requirements_file_name, requirements_mime_type,
                                         requirements_file_size_bytes, requirements_uploaded_at
                                  FROM job_posts WHERE id = :id');
        $ownerStmt->bindParam(':id', $jobId);
        $ownerStmt->execute();
        $owner = $ownerStmt->fetch(PDO::FETCH_ASSOC);

        if (!$owner) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Job post not found']);
            exit;
        }

        $isOwner = ($actor['type'] === 'graduate' && (int) ($owner['posted_by_account_id'] ?? 0) === (int) $actor['id'])
            || ($actor['type'] === 'admin' && (int) ($owner['created_by_admin_id'] ?? 0) === (int) $actor['id']);
        if (!$isOwner) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only the job owner can update this job']);
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
                            approval_status = :approval_status,
                            approval_reviewed_by = :approval_reviewed_by,
                            approval_reviewed_at = :approval_reviewed_at,
                            approval_notes = NULL
                        WHERE id = :id";

        $legacyRequirements = empty($owner['requirements_file_path']) ? gradtrack_jobs_read_requirements_file($jobId) : null;
        $oldRequirementsReference = $owner['requirements_file_path'] ?? ($legacyRequirements['relative_path'] ?? null);
        $newRequirementsReference = null;
        $replaceRequirements = false;

        $db->beginTransaction();
        try {
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
            $approvalStatus = $autoApprove ? 'approved' : 'pending';
            $approvalReviewedBy = $autoApprove ? (int) $actor['id'] : null;
            $approvalReviewedAt = $autoApprove ? date('Y-m-d H:i:s') : null;
            $updateStmt->bindParam(':approval_status', $approvalStatus);
            $updateStmt->bindParam(':approval_reviewed_by', $approvalReviewedBy);
            $updateStmt->bindParam(':approval_reviewed_at', $approvalReviewedAt);
            $updateStmt->execute();

            if (isset($_FILES['requirements_file'])) {
                $fileError = (int) ($_FILES['requirements_file']['error'] ?? UPLOAD_ERR_NO_FILE);
                if ($fileError !== UPLOAD_ERR_NO_FILE) {
                    $requirementsMeta = gradtrack_jobs_save_requirements_file($jobId, $_FILES['requirements_file']);
                    $newRequirementsReference = $requirementsMeta['requirements_file_path'];
                    $replaceRequirements = true;
                    $requirementsStmt = $db->prepare("UPDATE job_posts
                        SET requirements_file_path = :file_path,
                            requirements_file_name = :file_name,
                            requirements_mime_type = :mime_type,
                            requirements_file_size_bytes = :file_size,
                            requirements_uploaded_at = :uploaded_at
                        WHERE id = :id");
                    $requirementsStmt->execute([
                        ':file_path' => $requirementsMeta['requirements_file_path'],
                        ':file_name' => $requirementsMeta['requirements_file_name'],
                        ':mime_type' => $requirementsMeta['requirements_mime_type'],
                        ':file_size' => $requirementsMeta['requirements_file_size_bytes'],
                        ':uploaded_at' => $requirementsMeta['requirements_uploaded_at'],
                        ':id' => $jobId,
                    ]);
                }
            }

            if ($removeRequirementsFile && !$replaceRequirements) {
                $clearRequirementsStmt = $db->prepare("UPDATE job_posts
                    SET requirements_file_path = NULL,
                        requirements_file_name = NULL,
                        requirements_mime_type = NULL,
                        requirements_file_size_bytes = NULL,
                        requirements_uploaded_at = NULL
                    WHERE id = :id");
                $clearRequirementsStmt->execute([':id' => $jobId]);
            }

            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            if ($newRequirementsReference !== null) {
                gradtrack_storage_delete_quietly($newRequirementsReference);
            }
            throw $e;
        }

        if (($replaceRequirements || $removeRequirementsFile)
            && $oldRequirementsReference !== null
            && $oldRequirementsReference !== $newRequirementsReference) {
            gradtrack_jobs_remove_requirements_file($jobId, $oldRequirementsReference);
        }

        if ($actor['type'] === 'graduate') {
            logAuditTrail(
                $user['graduate_id'],
                gradtrack_audit_graduate_name($user),
                'graduate',
                $user['program_code'] ?? null,
                'Update',
                'Job Posting',
                "Updated job posting with record ID {$jobId}.",
                $jobId
            );
        } else {
            $auditUser = gradtrack_admin_audit_context($user);
            logAuditTrail(
                $auditUser['user_id'],
                $auditUser['user_name'],
                $auditUser['user_role'],
                $auditUser['department'],
                'Update',
                'Job Posting',
                'Updated ' . gradtrack_role_label((string) ($user['role'] ?? '')) . " job posting with record ID {$jobId}.",
                $jobId
            );
        }

        $updatedJob = gradtrack_jobs_find($db, $jobId, true);
        gradtrack_realtime_publish('job', 'updated', $jobId, [
            'actor_type' => $actor['type'],
            'actor_id' => (int) $actor['id'],
        ]);

        echo json_encode([
            'success' => true,
            'message' => $autoApprove
                ? ($isActive === 1 ? 'Job post published successfully' : 'Job post archived successfully')
                : 'Job post submitted for approval',
            'approval_status' => $autoApprove ? 'approved' : 'pending',
            'data' => $updatedJob,
        ]);
        exit;
    }

    if ($method === 'DELETE') {
        $actor = gradtrack_jobs_require_actor($db);
        $user = $actor['user'];
        $data = gradtrack_jobs_request_data();

        $jobId = isset($_GET['id']) ? (int) $_GET['id'] : (isset($data['id']) ? (int) $data['id'] : 0);
        if ($jobId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'id is required']);
            exit;
        }

        $ownerStmt = $db->prepare('SELECT posted_by_account_id, created_by_admin_id, title, company, requirements_file_path
                                  FROM job_posts WHERE id = :id');
        $ownerStmt->bindParam(':id', $jobId);
        $ownerStmt->execute();
        $owner = $ownerStmt->fetch(PDO::FETCH_ASSOC);

        if (!$owner) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Job post not found']);
            exit;
        }

        $isOwner = ($actor['type'] === 'graduate' && (int) ($owner['posted_by_account_id'] ?? 0) === (int) $actor['id'])
            || ($actor['type'] === 'admin' && (int) ($owner['created_by_admin_id'] ?? 0) === (int) $actor['id']);
        if (!$isOwner) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only the job owner can delete this job']);
            exit;
        }

        try {
            $db->beginTransaction();

            $applicationsStmt = $db->prepare('DELETE FROM job_applications WHERE job_post_id = :id');
            $applicationsStmt->bindParam(':id', $jobId);
            $applicationsStmt->execute();

            $deleteStmt = $db->prepare('DELETE FROM job_posts WHERE id = :id');
            $deleteStmt->bindParam(':id', $jobId);
            $deleteStmt->execute();

            $db->commit();
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }

        $legacyRequirements = empty($owner['requirements_file_path']) ? gradtrack_jobs_read_requirements_file($jobId) : null;
        $deletedRequirementsReference = $owner['requirements_file_path'] ?? ($legacyRequirements['relative_path'] ?? null);
        gradtrack_jobs_remove_requirements_file($jobId, $deletedRequirementsReference);
        gradtrack_jobs_cleanup_job_dir($jobId);

        if ($actor['type'] === 'graduate') {
            logAuditTrail(
                $user['graduate_id'],
                gradtrack_audit_graduate_name($user),
                'graduate',
                $user['program_code'] ?? null,
                'Delete',
                'Job Posting',
                "Deleted job posting with record ID {$jobId}.",
                $jobId
            );
        } else {
            $auditUser = gradtrack_admin_audit_context($user);
            logAuditTrail(
                $auditUser['user_id'],
                $auditUser['user_name'],
                $auditUser['user_role'],
                $auditUser['department'],
                'Delete',
                'Job Posting',
                "Deleted Alumni President job posting with record ID {$jobId}.",
                $jobId
            );
        }

        gradtrack_realtime_publish('job', 'deleted', $jobId, [
            'actor_type' => $actor['type'],
            'actor_id' => (int) $actor['id'],
        ]);

        echo json_encode(['success' => true, 'message' => 'Job post deleted successfully']);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => gradtrack_public_exception_message($e, 'Unable to process job posts right now.', 'Job posts API')]);
}
