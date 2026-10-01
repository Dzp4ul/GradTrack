<?php
declare(strict_types=1);

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';
require_once __DIR__ . '/../api/config/survey_versioning.php';
require_once __DIR__ . '/../api/config/survey_program_scope.php';

$db = (new Database())->getConnection();
$baseUrl = rtrim((string)(getenv('GRADTRACK_HTTP_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();
$failures = 0;
$sessionId = null;
$adminId = $graduateId = $surveyId = $templateId = 0;
$previousActiveIds = [];

function live_edit_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function live_edit_request(string $path, string $sessionId, string $csrfToken, string $method = 'GET', ?array $body = null): array
{
    global $baseUrl, $cookieName;
    $headers = [
        'Accept: application/json',
        'Origin: http://localhost:5173',
        'Cookie: ' . $cookieName . '=' . rawurlencode($sessionId),
        'X-CSRF-Token: ' . $csrfToken,
    ];
    if ($body !== null) $headers[] = 'Content-Type: application/json';
    $context = stream_context_create(['http' => [
        'method' => $method,
        'header' => implode("\r\n", $headers),
        'content' => $body === null ? '' : json_encode($body),
        'ignore_errors' => true,
        'timeout' => 30,
    ]]);
    $raw = @file_get_contents($baseUrl . '/' . ltrim($path, '/'), false, $context);
    $status = 0;
    foreach ($http_response_header ?? [] as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $match) === 1) {
            $status = (int)$match[1];
            break;
        }
    }
    return ['status' => $status, 'json' => is_string($raw) ? json_decode($raw, true) : null, 'raw' => $raw ?: ''];
}

function live_edit_cleanup(): void
{
    global $db, $sessionId, $adminId, $graduateId, $surveyId, $templateId, $previousActiveIds;
    try {
        if ($adminId > 0) $db->prepare('DELETE FROM audit_trail WHERE user_id = :id')->execute([':id' => $adminId]);
        if ($surveyId > 0) {
            $db->prepare('DELETE answer_row FROM survey_response_answers answer_row INNER JOIN survey_responses response_row ON response_row.id = answer_row.survey_response_id WHERE response_row.survey_id = :id')->execute([':id' => $surveyId]);
            $db->prepare('DELETE FROM survey_responses WHERE survey_id = :id')->execute([':id' => $surveyId]);
            $db->prepare('DELETE option_row FROM survey_question_options option_row INNER JOIN survey_questions question_row ON question_row.id = option_row.survey_question_id WHERE question_row.survey_id = :id')->execute([':id' => $surveyId]);
            $db->prepare('DELETE FROM survey_questions WHERE survey_id = :id')->execute([':id' => $surveyId]);
            $db->prepare('UPDATE survey_templates SET current_version_id = NULL WHERE current_version_id = :id')->execute([':id' => $surveyId]);
            $db->prepare('DELETE FROM surveys WHERE id = :id')->execute([':id' => $surveyId]);
        }
        if ($templateId > 0) $db->prepare('DELETE FROM survey_templates WHERE id = :id')->execute([':id' => $templateId]);
        if ($graduateId > 0) $db->prepare('DELETE FROM graduates WHERE id = :id')->execute([':id' => $graduateId]);
        if ($adminId > 0) $db->prepare('DELETE FROM admin_users WHERE id = :id')->execute([':id' => $adminId]);
        if ($previousActiveIds !== []) {
            $placeholders = implode(',', array_fill(0, count($previousActiveIds), '?'));
            $db->prepare("UPDATE surveys SET status = 'active' WHERE id IN ($placeholders)")->execute($previousActiveIds);
        }
    } catch (Throwable $error) {
        echo 'CLEANUP WARNING: ' . $error->getMessage() . PHP_EOL;
    }
    if ($sessionId !== null) {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        ini_set('session.use_strict_mode', '0');
        session_id($sessionId);
        if (@session_start()) { $_SESSION = []; session_destroy(); }
    }
}

$cleanupFinished = false;
register_shutdown_function(static function () use (&$cleanupFinished): void {
    if (!$cleanupFinished) live_edit_cleanup();
});

try {
    if (@file_get_contents($baseUrl . '/csrf.php', false, stream_context_create(['http' => ['ignore_errors' => true, 'timeout' => 10]])) === false) {
        throw new RuntimeException('Test API is not reachable at ' . $baseUrl);
    }

    $suffix = bin2hex(random_bytes(5));
    $previousActiveIds = array_map('intval', $db->query("SELECT id FROM surveys WHERE status = 'active' AND archived_at IS NULL")->fetchAll(PDO::FETCH_COLUMN));
    $db->exec("UPDATE surveys SET status = 'inactive' WHERE status = 'active' AND archived_at IS NULL");

    $adminStmt = $db->prepare("INSERT INTO admin_users (username, email, password, full_name, role, is_active) VALUES (:username, :email, :password, 'Live Survey Edit Test', 'research_coordinator', 1)");
    $adminStmt->execute([
        ':username' => 'live_edit_' . $suffix,
        ':email' => 'live-edit-' . $suffix . '@example.invalid',
        ':password' => password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT),
    ]);
    $adminId = (int)$db->lastInsertId();

    ini_set('session.use_strict_mode', '0');
    $sessionId = 'lqe' . bin2hex(random_bytes(18));
    session_id($sessionId);
    session_start();
    $csrfToken = bin2hex(random_bytes(32));
    $_SESSION = ['admin_user_id' => $adminId, 'csrf_token' => $csrfToken];
    session_write_close();

    $programId = (int)$db->query('SELECT id FROM programs ORDER BY id LIMIT 1')->fetchColumn();
    if ($programId <= 0) throw new RuntimeException('At least one program is required.');
    $graduateStmt = $db->prepare("INSERT INTO graduates (student_id, first_name, last_name, email, program_id, year_graduated, status) VALUES (:student_id, 'Live', 'Edit', :email, :program_id, 2025, 'active')");
    $graduateStmt->execute([
        ':student_id' => 'LIVE-' . strtoupper($suffix),
        ':email' => 'live-edit-graduate-' . $suffix . '@example.invalid',
        ':program_id' => $programId,
    ]);
    $graduateId = (int)$db->lastInsertId();

    $templateStmt = $db->prepare("INSERT INTO survey_templates (template_key, title, description) VALUES (:key, :title, 'Live wording test')");
    $templateStmt->execute([':key' => gradtrack_survey_uuid(), ':title' => 'Live editing ' . $suffix]);
    $templateId = (int)$db->lastInsertId();
    $surveyStmt = $db->prepare("INSERT INTO surveys (template_id, version_number, title, description, status, published_at, locked_at) VALUES (:template_id, 1, :title, 'Live wording test', 'active', NOW(), NOW())");
    $surveyStmt->execute([':template_id' => $templateId, ':title' => 'Live editing ' . $suffix]);
    $surveyId = (int)$db->lastInsertId();
    $db->prepare('UPDATE survey_templates SET current_version_id = :survey_id WHERE id = :template_id')->execute([':survey_id' => $surveyId, ':template_id' => $templateId]);

    $questionStmt = $db->prepare('INSERT INTO survey_questions (survey_id, question_key, analytics_key, section, question_text, question_type, options, is_required, sort_order, is_active) VALUES (:survey_id, :question_key, :analytics_key, :section, :question_text, :question_type, :options, :required, :sort_order, 1)');
    $yearKey = gradtrack_survey_uuid();
    $questionStmt->execute([
        ':survey_id' => $surveyId, ':question_key' => $yearKey, ':analytics_key' => 'graduation_year',
        ':section' => 'Education', ':question_text' => 'Year Graduated', ':question_type' => 'multiple_choice',
        ':options' => json_encode(['2025']), ':required' => 1, ':sort_order' => 1,
    ]);
    $yearQuestionId = (int)$db->lastInsertId();
    gradtrack_survey_sync_question_options($db, $yearQuestionId, $yearKey, ['2025']);

    $choiceKey = gradtrack_survey_uuid();
    $oldQuestionText = 'Is this your first job after college?';
    $oldNoLabel = 'No (please proceed to Question 37 and 38)';
    $newQuestionText = 'Is this your first job after graduating from college?';
    $newNoLabel = 'No (please proceed to Questions 37 and 38)';
    $questionStmt->execute([
        ':survey_id' => $surveyId, ':question_key' => $choiceKey, ':analytics_key' => null,
        ':section' => 'Employment Data', ':question_text' => $oldQuestionText, ':question_type' => 'multiple_choice',
        ':options' => json_encode(['Yes', $oldNoLabel]), ':required' => 1, ':sort_order' => 2,
    ]);
    $choiceQuestionId = (int)$db->lastInsertId();
    gradtrack_survey_sync_question_options($db, $choiceQuestionId, $choiceKey, ['Yes', $oldNoLabel]);

    $programRows = $db->query(
        "SELECT id, code, name FROM programs WHERE code IN ('BSCS', 'BSHM', 'BSN') ORDER BY FIELD(code, 'BSCS', 'BSHM', 'BSN')"
    )->fetchAll(PDO::FETCH_ASSOC);
    if (count($programRows) !== 3) throw new RuntimeException('BSCS, BSHM, and BSN programs are required.');
    $programLabels = array_column($programRows, 'name');
    $programKey = gradtrack_survey_uuid();
    $questionStmt->execute([
        ':survey_id' => $surveyId, ':question_key' => $programKey, ':analytics_key' => 'program',
        ':section' => 'Education', ':question_text' => 'Degree Program & Specialization',
        ':question_type' => 'multiple_choice', ':options' => json_encode($programLabels),
        ':required' => 1, ':sort_order' => 3,
    ]);
    $programQuestionId = (int)$db->lastInsertId();
    gradtrack_survey_sync_question_options($db, $programQuestionId, $programKey, $programLabels);

    $optionDefinitions = gradtrack_survey_fetch_option_definitions(
        $db,
        [$yearQuestionId, $choiceQuestionId, $programQuestionId]
    );
    $yearOptions = $optionDefinitions[$yearQuestionId];
    $choiceOptions = $optionDefinitions[$choiceQuestionId];
    $programOptions = $optionDefinitions[$programQuestionId];
    $stableNoValue = (string)$choiceOptions[1]['value'];
    $stableNoId = (int)$choiceOptions[1]['id'];
    $stableBsnValue = (string)$programOptions[2]['value'];

    $answers = [
        (string)$yearQuestionId => '2025',
        (string)$choiceQuestionId => $stableNoValue,
        (string)$programQuestionId => $stableBsnValue,
    ];
    $responseStmt = $db->prepare('INSERT INTO survey_responses (survey_id, survey_version_id, graduate_id, responses, submitted_at) VALUES (:survey_id, :survey_version_id, :graduate_id, :responses, DATE_SUB(NOW(), INTERVAL 1 DAY))');
    $responseStmt->execute([':survey_id' => $surveyId, ':survey_version_id' => $surveyId, ':graduate_id' => $graduateId, ':responses' => json_encode($answers)]);
    $responseId = (int)$db->lastInsertId();
    $allQuestions = $db->query('SELECT * FROM survey_questions WHERE survey_id = ' . $surveyId . ' ORDER BY sort_order, id')->fetchAll(PDO::FETCH_ASSOC);
    $allQuestions = gradtrack_survey_attach_option_definitions($db, $allQuestions);
    gradtrack_survey_insert_normalized_answers($db, $responseId, $allQuestions, $answers);

    $before = live_edit_request('surveys/analytics.php?survey_id=' . $surveyId, $sessionId, $csrfToken);
    $beforeChoice = array_values(array_filter($before['json']['data']['questions_analytics'] ?? [], static fn (array $row): bool => (int)($row['question_id'] ?? 0) === $choiceQuestionId))[0] ?? null;

    $payload = [
        'id' => $surveyId, 'title' => 'Live editing ' . $suffix, 'description' => 'Corrected wording', 'status' => 'active',
        'questions' => [
            [
                'id' => $yearQuestionId, 'section_id' => null, 'section' => 'Education', 'question_text' => 'Year Graduated',
                'question_type' => 'multiple_choice', 'options' => ['2025'], 'option_definitions' => $yearOptions,
                'is_required' => 1, 'sort_order' => 1,
            ],
            [
                'id' => $choiceQuestionId, 'section_id' => null, 'section' => 'Employment Information', 'question_text' => $newQuestionText,
                'question_type' => 'multiple_choice', 'options' => ['Yes', $newNoLabel],
                'option_definitions' => [$choiceOptions[0], array_merge($choiceOptions[1], ['label' => $newNoLabel])],
                'is_required' => 1, 'sort_order' => 2,
            ],
            [
                'id' => $programQuestionId, 'analytics_key' => 'program', 'section_id' => null,
                'section' => 'Education', 'question_text' => 'Degree Program & Specialization',
                'question_type' => 'multiple_choice', 'options' => $programLabels,
                'option_definitions' => $programOptions, 'is_required' => 1, 'sort_order' => 3,
            ],
        ],
    ];
    $update = live_edit_request('surveys/index.php', $sessionId, $csrfToken, 'PUT', $payload);
    live_edit_assert($update['status'] === 200 && !empty($update['json']['success']), 'text-only corrections are accepted for an active survey with responses');

    $storedOptionStmt = $db->prepare('SELECT id, option_value, label FROM survey_question_options WHERE id = :id');
    $storedOptionStmt->execute([':id' => $stableNoId]);
    $storedOption = $storedOptionStmt->fetch(PDO::FETCH_ASSOC) ?: [];
    live_edit_assert((int)($storedOption['id'] ?? 0) === $stableNoId && ($storedOption['option_value'] ?? '') === $stableNoValue, 'the stable option ID and value are unchanged');
    live_edit_assert(($storedOption['label'] ?? '') === $newNoLabel, 'only the option display label is updated');

    $answerStmt = $db->prepare('SELECT answer_value FROM survey_response_answers WHERE survey_response_id = :response_id AND survey_question_id = :question_id');
    $answerStmt->execute([':response_id' => $responseId, ':question_id' => $choiceQuestionId]);
    live_edit_assert(json_decode((string)$answerStmt->fetchColumn(), true) === $stableNoValue, 'the historical normalized answer is not rewritten');
    $responseJsonStmt = $db->prepare('SELECT responses FROM survey_responses WHERE id = :id');
    $responseJsonStmt->execute([':id' => $responseId]);
    $storedResponseJson = json_decode((string)$responseJsonStmt->fetchColumn(), true);
    live_edit_assert(($storedResponseJson[(string)$choiceQuestionId] ?? null) === $stableNoValue, 'the historical legacy response payload is not rewritten');

    $after = live_edit_request('surveys/analytics.php?survey_id=' . $surveyId, $sessionId, $csrfToken);
    $afterChoice = array_values(array_filter($after['json']['data']['questions_analytics'] ?? [], static fn (array $row): bool => (int)($row['question_id'] ?? 0) === $choiceQuestionId))[0] ?? null;
    live_edit_assert($after['status'] === 200 && !empty($after['json']['success']), 'response analytics still load after the wording correction');
    live_edit_assert(($beforeChoice['total_answers'] ?? null) === ($afterChoice['total_answers'] ?? null), 'response counts are identical after the label correction');
    live_edit_assert(($beforeChoice['data'][1]['percentage'] ?? null) === ($afterChoice['data'][1]['percentage'] ?? null), 'response percentages are identical after the label correction');
    $correctedLabelRow = array_values(array_filter($afterChoice['data'] ?? [], static fn (array $row): bool => ($row['option'] ?? '') === $newNoLabel))[0] ?? null;
    live_edit_assert(($afterChoice['question_text'] ?? '') === $newQuestionText && (int)($correctedLabelRow['count'] ?? 0) === 1, 'analytics display the corrected wording');

    $structuralPayload = $payload;
    $structuralPayload['questions'][1]['question_type'] = 'text';
    $blocked = live_edit_request('surveys/index.php', $sessionId, $csrfToken, 'PUT', $structuralPayload);
    live_edit_assert($blocked['status'] === 409 && ($blocked['json']['code'] ?? '') === 'SURVEY_STRUCTURE_LOCKED', 'changing a structural field is blocked');

    $addOptionPayload = $payload;
    $addOptionPayload['questions'][1]['options'][] = 'Maybe';
    $addOptionPayload['questions'][1]['option_definitions'][] = ['id' => null, 'key' => null, 'value' => 'Maybe', 'label' => 'Maybe'];
    $blockedOption = live_edit_request('surveys/index.php', $sessionId, $csrfToken, 'PUT', $addOptionPayload);
    live_edit_assert($blockedOption['status'] === 409 && ($blockedOption['json']['code'] ?? '') === 'SURVEY_STRUCTURE_LOCKED', 'adding an option is blocked after responses exist');

    $programScopePayload = $payload;
    $programScopePayload['questions'][2]['options'] = array_slice($programLabels, 0, 2);
    $programScopePayload['questions'][2]['option_definitions'] = array_slice($programOptions, 0, 2);
    $programScopeUpdate = live_edit_request(
        'surveys/index.php',
        $sessionId,
        $csrfToken,
        'PUT',
        $programScopePayload
    );
    live_edit_assert(
        $programScopeUpdate['status'] === 200 && !empty($programScopeUpdate['json']['success']),
        'Degree Program & Specialization options may be removed from an active survey'
    );
    $updatedScope = gradtrack_get_survey_program_scope($db, $surveyId);
    live_edit_assert(
        array_column($updatedScope['departments'], 'code') === ['BSCS', 'BSHM'],
        'Verify Identity scope immediately follows the saved program question options'
    );
    $answerStmt->execute([':response_id' => $responseId, ':question_id' => $programQuestionId]);
    live_edit_assert(
        json_decode((string)$answerStmt->fetchColumn(), true) === $stableBsnValue,
        'removing a current program option does not rewrite its historical response value'
    );
    $programAnalyticsResponse = live_edit_request(
        'surveys/analytics.php?survey_id=' . $surveyId,
        $sessionId,
        $csrfToken
    );
    $programAnalytics = array_values(array_filter(
        $programAnalyticsResponse['json']['data']['questions_analytics'] ?? [],
        static fn (array $row): bool => (int)($row['question_id'] ?? 0) === $programQuestionId
    ))[0] ?? null;
    $historicalProgramRow = array_values(array_filter(
        $programAnalytics['data'] ?? [],
        static fn (array $row): bool => ($row['option'] ?? '') === $stableBsnValue
    ))[0] ?? null;
    live_edit_assert(
        $programAnalyticsResponse['status'] === 200 && (int)($historicalProgramRow['count'] ?? 0) === 1,
        'analytics retain the historical answer after that program is removed from current verification options'
    );

    $questionCountStmt = $db->prepare('SELECT COUNT(*) FROM survey_questions WHERE survey_id = :id');
    $questionCountStmt->execute([':id' => $surveyId]);
    live_edit_assert((int)$questionCountStmt->fetchColumn() === 3, 'no question rows are recreated or duplicated');
} catch (Throwable $error) {
    live_edit_assert(false, 'integration test completed without an exception: ' . $error->getMessage());
}

live_edit_cleanup();
$cleanupFinished = true;
if ($failures > 0) {
    echo PHP_EOL . $failures . ' live survey question editing test(s) failed.' . PHP_EOL;
    exit(1);
}
echo PHP_EOL . 'All live survey question editing integration tests passed.' . PHP_EOL;
