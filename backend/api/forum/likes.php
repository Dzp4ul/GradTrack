<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/forum.php';

function gradtrack_forum_likes_request_data(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function gradtrack_forum_likes_json_error(int $statusCode, string $message): void
{
    http_response_code($statusCode);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    gradtrack_forum_ensure_schema($db);
    $user = gradtrack_require_graduate_auth($db);

    if ($method !== 'POST') {
        gradtrack_forum_likes_json_error(405, 'Method not allowed');
    }

    $data = gradtrack_forum_likes_request_data();
    $postId = isset($data['post_id']) ? (int) $data['post_id'] : 0;

    if ($postId <= 0) {
        gradtrack_forum_likes_json_error(400, 'post_id is required');
    }

    $postStmt = $db->prepare('SELECT id, graduate_id, status FROM forum_posts WHERE id = :id LIMIT 1');
    $postStmt->execute([':id' => $postId]);
    $post = $postStmt->fetch(PDO::FETCH_ASSOC);

    if (!$post) {
        gradtrack_forum_likes_json_error(404, 'Forum post not found');
    }

    $isOwner = (int) $post['graduate_id'] === (int) $user['graduate_id'];
    if (($post['status'] ?? 'pending') !== 'approved' && !$isOwner) {
        gradtrack_forum_likes_json_error(404, 'Forum post not found');
    }

    $likeStmt = $db->prepare('SELECT id FROM forum_post_likes WHERE post_id = :post_id AND graduate_id = :graduate_id LIMIT 1');
    $likeStmt->execute([
        ':post_id' => $postId,
        ':graduate_id' => (int) $user['graduate_id'],
    ]);
    $existingLike = $likeStmt->fetch(PDO::FETCH_ASSOC);

    if ($existingLike) {
        $deleteStmt = $db->prepare('DELETE FROM forum_post_likes WHERE id = :id');
        $deleteStmt->execute([':id' => (int) $existingLike['id']]);
        $liked = false;
    } else {
        $insertStmt = $db->prepare('INSERT INTO forum_post_likes (post_id, graduate_id) VALUES (:post_id, :graduate_id)');
        $insertStmt->execute([
            ':post_id' => $postId,
            ':graduate_id' => (int) $user['graduate_id'],
        ]);
        $liked = true;
    }

    gradtrack_forum_log_activity(
        $db,
        (int) $user['graduate_id'],
        $liked ? 'post_liked' : 'post_unliked',
        $postId
    );

    $countStmt = $db->prepare('SELECT COUNT(*) AS total FROM forum_post_likes WHERE post_id = :post_id');
    $countStmt->execute([':post_id' => $postId]);
    $likeCount = (int) ($countStmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

    echo json_encode([
        'success' => true,
        'message' => $liked ? 'Post liked' : 'Like removed',
        'liked' => $liked,
        'like_count' => $likeCount,
    ]);
} catch (Throwable $e) {
    gradtrack_forum_likes_json_error(500, $e->getMessage());
}
