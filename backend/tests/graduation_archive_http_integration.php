<?php

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';

$failures = 0;
$baseUrl = rtrim((string) (getenv('GRADTRACK_HTTP_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();
$sessionIds = [];
$csrfTokens = [];
$fixtureIds = [
    'graduates' => [],
    'survey' => 0,
    'responses' => [],
    'forum_posts' => [],
    'registry' => 0,
    'admins' => [],
];

function graduation_http_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) {
        $failures++;
    }
}

function graduation_http_seed_session(array $identity = []): string
{
    global $sessionIds;
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    ini_set('session.use_strict_mode', '0');
    $sessionId = 'gth' . bin2hex(random_bytes(18));
    session_id($sessionId);
    session_start();
    $_SESSION = array_merge(['http_integration_fixture' => true], $identity);
    session_write_close();
    $sessionIds[] = $sessionId;
    return $sessionId;
}

function graduation_http_request(string $path, ?string $sessionId = null, string $method = 'GET', ?array $body = null): array
{
    global $baseUrl, $cookieName, $csrfTokens;
    $headers = ['Accept: application/json', 'Origin: http://localhost:5173'];
    if ($sessionId !== null) $headers[] = 'Cookie: ' . $cookieName . '=' . rawurlencode($sessionId);
    if (!in_array($method, ['GET', 'HEAD'], true) && $sessionId !== null) {
        if (!isset($csrfTokens[$sessionId])) {
            $csrfContext = stream_context_create(['http' => [
                'method' => 'GET',
                'header' => implode("\r\n", [
                    'Accept: application/json',
                    'Origin: http://localhost:5173',
                    'Cookie: ' . $cookieName . '=' . rawurlencode($sessionId),
                ]),
                'ignore_errors' => true,
                'timeout' => 30,
            ]]);
            $csrfRaw = @file_get_contents($baseUrl . '/csrf.php', false, $csrfContext);
            $csrf = is_string($csrfRaw) ? json_decode($csrfRaw, true) : null;
            $csrfTokens[$sessionId] = (string) ($csrf['csrf_token'] ?? '');
        }
        $headers[] = 'X-CSRF-Token: ' . $csrfTokens[$sessionId];
    }
    if ($body !== null) $headers[] = 'Content-Type: application/json';

    $context = stream_context_create(['http' => [
        'method' => $method,
        'header' => implode("\r\n", $headers),
        'content' => $body !== null ? json_encode($body) : '',
        'ignore_errors' => true,
        'timeout' => 60,
    ]]);
    $raw = @file_get_contents($baseUrl . '/' . ltrim($path, '/'), false, $context);
    $responseHeaders = $http_response_header ?? [];
    $status = 0;
    foreach ($responseHeaders as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $matches) === 1) {
            $status = (int) $matches[1];
            break;
        }
    }
    return [
        'status' => $status,
        'json' => is_string($raw) ? json_decode($raw, true) : null,
        'raw' => is_string($raw) ? $raw : '',
    ];
}

function graduation_http_create_admin(PDO $db, string $role, string $suffix): int
{
    $stmt = $db->prepare('INSERT INTO admin_users
        (username, email, password, full_name, role, is_active)
        VALUES (:username, :email, :password, :full_name, :role, 1)');
    $stmt->execute([
        ':username' => 'gth_' . $role . '_' . $suffix,
        ':email' => 'gth-' . $role . '-' . $suffix . '@example.invalid',
        ':password' => password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT),
        ':full_name' => 'HTTP ' . $role . ' Test',
        ':role' => $role,
    ]);
    return (int) $db->lastInsertId();
}

