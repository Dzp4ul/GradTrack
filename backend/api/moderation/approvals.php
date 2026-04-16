<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/engagement_approval.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function gradtrack_moderation_json_error(int $statusCode, string $message): void
{
    http_response_code($statusCode);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function gradtrack_moderation_reviewer(): array
{
    if (!isset($_SESSION['user_id'])) {
        gradtrack_moderation_json_error(401, 'Authentication required');
    }

    $role = $_SESSION['role'] ?? '';
    $deanScopes = gradtrack_engagement_dean_program_scopes();
    $canReviewAll = in_array($role, gradtrack_engagement_admin_roles(), true);

    if (!$canReviewAll && !isset($deanScopes[$role])) {
        gradtrack_moderation_json_error(403, 'Only dean accounts can review approvals');
    }

    return [
        'id' => (int) $_SESSION['user_id'],
        'role' => $role,
        'program_scope' => $canReviewAll ? [] : $deanScopes[$role],
        'can_review_all' => $canReviewAll,
    ];
}

function gradtrack_moderation_scope_clause(array $reviewer, string $programAlias, array &$params, string $prefix): string
{
    if ($reviewer['can_review_all']) {
        return '';
    }

    $placeholders = gradtrack_engagement_program_placeholders($reviewer['program_scope'], $params, $prefix);
    return " AND {$programAlias}.code IN ({$placeholders})";
}

function gradtrack_moderation_status_clause(string $column, string $status, array &$params, string $prefix): string
{
    if ($status === 'all') {
        return '';
    }

    $placeholder = ':' . $prefix . '_approval_status';
    $params[$placeholder] = $status;
    return " AND {$column} = {$placeholder}";
}

function gradtrack_moderation_search_clause(array $columns, string $search, array &$params, string $prefix): string
{
    $term = trim($search);
    if ($term === '') {
        return '';
    }

    $parts = [];
    foreach ($columns as $index => $column) {
        $placeholder = ':' . $prefix . '_search_' . $index;
        $parts[] = "{$column} LIKE {$placeholder}";
        $params[$placeholder] = '%' . $term . '%';
    }

    return ' AND (' . implode(' OR ', $parts) . ')';
}

function gradtrack_moderation_counts(PDO $db, string $type, array $reviewer): array
{
    $params = [];

    if ($type === 'mentors') {
        $scopeClause = gradtrack_moderation_scope_clause($reviewer, 'p', $params, 'mentor_count_program');
        $sql = "SELECT m.approval_status, COUNT(*) AS total
                FROM mentors m
                JOIN graduates g ON m.graduate_id = g.id
                LEFT JOIN programs p ON g.program_id = p.id
                WHERE 1=1 {$scopeClause}
                GROUP BY m.approval_status";
    } else {
        $scopeClause = gradtrack_moderation_scope_clause($reviewer, 'p', $params, 'job_count_program');
        $sql = "SELECT jp.approval_status, COUNT(*) AS total
                FROM job_posts jp
                JOIN graduate_accounts ga ON jp.posted_by_account_id = ga.id
                JOIN graduates g ON ga.graduate_id = g.id
                LEFT JOIN programs p ON g.program_id = p.id
                WHERE 1=1 {$scopeClause}
                GROUP BY jp.approval_status";
    }

    $stmt = $db->prepare($sql);
    $stmt->execute($params);

    $counts = ['pending' => 0, 'approved' => 0, 'declined' => 0];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $status = (string) ($row['approval_status'] ?? '');
        if (array_key_exists($status, $counts)) {
            $counts[$status] = (int) $row['total'];
        }
    }

    return $counts;
}

