<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/admin_roles.php';
require_once __DIR__ . '/../config/storage.php';

function gradtrack_saved_jobs_error(int $status, string $message): never
{
    http_response_code($status);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function gradtrack_saved_jobs_request_data(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function gradtrack_saved_jobs_format(array &$job): void
{
    $job['id'] = (int) $job['id'];
    $job['is_active'] = (int) $job['is_active'];
    foreach (['posted_by_account_id', 'created_by_admin_id', 'poster_account_id', 'poster_graduate_id'] as $key) {
        $job[$key] = isset($job[$key]) ? (int) $job[$key] : null;
    }
    $job['poster_profile_image_path'] = gradtrack_storage_media_access_reference($job['poster_profile_image_path'] ?? null);
    $job['requirements_file_path'] = null;
}

$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    $user = gradtrack_require_graduate_auth($db);
    $accountId = (int) $user['account_id'];

    if ($method === 'GET') {
        $stmt = $db->prepare("SELECT jp.id, jp.posted_by_account_id, jp.created_by_admin_id,
                                    jp.title, jp.company, jp.location, jp.salary_range, jp.job_type,
                                    jp.industry, jp.description, jp.qualifications, jp.required_skills,
                                    jp.course_program_fit, jp.application_deadline, jp.contact_email,
                                    jp.application_link, jp.application_method, jp.is_active,
                                    jp.approval_status, jp.created_at, jp.updated_at,
                                    ga.id AS poster_account_id, g.id AS poster_graduate_id,
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
                                    p.code AS poster_program_code,
                                    admin.role AS creator_role,
                                    gpi.file_path AS poster_profile_image_path,
                                    saved.created_at AS saved_at
                             FROM saved_jobs saved
                             JOIN job_posts jp ON jp.id = saved.job_post_id
                             LEFT JOIN graduate_accounts ga ON ga.id = jp.posted_by_account_id
                             LEFT JOIN graduates g ON g.id = ga.graduate_id
                             LEFT JOIN graduate_profiles gp ON gp.graduate_account_id = ga.id
                             LEFT JOIN programs p ON p.id = g.program_id
                             LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
                             LEFT JOIN admin_users admin ON admin.id = jp.created_by_admin_id
                             WHERE saved.graduate_account_id = :account_id
                               AND jp.approval_status = 'approved'
                               AND jp.is_active = 1
                               AND jp.archived_at IS NULL
                               AND (jp.application_deadline IS NULL OR jp.application_deadline >= CURDATE())
                             ORDER BY saved.created_at DESC, saved.id DESC");
        $stmt->execute([':account_id' => $accountId]);
        $jobs = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($jobs as &$job) gradtrack_saved_jobs_format($job);
        unset($job);

        echo json_encode(['success' => true, 'data' => $jobs]);
        exit;
    }

    $data = gradtrack_saved_jobs_request_data();
    $jobId = isset($data['job_id']) ? (int) $data['job_id'] : (isset($_GET['job_id']) ? (int) $_GET['job_id'] : 0);
    if ($jobId <= 0) gradtrack_saved_jobs_error(400, 'job_id is required');

    if ($method === 'POST') {
        $jobStmt = $db->prepare("SELECT id
                                 FROM job_posts
                                 WHERE id = :job_id
                                   AND approval_status = 'approved'
                                   AND is_active = 1
                                   AND archived_at IS NULL
                                   AND (application_deadline IS NULL OR application_deadline >= CURDATE())
                                 LIMIT 1");
        $jobStmt->execute([':job_id' => $jobId]);
        if (!$jobStmt->fetchColumn()) {
            gradtrack_saved_jobs_error(409, 'This job posting is no longer available to save');
        }

        $stmt = $db->prepare("INSERT INTO saved_jobs (graduate_account_id, job_post_id)
                              VALUES (:account_id, :job_id)
                              ON DUPLICATE KEY UPDATE created_at = created_at");
        $stmt->execute([':account_id' => $accountId, ':job_id' => $jobId]);
        echo json_encode(['success' => true, 'message' => 'Job saved successfully.', 'data' => ['job_id' => $jobId, 'is_saved' => true]]);
        exit;
    }

    if ($method === 'DELETE') {
        $stmt = $db->prepare('DELETE FROM saved_jobs WHERE graduate_account_id = :account_id AND job_post_id = :job_id');
        $stmt->execute([':account_id' => $accountId, ':job_id' => $jobId]);
        echo json_encode(['success' => true, 'message' => 'Job removed from Saved Jobs.', 'data' => ['job_id' => $jobId, 'is_saved' => false]]);
        exit;
    }

    gradtrack_saved_jobs_error(405, 'Method not allowed');
} catch (Throwable $error) {
    gradtrack_saved_jobs_error(500, gradtrack_public_exception_message($error, 'Unable to update Saved Jobs right now.', 'Saved jobs API'));
}
