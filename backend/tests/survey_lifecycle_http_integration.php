<?php
declare(strict_types=1);

ob_start();

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';
require_once __DIR__ . '/../api/config/survey_versioning.php';

$db = (new Database())->getConnection();
$baseUrl = rtrim((string) (getenv('GRADTRACK_HTTP_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();
$fixture = [
    'survey_id' => 0,
    'template_id' => 0,
    'graduate_id' => 0,
    'question_id' => 0,
    'admin_ids' => [],
    'session_ids' => [],
    'previous_active_ids' => [],
];

function lifecycle_http_assert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
    echo 'PASS: ' . $message . PHP_EOL;
}

function lifecycle_http_session(array $identity, string $csrfToken): string
{
    global $fixture;
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    ini_set('session.use_strict_mode', '0');
    $sessionId = 'slh' . bin2hex(random_bytes(18));
    session_id($sessionId);
    session_start();
    $_SESSION = $identity + ['csrf_token' => $csrfToken, 'authenticated_at' => time()];
    session_write_close();
    $fixture['session_ids'][] = $sessionId;
    return $sessionId;
}

function lifecycle_http_request(string $method, string $path, ?array $payload, string $sessionId, string $csrfToken): array
{
    global $baseUrl, $cookieName;
    $headers = [
        'Accept: application/json',
        'Content-Type: application/json',
        'Origin: http://localhost:5173',
        'Cookie: ' . $cookieName . '=' . rawurlencode($sessionId),
        'X-CSRF-Token: ' . $csrfToken,
    ];
    $context = stream_context_create(['http' => [
        'method' => $method,
        'header' => implode("\r\n", $headers),
        'content' => $payload !== null ? json_encode($payload, JSON_THROW_ON_ERROR) : '',
        'ignore_errors' => true,
        'timeout' => 60,
    ]]);
    $raw = @file_get_contents($baseUrl . '/' . ltrim($path, '/'), false, $context);
    $status = 0;
    foreach (($http_response_header ?? []) as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $matches) === 1) {
            $status = (int) $matches[1];
            break;
        }
    }
    $decoded = json_decode((string) $raw, true);
    return ['status' => $status, 'json' => is_array($decoded) ? $decoded : []];
}

