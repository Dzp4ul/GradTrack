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

$managedJobs = gradtrack_genai_resolve_data_tool(
    'Show my archived job posting summary.',
    'research_coordinator',
    null,
    ['route' => '/admin/job-postings']
);
genai_tool_test_assert(
    ($managedJobs['tool'] ?? null) === 'managed_job_summary' && ($managedJobs['metric'] ?? null) === 'archived',
    'Job Postings summary uses the authenticated administrator-owned job tool'
);
genai_tool_test_assert(
    gradtrack_genai_requested_export_formats('Give me the list in PDF and Excel.') === ['pdf', 'xlsx'],
    'a request for PDF and Excel retains both requested file formats'
);

$systemGraduates = gradtrack_genai_resolve_data_tool('How many graduates are in the system?', 'admin');
genai_tool_test_assert(($systemGraduates['tool'] ?? null) === 'system_dashboard_statistics', 'Admin graduate total uses authorized system aggregates');
$coordinatorSystemGraduates = gradtrack_genai_resolve_data_tool('How many graduates are in the system?', 'research_coordinator');
genai_tool_test_assert(
    ($coordinatorSystemGraduates['tool'] ?? null) === 'graduate_program_counts',
    'Research Coordinator receives the authorized graduate-record total without selecting system administration aggregates'
);

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
$employmentRoutes = ['/admin', '/admin/graduates', '/admin/surveys', '/admin/reports', '/admin/job-postings'];
foreach ($employmentRoutes as $employmentRoute) {
    $employmentList = gradtrack_genai_resolve_data_tool(
        'Give me the list of the graduates who are employed.',
        'research_coordinator',
        null,
        ['route' => $employmentRoute]
    );
    genai_tool_test_assert(
        ($employmentList['tool'] ?? null) === 'employment_status_list'
            && ($employmentList['metric'] ?? null) === 'employed',
        "employment-list intent overrides current page context on {$employmentRoute}"
    );
}
genai_tool_test_assert(
    (gradtrack_genai_resolve_data_tool('How many graduates are employed?', 'research_coordinator', null, ['route' => '/admin/job-postings'])['tool'] ?? null) === 'report_analytics',
    'employment aggregate works outside Reports and Dashboard pages'
);
genai_tool_test_assert(
    (gradtrack_genai_resolve_data_tool('How many graduates are there?', 'research_coordinator', null, ['route' => '/admin'])['tool'] ?? null) === 'graduate_program_counts',
    'Research Coordinator graduate total works from Dashboard without selecting an unauthorized system tool'
);
genai_tool_test_assert(
    gradtrack_genai_resolve_data_tool('List the employed graduates.', 'registrar', null, ['route' => '/admin/graduates']) === null,
    'Registrar cannot access tracer-study employment respondent names'
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
$filteredList = gradtrack_genai_resolve_data_tool(
    'Show BSCS graduates who have not answered the survey.',
    'research_coordinator'
);
$yearFollowUp = gradtrack_genai_resolve_data_tool(
    'Only 2025.',
    'research_coordinator',
    (string)($filteredList['tool'] ?? ''),
    ['route' => '/admin/graduates'],
    $filteredList ?? []
);
genai_tool_test_assert(
    ($yearFollowUp['tool'] ?? null) === 'survey_participation_list'
        && ($yearFollowUp['metric'] ?? null) === 'not_answered'
        && ($yearFollowUp['program_code'] ?? null) === 'BSCS'
        && ($yearFollowUp['graduation_year'] ?? null) === 2025,
    'year-only follow-up retains the previous authorized list intent and program filter'
);
$nextPage = gradtrack_genai_resolve_data_tool(
    'Show next 10',
    'research_coordinator',
    (string)($yearFollowUp['tool'] ?? ''),
    ['route' => '/admin/graduates'],
    $yearFollowUp ?? []
);
genai_tool_test_assert(
    ($nextPage['offset'] ?? null) === 10
        && ($nextPage['program_code'] ?? null) === 'BSCS'
        && ($nextPage['graduation_year'] ?? null) === 2025,
    'pagination follow-up advances the server-owned list offset without dropping filters'
);
$exportFollowUp = gradtrack_genai_resolve_data_tool(
    'Export this in PDF and Excel.',
    'research_coordinator',
    (string)($yearFollowUp['tool'] ?? ''),
    ['route' => '/admin/graduates'],
    $yearFollowUp ?? []
);
genai_tool_test_assert(
    ($exportFollowUp['tool'] ?? null) === 'survey_participation_list'
        && ($exportFollowUp['metric'] ?? null) === 'not_answered'
        && ($exportFollowUp['program_code'] ?? null) === 'BSCS'
        && ($exportFollowUp['graduation_year'] ?? null) === 2025,
    'a format-only export follow-up keeps the previous authorized list and filters'
);
$programComparisonResolution = gradtrack_genai_resolve_data_tool(
    'Compare survey responses by program.',
    'research_coordinator',
    null,
    ['route' => '/admin/graduates']
);
genai_tool_test_assert(
    ($programComparisonResolution['tool'] ?? null) === 'survey_participation'
        && ($programComparisonResolution['metric'] ?? null) === 'by_program',
    'survey program comparison selects the authorized participation breakdown'
);
$namedProgramComparison = gradtrack_genai_resolve_data_tool(
    'Compare BSCS and BSHM responses.',
    'research_coordinator',
    null,
    ['route' => '/admin/graduates']
);
genai_tool_test_assert(
    ($namedProgramComparison['tool'] ?? null) === 'survey_participation'
        && ($namedProgramComparison['metric'] ?? null) === 'by_program'
        && ($namedProgramComparison['program_code'] ?? null) === null
        && ($namedProgramComparison['program_codes'] ?? []) === ['BSCS', 'BSHM'],
    'named program comparison preserves both structured program filters without collapsing to the first program'
);
$yearComparison = gradtrack_genai_resolve_data_tool(
    'Compare 2024 and 2025 survey responses.',
    'research_coordinator',
    null,
    ['route' => '/admin/graduates']
);
genai_tool_test_assert(
    ($yearComparison['metric'] ?? null) === 'by_year'
        && ($yearComparison['graduation_year'] ?? null) === null
        && ($yearComparison['graduation_years'] ?? []) === [2024, 2025],
    'batch comparison preserves both structured year filters without incorrectly applying only the first year'
);
$comparisonFollowUp = gradtrack_genai_resolve_data_tool(
    'Only 2025.',
    'research_coordinator',
    (string)($namedProgramComparison['tool'] ?? ''),
    ['route' => '/admin/graduates'],
    $namedProgramComparison ?? []
);
genai_tool_test_assert(
    ($comparisonFollowUp['program_codes'] ?? []) === ['BSCS', 'BSHM']
        && ($comparisonFollowUp['graduation_year'] ?? null) === 2025,
    'a year-only comparison follow-up keeps both previously requested programs'
);
genai_tool_test_assert(
    gradtrack_genai_resolve_data_tool('List BSHM graduates.', 'dean_cs') === null,
    'CCS Dean cannot select a list for an unassigned program'
);
genai_tool_test_assert(
    gradtrack_genai_resolve_data_tool('Compare BSCS and BSHM responses.', 'dean_cs', null, ['route' => '/admin/survey-status']) === null,
    'CCS Dean cannot hide an unassigned program inside a multi-program comparison'
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

$listPresentation = gradtrack_genai_tool_presentation(
    ['tool' => 'survey_participation_list', 'metric' => 'not_answered', 'feature' => 'Survey Participation', 'program_code' => 'BSCS', 'graduation_year' => 2025],
    [
        'records' => [['name' => 'Example, Graduate', 'program' => 'BSCS', 'year_graduated' => 2025, 'status' => 'Not Answered']],
        'total_matching' => 11,
        'returned' => 1,
        'offset' => 0,
        'participation_summary' => ['total' => 20, 'answered' => 9, 'not_answered' => 11, 'response_rate' => 45.0],
        'selected_survey' => ['id' => 7, 'title' => 'Tracer Survey'],
    ]
);
genai_tool_test_assert(
    ($listPresentation['kind'] ?? null) === 'list'
        && ($listPresentation['records'][0]['title'] ?? null) === 'Example, Graduate'
        && ($listPresentation['pagination']['hasMore'] ?? false) === true
        && str_contains((string)($listPresentation['actions'][0]['route'] ?? ''), 'program=BSCS'),
    'list presentation is built from verified server rows with pagination and filter-aware navigation'
);
$employmentPresentation = gradtrack_genai_tool_presentation(
    ['tool' => 'employment_status_list', 'metric' => 'employed', 'feature' => 'Employment Status'],
    [
        'records' => [[
            'name' => 'Example, Employee',
            'program' => 'BSCS',
            'year_graduated' => 2025,
            'status' => 'Employed',
            'work_location' => 'Local',
        ]],
        'total_matching' => 1,
        'returned' => 1,
        'offset' => 0,
        'selected_survey' => ['id' => 7, 'title' => 'Tracer Survey'],
    ]
);
genai_tool_test_assert(
    ($employmentPresentation['title'] ?? null) === 'Employed Graduate Respondents'
        && ($employmentPresentation['records'][0]['status'] ?? null) === 'Employed'
        && ($employmentPresentation['records'][0]['details'][2]['value'] ?? null) === 'Local'
        && str_contains((string)($employmentPresentation['actions'][0]['route'] ?? ''), 'tab=employment'),
    'employment list presentation exposes verified respondent status and report navigation'
);
$listExport = gradtrack_genai_tool_export_data(
    ['tool' => 'survey_participation_list', 'metric' => 'not_answered', 'program_code' => 'BSED', 'graduation_year' => null],
    [
        'records' => [
            ['name' => 'Example, Graduate', 'program' => 'BSED', 'year_graduated' => 2025, 'status' => 'Not Answered'],
            ['name' => 'Sample, Graduate', 'program' => 'BSED', 'year_graduated' => 2024, 'status' => 'Not Answered'],
        ],
        'total_matching' => 2,
        'selected_survey' => ['title' => 'Tracer Survey'],
    ],
    ['pdf', 'xlsx']
);
genai_tool_test_assert(
    ($listExport['formats'] ?? []) === ['pdf', 'xlsx']
        && ($listExport['recordsIncluded'] ?? 0) === 2
        && ($listExport['columns'] ?? []) === ['Name', 'Program', 'Batch', 'Status']
        && ($listExport['rows'][0][0] ?? null) === 'Example, Graduate'
        && ($listExport['truncated'] ?? true) === false,
    'authorized list results produce a complete typed file-generation payload'
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
