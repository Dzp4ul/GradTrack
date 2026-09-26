<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/survey_versioning.php';

function survey_idempotency_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
    echo 'PASS: ' . $message . PHP_EOL;
}

function survey_idempotency_request(string $url, array $payload): array
{
    $handle = curl_init($url);
    if ($handle === false) {
        throw new RuntimeException('Unable to initialize the survey request');
    }
    curl_setopt_array($handle, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_THROW_ON_ERROR),
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 30,
    ]);
    return ['handle' => $handle];
}

function survey_idempotency_execute(string $url, array $payload): array
{
    $request = survey_idempotency_request($url, $payload);
    /** @var CurlHandle $handle */
    $handle = $request['handle'];
    $raw = curl_exec($handle);
    if ($raw === false) {
        $error = curl_error($handle);
        curl_close($handle);
        throw new RuntimeException('HTTP request failed: ' . $error);
    }
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);
    $decoded = json_decode((string) $raw, true);
    return ['status' => $status, 'body' => is_array($decoded) ? $decoded : []];
}

if (!function_exists('curl_multi_init')) {
    fwrite(STDERR, "FAIL: PHP cURL support is required for the concurrent survey test.\n");
    exit(1);
}

$db = (new Database())->getConnection();
$baseUrl = rtrim((string) (getenv('GRADTRACK_API_BASE_URL') ?: 'http://localhost/GradTrack/backend'), '/');
$endpoint = $baseUrl . '/api/surveys/responses.php';
$surveyId = 0;
$templateId = 0;
$graduateId = 0;
$graduationYearQuestionId = 0;
$previousActiveSurveyIds = [];

