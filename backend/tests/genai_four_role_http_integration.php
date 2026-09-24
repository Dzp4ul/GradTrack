<?php

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';

$failures = 0;
$endpoint = getenv('GRADTRACK_GENAI_TEST_URL') ?: 'http://localhost/GradTrack/backend/api/genai/assistant.php';
$sessions = [];
$conversationOwners = [];
$csrfTokens = [];
$db = (new Database())->getConnection();
$activeSurveyTitle = (string)($db->query("SELECT title FROM surveys WHERE status = 'active' AND archived_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1")->fetchColumn() ?: '');

function genai_four_role_assert(bool $condition, string $message): void
{
    global $failures;
    if (!$condition) {
        $failures++;
        echo "FAIL: {$message}" . PHP_EOL;
        return;
    }
    echo "PASS: {$message}" . PHP_EOL;
}

function genai_four_role_session(int $adminId): string
{
    global $sessions;
    $sessionId = 'gtfourrole' . bin2hex(random_bytes(8));
    session_id($sessionId);
    session_start();
    $_SESSION = ['admin_user_id' => $adminId, 'authenticated_at' => time()];
    session_write_close();
    $sessions[] = $sessionId;
    return $sessionId;
}

function genai_four_role_request(string $endpoint, string $sessionId, array $payload): array
{
    global $csrfTokens;
    $headers = [
        'Accept: application/json',
        'Content-Type: application/json',
        'Cookie: ' . gradtrack_session_cookie_name() . '=' . $sessionId,
        'Origin: http://localhost:5173',
    ];
    if (!isset($csrfTokens[$sessionId])) {
        $csrfEndpoint = preg_replace('~/api/genai/assistant\.php$~', '/api/csrf.php', $endpoint);
        $csrfContext = stream_context_create(['http' => [
            'method' => 'GET',
            'header' => implode("\r\n", $headers),
            'ignore_errors' => true,
            'timeout' => 30,
        ]]);
        $csrfBody = @file_get_contents((string)$csrfEndpoint, false, $csrfContext);
        $csrfJson = is_string($csrfBody) ? json_decode($csrfBody, true) : null;
        $csrfTokens[$sessionId] = (string)($csrfJson['csrf_token'] ?? '');
    }
    $headers[] = 'X-CSRF-Token: ' . $csrfTokens[$sessionId];
    $context = stream_context_create(['http' => [
        'method' => 'POST',
        'header' => implode("\r\n", $headers),
        'content' => json_encode($payload, JSON_UNESCAPED_UNICODE),
        'ignore_errors' => true,
        'timeout' => 90,
    ]]);
    $body = @file_get_contents($endpoint, false, $context);
    $status = 0;
    foreach (($http_response_header ?? []) as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $matches) === 1) {
            $status = (int)$matches[1];
            break;
        }
    }
    return ['status' => $status, 'json' => is_string($body) ? json_decode($body, true) : null];
}

function genai_four_role_chat(string $role, string $sessionId, string $message, string $route): array
{
    global $endpoint, $conversationOwners;
    $response = genai_four_role_request($endpoint, $sessionId, [
        'action' => 'chat',
        'message' => $message,
        'page_context' => ['route' => $route, 'current_module' => 'integration test'],
    ]);
    $conversationId = (int)($response['json']['data']['conversation']['id'] ?? 0);
    $adminId = (int)($response['json']['data']['persistedMessages']['user']['admin_user_id'] ?? 0);
    if ($conversationId > 0) $conversationOwners[] = [$conversationId, $adminId];
    $answer = (string)($response['json']['data']['assistant']['answer'] ?? '');
    genai_four_role_assert(
        $response['status'] === 200 && $answer !== '' && stripos($answer, 'I can only help with GradTrack-related') === false,
        "{$role} receives a successful non-generic answer: {$message}"
    );
    return $response;
}

function genai_four_role_metric(array $response, string $label): ?string
{
    foreach (($response['json']['data']['sourceMetrics'] ?? []) as $metric) {
        if (($metric['label'] ?? '') === $label) return (string)($metric['value'] ?? '');
    }
    return null;
}

ini_set('session.use_cookies', '0');
ini_set('session.use_only_cookies', '0');
ini_set('session.use_strict_mode', '0');
session_cache_limiter('');

$roleIds = [];
$stmt = $db->prepare('SELECT id FROM admin_users WHERE role = :role AND is_active = 1 ORDER BY id ASC LIMIT 1');
foreach (['research_coordinator', 'registrar', 'alumni_president', 'dean_cs'] as $role) {
    $stmt->execute([':role' => $role]);
    $roleIds[$role] = (int)($stmt->fetchColumn() ?: 0);
    genai_four_role_assert($roleIds[$role] > 0, "an active {$role} test account exists");
}

