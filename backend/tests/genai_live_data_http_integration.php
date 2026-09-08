<?php
ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';
require_once __DIR__ . '/../api/config/graduate_auth.php';
require_once __DIR__ . '/../api/config/genai_data_tools.php';

$failures = 0;
$sessionId = 'gtgenailive' . bin2hex(random_bytes(8));
$otherSessionId = 'gtgenaiother' . bin2hex(random_bytes(8));
$conversationId = 0;
$otherAdminId = 0;
$endpoint = getenv('GRADTRACK_GENAI_TEST_URL') ?: 'http://localhost/GradTrack/backend/api/genai/assistant.php';
$db = (new Database())->getConnection();
$genaiLiveCsrfTokens = [];

function genai_live_assert(bool $condition, string $message): void
{
    global $failures;
    if (!$condition) {
        $failures++;
        echo "FAIL: {$message}" . PHP_EOL;
        return;
    }
    echo "PASS: {$message}" . PHP_EOL;
}

function genai_live_request(string $endpoint, string $sessionId, string $method, array $payload = [], string $query = ''): array
{
    global $genaiLiveCsrfTokens;
    $headers = [
        'Accept: application/json',
        'Cookie: ' . gradtrack_session_cookie_name() . '=' . $sessionId,
        'Origin: http://localhost:5173',
    ];
    $options = [
        'method' => $method,
        'header' => implode("\r\n", $headers),
        'ignore_errors' => true,
        'timeout' => 60,
    ];
    if ($method === 'POST') {
        if (!isset($genaiLiveCsrfTokens[$sessionId])) {
            $csrfEndpoint = preg_replace('~/api/genai/assistant\.php$~', '/api/csrf.php', $endpoint);
            $csrfContext = stream_context_create(['http' => [
                'method' => 'GET',
                'header' => implode("\r\n", $headers),
                'ignore_errors' => true,
                'timeout' => 30,
            ]]);
            $csrfBody = @file_get_contents((string) $csrfEndpoint, false, $csrfContext);
            $csrfJson = is_string($csrfBody) ? json_decode($csrfBody, true) : null;
            $genaiLiveCsrfTokens[$sessionId] = (string) ($csrfJson['csrf_token'] ?? '');
        }
        $options['header'] .= "\r\nContent-Type: application/json";
        $options['header'] .= "\r\nX-CSRF-Token: " . $genaiLiveCsrfTokens[$sessionId];
        $options['content'] = json_encode($payload, JSON_UNESCAPED_UNICODE);
    }
    $context = stream_context_create(['http' => $options]);
    $body = @file_get_contents($endpoint . $query, false, $context);
    $status = 0;
    foreach (($http_response_header ?? []) as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $matches) === 1) {
            $status = (int) $matches[1];
            break;
        }
    }
    return ['status' => $status, 'json' => is_string($body) ? json_decode($body, true) : null];
}

ini_set('session.use_cookies', '0');
ini_set('session.use_only_cookies', '0');
ini_set('session.use_strict_mode', '0');
session_cache_limiter('');

$adminId = (int) ($db->query("SELECT id FROM admin_users WHERE role = 'alumni_admin' AND is_active = 1 ORDER BY id ASC LIMIT 1")
    ->fetchColumn() ?: 0);
if ($adminId <= 0) {
    echo 'SKIP: An active Alumni Admin account is required.' . PHP_EOL;
    ob_end_flush();
    exit(0);
}

session_id($sessionId);
session_start();
$_SESSION = ['admin_user_id' => $adminId, 'authenticated_at' => time()];
session_write_close();

