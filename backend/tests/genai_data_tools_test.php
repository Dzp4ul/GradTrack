<?php
require_once __DIR__ . '/../api/config/genai_data_tools.php';

$failures = 0;

function genai_tool_test_assert(bool $condition, string $message): void
{
    global $failures;
    if (!$condition) {
        $failures++;
        echo "FAIL: {$message}" . PHP_EOL;
        return;
    }
    echo "PASS: {$message}" . PHP_EOL;
}

$verification = gradtrack_genai_resolve_data_tool(
    'In alumni verification how many are approved and pending?',
    'alumni_admin',
    null,
    ['route' => '/admin/alumni-registered-list']
);
genai_tool_test_assert(($verification['tool'] ?? null) === 'alumni_verification_summary', 'verification count question selects live verification summary');
genai_tool_test_assert(($verification['metric'] ?? null) === 'summary', 'approved and pending requests retain all verification status counts');

$verificationVariation = gradtrack_genai_resolve_data_tool('How many alumni are waiting for verification?', 'alumni_admin');
genai_tool_test_assert(($verificationVariation['tool'] ?? null) === 'alumni_verification_summary', 'natural waiting-for-verification wording selects verification data');

$followUp = gradtrack_genai_resolve_data_tool('What about rejected?', 'alumni_admin', 'alumni_verification_summary');
genai_tool_test_assert(($followUp['tool'] ?? null) === 'alumni_verification_summary', 'verification follow-up uses server-owned prior tool context');
genai_tool_test_assert(($followUp['metric'] ?? null) === 'rejected', 'verification follow-up selects rejected metric');

$taglish = gradtrack_genai_resolve_data_tool(
    'ilan ang approved?',
    'alumni_admin',
    null,
    ['route' => '/admin/alumni-registered-list']
);
genai_tool_test_assert(($taglish['tool'] ?? null) === 'alumni_verification_summary', 'Taglish count question uses page hint and live verification data');
genai_tool_test_assert(($taglish['metric'] ?? null) === 'approved', 'Taglish approved question selects approved metric');

$survey = gradtrack_genai_resolve_data_tool('How many alumni are done answering?', 'alumni_admin');
genai_tool_test_assert(($survey['tool'] ?? null) === 'alumni_registry_summary', 'Alumni Admin survey completion uses registered-list summary');
genai_tool_test_assert(($survey['metric'] ?? null) === 'answered', 'survey completion question selects answered metric');

$surveyFollowUp = gradtrack_genai_resolve_data_tool('And not answered?', 'alumni_admin', 'alumni_registry_summary');
genai_tool_test_assert(($surveyFollowUp['tool'] ?? null) === 'alumni_registry_summary', 'survey follow-up preserves prior data feature');
genai_tool_test_assert(($surveyFollowUp['metric'] ?? null) === 'not_answered', 'survey follow-up selects not-answered metric');

$registered = gradtrack_genai_resolve_data_tool('How many registered alumni are there?', 'alumni_admin');
genai_tool_test_assert(($registered['tool'] ?? null) === 'alumni_registry_summary', 'registered alumni total does not use verification-account counts');

$programComparison = gradtrack_genai_resolve_data_tool('Which program has the most registered alumni?', 'alumni_admin');
genai_tool_test_assert(($programComparison['tool'] ?? null) === 'alumni_registry_summary' && ($programComparison['metric'] ?? null) === 'by_program', 'program comparison selects the registered-alumni program breakdown');

$systemGraduates = gradtrack_genai_resolve_data_tool('How many graduates are in the system?', 'super_admin');
genai_tool_test_assert(($systemGraduates['tool'] ?? null) === 'system_dashboard_statistics', 'Super Admin graduate total uses authorized system aggregates');

$restricted = gradtrack_genai_resolve_data_tool('How many system user accounts are active?', 'alumni_admin');
genai_tool_test_assert($restricted === null, 'Alumni Admin cannot select Super Admin user statistics tool');

$deanAllowed = gradtrack_genai_resolve_data_tool('How many BSCS graduates?', 'dean_cs');
genai_tool_test_assert(($deanAllowed['tool'] ?? null) === 'graduate_program_counts', 'CCS Dean can request BSCS graduate aggregate');
$deanRestricted = gradtrack_genai_resolve_data_tool('How many BSHM graduates?', 'dean_cs');
genai_tool_test_assert($deanRestricted === null, 'CCS Dean cannot select BSHM aggregate tool');

$fallback = gradtrack_genai_tool_fallback_answer($verification, [
    'approved' => 17,
    'pending' => 1,
    'rejected' => 0,
    'total_accounts' => 18,
]);
genai_tool_test_assert(strpos($fallback, '17 approved') !== false && strpos($fallback, '1 pending') !== false && strpos($fallback, '0 rejected') !== false, 'deterministic fallback preserves all live verification counts');

if ($failures > 0) {
    echo PHP_EOL . "{$failures} GenAI data-tool test(s) failed." . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All GenAI data-tool tests passed.' . PHP_EOL;
