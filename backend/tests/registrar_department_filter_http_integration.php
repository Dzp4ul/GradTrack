<?php
declare(strict_types=1);

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';

$db = (new Database())->getConnection();
$baseUrl = rtrim((string) (getenv('GRADTRACK_HTTP_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();
$failures = 0;
$sessionId = null;
$programIds = [];
$graduateIds = [];

function registrar_filter_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function registrar_filter_request(string $archive, string $sessionId): array
{
    global $baseUrl, $cookieName;
    $context = stream_context_create(['http' => [
        'method' => 'GET',
        'header' => implode("\r\n", [
            'Accept: application/json',
            'Origin: http://localhost:5173',
            'Cookie: ' . $cookieName . '=' . rawurlencode($sessionId),
        ]),
        'ignore_errors' => true,
        'timeout' => 30,
    ]]);
    $raw = @file_get_contents(
        $baseUrl . '/graduates/index.php?' . http_build_query(['archive' => $archive, 'limit' => 1]),
        false,
        $context
    );
    $status = 0;
    foreach (($http_response_header ?? []) as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $matches) === 1) {
            $status = (int) $matches[1];
            break;
        }
    }
    return ['status' => $status, 'json' => is_string($raw) ? json_decode($raw, true) : null];
}

function registrar_filter_cleanup(): void
{
    global $db, $graduateIds, $programIds, $sessionId;
    if ($graduateIds !== []) {
        $placeholders = implode(',', array_fill(0, count($graduateIds), '?'));
        $db->prepare("DELETE FROM graduates WHERE id IN ($placeholders)")->execute($graduateIds);
    }
    if ($programIds !== []) {
        $placeholders = implode(',', array_fill(0, count($programIds), '?'));
        $db->prepare("DELETE FROM programs WHERE id IN ($placeholders)")->execute(array_values($programIds));
    }
    if (is_string($sessionId) && $sessionId !== '') {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        ini_set('session.use_strict_mode', '0');
        session_id($sessionId);
        if (@session_start()) {
            $_SESSION = [];
            session_destroy();
        }
    }
    $graduateIds = [];
    $programIds = [];
    $sessionId = null;
}

register_shutdown_function('registrar_filter_cleanup');

$suffix = strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
$programInsert = $db->prepare('INSERT INTO programs (code, name) VALUES (:code, :name)');
foreach (['ACTIVE', 'ARCHIVED', 'EMPTY'] as $kind) {
    $code = substr('TF' . $kind . $suffix, 0, 20);
    $programInsert->execute([':code' => $code, ':name' => 'Filter Test ' . $kind . ' ' . $suffix]);
    $programIds[$kind] = (int) $db->lastInsertId();
}

$graduateInsert = $db->prepare(
    "INSERT INTO graduates
     (student_id, first_name, last_name, program_id, year_graduated, status, archived_at)
     VALUES (:student_id, 'FILTER', 'TEST', :program_id, 2097, 'active', :archived_at)"
);
$graduateInsert->execute([
    ':student_id' => '2097-' . substr($suffix, 0, 4),
    ':program_id' => $programIds['ACTIVE'],
    ':archived_at' => null,
]);
$graduateIds[] = (int) $db->lastInsertId();
$graduateInsert->execute([
    ':student_id' => '2096-' . substr($suffix, 0, 4),
    ':program_id' => $programIds['ARCHIVED'],
    ':archived_at' => date('Y-m-d H:i:s'),
]);
$graduateIds[] = (int) $db->lastInsertId();

$registrarId = (int) ($db->query(
    "SELECT id FROM admin_users WHERE role = 'registrar' AND is_active = 1 ORDER BY id LIMIT 1"
)->fetchColumn() ?: 0);
registrar_filter_assert($registrarId > 0, 'an active Registrar test principal exists');

if ($registrarId > 0) {
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    ini_set('session.use_strict_mode', '0');
    $sessionId = 'gtf' . bin2hex(random_bytes(18));
    session_id($sessionId);
    session_start();
    $_SESSION = ['admin_user_id' => $registrarId, 'authenticated_at' => time()];
    session_write_close();

    $active = registrar_filter_request('active', $sessionId);
    $activeFilterIds = array_map('intval', array_column($active['json']['filter_program_options'] ?? [], 'id'));
    $activeMasterIds = array_map('intval', array_column($active['json']['program_options'] ?? [], 'id'));
    registrar_filter_assert(
        $active['status'] === 200
        && in_array($programIds['ACTIVE'], $activeFilterIds, true)
        && !in_array($programIds['ARCHIVED'], $activeFilterIds, true)
        && !in_array($programIds['EMPTY'], $activeFilterIds, true),
        'Manage Graduates filter includes active-record programs and excludes archived-only and empty programs'
    );
    registrar_filter_assert(
        in_array($programIds['ACTIVE'], $activeMasterIds, true)
        && in_array($programIds['ARCHIVED'], $activeMasterIds, true)
        && in_array($programIds['EMPTY'], $activeMasterIds, true),
        'the full master list remains available for Add Graduate and import matching'
    );

    $archived = registrar_filter_request('archived', $sessionId);
    $archivedFilterIds = array_map('intval', array_column($archived['json']['filter_program_options'] ?? [], 'id'));
    registrar_filter_assert(
        $archived['status'] === 200
        && in_array($programIds['ARCHIVED'], $archivedFilterIds, true)
        && !in_array($programIds['ACTIVE'], $archivedFilterIds, true)
        && !in_array($programIds['EMPTY'], $archivedFilterIds, true),
        'Registrar Archive filter includes archived-record programs and excludes active-only and empty programs'
    );
}

registrar_filter_cleanup();
if ($failures > 0) {
    echo PHP_EOL . "{$failures} Registrar department-filter HTTP test(s) failed." . PHP_EOL;
    ob_end_flush();
    exit(1);
}

echo PHP_EOL . 'All Registrar department-filter HTTP tests passed.' . PHP_EOL;
ob_end_flush();
