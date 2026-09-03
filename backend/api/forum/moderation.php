<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/forum.php';
require_once __DIR__ . '/../config/audit_trail.php';

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
    $summary = ['pending' => 0, 'resolved' => 0, 'dismissed' => 0];
    $stmt = $db->query("SELECT status, COUNT(*) AS total FROM forum_reports GROUP BY status");
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $status = (string) ($row['status'] ?? '');
        if (array_key_exists($status, $summary)) {
            $summary[$status] = (int) $row['total'];
        }
    }
    $summary['all'] = array_sum($summary);
    return $summary;
}

function gradtrack_forum_moderation_filters(PDO $db): array
{
    $reasonStmt = $db->query("SELECT DISTINCT reason
                              FROM forum_reports
                              WHERE reason IS NOT NULL AND TRIM(reason) <> ''
                              ORDER BY reason ASC");
    return [
        'types' => ['post', 'comment'],
        'reasons' => array_values(array_filter(array_map(static function (array $row): string {
            return trim((string) ($row['reason'] ?? ''));
        }, $reasonStmt->fetchAll(PDO::FETCH_ASSOC)))),
        'statuses' => ['pending', 'resolved', 'dismissed'],
    ];
}

function gradtrack_forum_moderation_where(array $input, array &$params): string
{
    $where = [];
    $status = strtolower(gradtrack_forum_clean_text($input['status'] ?? 'pending'));
    if (!in_array($status, ['pending', 'resolved', 'dismissed', 'all'], true)) {
        $status = 'pending';
    }
    if ($status !== 'all') {
        $where[] = 'fr.status = :report_status';
        $params[':report_status'] = $status;
    }

    $type = strtolower(gradtrack_forum_clean_text($input['type'] ?? ''));
    if (in_array($type, ['post', 'comment'], true)) {
        $where[] = 'fr.target_type = :report_type';
        $params[':report_type'] = $type;
    }

    $reason = gradtrack_forum_clean_text($input['reason'] ?? '');
    if ($reason !== '') {
        $where[] = 'fr.reason = :report_reason';
        $params[':report_reason'] = $reason;
    }

    $search = gradtrack_forum_clean_text($input['search'] ?? '');
    if ($search !== '') {
        $term = '%' . $search . '%';
        $where[] = "(
            fp.title LIKE :search_title
            OR fp.content LIKE :search_post_content
            OR fc.comment LIKE :search_comment
            OR author.first_name LIKE :search_author_first
            OR author.last_name LIKE :search_author_last
            OR reporter.first_name LIKE :search_reporter_first
            OR reporter.last_name LIKE :search_reporter_last
            OR fr.reason LIKE :search_reason
            OR fr.description LIKE :search_description
        )";
        foreach ([
            ':search_title', ':search_post_content', ':search_comment',
            ':search_author_first', ':search_author_last',
            ':search_reporter_first', ':search_reporter_last',
            ':search_reason', ':search_description',
        ] as $placeholder) {
            $params[$placeholder] = $term;
        }
    }

    return count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';
}

function gradtrack_forum_moderation_from_sql(): string
{
    return "FROM forum_reports fr
            JOIN forum_posts fp ON fp.id = fr.post_id
            LEFT JOIN forum_comments fc ON fc.id = fr.comment_id
            JOIN graduates reporter ON reporter.id = fr.reporter_graduate_id
            JOIN graduates author ON author.id = CASE
                WHEN fr.target_type = 'comment' THEN fc.graduate_id
                ELSE fp.graduate_id
            END
            LEFT JOIN programs author_program ON author_program.id = author.program_id";
}

