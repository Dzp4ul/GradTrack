<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/survey_program_scope.php';

$failures = 0;

function program_scope_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) {
        $failures++;
    }
}

function program_scope_create_survey(PDO $db, string $title): int
{
    $templateStmt = $db->prepare(
        "INSERT INTO survey_templates (template_key, title, description)
         VALUES (:template_key, :title, 'Survey program scope integration test')"
    );
    $templateStmt->execute([
        ':template_key' => gradtrack_survey_uuid(),
        ':title' => $title,
    ]);
    $templateId = (int) $db->lastInsertId();

    $surveyStmt = $db->prepare(
        "INSERT INTO surveys (template_id, version_number, title, description, status)
         VALUES (:template_id, 1, :title, 'Survey program scope integration test', 'inactive')"
    );
    $surveyStmt->execute([
        ':template_id' => $templateId,
        ':title' => $title,
    ]);
    return (int) $db->lastInsertId();
}

function program_scope_codes(array $scope): array
{
    $codes = array_map(
        static fn (array $department): string => (string) $department['code'],
        $scope['departments'] ?? []
    );
    sort($codes, SORT_STRING);
    return $codes;
}

$db = (new Database())->getConnection();
program_scope_assert(
    gradtrack_survey_program_scope_table_exists($db),
    'survey_programs migration is installed'
);
if (!gradtrack_survey_program_scope_table_exists($db)) {
    exit(1);
}

$programRows = $db->query('SELECT id, code, name FROM programs ORDER BY id ASC')->fetchAll(PDO::FETCH_ASSOC);
$programsByCode = [];
foreach ($programRows as $programRow) {
    $programsByCode[strtoupper((string) $programRow['code'])] = $programRow;
}

$requiredCodes = ['ACT', 'BEED', 'BSCS', 'BSED', 'BSHM', 'BSN'];
program_scope_assert(
    count(array_intersect($requiredCodes, array_keys($programsByCode))) === count($requiredCodes),
    'acceptance-test program master rows exist'
);
if (count(array_intersect($requiredCodes, array_keys($programsByCode))) !== count($requiredCodes)) {
    exit(1);
}

$db->beginTransaction();
try {
    $surveyA = program_scope_create_survey($db, 'Program Scope A ' . bin2hex(random_bytes(4)));
    $surveyB = program_scope_create_survey($db, 'Program Scope B ' . bin2hex(random_bytes(4)));

    $idsFor = static function (array $codes) use ($programsByCode): array {
        return array_map(
            static fn (string $code): int => (int) $programsByCode[$code]['id'],
            $codes
        );
    };

    $caseOneCodes = ['ACT', 'BEED', 'BSCS', 'BSED', 'BSHM'];
    gradtrack_sync_survey_program_scope($db, $surveyA, $idsFor($caseOneCodes));
    $caseOneScope = gradtrack_get_survey_program_scope($db, $surveyA);
    $sortedCaseOne = $caseOneCodes;
    sort($sortedCaseOne, SORT_STRING);
    program_scope_assert(
        $caseOneScope['configured'] && program_scope_codes($caseOneScope) === $sortedCaseOne,
        'case 1 returns the five selected programs and excludes BSN'
    );

    $caseTwoCodes = ['BSCS', 'BSHM'];
    gradtrack_sync_survey_program_scope($db, $surveyA, $idsFor($caseTwoCodes));
    $caseTwoScope = gradtrack_get_survey_program_scope($db, $surveyA);
    program_scope_assert(
        program_scope_codes($caseTwoScope) === $caseTwoCodes,
        'case 2 replaces the saved scope with BSCS and BSHM only'
    );

    $caseThreeCodes = ['BSCS', 'BSN'];
    gradtrack_sync_survey_program_scope($db, $surveyB, $idsFor($caseThreeCodes));
    $caseThreeScope = gradtrack_get_survey_program_scope($db, $surveyB);
    program_scope_assert(
        program_scope_codes($caseThreeScope) === $caseThreeCodes,
        'case 3 includes BSN when that survey explicitly selects BSN'
    );
    program_scope_assert(
        program_scope_codes(gradtrack_get_survey_program_scope($db, $surveyA)) === $caseTwoCodes,
        'each survey ID retains an isolated department scope'
    );

    gradtrack_sync_survey_program_scope($db, $surveyA, []);
    $emptyScope = gradtrack_get_survey_program_scope($db, $surveyA);
    program_scope_assert(
        !$emptyScope['configured']
        && $emptyScope['departments'] === []
        && str_contains((string) $emptyScope['error'], 'No departments'),
        'an empty scope stays empty and never falls back to all programs'
    );

    $majorOptionMatch = gradtrack_match_program_scope_option(
        $programRows,
        'Bachelor of Secondary Education Major in General Science'
    );
    program_scope_assert(
        ($majorOptionMatch['code'] ?? null) === 'BSED',
        'legacy specialization text backfills to its canonical program ID'
    );

    $invalidRejected = false;
    try {
        gradtrack_sync_survey_program_scope($db, $surveyA, [PHP_INT_MAX]);
    } catch (InvalidArgumentException $exception) {
        $invalidRejected = true;
    }
    program_scope_assert($invalidRejected, 'unknown program IDs are rejected during survey save');
} finally {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
}

if ($failures > 0) {
    echo PHP_EOL . "{$failures} survey program scope integration test(s) failed." . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All survey program scope integration tests passed.' . PHP_EOL;