function gradtrack_moderation_fetch_mentors(PDO $db, array $reviewer, string $status, string $search): array
{
    $params = [];
    $scopeClause = gradtrack_moderation_scope_clause($reviewer, 'p', $params, 'mentor_program');
    $statusClause = gradtrack_moderation_status_clause('m.approval_status', $status, $params, 'mentor');
    $searchClause = gradtrack_moderation_search_clause([
        'g.first_name',
        'g.last_name',
        'ga.email',
        'p.code',
        'p.name',
        'm.current_job_title',
        'm.company',
        'm.industry',
        'm.skills',
    ], $search, $params, 'mentor');

    $sql = "SELECT m.id, m.current_job_title, m.company, m.industry, m.skills, m.bio,
                   m.availability_status, m.preferred_topics, m.is_active, m.created_at,
                   m.approval_status, m.approval_reviewed_at, m.approval_notes,
                   reviewer.full_name AS approval_reviewed_by_name,
                   g.first_name, g.middle_name, g.last_name, g.year_graduated,
                   ga.email AS contact_email,
                   p.name AS program_name, p.code AS program_code
            FROM mentors m
            JOIN graduate_accounts ga ON m.graduate_account_id = ga.id
            JOIN graduates g ON m.graduate_id = g.id
            LEFT JOIN programs p ON g.program_id = p.id
            LEFT JOIN admin_users reviewer ON reviewer.id = m.approval_reviewed_by
            WHERE 1=1 {$scopeClause} {$statusClause} {$searchClause}
            ORDER BY CASE m.approval_status
                         WHEN 'pending' THEN 0
                         WHEN 'declined' THEN 1
                         ELSE 2
                     END,
                     m.created_at DESC";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$row) {
        $row['id'] = (int) $row['id'];
        $row['is_active'] = (int) $row['is_active'];
        $row['year_graduated'] = $row['year_graduated'] !== null ? (int) $row['year_graduated'] : null;
    }

    return $rows;
}

function gradtrack_moderation_fetch_jobs(PDO $db, array $reviewer, string $status, string $search): array
{
    $params = [];
    $scopeClause = gradtrack_moderation_scope_clause($reviewer, 'p', $params, 'job_program');
    $statusClause = gradtrack_moderation_status_clause('jp.approval_status', $status, $params, 'job');
    $searchClause = gradtrack_moderation_search_clause([
        'jp.title',
        'jp.company',
        'jp.location',
        'jp.industry',
        'jp.description',
        'jp.required_skills',
        'jp.course_program_fit',
        'g.first_name',
        'g.last_name',
        'ga.email',
        'p.code',
        'p.name',
    ], $search, $params, 'job');

    $sql = "SELECT jp.id, jp.title, jp.company, jp.location, jp.salary_range, jp.job_type,
                   jp.industry, jp.description, jp.required_skills, jp.course_program_fit,
                   jp.application_deadline, jp.contact_email, jp.application_link,
                   jp.application_method, jp.is_active, jp.created_at,
                   jp.approval_status, jp.approval_reviewed_at, jp.approval_notes,
                   reviewer.full_name AS approval_reviewed_by_name,
                   g.first_name, g.middle_name, g.last_name, g.year_graduated,
                   ga.email AS poster_email,
                   p.name AS poster_program_name, p.code AS poster_program_code
            FROM job_posts jp
            JOIN graduate_accounts ga ON jp.posted_by_account_id = ga.id
            JOIN graduates g ON ga.graduate_id = g.id
            LEFT JOIN programs p ON g.program_id = p.id
            LEFT JOIN admin_users reviewer ON reviewer.id = jp.approval_reviewed_by
            WHERE 1=1 {$scopeClause} {$statusClause} {$searchClause}
            ORDER BY CASE jp.approval_status
                         WHEN 'pending' THEN 0
                         WHEN 'declined' THEN 1
                         ELSE 2
                     END,
                     jp.created_at DESC";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$row) {
        $row['id'] = (int) $row['id'];
        $row['is_active'] = (int) $row['is_active'];
        $row['year_graduated'] = $row['year_graduated'] !== null ? (int) $row['year_graduated'] : null;
    }

    return $rows;
}

