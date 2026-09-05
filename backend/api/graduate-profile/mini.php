<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/graduate_profile.php';
require_once __DIR__ . '/../config/chat.php';
require_once __DIR__ . '/../config/storage.php';

function gradtrack_mini_profile_error(int $statusCode, string $message): never
{
    http_response_code($statusCode);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    gradtrack_mini_profile_error(405, 'Method not allowed');
}

$database = new Database();
$db = $database->getConnection();

try {
    gradtrack_require_graduate_auth($db);
    gradtrack_ensure_graduate_profile_table($db);

    $graduateId = (int) ($_GET['graduate_id'] ?? 0);
    if ($graduateId <= 0) {
        gradtrack_mini_profile_error(400, 'A valid graduate_id is required');
    }

    $stmt = $db->prepare("SELECT g.id AS graduate_id,
                                 TRIM(CONCAT(COALESCE(g.first_name, ''), ' ', COALESCE(g.last_name, ''))) AS full_name,
                                 p.code AS program_code,
                                 p.name AS program_name,
                                 COALESCE(NULLIF(profile.program_course, ''), p.code, p.name) AS program_course,
                                 COALESCE(profile.graduation_year, g.year_graduated) AS year_graduated,
                                 gpi.file_path AS profile_image_path,
                                 COALESCE(NULLIF(profile.job_title, ''), latest_employment.job_title) AS job_title,
                                 COALESCE(NULLIF(profile.company_name, ''), latest_employment.company_name) AS company_name,
                                 presence.last_active_at
                          FROM graduates g
                          JOIN graduate_accounts account
                            ON account.graduate_id = g.id
                           AND account.status = 'active'
                           AND account.alumni_verification_status = 'approved'
                          LEFT JOIN programs p ON p.id = g.program_id
                          LEFT JOIN graduate_profiles profile ON profile.graduate_account_id = account.id
                          LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = account.id
                          LEFT JOIN employment latest_employment
                            ON latest_employment.id = (
                                SELECT employment_row.id
                                FROM employment employment_row
                                WHERE employment_row.graduate_id = g.id
                                ORDER BY employment_row.updated_at DESC, employment_row.id DESC
                                LIMIT 1
                            )
                          LEFT JOIN graduate_presence presence ON presence.graduate_id = g.id
                          WHERE g.id = :graduate_id
                            AND g.status = 'active'
                          LIMIT 1");
    $stmt->execute([':graduate_id' => $graduateId]);
    $profile = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$profile) {
        gradtrack_mini_profile_error(404, 'Graduate profile not found');
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'profile' => [
                'graduate_id' => (int) $profile['graduate_id'],
                'full_name' => trim((string) ($profile['full_name'] ?? '')) ?: 'Graduate',
                'program_code' => $profile['program_code'] ?? null,
                'program_name' => $profile['program_name'] ?? null,
                'program_course' => $profile['program_course'] ?? null,
                'year_graduated' => $profile['year_graduated'] !== null ? (int) $profile['year_graduated'] : null,
                'profile_image_path' => gradtrack_storage_media_access_reference($profile['profile_image_path'] ?? null),
                'job_title' => $profile['job_title'] ?? null,
                'company_name' => $profile['company_name'] ?? null,
                'last_active_at' => gradtrack_chat_datetime_iso($profile['last_active_at'] ?? null),
            ],
        ],
    ]);
} catch (Throwable $error) {
    error_log('GradTrack mini profile API error: ' . $error->getMessage());
    gradtrack_mini_profile_error(500, 'Unable to load this graduate profile right now');
}
