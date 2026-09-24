<?php

$_SERVER['REQUEST_METHOD'] = 'GET';
define('GRADTRACK_GENAI_ASSISTANT_NO_RUN', true);
require_once __DIR__ . '/../api/genai/assistant.php';

$failures = 0;

function genai_behavior_assert(bool $condition, string $message): void
{
    global $failures;
    if (!$condition) {
        $failures++;
        echo "FAIL: {$message}" . PHP_EOL;
        return;
    }
    echo "PASS: {$message}" . PHP_EOL;
}

function genai_behavior_answer(?array $response): string
{
    return (string)($response['answer'] ?? '');
}

$policies = gradtrack_genai_role_policies();

genai_behavior_assert(gradtrack_genai_detect_language('How do I answer the survey?') === 'english', 'English is detected');
genai_behavior_assert(gradtrack_genai_detect_language('Paano ko sasagutan ito?') === 'filipino', 'Filipino is detected');
genai_behavior_assert(gradtrack_genai_detect_language('Paano ko sasagutan yung survey?') === 'taglish', 'Taglish is detected');

$roleQuestions = [
    'research_coordinator' => 'How do I manage surveys?',
    'registrar' => 'How do I edit a graduate record?',
    'alumni_president' => 'How do I verify an alumni account?',
    'dean_cs' => 'How do I notify nonrespondents?',
];
foreach ($roleQuestions as $role => $question) {
    $classification = gradtrack_genai_classify_request($question, $role, $policies[$role]);
    genai_behavior_assert($classification['type'] === 'feature_help', "{$role} English how-to maps to an allowed feature");
}

foreach (['research_coordinator', 'registrar', 'alumni_president', 'dean_cs'] as $role) {
    $english = gradtrack_genai_special_workflow_response('How do I answer the survey?', ['role' => $role], $policies[$role]);
    $filipino = gradtrack_genai_special_workflow_response('Paano ko sasagutan yung survey?', ['role' => $role], $policies[$role]);
    genai_behavior_assert(
        $english !== null
        && stripos(genai_behavior_answer($english), 'does not submit') !== false
        && stripos(genai_behavior_answer($english), 'Verify & Continue') !== false
        && stripos(genai_behavior_answer($english), 'Submit Survey') !== false,
        "{$role} English survey guidance uses the implemented public survey flow and role boundary"
    );
    genai_behavior_assert(
        $filipino !== null
        && preg_match('/\b(Hindi|graduate|sasagutan|Submit Survey)\b/iu', genai_behavior_answer($filipino)) === 1
        && stripos(genai_behavior_answer($filipino), 'I can only help') === false,
        "{$role} Filipino/Taglish survey guidance stays useful and non-generic"
    );
}

$adminDelete = gradtrack_genai_special_workflow_response('How do I delete survey responses?', ['role' => 'research_coordinator'], $policies['research_coordinator']);
$deanDelete = gradtrack_genai_special_workflow_response('Paano burahin ang survey response?', ['role' => 'dean_cs'], $policies['dean_cs']);
genai_behavior_assert(
    stripos(genai_behavior_answer($adminDelete), 'no button') !== false
    && stripos(genai_behavior_answer($adminDelete), 'Delete permanently') !== false,
    'Research Coordinator response deletion guidance reflects the implemented whole-survey archive flow'
);
genai_behavior_assert(
    preg_match('/walang permission/iu', genai_behavior_answer($deanDelete)) === 1,
    'Dean is told that response deletion is outside the role permission'
);

$dataCases = [
    ['research_coordinator', 'How many answered the survey?', '/admin/graduates', 'survey_participation', 'answered'],
    ['research_coordinator', 'How many BSCS graduates are employed?', '/admin/reports', 'report_analytics', 'summary'],
    ['registrar', 'Ilan ang BSCS graduate records?', '/admin/graduates', 'graduate_program_counts', 'program'],
    ['alumni_president', 'Ilan ang pending alumni verification?', '/admin/alumni-registered-list', 'alumni_verification_summary', 'pending'],
    ['dean_cs', 'Ilan ang graduates na sakop ng department namin?', '/admin/survey-status', 'survey_participation', 'total'],
];
foreach ($dataCases as [$role, $question, $route, $tool, $metric]) {
    $resolution = gradtrack_genai_resolve_data_tool($question, $role, null, ['route' => $route]);
    genai_behavior_assert(
        ($resolution['tool'] ?? null) === $tool && ($resolution['metric'] ?? null) === $metric,
        "{$role} data question selects {$tool}:{$metric}"
    );
}

$listCases = [
    ['research_coordinator', 'Show graduates who have not answered the survey.', 'survey_participation_list'],
    ['registrar', 'List BSCS graduates.', 'graduate_record_list'],
    ['alumni_president', 'Ipakita ang pending alumni verification requests.', 'alumni_verification_list'],
    ['dean_cs', 'Sino ang hindi pa sumagot sa survey?', 'survey_participation_list'],
];
foreach ($listCases as [$role, $question, $tool]) {
    $resolution = gradtrack_genai_resolve_data_tool($question, $role);
    genai_behavior_assert(
        ($resolution['tool'] ?? null) === $tool,
        "{$role} authorized list question selects {$tool}"
    );
}
genai_behavior_assert(
    gradtrack_genai_classify_request('List BSCS graduates.', 'registrar', $policies['registrar'])['type'] === 'data',
    'Registrar list wording is not mistaken for another role because BSCS is also a Dean program'
);
genai_behavior_assert(
    gradtrack_genai_resolve_data_tool('List employed BSCS graduates.', 'registrar') === null,
    'Registrar list routing cannot bypass the employment-analytics restriction'
);