try {
    if ($roleIds['research_coordinator'] > 0) {
        $session = genai_four_role_session($roleIds['research_coordinator']);
        $howTo = genai_four_role_chat('Research Coordinator', $session, 'How do I answer the survey?', '/admin/graduates');
        $answer = (string)($howTo['json']['data']['assistant']['answer'] ?? '');
        genai_four_role_assert(str_contains($answer, 'Verify & Continue') && str_contains($answer, 'Submit Survey'), 'Research Coordinator how-to uses the implemented graduate survey controls');

        $count = genai_four_role_chat('Research Coordinator', $session, 'Ilan ang sumagot sa survey?', '/admin/graduates');
        $answered = genai_four_role_metric($count, 'Submitted survey responses');
        genai_four_role_assert(
            ($count['json']['data']['context']['dataTool'] ?? '') === 'survey_participation'
            && $answered !== null
            && str_contains((string)$count['json']['data']['assistant']['answer'], $answered),
            'Research Coordinator Taglish count answer contains the current authorized survey-response total'
        );

        $list = genai_four_role_chat('Research Coordinator', $session, 'Show graduates who have not answered the survey.', '/admin/graduates');
        genai_four_role_assert(
            ($list['json']['data']['context']['dataTool'] ?? '') === 'survey_participation_list'
            && genai_four_role_metric($list, 'Records shown') !== null
            && str_contains((string)($list['json']['data']['dataUsed']['privacy'] ?? ''), 'not sent to Groq'),
            'Research Coordinator list uses authorized active-survey rows without sending names to Groq'
        );

        $currentSurvey = genai_four_role_chat('Research Coordinator', $session, 'What is the current survey?', '/admin/graduates');
        genai_four_role_assert(
            $activeSurveyTitle !== ''
            && ($currentSurvey['json']['data']['context']['dataTool'] ?? '') === 'survey_participation'
            && str_contains((string)$currentSurvey['json']['data']['assistant']['answer'], $activeSurveyTitle),
            'Research Coordinator current-survey answer uses the active survey title from the database'
        );

        $restricted = genai_four_role_chat('Research Coordinator', $session, 'How many alumni verification requests are pending?', '/admin');
        genai_four_role_assert(stripos((string)$restricted['json']['data']['assistant']['answer'], 'does not have access') !== false, 'Research Coordinator is denied Alumni President verification data');
    }

    if ($roleIds['registrar'] > 0) {
        $session = genai_four_role_session($roleIds['registrar']);
        $howTo = genai_four_role_chat('Registrar', $session, 'Paano ako mag-e-edit ng graduate record?', '/admin/graduates');
        genai_four_role_assert(
            preg_match('/\b(Edit|edit|i-edit|Manage Graduates|graduate record)\b/u', (string)$howTo['json']['data']['assistant']['answer']) === 1,
            'Registrar Taglish how-to is based on Manage Graduates'
        );

        $count = genai_four_role_chat('Registrar', $session, 'How many graduate records are there?', '/admin/graduates');
        $total = (string)(genai_four_role_metric($count, 'BSCS') ?? '');
        genai_four_role_assert(
            ($count['json']['data']['context']['dataTool'] ?? '') === 'graduate_program_counts'
            && !empty($count['json']['data']['sourceMetrics']),
            'Registrar count uses live non-archived graduate-record aggregates'
        );

        $list = genai_four_role_chat('Registrar', $session, 'List BSCS graduates.', '/admin/graduates');
        genai_four_role_assert(
            ($list['json']['data']['context']['dataTool'] ?? '') === 'graduate_record_list'
            && genai_four_role_metric($list, 'Records shown') !== null,
            'Registrar list uses live non-archived BSCS graduate records'
        );

        $restricted = genai_four_role_chat('Registrar', $session, 'How many BSCS graduates are employed?', '/admin/graduates');
        genai_four_role_assert(stripos((string)$restricted['json']['data']['assistant']['answer'], 'does not have access') !== false, 'Registrar is denied Research Coordinator employment analytics');
    }

    if ($roleIds['alumni_president'] > 0) {
        $session = genai_four_role_session($roleIds['alumni_president']);
        $howTo = genai_four_role_chat('Alumni President', $session, 'How do I verify an alumni account?', '/admin/alumni-registered-list');
        genai_four_role_assert(
            stripos((string)$howTo['json']['data']['assistant']['answer'], 'Pending Verification') !== false
            && stripos((string)$howTo['json']['data']['assistant']['answer'], 'Approve') !== false,
            'Alumni President how-to uses the implemented verification tab and button'
        );

        $count = genai_four_role_chat('Alumni President', $session, 'Ilan ang pending alumni verification?', '/admin/alumni-registered-list');
        $pending = genai_four_role_metric($count, 'Pending');
        genai_four_role_assert(
            ($count['json']['data']['context']['dataTool'] ?? '') === 'alumni_verification_summary'
            && $pending !== null
            && str_contains((string)$count['json']['data']['assistant']['answer'], $pending),
            'Alumni President Filipino count answer contains the live pending-verification total'
        );

        $list = genai_four_role_chat('Alumni President', $session, 'Ipakita ang pending alumni verification requests.', '/admin/alumni-registered-list');
        genai_four_role_assert(
            ($list['json']['data']['context']['dataTool'] ?? '') === 'alumni_verification_list'
            && genai_four_role_metric($list, 'Records shown') !== null,
            'Alumni President list uses live pending-verification records'
        );

        $restricted = genai_four_role_chat('Alumni President', $session, 'Show employment statistics by program.', '/admin/alumni-registered-list');
        genai_four_role_assert(stripos((string)$restricted['json']['data']['assistant']['answer'], 'does not have access') !== false, 'Alumni President is denied Research Coordinator employment analytics');
    }

    if ($roleIds['dean_cs'] > 0) {
        $session = genai_four_role_session($roleIds['dean_cs']);
        $howTo = genai_four_role_chat('Dean', $session, 'Paano ko sasagutan yung survey?', '/admin/survey-status');
        $howToAnswer = (string)$howTo['json']['data']['assistant']['answer'];
        genai_four_role_assert(str_contains($howToAnswer, 'Hindi') && str_contains($howToAnswer, 'Submit Survey'), 'Dean Taglish how-to explains the implemented survey flow without claiming the Dean can submit');

        $scope = genai_four_role_chat('Dean', $session, 'What departments are covered by my role?', '/admin/survey-status');
        $scopeAnswer = (string)$scope['json']['data']['assistant']['answer'];
        genai_four_role_assert(str_contains($scopeAnswer, 'BSCS') && str_contains($scopeAnswer, 'ACT') && !str_contains($scopeAnswer, 'BSHM'), 'Dean scope answer uses only the programs assigned by RBAC');

        $count = genai_four_role_chat('Dean', $session, 'Ilan ang graduates na sakop ng department namin?', '/admin/survey-status');
        $total = genai_four_role_metric($count, 'Registered graduates');
        genai_four_role_assert(
            ($count['json']['data']['context']['dataTool'] ?? '') === 'survey_participation'
            && $total !== null
            && str_contains((string)$count['json']['data']['assistant']['answer'], $total),
            'Dean Filipino count answer uses the live active-survey total for assigned programs'
        );

        $list = genai_four_role_chat('Dean', $session, 'Sino ang hindi pa sumagot sa survey?', '/admin/survey-status');
        genai_four_role_assert(
            ($list['json']['data']['context']['dataTool'] ?? '') === 'survey_participation_list'
            && genai_four_role_metric($list, 'Records shown') !== null
            && !str_contains((string)$list['json']['data']['assistant']['answer'], 'BSHM'),
            'Dean list is limited to unanswered graduates in assigned programs'
        );

        $restricted = genai_four_role_chat('Dean', $session, 'How many BSHM graduates are covered?', '/admin/survey-status');
        genai_four_role_assert(stripos((string)$restricted['json']['data']['assistant']['answer'], 'does not have access') !== false, 'CCS Dean is denied an unassigned BSHM aggregate');
    }
} finally {
    foreach ($conversationOwners as [$conversationId, $adminId]) {
        if ($conversationId <= 0) continue;
        if ($adminId > 0) {
            $db->prepare('DELETE FROM ai_conversations WHERE id = :id AND admin_user_id = :admin_user_id')
                ->execute([':id' => $conversationId, ':admin_user_id' => $adminId]);
        } else {
            $db->prepare('DELETE FROM ai_conversations WHERE id = :id')->execute([':id' => $conversationId]);
        }
    }
    foreach ($sessions as $sessionId) {
        session_id($sessionId);
        session_start();
        $_SESSION = [];
        session_destroy();
    }
}

if ($failures > 0) {
    echo PHP_EOL . "{$failures} four-role GenAI HTTP integration test(s) failed." . PHP_EOL;
    ob_end_flush();
    exit(1);
}

echo PHP_EOL . 'All four-role GenAI HTTP integration tests passed.' . PHP_EOL;
ob_end_flush();