try {
    if (@file_get_contents($baseUrl . '/csrf.php', false, stream_context_create(['http' => ['ignore_errors' => true, 'timeout' => 10]])) === false) {
        throw new RuntimeException('Test API is not reachable at ' . $baseUrl);
    }

    $suffix = bin2hex(random_bytes(5));
    $fixture['previous_active_ids'] = array_map(
        'intval',
        $db->query("SELECT id FROM surveys WHERE status = 'active' AND archived_at IS NULL")->fetchAll(PDO::FETCH_COLUMN)
    );
    $db->exec("UPDATE surveys SET status = 'inactive' WHERE status = 'active' AND archived_at IS NULL");

    $adminInsert = $db->prepare(
        'INSERT INTO admin_users (username, email, password, full_name, role, is_active)
         VALUES (:username, :email, :password, :full_name, :role, 1)'
    );
    foreach (['research_coordinator', 'registrar'] as $role) {
        $adminInsert->execute([
            ':username' => 'lifecycle_' . $role . '_' . $suffix,
            ':email' => "lifecycle-{$role}-{$suffix}@example.invalid",
            ':password' => password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT),
            ':full_name' => 'Lifecycle ' . ucwords(str_replace('_', ' ', $role)),
            ':role' => $role,
        ]);
        $fixture['admin_ids'][$role] = (int) $db->lastInsertId();
    }

    $templateStmt = $db->prepare(
        "INSERT INTO survey_templates (template_key, title, description)
         VALUES (:template_key, :title, 'Lifecycle HTTP integration fixture')"
    );
    $templateStmt->execute([
        ':template_key' => gradtrack_survey_uuid(),
        ':title' => 'Lifecycle HTTP ' . $suffix,
    ]);
    $fixture['template_id'] = (int) $db->lastInsertId();
    $futureDeadline = (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))
        ->modify('+2 days')->format('Y-m-d H:i:s');
    $surveyStmt = $db->prepare(
        "INSERT INTO surveys
            (template_id, version_number, title, description, status, published_at, locked_at,
             deadline_at, target_type, total_response_target, completion_reason, completed_at, created_by)
         VALUES
            (:template_id, 1, :title, 'Lifecycle HTTP integration fixture', 'completed', NOW(), NOW(),
             :deadline_at, 'total', 1, 'target_reached', NOW(), 'integration-test')"
    );
    $surveyStmt->execute([
        ':template_id' => $fixture['template_id'],
        ':title' => 'Lifecycle HTTP ' . $suffix,
        ':deadline_at' => $futureDeadline,
    ]);
    $fixture['survey_id'] = (int) $db->lastInsertId();
    $db->prepare('UPDATE survey_templates SET current_version_id = :survey_id WHERE id = :template_id')
        ->execute([':survey_id' => $fixture['survey_id'], ':template_id' => $fixture['template_id']]);

    $questionKey = gradtrack_survey_uuid();
    $questionStmt = $db->prepare(
        "INSERT INTO survey_questions
            (survey_id, question_key, analytics_key, section, question_text, question_type, options, is_required, sort_order)
         VALUES
            (:survey_id, :question_key, 'graduation_year', 'Education', 'Year Graduated',
             'multiple_choice', :options, 1, 1)"
    );
    $questionStmt->execute([
        ':survey_id' => $fixture['survey_id'],
        ':question_key' => $questionKey,
        ':options' => json_encode(['2026'], JSON_THROW_ON_ERROR),
    ]);
    $fixture['question_id'] = (int) $db->lastInsertId();
    gradtrack_survey_sync_question_options($db, $fixture['question_id'], $questionKey, ['2026']);

    $graduateStmt = $db->prepare(
        "INSERT INTO graduates (student_id, first_name, last_name, year_graduated, status)
         VALUES (:student_id, 'Lifecycle', 'HTTP', 2026, 'active')"
    );
    $graduateStmt->execute([':student_id' => 'SLH-' . strtoupper($suffix)]);
    $fixture['graduate_id'] = (int) $db->lastInsertId();
    $responseStmt = $db->prepare(
        'INSERT INTO survey_responses
            (survey_id, survey_version_id, graduate_id, responses, submitted_at)
         VALUES (:survey_id, :survey_version_id, :graduate_id, JSON_OBJECT(), NOW())'
    );
    $responseStmt->execute([
        ':survey_id' => $fixture['survey_id'],
        ':survey_version_id' => $fixture['survey_id'],
        ':graduate_id' => $fixture['graduate_id'],
    ]);

    $coordinatorCsrf = bin2hex(random_bytes(32));
    $registrarCsrf = bin2hex(random_bytes(32));
    $graduateCsrf = bin2hex(random_bytes(32));
    $coordinatorSession = lifecycle_http_session(['admin_user_id' => $fixture['admin_ids']['research_coordinator']], $coordinatorCsrf);
    $registrarSession = lifecycle_http_session(['admin_user_id' => $fixture['admin_ids']['registrar']], $registrarCsrf);
    $graduateSession = lifecycle_http_session(['graduate_account_id' => 999999999], $graduateCsrf);

    $payload = [
        'id' => $fixture['survey_id'],
        'title' => 'Lifecycle HTTP ' . $suffix,
        'description' => 'Lifecycle HTTP integration fixture',
        'status' => 'active',
        'deadline_at' => str_replace(' ', 'T', substr($futureDeadline, 0, 16)),
        'target_type' => 'total',
        'total_response_target' => 1,
        'program_targets' => [],
        'reactivation_reason' => 'Collect additional responses for validation.',
    ];

    $unauthorizedRegistrar = lifecycle_http_request('PUT', 'surveys/index.php', $payload, $registrarSession, $registrarCsrf);
    lifecycle_http_assert($unauthorizedRegistrar['status'] === 403, 'a Registrar cannot reactivate a completed survey');
    $unauthorizedGraduate = lifecycle_http_request('PUT', 'surveys/index.php', $payload, $graduateSession, $graduateCsrf);
    lifecycle_http_assert(in_array($unauthorizedGraduate['status'], [401, 403], true), 'a graduate cannot modify survey lifecycle settings');

    $reactivated = lifecycle_http_request('PUT', 'surveys/index.php', $payload, $coordinatorSession, $coordinatorCsrf);
    lifecycle_http_assert($reactivated['status'] === 200 && !empty($reactivated['json']['success']), 'an authorized Research Coordinator can reactivate a completed target survey');
    $reactivatedRow = $db->query(
        'SELECT status, target_completion_suppressed, reactivated_by, reactivation_reason
           FROM surveys WHERE id = ' . $fixture['survey_id']
    )->fetch(PDO::FETCH_ASSOC) ?: [];
    lifecycle_http_assert(($reactivatedRow['status'] ?? '') === 'active' && (int) ($reactivatedRow['target_completion_suppressed'] ?? 0) === 1, 'reactivation persists the target-completion override');
    lifecycle_http_assert((int) ($reactivatedRow['reactivated_by'] ?? 0) === $fixture['admin_ids']['research_coordinator'], 'reactivation records the responsible Research Coordinator');
    lifecycle_http_assert(($reactivatedRow['reactivation_reason'] ?? '') === $payload['reactivation_reason'], 'reactivation records the supplied reason');

    $pastDeadline = (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))
        ->modify('-1 minute')->format('Y-m-d H:i:s');
    $db->prepare(
        "UPDATE surveys
            SET status = 'completed', completion_reason = 'deadline_reached', completed_at = NOW(),
                deadline_at = :deadline_at, target_completion_suppressed = 0
          WHERE id = :id"
    )->execute([':deadline_at' => $pastDeadline, ':id' => $fixture['survey_id']]);
    $expiredPayload = $payload;
    $expiredPayload['deadline_at'] = str_replace(' ', 'T', substr($pastDeadline, 0, 16));
    $expiredReactivation = lifecycle_http_request('PUT', 'surveys/index.php', $expiredPayload, $coordinatorSession, $coordinatorCsrf);
    lifecycle_http_assert($expiredReactivation['status'] === 422, 'a passed deadline cannot be bypassed by direct reactivation API request');

    $extendedReactivation = lifecycle_http_request('PUT', 'surveys/index.php', $payload, $coordinatorSession, $coordinatorCsrf);
    lifecycle_http_assert($extendedReactivation['status'] === 200 && !empty($extendedReactivation['json']['success']), 'extending the deadline allows intentional reactivation');

    $db->prepare(
        "UPDATE surveys
            SET status = 'completed', completion_reason = 'target_reached', completed_at = NOW(),
                deadline_at = :deadline_at, total_response_target = 1, target_completion_suppressed = 0
          WHERE id = :id"
    )->execute([':deadline_at' => $futureDeadline, ':id' => $fixture['survey_id']]);
    $increasedPayload = $payload;
    $increasedPayload['total_response_target'] = 2;
    $increasedTarget = lifecycle_http_request('PUT', 'surveys/index.php', $increasedPayload, $coordinatorSession, $coordinatorCsrf);
    lifecycle_http_assert($increasedTarget['status'] === 200 && !empty($increasedTarget['json']['success']), 'a completed survey can be reopened with a higher target');
    $increasedRow = $db->query(
        'SELECT status, total_response_target, target_completion_suppressed FROM surveys WHERE id = ' . $fixture['survey_id']
    )->fetch(PDO::FETCH_ASSOC) ?: [];
    lifecycle_http_assert(
        ($increasedRow['status'] ?? '') === 'active'
        && (int) ($increasedRow['total_response_target'] ?? 0) === 2
        && (int) ($increasedRow['target_completion_suppressed'] ?? 1) === 0,
        'raising the target resets suppression and leaves the survey active below the new target'
    );

    $responseCount = (int) $db->query(
        'SELECT COUNT(*) FROM survey_responses WHERE survey_id = ' . $fixture['survey_id']
    )->fetchColumn();
    lifecycle_http_assert($responseCount === 1, 'reactivation and target changes preserve existing responses');

    $db->prepare(
        "UPDATE surveys
            SET status = 'active', completion_reason = NULL, completed_at = NULL,
                deadline_at = :deadline_at, target_type = 'none', total_response_target = NULL,
                target_completion_suppressed = 0
          WHERE id = :id"
    )->execute([':deadline_at' => $pastDeadline, ':id' => $fixture['survey_id']]);
    $token = bin2hex(random_bytes(32));
    $db->prepare(
        'INSERT INTO survey_tokens (survey_id, graduate_id, token, expires_at)
         VALUES (:survey_id, :graduate_id, :token, DATE_ADD(NOW(), INTERVAL 1 HOUR))'
    )->execute([
        ':survey_id' => $fixture['survey_id'],
        ':graduate_id' => $fixture['graduate_id'],
        ':token' => $token,
    ]);
    $expiredSubmission = lifecycle_http_request('POST', 'surveys/responses.php', [
        'survey_id' => $fixture['survey_id'],
        'graduate_id' => $fixture['graduate_id'],
        'token' => $token,
        'responses' => [(string) $fixture['question_id'] => '2026'],
    ], $graduateSession, $graduateCsrf);
    lifecycle_http_assert(
        $expiredSubmission['status'] === 409
        && ($expiredSubmission['json']['completion_reason'] ?? '') === 'deadline_reached',
        'the submission API rejects an expired survey and returns the deadline completion reason'
    );
    $responseCountAfterRejectedSubmission = (int) $db->query(
        'SELECT COUNT(*) FROM survey_responses WHERE survey_id = ' . $fixture['survey_id']
    )->fetchColumn();
    lifecycle_http_assert($responseCountAfterRejectedSubmission === 1, 'an expired direct API attempt does not create a response');

    echo PHP_EOL . 'Survey lifecycle HTTP integration test passed.' . PHP_EOL;
} catch (Throwable $exception) {
    fwrite(STDERR, 'FAIL: ' . $exception->getMessage() . PHP_EOL);
    $exitCode = 1;
} finally {
    foreach ($fixture['session_ids'] as $sessionId) {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        ini_set('session.use_strict_mode', '0');
        session_id($sessionId);
        if (@session_start()) {
            $_SESSION = [];
            session_destroy();
        }
    }
    if ($fixture['survey_id'] > 0) {
        $db->prepare('DELETE FROM audit_trail WHERE record_id = :record_id AND module = :module')
            ->execute([':record_id' => (string) $fixture['survey_id'], ':module' => 'Survey Management']);
        $db->prepare('DELETE FROM survey_tokens WHERE survey_id = :id')->execute([':id' => $fixture['survey_id']]);
        $db->prepare('DELETE FROM survey_responses WHERE survey_id = :id')->execute([':id' => $fixture['survey_id']]);
        $db->prepare('DELETE FROM survey_questions WHERE survey_id = :id')->execute([':id' => $fixture['survey_id']]);
        $db->prepare('DELETE FROM survey_sections WHERE survey_id = :id')->execute([':id' => $fixture['survey_id']]);
        $db->prepare('UPDATE survey_templates SET current_version_id = NULL WHERE current_version_id = :id')
            ->execute([':id' => $fixture['survey_id']]);
        $db->prepare('DELETE FROM surveys WHERE id = :id')->execute([':id' => $fixture['survey_id']]);
    }
    if ($fixture['template_id'] > 0) {
        $db->prepare('DELETE FROM survey_templates WHERE id = :id')->execute([':id' => $fixture['template_id']]);
    }
    if ($fixture['graduate_id'] > 0) {
        $db->prepare('DELETE FROM graduates WHERE id = :id')->execute([':id' => $fixture['graduate_id']]);
    }
    if ($fixture['admin_ids'] !== []) {
        $placeholders = implode(',', array_fill(0, count($fixture['admin_ids']), '?'));
        $db->prepare("DELETE FROM admin_users WHERE id IN ({$placeholders})")
            ->execute(array_values($fixture['admin_ids']));
    }
    if ($fixture['previous_active_ids'] !== []) {
        $placeholders = implode(',', array_fill(0, count($fixture['previous_active_ids']), '?'));
        $db->prepare("UPDATE surveys SET status = 'active' WHERE id IN ({$placeholders})")
            ->execute($fixture['previous_active_ids']);
    }
}

ob_end_flush();
exit($exitCode ?? 0);
