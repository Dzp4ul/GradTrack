<?php

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';
require_once __DIR__ . '/../api/config/graduation_years.php';
require_once __DIR__ . '/../api/config/survey_versioning.php';

$failures = 0;
$baseUrl = rtrim((string) (getenv('GRADTRACK_HTTP_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();
$sessionIds = [];
$csrfTokens = [];
$fixture = [
    'surveys' => [],
    'templates' => [],
    'graduates' => [],
    'accounts' => [],
    'admins' => [],
    'previous_active_ids' => [],
];

function coverage_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function coverage_session(array $identity): string
{
    global $sessionIds, $csrfTokens;
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    ini_set('session.use_strict_mode', '0');
    $sessionId = 'gty' . bin2hex(random_bytes(18));
    session_id($sessionId);
    session_start();
    $csrfToken = bin2hex(random_bytes(32));
    $_SESSION = $identity + ['csrf_token' => $csrfToken];
    session_write_close();
    $sessionIds[] = $sessionId;
    $csrfTokens[$sessionId] = $csrfToken;
    return $sessionId;
}

function coverage_request(string $path, ?string $sessionId = null, string $method = 'GET', ?array $body = null): array
{
    global $baseUrl, $cookieName, $csrfTokens;
    $headers = ['Accept: application/json', 'Origin: http://localhost:5173'];
    if ($sessionId !== null) {
        $headers[] = 'Cookie: ' . $cookieName . '=' . rawurlencode($sessionId);
        if (isset($csrfTokens[$sessionId])) $headers[] = 'X-CSRF-Token: ' . $csrfTokens[$sessionId];
    }
    if ($body !== null) $headers[] = 'Content-Type: application/json';
    $context = stream_context_create(['http' => [
        'method' => $method,
        'header' => implode("\r\n", $headers),
        'content' => $body !== null ? json_encode($body) : '',
        'ignore_errors' => true,
        'timeout' => 30,
    ]]);
    $raw = @file_get_contents($baseUrl . '/' . ltrim($path, '/'), false, $context);
    $headersOut = $http_response_header ?? [];
    $status = 0;
    foreach ($headersOut as $header) {
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

function coverage_create_admin(PDO $db, string $role, string $suffix): int
{
    $stmt = $db->prepare('INSERT INTO admin_users
        (username, email, password, full_name, role, is_active)
        VALUES (:username, :email, :password, :full_name, :role, 1)');
    $stmt->execute([
        ':username' => 'coverage_' . $role . '_' . $suffix,
        ':email' => 'coverage-' . $role . '-' . $suffix . '@example.invalid',
        ':password' => password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT),
        ':full_name' => 'Coverage ' . $role,
        ':role' => $role,
    ]);
    return (int) $db->lastInsertId();
}

function coverage_create_survey(PDO $db, string $title, string $status, array $years): int
{
    global $fixture;
    $templateStmt = $db->prepare(
        "INSERT INTO survey_templates (template_key, title, description)
         VALUES (:template_key, :title, 'Coverage integration test')"
    );
    $templateStmt->execute([':template_key' => gradtrack_survey_uuid(), ':title' => $title]);
    $templateId = (int)$db->lastInsertId();
    $fixture['templates'][] = $templateId;

    $stmt = $db->prepare(
        "INSERT INTO surveys (template_id, version_number, title, description, status, published_at, locked_at)
         VALUES (:template_id, 1, :title, 'Coverage integration test', :status,
                 CASE WHEN :publish_status = 'draft' THEN NULL ELSE NOW() END,
                 CASE WHEN :lock_status = 'draft' THEN NULL ELSE NOW() END)"
    );
    $stmt->execute([
        ':template_id' => $templateId,
        ':title' => $title,
        ':status' => $status,
        ':publish_status' => $status,
        ':lock_status' => $status,
    ]);
    $surveyId = (int) $db->lastInsertId();
    $questionStmt = $db->prepare("INSERT INTO survey_questions
        (survey_id, question_key, analytics_key, section, question_text, question_type, options, is_required, sort_order)
        VALUES (:survey_id, :question_key, 'graduation_year', 'Educational Background',
                'Q16: Year Graduated', 'multiple_choice', :options, 1, 16)");
    $questionStmt->execute([
        ':survey_id' => $surveyId,
        ':question_key' => gradtrack_survey_uuid(),
        ':options' => json_encode(array_map('strval', $years)),
    ]);
    if ($status !== 'draft') {
        $db->prepare('UPDATE survey_templates SET current_version_id = :survey_id WHERE id = :template_id')
            ->execute([':survey_id' => $surveyId, ':template_id' => $templateId]);
    }
    return $surveyId;
}

function coverage_create_graduate(PDO $db, int $programId, int $year, string $suffix): int
{
    $serialNumber = (int) sprintf('%u', crc32($suffix . ':' . $year)) % 10000;
    $existsStmt = $db->prepare('SELECT COUNT(*) FROM graduates WHERE student_id = :student_id');
    do {
        $serial = str_pad((string) $serialNumber, 4, '0', STR_PAD_LEFT);
        $studentId = substr((string) $year, 0, 4) . '-' . $serial;
        $existsStmt->execute([':student_id' => $studentId]);
        $serialNumber = ($serialNumber + 1) % 10000;
    } while ((int) $existsStmt->fetchColumn() > 0);

    $stmt = $db->prepare('INSERT INTO graduates
        (student_id, first_name, last_name, email, program_id, year_graduated, status)
        VALUES (:student_id, :first_name, :last_name, :email, :program_id, :year, \'active\')');
    $stmt->execute([
        ':student_id' => $studentId,
        ':first_name' => 'Coverage' . $year,
        ':last_name' => 'Cohort' . $suffix,
        ':email' => 'coverage-' . $year . '-' . $suffix . '@example.invalid',
        ':program_id' => $programId,
        ':year' => $year,
    ]);
    return (int) $db->lastInsertId();
}

function coverage_ids(array $response): array
{
    return array_map('intval', array_column($response['json']['data'] ?? [], 'id'));
}

function coverage_cleanup(PDO $db): void
{
    global $fixture, $sessionIds;
    try {
        foreach ($fixture['admins'] as $adminId) {
            $db->prepare('DELETE FROM audit_trail WHERE user_id = :id')->execute([':id' => $adminId]);
        }
        foreach ($fixture['accounts'] as $accountId) {
            $db->prepare('UPDATE survey_responses SET graduate_account_id = NULL WHERE graduate_account_id = :id')
                ->execute([':id' => $accountId]);
            $db->prepare('DELETE FROM graduate_accounts WHERE id = :id')->execute([':id' => $accountId]);
        }
        foreach ($fixture['surveys'] as $surveyId) {
            $db->prepare(
                'DELETE sra FROM survey_response_answers sra
                 INNER JOIN survey_responses sr ON sr.id = sra.survey_response_id
                 WHERE sr.survey_id = :id'
            )->execute([':id' => $surveyId]);
            $db->prepare('DELETE FROM survey_reminder_logs WHERE survey_id = :id')->execute([':id' => $surveyId]);
            $db->prepare('DELETE FROM survey_tokens WHERE survey_id = :id')->execute([':id' => $surveyId]);
            $db->prepare('DELETE FROM survey_responses WHERE survey_id = :id')->execute([':id' => $surveyId]);
            $db->prepare('DELETE FROM survey_questions WHERE survey_id = :id')->execute([':id' => $surveyId]);
            $db->prepare('DELETE FROM survey_sections WHERE survey_id = :id')->execute([':id' => $surveyId]);
            $db->prepare('UPDATE survey_templates SET current_version_id = NULL WHERE current_version_id = :id')
                ->execute([':id' => $surveyId]);
            $db->prepare('DELETE FROM surveys WHERE id = :id')->execute([':id' => $surveyId]);
        }
        foreach ($fixture['templates'] as $templateId) {
            $db->prepare('DELETE FROM survey_templates WHERE id = :id')->execute([':id' => $templateId]);
        }
        foreach ($fixture['graduates'] as $graduateId) {
            $db->prepare('DELETE FROM graduates WHERE id = :id')->execute([':id' => $graduateId]);
        }
        foreach ($fixture['admins'] as $adminId) {
            $db->prepare('DELETE FROM admin_users WHERE id = :id')->execute([':id' => $adminId]);
        }
        if ($fixture['previous_active_ids'] !== []) {
            $placeholders = implode(',', array_fill(0, count($fixture['previous_active_ids']), '?'));
            $db->prepare("UPDATE surveys SET status = 'active' WHERE id IN ($placeholders)")
                ->execute($fixture['previous_active_ids']);
        }
    } catch (Throwable $error) {
        echo 'CLEANUP WARNING: ' . $error->getMessage() . PHP_EOL;
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

$db = (new Database())->getConnection();
$cleanupFinished = false;
register_shutdown_function(static function () use ($db, &$cleanupFinished): void {
    if (!$cleanupFinished) coverage_cleanup($db);
});

try {
    $health = coverage_request('csrf.php');
    if ($health['status'] !== 200) {
        throw new RuntimeException('Test API is not reachable at ' . $baseUrl);
    }

    $suffix = bin2hex(random_bytes(4));
    $program = $db->query("SELECT id, code FROM programs WHERE code = 'BSCS' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    if (!$program) throw new RuntimeException('BSCS program is required for the Dean-scope test.');

    $fixture['previous_active_ids'] = array_map('intval', $db->query("SELECT id FROM surveys WHERE status = 'active' AND archived_at IS NULL")->fetchAll(PDO::FETCH_COLUMN));
    $db->exec("UPDATE surveys SET status = 'inactive' WHERE status = 'active' AND archived_at IS NULL");

    $fixture['admins'][] = $adminId = coverage_create_admin($db, 'research_coordinator', $suffix);
    $fixture['admins'][] = $deanId = coverage_create_admin($db, 'dean_cs', $suffix);
    $adminSession = coverage_session(['admin_user_id' => $adminId]);
    $deanSession = coverage_session(['admin_user_id' => $deanId]);
    $researchCoordinatorSession = $adminSession;

    $surveyA = coverage_create_survey($db, 'Coverage A ' . $suffix, 'draft', [2025, 2024, 2023, 2022, 2021]);
    $fixture['surveys'][] = $surveyA;
    $graduateByYear = [];
    foreach (range(2020, 2027) as $year) {
        $graduateByYear[$year] = coverage_create_graduate($db, (int) $program['id'], $year, $suffix);
        $fixture['graduates'][] = $graduateByYear[$year];
    }

    $historicalSurvey = coverage_create_survey($db, 'Historical 2027-2030 ' . $suffix, 'inactive', [2027, 2028, 2029, 2030]);
    $fixture['surveys'][] = $historicalSurvey;
    $historicalResponseInsert = $db->prepare(
        'INSERT INTO survey_responses (survey_id, survey_version_id, graduate_id, responses, submitted_at)
         VALUES (:survey_id, :survey_version_id, :graduate_id, :responses, NOW())'
    );
    $historicalResponseInsert->execute([
        ':survey_id' => $historicalSurvey,
        ':survey_version_id' => $historicalSurvey,
        ':graduate_id' => $graduateByYear[2027],
        ':responses' => json_encode(['coverage' => 2027]),
    ]);
    $historicalResponseId = (int) $db->lastInsertId();
    $historicalToken = bin2hex(random_bytes(32));
    $historicalTokenInsert = $db->prepare(
        'INSERT INTO survey_tokens (survey_id, graduate_id, token, expires_at, submitted_at)
         VALUES (:survey_id, :graduate_id, :token, DATE_SUB(NOW(), INTERVAL 1 DAY), NOW())'
    );
    $historicalTokenInsert->execute([
        ':survey_id' => $historicalSurvey,
        ':graduate_id' => $graduateByYear[2027],
        ':token' => $historicalToken,
    ]);

    $questionIdA = (int) $db->query('SELECT id FROM survey_questions WHERE survey_id = ' . $surveyA)->fetchColumn();
    $surveyQuestionPayload = [
        'id' => $questionIdA,
        'section' => 'Educational Background',
        'question_text' => 'Q16: Year Graduated',
        'question_type' => 'multiple_choice',
        'is_required' => 1,
        'sort_order' => 16,
    ];
    $invalidSurveyUpdate = coverage_request('surveys/index.php', $adminSession, 'PUT', [
        'id' => $surveyA,
        'title' => 'Coverage A ' . $suffix,
        'description' => 'Coverage integration test',
        'status' => 'draft',
        'questions' => [$surveyQuestionPayload + ['options' => ['2021', ' 2021 ', 'not-a-year']]],
    ]);
    coverage_assert($invalidSurveyUpdate['status'] === 422 && ($invalidSurveyUpdate['json']['code'] ?? '') === 'INVALID_GRADUATION_YEAR_COVERAGE', 'Survey Management API rejects duplicate and malformed coverage options');

    $validSurveyUpdate = coverage_request('surveys/index.php', $adminSession, 'PUT', [
        'id' => $surveyA,
        'title' => 'Coverage A ' . $suffix,
        'description' => 'Coverage integration test',
        'status' => 'active',
        'questions' => [$surveyQuestionPayload + ['options' => [' 2025 ', '2024', '2023', '2022', '2021']]],
    ]);
    $storedOptionsStmt = $db->prepare('SELECT options FROM survey_questions WHERE id = :id');
    $storedOptionsStmt->execute([':id' => $questionIdA]);
    $storedOptions = json_decode((string) $storedOptionsStmt->fetchColumn(), true);
    coverage_assert($validSurveyUpdate['status'] === 200 && $storedOptions === ['2021', '2022', '2023', '2024', '2025'], 'Survey Management API trims and sorts only the explicitly supplied coverage years');

    $responseStmt = $db->prepare('INSERT INTO survey_responses (survey_id, survey_version_id, graduate_id, responses, submitted_at)
                                  VALUES (:survey_id, :survey_version_id, :graduate_id, :responses, NOW())');
    foreach ([2020, 2021] as $year) {
        $responseStmt->execute([
            ':survey_id' => $surveyA,
            ':survey_version_id' => $surveyA,
            ':graduate_id' => $graduateByYear[$year],
            ':responses' => json_encode(['coverage' => $year]),
        ]);
    }
    $uncoveredResponseStmt = $db->prepare(
        'SELECT id FROM survey_responses WHERE survey_id = :survey_id AND graduate_id = :graduate_id LIMIT 1'
    );
    $uncoveredResponseStmt->execute([
        ':survey_id' => $surveyA,
        ':graduate_id' => $graduateByYear[2020],
    ]);
    $uncoveredResponseId = (int) $uncoveredResponseStmt->fetchColumn();
    $uncoveredToken = bin2hex(random_bytes(32));
    $db->prepare(
        'INSERT INTO survey_tokens (survey_id, graduate_id, token, expires_at, submitted_at)
         VALUES (:survey_id, :graduate_id, :token, DATE_ADD(NOW(), INTERVAL 1 DAY), NOW())'
    )->execute([
        ':survey_id' => $surveyA,
        ':graduate_id' => $graduateByYear[2020],
        ':token' => $uncoveredToken,
    ]);

    $prepared = gradtrack_prepare_survey_questions([[
        'question_text' => '11. Year Graduated',
        'question_type' => 'multiple_choice',
        'options' => [' 2025 ', '2021', '2023'],
    ]], true);
    coverage_assert($prepared['errors'] === [] && $prepared['questions'][0]['options'] === ['2021', '2023', '2025'], 'Survey creation trims and sorts explicitly entered years without adding any year');
    coverage_assert(gradtrack_prepare_survey_questions([[
        'question_text' => 'Year Graduated',
        'question_type' => 'multiple_choice',
        'options' => ['2021', ' 2021 ', 'invalid'],
    ]], true)['errors'] !== [], 'Survey creation rejects duplicate and invalid Year Graduated options');

    $query = 'search=' . rawurlencode('Cohort' . $suffix) . '&limit=100';
    $adminStatus = coverage_request('graduates/survey-status.php?' . $query, $adminSession);
    $adminIds = coverage_ids($adminStatus);
    $expectedA = array_values(array_map(static fn (int $year): int => $graduateByYear[$year], range(2021, 2025)));
    sort($adminIds);
    sort($expectedA);
    coverage_assert($adminStatus['status'] === 200 && $adminIds === $expectedA, 'Tests 1-4: Research Coordinator monitoring includes only 2021 through 2025 and excludes 2020/2026');
    coverage_assert(($adminStatus['json']['year_options'] ?? []) === range(2021, 2025), 'Test 7: Research Coordinator year filter comes only from active-survey options');
    $adminSummary = $adminStatus['json']['summary'] ?? [];
    coverage_assert(($adminSummary['total'] ?? -1) === 5 && ($adminSummary['answered'] ?? -1) === 1 && ($adminSummary['not_answered'] ?? -1) === 4, 'Test 11 status population reconciles: eligible = answered + not answered');

    $deanStatus = coverage_request('dean/survey-status.php?' . $query, $deanSession);
    $deanIds = coverage_ids($deanStatus);
    sort($deanIds);
    coverage_assert($deanStatus['status'] === 200 && $deanIds === $expectedA, 'Dean monitoring applies the same active-survey year population inside its program scope');
    coverage_assert(($deanStatus['json']['year_options'] ?? []) === range(2021, 2025), 'Test 8: Dean year filter comes only from active-survey options');

    $badAdminYear = coverage_request('graduates/survey-status.php?' . $query . '&year_graduated=2020', $adminSession);
    $badDeanYear = coverage_request('dean/survey-status.php?' . $query . '&year_graduated=2020', $deanSession);
    coverage_assert($badAdminYear['status'] === 422 && $badDeanYear['status'] === 422, 'Test 11: Research Coordinator and Dean APIs reject a manually requested out-of-coverage year');

    $badReminderSelection = coverage_request('graduates/notify.php', $adminSession, 'POST', [
        'survey_id' => $surveyA,
        'mode' => 'selected',
        'graduate_ids' => [$graduateByYear[2020]],
        'only_not_answered' => true,
    ]);
    coverage_assert($badReminderSelection['status'] === 400, 'A manually selected out-of-coverage graduate cannot be notified');

    $eligibleReminders = coverage_request('research-coordinator/auto-reminders.php?action=eligible&survey_id=' . $surveyA, $researchCoordinatorSession);
    $eligibleReminderIds = array_map('intval', array_column($eligibleReminders['json']['data'] ?? [], 'id'));
    $coveredUnansweredIncluded = count(array_filter(
        range(2022, 2025),
        static fn (int $year): bool => in_array($graduateByYear[$year], $eligibleReminderIds, true)
    )) === 4;
    $ineligibleExcluded = !in_array($graduateByYear[2020], $eligibleReminderIds, true)
        && !in_array($graduateByYear[2021], $eligibleReminderIds, true)
        && !in_array($graduateByYear[2026], $eligibleReminderIds, true);
    coverage_assert($eligibleReminders['status'] === 200 && $coveredUnansweredIncluded && $ineligibleExcluded, 'Automatic-reminder eligibility uses the same covered and unanswered population');

    $verifyPayload = [
        'last_name' => 'Cohort' . $suffix,
        'program' => 'BSCS',
        'survey_id' => $surveyA,
    ];
    $studentReject = coverage_request('surveys/verify.php', null, 'POST', $verifyPayload + [
        'verification_method' => 'student_number',
        'student_number' => (string) $db->query('SELECT student_id FROM graduates WHERE id = ' . (int) $graduateByYear[2020])->fetchColumn(),
    ]);
    $emailReject = coverage_request('surveys/verify.php', null, 'POST', $verifyPayload + [
        'verification_method' => 'email',
        'email' => (string) $db->query('SELECT email FROM graduates WHERE id = ' . (int) $graduateByYear[2020])->fetchColumn(),
    ]);
    coverage_assert($studentReject['status'] === 403 && ($studentReject['json']['code'] ?? '') === 'GRADUATION_YEAR_NOT_ELIGIBLE' && ($studentReject['json']['title'] ?? '') === 'Survey Not Available', 'Test 5: correct student-number identity is denied when the Registrar year is 2020');
    coverage_assert($emailReject['status'] === 403 && ($emailReject['json']['code'] ?? '') === 'GRADUATION_YEAR_NOT_ELIGIBLE', 'Test 6: email verification applies the identical graduation-year rule');

    $futureYearReject = coverage_request('surveys/verify.php', null, 'POST', $verifyPayload + [
        'verification_method' => 'email',
        'email' => (string) $db->query('SELECT email FROM graduates WHERE id = ' . (int) $graduateByYear[2026])->fetchColumn(),
    ]);
    coverage_assert($futureYearReject['status'] === 403 && ($futureYearReject['json']['code'] ?? '') === 'GRADUATION_YEAR_NOT_ELIGIBLE', 'A correct identity above the configured range is also denied');

    $uncoveredRegistration = coverage_request('graduate-auth/register-from-survey.php', null, 'POST', [
        'survey_response_id' => $uncoveredResponseId,
        'graduate_id' => $graduateByYear[2020],
        'survey_token' => $uncoveredToken,
        'email' => 'coverage-uncovered-2020-' . $suffix . '@example.invalid',
        'password' => 'Valid#Pass2020',
        'confirm_password' => 'Valid#Pass2020',
    ]);
    coverage_assert(
        $uncoveredRegistration['status'] === 403
        && ($uncoveredRegistration['json']['error'] ?? '') === 'The completed survey does not apply to your graduation year',
        'Account creation rejects a response from a survey period that does not cover the Registrar graduation year'
    );

    $historicalCompletion = coverage_request('surveys/verify.php', null, 'POST', $verifyPayload + [
        'verification_method' => 'email',
        'email' => (string) $db->query('SELECT email FROM graduates WHERE id = ' . (int) $graduateByYear[2027])->fetchColumn(),
    ]);
    $historicalCompletionData = $historicalCompletion['json']['data'] ?? [];
    coverage_assert(
        $historicalCompletion['status'] === 409
        && !empty($historicalCompletionData['already_answered'])
        && !empty($historicalCompletionData['can_create_account'])
        && (int) ($historicalCompletionData['survey_id'] ?? 0) === $historicalSurvey
        && (int) ($historicalCompletionData['survey_response_id'] ?? 0) === $historicalResponseId
        && !empty($historicalCompletionData['survey_token'])
        && $historicalCompletionData['survey_token'] !== $historicalToken,
        'A 2027 graduate who completed the matching historical survey receives fresh registration authorization while 2021-2025 is active'
    );

    $historicalRegistration = coverage_request('graduate-auth/register-from-survey.php', null, 'POST', [
        'survey_response_id' => $historicalResponseId,
        'graduate_id' => $graduateByYear[2027],
        'survey_token' => (string) ($historicalCompletionData['survey_token'] ?? ''),
        'email' => 'coverage-registered-2027-' . $suffix . '@example.invalid',
        'password' => 'Valid#Pass2027',
        'confirm_password' => 'Valid#Pass2027',
    ]);
    $historicalAccountId = (int) ($historicalRegistration['json']['data']['account_id'] ?? 0);
    if ($historicalAccountId > 0) $fixture['accounts'][] = $historicalAccountId;
    $historicalAccountStmt = $db->prepare(
        'SELECT source_survey_response_id, status FROM graduate_accounts WHERE id = :id LIMIT 1'
    );
    $historicalAccountStmt->execute([':id' => $historicalAccountId]);
    $historicalAccount = $historicalAccountStmt->fetch(PDO::FETCH_ASSOC) ?: [];
    coverage_assert(
        $historicalRegistration['status'] === 201
        && $historicalAccountId > 0
        && (int) ($historicalAccount['source_survey_response_id'] ?? 0) === $historicalResponseId
        && ($historicalAccount['status'] ?? '') === 'pending_verification',
        'Historical survey completion authorization creates the correct pending Graduate Portal account'
    );

    $db->prepare("UPDATE graduate_accounts
                  SET status = 'active', alumni_verification_status = 'approved'
                  WHERE id = :id")->execute([':id' => $historicalAccountId]);
    $historicalGraduateSession = coverage_session([
        'graduate_account_id' => $historicalAccountId,
        'authenticated_at' => time(),
    ]);
    $outOfCoverageNotifications = coverage_request(
        'notifications/index.php?audience=graduate',
        $historicalGraduateSession
    );
    $outOfCoverageSurveyNotifications = array_values(array_filter(
        $outOfCoverageNotifications['json']['data']['notifications'] ?? [],
        static fn (array $notification): bool => ($notification['type'] ?? '') === 'survey'
    ));
    coverage_assert(
        $outOfCoverageNotifications['status'] === 200 && $outOfCoverageSurveyNotifications === [],
        'Graduate Portal does not show an active-survey notification outside the graduate year coverage'
    );

    $db->prepare('UPDATE survey_questions SET options = :options WHERE id = :id')->execute([
        ':options' => json_encode(['2021', '2022', '2023', '2024', '2025', '2027']),
        ':id' => $questionIdA,
    ]);
    $completedAccountNotifications = coverage_request(
        'notifications/index.php?audience=graduate',
        $historicalGraduateSession
    );
    $completedAccountSurveyNotifications = array_values(array_filter(
        $completedAccountNotifications['json']['data']['notifications'] ?? [],
        static fn (array $notification): bool => ($notification['type'] ?? '') === 'survey'
    ));
    coverage_assert(
        $completedAccountNotifications['status'] === 200 && $completedAccountSurveyNotifications === [],
        'Graduate Portal does not ask an account linked to a submitted survey to repeat onboarding'
    );
    $db->prepare('UPDATE survey_questions SET options = :options WHERE id = :id')->execute([
        ':options' => json_encode(['2021', '2022', '2023', '2024', '2025']),
        ':id' => $questionIdA,
    ]);

    $verify2025 = coverage_request('surveys/verify.php', null, 'POST', $verifyPayload + [
        'verification_method' => 'email',
        'email' => (string) $db->query('SELECT email FROM graduates WHERE id = ' . (int) $graduateByYear[2025])->fetchColumn(),
    ]);
    coverage_assert($verify2025['status'] === 200 && !empty($verify2025['json']['data']['token']), 'Boundary test: a 2025 graduate is eligible and receives survey access');

    $verify2024 = coverage_request('surveys/verify.php', null, 'POST', $verifyPayload + [
        'verification_method' => 'email',
        'email' => (string) $db->query('SELECT email FROM graduates WHERE id = ' . (int) $graduateByYear[2024])->fetchColumn(),
    ]);
    $token2024 = (string) ($verify2024['json']['data']['token'] ?? '');
    coverage_assert($verify2024['status'] === 200 && $token2024 !== '', 'A covered graduate can receive a verification token before coverage changes');

    $reportFilters = coverage_request('reports/index.php?type=overview_filter_options&survey_id=' . $surveyA, $adminSession);
    coverage_assert($reportFilters['status'] === 200 && ($reportFilters['json']['data']['years'] ?? []) === ['2021', '2022', '2023', '2024', '2025'], 'Report year options use the selected survey coverage');
    $badReportYear = coverage_request('reports/index.php?type=overview&survey_id=' . $surveyA . '&graduationYear=2020', $adminSession);
    coverage_assert($badReportYear['status'] === 422, 'Reports reject a graduation-year filter outside the selected survey coverage');
    $surveyAnalytics = coverage_request('surveys/analytics.php?survey_id=' . $surveyA, $adminSession);
    $eligibleCoverageCount = (int) $db->query(
        "SELECT COUNT(*) FROM graduates
         WHERE status = 'active' AND archived_at IS NULL
           AND year_graduated IN (2021, 2022, 2023, 2024, 2025)"
    )->fetchColumn();
    $expectedResponseRate = $eligibleCoverageCount > 0 ? round(100 / $eligibleCoverageCount, 2) : -1;
    coverage_assert(
        $surveyAnalytics['status'] === 200
        && ($surveyAnalytics['json']['data']['total_responses'] ?? -1) === 1
        && abs((float) ($surveyAnalytics['json']['data']['response_rate'] ?? -1) - $expectedResponseRate) < 0.001,
        'Survey analytics excludes out-of-coverage responses and uses covered graduates as the rate denominator'
    );

    $db->prepare('UPDATE survey_questions SET options = :options WHERE id = :id')->execute([
        ':options' => json_encode(['2021', '2023', '2025']),
        ':id' => $questionIdA,
    ]);
    $nonContinuous = coverage_request('graduates/survey-status.php?' . $query, $adminSession);
    $nonContinuousIds = coverage_ids($nonContinuous);
    sort($nonContinuousIds);
    $expectedNonContinuous = [$graduateByYear[2021], $graduateByYear[2023], $graduateByYear[2025]];
    sort($expectedNonContinuous);
    coverage_assert(($nonContinuous['json']['year_options'] ?? []) === [2021, 2023, 2025] && $nonContinuousIds === $expectedNonContinuous, 'Test 12: non-continuous coverage includes exact members only, not intervening years');

    $staleToken = coverage_request('surveys/validate-token.php', null, 'POST', ['token' => $token2024]);
    coverage_assert($staleToken['status'] === 403 && ($staleToken['json']['code'] ?? '') === 'GRADUATION_YEAR_NOT_ELIGIBLE', 'A token cannot bypass a later active-survey coverage change');
    $staleSubmission = coverage_request('surveys/responses.php', null, 'POST', [
        'token' => $token2024,
        'survey_id' => $surveyA,
        'graduate_id' => $graduateByYear[2021],
        'responses' => [(string) $questionIdA => '2021'],
    ]);
    coverage_assert($staleSubmission['status'] === 403 && ($staleSubmission['json']['code'] ?? '') === 'GRADUATION_YEAR_NOT_ELIGIBLE', 'Survey submission rechecks the token graduate actual year and ignores a spoofed graduate ID');

    $db->prepare('UPDATE survey_questions SET options = JSON_ARRAY() WHERE id = :id')->execute([':id' => $questionIdA]);
    $missingCoverage = coverage_request('graduates/survey-status.php?' . $query, $adminSession);
    coverage_assert($missingCoverage['status'] === 422 && ($missingCoverage['json']['code'] ?? '') === 'GRADUATION_YEAR_COVERAGE_NOT_CONFIGURED', 'Empty active-survey coverage fails closed instead of exposing every Registrar graduate');

    $surveyB = coverage_create_survey($db, 'Coverage B ' . $suffix, 'inactive', [2022, 2023, 2024, 2025, 2026]);
    $fixture['surveys'][] = $surveyB;
    $db->prepare("UPDATE surveys SET status = 'inactive' WHERE id = :id")->execute([':id' => $surveyA]);
    $db->prepare("UPDATE surveys SET status = 'active' WHERE id = :id")->execute([':id' => $surveyB]);

    $switched = coverage_request('graduates/survey-status.php?' . $query, $adminSession);
    coverage_assert(($switched['json']['year_options'] ?? []) === range(2022, 2026), 'Test 10: switching the active survey automatically changes coverage to 2022 through 2026');
    $switchedIds = coverage_ids($switched);
    coverage_assert(in_array($graduateByYear[2026], $switchedIds, true) && !in_array($graduateByYear[2021], $switchedIds, true), 'Test 10: switched monitoring population follows the new survey without a code change');

    $historicalResponseStmt = $db->prepare('SELECT COUNT(*) FROM survey_responses WHERE survey_id = :survey_id AND graduate_id = :graduate_id');
    $historicalResponseStmt->execute([':survey_id' => $surveyA, ':graduate_id' => $graduateByYear[2020]]);
    coverage_assert((int) $historicalResponseStmt->fetchColumn() === 1, 'Test 9: changing active coverage does not delete an existing historical response');
} catch (Throwable $error) {
    coverage_assert(false, 'Integration run completed without an exception: ' . $error->getMessage());
} finally {
    coverage_cleanup($db);
    $cleanupFinished = true;
}

if ($failures > 0) {
    echo PHP_EOL . $failures . ' active-survey graduation-year coverage test(s) failed.' . PHP_EOL;
    ob_end_flush();
    exit(1);
}

echo PHP_EOL . 'All active-survey graduation-year coverage integration tests passed.' . PHP_EOL;
ob_end_flush();
