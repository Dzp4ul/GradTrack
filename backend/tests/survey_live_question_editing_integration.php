<?php

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';
require_once __DIR__ . '/../api/config/survey_versioning.php';

$db = (new Database())->getConnection();
$baseUrl = rtrim((string)(getenv('GRADTRACK_HTTP_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();
$failures = 0;
$sessionId = null;
$adminId = 0;
$graduateId = 0;
$surveyId = 0;
$templateId = 0;
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
        'content' => $body !== null ? json_encode($body) : '',
        'ignore_errors' => true,
        'timeout' => 30,
    ]]);
    $raw = @file_get_contents($baseUrl . '/' . ltrim($path, '/'), false, $context);
    $status = 0;
    foreach ($http_response_header ?? [] as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $matches) === 1) {
            $status = (int)$matches[1];
            break;
        }
    }
    return [
        'status' => $status,
        'json' => is_string($raw) ? json_decode($raw, true) : null,
        'raw' => is_string($raw) ? $raw : '',
    ];
}

function live_edit_cleanup(): void
{
    global $db, $sessionId, $adminId, $graduateId, $surveyId, $templateId, $previousActiveIds;
    try {
        if ($adminId > 0) {
            $db->prepare('DELETE FROM audit_trail WHERE user_id = :id')->execute([':id' => $adminId]);
        }
        if ($surveyId > 0) {
            $db->prepare(
                'DELETE answer_row FROM survey_response_answers answer_row
                 INNER JOIN survey_responses response_row ON response_row.id = answer_row.survey_response_id
                 WHERE response_row.survey_id = :survey_id'
            )->execute([':survey_id' => $surveyId]);
            $db->prepare('DELETE FROM survey_responses WHERE survey_id = :survey_id')->execute([':survey_id' => $surveyId]);
            $db->prepare('DELETE FROM survey_questions WHERE survey_id = :survey_id')->execute([':survey_id' => $surveyId]);
            $db->prepare('DELETE FROM survey_sections WHERE survey_id = :survey_id')->execute([':survey_id' => $surveyId]);
            $db->prepare('UPDATE survey_templates SET current_version_id = NULL WHERE current_version_id = :survey_id')
                ->execute([':survey_id' => $surveyId]);
            $db->prepare('DELETE FROM surveys WHERE id = :survey_id')->execute([':survey_id' => $surveyId]);
        }
        if ($templateId > 0) {
            $db->prepare('DELETE FROM survey_templates WHERE id = :id')->execute([':id' => $templateId]);
        }
        if ($graduateId > 0) {
            $db->prepare('DELETE FROM graduates WHERE id = :id')->execute([':id' => $graduateId]);
        }
        if ($adminId > 0) {
            $db->prepare('DELETE FROM admin_users WHERE id = :id')->execute([':id' => $adminId]);
        }
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
        if (@session_start()) {
            $_SESSION = [];
            session_destroy();
        }
    }
}

$cleanupFinished = false;
register_shutdown_function(static function () use (&$cleanupFinished): void {
    if (!$cleanupFinished) live_edit_cleanup();
});

