<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/audit_trail.php';
require_once __DIR__ . '/../config/alumni_registry.php';

function alumni_registry_json_error(int $statusCode, string $message): void
{
    http_response_code($statusCode);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function alumni_registry_request_data(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function alumni_registry_allowed_source_file(string $fileName): bool
{
    $extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    return in_array($extension, ['xlsx', 'csv'], true);
}

function alumni_registry_normalize_status($value): string
{
    $status = gradtrack_alumni_registry_clean_text($value, 20);
    foreach (gradtrack_alumni_registry_statuses() as $allowed) {
        if (strcasecmp($status, $allowed) === 0) {
            return $allowed;
        }
    }

    return 'Unclaimed';
}

function alumni_registry_filter_clause(array $input, array &$params): string
{
    $where = [];

    $search = gradtrack_alumni_registry_clean_text($input['search'] ?? '', 120);
    if ($search !== '') {
        $where[] = "(ra.full_name LIKE :search_name
                     OR ra.normalized_name LIKE :search_normalized
                     OR ra.course_name LIKE :search_course
                     OR ra.course_code LIKE :search_code)";
        $searchTerm = '%' . $search . '%';
        $params[':search_name'] = $searchTerm;
        $params[':search_normalized'] = '%' . gradtrack_alumni_registry_normalize_name($search) . '%';
        $params[':search_course'] = $searchTerm;
        $params[':search_code'] = $searchTerm;
    }

    if (isset($input['course_id']) && (int) $input['course_id'] > 0) {
        $where[] = 'ra.course_id = :course_id';
        $params[':course_id'] = (int) $input['course_id'];
    }

    $courseCode = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) ($input['course_code'] ?? '')) ?: '');
    if ($courseCode !== '') {
        $where[] = 'ra.course_code = :course_code';
        $params[':course_code'] = $courseCode;
    }

    $batchYear = gradtrack_alumni_registry_normalize_batch_year($input['batch_year'] ?? '');
    if ($batchYear !== null) {
        $where[] = 'ra.batch_year = :batch_year';
        $params[':batch_year'] = $batchYear;
    }

    $status = gradtrack_alumni_registry_clean_text($input['registration_status'] ?? ($input['status'] ?? ''), 20);
    if ($status !== '') {
        $normalizedStatus = alumni_registry_normalize_status($status);
        if (in_array($normalizedStatus, gradtrack_alumni_registry_statuses(), true)) {
            $where[] = 'ra.registration_status = :registration_status';
            $params[':registration_status'] = $normalizedStatus;
        }
    }

    $surveyAnswerStatus = strtolower(gradtrack_alumni_registry_clean_text($input['survey_answer_status'] ?? '', 30));
    if (in_array($surveyAnswerStatus, ['answered', 'done', 'done_answering'], true)) {
        $where[] = "ra.registration_status IN ('Registered', 'Verified')";
    } elseif (in_array($surveyAnswerStatus, ['not_answered', 'unanswered', 'not_done', 'pending'], true)) {
        $where[] = "ra.registration_status = 'Unclaimed'";
    }

    $scope = gradtrack_alumni_registry_clean_text($input['scope'] ?? '', 40);
    if ($scope === 'unclaimed') {
        $where[] = "ra.registration_status = 'Unclaimed'";
    } elseif ($scope === 'registered') {
        $where[] = "(ra.registration_status IN ('Registered', 'Verified') OR ra.linked_user_id IS NOT NULL)";
    }

    return count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';
}

function alumni_registry_sort_clause(array $input): string
{
    $sort = gradtrack_alumni_registry_clean_text($input['sort'] ?? 'import_date', 30);
    $direction = strtolower(gradtrack_alumni_registry_clean_text($input['direction'] ?? 'desc', 10)) === 'asc' ? 'ASC' : 'DESC';
    $columns = [
        'name' => 'ra.full_name',
        'course' => 'ra.course_name',
        'batch' => 'ra.batch_year',
        'import_date' => 'ra.created_at',
    ];

    $column = $columns[$sort] ?? $columns['import_date'];
    return "ORDER BY {$column} {$direction}, ra.id DESC";
}

function alumni_registry_cast_record(array $row): array
{
    $row['id'] = (int) $row['id'];
    $row['course_id'] = $row['course_id'] !== null ? (int) $row['course_id'] : null;
    $row['batch_year'] = (int) $row['batch_year'];
    $row['linked_user_id'] = $row['linked_user_id'] !== null ? (int) $row['linked_user_id'] : null;
    $row['import_batch_id'] = $row['import_batch_id'] !== null ? (int) $row['import_batch_id'] : null;
    if (isset($row['linked_graduate_id'])) {
        $row['linked_graduate_id'] = $row['linked_graduate_id'] !== null ? (int) $row['linked_graduate_id'] : null;
    }

    return $row;
}

function alumni_registry_clean_review_reason($value): ?string
{
    $reason = gradtrack_alumni_registry_clean_text($value, 1000);
    return $reason !== '' ? $reason : null;
}

function alumni_registry_cast_account_review_row(array $row): array
{
    $fullName = trim((string) ($row['first_name'] ?? '') . ' ' . ((string) ($row['middle_name'] ?? '') !== '' ? (string) $row['middle_name'] . ' ' : '') . (string) ($row['last_name'] ?? ''));

    return [
        'account_id' => (int) $row['account_id'],
        'graduate_id' => (int) $row['graduate_id'],
        'email' => (string) ($row['email'] ?? ''),
        'account_status' => (string) ($row['account_status'] ?? ''),
        'alumni_verification_status' => (string) ($row['alumni_verification_status'] ?? 'pending'),
        'alumni_verification_reason' => $row['alumni_verification_reason'],
        'alumni_verification_submitted_at' => $row['alumni_verification_submitted_at'],
        'alumni_verification_reviewed_at' => $row['alumni_verification_reviewed_at'],
        'reviewed_by_name' => $row['reviewed_by_name'],
        'full_name' => $fullName,
        'student_id' => $row['student_id'],
        'first_name' => $row['first_name'],
        'middle_name' => $row['middle_name'],
        'last_name' => $row['last_name'],
        'phone' => $row['phone'],
        'year_graduated' => $row['year_graduated'] !== null ? (int) $row['year_graduated'] : null,
        'address' => $row['address'],
        'program_id' => $row['program_id'] !== null ? (int) $row['program_id'] : null,
        'program_name' => $row['program_name'],
        'program_code' => $row['program_code'],
        'source_survey_response_id' => $row['source_survey_response_id'] !== null ? (int) $row['source_survey_response_id'] : null,
        'survey_submitted_at' => $row['survey_submitted_at'],
        'linked_registry_id' => $row['linked_registry_id'] !== null ? (int) $row['linked_registry_id'] : null,
        'linked_registry_name' => $row['linked_registry_name'],
        'linked_registry_status' => $row['linked_registry_status'],
        'linked_registry_course_code' => $row['linked_registry_course_code'],
        'linked_registry_batch_year' => $row['linked_registry_batch_year'] !== null ? (int) $row['linked_registry_batch_year'] : null,
    ];
}

