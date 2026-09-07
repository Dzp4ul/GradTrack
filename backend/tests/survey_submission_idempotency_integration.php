<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config/database.php';

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
$graduateId = 0;

try {
    $suffix = bin2hex(random_bytes(6));
    $surveyStmt = $db->prepare("INSERT INTO surveys (title, description, status, created_by)
                                VALUES (:title, 'Automated concurrency regression fixture', 'active', 'integration-test')");
    $surveyStmt->execute([':title' => 'Idempotency Test ' . $suffix]);
    $surveyId = (int) $db->lastInsertId();

    $graduateStmt = $db->prepare("INSERT INTO graduates
        (student_id, first_name, last_name, email, status)
        VALUES (:student_id, 'Concurrency', 'Fixture', :email, 'active')");
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
        'responses' => [],
    ];
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
        $cleanupSurvey = $db->prepare('DELETE FROM surveys WHERE id = :id');
        $cleanupSurvey->execute([':id' => $surveyId]);
    }
    if ($graduateId > 0) {
        $cleanupGraduate = $db->prepare('DELETE FROM graduates WHERE id = :id');
        $cleanupGraduate->execute([':id' => $graduateId]);
    }
}

exit($exitCode ?? 0);