try {
    $healthContext = stream_context_create(['http' => ['ignore_errors' => true, 'timeout' => 10]]);
    if (@file_get_contents($baseUrl . '/csrf.php', false, $healthContext) === false) {
        throw new RuntimeException('Test API is not reachable at ' . $baseUrl);
    }

    $suffix = bin2hex(random_bytes(5));
    $previousActiveIds = array_map('intval', $db->query(
        "SELECT id FROM surveys WHERE status = 'active' AND archived_at IS NULL"
    )->fetchAll(PDO::FETCH_COLUMN));
    $db->exec("UPDATE surveys SET status = 'inactive' WHERE status = 'active' AND archived_at IS NULL");

    $adminStmt = $db->prepare(
        'INSERT INTO admin_users (username, email, password, full_name, role, is_active)
         VALUES (:username, :email, :password, :full_name, \'admin\', 1)'
    );
    $adminStmt->execute([
        ':username' => 'live_edit_' . $suffix,
        ':email' => 'live-edit-' . $suffix . '@example.invalid',
        ':password' => password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT),
        ':full_name' => 'Live Survey Edit Test',
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
    $graduateStmt = $db->prepare(
        'INSERT INTO graduates
         (student_id, first_name, last_name, email, program_id, year_graduated, status)
         VALUES (:student_id, \'Live\', \'Edit\', :email, :program_id, 2025, \'active\')'
    );
    $graduateStmt->execute([
        ':student_id' => 'LIVE-' . strtoupper($suffix),
        ':email' => 'live-edit-graduate-' . $suffix . '@example.invalid',
        ':program_id' => $programId,
    ]);
    $graduateId = (int)$db->lastInsertId();

    $templateStmt = $db->prepare(
        'INSERT INTO survey_templates (template_key, title, description)
         VALUES (:template_key, :title, \'Live editing test\')'
    );
    $templateStmt->execute([':template_key' => gradtrack_survey_uuid(), ':title' => 'Live editing ' . $suffix]);
    $templateId = (int)$db->lastInsertId();
    $surveyStmt = $db->prepare(
        'INSERT INTO surveys
         (template_id, version_number, title, description, status, published_at, locked_at)
         VALUES (:template_id, 1, :title, \'Live editing test\', \'active\', NOW(), NOW())'
    );
    $surveyStmt->execute([':template_id' => $templateId, ':title' => 'Live editing ' . $suffix]);
    $surveyId = (int)$db->lastInsertId();
    $db->prepare('UPDATE survey_templates SET current_version_id = :survey_id WHERE id = :template_id')
        ->execute([':survey_id' => $surveyId, ':template_id' => $templateId]);

    $questionStmt = $db->prepare(
        'INSERT INTO survey_questions
         (survey_id, question_key, analytics_key, section, question_text, question_type, options, is_required, sort_order, is_active)
         VALUES (:survey_id, :question_key, :analytics_key, :section, :question_text, :question_type, :options, :required, :sort_order, 1)'
    );
    $questionStmt->execute([
        ':survey_id' => $surveyId,
        ':question_key' => gradtrack_survey_uuid(),
        ':analytics_key' => 'graduation_year',
        ':section' => 'Education',
        ':question_text' => 'Year Graduated',
        ':question_type' => 'multiple_choice',
        ':options' => json_encode(['2025']),
        ':required' => 1,
        ':sort_order' => 1,
    ]);
    $yearQuestionId = (int)$db->lastInsertId();
    $questionStmt->execute([
        ':survey_id' => $surveyId,
        ':question_key' => gradtrack_survey_uuid(),
        ':analytics_key' => null,
        ':section' => 'Feedback',
        ':question_text' => 'Historical feedback',
        ':question_type' => 'text',
        ':options' => null,
        ':required' => 0,
        ':sort_order' => 2,
    ]);
    $historicalQuestionId = (int)$db->lastInsertId();

    $answers = [(string)$yearQuestionId => '2025', (string)$historicalQuestionId => 'Preserve me'];
    $responseStmt = $db->prepare(
        'INSERT INTO survey_responses
         (survey_id, survey_version_id, graduate_id, responses, submitted_at)
         VALUES (:survey_id, :survey_version_id, :graduate_id, :responses, DATE_SUB(NOW(), INTERVAL 1 DAY))'
    );
    $responseStmt->execute([
        ':survey_id' => $surveyId,
        ':survey_version_id' => $surveyId,
        ':graduate_id' => $graduateId,
        ':responses' => json_encode($answers),
    ]);
    $responseId = (int)$db->lastInsertId();
    $allQuestions = $db->query(
        'SELECT * FROM survey_questions WHERE survey_id = ' . $surveyId . ' ORDER BY sort_order, id'
    )->fetchAll(PDO::FETCH_ASSOC);
    gradtrack_survey_insert_normalized_answers($db, $responseId, $allQuestions, $answers);

    $update = live_edit_request('surveys/index.php', $sessionId, $csrfToken, 'PUT', [
        'id' => $surveyId,
        'title' => 'Live editing ' . $suffix,
        'description' => 'Updated without a new version',
        'status' => 'active',
        'questions' => [[
            'id' => $yearQuestionId,
            'section' => 'Tampered section',
            'question_text' => 'Tampered historical definition',
            'question_type' => 'text',
            'options' => null,
            'is_required' => 0,
            'sort_order' => 1,
        ], [
            'section' => 'Feedback',
            'question_text' => 'New question for future respondents',
            'question_type' => 'text',
            'options' => null,
            'is_required' => 0,
            'sort_order' => 2,
        ]],
    ]);
    live_edit_assert($update['status'] === 200 && !empty($update['json']['success']), 'an active survey can be edited directly without creating a version');

    $surveyCountStmt = $db->prepare('SELECT COUNT(*) FROM surveys WHERE template_id = :template_id');
    $surveyCountStmt->execute([':template_id' => $templateId]);
    live_edit_assert((int)$surveyCountStmt->fetchColumn() === 1, 'editing keeps a single survey record');

    $questionStateStmt = $db->prepare(
        'SELECT id, question_text, question_type, is_active FROM survey_questions
         WHERE survey_id = :survey_id ORDER BY sort_order, id'
    );
    $questionStateStmt->execute([':survey_id' => $surveyId]);
    $questionStates = [];
    foreach ($questionStateStmt->fetchAll(PDO::FETCH_ASSOC) as $question) {
        $questionStates[(int)$question['id']] = $question;
    }
    live_edit_assert(
        ($questionStates[$historicalQuestionId]['is_active'] ?? 1) == 0,
        'a removed question is retired instead of deleted'
    );
    live_edit_assert(
        ($questionStates[$yearQuestionId]['question_text'] ?? '') === 'Year Graduated'
        && ($questionStates[$yearQuestionId]['question_type'] ?? '') === 'multiple_choice',
        'published question definitions remain unchanged'
    );
    live_edit_assert(count($questionStates) === 3, 'a newly added question is stored on the same survey');

    $answerCountStmt = $db->prepare(
        'SELECT COUNT(*) FROM survey_response_answers
         WHERE survey_response_id = :response_id AND survey_question_id = :question_id'
    );
    $answerCountStmt->execute([':response_id' => $responseId, ':question_id' => $historicalQuestionId]);
    live_edit_assert((int)$answerCountStmt->fetchColumn() === 1, 'the retired question keeps its normalized historical answer');

    $details = live_edit_request('surveys/index.php?id=' . $surveyId, $sessionId, $csrfToken);
    $liveIds = array_map('intval', array_column($details['json']['data']['questions'] ?? [], 'id'));
    live_edit_assert(
        $details['status'] === 200
        && !in_array($historicalQuestionId, $liveIds, true)
        && count($liveIds) === 2,
        'future forms return only active questions'
    );

    $analytics = live_edit_request('surveys/analytics.php?survey_id=' . $surveyId, $sessionId, $csrfToken);
    $retiredAnalytics = null;
    $newQuestionAnalytics = null;
    foreach ($analytics['json']['data']['questions_analytics'] ?? [] as $questionAnalytics) {
        if ((int)($questionAnalytics['question_id'] ?? 0) === $historicalQuestionId) {
            $retiredAnalytics = $questionAnalytics;
        }
        if (($questionAnalytics['question_text'] ?? '') === 'New question for future respondents') {
            $newQuestionAnalytics = $questionAnalytics;
        }
    }
    live_edit_assert(
        $analytics['status'] === 200
        && (int)($retiredAnalytics['is_active'] ?? 1) === 0
        && (int)($retiredAnalytics['total_answers'] ?? 0) === 1,
        'historical analytics still include the retired question and its answer'
    );
    live_edit_assert(
        (int)($newQuestionAnalytics['applicable_responses'] ?? -1) === 0
        && (int)($newQuestionAnalytics['skipped_answers'] ?? -1) === 0,
        'earlier respondents are not counted as skipping a newly introduced question'
    );

    $cloneAttempt = live_edit_request('surveys/index.php', $sessionId, $csrfToken, 'POST', [
        'action' => 'clone_version',
        'source_survey_id' => $surveyId,
    ]);
    live_edit_assert(
        $cloneAttempt['status'] === 409
        && ($cloneAttempt['json']['code'] ?? '') === 'SURVEY_VERSIONING_DISABLED',
        'the old version-cloning endpoint is disabled'
    );
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