function alumni_registry_account_review_select(): string
{
    return "SELECT ga.id AS account_id, ga.email, ga.status AS account_status,
                   ga.alumni_verification_status, ga.alumni_verification_reason,
                   ga.alumni_verification_submitted_at, ga.alumni_verification_reviewed_at,
                   ga.source_survey_response_id,
                   g.id AS graduate_id, g.student_id, g.first_name, g.middle_name, g.last_name,
                   g.phone, g.year_graduated, g.address,
                   p.id AS program_id, p.name AS program_name, p.code AS program_code,
                   sr.submitted_at AS survey_submitted_at,
                   ra.id AS linked_registry_id, ra.full_name AS linked_registry_name,
                   ra.registration_status AS linked_registry_status,
                   ra.course_code AS linked_registry_course_code,
                   ra.batch_year AS linked_registry_batch_year,
                   reviewer.full_name AS reviewed_by_name
            FROM graduate_accounts ga
            JOIN graduates g ON g.id = ga.graduate_id
            LEFT JOIN programs p ON p.id = g.program_id
            LEFT JOIN survey_responses sr ON sr.id = ga.source_survey_response_id
            LEFT JOIN registered_alumni ra ON ra.linked_user_id = ga.id
            LEFT JOIN admin_users reviewer ON reviewer.id = ga.alumni_verification_reviewed_by";
}

