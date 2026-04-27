<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/forum.php';

function gradtrack_forum_activity_json_error(int $statusCode, string $message): void
{
    http_response_code($statusCode);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

$database = new Database();
$db = $database->getConnection();

try {
    gradtrack_forum_ensure_schema($db);
    $user = gradtrack_require_graduate_auth($db);

    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        gradtrack_forum_activity_json_error(405, 'Method not allowed');
    }

    $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 15;
    if ($limit < 1 || $limit > 50) {
        $limit = 15;
    }

    $stmt = $db->prepare("SELECT fal.id, fal.graduate_id, fal.action, fal.post_id, fal.comment_id,
                                 fal.metadata_json, fal.created_at,
                                 fp.title AS post_title
                          FROM forum_activity_logs fal
                          LEFT JOIN forum_posts fp ON fp.id = fal.post_id
                          WHERE fal.graduate_id = :graduate_id
                          ORDER BY fal.created_at DESC, fal.id DESC
                          LIMIT $limit");
    $stmt->execute([':graduate_id' => (int) $user['graduate_id']]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$row) {
        $row['id'] = (int) $row['id'];
        $row['graduate_id'] = (int) $row['graduate_id'];
        $row['post_id'] = isset($row['post_id']) ? (int) $row['post_id'] : null;
        $row['comment_id'] = isset($row['comment_id']) ? (int) $row['comment_id'] : null;
        $row['metadata'] = $row['metadata_json'] ? json_decode((string) $row['metadata_json'], true) : null;
        unset($row['metadata_json']);
    }
    unset($row);

    echo json_encode([
        'success' => true,
        'data' => $rows,
    ]);
} catch (Throwable $e) {
    gradtrack_forum_activity_json_error(500, $e->getMessage());
}
