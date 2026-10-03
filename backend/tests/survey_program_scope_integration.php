<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/survey_program_scope.php';

$failures = 0;

function program_scope_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function program_scope_create_survey(PDO $db, string $title, array $options): array
{
    $templateStmt = $db->prepare(
        "INSERT INTO survey_templates (template_key, title, description)
         VALUES (:template_key, :title, 'Survey program scope integration test')"
    );
    $templateStmt->execute([':template_key' => gradtrack_survey_uuid(), ':title' => $title]);
    $templateId = (int) $db->lastInsertId();

    $surveyStmt = $db->prepare(
        "INSERT INTO surveys (template_id, version_number, title, description, status)
         VALUES (:template_id, 1, :title, 'Survey program scope integration test', 'inactive')"
    );
    $surveyStmt->execute([':template_id' => $templateId, ':title' => $title]);
    $surveyId = (int) $db->lastInsertId();

    $questionKey = gradtrack_survey_uuid();
    $questionStmt = $db->prepare(
        "INSERT INTO survey_questions
         (survey_id, question_key, analytics_key, section, question_text, question_type, options, is_required, sort_order)
         VALUES (:survey_id, :question_key, 'program', 'Educational Background',
                 'Degree Program & Specialization', 'multiple_choice', :options, 1, 15)"
    );
    $questionStmt->execute([
        ':survey_id' => $surveyId,
        ':question_key' => $questionKey,
        ':options' => $options !== [] ? json_encode($options, JSON_UNESCAPED_UNICODE) : null,
    ]);
    $questionId = (int) $db->lastInsertId();
    gradtrack_survey_sync_question_options($db, $questionId, $questionKey, $options);
    gradtrack_link_survey_program_question_options($db, $questionId);

    return ['survey_id' => $surveyId, 'question_id' => $questionId];
}

function program_scope_codes(array $scope): array
{
    return array_map(
        static fn (array $department): string => (string) $department['code'],
        $scope['departments'] ?? []
    );
}

function program_scope_replace_options(PDO $db, int $questionId, array $labels): void
{
    $current = gradtrack_survey_fetch_option_definitions($db, [$questionId])[$questionId] ?? [];
    $currentByProgramId = [];
    $master = gradtrack_survey_program_master_rows($db);
    foreach ($current as $definition) {
        $program = gradtrack_match_program_scope_option(
            $master,
            $definition['value'] ?? '',
            $definition['label'] ?? ''
        );
        if ($program !== null) $currentByProgramId[(int) $program['id']] = $definition;
    }

    $submittedDefinitions = [];
    foreach ($labels as $label) {
        $program = gradtrack_match_program_scope_option($master, $label, $label);
        $submittedDefinitions[] = $program !== null && isset($currentByProgramId[(int) $program['id']])
            ? array_merge($currentByProgramId[(int) $program['id']], ['label' => $label])
            : ['id' => null, 'key' => null, 'value' => $label, 'label' => $label];
    }

    $prepared = gradtrack_prepare_survey_program_option_edit(
        $db,
        $current,
        $labels,
        $submittedDefinitions
    );
    $saved = gradtrack_sync_editable_survey_program_options($db, $questionId, $prepared['definitions']);
    $db->prepare('UPDATE survey_questions SET options = :options WHERE id = :id')->execute([
        ':options' => json_encode(array_column($saved, 'label'), JSON_UNESCAPED_UNICODE),
        ':id' => $questionId,
    ]);
}

$db = (new Database())->getConnection();
$programRows = gradtrack_survey_program_master_rows($db);
$programsByCode = [];
foreach ($programRows as $programRow) {
    $programsByCode[strtoupper((string) $programRow['code'])] = $programRow;
}

$requiredCodes = ['ACT', 'BEED', 'BSCS', 'BSED', 'BSHM', 'BSN'];
program_scope_assert(
    count(array_intersect($requiredCodes, array_keys($programsByCode))) === count($requiredCodes),
    'acceptance-test program master rows exist'
);
if (count(array_intersect($requiredCodes, array_keys($programsByCode))) !== count($requiredCodes)) exit(1);

