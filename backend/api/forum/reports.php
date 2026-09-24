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

function gradtrack_forum_report_detail(PDO $db, int $reportId, array $user): array
{
    $stmt = $db->prepare("SELECT fr.id, fr.reporter_graduate_id, fr.target_type, fr.post_id, fr.comment_id,
                                 fr.reason, fr.description, fr.status, fr.created_at, fr.reviewed_at,
                                 fp.title AS post_title, fp.content AS post_content, fp.status AS post_status,
                                 fc.comment AS comment_content, fc.status AS comment_status,
                                 CASE WHEN fr.target_type = 'comment' THEN fc.graduate_id ELSE fp.graduate_id END AS author_graduate_id,
                                 reviewer.full_name AS reviewed_by_name
                          FROM forum_reports fr
                          JOIN forum_posts fp ON fp.id = fr.post_id
                          LEFT JOIN forum_comments fc ON fc.id = fr.comment_id
                          LEFT JOIN admin_users reviewer ON reviewer.id = fr.reviewed_by
                          WHERE fr.id = :id
                          LIMIT 1");
    $stmt->execute([':id' => $reportId]);
    $report = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$report) {
        gradtrack_forum_reports_json_error(404, 'Forum report not found');
    }

    $graduateId = (int) $user['graduate_id'];
    $viewerRelation = gradtrack_forum_report_viewer_relation(
        (int) $report['reporter_graduate_id'],
        (int) $report['author_graduate_id'],
        $graduateId
    );
    if ($viewerRelation === null) {
        gradtrack_forum_reports_json_error(403, 'You are not authorized to view this forum report');
    }

    return [
        'id' => (int) $report['id'],
        'target_type' => (string) $report['target_type'],
        'post_id' => (int) $report['post_id'],
        'comment_id' => $report['comment_id'] !== null ? (int) $report['comment_id'] : null,
        'reason' => (string) ($report['reason'] ?? ''),
        'description' => $report['description'],
        'status' => (string) $report['status'],
        'created_at' => $report['created_at'],
        'reviewed_at' => $report['reviewed_at'],
        'reviewed_by_name' => $report['reviewed_by_name'],
        'viewer_relation' => $viewerRelation,
        'post_title' => (string) ($report['post_title'] ?? ''),
        'content' => (string) ($report['target_type'] === 'comment'
            ? ($report['comment_content'] ?? '')
            : ($report['post_content'] ?? '')),
        'content_status' => (string) ($report['target_type'] === 'comment'
            ? ($report['comment_status'] ?? '')
            : ($report['post_status'] ?? '')),
    ];
}

try {
    gradtrack_forum_ensure_schema($db);
    $user = gradtrack_require_graduate_auth($db);

    if ($method === 'GET') {
        $reportId = isset($_GET['id']) ? (int) $_GET['id'] : 0;
        if ($reportId <= 0) {
            gradtrack_forum_reports_json_error(400, 'Forum report ID is required');
        }
        echo json_encode([
            'success' => true,
            'data' => gradtrack_forum_report_detail($db, $reportId, $user),
        ]);
        exit;
    }

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
    gradtrack_forum_reports_json_error(500, 'Unable to process this forum report right now');
}