function gradtrack_forum_moderation_reports_for_group(
    PDO $db,
    string $targetType,
    int $postId,
    ?int $commentId,
    string $status
): array {
    $targetClause = $targetType === 'comment' ? 'fr.comment_id = :target_id' : 'fr.post_id = :target_id';
    $stmt = $db->prepare("SELECT fr.id, fr.reporter_graduate_id, fr.target_type, fr.post_id, fr.comment_id,
                                fr.reason, fr.description, fr.status, fr.created_at, fr.reviewed_at, fr.reviewed_by,
                                CONCAT(TRIM(reporter.first_name), ' ', TRIM(reporter.last_name)) AS reporter_name,
                                reviewer.full_name AS reviewed_by_name
                         FROM forum_reports fr
                         JOIN graduates reporter ON reporter.id = fr.reporter_graduate_id
                         LEFT JOIN admin_users reviewer ON reviewer.id = fr.reviewed_by
                         WHERE {$targetClause} AND fr.target_type = :target_type AND fr.status = :status
                         ORDER BY fr.created_at DESC, fr.id DESC");
    $stmt->execute([
        ':target_id' => $targetType === 'comment' ? (int) $commentId : $postId,
        ':target_type' => $targetType,
        ':status' => $status,
    ]);

    return array_map(static function (array $row): array {
        $row['id'] = (int) $row['id'];
        $row['reporter_graduate_id'] = (int) $row['reporter_graduate_id'];
        $row['post_id'] = (int) $row['post_id'];
        $row['comment_id'] = $row['comment_id'] !== null ? (int) $row['comment_id'] : null;
        $row['reviewed_by'] = $row['reviewed_by'] !== null ? (int) $row['reviewed_by'] : null;
        return $row;
    }, $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function gradtrack_forum_moderation_handle_list(PDO $db, array $moderator): void
{
    $params = [];
    $where = gradtrack_forum_moderation_where($_GET, $params);
    $page = isset($_GET['page']) ? max(1, (int) $_GET['page']) : 1;
    $limit = isset($_GET['limit']) ? min(50, max(5, (int) $_GET['limit'])) : 10;
    $offset = ($page - 1) * $limit;
    $from = gradtrack_forum_moderation_from_sql();

    $groupColumns = 'fr.target_type, fr.post_id, fr.comment_id, fr.status';
    $countSql = "SELECT COUNT(*) AS total FROM (
                    SELECT 1 {$from} {$where} GROUP BY {$groupColumns}
                 ) grouped_reports";
    $countStmt = $db->prepare($countSql);
    $countStmt->execute($params);
    $total = (int) ($countStmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

    $sql = "SELECT MIN(fr.id) AS report_id,
                   fr.target_type,
                   fr.post_id,
                   fr.comment_id,
                   fr.status AS report_status,
                   COUNT(*) AS report_count,
                   MIN(fr.created_at) AS first_reported_at,
                   MAX(fr.created_at) AS last_reported_at,
                   MAX(fr.reviewed_at) AS reviewed_at,
                   fp.title AS post_title,
                   fp.content AS post_content,
                   fp.category AS post_category,
                   fp.status AS post_status,
                   fp.image_path,
                   fp.image_original_name,
                   fp.image_mime_type,
                   fp.image_file_size_bytes,
                   fc.comment AS comment_content,
                   fc.status AS comment_status,
                   author.id AS author_graduate_id,
                   author.first_name AS author_first_name,
                   author.last_name AS author_last_name,
                   author_program.code AS author_program_code,
                   author_program.name AS author_program_name
            {$from}
            {$where}
            GROUP BY {$groupColumns}, fp.title, fp.content, fp.category, fp.status,
                     fp.image_path, fp.image_original_name, fp.image_mime_type, fp.image_file_size_bytes,
                     fc.comment, fc.status, author.id, author.first_name, author.last_name,
                     author_program.code, author_program.name
            ORDER BY CASE fr.status WHEN 'pending' THEN 0 WHEN 'resolved' THEN 1 ELSE 2 END,
                     MAX(fr.created_at) DESC, MIN(fr.id) DESC
            LIMIT {$limit} OFFSET {$offset}";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $postIds = array_values(array_unique(array_map(static function (array $item): int {
        return (int) $item['post_id'];
    }, $items)));
    $mediaByPost = gradtrack_forum_post_media_by_post_ids($db, $postIds);

    foreach ($items as &$item) {
        $item['report_id'] = (int) $item['report_id'];
        $item['post_id'] = (int) $item['post_id'];
        $item['comment_id'] = $item['comment_id'] !== null ? (int) $item['comment_id'] : null;
        $item['target_id'] = $item['target_type'] === 'comment' ? $item['comment_id'] : $item['post_id'];
        $item['report_count'] = (int) $item['report_count'];
        $item['author_graduate_id'] = (int) $item['author_graduate_id'];
        $item['author_name'] = trim((string) $item['author_first_name'] . ' ' . (string) $item['author_last_name']);
        $item['content_status'] = $item['target_type'] === 'comment'
            ? (string) $item['comment_status']
            : (string) $item['post_status'];
        $item['content'] = $item['target_type'] === 'comment'
            ? (string) ($item['comment_content'] ?? '')
            : (string) ($item['post_content'] ?? '');
        $item['media'] = $mediaByPost[$item['post_id']] ?? [];
        $item['reports'] = gradtrack_forum_moderation_reports_for_group(
            $db,
            (string) $item['target_type'],
            $item['post_id'],
            $item['comment_id'],
            (string) $item['report_status']
        );
    }
    unset($item);

    echo json_encode([
        'success' => true,
        'moderator' => $moderator,
        'summary' => gradtrack_forum_moderation_summary($db),
        'filters' => gradtrack_forum_moderation_filters($db),
        'data' => $items,
        'pagination' => [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'pages' => max(1, (int) ceil($total / max(1, $limit))),
        ],
    ]);
}