function graduation_http_cleanup(PDO $db): void
{
    global $fixtureIds, $sessionIds;
    try {
        if ($fixtureIds['survey'] > 0) {
            $db->prepare('DELETE FROM survey_reminder_logs WHERE survey_id = :id')->execute([':id' => $fixtureIds['survey']]);
            $db->prepare('DELETE FROM surveys WHERE id = :id')->execute([':id' => $fixtureIds['survey']]);
        }
        if ($fixtureIds['registry'] > 0) {
            $db->prepare('DELETE FROM registered_alumni WHERE id = :id')->execute([':id' => $fixtureIds['registry']]);
        }
        foreach ($fixtureIds['forum_posts'] as $id) {
            $db->prepare('DELETE FROM forum_posts WHERE id = :id')->execute([':id' => $id]);
        }
        foreach ($fixtureIds['graduates'] as $id) {
            $db->prepare('DELETE FROM graduates WHERE id = :id')->execute([':id' => $id]);
        }
        $recordIds = array_merge(
            $fixtureIds['graduates'],
            $fixtureIds['forum_posts'],
            $fixtureIds['survey'] > 0 ? [$fixtureIds['survey']] : [],
            $fixtureIds['registry'] > 0 ? [$fixtureIds['registry']] : []
        );
        foreach (array_unique($recordIds) as $id) {
            $db->prepare('DELETE FROM audit_trail WHERE record_id = :id')->execute([':id' => (string) $id]);
        }
        foreach ($fixtureIds['admins'] as $id) {
            $db->prepare('DELETE FROM audit_trail WHERE user_id = :id')->execute([':id' => $id]);
            $db->prepare('DELETE FROM admin_users WHERE id = :id')->execute([':id' => $id]);
        }
    } catch (Throwable $cleanupError) {
        echo 'CLEANUP WARNING: ' . $cleanupError->getMessage() . PHP_EOL;
    }

    foreach ($sessionIds as $sessionId) {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        ini_set('session.use_strict_mode', '0');
        session_id($sessionId);
        if (@session_start()) {
            $_SESSION = [];
            session_destroy();
        }
    }
}

function graduation_http_contains_id(array $response, int $id): bool
{
    foreach (($response['json']['data'] ?? []) as $row) {
        if ((int) ($row['id'] ?? 0) === $id) return true;
    }
    return false;
}

$db = (new Database())->getConnection();
$cleanupFinished = false;
register_shutdown_function(static function () use ($db, &$cleanupFinished): void {
    if (!$cleanupFinished) graduation_http_cleanup($db);
});

