<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/forum.php';

function gradtrack_forum_posts_request_data(): array
{
    $contentType = isset($_SERVER['CONTENT_TYPE']) ? strtolower((string) $_SERVER['CONTENT_TYPE']) : '';
    if (strpos($contentType, 'multipart/form-data') !== false) {
        return $_POST;
    }

    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function gradtrack_forum_posts_json_error(int $statusCode, string $message): void
{
    http_response_code($statusCode);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function gradtrack_forum_posts_detail_query(): string
{
    return "SELECT fp.id, fp.graduate_id, fp.title, fp.content, fp.category, fp.status,
                   fp.image_path, fp.image_original_name, fp.image_mime_type, fp.image_file_size_bytes,
                   fp.created_at, fp.updated_at,
                   g.first_name, g.middle_name, g.last_name,
                   p.name AS author_program_name, p.code AS author_program_code,
                   gpi.file_path AS author_profile_image_path,
                   (
                       SELECT COUNT(*)
                       FROM forum_comments fc
                       WHERE fc.post_id = fp.id
                   ) AS comment_count,
                   (
                       SELECT COUNT(*)
                       FROM forum_post_likes fpl
                       WHERE fpl.post_id = fp.id
                   ) AS like_count,
                   (
                       SELECT COUNT(*)
                       FROM forum_reports fr
                       WHERE fr.post_id = fp.id
                         AND fr.target_type = 'post'
                         AND fr.status = 'pending'
                   ) AS report_count,
                   EXISTS(
                       SELECT 1
                       FROM forum_post_likes fpl_self
                       WHERE fpl_self.post_id = fp.id
                         AND fpl_self.graduate_id = :viewer_graduate_id
                   ) AS is_liked
            FROM forum_posts fp
            JOIN graduates g ON g.id = fp.graduate_id
            LEFT JOIN graduate_accounts ga ON ga.graduate_id = g.id
            LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
            LEFT JOIN programs p ON p.id = g.program_id";
}

function gradtrack_forum_posts_normalize_row(array $row): array
{
    $row['id'] = (int) $row['id'];
    $row['graduate_id'] = (int) $row['graduate_id'];
    $row['comment_count'] = isset($row['comment_count']) ? (int) $row['comment_count'] : 0;
    $row['like_count'] = isset($row['like_count']) ? (int) $row['like_count'] : 0;
    $row['report_count'] = isset($row['report_count']) ? (int) $row['report_count'] : 0;
    $row['image_file_size_bytes'] = isset($row['image_file_size_bytes']) ? (int) $row['image_file_size_bytes'] : null;
    $row['is_liked'] = !empty($row['is_liked']);
    $row['author_name'] = trim((string) ($row['first_name'] ?? '') . ' ' . (string) ($row['last_name'] ?? ''));

    return $row;
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST' && isset($_POST['_method']) && strtoupper((string) $_POST['_method']) === 'PUT') {
    $method = 'PUT';
}

try {
    gradtrack_forum_ensure_schema($db);

    if ($method === 'GET') {
        $postId = isset($_GET['id']) ? (int) $_GET['id'] : 0;
        $mineOnly = isset($_GET['mine']) && (string) $_GET['mine'] === '1';
        $search = gradtrack_forum_clean_text($_GET['search'] ?? '');
        $category = gradtrack_forum_clean_text($_GET['category'] ?? '');
        $status = gradtrack_forum_clean_text($_GET['status'] ?? '');

        $graduateUser = gradtrack_current_graduate_user($db);
        $moderator = gradtrack_forum_current_moderator($db);
        $viewerGraduateId = (int) ($graduateUser['graduate_id'] ?? 0);

        if ($postId > 0) {
            $stmt = $db->prepare(gradtrack_forum_posts_detail_query() . ' WHERE fp.id = :id LIMIT 1');
            $stmt->execute([
                ':id' => $postId,
                ':viewer_graduate_id' => $viewerGraduateId,
            ]);
            $post = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$post) {
                gradtrack_forum_posts_json_error(404, 'Forum post not found');
            }

            $isOwner = $graduateUser !== null && (int) $post['graduate_id'] === (int) $graduateUser['graduate_id'];
            $canModerate = $moderator !== null;

            if (($post['status'] ?? 'pending') !== 'approved' && !$isOwner && !$canModerate) {
                gradtrack_forum_posts_json_error(404, 'Forum post not found');
            }

            echo json_encode([
                'success' => true,
                'data' => gradtrack_forum_posts_normalize_row($post),
                'categories' => gradtrack_forum_categories(),
            ]);
            exit;
        }

        $params = [];
        $params[':viewer_graduate_id'] = $viewerGraduateId;
        $sql = gradtrack_forum_posts_detail_query() . ' WHERE 1=1';

        if ($mineOnly) {
            $user = gradtrack_require_graduate_auth($db);
            $sql .= ' AND fp.graduate_id = :graduate_id';
            $params[':graduate_id'] = (int) $user['graduate_id'];

            if (in_array($status, ['approved', 'pending', 'hidden'], true)) {
                $sql .= ' AND fp.status = :status';
                $params[':status'] = $status;
            }
        } else {
            $sql .= " AND fp.status = 'approved'";
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
                OR g.first_name LIKE :search_author_first
                OR g.last_name LIKE :search_author_last
            )";
            $searchTerm = '%' . $search . '%';
            $params[':search_title'] = $searchTerm;
            $params[':search_content'] = $searchTerm;
            $params[':search_category'] = $searchTerm;
            $params[':search_author_first'] = $searchTerm;
            $params[':search_author_last'] = $searchTerm;
        }

        $sql .= ' ORDER BY fp.created_at DESC, fp.id DESC';

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $rows = array_map('gradtrack_forum_posts_normalize_row', $rows);

        echo json_encode([
            'success' => true,
            'data' => $rows,
            'categories' => gradtrack_forum_categories(),
        ]);
        exit;
    }

    if ($method === 'POST') {
        $user = gradtrack_require_graduate_auth($db);
        $data = gradtrack_forum_posts_request_data();

        $title = gradtrack_forum_clean_text($data['title'] ?? '');
        $content = gradtrack_forum_clean_text($data['content'] ?? '');
        $category = gradtrack_forum_clean_text($data['category'] ?? '');

        if ($title === '' || $content === '' || $category === '') {
            gradtrack_forum_posts_json_error(400, 'title, content, and category are required');
        }

        if (!gradtrack_forum_valid_category($category)) {
            gradtrack_forum_posts_json_error(400, 'Invalid forum category');
        }

        $stmt = $db->prepare("INSERT INTO forum_posts (graduate_id, title, content, category, status)
                              VALUES (:graduate_id, :title, :content, :category, 'pending')");
        $stmt->execute([
            ':graduate_id' => (int) $user['graduate_id'],
            ':title' => $title,
            ':content' => $content,
            ':category' => $category,
        ]);

        $postId = (int) $db->lastInsertId();
        if (isset($_FILES['image']) && (int) ($_FILES['image']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            $image = gradtrack_forum_save_post_image($postId, $_FILES['image']);
            $imageStmt = $db->prepare("UPDATE forum_posts
                                       SET image_path = :image_path,
                                           image_original_name = :image_original_name,
                                           image_mime_type = :image_mime_type,
                                           image_file_size_bytes = :image_file_size_bytes
                                       WHERE id = :id");
            $imageStmt->execute([
                ':image_path' => $image['image_path'],
                ':image_original_name' => $image['image_original_name'],
                ':image_mime_type' => $image['image_mime_type'],
                ':image_file_size_bytes' => $image['image_file_size_bytes'],
                ':id' => $postId,
            ]);
        }

        echo json_encode([
            'success' => true,
            'message' => 'Forum post submitted for review',
            'id' => $postId,
            'status' => 'pending',
        ]);
        exit;
    }

    if ($method === 'PUT') {
        $user = gradtrack_require_graduate_auth($db);
        $data = gradtrack_forum_posts_request_data();
        $postId = isset($data['id']) ? (int) $data['id'] : 0;

        if ($postId <= 0) {
            gradtrack_forum_posts_json_error(400, 'id is required');
        }

        $ownerStmt = $db->prepare('SELECT graduate_id, image_path FROM forum_posts WHERE id = :id LIMIT 1');
        $ownerStmt->execute([':id' => $postId]);
        $owner = $ownerStmt->fetch(PDO::FETCH_ASSOC);

        if (!$owner) {
            gradtrack_forum_posts_json_error(404, 'Forum post not found');
        }

        if ((int) $owner['graduate_id'] !== (int) $user['graduate_id']) {
            gradtrack_forum_posts_json_error(403, 'You can only edit your own forum posts');
        }

        $title = gradtrack_forum_clean_text($data['title'] ?? '');
        $content = gradtrack_forum_clean_text($data['content'] ?? '');
        $category = gradtrack_forum_clean_text($data['category'] ?? '');

        if ($title === '' || $content === '' || $category === '') {
            gradtrack_forum_posts_json_error(400, 'title, content, and category are required');
        }

        if (!gradtrack_forum_valid_category($category)) {
            gradtrack_forum_posts_json_error(400, 'Invalid forum category');
        }

        $imagePath = $owner['image_path'] ?? null;
        $imageOriginalName = null;
        $imageMimeType = null;
        $imageFileSizeBytes = null;
        $clearImage = isset($data['remove_image'])
            && ((string) $data['remove_image'] === '1' || (string) $data['remove_image'] === 'true');

        if ($clearImage) {
            gradtrack_forum_remove_post_image($imagePath);
            $imagePath = null;
        }

        if (isset($_FILES['image']) && (int) ($_FILES['image']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            $image = gradtrack_forum_save_post_image($postId, $_FILES['image'], $imagePath);
            $imagePath = $image['image_path'];
            $imageOriginalName = $image['image_original_name'];
            $imageMimeType = $image['image_mime_type'];
            $imageFileSizeBytes = $image['image_file_size_bytes'];
        }

        $updateSql = "UPDATE forum_posts
                      SET title = :title,
                          content = :content,
                          category = :category,
                          status = 'pending',
                          image_path = :image_path,
                          updated_at = NOW()";
        $params = [
            ':title' => $title,
            ':content' => $content,
            ':category' => $category,
            ':image_path' => $imagePath,
            ':id' => $postId,
        ];

        if ($imageOriginalName !== null || $clearImage) {
            $updateSql .= ",
                          image_original_name = :image_original_name,
                          image_mime_type = :image_mime_type,
                          image_file_size_bytes = :image_file_size_bytes";
            $params[':image_original_name'] = $imageOriginalName;
            $params[':image_mime_type'] = $imageMimeType;
            $params[':image_file_size_bytes'] = $imageFileSizeBytes;
        }

        $updateSql .= ' WHERE id = :id';
        $updateStmt = $db->prepare($updateSql);
        $updateStmt->execute($params);

        echo json_encode([
            'success' => true,
            'message' => 'Forum post updated and submitted for review',
            'status' => 'pending',
        ]);
        exit;
    }

    if ($method === 'DELETE') {
        $user = gradtrack_require_graduate_auth($db);
        $data = gradtrack_forum_posts_request_data();
        $postId = isset($_GET['id']) ? (int) $_GET['id'] : (isset($data['id']) ? (int) $data['id'] : 0);

        if ($postId <= 0) {
            gradtrack_forum_posts_json_error(400, 'id is required');
        }

        $ownerStmt = $db->prepare('SELECT graduate_id, image_path FROM forum_posts WHERE id = :id LIMIT 1');
        $ownerStmt->execute([':id' => $postId]);
        $owner = $ownerStmt->fetch(PDO::FETCH_ASSOC);

        if (!$owner) {
            gradtrack_forum_posts_json_error(404, 'Forum post not found');
        }

        if ((int) $owner['graduate_id'] !== (int) $user['graduate_id']) {
            gradtrack_forum_posts_json_error(403, 'You can only delete your own forum posts');
        }

        $deleteStmt = $db->prepare('DELETE FROM forum_posts WHERE id = :id');
        $deleteStmt->execute([':id' => $postId]);
        gradtrack_forum_remove_post_image($owner['image_path'] ?? null);

        echo json_encode([
            'success' => true,
            'message' => 'Forum post deleted successfully',
        ]);
        exit;
    }

    gradtrack_forum_posts_json_error(405, 'Method not allowed');
} catch (Throwable $e) {
    gradtrack_forum_posts_json_error(500, $e->getMessage());
}
