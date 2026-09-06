<?php
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/genai_conversations.php';

$failures = 0;
$createdIds = [];

function genai_history_test_assert(bool $condition, string $message): void
{
    global $failures;
    if (!$condition) {
        $failures++;
        echo "FAIL: {$message}" . PHP_EOL;
        return;
    }
    echo "PASS: {$message}" . PHP_EOL;
}

$db = (new Database())->getConnection();
gradtrack_genai_ensure_conversation_schema($db);
$users = $db->query("SELECT id, role FROM admin_users WHERE is_active = 1 ORDER BY id ASC LIMIT 2")
    ->fetchAll(PDO::FETCH_ASSOC);

if (count($users) < 2) {
    echo 'SKIP: Two active administrator accounts are required for history isolation integration.' . PHP_EOL;
    exit(0);
}

try {
    $accountA = ['id' => (int) $users[0]['id'], 'role' => (string) $users[0]['role']];
    $accountB = ['id' => (int) $users[1]['id'], 'role' => (string) $users[1]['role']];

    $conversationA = gradtrack_genai_create_conversation($db, $accountA['id'], $accountA['role']);
    $createdIds[] = $conversationA['id'];
    gradtrack_genai_append_message($db, $conversationA['id'], $accountA['id'], $accountA['role'], 'user', 'Alumni verification status');
    gradtrack_genai_append_message($db, $conversationA['id'], $accountA['id'], $accountA['role'], 'assistant', 'Verified aggregate response.', ['data_tool' => 'alumni_verification_summary']);

    $conversationB = gradtrack_genai_create_conversation($db, $accountA['id'], $accountA['role']);
    $createdIds[] = $conversationB['id'];
    gradtrack_genai_append_message($db, $conversationB['id'], $accountA['id'], $accountA['role'], 'user', 'Survey responses');

    $listA = gradtrack_genai_list_conversations($db, $accountA['id'], $accountA['role']);
    $listedIds = array_column($listA, 'id');
    genai_history_test_assert(in_array($conversationA['id'], $listedIds, true) && in_array($conversationB['id'], $listedIds, true), 'one account can list both of its persisted conversations');

    $loaded = gradtrack_genai_load_messages($db, $conversationA['id'], $accountA['id'], $accountA['role']);
    genai_history_test_assert(count($loaded) === 2 && $loaded[0]['message'] === 'Alumni verification status', 'reopened conversation loads messages in order');
    genai_history_test_assert(gradtrack_genai_recent_context($loaded)['last_data_tool'] === 'alumni_verification_summary', 'reopened conversation restores follow-up data context');

    genai_history_test_assert(gradtrack_genai_find_conversation($db, $conversationA['id'], $accountB['id'], $accountB['role']) === null, 'a second account cannot access the first account conversation');
    genai_history_test_assert(gradtrack_genai_find_conversation($db, $conversationA['id'], $accountA['id'], $accountA['role'] . '_other') === null, 'conversation ownership also requires the same authenticated role');

    $refreshed = gradtrack_genai_find_conversation($db, $conversationA['id'], $accountA['id'], $accountA['role']);
    genai_history_test_assert(($refreshed['title'] ?? '') === 'Alumni verification status', 'first user message automatically becomes the conversation title');
} finally {
    foreach ($createdIds as $id) {
        $db->prepare('DELETE FROM ai_conversations WHERE id = :id')->execute([':id' => $id]);
    }
}

if ($failures > 0) {
    echo PHP_EOL . "{$failures} GenAI history integration test(s) failed." . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All GenAI history integration tests passed.' . PHP_EOL;
