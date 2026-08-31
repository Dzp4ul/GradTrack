<?php

require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/storage.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Graduate media is private to authenticated GradTrack portal sessions. The
// endpoint intentionally accepts only the two media namespaces rendered by
// the Graduate Portal; chat attachments keep their record-level endpoint.
if (!isset($_SESSION['graduate_account_id']) && !isset($_SESSION['user_id'])) {
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

if (!$isProfileMedia && !$isForumMedia) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Media not found']);
    exit;
}

try {
    $url = gradtrack_storage_presigned_url($reference, null, null, false);
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
