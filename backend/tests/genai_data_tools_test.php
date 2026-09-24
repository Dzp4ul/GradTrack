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
    'alumni_president',
    null,
    ['route' => '/admin/alumni-registered-list']
);
genai_tool_test_assert(($verification['tool'] ?? null) === 'alumni_verification_summary', 'verification count question selects live verification summary');
genai_tool_test_assert(($verification['metric'] ?? null) === 'summary', 'approved and pending requests retain all verification status counts');

$verificationVariation = gradtrack_genai_resolve_data_tool('How many alumni are waiting for verification?', 'alumni_president');
genai_tool_test_assert(($verificationVariation['tool'] ?? null) === 'alumni_verification_summary', 'natural waiting-for-verification wording selects verification data');

$followUp = gradtrack_genai_resolve_data_tool('What about rejected?', 'alumni_president', 'alumni_verification_summary');
genai_tool_test_assert(($followUp['tool'] ?? null) === 'alumni_verification_summary', 'verification follow-up uses server-owned prior tool context');
genai_tool_test_assert(($followUp['metric'] ?? null) === 'rejected', 'verification follow-up selects rejected metric');

$taglish = gradtrack_genai_resolve_data_tool(
    'ilan ang approved?',
    'alumni_president',
    null,
    ['route' => '/admin/alumni-registered-list']
);
genai_tool_test_assert(($taglish['tool'] ?? null) === 'alumni_verification_summary', 'Taglish count question uses page hint and live verification data');
genai_tool_test_assert(($taglish['metric'] ?? null) === 'approved', 'Taglish approved question selects approved metric');

$survey = gradtrack_genai_resolve_data_tool('How many alumni are done answering?', 'alumni_president');
genai_tool_test_assert(($survey['tool'] ?? null) === 'alumni_registry_summary', 'Alumni President survey completion uses registered-list summary');
genai_tool_test_assert(($survey['metric'] ?? null) === 'answered', 'survey completion question selects answered metric');

$surveyFollowUp = gradtrack_genai_resolve_data_tool('And not answered?', 'alumni_president', 'alumni_registry_summary');
genai_tool_test_assert(($surveyFollowUp['tool'] ?? null) === 'alumni_registry_summary', 'survey follow-up preserves prior data feature');
genai_tool_test_assert(($surveyFollowUp['metric'] ?? null) === 'not_answered', 'survey follow-up selects not-answered metric');

$registered = gradtrack_genai_resolve_data_tool('How many registered alumni are there?', 'alumni_president');
genai_tool_test_assert(($registered['tool'] ?? null) === 'alumni_registry_summary', 'registered alumni total does not use verification-account counts');

$programComparison = gradtrack_genai_resolve_data_tool('Which program has the most registered alumni?', 'alumni_president');
genai_tool_test_assert(($programComparison['tool'] ?? null) === 'alumni_registry_summary' && ($programComparison['metric'] ?? null) === 'by_program', 'program comparison selects the registered-alumni program breakdown');

$systemGraduates = gradtrack_genai_resolve_data_tool('How many graduates are in the system?', 'admin');
genai_tool_test_assert(($systemGraduates['tool'] ?? null) === 'system_dashboard_statistics', 'Admin graduate total uses authorized system aggregates');
$coordinatorSystemGraduates = gradtrack_genai_resolve_data_tool('How many graduates are in the system?', 'research_coordinator');
genai_tool_test_assert($coordinatorSystemGraduates === null, 'Research Coordinator cannot select system administration aggregates');

$restricted = gradtrack_genai_resolve_data_tool('How many system user accounts are active?', 'alumni_president');
genai_tool_test_assert($restricted === null, 'Alumni President cannot select Research Coordinator user statistics tool');

$deanAllowed = gradtrack_genai_resolve_data_tool('How many BSCS graduates?', 'dean_cs');
genai_tool_test_assert(($deanAllowed['tool'] ?? null) === 'survey_participation', 'CCS Dean graduate count uses the program-scoped active-survey aggregate exposed by the Dean page');
$deanRestricted = gradtrack_genai_resolve_data_tool('How many BSHM graduates?', 'dean_cs');
genai_tool_test_assert($deanRestricted === null, 'CCS Dean cannot select a BSHM aggregate');
$currentSurvey = gradtrack_genai_resolve_data_tool('What is the current survey?', 'research_coordinator');
genai_tool_test_assert(
    ($currentSurvey['tool'] ?? null) === 'survey_participation' && ($currentSurvey['metric'] ?? null) === 'current_survey',
    'Research Coordinator current-survey question selects the active survey data source'
);
genai_tool_test_assert(
    gradtrack_genai_resolve_data_tool('What is the current survey?', 'alumni_president') === null,
    'Alumni President cannot retrieve an active survey that its pages do not expose'
);

$adminList = gradtrack_genai_resolve_data_tool('Show graduates who have not answered the survey.', 'research_coordinator');
genai_tool_test_assert(
    ($adminList['tool'] ?? null) === 'survey_participation_list' && ($adminList['metric'] ?? null) === 'not_answered',
    'Research Coordinator natural-language list request selects the unanswered participation list'
);
$registrarList = gradtrack_genai_resolve_data_tool('List BSCS graduates.', 'registrar');
genai_tool_test_assert(
    ($registrarList['tool'] ?? null) === 'graduate_record_list' && ($registrarList['program_code'] ?? null) === 'BSCS',
    'Registrar list request selects non-archived BSCS graduate records'
);
$alumniList = gradtrack_genai_resolve_data_tool('Ipakita ang pending alumni verification requests.', 'alumni_president');
genai_tool_test_assert(
    ($alumniList['tool'] ?? null) === 'alumni_verification_list' && ($alumniList['metric'] ?? null) === 'pending',
    'Alumni President Filipino list request selects pending verification records'
);
$deanList = gradtrack_genai_resolve_data_tool('Who has not answered the survey?', 'dean_cs');
genai_tool_test_assert(
    ($deanList['tool'] ?? null) === 'survey_participation_list' && ($deanList['metric'] ?? null) === 'not_answered',
    'Dean list request selects the role-scoped unanswered participation list'
);
$deanListContraction = gradtrack_genai_resolve_data_tool("Who hasn't answered the survey?", 'dean_cs');
genai_tool_test_assert(
    ($deanListContraction['tool'] ?? null) === 'survey_participation_list',
    'natural contraction in a list request is understood'
);
genai_tool_test_assert(
    gradtrack_genai_resolve_data_tool('List BSHM graduates.', 'dean_cs') === null,
    'CCS Dean cannot select a list for an unassigned program'
);

$listFallback = gradtrack_genai_tool_fallback_answer(
    ['tool' => 'graduate_record_list', 'metric' => 'summary', 'language' => 'english'],
    [
        'records' => [['name' => 'Example, Graduate', 'program' => 'BSCS', 'year_graduated' => 2026]],
        'total_matching' => 1,
        'returned' => 1,
    ]
);
genai_tool_test_assert(
    str_contains($listFallback, 'Showing 1 of 1') && str_contains($listFallback, 'Example, Graduate'),
    'record-list fallback renders only verified server rows and totals'
);

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
