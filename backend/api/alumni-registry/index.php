<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
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

function alumni_registry_base_select(): string
{
    return "SELECT ra.id, ra.full_name, ra.normalized_name, ra.course_id, ra.course_name, ra.course_code,
                   ra.batch_year, ra.registration_status, ra.linked_user_id, ra.source_file,
                   ra.import_batch_id, ra.created_at, ra.updated_at,
                   ga.email AS linked_email, ga.status AS linked_account_status,
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
            'course_totals' => $courseTotals,
        ],
        'filters' => [
            'programs' => $programs,
            'course_codes' => array_keys(gradtrack_alumni_registry_canonical_courses()),
            'batch_years' => $batchYears,
            'statuses' => gradtrack_alumni_registry_statuses(),
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

    $stmt = $db->prepare("UPDATE registered_alumni
                          SET linked_user_id = :linked_user_id,
                              registration_status = :registration_status
                          WHERE id = :id");
    $stmt->execute([
        ':linked_user_id' => $accountId,
        ':registration_status' => $status,
        ':id' => $id,
    ]);

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
    $stmt = $db->prepare('UPDATE registered_alumni SET linked_user_id = NULL, registration_status = :status WHERE id = :id');
    $stmt->execute([':status' => $nextStatus, ':id' => $id]);

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
        ['registration_status' => $nextStatus]
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

    $stmt = $db->prepare('UPDATE registered_alumni SET registration_status = :status WHERE id = :id');
    $stmt->execute([':status' => $status, ':id' => $id]);

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
        ['registration_status' => $status]
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

    $stmt = $db->prepare('DELETE FROM registered_alumni WHERE id = :id');
    $stmt->execute([':id' => $id]);

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
