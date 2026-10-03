<?php
declare(strict_types=1);

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';
require_once __DIR__ . '/../api/config/survey_program_scope.php';

$db = (new Database())->getConnection();
$baseUrl = rtrim((string) (getenv('GRADTRACK_HTTP_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();
$failures = 0;
$sessionId = null;
$fixture = ['survey_ids' => [], 'template_ids' => [], 'graduate_ids' => [], 'program_ids' => []];

function graduate_scope_http_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function graduate_scope_http_program(PDO $db, string $code, string $name): int
{
    global $fixture;
    $stmt = $db->prepare('SELECT id FROM programs WHERE UPPER(TRIM(code)) = :code LIMIT 1');
    $stmt->execute([':code' => strtoupper($code)]);
    $existing = (int) ($stmt->fetchColumn() ?: 0);
    if ($existing > 0) return $existing;

    $insert = $db->prepare('INSERT INTO programs (code, name) VALUES (:code, :name)');
    $insert->execute([':code' => strtoupper($code), ':name' => $name]);
    $id = (int) $db->lastInsertId();
    $fixture['program_ids'][] = $id;
    return $id;
}

function graduate_scope_http_survey(PDO $db, string $title, array $programLabels, int $year): int
{
    global $fixture;
    $template = $db->prepare(
        "INSERT INTO survey_templates (template_key, title, description)
         VALUES (:template_key, :title, 'Graduate program scope HTTP test')"
    );
    $template->execute([':template_key' => gradtrack_survey_uuid(), ':title' => $title]);
    $templateId = (int) $db->lastInsertId();
    $fixture['template_ids'][] = $templateId;

    $survey = $db->prepare(
        "INSERT INTO surveys (template_id, version_number, title, description, status)
         VALUES (:template_id, 1, :title, 'Graduate program scope HTTP test', 'inactive')"
    );
    $survey->execute([':template_id' => $templateId, ':title' => $title]);
    $surveyId = (int) $db->lastInsertId();
    $fixture['survey_ids'][] = $surveyId;

    $question = $db->prepare(
        'INSERT INTO survey_questions
         (survey_id, question_key, analytics_key, section, question_text, question_type, options, is_required, sort_order)
         VALUES (:survey_id, :question_key, :analytics_key, :section, :question_text, \'multiple_choice\', :options, 1, :sort_order)'
    );
    $programKey = gradtrack_survey_uuid();
    $question->execute([
        ':survey_id' => $surveyId,
        ':question_key' => $programKey,
        ':analytics_key' => 'program',
        ':section' => 'Educational Background',
        ':question_text' => 'Degree Program & Specialization',
        ':options' => $programLabels !== [] ? json_encode($programLabels, JSON_UNESCAPED_UNICODE) : null,
        ':sort_order' => 1,
    ]);
    $programQuestionId = (int) $db->lastInsertId();
    gradtrack_survey_sync_question_options($db, $programQuestionId, $programKey, $programLabels);
    gradtrack_link_survey_program_question_options($db, $programQuestionId);

    $yearKey = gradtrack_survey_uuid();
    $yearLabels = [(string) $year];
    $question->execute([
        ':survey_id' => $surveyId,
        ':question_key' => $yearKey,
        ':analytics_key' => 'graduation_year',
        ':section' => 'Educational Background',
        ':question_text' => 'Year Graduated',
        ':options' => json_encode($yearLabels),
        ':sort_order' => 2,
    ]);
    gradtrack_survey_sync_question_options($db, (int) $db->lastInsertId(), $yearKey, $yearLabels);
    return $surveyId;
}

function graduate_scope_http_graduate(PDO $db, string $studentId, int $programId, int $year): int
{
    global $fixture;
    $stmt = $db->prepare(
        "INSERT INTO graduates (student_id, first_name, last_name, program_id, year_graduated, status)
         VALUES (:student_id, 'SCOPE', 'TEST', :program_id, :year, 'active')"
    );
    $stmt->execute([':student_id' => $studentId, ':program_id' => $programId, ':year' => $year]);
    $id = (int) $db->lastInsertId();
    $fixture['graduate_ids'][] = $id;
    return $id;
}

function graduate_scope_http_request(int $surveyId, string $sessionId, ?int $programId = null): array
{
    global $baseUrl, $cookieName;
    $query = ['survey_id' => $surveyId, 'status' => 'all', 'limit' => 100];
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
        $baseUrl . '/graduates/survey-status.php?' . http_build_query($query),
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

function graduate_scope_http_cleanup(): void
{
    global $db, $fixture, $sessionId;
    if ($fixture['graduate_ids'] !== []) {
        $placeholders = implode(',', array_fill(0, count($fixture['graduate_ids']), '?'));
        $db->prepare("DELETE FROM graduates WHERE id IN ($placeholders)")->execute($fixture['graduate_ids']);
    }
    if ($fixture['survey_ids'] !== []) {
        $placeholders = implode(',', array_fill(0, count($fixture['survey_ids']), '?'));
        $db->prepare("DELETE FROM surveys WHERE id IN ($placeholders)")->execute($fixture['survey_ids']);
    }
    if ($fixture['template_ids'] !== []) {
        $placeholders = implode(',', array_fill(0, count($fixture['template_ids']), '?'));
        $db->prepare("DELETE FROM survey_templates WHERE id IN ($placeholders)")->execute($fixture['template_ids']);
    }
    if ($fixture['program_ids'] !== []) {
        $placeholders = implode(',', array_fill(0, count($fixture['program_ids']), '?'));
        $db->prepare("DELETE FROM programs WHERE id IN ($placeholders)")->execute($fixture['program_ids']);
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
    $fixture = ['survey_ids' => [], 'template_ids' => [], 'graduate_ids' => [], 'program_ids' => []];
    $sessionId = null;
}

register_shutdown_function('graduate_scope_http_cleanup');

$year = 2098;
$bscsId = graduate_scope_http_program($db, 'BSCS', 'Bachelor of Science in Computer Science');
$becedId = graduate_scope_http_program($db, 'BECED', 'Bachelor of Early Childhood Education');
$beedId = graduate_scope_http_program($db, 'BEED', 'Bachelor of Elementary Education');
$bsedId = graduate_scope_http_program($db, 'BSED', 'Bachelor of Secondary Education');
$bsitId = graduate_scope_http_program($db, 'BSIT', 'Bachelor of Science in Information Technology');
$programNames = [];
foreach ($db->query('SELECT id, name FROM programs')->fetchAll(PDO::FETCH_ASSOC) as $program) {
    $programNames[(int) $program['id']] = (string) $program['name'];
}

$surveyA = graduate_scope_http_survey($db, 'Scope A ' . bin2hex(random_bytes(4)), [$programNames[$bscsId], $programNames[$becedId]], $year);
$surveyB = graduate_scope_http_survey($db, 'Scope B ' . bin2hex(random_bytes(4)), [$programNames[$beedId], $programNames[$bsedId]], $year);
$emptySurvey = graduate_scope_http_survey($db, 'Empty Scope ' . bin2hex(random_bytes(4)), [], $year);
$graduateIds = [
    'BSCS' => graduate_scope_http_graduate($db, '2098-9101', $bscsId, $year),
    'BECED' => graduate_scope_http_graduate($db, '2098-9102', $becedId, $year),
    'BEED' => graduate_scope_http_graduate($db, '2098-9103', $beedId, $year),
    'BSED' => graduate_scope_http_graduate($db, '2098-9104', $bsedId, $year),
    'BSIT' => graduate_scope_http_graduate($db, '2098-9105', $bsitId, $year),
];

$coordinatorId = (int) ($db->query(
    "SELECT id FROM admin_users WHERE role = 'research_coordinator' AND is_active = 1 ORDER BY id LIMIT 1"
)->fetchColumn() ?: 0);
graduate_scope_http_assert($coordinatorId > 0, 'an active Research Coordinator test principal exists');

if ($coordinatorId > 0) {
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    ini_set('session.use_strict_mode', '0');
    $sessionId = 'gtp' . bin2hex(random_bytes(18));
    session_id($sessionId);
    session_start();
    $_SESSION = ['admin_user_id' => $coordinatorId, 'authenticated_at' => time()];
    session_write_close();

    $responseA = graduate_scope_http_request($surveyA, $sessionId);
    $codesA = array_column($responseA['json']['program_options'] ?? [], 'code');
    $idsA = array_map('intval', array_column($responseA['json']['data'] ?? [], 'id'));
    graduate_scope_http_assert($responseA['status'] === 200 && $codesA === ['BSCS', 'BECED'], 'Survey A returns only BSCS and BECED program filters');
    graduate_scope_http_assert(
        ($responseA['json']['summary']['total'] ?? null) === 2
        && in_array($graduateIds['BSCS'], $idsA, true)
        && in_array($graduateIds['BECED'], $idsA, true)
        && !in_array($graduateIds['BSIT'], $idsA, true),
        'Survey A totals and rows include only graduates in its program scope'
    );

    $responseB = graduate_scope_http_request($surveyB, $sessionId);
    $codesB = array_column($responseB['json']['program_options'] ?? [], 'code');
    graduate_scope_http_assert($responseB['status'] === 200 && $codesB === ['BEED', 'BSED'], 'switching to Survey B returns only BEED and BSED filters');
    graduate_scope_http_assert(($responseB['json']['summary']['total'] ?? null) === 2, 'switching surveys refreshes the scoped summary population');

    $bypass = graduate_scope_http_request($surveyA, $sessionId, $bsitId);
    graduate_scope_http_assert(
        $bypass['status'] === 403 && ($bypass['json']['code'] ?? '') === 'PROGRAM_OUTSIDE_SURVEY_SCOPE',
        'the backend rejects an out-of-scope program filter bypass'
    );

    $empty = graduate_scope_http_request($emptySurvey, $sessionId);
    graduate_scope_http_assert(
        $empty['status'] === 200
        && ($empty['json']['program_options'] ?? null) === []
        && ($empty['json']['summary']['total'] ?? null) === 0,
        'a survey with no programs returns a clear empty scope instead of all departments'
    );
}

graduate_scope_http_cleanup();
if ($failures > 0) {
    echo PHP_EOL . "{$failures} graduate survey program-scope HTTP test(s) failed." . PHP_EOL;
    ob_end_flush();
    exit(1);
}

echo PHP_EOL . 'All graduate survey program-scope HTTP tests passed.' . PHP_EOL;
ob_end_flush();