function alumni_registry_fetch_account_review(PDO $db, int $accountId): ?array
{
    $stmt = $db->prepare(alumni_registry_account_review_select() . ' WHERE ga.id = :account_id LIMIT 1');
    $stmt->execute([':account_id' => $accountId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    return $row ? alumni_registry_cast_account_review_row($row) : null;
}

function alumni_registry_base_select(): string
{
    return "SELECT ra.id, ra.full_name, ra.normalized_name, ra.course_id, ra.course_name, ra.course_code,
                   ra.batch_year, ra.registration_status, ra.linked_user_id, ra.source_file,
                   ra.import_batch_id, ra.created_at, ra.updated_at,
                   ga.email AS linked_email, ga.status AS linked_account_status,
                   ga.alumni_verification_status AS linked_verification_status,
                   ga.alumni_verification_reason AS linked_verification_reason,
                   ga.alumni_verification_reviewed_at AS linked_verification_reviewed_at,
                   g.id AS linked_graduate_id, g.first_name AS linked_first_name,
                   g.middle_name AS linked_middle_name, g.last_name AS linked_last_name
            FROM registered_alumni ra
            LEFT JOIN graduate_accounts ga ON ga.id = ra.linked_user_id
            LEFT JOIN graduates g ON g.id = ga.graduate_id";
}

function alumni_registry_handle_list(PDO $db): void
{
    $params = [];
    $whereClause = alumni_registry_filter_clause($_GET, $params);
    $page = isset($_GET['page']) ? max(1, (int) $_GET['page']) : 1;
    $limit = isset($_GET['limit']) ? min(200, max(5, (int) $_GET['limit'])) : 10;
    $offset = ($page - 1) * $limit;
    $sortClause = alumni_registry_sort_clause($_GET);

    $countStmt = $db->prepare("SELECT COUNT(*) AS total FROM registered_alumni ra {$whereClause}");
    $countStmt->execute($params);
    $total = (int) ($countStmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

    $sql = alumni_registry_base_select() . " {$whereClause} {$sortClause} LIMIT {$limit} OFFSET {$offset}";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $records = array_map('alumni_registry_cast_record', $stmt->fetchAll(PDO::FETCH_ASSOC));

    echo json_encode([
        'success' => true,
        'data' => $records,
        'pagination' => [
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'pages' => (int) ceil($total / max(1, $limit)),
        ],
    ]);
}

function alumni_registry_handle_summary(PDO $db): void
{
    $summaryStmt = $db->query("SELECT
            COUNT(*) AS total_official,
            SUM(CASE WHEN linked_user_id IS NOT NULL OR registration_status IN ('Registered', 'Verified') THEN 1 ELSE 0 END) AS registered_accounts,
            SUM(CASE WHEN registration_status = 'Unclaimed' THEN 1 ELSE 0 END) AS unclaimed_alumni,
            SUM(CASE WHEN registration_status = 'Verified' THEN 1 ELSE 0 END) AS verified_alumni,
            SUM(CASE WHEN registration_status IN ('Registered', 'Verified') THEN 1 ELSE 0 END) AS answered_alumni,
            SUM(CASE WHEN registration_status = 'Unclaimed' THEN 1 ELSE 0 END) AS not_answered_alumni
        FROM registered_alumni");
    $summary = $summaryStmt->fetch(PDO::FETCH_ASSOC) ?: [];

    $accountSummaryStmt = $db->query("SELECT
            COUNT(*) AS total_graduate_accounts,
            SUM(CASE WHEN status = 'pending_verification' OR alumni_verification_status = 'pending' THEN 1 ELSE 0 END) AS pending_verification_accounts,
            SUM(CASE WHEN status = 'active' AND alumni_verification_status = 'approved' THEN 1 ELSE 0 END) AS approved_verification_accounts,
            SUM(CASE WHEN status = 'rejected' OR alumni_verification_status = 'rejected' THEN 1 ELSE 0 END) AS rejected_verification_accounts
        FROM graduate_accounts");
    $accountSummary = $accountSummaryStmt->fetch(PDO::FETCH_ASSOC) ?: [];

    $courseTotals = array_fill_keys(array_keys(gradtrack_alumni_registry_canonical_courses()), 0);
    $courseStmt = $db->query("SELECT course_code, COUNT(*) AS total
                              FROM registered_alumni
                              GROUP BY course_code");
    foreach ($courseStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $code = strtoupper((string) ($row['course_code'] ?? ''));
        $courseTotals[$code] = (int) ($row['total'] ?? 0);
    }

    $programStmt = $db->query('SELECT id, code, name FROM programs ORDER BY code ASC');
    $programs = [];
    foreach ($programStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $programs[] = [
            'id' => (int) $row['id'],
            'code' => (string) $row['code'],
            'name' => (string) $row['name'],
        ];
    }

    $yearStmt = $db->query('SELECT DISTINCT batch_year FROM registered_alumni ORDER BY batch_year DESC');
    $batchYears = array_map(static function (array $row): int {
        return (int) $row['batch_year'];
    }, $yearStmt->fetchAll(PDO::FETCH_ASSOC));

    echo json_encode([
        'success' => true,
        'summary' => [
            'total_official_alumni' => (int) ($summary['total_official'] ?? 0),
            'registered_accounts' => (int) ($summary['registered_accounts'] ?? 0),
            'unclaimed_alumni' => (int) ($summary['unclaimed_alumni'] ?? 0),
            'verified_alumni' => (int) ($summary['verified_alumni'] ?? 0),
            'answered_alumni' => (int) ($summary['answered_alumni'] ?? 0),
            'not_answered_alumni' => (int) ($summary['not_answered_alumni'] ?? 0),
            'total_graduate_accounts' => (int) ($accountSummary['total_graduate_accounts'] ?? 0),
            'pending_verification_accounts' => (int) ($accountSummary['pending_verification_accounts'] ?? 0),
            'approved_verification_accounts' => (int) ($accountSummary['approved_verification_accounts'] ?? 0),
            'rejected_verification_accounts' => (int) ($accountSummary['rejected_verification_accounts'] ?? 0),
            'course_totals' => $courseTotals,
        ],
        'filters' => [
            'programs' => $programs,
            'course_codes' => array_keys(gradtrack_alumni_registry_canonical_courses()),
            'batch_years' => $batchYears,
            'statuses' => gradtrack_alumni_registry_statuses(),
            'verification_statuses' => ['pending', 'approved', 'rejected'],
        ],
    ]);
}

function alumni_registry_fetch_record(PDO $db, int $id): ?array
{
    $stmt = $db->prepare(alumni_registry_base_select() . ' WHERE ra.id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    return $row ? alumni_registry_cast_record($row) : null;
}

function alumni_registry_handle_detail(PDO $db): void
{
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($id <= 0) {
        alumni_registry_json_error(400, 'Registry record ID is required');
    }

    $record = alumni_registry_fetch_record($db, $id);
    if (!$record) {
        alumni_registry_json_error(404, 'Alumni registry record not found');
    }

    echo json_encode(['success' => true, 'data' => $record]);
}

function alumni_registry_handle_accounts(PDO $db): void
{
    $registryId = isset($_GET['registry_id']) ? (int) $_GET['registry_id'] : 0;
    $search = gradtrack_alumni_registry_clean_text($_GET['search'] ?? '', 120);
    $record = $registryId > 0 ? alumni_registry_fetch_record($db, $registryId) : null;

    $params = [];
    $where = ["(linked_ra.id IS NULL OR linked_ra.id = :registry_id)"];
    $params[':registry_id'] = $registryId;

    if ($record) {
        $where[] = "(p.code = :record_course_code OR g.year_graduated = :record_batch_year OR CONCAT(g.first_name, ' ', COALESCE(g.middle_name, ''), ' ', g.last_name) LIKE :record_name)";
        $params[':record_course_code'] = $record['course_code'];
        $params[':record_batch_year'] = $record['batch_year'];
        $nameParts = explode(' ', (string) $record['normalized_name']);
        $lastNameProbe = end($nameParts) ?: (string) $record['full_name'];
        $params[':record_name'] = '%' . $lastNameProbe . '%';
    }

    if ($search !== '') {
        $where[] = "(ga.email LIKE :search_email
                     OR g.first_name LIKE :search_first
                     OR g.middle_name LIKE :search_middle
                     OR g.last_name LIKE :search_last
                     OR CONCAT(g.first_name, ' ', COALESCE(g.middle_name, ''), ' ', g.last_name) LIKE :search_full
                     OR p.code LIKE :search_program)";
        $term = '%' . $search . '%';
        $params[':search_email'] = $term;
        $params[':search_first'] = $term;
        $params[':search_middle'] = $term;
        $params[':search_last'] = $term;
        $params[':search_full'] = $term;
        $params[':search_program'] = $term;
    }

    if (!$record && $search === '') {
        alumni_registry_json_error(400, 'Search text or registry_id is required');
    }

    $sql = "SELECT ga.id AS account_id, ga.email, ga.status AS account_status,
                   g.id AS graduate_id, g.first_name, g.middle_name, g.last_name,
                   g.year_graduated, p.id AS program_id, p.name AS program_name, p.code AS program_code,
                   linked_ra.id AS linked_registry_id
            FROM graduate_accounts ga
            JOIN graduates g ON g.id = ga.graduate_id
            LEFT JOIN programs p ON p.id = g.program_id
            LEFT JOIN registered_alumni linked_ra ON linked_ra.linked_user_id = ga.id
            WHERE " . implode(' AND ', $where) . "
            ORDER BY CASE WHEN p.code = :order_course_code THEN 0 ELSE 1 END,
                     CASE WHEN g.year_graduated = :order_batch_year THEN 0 ELSE 1 END,
                     g.last_name ASC,
                     g.first_name ASC
            LIMIT 30";

    $params[':order_course_code'] = $record['course_code'] ?? '';
    $params[':order_batch_year'] = $record['batch_year'] ?? 0;

    $stmt = $db->prepare($sql);
    $stmt->execute($params);

    $accounts = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $account = [
            'account_id' => (int) $row['account_id'],
            'graduate_id' => (int) $row['graduate_id'],
            'email' => (string) ($row['email'] ?? ''),
            'account_status' => (string) ($row['account_status'] ?? ''),
            'full_name' => trim((string) ($row['first_name'] ?? '') . ' ' . ((string) ($row['middle_name'] ?? '') !== '' ? (string) $row['middle_name'] . ' ' : '') . (string) ($row['last_name'] ?? '')),
            'normalized_name' => '',
            'program_id' => $row['program_id'] !== null ? (int) $row['program_id'] : null,
            'program_name' => $row['program_name'],
            'program_code' => $row['program_code'],
            'batch_year' => $row['year_graduated'] !== null ? (int) $row['year_graduated'] : null,
            'linked_registry_id' => $row['linked_registry_id'] !== null ? (int) $row['linked_registry_id'] : null,
        ];
        $account['normalized_name'] = gradtrack_alumni_registry_normalize_name($account['full_name']);
        $account['match_strength'] = $record ? gradtrack_alumni_registry_match_strength($record, $account) : 'review';
        $accounts[] = $account;
    }

    echo json_encode(['success' => true, 'data' => $accounts]);
}

function alumni_registry_handle_pending_accounts(PDO $db): void
{
    $verificationStatus = strtolower(gradtrack_alumni_registry_clean_text($_GET['verification_status'] ?? 'pending', 20));
    if (!in_array($verificationStatus, ['pending', 'approved', 'rejected', 'all'], true)) {
        $verificationStatus = 'pending';
    }

    $params = [];
    $where = [];

    if ($verificationStatus === 'pending') {
        $where[] = "(ga.status = 'pending_verification' OR ga.alumni_verification_status = 'pending')";
    } elseif ($verificationStatus === 'approved') {
        $where[] = "(ga.status = 'active' AND ga.alumni_verification_status = 'approved')";
    } elseif ($verificationStatus === 'rejected') {
        $where[] = "(ga.status = 'rejected' OR ga.alumni_verification_status = 'rejected')";
    }

    $search = gradtrack_alumni_registry_clean_text($_GET['search'] ?? '', 120);
    if ($search !== '') {
        $where[] = "(ga.email LIKE :search_email
                     OR g.student_id LIKE :search_student
                     OR g.first_name LIKE :search_first
                     OR g.middle_name LIKE :search_middle
                     OR g.last_name LIKE :search_last
                     OR CONCAT(g.first_name, ' ', COALESCE(g.middle_name, ''), ' ', g.last_name) LIKE :search_full
                     OR p.name LIKE :search_program
                     OR p.code LIKE :search_code)";
        $term = '%' . $search . '%';
        $params[':search_email'] = $term;
        $params[':search_student'] = $term;
        $params[':search_first'] = $term;
        $params[':search_middle'] = $term;
        $params[':search_last'] = $term;
        $params[':search_full'] = $term;
        $params[':search_program'] = $term;
        $params[':search_code'] = $term;
    }

    $whereClause = count($where) > 0 ? ' WHERE ' . implode(' AND ', $where) : '';
    $limit = isset($_GET['limit']) ? min(100, max(5, (int) $_GET['limit'])) : 25;

    $stmt = $db->prepare(alumni_registry_account_review_select() . "
        {$whereClause}
        ORDER BY
            CASE
                WHEN ga.status = 'pending_verification' OR ga.alumni_verification_status = 'pending' THEN 0
                WHEN ga.status = 'rejected' OR ga.alumni_verification_status = 'rejected' THEN 1
                ELSE 2
            END,
            COALESCE(ga.alumni_verification_submitted_at, ga.created_at) DESC,
            ga.id DESC
        LIMIT {$limit}");
    $stmt->execute($params);

    $accounts = array_map('alumni_registry_cast_account_review_row', $stmt->fetchAll(PDO::FETCH_ASSOC));
    echo json_encode([
        'success' => true,
        'data' => $accounts,
        'filter' => [
            'verification_status' => $verificationStatus,
            'limit' => $limit,
        ],
    ]);
}

function alumni_registry_verified_registry_for_account(PDO $db, int $accountId): ?array
{
    gradtrack_alumni_registry_sync_for_graduate_account($db, $accountId);

    $stmt = $db->prepare("SELECT id, full_name, course_code, batch_year, registration_status
                          FROM registered_alumni
                          WHERE linked_user_id = :account_id
                          LIMIT 1");
    $stmt->execute([':account_id' => $accountId]);
    $record = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$record) {
        return null;
    }

    $update = $db->prepare("UPDATE registered_alumni
                            SET registration_status = 'Verified'
                            WHERE id = :id");
    $update->execute([':id' => (int) $record['id']]);
    $record['registration_status'] = 'Verified';

    return $record;
}

function alumni_registry_unlink_registry_for_account(PDO $db, int $accountId): void
{
    $stmt = $db->prepare("UPDATE registered_alumni
                          SET linked_user_id = NULL,
                              registration_status = CASE
                                  WHEN registration_status = 'Inactive' THEN 'Inactive'
                                  ELSE 'Unclaimed'
                              END
                          WHERE linked_user_id = :account_id");
    $stmt->execute([':account_id' => $accountId]);
}

function alumni_registry_handle_account_review(PDO $db, array $admin, string $decision): void
{
    $data = alumni_registry_request_data();
    $accountId = isset($data['graduate_account_id']) ? (int) $data['graduate_account_id'] : (isset($data['account_id']) ? (int) $data['account_id'] : 0);
    if ($accountId <= 0) {
        alumni_registry_json_error(400, 'Graduate account ID is required');
    }

    $account = alumni_registry_fetch_account_review($db, $accountId);
    if (!$account) {
        alumni_registry_json_error(404, 'Graduate account not found');
    }

    $decision = strtolower($decision);
    $isApproval = $decision === 'approve';
    $reason = alumni_registry_clean_review_reason($data['rejection_reason'] ?? ($data['reason'] ?? null));

    try {
        $db->beginTransaction();

        $registry = null;
        if ($isApproval) {
            $registry = alumni_registry_verified_registry_for_account($db, $accountId);
            gradtrack_update_graduate_account_verification($db, $accountId, 'approved', (int) $admin['id']);
        } else {
            gradtrack_update_graduate_account_verification($db, $accountId, 'rejected', (int) $admin['id'], $reason);
            alumni_registry_unlink_registry_for_account($db, $accountId);
        }

        $db->commit();

        $action = $isApproval ? 'Approve' : 'Reject';
        $details = $isApproval
            ? "Approved graduate account {$accountId} for Graduate Portal access."
            : "Rejected graduate account {$accountId} for Graduate Portal access.";

        logAuditTrail(
            $admin['id'],
            $admin['full_name'] ?: $admin['email'],
            $admin['role'],
            $account['program_code'] ?? null,
            $action,
            'Alumni Account Verification',
            $details,
            $accountId,
            [
                'account_status' => $account['account_status'] ?? null,
                'alumni_verification_status' => $account['alumni_verification_status'] ?? null,
            ],
            [
                'account_status' => $isApproval ? 'active' : 'rejected',
                'alumni_verification_status' => $isApproval ? 'approved' : 'rejected',
                'rejection_reason' => !$isApproval ? $reason : null,
            ],
            [
                'linked_registry_id' => $registry ? (int) $registry['id'] : ($account['linked_registry_id'] ?? null),
            ]
        );

        echo json_encode([
            'success' => true,
            'message' => $isApproval
                ? 'Graduate account approved. The alumni can now access the Graduate Portal.'
                : 'Graduate account rejected. The alumni cannot access the Graduate Portal.',
            'data' => [
                'account_id' => $accountId,
                'account_status' => $isApproval ? 'active' : 'rejected',
                'alumni_verification_status' => $isApproval ? 'approved' : 'rejected',
                'linked_registry_id' => $registry ? (int) $registry['id'] : ($account['linked_registry_id'] ?? null),
            ],
        ]);
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }

        throw $e;
    }
}

function alumni_registry_handle_history(PDO $db): void
{
    $stmt = $db->query("SELECT h.id, h.file_name, h.worksheet_name, h.total_rows, h.successful_rows,
                               h.duplicate_rows, h.invalid_rows, h.updated_rows, h.created_at,
                               u.full_name AS imported_by_name
                        FROM alumni_import_history h
                        LEFT JOIN admin_users u ON u.id = h.imported_by
                        ORDER BY h.created_at DESC, h.id DESC
                        LIMIT 25");

    $rows = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        foreach (['id', 'total_rows', 'successful_rows', 'duplicate_rows', 'invalid_rows', 'updated_rows'] as $key) {
            $row[$key] = (int) ($row[$key] ?? 0);
        }
        $rows[] = $row;
    }

    echo json_encode(['success' => true, 'data' => $rows]);
}

function alumni_registry_export_rows(PDO $db): array
{
    $params = [];
    $whereClause = alumni_registry_filter_clause($_GET, $params);
    $sortClause = alumni_registry_sort_clause($_GET);
    $stmt = $db->prepare("SELECT ra.full_name, ra.course_name, ra.batch_year
                          FROM registered_alumni ra
                          {$whereClause}
                          {$sortClause}
                          LIMIT 50000");
    $stmt->execute($params);

    $rows = [];
    $rowNumber = 1;
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $rows[] = [
            'No.' => $rowNumber,
            'Alumni Name' => gradtrack_alumni_registry_safe_export_value($row['full_name'] ?? ''),
            'Course' => gradtrack_alumni_registry_safe_export_value($row['course_name'] ?? ''),
            'Batch' => gradtrack_alumni_registry_safe_export_value($row['batch_year'] ?? ''),
        ];
        $rowNumber++;
    }

    return $rows;
}

function alumni_registry_handle_export(PDO $db, array $admin): void
{
    $format = strtolower(gradtrack_alumni_registry_clean_text($_GET['format'] ?? 'json', 10));
    $rows = alumni_registry_export_rows($db);
    $filename = 'gradtrack_registered_alumni_' . date('Y-m-d');

    logAuditTrail(
        $admin['id'],
        $admin['full_name'] ?: $admin['email'],
        $admin['role'],
        null,
        'Export',
        'Alumni Registered List',
        'Exported ' . count($rows) . ' alumni records.',
        null,
        null,
        null,
        ['record_count' => count($rows)]
    );

    if ($format === 'csv') {
        header_remove('Content-Type');
        header('Content-Type: text/csv; charset=UTF-8');
        header('Content-Disposition: attachment; filename="' . $filename . '.csv"');

        $out = fopen('php://output', 'w');
        fputcsv($out, ['No.', 'Alumni Name', 'Course', 'Batch']);
        foreach ($rows as $row) {
            fputcsv($out, array_values($row));
        }
        fclose($out);
        exit;
    }

    echo json_encode([
        'success' => true,
        'filename' => $filename . '.xlsx',
        'data' => $rows,
    ]);
}

function alumni_registry_validate_import_payload(array $data): array
{
    $fileName = gradtrack_alumni_registry_clean_text($data['file_name'] ?? '', 255);
    $worksheetName = gradtrack_alumni_registry_clean_text($data['worksheet_name'] ?? '', 120);
    $rows = $data['rows'] ?? [];

    if ($fileName === '' || !alumni_registry_allowed_source_file($fileName)) {
        alumni_registry_json_error(400, 'Only .xlsx and .csv alumni registry files are allowed');
    }

    if (!is_array($rows)) {
        alumni_registry_json_error(400, 'Import rows must be an array');
    }

    if (count($rows) > 25000) {
        alumni_registry_json_error(400, 'Import files are limited to 25,000 detected rows at a time');
    }

    return [
        'file_name' => $fileName,
        'worksheet_name' => $worksheetName,
        'rows' => $rows,
    ];
}

function alumni_registry_handle_preview(PDO $db): void
{
    $payload = alumni_registry_validate_import_payload(alumni_registry_request_data());
    $preview = gradtrack_alumni_registry_validate_import_rows($db, $payload['rows']);

    echo json_encode([
        'success' => true,
        'file_name' => $payload['file_name'],
        'worksheet_name' => $payload['worksheet_name'],
        'preview' => $preview,
    ]);
}

function alumni_registry_handle_import(PDO $db, array $admin): void
{
    $data = alumni_registry_request_data();
    $payload = alumni_registry_validate_import_payload($data);
    $duplicateBehavior = gradtrack_alumni_registry_clean_text($_POST['duplicate_behavior'] ?? '', 20);
    $duplicateBehavior = gradtrack_alumni_registry_clean_text($data['duplicate_behavior'] ?? $duplicateBehavior, 20);

    if ($duplicateBehavior === '') {
        $duplicateBehavior = 'skip';
    }

    if (!in_array($duplicateBehavior, ['skip', 'update', 'cancel'], true)) {
        alumni_registry_json_error(400, 'Duplicate behavior must be skip, update, or cancel');
    }

    if ($duplicateBehavior === 'cancel') {
        echo json_encode(['success' => false, 'error' => 'Import cancelled']);
        return;
    }

    $preview = gradtrack_alumni_registry_validate_import_rows($db, $payload['rows']);
    $inserted = 0;
    $updated = 0;

    try {
        $db->beginTransaction();

        $historyStmt = $db->prepare("INSERT INTO alumni_import_history
            (file_name, worksheet_name, total_rows, successful_rows, duplicate_rows, invalid_rows, updated_rows, imported_by)
            VALUES (:file_name, :worksheet_name, :total_rows, 0, :duplicate_rows, :invalid_rows, 0, :imported_by)");
        $historyStmt->execute([
            ':file_name' => $payload['file_name'],
            ':worksheet_name' => $payload['worksheet_name'] !== '' ? $payload['worksheet_name'] : null,
            ':total_rows' => $preview['total_rows'],
            ':duplicate_rows' => $preview['duplicate_rows'],
            ':invalid_rows' => $preview['invalid_rows'],
            ':imported_by' => $admin['id'],
        ]);
        $importBatchId = (int) $db->lastInsertId();

        $insertStmt = $db->prepare("INSERT INTO registered_alumni
            (full_name, normalized_name, course_id, course_name, course_code, batch_year, registration_status, source_file, import_batch_id)
            VALUES (:full_name, :normalized_name, :course_id, :course_name, :course_code, :batch_year, 'Unclaimed', :source_file, :import_batch_id)");

        foreach ($preview['valid_records'] as $record) {
            $insertStmt->execute([
                ':full_name' => $record['full_name'],
                ':normalized_name' => $record['normalized_name'],
                ':course_id' => $record['course_id'],
                ':course_name' => $record['course_name'],
                ':course_code' => $record['course_code'],
                ':batch_year' => $record['batch_year'],
                ':source_file' => $payload['file_name'],
                ':import_batch_id' => $importBatchId,
            ]);
            $inserted++;
        }

        if ($duplicateBehavior === 'update') {
            $updateStmt = $db->prepare("UPDATE registered_alumni
                                        SET source_file = :source_file,
                                            import_batch_id = :import_batch_id
                                        WHERE id = :id");
            foreach ($preview['duplicates'] as $duplicate) {
                if (($duplicate['duplicate_type'] ?? '') !== 'database' || empty($duplicate['existing_id'])) {
                    continue;
                }

                $updateStmt->execute([
                    ':source_file' => $payload['file_name'],
                    ':import_batch_id' => $importBatchId,
                    ':id' => (int) $duplicate['existing_id'],
                ]);
                $updated += $updateStmt->rowCount() > 0 ? 1 : 0;
            }
        }

        $historyUpdate = $db->prepare("UPDATE alumni_import_history
                                       SET successful_rows = :successful_rows,
                                           updated_rows = :updated_rows
                                       WHERE id = :id");
        $historyUpdate->execute([
            ':successful_rows' => $inserted,
            ':updated_rows' => $updated,
            ':id' => $importBatchId,
        ]);

        $db->commit();

        logAuditTrail(
            $admin['id'],
            $admin['full_name'] ?: $admin['email'],
            $admin['role'],
            null,
            'Import',
            'Alumni Registered List',
            "Imported {$inserted} alumni records.",
            null,
            null,
            null,
            [
                'inserted_count' => $inserted,
                'updated_count' => $updated,
                'duplicate_count' => $preview['duplicate_rows'],
                'invalid_count' => $preview['invalid_rows'],
            ]
        );

        echo json_encode([
            'success' => true,
            'message' => 'Alumni registry import completed',
            'result' => [
                'import_batch_id' => $importBatchId,
                'total_rows_processed' => $preview['total_rows'],
                'successfully_imported' => $inserted,
                'duplicates_skipped' => $duplicateBehavior === 'update' ? max(0, $preview['duplicate_rows'] - $updated) : $preview['duplicate_rows'],
                'invalid_rows' => $preview['invalid_rows'],
                'updated_records' => $updated,
                'errors' => array_merge($preview['invalid'], $preview['duplicates']),
            ],
        ]);
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }

        error_log('Alumni registry import failed: ' . $e->getMessage());
        alumni_registry_json_error(500, 'Unable to import alumni registry records right now. Please review the file and try again.');
    }
}

function alumni_registry_handle_update(PDO $db, array $admin): void
{
    $data = alumni_registry_request_data();
    $id = isset($data['id']) ? (int) $data['id'] : 0;
    if ($id <= 0) {
        alumni_registry_json_error(400, 'Registry record ID is required');
    }

    $existing = alumni_registry_fetch_record($db, $id);
    if (!$existing) {
        alumni_registry_json_error(404, 'Alumni registry record not found');
    }

    $fullName = gradtrack_alumni_registry_clean_text($data['full_name'] ?? $existing['full_name'], 180);
    if ($fullName === '' || gradtrack_alumni_registry_is_placeholder_name($fullName)) {
        alumni_registry_json_error(400, 'A valid alumni name is required');
    }

    $courseInput = $data['course_name'] ?? ($data['course_code'] ?? $existing['course_code']);
    $courseMatch = gradtrack_alumni_registry_match_course($db, $courseInput);
    if (!$courseMatch['valid']) {
        alumni_registry_json_error(400, $courseMatch['error']);
    }

    $batchYear = gradtrack_alumni_registry_normalize_batch_year($data['batch_year'] ?? $existing['batch_year']);
    if ($batchYear === null) {
        alumni_registry_json_error(400, 'Batch must be a valid four-digit year from 1950 to ' . date('Y'));
    }

    $status = alumni_registry_normalize_status($data['registration_status'] ?? $existing['registration_status']);
    $normalizedName = gradtrack_alumni_registry_normalize_name($fullName);
    $duplicate = gradtrack_alumni_registry_duplicate_lookup($db, $normalizedName, (string) $courseMatch['course_code'], $batchYear, $id);
    if ($duplicate) {
        alumni_registry_json_error(409, 'Another registry record already has the same normalized name, course, and batch');
    }

    try {
        $db->beginTransaction();

        $stmt = $db->prepare("UPDATE registered_alumni
                              SET full_name = :full_name,
                                  normalized_name = :normalized_name,
                                  course_id = :course_id,
                                  course_name = :course_name,
                                  course_code = :course_code,
                                  batch_year = :batch_year,
                                  registration_status = :registration_status
                              WHERE id = :id");
        $stmt->execute([
            ':full_name' => $fullName,
            ':normalized_name' => $normalizedName,
            ':course_id' => $courseMatch['course_id'],
            ':course_name' => $courseMatch['course_name'],
            ':course_code' => $courseMatch['course_code'],
            ':batch_year' => $batchYear,
            ':registration_status' => $status,
            ':id' => $id,
        ]);

        if (!empty($existing['linked_user_id'])) {
            $accountId = (int) $existing['linked_user_id'];
            if ($status === 'Verified') {
                gradtrack_update_graduate_account_verification($db, $accountId, 'approved', (int) $admin['id']);
            } elseif ($status === 'Inactive') {
                gradtrack_update_graduate_account_verification(
                    $db,
                    $accountId,
                    'rejected',
                    (int) $admin['id'],
                    'Marked inactive in the official alumni registry.'
                );
            }
        }

        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }

        throw $e;
    }

    logAuditTrail(
        $admin['id'],
        $admin['full_name'] ?: $admin['email'],
        $admin['role'],
        $courseMatch['course_code'],
        'Update',
        'Alumni Registered List',
        "Updated alumni record with ID {$id}.",
        $id,
        null,
        [
            'course_code' => $courseMatch['course_code'],
            'batch_year' => $batchYear,
            'registration_status' => $status,
        ]
    );

    echo json_encode(['success' => true, 'message' => 'Registry record updated successfully']);
}

function alumni_registry_handle_link(PDO $db, array $admin): void
{
    $data = alumni_registry_request_data();
    $id = isset($data['id']) ? (int) $data['id'] : 0;
    $accountId = isset($data['graduate_account_id']) ? (int) $data['graduate_account_id'] : 0;
    if ($id <= 0 || $accountId <= 0) {
        alumni_registry_json_error(400, 'Registry record ID and graduate account ID are required');
    }

    $record = alumni_registry_fetch_record($db, $id);
    $account = gradtrack_alumni_registry_account_context($db, $accountId);
    if (!$record) {
        alumni_registry_json_error(404, 'Alumni registry record not found');
    }
    if (!$account) {
        alumni_registry_json_error(404, 'Graduate account not found');
    }

    $linkedStmt = $db->prepare('SELECT id FROM registered_alumni WHERE linked_user_id = :account_id AND id <> :id LIMIT 1');
    $linkedStmt->execute([':account_id' => $accountId, ':id' => $id]);
    if ($linkedStmt->fetch(PDO::FETCH_ASSOC)) {
        alumni_registry_json_error(409, 'This graduate account is already linked to another registry record');
    }

    $strength = gradtrack_alumni_registry_match_strength($record, $account);
    $status = !empty($data['mark_verified']) ? 'Verified' : 'Registered';

    try {
        $db->beginTransaction();

        $stmt = $db->prepare("UPDATE registered_alumni
                              SET linked_user_id = :linked_user_id,
                                  registration_status = :registration_status
                              WHERE id = :id");
        $stmt->execute([
            ':linked_user_id' => $accountId,
            ':registration_status' => $status,
            ':id' => $id,
        ]);

        if ($status === 'Verified') {
            gradtrack_update_graduate_account_verification($db, $accountId, 'approved', (int) $admin['id']);
        }

        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }

        throw $e;
    }

    logAuditTrail(
        $admin['id'],
        $admin['full_name'] ?: $admin['email'],
        $admin['role'],
        $record['course_code'] ?? null,
        'Link',
        'Alumni Registered List',
        "Linked alumni record with ID {$id} to a graduate account.",
        $id,
        null,
        [
            'linked_user_id' => $accountId,
            'registration_status' => $status,
            'account_status' => $status === 'Verified' ? 'active' : $account['account_status'],
        ],
        ['match_strength' => $strength]
    );

    echo json_encode([
        'success' => true,
        'message' => 'Registry record linked successfully',
        'match_strength' => $strength,
    ]);
}

function alumni_registry_handle_unlink(PDO $db, array $admin): void
{
    $data = alumni_registry_request_data();
    $id = isset($data['id']) ? (int) $data['id'] : 0;
    $record = $id > 0 ? alumni_registry_fetch_record($db, $id) : null;
    if (!$record) {
        alumni_registry_json_error(404, 'Alumni registry record not found');
    }

    $nextStatus = $record['registration_status'] === 'Inactive' ? 'Inactive' : 'Unclaimed';
    try {
        $db->beginTransaction();

        $stmt = $db->prepare('UPDATE registered_alumni SET linked_user_id = NULL, registration_status = :status WHERE id = :id');
        $stmt->execute([':status' => $nextStatus, ':id' => $id]);

        if (!empty($record['linked_user_id'])) {
            gradtrack_update_graduate_account_verification(
                $db,
                (int) $record['linked_user_id'],
                'pending',
                null,
                'Account unlinked from the official alumni registry and requires alumni verification review.'
            );
        }

        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }

        throw $e;
    }

    logAuditTrail(
        $admin['id'],
        $admin['full_name'] ?: $admin['email'],
        $admin['role'],
        $record['course_code'] ?? null,
        'Unlink',
        'Alumni Registered List',
        "Unlinked alumni record with ID {$id}.",
        $id,
        ['registration_status' => $record['registration_status'] ?? null],
        [
            'registration_status' => $nextStatus,
            'linked_account_status' => !empty($record['linked_user_id']) ? 'pending_verification' : null,
        ]
    );

    echo json_encode(['success' => true, 'message' => 'Registry record unlinked successfully']);
}

function alumni_registry_handle_status(PDO $db, array $admin, string $status, string $action): void
{
    $data = alumni_registry_request_data();
    $id = isset($data['id']) ? (int) $data['id'] : 0;
    $record = $id > 0 ? alumni_registry_fetch_record($db, $id) : null;
    if (!$record) {
        alumni_registry_json_error(404, 'Alumni registry record not found');
    }

    try {
        $db->beginTransaction();

        $stmt = $db->prepare('UPDATE registered_alumni SET registration_status = :status WHERE id = :id');
        $stmt->execute([':status' => $status, ':id' => $id]);

        if (!empty($record['linked_user_id'])) {
            $accountId = (int) $record['linked_user_id'];
            if ($status === 'Verified') {
                gradtrack_update_graduate_account_verification($db, $accountId, 'approved', (int) $admin['id']);
            } elseif ($status === 'Inactive') {
                gradtrack_update_graduate_account_verification(
                    $db,
                    $accountId,
                    'rejected',
                    (int) $admin['id'],
                    'Marked inactive in the official alumni registry.'
                );
            }
        }

        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }

        throw $e;
    }

    logAuditTrail(
        $admin['id'],
        $admin['full_name'] ?: $admin['email'],
        $admin['role'],
        $record['course_code'] ?? null,
        $action,
        'Alumni Registered List',
        $action . " alumni record with ID {$id}.",
        $id,
        ['registration_status' => $record['registration_status'] ?? null],
        [
            'registration_status' => $status,
            'linked_account_status' => $status === 'Verified'
                ? 'active'
                : ($status === 'Inactive' ? 'rejected' : ($record['linked_account_status'] ?? null)),
        ]
    );

    echo json_encode(['success' => true, 'message' => "Registry record marked as {$status}"]);
}

function alumni_registry_handle_delete(PDO $db, array $admin): void
{
    $data = alumni_registry_request_data();
    $id = isset($_GET['id']) ? (int) $_GET['id'] : (isset($data['id']) ? (int) $data['id'] : 0);
    $record = $id > 0 ? alumni_registry_fetch_record($db, $id) : null;
    if (!$record) {
        alumni_registry_json_error(404, 'Alumni registry record not found');
    }

    try {
        $db->beginTransaction();

        if (!empty($record['linked_user_id'])) {
            gradtrack_update_graduate_account_verification(
                $db,
                (int) $record['linked_user_id'],
                'pending',
                null,
                'Official alumni registry record was deleted and the account requires alumni verification review.'
            );
        }

        $stmt = $db->prepare('DELETE FROM registered_alumni WHERE id = :id');
        $stmt->execute([':id' => $id]);

        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }

        throw $e;
    }

    logAuditTrail(
        $admin['id'],
        $admin['full_name'] ?: $admin['email'],
        $admin['role'],
        $record['course_code'] ?? null,
        'Delete',
        'Alumni Registered List',
        "Deleted alumni record with ID {$id}.",
        $id
    );

    echo json_encode(['success' => true, 'message' => 'Registry record deleted successfully']);
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    gradtrack_ensure_graduate_account_verification_schema($db);
    gradtrack_alumni_registry_ensure_schema($db);
    $admin = gradtrack_alumni_registry_require_admin($db);
    $action = gradtrack_alumni_registry_clean_text($_GET['action'] ?? '', 40);

    if ($method === 'GET') {
        if ($action === 'summary') {
            alumni_registry_handle_summary($db);
            exit;
        }
        if ($action === 'detail' || isset($_GET['id'])) {
            alumni_registry_handle_detail($db);
            exit;
        }
        if ($action === 'accounts') {
            alumni_registry_handle_accounts($db);
            exit;
        }
        if ($action === 'pending_accounts') {
            alumni_registry_handle_pending_accounts($db);
            exit;
        }
        if ($action === 'history') {
            alumni_registry_handle_history($db);
            exit;
        }
        if ($action === 'export') {
            alumni_registry_handle_export($db, $admin);
            exit;
        }

        alumni_registry_handle_list($db);
        exit;
    }

    if ($method === 'POST') {
        if ($action === 'preview') {
            alumni_registry_handle_preview($db);
            exit;
        }
        if ($action === 'import') {
            alumni_registry_handle_import($db, $admin);
            exit;
        }

        alumni_registry_json_error(400, 'Unsupported alumni registry POST action');
    }

    if ($method === 'PUT') {
        if ($action === 'update') {
            alumni_registry_handle_update($db, $admin);
            exit;
        }
        if ($action === 'link') {
            alumni_registry_handle_link($db, $admin);
            exit;
        }
        if ($action === 'approve_account') {
            alumni_registry_handle_account_review($db, $admin, 'approve');
            exit;
        }
        if ($action === 'reject_account') {
            alumni_registry_handle_account_review($db, $admin, 'reject');
            exit;
        }
        if ($action === 'unlink') {
            alumni_registry_handle_unlink($db, $admin);
            exit;
        }
        if ($action === 'verify') {
            alumni_registry_handle_status($db, $admin, 'Verified', 'Verify');
            exit;
        }
        if ($action === 'inactive') {
            alumni_registry_handle_status($db, $admin, 'Inactive', 'Deactivate');
            exit;
        }

        alumni_registry_json_error(400, 'Unsupported alumni registry PUT action');
    }

    if ($method === 'DELETE') {
        alumni_registry_handle_delete($db, $admin);
        exit;
    }

    alumni_registry_json_error(405, 'Method not allowed');
} catch (PDOException $e) {
    error_log('Alumni registry database error: ' . $e->getMessage());
    if (($e->errorInfo[1] ?? null) === 1062) {
        alumni_registry_json_error(409, 'A registry record with the same normalized name, course, and batch already exists');
    }
    alumni_registry_json_error(500, 'Unable to process alumni registry records right now. Please try again.');
} catch (Throwable $e) {
    error_log('Alumni registry API error: ' . $e->getMessage());
    alumni_registry_json_error(500, 'Unable to process alumni registry records right now. Please try again.');
}
