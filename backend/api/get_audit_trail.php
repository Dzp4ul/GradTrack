<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/audit_trail.php';
require_once __DIR__ . '/config/admin_auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

function gradtrack_audit_csv_value($value): string
{
    $text = trim((string) ($value ?? ''));
    if ($text !== '' && preg_match('/^[=+\-@]/', $text) === 1) {
        return "'" . $text;
    }

    return $text;
}

function gradtrack_audit_write_csv(array $rows, array $filters): void
{
    $generatedAt = date('Y-m-d H:i:s');
    $filenameDate = date('Ymd_His');

    header_remove('Content-Type');
    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="audit_trail_' . $filenameDate . '.csv"');
    header('Pragma: no-cache');
    header('Expires: 0');

    $out = fopen('php://output', 'w');
    if ($out === false) {
        return;
    }

    fputcsv($out, ['GradTrack Audit Trail Report']);
    fputcsv($out, ['Generated At', $generatedAt]);

    $activeFilters = [];
    foreach (['search', 'user_role', 'role', 'department', 'action', 'module', 'start_date', 'end_date'] as $key) {
        $value = trim((string) ($filters[$key] ?? ''));
        if ($value !== '') {
            $activeFilters[] = $key . '=' . $value;
        }
    }
    fputcsv($out, ['Active Filters', empty($activeFilters) ? 'None' : implode('; ', $activeFilters)]);
    fputcsv($out, []);
    fputcsv($out, [
        'Audit ID',
        'Date and Time',
        'Actor User ID',
        'Actor Name',
        'Role',
        'Department',
        'Action',
        'Module',
        'Affected Record ID',
        'Description',
        'Previous Values',
        'New Values',
        'Metadata',
    ]);

    foreach ($rows as $row) {
        fputcsv($out, [
            gradtrack_audit_csv_value($row['audit_id'] ?? ''),
            gradtrack_audit_csv_value($row['created_at'] ?? ''),
            gradtrack_audit_csv_value($row['user_id'] ?? ''),
            gradtrack_audit_csv_value($row['user_name'] ?? ''),
            gradtrack_audit_csv_value($row['role_label'] ?? gradtrack_audit_role_label($row['user_role'] ?? '')),
            gradtrack_audit_csv_value($row['department'] ?? ''),
            gradtrack_audit_csv_value($row['action'] ?? ''),
            gradtrack_audit_csv_value($row['module'] ?? ''),
            gradtrack_audit_csv_value($row['record_id'] ?? ''),
            gradtrack_audit_csv_value($row['description'] ?? ''),
            gradtrack_audit_csv_value($row['previous_values'] ?? ''),
            gradtrack_audit_csv_value($row['new_values'] ?? ''),
            gradtrack_audit_csv_value($row['metadata'] ?? ''),
        ]);
    }

    fclose($out);
}

$database = new Database();
$db = $database->getConnection();
$authUser = gradtrack_require_admin_auth($db, ['super_admin'], 'You do not have permission to view the audit trail');
$role = (string) $authUser['role'];
gradtrack_ensure_audit_trail_table($db);

try {
    $viewerUserId = (int) $authUser['id'];
    $conditions = gradtrack_audit_build_conditions($_GET, $role, $viewerUserId);
    $whereClause = $conditions['where_clause'];
    $params = $conditions['params'];
    $isExport = strtolower(trim((string) ($_GET['export'] ?? ($_GET['format'] ?? '')))) === 'csv';

    $selectSql = "
        SELECT
            audit_id,
            user_id,
            user_name,
            user_role,
            department,
            action,
            module,
            description,
            record_id,
            previous_values,
            new_values,
            metadata,
            created_at
        FROM audit_trail
        $whereClause
        ORDER BY created_at DESC, audit_id DESC
    ";

    if ($isExport) {
        $stmt = $db->prepare($selectSql);
        $stmt->execute($params);
        $rows = array_map('gradtrack_audit_public_row', $stmt->fetchAll(PDO::FETCH_ASSOC));

        $auditUser = gradtrack_admin_audit_context($authUser);
        logAuditTrail(
            $auditUser['user_id'],
            $auditUser['user_name'],
            $auditUser['user_role'],
            $auditUser['department'],
            'Export',
            'Audit Trail',
            'Exported audit trail report.',
            null,
            null,
            null,
            [
                'record_count' => count($rows),
                'filters' => [
                    'search' => $_GET['search'] ?? null,
                    'role' => $_GET['user_role'] ?? ($_GET['role'] ?? null),
                    'department' => $_GET['department'] ?? null,
                    'action' => $_GET['action'] ?? null,
                    'module' => $_GET['module'] ?? null,
                    'start_date' => $_GET['start_date'] ?? null,
                    'end_date' => $_GET['end_date'] ?? null,
                ],
            ]
        );

        gradtrack_audit_write_csv($rows, $_GET);
        exit;
    }

    $requestedPerPage = isset($_GET['per_page']) ? (int) $_GET['per_page'] : 10;
    $perPage = min(100, max(1, $requestedPerPage));
    $requestedPage = isset($_GET['page']) ? (int) $_GET['page'] : 1;
    $page = max(1, $requestedPage);

    $countSql = "SELECT COUNT(*) AS total FROM audit_trail $whereClause";
    $countStmt = $db->prepare($countSql);
    $countStmt->execute($params);
    $total = (int) ($countStmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);
    $totalPages = max(1, (int) ceil($total / $perPage));
    $page = min($page, $totalPages);
    $offset = ($page - 1) * $perPage;

    $sql = $selectSql . " LIMIT {$perPage} OFFSET {$offset}";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $logs = array_map('gradtrack_audit_public_row', $stmt->fetchAll(PDO::FETCH_ASSOC));

    echo json_encode([
        'success' => true,
        'data' => $logs,
        'pagination' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => $totalPages,
        ],
        'access' => [
            'role' => $role,
            'role_label' => gradtrack_audit_role_label($role),
            'scope' => $conditions['scope'],
        ],
        'role_options' => gradtrack_audit_allowed_role_categories(),
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Unable to load audit trail: ' . $e->getMessage()]);
}
