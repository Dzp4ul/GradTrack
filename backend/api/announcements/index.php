<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/audit_trail.php';
require_once __DIR__ . '/../config/announcements.php';
require_once __DIR__ . '/../config/admin_auth.php';

function gradtrack_announcements_json_error(int $statusCode, string $message): void
{
    http_response_code($statusCode);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function gradtrack_announcements_request_data(): array
{
    $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
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

function gradtrack_announcements_uploaded_files(string $field): array
{
    if (!isset($_FILES[$field])) {
        return [];
    }

    $upload = $_FILES[$field];
    if (!is_array($upload['name'] ?? null)) {
        return (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE ? [] : [$upload];
    }

    $files = [];
    foreach ($upload['name'] as $index => $name) {
        $error = (int) ($upload['error'][$index] ?? UPLOAD_ERR_NO_FILE);
        if ($error === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        $files[] = [
            'name' => $name,
            'type' => $upload['type'][$index] ?? '',
            'tmp_name' => $upload['tmp_name'][$index] ?? '',
            'error' => $error,
            'size' => $upload['size'][$index] ?? 0,
        ];
    }
    return $files;
}

function gradtrack_announcements_actor(PDO $db): ?array
{
    $graduate = gradtrack_current_graduate_user($db);
    if ($graduate) {
        return ['type' => 'graduate', 'id' => (int) $graduate['graduate_id'], 'user' => $graduate];
    }

    $admin = gradtrack_current_admin_user($db);
    if ($admin !== null && gradtrack_audit_role_is_allowed($admin['role'] ?? '')) {
        return ['type' => 'admin', 'id' => (int) $admin['id'], 'user' => gradtrack_admin_audit_context($admin)];
    }

    return null;
}

function gradtrack_announcements_require_actor(PDO $db): array
{
    $actor = gradtrack_announcements_actor($db);
    if (!$actor) {
        gradtrack_announcements_json_error(401, 'Authentication required');
    }
    return $actor;
}

function gradtrack_announcements_require_alumni_admin(array $actor): void
{
    $role = $actor['type'] === 'admin' ? (string) ($actor['user']['user_role'] ?? '') : '';
    if ($role !== 'alumni_admin') {
        gradtrack_announcements_json_error(403, 'Only the Alumni Admin can manage announcements');
    }
}

function gradtrack_announcements_excerpt(string $content, int $limit = 260): string
{
    $text = trim(preg_replace('/\s+/', ' ', strip_tags($content)) ?? '');
    return function_exists('mb_substr') ? mb_substr($text, 0, $limit) : substr($text, 0, $limit);
}

function gradtrack_announcements_validate_payload(array $data, array $actor): array
{
    $title = trim((string) ($data['title'] ?? ''));
    $content = trim((string) ($data['content'] ?? ''));
    $summary = trim((string) ($data['summary'] ?? ''));

    if ($title === '') {
        throw new InvalidArgumentException('Announcement title is required');
    }
    if ($content === '') {
        throw new InvalidArgumentException('Full announcement content is required');
    }
    if ((function_exists('mb_strlen') ? mb_strlen($content) : strlen($content)) > 60000) {
        throw new InvalidArgumentException('Full announcement content cannot exceed 60,000 characters');
    }
    if ((function_exists('mb_strlen') ? mb_strlen($title) : strlen($title)) > 255) {
        throw new InvalidArgumentException('Announcement title cannot exceed 255 characters');
    }
    if ($summary === '') {
        $summary = gradtrack_announcements_excerpt($content, 500);
    }
    if ((function_exists('mb_strlen') ? mb_strlen($summary) : strlen($summary)) > 500) {
        throw new InvalidArgumentException('Announcement summary cannot exceed 500 characters');
    }

    $graduateCategories = ['general', 'alumni_event', 'career', 'employment', 'seminar', 'training', 'college_activity', 'other'];
    $allowedCategories = $actor['type'] === 'admin'
        ? array_merge($graduateCategories, ['event', 'opportunity', 'urgent'])
        : $graduateCategories;
    $category = strtolower(trim((string) ($data['category'] ?? 'general')));
    if (!in_array($category, $allowedCategories, true)) {
        throw new InvalidArgumentException('Please select a valid announcement category');
    }

    $eventDate = trim((string) ($data['event_date'] ?? ''));
    if ($eventDate !== '') {
        $parsedDate = DateTime::createFromFormat('Y-m-d', $eventDate);
        if (!$parsedDate || $parsedDate->format('Y-m-d') !== $eventDate) {
            throw new InvalidArgumentException('Please provide a valid event date');
        }
    }

    $status = 'published';
    if ($actor['type'] === 'admin') {
        $status = strtolower(trim((string) ($data['status'] ?? 'published')));
        if (!in_array($status, ['draft', 'published', 'archived'], true)) {
            throw new InvalidArgumentException('Please select a valid announcement status');
        }
    }

    return [
        'title' => $title,
        'summary' => $summary,
        'content' => $content,
        'category' => $category,
        'event_date' => $eventDate !== '' ? $eventDate : null,
        'status' => $status,
    ];
}

function gradtrack_announcements_select_sql(): string
{
    return "SELECT a.id, a.graduate_id, a.created_by_admin_id, a.title, a.summary, a.content,
                   a.category, a.event_date, a.cover_image_path, a.cover_image_original_name,
                   a.cover_image_mime_type, a.cover_image_file_size_bytes, a.status,
                   a.published_at, a.created_at, a.updated_at,
                   COALESCE(NULLIF(TRIM(CONCAT_WS(' ', g.first_name, g.middle_name, g.last_name)), ''),
                            NULLIF(TRIM(au.full_name), ''), NULLIF(TRIM(au.username), ''), 'GradTrack') AS author_name,
                   p.name AS author_program_name, p.code AS author_program_code,
                   gpi.file_path AS author_profile_image_path,
                   CASE WHEN a.graduate_id = :viewer_graduate_id THEN 1 ELSE 0 END AS is_owner
            FROM announcements a
            LEFT JOIN graduates g ON g.id = a.graduate_id
            LEFT JOIN graduate_accounts ga ON ga.graduate_id = g.id
            LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
            LEFT JOIN programs p ON p.id = g.program_id
            LEFT JOIN admin_users au ON au.id = a.created_by_admin_id";
}

function gradtrack_announcements_normalize_row(array $row): array
{
    foreach (['id', 'graduate_id', 'created_by_admin_id', 'cover_image_file_size_bytes'] as $key) {
        $row[$key] = isset($row[$key]) ? (int) $row[$key] : null;
    }
    $row['is_owner'] = !empty($row['is_owner']);
    $row['summary'] = trim((string) ($row['summary'] ?? '')) !== ''
        ? (string) $row['summary']
        : gradtrack_announcements_excerpt((string) ($row['content'] ?? ''));
    $row['author_type'] = !empty($row['graduate_id']) ? 'graduate' : 'admin';
    $row['cover_image_path'] = gradtrack_storage_access_reference(
        $row['cover_image_path'] ?? null,
        $row['cover_image_original_name'] ?? null,
        $row['cover_image_mime_type'] ?? null
    );
    $row['author_profile_image_path'] = gradtrack_storage_access_reference($row['author_profile_image_path'] ?? null);
    return $row;
}

function gradtrack_announcements_images(PDO $db, int $announcementId): array
{
    $stmt = $db->prepare('SELECT id, announcement_id, file_path, original_name, mime_type,
                                 file_size_bytes, sort_order, created_at
                          FROM announcement_images
                          WHERE announcement_id = :announcement_id
                          ORDER BY sort_order ASC, id ASC');
    $stmt->execute([':announcement_id' => $announcementId]);
    return array_map(static function (array $row): array {
        foreach (['id', 'announcement_id', 'file_size_bytes', 'sort_order'] as $key) {
            $row[$key] = (int) $row[$key];
        }
        $row['file_path'] = gradtrack_storage_access_reference(
            $row['file_path'] ?? null,
            $row['original_name'] ?? null,
            $row['mime_type'] ?? null
        );
        return $row;
    }, $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function gradtrack_announcements_normalize_rows(PDO $db, array $rows, bool $includeImages = false): array
{
    return array_map(static function (array $row) use ($db, $includeImages): array {
        $normalized = gradtrack_announcements_normalize_row($row);
        if ($includeImages) {
            $normalized['images'] = gradtrack_announcements_images($db, (int) $normalized['id']);
        }
        return $normalized;
    }, $rows);
}

function gradtrack_announcements_insert_gallery_images(PDO $db, int $announcementId, array $files, int $startOrder = 0): array
{
    if (count($files) > 10) {
        throw new InvalidArgumentException('You can upload up to 10 additional announcement images');
    }

    $stmt = $db->prepare('INSERT INTO announcement_images
        (announcement_id, file_path, original_name, mime_type, file_size_bytes, sort_order)
        VALUES (:announcement_id, :file_path, :original_name, :mime_type, :file_size_bytes, :sort_order)');
    $references = [];
    try {
        foreach ($files as $index => $file) {
            $saved = gradtrack_announcements_save_gallery_image($announcementId, $file);
            $references[] = $saved['path'];
            $stmt->execute([
                ':announcement_id' => $announcementId,
                ':file_path' => $saved['path'],
                ':original_name' => $saved['original_name'],
                ':mime_type' => $saved['mime_type'],
                ':file_size_bytes' => $saved['file_size_bytes'],
                ':sort_order' => $startOrder + $index,
            ]);
        }
    } catch (Throwable $error) {
        foreach ($references as $reference) {
            gradtrack_storage_delete_quietly($reference);
        }
        throw $error;
    }
    return $references;
}

function gradtrack_announcements_category_counts(PDO $db, bool $adminOnly = false): array
{
    $adminCondition = $adminOnly ? ' AND created_by_admin_id IS NOT NULL' : '';
    $stmt = $db->query("SELECT category, COUNT(*) AS total FROM announcements
                        WHERE status = 'published'{$adminCondition} GROUP BY category ORDER BY total DESC, category ASC");
    return array_map(static function (array $row): array {
        return ['category' => (string) $row['category'], 'count' => (int) $row['total']];
    }, $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function gradtrack_announcements_recent(PDO $db, int $viewerGraduateId, int $excludeId = 0, int $limit = 5, bool $adminOnly = false): array
{
    $sql = gradtrack_announcements_select_sql() . " WHERE a.status = 'published'";
    if ($adminOnly) {
        $sql .= ' AND a.created_by_admin_id IS NOT NULL';
    }
    if ($excludeId > 0) {
        $sql .= ' AND a.id <> :exclude_id';
    }
    $sql .= ' ORDER BY COALESCE(a.published_at, a.created_at) DESC, a.id DESC LIMIT :recent_limit';
    $stmt = $db->prepare($sql);
    $stmt->bindValue(':viewer_graduate_id', $viewerGraduateId, PDO::PARAM_INT);
    if ($excludeId > 0) {
        $stmt->bindValue(':exclude_id', $excludeId, PDO::PARAM_INT);
    }
    $stmt->bindValue(':recent_limit', max(1, min(10, $limit)), PDO::PARAM_INT);
    $stmt->execute();
    return array_map('gradtrack_announcements_normalize_row', $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function gradtrack_announcements_log(array $actor, string $action, int $recordId, array $metadata = []): void
{
    $actionPast = ['Create' => 'Created', 'Update' => 'Updated', 'Delete' => 'Deleted'][$action] ?? $action;
    if ($actor['type'] === 'graduate') {
        $user = $actor['user'];
        logAuditTrail($user['graduate_id'], gradtrack_audit_graduate_name($user), 'graduate', $user['program_code'] ?? null,
            $action, 'Announcements', "{$actionPast} announcement with record ID {$recordId}.", $recordId, null, $metadata);
        return;
    }

    $user = $actor['user'];
    logAuditTrail($user['user_id'], $user['user_name'], $user['user_role'], $user['department'],
        $action, 'Announcements', "{$actionPast} announcement with record ID {$recordId}.", $recordId, null, $metadata);
}

$database = new Database();
$db = $database->getConnection();
gradtrack_announcements_ensure_schema($db);
gradtrack_ensure_graduate_profile_image_table($db);
$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'POST' && isset($_POST['_method'])) {
    $methodOverride = strtoupper((string) $_POST['_method']);
    if (in_array($methodOverride, ['PUT', 'DELETE'], true)) {
        $method = $methodOverride;
    }
}

try {
    $actor = gradtrack_announcements_actor($db);
    $isPublicRequest = $method === 'GET' && isset($_GET['public']) && $_GET['public'] === '1';
    if (!$actor && !$isPublicRequest) {
        gradtrack_announcements_json_error(401, 'Authentication required');
    }
    $viewerGraduateId = $actor && $actor['type'] === 'graduate' ? (int) $actor['id'] : 0;

    if ($method === 'GET') {
        $announcementId = isset($_GET['id']) ? (int) $_GET['id'] : 0;
        if ($announcementId > 0) {
            $sql = gradtrack_announcements_select_sql() . ' WHERE a.id = :id';
            if ($isPublicRequest) {
                $sql .= " AND a.status = 'published' AND a.created_by_admin_id IS NOT NULL";
            } elseif ($actor['type'] === 'graduate') {
                $sql .= " AND (a.status = 'published' OR a.graduate_id = :access_graduate_id)";
            }
            $stmt = $db->prepare($sql);
            $stmt->bindValue(':viewer_graduate_id', $viewerGraduateId, PDO::PARAM_INT);
            $stmt->bindValue(':id', $announcementId, PDO::PARAM_INT);
            if (!$isPublicRequest && $actor['type'] === 'graduate') {
                $stmt->bindValue(':access_graduate_id', $viewerGraduateId, PDO::PARAM_INT);
            }
            $stmt->execute();
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                gradtrack_announcements_json_error(404, 'Announcement not found');
            }

            $normalized = gradtrack_announcements_normalize_row($row);
            $normalized['images'] = gradtrack_announcements_images($db, $announcementId);
            echo json_encode([
                'success' => true,
                'data' => $normalized,
                'category_counts' => gradtrack_announcements_category_counts($db, $isPublicRequest),
                'recent' => gradtrack_announcements_recent($db, $viewerGraduateId, $announcementId, 5, $isPublicRequest),
            ]);
            exit;
        }

        if (isset($_GET['recent']) && $_GET['recent'] === '1') {
            $recentLimit = max(1, min(10, (int) ($_GET['limit'] ?? 5)));
            echo json_encode([
                'success' => true,
                'data' => gradtrack_announcements_recent($db, $viewerGraduateId, 0, $recentLimit, $isPublicRequest),
                'category_counts' => gradtrack_announcements_category_counts($db, $isPublicRequest),
            ]);
            exit;
        }

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = max(1, min(24, (int) ($_GET['per_page'] ?? 9)));
        $offset = ($page - 1) * $perPage;
        $search = trim((string) ($_GET['search'] ?? ''));
        $category = strtolower(trim((string) ($_GET['category'] ?? '')));
        $mineOnly = isset($_GET['mine']) && $_GET['mine'] === '1';
        $requestedStatus = strtolower(trim((string) ($_GET['status'] ?? '')));

        $conditions = [];
        $params = [];
        if ($isPublicRequest) {
            $conditions[] = "a.status = 'published'";
            $conditions[] = 'a.created_by_admin_id IS NOT NULL';
        } elseif ($actor['type'] === 'graduate') {
            $conditions[] = "a.status = 'published'";
            if ($mineOnly) {
                $conditions[] = 'a.graduate_id = :mine_graduate_id';
                $params[':mine_graduate_id'] = $viewerGraduateId;
            }
        } elseif (in_array($requestedStatus, ['draft', 'published', 'archived'], true)) {
            $conditions[] = 'a.status = :status';
            $params[':status'] = $requestedStatus;
        }
        if ($category !== '' && $category !== 'all') {
            $conditions[] = 'a.category = :category';
            $params[':category'] = $category;
        }
        if ($search !== '') {
            $conditions[] = '(a.title LIKE :search_title OR a.summary LIKE :search_summary OR a.content LIKE :search_content)';
            $searchTerm = '%' . $search . '%';
            $params[':search_title'] = $searchTerm;
            $params[':search_summary'] = $searchTerm;
            $params[':search_content'] = $searchTerm;
        }

        $where = count($conditions) > 0 ? ' WHERE ' . implode(' AND ', $conditions) : '';
        $countStmt = $db->prepare('SELECT COUNT(*) AS total FROM announcements a' . $where);
        $countStmt->execute($params);
        $total = (int) ($countStmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

        $stmt = $db->prepare(gradtrack_announcements_select_sql() . $where
            . ' ORDER BY COALESCE(a.published_at, a.created_at) DESC, a.id DESC LIMIT :limit OFFSET :offset');
        $stmt->bindValue(':viewer_graduate_id', $viewerGraduateId, PDO::PARAM_INT);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value, is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }
        $stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        echo json_encode([
            'success' => true,
            'data' => gradtrack_announcements_normalize_rows($db, $stmt->fetchAll(PDO::FETCH_ASSOC), !$isPublicRequest && $actor['type'] === 'admin'),
            'category_counts' => gradtrack_announcements_category_counts($db, $isPublicRequest),
            'recent' => gradtrack_announcements_recent($db, $viewerGraduateId, 0, 5, $isPublicRequest),
            'pagination' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => max(1, (int) ceil($total / $perPage)),
            ],
        ]);
        exit;
    }

    if ($method === 'POST') {
        gradtrack_announcements_require_alumni_admin($actor);
        $data = gradtrack_announcements_request_data();
        $payload = gradtrack_announcements_validate_payload($data, $actor);
        $publishedAt = $payload['status'] === 'published' ? date('Y-m-d H:i:s') : null;
        $stmt = $db->prepare("INSERT INTO announcements
            (graduate_id, created_by_admin_id, title, summary, content, category, event_date, status, published_at)
            VALUES (:graduate_id, :admin_id, :title, :summary, :content, :category, :event_date, :status, :published_at)");
        $stmt->execute([
            ':graduate_id' => $actor['type'] === 'graduate' ? $actor['id'] : null,
            ':admin_id' => $actor['type'] === 'admin' ? $actor['id'] : null,
            ':title' => $payload['title'], ':summary' => $payload['summary'], ':content' => $payload['content'],
            ':category' => $payload['category'], ':event_date' => $payload['event_date'],
            ':status' => $payload['status'], ':published_at' => $publishedAt,
        ]);
        $announcementId = (int) $db->lastInsertId();

        $createdReferences = [];
        try {
            if (isset($_FILES['cover_image']) && (int) ($_FILES['cover_image']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
                $cover = gradtrack_announcements_save_cover($announcementId, $_FILES['cover_image']);
                $createdReferences[] = $cover['path'];
                $coverStmt = $db->prepare("UPDATE announcements SET cover_image_path = :path,
                    cover_image_original_name = :original_name, cover_image_mime_type = :mime_type,
                    cover_image_file_size_bytes = :file_size WHERE id = :id");
                $coverStmt->execute([':path' => $cover['path'], ':original_name' => $cover['original_name'],
                    ':mime_type' => $cover['mime_type'], ':file_size' => $cover['file_size_bytes'], ':id' => $announcementId]);
            }
            $galleryFiles = gradtrack_announcements_uploaded_files('gallery_images');
            $createdReferences = array_merge(
                $createdReferences,
                gradtrack_announcements_insert_gallery_images($db, $announcementId, $galleryFiles)
            );
        } catch (Throwable $uploadError) {
            $db->prepare('DELETE FROM announcements WHERE id = :id')->execute([':id' => $announcementId]);
            foreach (array_unique($createdReferences) as $createdReference) {
                gradtrack_storage_delete_quietly($createdReference);
            }
            throw $uploadError;
        }

        gradtrack_announcements_log($actor, 'Create', $announcementId, ['category' => $payload['category'], 'status' => $payload['status']]);
        http_response_code(201);
        echo json_encode(['success' => true, 'message' => 'Announcement posted successfully', 'id' => $announcementId]);
        exit;
    }

    if ($method === 'PUT') {
        gradtrack_announcements_require_alumni_admin($actor);
        $data = gradtrack_announcements_request_data();
        $announcementId = (int) ($data['id'] ?? 0);
        if ($announcementId <= 0) {
            gradtrack_announcements_json_error(400, 'Announcement ID is required');
        }
        $ownerStmt = $db->prepare('SELECT * FROM announcements WHERE id = :id LIMIT 1');
        $ownerStmt->execute([':id' => $announcementId]);
        $existing = $ownerStmt->fetch(PDO::FETCH_ASSOC);
        if (!$existing) {
            gradtrack_announcements_json_error(404, 'Announcement not found');
        }
        if ($actor['type'] === 'graduate' && (int) ($existing['graduate_id'] ?? 0) !== (int) $actor['id']) {
            gradtrack_announcements_json_error(403, 'You can only edit your own announcements');
        }

        $payload = gradtrack_announcements_validate_payload($data, $actor);
        $galleryFiles = gradtrack_announcements_uploaded_files('gallery_images');
        $decodedRemovalIds = json_decode((string) ($data['remove_gallery_image_ids'] ?? '[]'), true);
        $removeGalleryIds = is_array($decodedRemovalIds)
            ? array_values(array_unique(array_filter(array_map('intval', $decodedRemovalIds), static fn (int $id): bool => $id > 0)))
            : [];
        $removalRows = [];
        if (count($removeGalleryIds) > 0) {
            $placeholders = implode(',', array_fill(0, count($removeGalleryIds), '?'));
            $removalStmt = $db->prepare("SELECT id, file_path FROM announcement_images
                                         WHERE announcement_id = ? AND id IN ({$placeholders})");
            $removalStmt->execute(array_merge([$announcementId], $removeGalleryIds));
            $removalRows = $removalStmt->fetchAll(PDO::FETCH_ASSOC);
        }
        $galleryCountStmt = $db->prepare('SELECT COUNT(*) AS total, COALESCE(MAX(sort_order), -1) AS max_sort
                                          FROM announcement_images WHERE announcement_id = :announcement_id');
        $galleryCountStmt->execute([':announcement_id' => $announcementId]);
        $galleryStats = $galleryCountStmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $remainingGalleryCount = (int) ($galleryStats['total'] ?? 0) - count($removalRows);
        if ($remainingGalleryCount + count($galleryFiles) > 10) {
            throw new InvalidArgumentException('You can keep up to 10 additional announcement images');
        }
        $publishedAt = $payload['status'] === 'published'
            ? ((string) ($existing['published_at'] ?? '') !== '' ? $existing['published_at'] : date('Y-m-d H:i:s'))
            : null;
        $newStorageReferences = [];
        $oldStorageReferences = [];
        $db->beginTransaction();
        try {
            $stmt = $db->prepare("UPDATE announcements SET title = :title, summary = :summary, content = :content,
                category = :category, event_date = :event_date, status = :status, published_at = :published_at WHERE id = :id");
            $stmt->execute([':title' => $payload['title'], ':summary' => $payload['summary'], ':content' => $payload['content'],
                ':category' => $payload['category'], ':event_date' => $payload['event_date'], ':status' => $payload['status'],
                ':published_at' => $publishedAt, ':id' => $announcementId]);

            $removeImage = isset($data['remove_image']) && (string) $data['remove_image'] === '1';
            $hasNewImage = isset($_FILES['cover_image']) && (int) ($_FILES['cover_image']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;
            if ($hasNewImage) {
                $cover = gradtrack_announcements_save_cover($announcementId, $_FILES['cover_image'], $existing['cover_image_path'] ?? null);
                $newStorageReferences[] = $cover['path'];
                if (!empty($cover['old_path'])) {
                    $oldStorageReferences[] = $cover['old_path'];
                }
                $coverStmt = $db->prepare("UPDATE announcements SET cover_image_path = :path,
                    cover_image_original_name = :original_name, cover_image_mime_type = :mime_type,
                    cover_image_file_size_bytes = :file_size WHERE id = :id");
                $coverStmt->execute([':path' => $cover['path'], ':original_name' => $cover['original_name'],
                    ':mime_type' => $cover['mime_type'], ':file_size' => $cover['file_size_bytes'], ':id' => $announcementId]);
            } elseif ($removeImage && !empty($existing['cover_image_path'])) {
                $oldStorageReferences[] = $existing['cover_image_path'];
                $db->prepare("UPDATE announcements SET cover_image_path = NULL, cover_image_original_name = NULL,
                    cover_image_mime_type = NULL, cover_image_file_size_bytes = NULL WHERE id = :id")
                    ->execute([':id' => $announcementId]);
            }

            foreach ($removalRows as $removalRow) {
                $db->prepare('DELETE FROM announcement_images WHERE id = :id AND announcement_id = :announcement_id')
                    ->execute([':id' => (int) $removalRow['id'], ':announcement_id' => $announcementId]);
                if (!empty($removalRow['file_path'])) {
                    $oldStorageReferences[] = $removalRow['file_path'];
                }
            }
            $nextSortOrder = max(0, (int) ($galleryStats['max_sort'] ?? -1) + 1);
            $newStorageReferences = array_merge(
                $newStorageReferences,
                gradtrack_announcements_insert_gallery_images($db, $announcementId, $galleryFiles, $nextSortOrder)
            );
            $db->commit();
        } catch (Throwable $updateError) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            foreach (array_unique($newStorageReferences) as $newStorageReference) {
                gradtrack_storage_delete_quietly($newStorageReference);
            }
            throw $updateError;
        }
        foreach (array_unique($oldStorageReferences) as $oldStorageReference) {
            if (!in_array($oldStorageReference, $newStorageReferences, true)) {
                gradtrack_storage_delete_quietly($oldStorageReference);
            }
        }

        gradtrack_announcements_log($actor, 'Update', $announcementId, ['category' => $payload['category'], 'status' => $payload['status']]);
        echo json_encode(['success' => true, 'message' => 'Announcement updated successfully', 'id' => $announcementId]);
        exit;
    }

    if ($method === 'DELETE') {
        gradtrack_announcements_require_alumni_admin($actor);
        $data = gradtrack_announcements_request_data();
        $announcementId = (int) ($data['id'] ?? 0);
        if ($announcementId <= 0) {
            gradtrack_announcements_json_error(400, 'Announcement ID is required');
        }
        $ownerStmt = $db->prepare('SELECT graduate_id, cover_image_path FROM announcements WHERE id = :id LIMIT 1');
        $ownerStmt->execute([':id' => $announcementId]);
        $existing = $ownerStmt->fetch(PDO::FETCH_ASSOC);
        if (!$existing) {
            gradtrack_announcements_json_error(404, 'Announcement not found');
        }
        if ($actor['type'] === 'graduate' && (int) ($existing['graduate_id'] ?? 0) !== (int) $actor['id']) {
            gradtrack_announcements_json_error(403, 'You can only delete your own announcements');
        }

        $galleryDeleteStmt = $db->prepare('SELECT file_path FROM announcement_images WHERE announcement_id = :id');
        $galleryDeleteStmt->execute([':id' => $announcementId]);
        $deleteReferences = array_column($galleryDeleteStmt->fetchAll(PDO::FETCH_ASSOC), 'file_path');
        if (!empty($existing['cover_image_path'])) {
            $deleteReferences[] = $existing['cover_image_path'];
        }
        $db->prepare('DELETE FROM announcements WHERE id = :id')->execute([':id' => $announcementId]);
        foreach (array_unique(array_filter($deleteReferences)) as $deleteReference) {
            gradtrack_storage_delete_quietly($deleteReference);
        }
        gradtrack_announcements_log($actor, 'Delete', $announcementId);
        echo json_encode(['success' => true, 'message' => 'Announcement deleted successfully']);
        exit;
    }

    gradtrack_announcements_json_error(405, 'Method not allowed');
} catch (InvalidArgumentException $e) {
    gradtrack_announcements_json_error(422, $e->getMessage());
} catch (Throwable $e) {
    error_log('GradTrack announcements error: ' . $e->getMessage());
    gradtrack_announcements_json_error(500, 'Unable to process the announcement request. Please try again.');
}
