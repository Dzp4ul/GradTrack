<?php

require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/storage.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/admin_auth.php';
require_once __DIR__ . '/config/admin_roles.php';
require_once __DIR__ . '/config/graduate_auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$database = new Database();
$db = $database->getConnection();
$adminUser = gradtrack_current_admin_user($db);
$graduateUser = gradtrack_current_graduate_user($db);
$isAuthenticated = $adminUser !== null || $graduateUser !== null;

// Graduate media is private to authenticated GradTrack portal sessions. The
// endpoint accepts only media namespaces rendered by authenticated portal
// surfaces; chat attachments keep their record-level endpoint.
if (!$isAuthenticated) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Authentication required']);
    exit;
}

$reference = trim((string) ($_GET['path'] ?? ''));
$isProfileMedia = preg_match(
    '#^media/profiles/graduates/[1-9][0-9]*/(?:profile|cover)/[a-f0-9-]+\.(?:jpe?g|png|webp|gif)$#D',
    $reference
) === 1;
$isForumMedia = preg_match(
    '#^media/community-forum/posts/[1-9][0-9]*/(?:images|videos)/[a-f0-9-]+\.(?:jpe?g|png|webp|gif|mp4|webm|ogv|mov)$#D',
    $reference
) === 1;
$announcementMatches = [];
$isAnnouncementMedia = preg_match(
    '#^media/announcements/([1-9][0-9]*)/(?:cover|gallery)/[a-f0-9-]+\.(?:jpe?g|png|webp|gif)$#D',
    $reference,
    $announcementMatches
) === 1;
$jobMatches = [];
$isJobRequirementsFile = preg_match(
    '#^private/job-support/job-posts/([1-9][0-9]*)/requirements/[a-f0-9-]+\.(?:pdf|docx|png|jpe?g)$#D',
    $reference,
    $jobMatches
) === 1;

$authorizedAnnouncementMedia = false;
if ($isAnnouncementMedia) {
    $announcementStmt = $db->prepare("SELECT a.id
        FROM announcements a
        WHERE a.id = :id
          AND a.status = 'published'
          AND (
              a.cover_image_path = :cover_reference
              OR EXISTS (
                  SELECT 1 FROM announcement_images image
                  WHERE image.announcement_id = a.id AND image.file_path = :gallery_reference
              )
          )
        LIMIT 1");
    $announcementStmt->execute([
        ':id' => (int) $announcementMatches[1],
        ':cover_reference' => $reference,
        ':gallery_reference' => $reference,
    ]);
    $authorizedAnnouncementMedia = (bool) $announcementStmt->fetchColumn();
}

$authorizedJobRequirementsFile = false;
$downloadName = null;
$downloadMimeType = null;
if ($isJobRequirementsFile) {
    $jobStmt = $db->prepare("SELECT requirements_file_name, requirements_mime_type
        FROM job_posts
        WHERE id = :id
          AND requirements_file_path = :reference
          AND (
              (is_active = 1 AND approval_status = 'approved')
              OR (:owner_check_id > 0 AND created_by_admin_id = :owner_admin_id)
              OR (:reviewer_check_id > 0 AND approval_status = 'pending')
          )
        LIMIT 1");
    $adminRole = (string) ($adminUser['role'] ?? '');
    $adminId = ($adminUser && in_array($adminRole, gradtrack_job_posting_admin_roles(), true))
        ? (int) $adminUser['id']
        : 0;
    $reviewerId = $adminRole === 'alumni_president' ? $adminId : 0;
    $jobStmt->execute([
        ':id' => (int) $jobMatches[1],
        ':reference' => $reference,
        ':owner_check_id' => $adminId,
        ':owner_admin_id' => $adminId,
        ':reviewer_check_id' => $reviewerId,
    ]);
    $jobFile = $jobStmt->fetch(PDO::FETCH_ASSOC);
    if ($jobFile) {
        $authorizedJobRequirementsFile = true;
        $downloadName = $jobFile['requirements_file_name'] ?? null;
        $downloadMimeType = $jobFile['requirements_mime_type'] ?? null;
    }
}

if (!$isProfileMedia && !$isForumMedia && !$authorizedAnnouncementMedia && !$authorizedJobRequirementsFile) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Media not found']);
    exit;
}

try {
    $url = gradtrack_storage_presigned_url(
        $reference,
        $downloadName,
        $downloadMimeType,
        $authorizedJobRequirementsFile
    );
    header('Cache-Control: private, max-age=300');
    header('Location: ' . $url, true, 302);
    exit;
} catch (Throwable $error) {
    gradtrack_storage_log('ERROR', 'Authenticated media access failed', array_merge(
        ['object_key' => $reference],
        gradtrack_storage_exception_context($error)
    ));
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Media is currently unavailable']);
}
