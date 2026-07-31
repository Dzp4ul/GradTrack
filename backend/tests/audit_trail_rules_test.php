<?php

$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

require_once __DIR__ . '/../api/config/audit_trail.php';

$failures = 0;

function audit_trail_test_assert(bool $condition, string $message): void
{
    global $failures;
    if (!$condition) {
        $failures++;
        echo "FAIL: {$message}" . PHP_EOL;
        return;
    }

    echo "PASS: {$message}" . PHP_EOL;
}

function audit_trail_count(PDO $db, array $conditions): int
{
    $stmt = $db->prepare('SELECT COUNT(*) AS total FROM audit_trail ' . $conditions['where_clause']);
    $stmt->execute($conditions['params']);
    return (int) ($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);
}

gradtrack_ensure_audit_trail_table($db);

audit_trail_test_assert(gradtrack_audit_role_is_allowed('super_admin'), 'system administrator role is allowed');
audit_trail_test_assert(gradtrack_audit_role_is_allowed('admin'), 'admin role is allowed');
audit_trail_test_assert(gradtrack_audit_role_is_allowed('alumni_admin'), 'alumni administrator role is allowed');
audit_trail_test_assert(gradtrack_audit_role_is_allowed('registrar'), 'registrar role is allowed');
audit_trail_test_assert(gradtrack_audit_role_is_allowed('dean_cs'), 'dean role variant is allowed');
audit_trail_test_assert(!gradtrack_audit_role_is_allowed('graduate'), 'graduate role is not allowed');
audit_trail_test_assert(!gradtrack_audit_role_is_allowed('mis_staff'), 'non-requested staff role is not allowed');
audit_trail_test_assert(gradtrack_audit_viewer_role_is_allowed('super_admin'), 'super admin can open the audit trail');
audit_trail_test_assert(!gradtrack_audit_viewer_role_is_allowed('admin'), 'admin cannot open the audit trail');
audit_trail_test_assert(!gradtrack_audit_viewer_role_is_allowed('registrar'), 'registrar cannot open the audit trail');
audit_trail_test_assert(!gradtrack_audit_viewer_role_is_allowed('dean_cs'), 'dean cannot open the audit trail');

$_SERVER['REMOTE_ADDR'] = '203.0.113.9';
$graduateLogged = logAuditTrail(
    90,
    'Graduate User',
    'graduate',
    'BSCS',
    'Create',
    'Community Forum',
    'Created forum post with record ID 44.',
    44
);
audit_trail_test_assert($graduateLogged === false, 'graduate activity is not recorded');
audit_trail_test_assert((int) $db->query('SELECT COUNT(*) FROM audit_trail')->fetchColumn() === 0, 'graduate activity does not create a row');

$adminLogged = logAuditTrail(
    1,
    'admin@example.edu',
    'admin',
    null,
    'Update',
    'User Management',
    'Changed password=Secret123 for user test@example.edu.',
    77,
    ['password' => 'Secret123', 'email' => 'old@example.edu', 'status' => 'Active'],
    ['token' => 'abc123', 'status' => 'Suspended'],
    ['ip_address' => '203.0.113.9', 'safe_note' => 'reviewed']
);
audit_trail_test_assert($adminLogged === true, 'allowed admin activity is recorded');

$row = $db->query('SELECT * FROM audit_trail LIMIT 1')->fetch(PDO::FETCH_ASSOC);
audit_trail_test_assert(($row['user_name'] ?? '') === 'Admin #1', 'email fallback is not stored as actor name');
audit_trail_test_assert(($row['ip_address'] ?? null) === null, 'new audit records do not collect IP address');
audit_trail_test_assert(strpos((string) $row['description'], 'Secret123') === false, 'description removes password values');
audit_trail_test_assert(strpos((string) $row['description'], 'test@example.edu') === false, 'description removes email addresses');
audit_trail_test_assert(strpos((string) $row['previous_values'], 'Secret123') === false, 'previous values redact passwords');
audit_trail_test_assert(strpos((string) $row['previous_values'], 'old@example.edu') === false, 'previous values redact emails');
audit_trail_test_assert(strpos((string) $row['new_values'], 'abc123') === false, 'new values redact tokens');
audit_trail_test_assert(strpos((string) $row['metadata'], '203.0.113.9') === false, 'metadata redacts IP-like address fields');

