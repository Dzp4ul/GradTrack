<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/forum.php';

function gradtrack_forum_moderation_json_error(int $statusCode, string $message): void
{
    http_response_code($statusCode);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function gradtrack_forum_moderation_request_data(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function gradtrack_forum_moderation_summary(PDO $db): array
{
    $stmt = $db->query("SELECT status, COUNT(*) AS total
                        FROM forum_posts
                        GROUP BY status");

    $summary = [
        'approved' => 0,
        'pending' => 0,
        'hidden' => 0,
    ];

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $status = (string) ($row['status'] ?? '');
        if (array_key_exists($status, $summary)) {
            $summary[$status] = (int) $row['total'];
        }
    }

    return $summary;
}

function gradtrack_forum_moderation_comments_by_post(PDO $db, array $postIds): array
{
    if (count($postIds) === 0) {
        return [];
    }

    $placeholders = [];
    $params = [];
    foreach ($postIds as $index => $postId) {
        $placeholder = ':post_id_' . $index;
        $placeholders[] = $placeholder;
        $params[$placeholder] = (int) $postId;
    }

    $stmt = $db->prepare("SELECT fc.id, fc.post_id, fc.graduate_id, fc.comment, fc.created_at,
                                 g.first_name, g.last_name
                          FROM forum_comments fc
                          JOIN graduates g ON g.id = fc.graduate_id
                          WHERE fc.post_id IN (" . implode(', ', $placeholders) . ")
                          ORDER BY fc.created_at DESC, fc.id DESC");
    $stmt->execute($params);

    $grouped = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $postId = (int) $row['post_id'];
        if (!isset($grouped[$postId])) {
            $grouped[$postId] = [];
        }

        $row['id'] = (int) $row['id'];
        $row['post_id'] = $postId;
        $row['graduate_id'] = (int) $row['graduate_id'];
        $row['commenter_name'] = trim((string) ($row['first_name'] ?? '') . ' ' . (string) ($row['last_name'] ?? ''));
        $grouped[$postId][] = $row;
    }

    return $grouped;
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    gradtrack_forum_ensure_schema($db);
    $moderator = gradtrack_forum_require_moderator($db);

    if ($method === 'GET') {
        $status = gradtrack_forum_clean_text($_GET['status'] ?? 'pending');
        $category = gradtrack_forum_clean_text($_GET['category'] ?? '');
        $search = gradtrack_forum_clean_text($_GET['search'] ?? '');

        if (!in_array($status, ['approved', 'pending', 'hidden', 'all'], true)) {
            $status = 'pending';
        }

        $params = [];
        $sql = "SELECT fp.id, fp.graduate_id, fp.title, fp.content, fp.category, fp.status, fp.created_at, fp.updated_at,
                       g.first_name, g.middle_name, g.last_name,
                       p.name AS author_program_name, p.code AS author_program_code,
                       (
                           SELECT COUNT(*)
                           FROM forum_comments fc
                           WHERE fc.post_id = fp.id
                       ) AS comment_count
                FROM forum_posts fp
                JOIN graduates g ON g.id = fp.graduate_id
                LEFT JOIN programs p ON p.id = g.program_id
                WHERE 1=1";

        if ($status !== 'all') {
            $sql .= ' AND fp.status = :status';
            $params[':status'] = $status;
        }

        if ($category !== '' && gradtrack_forum_valid_category($category)) {
            $sql .= ' AND fp.category = :category';
            $params[':category'] = $category;
        }

        if ($search !== '') {
            $sql .= " AND (
                fp.title LIKE :search_title
                OR fp.content LIKE :search_content
                OR fp.category LIKE :search_category
                OR g.first_name LIKE :search_first_name
                OR g.last_name LIKE :search_last_name
            )";
            $searchTerm = '%' . $search . '%';
            $params[':search_title'] = $searchTerm;
            $params[':search_content'] = $searchTerm;
            $params[':search_category'] = $searchTerm;
            $params[':search_first_name'] = $searchTerm;
            $params[':search_last_name'] = $searchTerm;
        }

        $sql .= " ORDER BY CASE fp.status
                              WHEN 'pending' THEN 0
                              WHEN 'hidden' THEN 1
                              ELSE 2
                          END,
                          fp.created_at DESC,
                          fp.id DESC";

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $posts = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $postIds = [];
        foreach ($posts as &$post) {
            $post['id'] = (int) $post['id'];
            $post['graduate_id'] = (int) $post['graduate_id'];
            $post['comment_count'] = (int) ($post['comment_count'] ?? 0);
            $post['author_name'] = trim((string) ($post['first_name'] ?? '') . ' ' . (string) ($post['last_name'] ?? ''));
            $postIds[] = $post['id'];
        }
        unset($post);

        $commentsByPost = gradtrack_forum_moderation_comments_by_post($db, $postIds);
        foreach ($posts as &$post) {
            $post['comments'] = $commentsByPost[$post['id']] ?? [];
        }
        unset($post);

        echo json_encode([
            'success' => true,
            'moderator' => $moderator,
            'summary' => gradtrack_forum_moderation_summary($db),
            'categories' => gradtrack_forum_categories(),
            'data' => $posts,
        ]);
        exit;
    }

    if ($method === 'PUT') {
        $data = gradtrack_forum_moderation_request_data();
        $postId = isset($data['id']) ? (int) $data['id'] : 0;
        $status = gradtrack_forum_clean_text($data['status'] ?? '');

        if ($postId <= 0 || !in_array($status, ['approved', 'pending', 'hidden'], true)) {
            gradtrack_forum_moderation_json_error(400, 'Valid id and status are required');
        }

        $existsStmt = $db->prepare('SELECT id FROM forum_posts WHERE id = :id LIMIT 1');
        $existsStmt->execute([':id' => $postId]);
        if (!$existsStmt->fetch(PDO::FETCH_ASSOC)) {
            gradtrack_forum_moderation_json_error(404, 'Forum post not found');
        }

        $stmt = $db->prepare('UPDATE forum_posts SET status = :status, updated_at = NOW() WHERE id = :id');
        $stmt->execute([
            ':status' => $status,
            ':id' => $postId,
        ]);

        echo json_encode([
            'success' => true,
            'message' => 'Forum post status updated successfully',
        ]);
        exit;
    }

    if ($method === 'DELETE') {
        $data = gradtrack_forum_moderation_request_data();
        $postId = isset($_GET['post_id']) ? (int) $_GET['post_id'] : (isset($data['post_id']) ? (int) $data['post_id'] : 0);
        $commentId = isset($_GET['comment_id']) ? (int) $_GET['comment_id'] : (isset($data['comment_id']) ? (int) $data['comment_id'] : 0);

        if ($postId > 0) {
            $existsStmt = $db->prepare('SELECT id FROM forum_posts WHERE id = :id LIMIT 1');
            $existsStmt->execute([':id' => $postId]);
            if (!$existsStmt->fetch(PDO::FETCH_ASSOC)) {
                gradtrack_forum_moderation_json_error(404, 'Forum post not found');
            }

            $deleteStmt = $db->prepare('DELETE FROM forum_posts WHERE id = :id');
            $deleteStmt->execute([':id' => $postId]);

            echo json_encode([
                'success' => true,
                'message' => 'Forum post deleted successfully',
            ]);
            exit;
        }

        if ($commentId > 0) {
            $existsStmt = $db->prepare('SELECT id FROM forum_comments WHERE id = :id LIMIT 1');
            $existsStmt->execute([':id' => $commentId]);
            if (!$existsStmt->fetch(PDO::FETCH_ASSOC)) {
                gradtrack_forum_moderation_json_error(404, 'Comment not found');
            }

            $deleteStmt = $db->prepare('DELETE FROM forum_comments WHERE id = :id');
            $deleteStmt->execute([':id' => $commentId]);

            echo json_encode([
                'success' => true,
                'message' => 'Comment deleted successfully',
            ]);
            exit;
        }

        gradtrack_forum_moderation_json_error(400, 'post_id or comment_id is required');
    }

    gradtrack_forum_moderation_json_error(405, 'Method not allowed');
} catch (Throwable $e) {
    gradtrack_forum_moderation_json_error(500, $e->getMessage());
}
