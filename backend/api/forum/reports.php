<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/forum.php';

function gradtrack_forum_reports_request_data(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function gradtrack_forum_reports_json_error(int $statusCode, string $message): void
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
        gradtrack_forum_reports_json_error(405, 'Method not allowed');
    }

    $data = gradtrack_forum_reports_request_data();
    $targetType = gradtrack_forum_clean_text($data['target_type'] ?? '');
    $targetId = isset($data['target_id']) ? (int) $data['target_id'] : 0;
    $reason = gradtrack_forum_clean_text($data['reason'] ?? '');
    $description = gradtrack_forum_clean_text($data['description'] ?? '');

    if (!in_array($targetType, ['post', 'comment'], true) || $targetId <= 0) {
        gradtrack_forum_reports_json_error(400, 'Valid target_type and target_id are required');
    }

    if ($reason === '' || strlen($reason) > 120) {
        gradtrack_forum_reports_json_error(400, 'A report reason of 120 characters or fewer is required');
    }

    if (strlen($description) > 1000) {
        gradtrack_forum_reports_json_error(400, 'Report description must be 1000 characters or fewer');
    }

    $postId = null;
    $commentId = null;

    if ($targetType === 'post') {
        $stmt = $db->prepare('SELECT id, graduate_id, status FROM forum_posts WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $targetId]);
        $post = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$post || (string) ($post['status'] ?? '') !== 'approved') {
            gradtrack_forum_reports_json_error(404, 'Forum post not found');
        }

        if ((int) $post['graduate_id'] === (int) $user['graduate_id']) {
            gradtrack_forum_reports_json_error(400, 'You cannot report your own post');
        }

        $postId = $targetId;
    } else {
        $stmt = $db->prepare("SELECT fc.id, fc.post_id, fc.graduate_id, fc.status AS comment_status, fp.status
                              FROM forum_comments fc
                              JOIN forum_posts fp ON fp.id = fc.post_id
                              WHERE fc.id = :id
                              LIMIT 1");
        $stmt->execute([':id' => $targetId]);
        $comment = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$comment
            || (string) ($comment['status'] ?? '') !== 'approved'
            || (string) ($comment['comment_status'] ?? '') !== 'approved') {
            gradtrack_forum_reports_json_error(404, 'Comment not found');
        }

        if ((int) $comment['graduate_id'] === (int) $user['graduate_id']) {
            gradtrack_forum_reports_json_error(400, 'You cannot report your own comment');
        }

        $postId = (int) $comment['post_id'];
        $commentId = $targetId;
    }

    $existingStmt = $db->prepare("SELECT id
                                  FROM forum_reports
                                  WHERE reporter_graduate_id = :reporter_graduate_id
                                    AND target_type = :target_type
                                    AND " . ($targetType === 'post' ? 'post_id = :target_id' : 'comment_id = :target_id') . "
                                  LIMIT 1");
    $existingStmt->execute([
        ':reporter_graduate_id' => (int) $user['graduate_id'],
        ':target_type' => $targetType,
        ':target_id' => $targetId,
    ]);

    if ($existingStmt->fetch(PDO::FETCH_ASSOC)) {
        echo json_encode([
            'success' => true,
            'message' => 'You have already reported this item',
        ]);
        exit;
    }

    $insertStmt = $db->prepare("INSERT INTO forum_reports
                                (reporter_graduate_id, target_type, post_id, comment_id, reason, description)
                                VALUES (:reporter_graduate_id, :target_type, :post_id, :comment_id, :reason, :description)");
    $insertStmt->execute([
        ':reporter_graduate_id' => (int) $user['graduate_id'],
        ':target_type' => $targetType,
        ':post_id' => $postId,
        ':comment_id' => $commentId,
        ':reason' => $reason,
        ':description' => $description !== '' ? $description : null,
    ]);

    echo json_encode([
        'success' => true,
        'message' => 'Report submitted for moderator review',
        'id' => (int) $db->lastInsertId(),
    ]);
} catch (Throwable $e) {
    error_log('Forum reports API error: ' . $e->getMessage());
    gradtrack_forum_reports_json_error(500, 'Unable to submit this report right now');
}
