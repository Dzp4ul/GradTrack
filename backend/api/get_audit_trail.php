<?php
require_once __DIR__ . '/config/cors.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/audit_trail.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Authentication required']);
    exit;
}

$role = (string) ($_SESSION['role'] ?? '');
$viewAllRoles = ['super_admin', 'mis_staff', 'research_coordinator'];
$deanScopes = gradtrack_audit_dean_program_scopes();
$registrarModules = ['Graduate Records', 'Survey Responses', 'Reports'];

$canViewAll = in_array($role, $viewAllRoles, true);
$isDean = isset($deanScopes[$role]);
$isRegistrar = $role === 'registrar';

if (!$canViewAll && !$isDean && !$isRegistrar) {
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'error' => 'Unauthorized access. You do not have permission to view the audit trail.',
    ]);
    exit;
}

$database = new Database();
$db = $database->getConnection();
gradtrack_ensure_audit_trail_table($db);

try {
    $where = [];
    $params = [];

    if ($isDean) {
        $scopePlaceholders = [];
        foreach ($deanScopes[$role] as $index => $department) {
            $placeholder = ':scope_department_' . $index;
            $scopePlaceholders[] = $placeholder;
            $params[$placeholder] = $department;
        }

        $where[] = 'department IN (' . implode(', ', $scopePlaceholders) . ')';
    } elseif ($isRegistrar) {
        $modulePlaceholders = [];
        foreach ($registrarModules as $index => $module) {
            $placeholder = ':registrar_module_' . $index;
            $modulePlaceholders[] = $placeholder;
            $params[$placeholder] = $module;
        }

        $where[] = 'module IN (' . implode(', ', $modulePlaceholders) . ')';
    }

    $search = trim((string) ($_GET['search'] ?? ''));
    if ($search !== '') {
        $where[] = "(
            user_name LIKE :search
            OR user_role LIKE :search
            OR action LIKE :search
            OR module LIKE :search
            OR department LIKE :search
            OR description LIKE :search
            OR ip_address LIKE :search
            OR DATE_FORMAT(created_at, '%Y-%m-%d') LIKE :search
            OR DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') LIKE :search
        )";
        $params[':search'] = '%' . $search . '%';
    }

    $roleFilter = trim((string) ($_GET['user_role'] ?? ($_GET['role'] ?? '')));
    if ($roleFilter !== '') {
        $where[] = 'user_role = :user_role';
        $params[':user_role'] = $roleFilter;
    }

    $departmentFilter = trim((string) ($_GET['department'] ?? ''));
    if ($departmentFilter !== '') {
        $where[] = 'department = :department';
        $params[':department'] = $departmentFilter;
    }

    $actionFilter = trim((string) ($_GET['action'] ?? ''));
    if ($actionFilter !== '') {
        $where[] = 'action = :action';
        $params[':action'] = $actionFilter;
    }

    $moduleFilter = trim((string) ($_GET['module'] ?? ''));
    if ($moduleFilter !== '') {
        $where[] = 'module = :module';
        $params[':module'] = $moduleFilter;
    }

    $dateFilter = trim((string) ($_GET['date'] ?? ''));
    if ($dateFilter !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateFilter) === 1) {
        $where[] = 'DATE(created_at) = :created_date';
        $params[':created_date'] = $dateFilter;
    }

    $whereClause = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';
    $sql = "
        SELECT
            audit_id,
            user_id,
            user_name,
            user_role,
            department,
            action,
            module,
            description,
            ip_address,
            created_at
        FROM audit_trail
        $whereClause
        ORDER BY created_at DESC, audit_id DESC
    ";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'data' => $logs,
        'access' => [
            'role' => $role,
            'scope' => $canViewAll ? 'all' : ($isDean ? 'department' : 'registrar_modules'),
        ],
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Unable to load audit trail: ' . $e->getMessage()]);
}
