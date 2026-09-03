<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/public_content.php';
require_once __DIR__ . '/../config/audit_trail.php';
require_once __DIR__ . '/../config/admin_auth.php';

function gradtrack_public_content_require_super_admin(PDO $db): array
{
    return gradtrack_require_admin_auth($db, ['super_admin'], 'Only Super Admin can manage public website content');
}

function gradtrack_public_content_json_body(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '', true);
    if (!is_array($data)) throw new InvalidArgumentException('A valid JSON request body is required.');
    return $data;
}

$db = (new Database())->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$page = strtolower(trim((string) ($_GET['page'] ?? '')));
$scope = strtolower(trim((string) ($_GET['scope'] ?? 'public')));

try {
    gradtrack_public_content_ensure_schema($db);

    if ($method === 'GET') {
        $admin = $scope === 'admin';
        if ($admin) gradtrack_public_content_require_super_admin($db);
        echo json_encode(gradtrack_public_content_payload($db, $page, $admin), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    $authUser = gradtrack_public_content_require_super_admin($db);
    $adminId = (int) $authUser['id'];
    if ($method === 'POST' && $page === 'about' && strtolower((string) ($_GET['action'] ?? '')) === 'upload') {
        if (!isset($_FILES['image']) || !is_array($_FILES['image'])) throw new InvalidArgumentException('An image file is required.');
        $contentId = isset($_POST['content_id']) ? (int) $_POST['content_id'] : 0;
        if ($contentId <= 0) throw new InvalidArgumentException('A valid About content section is required.');
        $contentStmt = $db->prepare("SELECT id FROM website_content WHERE id = :id AND page = 'about'");
        $contentStmt->execute([':id' => $contentId]);
        if (!$contentStmt->fetchColumn()) throw new InvalidArgumentException('The About content section was not found.');
        $path = gradtrack_public_content_save_about_image($_FILES['image'], $contentId);
        echo json_encode([
            'success' => true,
            'message' => 'Image uploaded and ready to save.',
            'file_path' => $path,
            'file_url' => gradtrack_storage_access_reference($path),
        ]);
        exit;
    }

    if ($method !== 'PUT') {
        http_response_code(405); echo json_encode(['success' => false, 'error' => 'Method not allowed']); exit;
    }

    $payload = gradtrack_public_content_json_body();
    $before = gradtrack_public_content_payload($db, $page, true);
    $replacedAboutPaths = [];
    $beforeAboutPaths = [];
    $submittedAboutPaths = [];
    if ($page === 'about') {
        foreach (($before['sections'] ?? []) as $section) {
            if (!empty($section['image_storage_path'])) $beforeAboutPaths[] = (string) $section['image_storage_path'];
        }
        foreach ((array) ($payload['sections'] ?? []) as $section) {
            $candidate = $section['image_storage_path'] ?? ($section['image_path'] ?? null);
            if (is_string($candidate) && strpos($candidate, 'media/public-content/about/') === 0) {
                $submittedAboutPaths[] = $candidate;
            }
        }
    }
    $db->beginTransaction();
    try {
        if ($page === 'about') $replacedAboutPaths = gradtrack_public_content_sync_about($db, is_array($payload['sections'] ?? null) ? $payload['sections'] : [], $adminId);
        elseif ($page === 'faq') gradtrack_public_content_sync_faq($db, is_array($payload['categories'] ?? null) ? $payload['categories'] : []);
        elseif ($page === 'privacy') gradtrack_public_content_sync_privacy($db, is_array($payload['meta'] ?? null) ? $payload['meta'] : [], is_array($payload['sections'] ?? null) ? $payload['sections'] : [], $adminId);
        else throw new InvalidArgumentException('Unsupported public content page.');
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        foreach (array_diff($submittedAboutPaths, $beforeAboutPaths) as $newPath) {
            gradtrack_storage_delete_quietly($newPath);
        }
        throw $e;
    }
    foreach ($replacedAboutPaths as $oldPath) gradtrack_storage_delete_quietly($oldPath);
    $after = gradtrack_public_content_payload($db, $page, true);
    $labels = ['about' => 'About page content', 'faq' => 'FAQ', 'privacy' => 'Privacy Policy'];
    logAuditTrail($adminId, trim((string) ($authUser['full_name'] ?? $authUser['username'] ?? 'Super Admin')), 'super_admin', null, 'Update', 'Public Website Content', 'Updated ' . ($labels[$page] ?? $page) . '.', $page, $before, $after);
    echo json_encode($after + ['message' => ($labels[$page] ?? 'Public website content') . ' updated successfully.'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (InvalidArgumentException $e) {
    http_response_code(422); echo json_encode(['success' => false, 'error' => $e->getMessage()]);
} catch (Throwable $e) {
    error_log('GradTrack public content error: ' . $e->getMessage());
    http_response_code(500); echo json_encode(['success' => false, 'error' => 'Unable to process public website content. Please try again.']);
}