try {
    $summary = gradtrack_alumni_registry_summary_data($db);
    $first = genai_live_request($endpoint, $sessionId, 'POST', [
        'action' => 'chat',
        'message' => 'in alumni verification how many are approved and pending?',
        'page_context' => [
            'route' => '/admin/alumni-registered-list',
            'current_module' => 'Alumni Verification',
        ],
    ]);
    $answer = (string) ($first['json']['data']['assistant']['answer'] ?? '');
    $conversationId = (int) ($first['json']['data']['conversation']['id'] ?? 0);
    genai_live_assert($first['status'] === 200 && $conversationId > 0, 'live authenticated data question creates a persisted conversation');
    genai_live_assert(
        strpos($answer, (string) $summary['approved_verification_accounts']) !== false
        && strpos($answer, (string) $summary['pending_verification_accounts']) !== false,
        'live response contains the current approved and pending verification counts'
    );
    genai_live_assert(stripos($answer, 'review alumni accounts') === false, 'live count response is not the generic feature description');

    $followUp = genai_live_request($endpoint, $sessionId, 'POST', [
        'action' => 'chat',
        'message' => 'what about rejected?',
        'conversation_id' => $conversationId,
        'page_context' => ['route' => '/admin/announcements', 'current_module' => 'Announcements'],
    ]);
    $followUpAnswer = (string) ($followUp['json']['data']['assistant']['answer'] ?? '');
    genai_live_assert(
        $followUp['status'] === 200
        && strpos($followUpAnswer, (string) $summary['rejected_verification_accounts']) !== false,
        'follow-up uses persisted conversation context even after the current page changes'
    );

    $surveyQuestion = genai_live_request($endpoint, $sessionId, 'POST', [
        'action' => 'chat',
        'message' => 'how many alumni are done answering?',
        'conversation_id' => $conversationId,
        'page_context' => ['route' => '/admin/alumni-registered-list', 'current_module' => 'Alumni Verification'],
    ]);
    $surveyAnswer = (string) ($surveyQuestion['json']['data']['assistant']['answer'] ?? '');
    genai_live_assert(
        $surveyQuestion['status'] === 200
        && strpos($surveyAnswer, (string) $summary['answered_alumni']) !== false,
        'live survey-completion question uses the current Done Answering count'
    );

    $surveyFollowUp = genai_live_request($endpoint, $sessionId, 'POST', [
        'action' => 'chat',
        'message' => 'and not answered?',
        'conversation_id' => $conversationId,
        'page_context' => ['route' => '/admin/announcements', 'current_module' => 'Announcements'],
    ]);
    $surveyFollowUpAnswer = (string) ($surveyFollowUp['json']['data']['assistant']['answer'] ?? '');
    genai_live_assert(
        $surveyFollowUp['status'] === 200
        && strpos($surveyFollowUpAnswer, (string) $summary['not_answered_alumni']) !== false,
        'survey follow-up uses the persisted survey context and current Not Answered count'
    );

    $semanticQuestion = genai_live_request($endpoint, $sessionId, 'POST', [
        'action' => 'chat',
        'message' => 'paano mag add ng alumni',
        'conversation_id' => $conversationId,
        'page_context' => ['route' => '/admin/alumni-registered-list', 'current_module' => 'Alumni Verification'],
    ]);
    $semanticAnswer = (string) ($semanticQuestion['json']['data']['assistant']['answer'] ?? '');
    $semanticModel = (string) ($semanticQuestion['json']['data']['dataUsed']['model'] ?? '');
    genai_live_assert(
        $semanticQuestion['status'] === 200
        && $semanticModel !== ''
        && stripos($semanticAnswer, 'I can only help with GradTrack-related') === false,
        'Groq semantically accepts the Filipino alumni-management question instead of pre-rejecting it'
    );
    genai_live_assert(
        preg_match('/\b(import|verification|verify|pag-verify|beripik)/iu', $semanticAnswer) === 1,
        'semantic answer uses the actual Alumni Verification or import workflow rather than inventing a manual Add Alumni action'
    );

    $offTopicQuestion = genai_live_request($endpoint, $sessionId, 'POST', [
        'action' => 'chat',
        'message' => 'what is the weather today?',
        'conversation_id' => $conversationId,
        'page_context' => ['route' => '/admin/alumni-registered-list', 'current_module' => 'Alumni Verification'],
    ]);
    $offTopicAnswer = (string) ($offTopicQuestion['json']['data']['assistant']['answer'] ?? '');
    genai_live_assert(
        $offTopicQuestion['status'] === 200
        && stripos($offTopicAnswer, 'only help with GradTrack-related') !== false
        && !empty($offTopicQuestion['json']['data']['dataUsed']['model']),
        'a genuinely unrelated question is rejected only after Groq semantic scope analysis'
    );

    $history = genai_live_request($endpoint, $sessionId, 'GET', [], '?resource=messages&conversation_id=' . $conversationId);
    genai_live_assert($history['status'] === 200 && count($history['json']['data']['messages'] ?? []) === 12, 'history endpoint reloads every user and assistant message pair');

    $otherStmt = $db->prepare("SELECT id FROM admin_users
                               WHERE id <> :id AND is_active = 1
                                 AND role IN ('admin','super_admin','alumni_admin','registrar','dean_cs','dean_coed','dean_hm')
                               ORDER BY id ASC LIMIT 1");
    $otherStmt->execute([':id' => $adminId]);
    $otherAdminId = (int) ($otherStmt->fetchColumn() ?: 0);
    if ($otherAdminId > 0) {
        session_id($otherSessionId);
        session_start();
        $_SESSION = ['admin_user_id' => $otherAdminId, 'authenticated_at' => time()];
        session_write_close();
        $crossAccount = genai_live_request($endpoint, $otherSessionId, 'GET', [], '?resource=messages&conversation_id=' . $conversationId);
        genai_live_assert($crossAccount['status'] === 404, 'a second authenticated account cannot open the first account history');
    }
} finally {
    if ($conversationId > 0) {
        $db->prepare('DELETE FROM ai_conversations WHERE id = :id AND admin_user_id = :admin_user_id')
            ->execute([':id' => $conversationId, ':admin_user_id' => $adminId]);
    }
    session_id($sessionId);
    session_start();
    $_SESSION = [];
    session_destroy();
    if ($otherAdminId > 0) {
        session_id($otherSessionId);
        session_start();
        $_SESSION = [];
        session_destroy();
    }
}

if ($failures > 0) {
    echo PHP_EOL . "{$failures} GenAI live-data HTTP test(s) failed." . PHP_EOL;
    ob_end_flush();
    exit(1);
}

echo PHP_EOL . 'All GenAI live-data HTTP tests passed.' . PHP_EOL;
ob_end_flush();