genai_behavior_assert(
    gradtrack_genai_resolve_data_tool('How many BSHM graduates?', 'dean_cs', null, ['route' => '/admin/survey-status']) === null,
    'Dean cannot route a data request for an unassigned program'
);
genai_behavior_assert(
    gradtrack_genai_classify_request('How many BSCS graduates are employed?', 'registrar', $policies['registrar'])['type'] === 'restricted',
    'Registrar cannot access Research Coordinator employment analytics'
);
genai_behavior_assert(
    gradtrack_genai_classify_request('How many BSCS graduates are employed?', 'dean_cs', $policies['dean_cs'])['type'] === 'restricted',
    'Dean cannot access Research Coordinator employment analytics'
);
genai_behavior_assert(
    gradtrack_genai_classify_request('How many pending alumni verifications?', 'research_coordinator', $policies['research_coordinator'])['type'] === 'restricted',
    'Research Coordinator cannot access Alumni President verification data'
);

$scopeContext = [
    'role_label' => 'Dean - CCS',
    'scope_note' => 'Active-survey participation is limited to assigned programs.',
    'assigned_programs' => [
        ['code' => 'BSCS', 'name' => 'Bachelor of Science in Computer Science'],
        ['code' => 'ACT', 'name' => 'Associate in Computer Technology'],
    ],
];
$scopeEnglish = gradtrack_genai_role_scope_response($scopeContext, $policies['dean_cs'], 'What departments are covered by my role?');
$scopeFilipino = gradtrack_genai_role_scope_response($scopeContext, $policies['dean_cs'], 'Anong programs ang sakop ng role ko?');
genai_behavior_assert(gradtrack_genai_is_role_scope_question('what departments'), 'short natural Dean scope wording is recognized');
genai_behavior_assert(
    str_contains(genai_behavior_answer($scopeEnglish), 'BSCS') && str_contains(genai_behavior_answer($scopeEnglish), 'ACT'),
    'Dean English scope answer contains only assigned programs'
);
genai_behavior_assert(
    str_contains(genai_behavior_answer($scopeFilipino), 'Saklaw') && str_contains(genai_behavior_answer($scopeFilipino), 'BSCS'),
    'Dean Filipino scope answer is language-matched and program-scoped'
);

foreach (['research_coordinator', 'registrar', 'alumni_president', 'dean_cs'] as $role) {
    $offTopic = gradtrack_genai_semantic_response(
        ['scopeStatus' => 'off_topic', 'intentType' => 'off_topic', 'answer' => 'ignored'],
        $policies[$role],
        'What is the weather?',
        $role,
        gradtrack_genai_allowed_program_codes($role),
        ['type' => 'semantic', 'hint' => 'likely_off_topic']
    );
    $unknown = gradtrack_genai_semantic_response(
        ['scopeStatus' => 'not_found', 'intentType' => 'not_found', 'answer' => 'ignored'],
        $policies[$role],
        'Where is the GradTrack teleportation page?',
        $role,
        gradtrack_genai_allowed_program_codes($role),
        ['type' => 'semantic', 'hint' => 'unknown_gradtrack_feature']
    );
    genai_behavior_assert(
        ($offTopic['classification'] ?? '') === 'off_topic'
        && stripos(genai_behavior_answer($offTopic['assistant'] ?? null), 'I can only help') === false,
        "{$role} unrelated question receives a useful non-generic refusal"
    );
    genai_behavior_assert(
        ($unknown['classification'] ?? '') === 'not_found'
        && stripos(genai_behavior_answer($unknown['assistant'] ?? null), 'couldn\'t find') !== false,
        "{$role} unknown GradTrack information is not invented"
    );
}

$semanticData = gradtrack_genai_semantic_response(
    [
        'scopeStatus' => 'in_scope',
        'intentType' => 'data',
        'answer' => '',
        'dataRequest' => ['tool' => 'survey_participation', 'metric' => 'answered', 'programCode' => null],
    ],
    $policies['dean_cs'],
    'Gaano karami ang nakatapos?',
    'dean_cs',
    ['BSCS', 'ACT'],
    ['type' => 'semantic']
);
genai_behavior_assert(
    ($semanticData['data_resolution']['tool'] ?? null) === 'survey_participation'
    && ($semanticData['data_resolution']['language'] ?? null) === 'filipino',
    'semantic natural-language routing can request only an authorized live-data tool'
);

$unauthorizedSemanticData = gradtrack_genai_semantic_response(
    [
        'scopeStatus' => 'in_scope',
        'intentType' => 'data',
        'answer' => 'There are 999 records.',
        'dataRequest' => ['tool' => 'system_user_summary', 'metric' => 'active', 'programCode' => null],
    ],
    $policies['dean_cs'],
    'How many system users?',
    'dean_cs',
    ['BSCS', 'ACT'],
    ['type' => 'semantic']
);
genai_behavior_assert($unauthorizedSemanticData === null, 'semantic output cannot invoke or answer from an unauthorized data tool');

$unrequestedSemanticList = gradtrack_genai_semantic_response(
    [
        'scopeStatus' => 'in_scope',
        'intentType' => 'data',
        'answer' => '',
        'dataRequest' => ['tool' => 'survey_participation_list', 'metric' => 'summary', 'programCode' => null],
    ],
    $policies['dean_cs'],
    'Tell me about survey participation.',
    'dean_cs',
    ['BSCS', 'ACT'],
    ['type' => 'semantic']
);
genai_behavior_assert($unrequestedSemanticList === null, 'semantic output cannot retrieve record names unless the user asked for a list');

if ($failures > 0) {
    echo PHP_EOL . "{$failures} GenAI role-behavior test(s) failed." . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All GenAI role-behavior tests passed.' . PHP_EOL;
