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
$graduateIdsByKind = [];

function registrar_filter_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function registrar_filter_request(string $archive, string $sessionId, ?int $programId = null): array
{
    global $baseUrl, $cookieName;
    $query = ['archive' => $archive, 'limit' => 100];
    if ($programId !== null) $query['program_id'] = $programId;
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
        $baseUrl . '/graduates/index.php?' . http_build_query($query),
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
$programDefinitions = [
    'ACTIVE' => 'Filter Test Active ' . $suffix,
    'ARCHIVED' => 'Filter Test Archived ' . $suffix,
    'EMPTY' => 'Filter Test Empty ' . $suffix,
    'INACTIVE' => 'Filter Test Inactive ' . $suffix,
    'DUPLICATE_A' => 'Bachelor of Test Studies ' . $suffix,
    'DUPLICATE_B' => ' bachelor of test studies ' . strtolower($suffix) . ' ',
];
$programInsert = $db->prepare('INSERT INTO programs (code, name) VALUES (:code, :name)');
foreach ($programDefinitions as $kind => $name) {
    $code = substr('TF' . str_replace('_', '', $kind) . $suffix, 0, 20);
    $programInsert->execute([':code' => $code, ':name' => $name]);
    $programIds[$kind] = (int) $db->lastInsertId();
}

$graduateInsert = $db->prepare(
    "INSERT INTO graduates
     (student_id, first_name, last_name, program_id, year_graduated, status, archived_at)
     VALUES (:student_id, 'FILTER', 'TEST', :program_id, 2097, :status, :archived_at)"
);
$graduateFixtures = [
    'ACTIVE' => ['2097-', 'active', null],
    'ARCHIVED' => ['2096-', 'active', date('Y-m-d H:i:s')],
    'INACTIVE' => ['2095-', 'inactive', null],
    'DUPLICATE_A' => ['2094-', 'active', null],
    'DUPLICATE_B' => ['2093-', 'active', null],
];
foreach ($graduateFixtures as $kind => [$studentPrefix, $status, $archivedAt]) {
    $graduateInsert->execute([
        ':student_id' => $studentPrefix . substr($suffix, 0, 4),
        ':program_id' => $programIds[$kind],
        ':status' => $status,
        ':archived_at' => $archivedAt,
    ]);
    $graduateIdsByKind[$kind] = (int)$db->lastInsertId();
    $graduateIds[] = $graduateIdsByKind[$kind];
}

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
    $activeRecordProgramIds = array_map('intval', array_column($active['json']['data'] ?? [], 'program_id'));
    registrar_filter_assert(
        $active['status'] === 200
        && in_array($programIds['ACTIVE'], $activeFilterIds, true)
        && !in_array($programIds['ARCHIVED'], $activeFilterIds, true)
        && !in_array($programIds['EMPTY'], $activeFilterIds, true)
        && !in_array($programIds['INACTIVE'], $activeFilterIds, true),
        'Manage Graduates filter includes active-record programs and excludes archived-only, inactive, and empty programs'
    );
    registrar_filter_assert(
        !in_array($programIds['INACTIVE'], $activeRecordProgramIds, true),
        'the normal Manage Graduates list excludes inactive unarchived graduate records'
    );
    registrar_filter_assert(
        $activeMasterIds === $activeFilterIds
        && !in_array($programIds['ARCHIVED'], $activeMasterIds, true)
        && !in_array($programIds['EMPTY'], $activeMasterIds, true),
        'Add Graduate and the active Department filter use the same active-record program source'
    );

    $duplicateOptions = array_values(array_filter(
        $active['json']['program_options'] ?? [],
        static function (array $program) use ($suffix): bool {
            $name = strtolower(trim(preg_replace('/\s+/', ' ', (string)($program['name'] ?? ''))));
            return $name === strtolower('Bachelor of Test Studies ' . $suffix);
        }
    ));
    registrar_filter_assert(
        count($duplicateOptions) === 1 && (int)($duplicateOptions[0]['record_count'] ?? 0) === 2,
        'program names with casing and surrounding-space variations produce one normalized active option'
    );
    $normalizedFilter = registrar_filter_request('active', $sessionId, (int)($duplicateOptions[0]['id'] ?? 0));
    registrar_filter_assert(
        (int)($normalizedFilter['json']['pagination']['total'] ?? 0) === 2,
        'the normalized Department option filters records across all equivalent legacy program IDs'
    );

    $graduateInsert->execute([
        ':student_id' => '2092-' . substr($suffix, 0, 4),
        ':program_id' => $programIds['EMPTY'],
        ':status' => 'active',
        ':archived_at' => null,
    ]);
    $graduateIdsByKind['IMPORTED'] = (int)$db->lastInsertId();
    $graduateIds[] = $graduateIdsByKind['IMPORTED'];
    $afterPopulation = registrar_filter_request('active', $sessionId);
    $afterPopulationIds = array_map('intval', array_column($afterPopulation['json']['program_options'] ?? [], 'id'));
    registrar_filter_assert(
        in_array($programIds['EMPTY'], $afterPopulationIds, true),
        'a previously empty program appears automatically after its first active graduate record is added or imported'
    );

    $archiveOne = $db->prepare('UPDATE graduates SET archived_at = NOW() WHERE id = :id');
    $archiveOne->execute([':id' => $graduateIdsByKind['ACTIVE']]);
    $afterArchive = registrar_filter_request('active', $sessionId);
    $afterArchiveIds = array_map('intval', array_column($afterArchive['json']['program_options'] ?? [], 'id'));
    registrar_filter_assert(
        !in_array($programIds['ACTIVE'], $afterArchiveIds, true),
        'archiving the last active graduate removes the program from active options'
    );

    $restoreOne = $db->prepare('UPDATE graduates SET archived_at = NULL WHERE id = :id');
    $restoreOne->execute([':id' => $graduateIdsByKind['ACTIVE']]);
    $afterRestore = registrar_filter_request('active', $sessionId);
    $afterRestoreIds = array_map('intval', array_column($afterRestore['json']['program_options'] ?? [], 'id'));
    registrar_filter_assert(
        in_array($programIds['ACTIVE'], $afterRestoreIds, true),
        'restoring a graduate makes the program available in active options again'
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