function gradtrack_moderation_item_program(PDO $db, string $itemType, int $id): ?array
{
    if ($itemType === 'mentor') {
        $sql = "SELECT m.id, p.code AS program_code
                FROM mentors m
                JOIN graduates g ON m.graduate_id = g.id
                LEFT JOIN programs p ON g.program_id = p.id
                WHERE m.id = :id";
    } else {
        $sql = "SELECT jp.id, p.code AS program_code
                FROM job_posts jp
                JOIN graduate_accounts ga ON jp.posted_by_account_id = ga.id
                JOIN graduates g ON ga.graduate_id = g.id
                LEFT JOIN programs p ON g.program_id = p.id
                WHERE jp.id = :id";
    }

    $stmt = $db->prepare($sql);
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
}

function gradtrack_moderation_assert_can_review(array $reviewer, ?array $item): void
{
    if (!$item) {
        gradtrack_moderation_json_error(404, 'Approval item not found');
    }

    if ($reviewer['can_review_all']) {
        return;
    }

    $programCode = (string) ($item['program_code'] ?? '');
    if ($programCode === '' || !in_array($programCode, $reviewer['program_scope'], true)) {
        gradtrack_moderation_json_error(403, 'This item is outside your dean program scope');
    }
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    gradtrack_ensure_engagement_approval_schema($db);
    $reviewer = gradtrack_moderation_reviewer();

    if ($method === 'GET') {
        $status = isset($_GET['status']) ? trim((string) $_GET['status']) : 'pending';
        $search = isset($_GET['search']) ? trim((string) $_GET['search']) : '';
        $allowedStatuses = ['pending', 'approved', 'declined', 'all'];

        if (!in_array($status, $allowedStatuses, true)) {
            $status = 'pending';
        }

        echo json_encode([
            'success' => true,
            'program_scope' => $reviewer['program_scope'],
            'can_review_all' => $reviewer['can_review_all'],
            'summary' => [
                'mentors' => gradtrack_moderation_counts($db, 'mentors', $reviewer),
                'jobs' => gradtrack_moderation_counts($db, 'jobs', $reviewer),
            ],
            'data' => [
                'mentors' => gradtrack_moderation_fetch_mentors($db, $reviewer, $status, $search),
                'jobs' => gradtrack_moderation_fetch_jobs($db, $reviewer, $status, $search),
            ],
        ]);
        exit;
    }

    if ($method === 'PUT') {
        $data = json_decode(file_get_contents('php://input'), true);
        $itemType = isset($data['item_type']) ? trim((string) $data['item_type']) : '';
        $itemId = isset($data['id']) ? (int) $data['id'] : 0;
        $approvalStatus = isset($data['approval_status']) ? trim((string) $data['approval_status']) : '';
        $notes = isset($data['notes']) ? trim((string) $data['notes']) : null;

        if (!in_array($itemType, ['mentor', 'job'], true) || $itemId <= 0) {
            gradtrack_moderation_json_error(400, 'item_type and valid id are required');
        }

        if (!in_array($approvalStatus, ['approved', 'declined'], true)) {
            gradtrack_moderation_json_error(400, 'approval_status must be approved or declined');
        }

        $item = gradtrack_moderation_item_program($db, $itemType, $itemId);
        gradtrack_moderation_assert_can_review($reviewer, $item);

        $table = $itemType === 'mentor' ? 'mentors' : 'job_posts';
        $updateStmt = $db->prepare("UPDATE {$table}
                                    SET approval_status = :approval_status,
                                        approval_reviewed_by = :reviewed_by,
                                        approval_reviewed_at = NOW(),
                                        approval_notes = :notes
                                    WHERE id = :id");
        $updateStmt->execute([
            ':approval_status' => $approvalStatus,
            ':reviewed_by' => $reviewer['id'],
            ':notes' => $notes !== '' ? $notes : null,
            ':id' => $itemId,
        ]);

        echo json_encode([
            'success' => true,
            'message' => ucfirst($itemType) . ' ' . $approvalStatus . ' successfully',
        ]);
        exit;
    }

    gradtrack_moderation_json_error(405, 'Method not allowed');
} catch (Exception $e) {
    gradtrack_moderation_json_error(500, $e->getMessage());
}
