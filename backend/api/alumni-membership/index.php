<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/admin_auth.php';
require_once __DIR__ . '/../config/audit_trail.php';
require_once __DIR__ . '/../config/alumni_membership.php';

header('Cache-Control: no-store, max-age=0');

function gradtrack_alumni_membership_json_body(): array
{
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw ?: '', true);
    if (!is_array($payload)) {
        throw new InvalidArgumentException('A valid JSON request body is required.');
    }
    return $payload;
}

function gradtrack_alumni_membership_require_president(PDO $db): array
{
    return gradtrack_require_admin_auth(
        $db,
        ['alumni_president'],
        'Only the Alumni President can manage alumni membership page content.'
    );
}

function gradtrack_alumni_membership_log(array $admin, string $action, string $description, $before = null, $after = null): void
{
    logAuditTrail(
        (int) $admin['id'],
        trim((string) ($admin['full_name'] ?? $admin['username'] ?? 'Alumni President')),
        (string) $admin['role'],
        null,
        $action,
        'Alumni Membership Page',
        $description,
        'membership-content',
        $before,
        $after
    );
}

$db = (new Database())->getConnection();
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$scope = strtolower(trim((string) ($_GET['scope'] ?? 'public')));
$action = strtolower(trim((string) ($_GET['action'] ?? '')));

try {
    gradtrack_alumni_membership_assert_schema($db);

    if ($method === 'GET') {
        if ($scope === 'admin') {
            gradtrack_alumni_membership_require_president($db);
            $payload = gradtrack_alumni_membership_payload($db, 'draft', true);
            $published = gradtrack_alumni_membership_version($db, 'published');
            $payload['published_at'] = $published['published_at'] ?? null;
            $payload['has_published_content'] = $published !== null;
            echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            exit;
        }

        $view = strtolower(trim((string) ($_GET['view'] ?? 'registration')));
        if (!in_array($view, ['registration', 'registered'], true)) {
            throw new InvalidArgumentException('Unknown alumni membership page view.');
        }
        $payload = gradtrack_alumni_membership_payload($db, 'published', false);
        $payload['view'] = $view;
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    $admin = gradtrack_alumni_membership_require_president($db);
    $adminId = (int) $admin['id'];

    if ($method === 'PUT') {
        $before = gradtrack_alumni_membership_payload($db, 'draft', true)['data'] ?? null;
        $result = gradtrack_alumni_membership_save_draft($db, gradtrack_alumni_membership_json_body(), $adminId);
        $result['message'] = 'Draft saved successfully.';
        gradtrack_alumni_membership_log($admin, 'Update', 'Saved alumni membership page draft.', $before, $result['data'] ?? null);
        echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($method === 'POST' && $action === 'publish') {
        $before = gradtrack_alumni_membership_payload($db, 'published', true)['data'] ?? null;
        $result = gradtrack_alumni_membership_publish($db, $adminId);
        $after = gradtrack_alumni_membership_payload($db, 'published', true)['data'] ?? null;
        gradtrack_alumni_membership_log($admin, 'Publish', 'Published alumni membership page content.', $before, $after);
        echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($method === 'POST' && $action === 'unpublish') {
        $before = gradtrack_alumni_membership_payload($db, 'published', true)['data'] ?? null;
        $result = gradtrack_alumni_membership_unpublish($db, $adminId);
        gradtrack_alumni_membership_log($admin, 'Unpublish', 'Unpublished alumni membership page content.', $before, null);
        echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($method === 'POST' && $action === 'upload') {
        $assetKey = strtolower(trim((string) ($_POST['asset_key'] ?? '')));
        if (!isset($_FILES['image']) || !is_array($_FILES['image'])) {
            throw new InvalidArgumentException('Select an image to upload.');
        }
        $result = gradtrack_alumni_membership_upload_image($db, $_FILES['image'], $assetKey, $adminId);
        gradtrack_alumni_membership_log($admin, 'Upload', 'Replaced an alumni membership page image.', null, [
            'asset_key' => $assetKey,
            'path' => $result['path'] ?? null,
        ]);
        echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($method === 'POST' && $action === 'remove-image') {
        $payload = gradtrack_alumni_membership_json_body();
        $assetKey = strtolower(trim((string) ($payload['asset_key'] ?? '')));
        $result = gradtrack_alumni_membership_remove_image($db, $assetKey, $adminId);
        gradtrack_alumni_membership_log($admin, 'Delete', 'Removed an image from the alumni membership page draft.', [
            'asset_key' => $assetKey,
        ], null);
        echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed.']);
} catch (InvalidArgumentException $error) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => $error->getMessage()]);
} catch (Throwable $error) {
    error_log('GradTrack alumni membership content error: ' . $error->getMessage());
    if (strpos($error->getMessage(), 'has not been migrated') !== false) {
        http_response_code(503);
        echo json_encode(['success' => false, 'error' => 'Alumni membership information is being prepared. Please try again later.']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Unable to process alumni membership content. Please try again.']);
    }
}