$labelFor = static fn (string $code): string => (string) $programsByCode[$code]['name'];

$db->beginTransaction();
try {
    $caseOneCodes = ['ACT', 'BEED', 'BSCS', 'BSED', 'BSHM'];
    $caseOneLabels = array_map($labelFor, $caseOneCodes);
    $caseOneLabels[3] .= ' Major in General Science';
    $surveyA = program_scope_create_survey(
        $db,
        'Program options A ' . bin2hex(random_bytes(4)),
        $caseOneLabels
    );
    $caseOneScope = gradtrack_get_survey_program_scope($db, $surveyA['survey_id']);
    program_scope_assert(
        $caseOneScope['configured'] && program_scope_codes($caseOneScope) === $caseOneCodes,
        'case 1 derives five programs from Degree Program & Specialization options and excludes BSN'
    );
    program_scope_assert(
        (int) $db->query(
            'SELECT COUNT(*) FROM survey_question_options WHERE survey_question_id = '
            . (int) $surveyA['question_id'] . ' AND program_id IS NOT NULL'
        )->fetchColumn() === count($caseOneCodes),
        'survey program options persist stable master program IDs'
    );

    $caseTwoCodes = ['BSCS', 'BSHM'];
    program_scope_replace_options(
        $db,
        $surveyA['question_id'],
        array_map($labelFor, $caseTwoCodes)
    );
    program_scope_assert(
        program_scope_codes(gradtrack_get_survey_program_scope($db, $surveyA['survey_id'])) === $caseTwoCodes,
        'case 2 immediately reflects removed and retained question options'
    );

    $caseThreeCodes = ['BSCS', 'BSN'];
    $surveyB = program_scope_create_survey(
        $db,
        'Program options B ' . bin2hex(random_bytes(4)),
        array_map($labelFor, $caseThreeCodes)
    );
    program_scope_assert(
        program_scope_codes(gradtrack_get_survey_program_scope($db, $surveyB['survey_id'])) === $caseThreeCodes,
        'case 3 includes BSN only when that survey question explicitly includes BSN'
    );
    program_scope_assert(
        program_scope_codes(gradtrack_get_survey_program_scope($db, $surveyA['survey_id'])) === $caseTwoCodes,
        'each survey ID reads only its own Degree Program & Specialization options'
    );

    program_scope_replace_options($db, $surveyA['question_id'], []);
    $emptyScope = gradtrack_get_survey_program_scope($db, $surveyA['survey_id']);
    program_scope_assert(
        !$emptyScope['configured']
        && $emptyScope['departments'] === []
        && str_contains((string) $emptyScope['error'], 'No departments'),
        'an empty option list stays empty and never falls back to every program'
    );

    $invalidRejected = false;
    try {
        gradtrack_validate_survey_program_labels($db, ['Not a registrar program']);
    } catch (InvalidArgumentException $exception) {
        $invalidRejected = true;
    }
    program_scope_assert(
        $invalidRejected,
        'survey save validation rejects a program option that cannot map to the registrar master list'
    );

    $legacyJson = program_scope_create_survey(
        $db,
        'Legacy JSON options ' . bin2hex(random_bytes(4)),
        [$labelFor('BSCS')]
    );
    $db->prepare('DELETE FROM survey_question_options WHERE survey_question_id = :question_id')
        ->execute([':question_id' => $legacyJson['question_id']]);
    program_scope_assert(
        program_scope_codes(gradtrack_get_survey_program_scope($db, $legacyJson['survey_id'])) === ['BSCS'],
        'existing surveys with legacy JSON options remain compatible'
    );
} finally {
    if ($db->inTransaction()) $db->rollBack();
}

if ($failures > 0) {
    echo PHP_EOL . "{$failures} survey program option scope integration test(s) failed." . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All survey program option scope integration tests passed.' . PHP_EOL;

