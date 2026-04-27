<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/forum.php';

function gradtrack_forum_comments_request_data(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function gradtrack_forum_comments_json_error(int $statusCode, string $message): void
{
    http_response_code($statusCode);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function gradtrack_forum_comments_post_access(PDO $db, int $postId, ?array $graduateUser, ?array $moderator): array
{
    $stmt = $db->prepare('SELECT id, graduate_id, status FROM forum_posts WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $postId]);
    $post = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$post) {
        gradtrack_forum_comments_json_error(404, 'Forum post not found');
    }

    $isOwner = $graduateUser !== null && (int) $post['graduate_id'] === (int) $graduateUser['graduate_id'];
    $canModerate = $moderator !== null;

    if (($post['status'] ?? 'pending') !== 'approved' && !$isOwner && !$canModerate) {
        gradtrack_forum_comments_json_error(404, 'Forum post not found');
    }

    return $post;
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    gradtrack_forum_ensure_schema($db);

    if ($method === 'GET') {
        $postId = isset($_GET['post_id']) ? (int) $_GET['post_id'] : 0;
        if ($postId <= 0) {
            gradtrack_forum_comments_json_error(400, 'post_id is required');
        }

        $graduateUser = gradtrack_current_graduate_user($db);
        $moderator = gradtrack_forum_current_moderator($db);
        gradtrack_forum_comments_post_access($db, $postId, $graduateUser, $moderator);

        $stmt = $db->prepare("SELECT fc.id, fc.post_id, fc.graduate_id, fc.comment, fc.created_at,
                                     g.first_name, g.middle_name, g.last_name,
                                     gpi.file_path AS commenter_profile_image_path,
                                     p.name AS commenter_program_name, p.code AS commenter_program_code
                              FROM forum_comments fc
                              JOIN graduates g ON g.id = fc.graduate_id
                              LEFT JOIN graduate_accounts ga ON ga.graduate_id = g.id
                              LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
                              LEFT JOIN programs p ON p.id = g.program_id
                              WHERE fc.post_id = :post_id
                              ORDER BY fc.created_at ASC, fc.id ASC");
        $stmt->execute([':post_id' => $postId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($rows as &$row) {
            $row['id'] = (int) $row['id'];
            $row['post_id'] = (int) $row['post_id'];
            $row['graduate_id'] = (int) $row['graduate_id'];
            $row['commenter_name'] = trim((string) ($row['first_name'] ?? '') . ' ' . (string) ($row['last_name'] ?? ''));
        }
        unset($row);

        echo json_encode([
            'success' => true,
            'data' => $rows,
        ]);
        exit;
    }

    if ($method === 'POST') {
        $user = gradtrack_require_graduate_auth($db);
        $data = gradtrack_forum_comments_request_data();
        $postId = isset($data['post_id']) ? (int) $data['post_id'] : 0;
        $comment = gradtrack_forum_clean_text($data['comment'] ?? '');

        if ($postId <= 0) {
            gradtrack_forum_comments_json_error(400, 'post_id is required');
        }

        if ($comment === '') {
            gradtrack_forum_comments_json_error(400, 'comment is required');
        }

        gradtrack_forum_comments_post_access($db, $postId, $user, null);

        $stmt = $db->prepare('INSERT INTO forum_comments (post_id, graduate_id, comment)
                              VALUES (:post_id, :graduate_id, :comment)');
        $stmt->execute([
            ':post_id' => $postId,
            ':graduate_id' => (int) $user['graduate_id'],
            ':comment' => $comment,
        ]);

        echo json_encode([
            'success' => true,
            'message' => 'Comment added successfully',
            'id' => (int) $db->lastInsertId(),
        ]);
        exit;
    }

    if ($method === 'DELETE') {
        gradtrack_forum_require_moderator($db);
        $data = gradtrack_forum_comments_request_data();
        $commentId = isset($_GET['id']) ? (int) $_GET['id'] : (isset($data['id']) ? (int) $data['id'] : 0);

        if ($commentId <= 0) {
            gradtrack_forum_comments_json_error(400, 'id is required');
        }

        $existsStmt = $db->prepare('SELECT id FROM forum_comments WHERE id = :id LIMIT 1');
        $existsStmt->execute([':id' => $commentId]);
        if (!$existsStmt->fetch(PDO::FETCH_ASSOC)) {
            gradtrack_forum_comments_json_error(404, 'Comment not found');
        }

        $deleteStmt = $db->prepare('DELETE FROM forum_comments WHERE id = :id');
        $deleteStmt->execute([':id' => $commentId]);

        echo json_encode([
            'success' => true,
            'message' => 'Comment deleted successfully',
        ]);
        exit;
    }

    gradtrack_forum_comments_json_error(405, 'Method not allowed');
} catch (Throwable $e) {
    gradtrack_forum_comments_json_error(500, $e->getMessage());
}