try {
    $health = graduation_http_request('csrf.php');
    if ($health['status'] !== 200) {
        throw new RuntimeException('The local GradTrack API is not reachable at ' . $baseUrl);
    }

    $suffix = bin2hex(random_bytes(4));
    $program = $db->query('SELECT id, code, name FROM programs ORDER BY id ASC LIMIT 1')->fetch(PDO::FETCH_ASSOC);
    if (!$program) throw new RuntimeException('At least one program is required.');

    foreach (['registrar', 'admin', 'alumni_admin'] as $role) {
        $fixtureIds['admins'][$role] = graduation_http_create_admin($db, $role, $suffix);
    }
    $registrarSession = graduation_http_seed_session(['admin_user_id' => $fixtureIds['admins']['registrar']]);
    $adminSession = graduation_http_seed_session(['admin_user_id' => $fixtureIds['admins']['admin']]);
    $alumniSession = graduation_http_seed_session(['admin_user_id' => $fixtureIds['admins']['alumni_admin']]);
    $anonymousSession = graduation_http_seed_session();

    $graduatePayload = static function (int $year, string $label) use ($program, $suffix): array {
        return [
            'student_id' => 'HTTP' . $label . $suffix,
            'first_name' => 'HTTP' . $label,
            'middle_name' => null,
            'last_name' => 'YearTest',
            'email' => 'http-' . strtolower($label) . '-' . $suffix . '@example.invalid',
            'phone' => null,
            'program_id' => (int) $program['id'],
            'year_graduated' => $year,
            'address' => null,
        ];
    };

    $create2026 = graduation_http_request('graduates/index.php', $registrarSession, 'POST', $graduatePayload(2026, 'Y26'));
    graduation_http_assert($create2026['status'] === 200 && !empty($create2026['json']['id']), 'Registrar Add Graduate stores a 2026 record through the real API');
    $graduate2026 = (int) ($create2026['json']['id'] ?? 0);
    if ($graduate2026 > 0) $fixtureIds['graduates'][] = $graduate2026;

    $createSecond = graduation_http_request('graduates/index.php', $registrarSession, 'POST', $graduatePayload(2026, 'Y27'));
    $graduate2027 = (int) ($createSecond['json']['id'] ?? 0);
    if ($graduate2027 > 0) $fixtureIds['graduates'][] = $graduate2027;
    $update2027 = graduation_http_request(
        'graduates/index.php',
        $registrarSession,
        'PUT',
        array_merge($graduatePayload(2027, 'Y27'), ['id' => $graduate2027])
    );
    graduation_http_assert($createSecond['status'] === 200 && $update2027['status'] === 200, 'Registrar Update Graduate maps year_graduated=2027 through the real API');

    $storedYearsStmt = $db->prepare('SELECT id, year_graduated FROM graduates WHERE id IN (:id_1, :id_2)');
    $storedYearsStmt->execute([':id_1' => $graduate2026, ':id_2' => $graduate2027]);
    $storedYears = [];
    foreach ($storedYearsStmt->fetchAll(PDO::FETCH_ASSOC) as $row) $storedYears[(int) $row['id']] = (int) $row['year_graduated'];
    graduation_http_assert(($storedYears[$graduate2026] ?? null) === 2026 && ($storedYears[$graduate2027] ?? null) === 2027, 'canonical year_graduated values persisted as 2026 and 2027');

    $activeList = graduation_http_request('graduates/index.php?archive=active&limit=100&year=2027', $registrarSession);
    $yearOptions = array_map('intval', $activeList['json']['year_options'] ?? []);
    graduation_http_assert(
        in_array(2026, $yearOptions, true) && in_array(2027, $yearOptions, true)
            && array_search(2027, $yearOptions, true) < array_search(2026, $yearOptions, true),
        'Registrar year options are data-derived and newest-first for 2027 and 2026'
    );
    graduation_http_assert(graduation_http_contains_id($activeList, $graduate2027), 'selecting 2027 filters the Registrar list to the saved record');

    $accountStmt = $db->prepare("INSERT INTO graduate_accounts
        (graduate_id, email, password_hash, status, alumni_verification_status)
        VALUES (:graduate_id, :email, :password_hash, 'active', 'approved')");
    $accountStmt->execute([
        ':graduate_id' => $graduate2026,
        ':email' => 'portal-' . $suffix . '@example.invalid',
        ':password_hash' => password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT),
    ]);
    $graduateAccountId = (int) $db->lastInsertId();
    $graduateSession = graduation_http_seed_session(['graduate_account_id' => $graduateAccountId]);

    foreach ([[$graduate2026, 2026], [$graduate2027, 2027]] as [$graduateId, $year]) {
        $postStmt = $db->prepare("INSERT INTO forum_posts
            (graduate_id, title, content, category, status)
            VALUES (:graduate_id, :title, 'HTTP integration content', 'Career Advice', 'approved')");
        $postStmt->execute([':graduate_id' => $graduateId, ':title' => 'HTTP year ' . $year . ' ' . $suffix]);
        $fixtureIds['forum_posts'][] = (int) $db->lastInsertId();
    }
    $forumFeed = graduation_http_request('forum/posts.php', $graduateSession);
    $fixturePosts = array_values(array_filter($forumFeed['json']['data'] ?? [], static fn ($row) => in_array((int) ($row['id'] ?? 0), $GLOBALS['fixtureIds']['forum_posts'], true)));
    $forumYears = array_values(array_unique(array_map(static fn ($row) => (int) ($row['author_year_graduated'] ?? 0), $fixturePosts)));
    rsort($forumYears, SORT_NUMERIC);
    graduation_http_assert($forumYears === [2027, 2026], 'Community Forum API returns author_year_graduated from real post authors');
    $forum2027 = array_filter($fixturePosts, static fn ($row) => (int) ($row['author_year_graduated'] ?? 0) === 2027);
    graduation_http_assert(count($forum2027) === 1, 'Community Forum post data filters correctly for 2027');

    $surveyStmt = $db->prepare("INSERT INTO surveys (title, description, status) VALUES (:title, 'HTTP test', 'draft')");
    $surveyStmt->execute([':title' => 'HTTP report ' . $suffix]);
    $fixtureIds['survey'] = (int) $db->lastInsertId();
    $questionStmt = $db->prepare("INSERT INTO survey_questions
        (survey_id, section, question_text, question_type, is_required, sort_order)
        VALUES (:survey_id, 'Profile', 'Year Graduated', 'text', 1, 1)");
    $questionStmt->execute([':survey_id' => $fixtureIds['survey']]);
    $questionId = (int) $db->lastInsertId();
    foreach ([[$graduate2026, 2026], [$graduate2027, 2027]] as [$graduateId, $year]) {
        $responseStmt = $db->prepare('INSERT INTO survey_responses
            (survey_id, graduate_id, responses, submitted_at)
            VALUES (:survey_id, :graduate_id, :responses, NOW())');
        $responseStmt->execute([
            ':survey_id' => $fixtureIds['survey'],
            ':graduate_id' => $graduateId,
            ':responses' => json_encode([(string) $questionId => (string) $year]),
        ]);
        $fixtureIds['responses'][] = (int) $db->lastInsertId();
    }
    $reportOptions = graduation_http_request('reports/index.php?type=overview_filter_options&survey_id=' . $fixtureIds['survey'], $adminSession);
    $reportYears = $reportOptions['json']['data']['years'] ?? [];
    graduation_http_assert($reportOptions['status'] === 200 && $reportYears === ['2027', '2026'], 'Reports API derives valid, unique, newest-first years from selected survey data');
    $report2027 = graduation_http_request('reports/index.php?type=overview&survey_id=' . $fixtureIds['survey'] . '&graduation_year=2027', $adminSession);
    graduation_http_assert((int) ($report2027['json']['data']['total_survey_responses'] ?? 0) === 1, 'Reports graduation_year=2027 filters the analytics result');

    $registryStmt = $db->prepare("INSERT INTO registered_alumni
        (full_name, normalized_name, course_id, course_name, course_code, batch_year, registration_status, linked_user_id)
        VALUES (:full_name, :normalized_name, :course_id, :course_name, :course_code, 2027, 'Registered', :linked_user_id)");
    $registryStmt->execute([
        ':full_name' => 'HTTP Registry ' . $suffix,
        ':normalized_name' => 'http registry ' . $suffix,
        ':course_id' => (int) $program['id'],
        ':course_name' => (string) $program['name'],
        ':course_code' => (string) $program['code'],
        ':linked_user_id' => $graduateAccountId,
    ]);
    $fixtureIds['registry'] = (int) $db->lastInsertId();

    $activeGraduateDelete = graduation_http_request('graduates/index.php', $registrarSession, 'DELETE', ['id' => $graduate2027, 'action' => 'permanent_delete']);
    graduation_http_assert($activeGraduateDelete['status'] === 409, 'Graduate permanent-delete API rejects an active record');
    graduation_http_assert(graduation_http_request('graduates/index.php', $anonymousSession, 'DELETE', ['id' => $graduate2027, 'action' => 'permanent_delete'])['status'] === 401, 'Graduate permanent-delete API rejects an unauthenticated session');
    graduation_http_assert(graduation_http_request('graduates/index.php', $adminSession, 'DELETE', ['id' => $graduate2027, 'action' => 'permanent_delete'])['status'] === 403, 'Graduate permanent-delete API rejects the wrong administrator role');
    graduation_http_assert(in_array(graduation_http_request('graduates/index.php', $graduateSession, 'DELETE', ['id' => $graduate2027, 'action' => 'permanent_delete'])['status'], [401, 403], true), 'Graduate permanent-delete API rejects a Graduate role');

    $archiveGraduate = graduation_http_request('graduates/index.php', $registrarSession, 'DELETE', ['id' => $graduate2027]);
    $graduateArchiveList = graduation_http_request('graduates/index.php?archive=archived&limit=100&year=2027', $registrarSession);
    graduation_http_assert($archiveGraduate['status'] === 200 && graduation_http_contains_id($graduateArchiveList, $graduate2027), 'graduate archive stores and lists the safe test record');
    $restoreGraduate = graduation_http_request('graduates/index.php', $registrarSession, 'PUT', ['id' => $graduate2027, 'action' => 'restore']);
    graduation_http_assert($restoreGraduate['status'] === 200 && graduation_http_contains_id(graduation_http_request('graduates/index.php?archive=active&year=2027&limit=100', $registrarSession), $graduate2027), 'graduate Restore returns the record to the active list');
    graduation_http_request('graduates/index.php', $registrarSession, 'DELETE', ['id' => $graduate2027]);
    $deleteGraduate = graduation_http_request('graduates/index.php', $registrarSession, 'DELETE', ['id' => $graduate2027, 'action' => 'permanent_delete']);
    graduation_http_assert($deleteGraduate['status'] === 200, 'authorized Registrar permanently deletes an archived graduate');
    $graduatePersistence = graduation_http_request('graduates/index.php?archive=archived&limit=100&year=2027', $registrarSession);
    graduation_http_assert(!graduation_http_contains_id($graduatePersistence, $graduate2027), 'permanently deleted graduate stays absent after an archive refetch');
    $dbGraduateCheck = $db->prepare('SELECT COUNT(*) FROM graduates WHERE id = :id');
    $dbGraduateCheck->execute([':id' => $graduate2027]);
    graduation_http_assert((int) $dbGraduateCheck->fetchColumn() === 0, 'authorized graduate deletion removed the persistent database row');
    $responsePersistCheck = $db->prepare('SELECT graduate_id FROM survey_responses WHERE id = :id');
    $responsePersistCheck->execute([':id' => $fixtureIds['responses'][1]]);
    graduation_http_assert($responsePersistCheck->fetchColumn() === null, 'graduate deletion retained and detached the historical report response');
    $historicalReport = graduation_http_request('reports/index.php?type=overview_filter_options&survey_id=' . $fixtureIds['survey'], $adminSession);
    graduation_http_assert(in_array('2027', $historicalReport['json']['data']['years'] ?? [], true), 'Reports keeps historical 2027 after graduate deletion');

    $activeSurveyDelete = graduation_http_request('surveys/index.php', $adminSession, 'DELETE', ['id' => $fixtureIds['survey'], 'action' => 'permanent_delete']);
    graduation_http_assert($activeSurveyDelete['status'] === 409, 'Survey permanent-delete API rejects an active archive-state record');
    graduation_http_assert(graduation_http_request('surveys/index.php', $anonymousSession, 'DELETE', ['id' => $fixtureIds['survey'], 'action' => 'permanent_delete'])['status'] === 401, 'Survey permanent-delete API rejects an unauthenticated session');
    graduation_http_assert(graduation_http_request('surveys/index.php', $registrarSession, 'DELETE', ['id' => $fixtureIds['survey'], 'action' => 'permanent_delete'])['status'] === 403, 'Survey permanent-delete API rejects a Registrar');
    $archiveSurvey = graduation_http_request('surveys/index.php', $adminSession, 'DELETE', ['id' => $fixtureIds['survey']]);
    $surveyArchiveList = graduation_http_request('surveys/index.php?archive=archived&limit=100&search=' . rawurlencode($suffix), $adminSession);
    graduation_http_assert($archiveSurvey['status'] === 200 && graduation_http_contains_id($surveyArchiveList, $fixtureIds['survey']), 'survey archive preserves and lists the safe test survey');
    $restoreSurvey = graduation_http_request('surveys/index.php', $adminSession, 'PUT', ['id' => $fixtureIds['survey'], 'action' => 'restore']);
    graduation_http_assert($restoreSurvey['status'] === 200, 'survey Restore returns the survey to active management');
    graduation_http_request('surveys/index.php', $adminSession, 'DELETE', ['id' => $fixtureIds['survey']]);
    $deleteSurvey = graduation_http_request('surveys/index.php', $adminSession, 'DELETE', ['id' => $fixtureIds['survey'], 'action' => 'permanent_delete']);
    graduation_http_assert($deleteSurvey['status'] === 200, 'authorized Admin permanently deletes an archived survey');
    $surveyDbCheck = $db->prepare('SELECT COUNT(*) FROM surveys WHERE id = :id');
    $surveyDbCheck->execute([':id' => $fixtureIds['survey']]);
    graduation_http_assert((int) $surveyDbCheck->fetchColumn() === 0, 'survey and its dependent rows stay deleted after refetch');

    $activeRegistryDelete = graduation_http_request('alumni-registry/index.php?action=permanent_delete', $alumniSession, 'DELETE', ['id' => $fixtureIds['registry']]);
    graduation_http_assert($activeRegistryDelete['status'] === 409, 'Alumni registry permanent-delete API rejects an active record');
    graduation_http_assert(graduation_http_request('alumni-registry/index.php?action=permanent_delete', $anonymousSession, 'DELETE', ['id' => $fixtureIds['registry']])['status'] === 401, 'Alumni registry permanent-delete API rejects an unauthenticated session');
    graduation_http_assert(graduation_http_request('alumni-registry/index.php?action=permanent_delete', $adminSession, 'DELETE', ['id' => $fixtureIds['registry']])['status'] === 403, 'Alumni registry permanent-delete API rejects the wrong administrator role');
    $archiveRegistry = graduation_http_request('alumni-registry/index.php', $alumniSession, 'DELETE', ['id' => $fixtureIds['registry']]);
    $registryArchiveList = graduation_http_request('alumni-registry/index.php?archive=archived&limit=100&search=' . rawurlencode($suffix), $alumniSession);
    graduation_http_assert($archiveRegistry['status'] === 200 && graduation_http_contains_id($registryArchiveList, $fixtureIds['registry']), 'alumni registry archive stores and lists the safe test record');
    $registryArchiveSummary = graduation_http_request('alumni-registry/index.php?action=summary&archive=archived', $alumniSession);
    graduation_http_assert(in_array(2027, array_map('intval', $registryArchiveSummary['json']['filters']['batch_years'] ?? []), true), 'alumni archive year options come from the archived registry dataset');
    $restoreRegistry = graduation_http_request('alumni-registry/index.php?action=restore', $alumniSession, 'PUT', ['id' => $fixtureIds['registry']]);
    graduation_http_assert($restoreRegistry['status'] === 200, 'alumni registry Restore returns the record to the active list');
    graduation_http_request('alumni-registry/index.php', $alumniSession, 'DELETE', ['id' => $fixtureIds['registry']]);
    $deleteRegistry = graduation_http_request('alumni-registry/index.php?action=permanent_delete', $alumniSession, 'DELETE', ['id' => $fixtureIds['registry']]);
    graduation_http_assert($deleteRegistry['status'] === 200, 'authorized Alumni Admin permanently deletes an archived registry record');
    $registryDbCheck = $db->prepare('SELECT COUNT(*) FROM registered_alumni WHERE id = :id');
    $registryDbCheck->execute([':id' => $fixtureIds['registry']]);
    graduation_http_assert((int) $registryDbCheck->fetchColumn() === 0, 'alumni registry row stays deleted after an archive refetch');
    $accountDbCheck = $db->prepare('SELECT COUNT(*) FROM graduate_accounts WHERE id = :id');
    $accountDbCheck->execute([':id' => $graduateAccountId]);
    graduation_http_assert((int) $accountDbCheck->fetchColumn() === 1, 'alumni registry deletion retains its separately owned linked graduate account');
} catch (Throwable $error) {
    graduation_http_assert(false, 'HTTP integration test completed without an exception: ' . $error->getMessage());
}

graduation_http_cleanup($db);
$cleanupFinished = true;

if ($failures > 0) {
    echo PHP_EOL . $failures . ' graduation/archive HTTP integration test(s) failed.' . PHP_EOL;
    ob_end_flush();
    exit(1);
}

echo PHP_EOL . 'All graduation year, archive, restore, and authorization HTTP tests passed.' . PHP_EOL;
ob_end_flush();