function gradtrack_forum_moderation_handle_action(PDO $db, array $moderator): void
{
    $data = gradtrack_forum_moderation_request_data();
    $reportId = isset($data['report_id']) ? (int) $data['report_id'] : 0;
    $action = strtolower(gradtrack_forum_clean_text($data['action'] ?? ''));
    if ($reportId <= 0 || !in_array($action, ['hide', 'restore', 'resolve', 'dismiss'], true)) {
        gradtrack_forum_moderation_json_error(400, 'A valid report_id and moderation action are required');
    }

    $stmt = $db->prepare("SELECT fr.id, fr.target_type, fr.post_id, fr.comment_id, fr.status,
                                 fp.title, author_program.code AS program_code
                          FROM forum_reports fr
                          JOIN forum_posts fp ON fp.id = fr.post_id
                          LEFT JOIN forum_comments fc ON fc.id = fr.comment_id
                          JOIN graduates author ON author.id = CASE
                              WHEN fr.target_type = 'comment' THEN fc.graduate_id
                              ELSE fp.graduate_id
                          END
                          LEFT JOIN programs author_program ON author_program.id = author.program_id
                          WHERE fr.id = :id LIMIT 1");
    $stmt->execute([':id' => $reportId]);
    $report = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$report) {
        gradtrack_forum_moderation_json_error(404, 'Forum report not found');
    }

    $targetType = (string) $report['target_type'];
    $targetId = $targetType === 'comment' ? (int) $report['comment_id'] : (int) $report['post_id'];
    $targetClause = $targetType === 'comment' ? 'comment_id = :target_id' : 'post_id = :target_id';
    $message = '';

    $db->beginTransaction();
    try {
        if ($action === 'hide' || $action === 'restore') {
            $contentStatus = $action === 'hide' ? 'hidden' : 'approved';
            $contentTable = $targetType === 'comment' ? 'forum_comments' : 'forum_posts';
            $contentStmt = $db->prepare("UPDATE {$contentTable} SET status = :status WHERE id = :id");
            $contentStmt->execute([':status' => $contentStatus, ':id' => $targetId]);

            if ($action === 'hide') {
                $reportStmt = $db->prepare("UPDATE forum_reports
                                            SET status = 'resolved', reviewed_at = NOW(), reviewed_by = :reviewed_by
                                            WHERE target_type = :target_type
                                              AND {$targetClause}
                                              AND status IN ('pending', 'dismissed')");
                $reportStmt->execute([
                    ':reviewed_by' => (int) $moderator['id'],
                    ':target_type' => $targetType,
                    ':target_id' => $targetId,
                ]);
            }
            $message = $action === 'hide' ? 'Reported content hidden and reports resolved.' : 'Content restored to public view.';
        } else {
            $nextStatus = $action === 'dismiss' ? 'dismissed' : 'resolved';
            $reportStmt = $db->prepare("UPDATE forum_reports
                                        SET status = :status, reviewed_at = NOW(), reviewed_by = :reviewed_by
                                        WHERE target_type = :target_type AND {$targetClause} AND status = 'pending'");
            $reportStmt->execute([
                ':status' => $nextStatus,
                ':reviewed_by' => (int) $moderator['id'],
                ':target_type' => $targetType,
                ':target_id' => $targetId,
            ]);
            $message = $action === 'dismiss' ? 'Report dismissed; content remains visible.' : 'Report resolved.';
        }
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }

    $auditAction = ucfirst($action);
    logAuditTrail(
        $moderator['id'],
        $moderator['full_name'] ?: $moderator['email'],
        $moderator['role'],
        $report['program_code'] ?? null,
        $auditAction,
        'Community Forum',
        "{$auditAction} action completed for reported {$targetType} with record ID {$targetId}.",
        $targetId,
        null,
        ['report_id' => $reportId, 'target_type' => $targetType]
    );

    echo json_encode(['success' => true, 'message' => $message]);
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    gradtrack_forum_ensure_schema($db);
    $moderator = gradtrack_forum_require_moderator($db);

    if ($method === 'GET') {
        gradtrack_forum_moderation_handle_list($db, $moderator);
        exit;
    }

    if ($method === 'PUT') {
        gradtrack_forum_moderation_handle_action($db, $moderator);
        exit;
    }

    gradtrack_forum_moderation_json_error(405, 'Method not allowed');
} catch (Throwable $e) {
    error_log('Forum moderation API error: ' . $e->getMessage());
    gradtrack_forum_moderation_json_error(500, 'Unable to process forum reports right now');
}