try {
    $suffix = bin2hex(random_bytes(6));
    $previousActiveSurveyIds = array_map(
        'intval',
        $db->query("SELECT id FROM surveys WHERE status = 'active' AND archived_at IS NULL")
            ->fetchAll(PDO::FETCH_COLUMN)
    );
    $db->exec("UPDATE surveys SET status = 'inactive' WHERE status = 'active' AND archived_at IS NULL");

    $templateStmt = $db->prepare("INSERT INTO survey_templates (template_key, title, description)
                                  VALUES (:template_key, :title, 'Automated concurrency regression fixture')");
    $templateStmt->execute([
        ':template_key' => gradtrack_survey_uuid(),
        ':title' => 'Idempotency Test ' . $suffix,
    ]);
    $templateId = (int)$db->lastInsertId();
    $surveyStmt = $db->prepare("INSERT INTO surveys
        (template_id, version_number, title, description, status, published_at, locked_at, created_by)
        VALUES (:template_id, 1, :title, 'Automated concurrency regression fixture',
                'active', NOW(), NOW(), 'integration-test')");
    $surveyStmt->execute([
        ':template_id' => $templateId,
        ':title' => 'Idempotency Test ' . $suffix,
    ]);
    $surveyId = (int) $db->lastInsertId();
    $db->prepare('UPDATE survey_templates SET current_version_id = :survey_id WHERE id = :template_id')
        ->execute([':survey_id' => $surveyId, ':template_id' => $templateId]);

    $questionStmt = $db->prepare("INSERT INTO survey_questions
        (survey_id, question_key, analytics_key, section, question_text, question_type, options, is_required, sort_order)
        VALUES (:survey_id, :question_key, 'graduation_year', 'Educational Background',
                'Year Graduated', 'multiple_choice', :options, 1, 1)");
    $questionStmt->execute([
        ':survey_id' => $surveyId,
        ':question_key' => gradtrack_survey_uuid(),
        ':options' => json_encode(['2025'], JSON_THROW_ON_ERROR),
    ]);
    $graduationYearQuestionId = (int) $db->lastInsertId();

    $graduateStmt = $db->prepare("INSERT INTO graduates
        (student_id, first_name, last_name, email, year_graduated, status)
        VALUES (:student_id, 'Concurrency', 'Fixture', :email, 2025, 'active')");
    $graduateStmt->execute([
        ':student_id' => 'IDEM-' . $suffix,
        ':email' => 'invalid-' . $suffix,
    ]);
    $graduateId = (int) $db->lastInsertId();

    $token = bin2hex(random_bytes(32));
    $tokenStmt = $db->prepare("INSERT INTO survey_tokens (survey_id, graduate_id, token, expires_at)
                              VALUES (:survey_id, :graduate_id, :token, DATE_ADD(NOW(), INTERVAL 15 MINUTE))");
    $tokenStmt->execute([
        ':survey_id' => $surveyId,
        ':graduate_id' => $graduateId,
        ':token' => $token,
    ]);

    $payload = [
        'survey_id' => $surveyId,
        'graduate_id' => $graduateId,
        'token' => $token,
        'responses' => [(string) $graduationYearQuestionId => '2025'],
    ];
    $failedSubmission = survey_idempotency_execute($endpoint, [
        ...$payload,
        'responses' => [],
    ]);
    survey_idempotency_assert(
        $failedSubmission['status'] === 422 && ($failedSubmission['body']['success'] ?? true) === false,
        'a failed survey validation does not report a successful submission'
    );
    $failedDeliveryStmt = $db->prepare("SELECT COUNT(*)
        FROM email_notification_deliveries endelivery
        JOIN survey_responses sr ON sr.id = endelivery.entity_id
        WHERE endelivery.notification_type = 'graduate_survey_submitted'
          AND sr.survey_id = :survey_id
          AND sr.graduate_id = :graduate_id");
    $failedDeliveryStmt->execute([':survey_id' => $surveyId, ':graduate_id' => $graduateId]);
    survey_idempotency_assert((int) $failedDeliveryStmt->fetchColumn() === 0, 'a failed survey submission does not create an email delivery');

    $requests = [
        survey_idempotency_request($endpoint, $payload),
        survey_idempotency_request($endpoint, $payload),
    ];
    $multi = curl_multi_init();
    foreach ($requests as $request) {
        curl_multi_add_handle($multi, $request['handle']);
    }
    do {
        $status = curl_multi_exec($multi, $running);
        if ($running > 0) {
            curl_multi_select($multi, 1.0);
        }
    } while ($running > 0 && $status === CURLM_OK);

    $results = [];
    foreach ($requests as $request) {
        $handle = $request['handle'];
        $raw = (string) curl_multi_getcontent($handle);
        $httpStatus = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $error = curl_error($handle);
        curl_multi_remove_handle($multi, $handle);
        curl_close($handle);
        $decoded = json_decode($raw, true);
        $results[] = [
            'status' => $httpStatus,
            'body' => is_array($decoded) ? $decoded : [],
            'transport_error' => $error,
        ];
    }
    curl_multi_close($multi);

    foreach ($results as $index => $result) {
        survey_idempotency_assert($result['transport_error'] === '', 'rapid request ' . ($index + 1) . ' completed without a transport error');
        survey_idempotency_assert(in_array($result['status'], [200, 201], true), 'rapid request ' . ($index + 1) . ' returned a success status');
        survey_idempotency_assert(($result['body']['success'] ?? false) === true, 'rapid request ' . ($index + 1) . ' returned a successful response body');
    }

    $responseIds = array_map(
        static fn (array $result): int => (int) ($result['body']['survey_response_id'] ?? $result['body']['data']['survey_response_id'] ?? 0),
        $results
    );
    survey_idempotency_assert($responseIds[0] > 0 && $responseIds[0] === $responseIds[1], 'both rapid requests resolve to the same canonical response ID');

    $countStmt = $db->prepare('SELECT COUNT(*) FROM survey_responses WHERE survey_id = :survey_id AND graduate_id = :graduate_id');
    $countStmt->execute([':survey_id' => $surveyId, ':graduate_id' => $graduateId]);
    survey_idempotency_assert((int) $countStmt->fetchColumn() === 1, 'rapid submission creates exactly one survey response row');

    $deliveryCountStmt = $db->prepare("SELECT COUNT(*) FROM email_notification_deliveries
        WHERE notification_type = 'graduate_survey_submitted' AND entity_id = :response_id");
    $deliveryCountStmt->execute([':response_id' => $responseIds[0]]);
    survey_idempotency_assert((int) $deliveryCountStmt->fetchColumn() === 1, 'rapid submission creates exactly one confirmation email delivery record');

    $submittedStmt = $db->prepare('SELECT submitted_at FROM survey_tokens WHERE token = :token LIMIT 1');
    $submittedStmt->execute([':token' => $token]);
    survey_idempotency_assert((string) $submittedStmt->fetchColumn() !== '', 'the survey token is consumed after the canonical response is committed');

    $registrationEndpoint = $baseUrl . '/api/graduate-auth/register-from-survey.php';
    $registrationPayload = [
        'survey_response_id' => $responseIds[0],
        'graduate_id' => $graduateId,
        'email' => 'idempotency-' . $suffix . '@example.com',
        'password' => 'Valid#Password123',
        'confirm_password' => 'Valid#Password123',
    ];
    $forgedRegistration = survey_idempotency_execute($registrationEndpoint, [
        ...$registrationPayload,
        'survey_token' => bin2hex(random_bytes(32)),
    ]);
    survey_idempotency_assert($forgedRegistration['status'] === 403, 'account creation rejects a forged survey completion token');

    $registration = survey_idempotency_execute($registrationEndpoint, [
        ...$registrationPayload,
        'survey_token' => $token,
    ]);
    survey_idempotency_assert(
        $registration['status'] === 201
        && ($registration['body']['success'] ?? false) === true
        && (int) ($registration['body']['data']['graduate_id'] ?? 0) === $graduateId,
        'the valid post-survey account creation flow continues with the original server-issued token'
    );

    $accountStmt = $db->prepare('SELECT source_survey_response_id FROM graduate_accounts WHERE graduate_id = :graduate_id LIMIT 1');
    $accountStmt->execute([':graduate_id' => $graduateId]);
    survey_idempotency_assert((int) $accountStmt->fetchColumn() === $responseIds[0], 'the created account remains linked to the canonical survey response');

    echo PHP_EOL . 'Survey submission idempotency integration test passed.' . PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, 'FAIL: ' . $error->getMessage() . PHP_EOL);
    $exitCode = 1;
} finally {
    if ($surveyId > 0) {
        if ($db->query("SHOW TABLES LIKE 'email_notification_deliveries'")->fetchColumn() !== false) {
            $responseIdsForCleanup = array_values(array_filter($responseIds ?? [], static fn ($id): bool => (int) $id > 0));
            if ($responseIdsForCleanup !== []) {
                $placeholders = implode(',', array_fill(0, count($responseIdsForCleanup), '?'));
                $db->prepare("DELETE FROM email_notification_deliveries
                              WHERE notification_type = 'graduate_survey_submitted'
                                AND entity_id IN ($placeholders)")
                    ->execute($responseIdsForCleanup);
            }
        }
        $db->prepare('DELETE FROM graduate_accounts WHERE graduate_id = :graduate_id')
            ->execute([':graduate_id' => $graduateId]);
        $db->prepare(
            'DELETE sra FROM survey_response_answers sra
             INNER JOIN survey_responses sr ON sr.id = sra.survey_response_id
             WHERE sr.survey_id = :id'
        )->execute([':id' => $surveyId]);
        $db->prepare('DELETE FROM survey_tokens WHERE survey_id = :id')->execute([':id' => $surveyId]);
        $db->prepare('DELETE FROM survey_responses WHERE survey_id = :id')->execute([':id' => $surveyId]);
        $db->prepare('DELETE FROM survey_questions WHERE survey_id = :id')->execute([':id' => $surveyId]);
        $db->prepare('DELETE FROM survey_sections WHERE survey_id = :id')->execute([':id' => $surveyId]);
        $db->prepare('UPDATE survey_templates SET current_version_id = NULL WHERE current_version_id = :id')
            ->execute([':id' => $surveyId]);
        $cleanupSurvey = $db->prepare('DELETE FROM surveys WHERE id = :id');
        $cleanupSurvey->execute([':id' => $surveyId]);
    }
    if ($templateId > 0) {
        $db->prepare('DELETE FROM survey_templates WHERE id = :id')->execute([':id' => $templateId]);
    }
    if ($graduateId > 0) {
        $cleanupGraduate = $db->prepare('DELETE FROM graduates WHERE id = :id');
        $cleanupGraduate->execute([':id' => $graduateId]);
    }
    if ($previousActiveSurveyIds !== []) {
        $placeholders = implode(',', array_fill(0, count($previousActiveSurveyIds), '?'));
        $restoreActiveSurveys = $db->prepare("UPDATE surveys SET status = 'active' WHERE id IN ($placeholders)");
        $restoreActiveSurveys->execute($previousActiveSurveyIds);
    }
}

exit($exitCode ?? 0);