$publicRow = gradtrack_audit_public_row($row);
audit_trail_test_assert(!array_key_exists('ip_address', $publicRow), 'public audit rows do not expose IP address');
audit_trail_test_assert(($publicRow['role_label'] ?? '') === 'Admin', 'public audit rows include readable role labels');

logAuditTrail(2, 'System Administrator', 'super_admin', null, 'Generate', 'Reports', 'Generated graduate tracer report.');
logAuditTrail(3, 'Registrar Account', 'registrar', 'BSCS', 'Update', 'Graduate Records', 'Updated graduate record with ID 102.', 102);
logAuditTrail(4, 'Alumni Admin', 'alumni_admin', 'BSCS', 'Approve', 'Job Posting', 'Approved job posting with record ID 25.', 25);
logAuditTrail(5, 'Dean Account', 'dean_cs', 'CCS', 'Login', 'Authentication', 'Logged in to the administrative portal.');

$allConditions = gradtrack_audit_build_conditions([], 'super_admin', 2);
audit_trail_test_assert(audit_trail_count($db, $allConditions) === 5, 'unfiltered query returns only allowed administrative records');

$graduateFilter = gradtrack_audit_build_conditions(['user_role' => 'graduate'], 'super_admin', 2);
audit_trail_test_assert(audit_trail_count($db, $graduateFilter) === 0, 'graduate role filter returns no records');

$deanFilter = gradtrack_audit_build_conditions(['user_role' => 'Dean'], 'super_admin', 2);
audit_trail_test_assert(audit_trail_count($db, $deanFilter) === 1, 'dean role category filter expands to dean role variants');

$actionFilter = gradtrack_audit_build_conditions(['action' => 'Update'], 'super_admin', 2);
$filteredTotal = audit_trail_count($db, $actionFilter);
audit_trail_test_assert($filteredTotal === 2, 'action filter returns the expected filtered count');
audit_trail_test_assert((int) ceil($filteredTotal / 10) === 1, 'pagination can use the filtered record count');

$searchFilter = gradtrack_audit_build_conditions(['search' => 'System Administrator'], 'super_admin', 2);
audit_trail_test_assert(audit_trail_count($db, $searchFilter) === 1, 'search matches readable role labels');

$unauthorizedConditions = gradtrack_audit_build_conditions([], 'graduate', 90);
audit_trail_test_assert($unauthorizedConditions['where_clause'] === 'WHERE 1 = 0', 'unauthorized role cannot build an accessible audit query');

$exportLikeFilter = gradtrack_audit_build_conditions(['module' => 'Job Posting', 'action' => 'Approve'], 'super_admin', 2);
$stmt = $db->prepare("SELECT audit_id, user_id, user_name, user_role, department, action, module, description, record_id, previous_values, new_values, metadata, created_at FROM audit_trail {$exportLikeFilter['where_clause']} ORDER BY created_at DESC, audit_id DESC");
$stmt->execute($exportLikeFilter['params']);
$exportRows = array_map('gradtrack_audit_public_row', $stmt->fetchAll(PDO::FETCH_ASSOC));
audit_trail_test_assert(count($exportRows) === 1 && ($exportRows[0]['record_id'] ?? '') === '25', 'export-style query follows active filters');
audit_trail_test_assert(!array_key_exists('ip_address', $exportRows[0]), 'export-style rows exclude IP address');

if ($failures > 0) {
    echo PHP_EOL . "{$failures} audit trail rule test(s) failed." . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All audit trail rule tests passed.' . PHP_EOL;
