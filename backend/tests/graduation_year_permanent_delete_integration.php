<?php

$_SERVER['REQUEST_METHOD'] = 'GET';
define('GRADTRACK_REPORTS_INDEX_NO_RUN', true);

require_once __DIR__ . '/../api/reports/index.php';
require_once __DIR__ . '/../api/config/permanent_delete.php';

$failures = 0;

function graduation_archive_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) {
        $failures++;
    }
}

function graduation_archive_expect_status(callable $operation, int $status, string $message): void
{
    try {
        $operation();
        graduation_archive_assert(false, $message);
    } catch (GradtrackPermanentDeleteException $error) {
        graduation_archive_assert($error->getStatusCode() === $status, $message);
    }
}

function graduation_archive_insert_graduate(PDO $db, int $programId, int $year, bool $archived, string $suffix): int
{
    $stmt = $db->prepare('INSERT INTO graduates
        (student_id, first_name, last_name, email, program_id, year_graduated, status, archived_at)
        VALUES (:student_id, :first_name, :last_name, :email, :program_id, :year_graduated, \'active\', :archived_at)');
    $stmt->execute([
        ':student_id' => 'GY' . $year . $suffix,
        ':first_name' => 'Year' . $year,
        ':last_name' => 'IntegrationTest',
        ':email' => 'year-' . $year . '-' . $suffix . '@example.invalid',
        ':program_id' => $programId,
        ':year_graduated' => $year,
        ':archived_at' => $archived ? date('Y-m-d H:i:s') : null,
    ]);
    return (int) $db->lastInsertId();
}

$db = (new Database())->getConnection();
$db->beginTransaction();

try {
    $program = $db->query('SELECT id, code, name FROM programs ORDER BY id ASC LIMIT 1')->fetch(PDO::FETCH_ASSOC);
    if (!$program) {
        throw new RuntimeException('At least one program is required for this integration test.');
    }

    $suffix = bin2hex(random_bytes(4));
    $graduate2026 = graduation_archive_insert_graduate($db, (int) $program['id'], 2026, false, $suffix);
    $graduate2027 = graduation_archive_insert_graduate($db, (int) $program['id'], 2027, true, $suffix);

    graduation_archive_assert(
        gradtrack_normalize_graduation_years([2026, '2027', 2026, null, '', '2027x', 1899, 2100]) === [2027, 2026],
        'graduation years are validated, de-duplicated, and sorted newest first'
    );

    $activeYears = gradtrack_fetch_graduate_years($db, 'active');
    $archivedYears = gradtrack_fetch_graduate_years($db, 'archived');
    graduation_archive_assert(in_array(2026, $activeYears, true), '2026 is derived from the active graduate dataset');
    graduation_archive_assert(in_array(2027, $archivedYears, true), '2027 is derived from the archived graduate dataset');

    $forumStmt = $db->prepare("INSERT INTO forum_posts
        (graduate_id, title, content, category, status)
        VALUES (:graduate_id, :title, 'Integration test content', 'Career Advice', 'approved')");
    $forumStmt->execute([':graduate_id' => $graduate2027, ':title' => 'Year 2027 ' . $suffix]);
    $forumPostId = (int) $db->lastInsertId();

    $roomStmt = $db->prepare("INSERT INTO forum_chat_rooms (created_by, name, is_group)
                              VALUES (:created_by, :name, :is_group)");
    $roomStmt->execute([':created_by' => $graduate2027, ':name' => 'Shared ' . $suffix, ':is_group' => 1]);
    $sharedRoomId = (int) $db->lastInsertId();
    $roomStmt->execute([':created_by' => $graduate2027, ':name' => 'Solo ' . $suffix, ':is_group' => 1]);
    $soloRoomId = (int) $db->lastInsertId();
    $memberStmt = $db->prepare('INSERT INTO forum_chat_members (room_id, graduate_id) VALUES (:room_id, :graduate_id)');
    $memberStmt->execute([':room_id' => $sharedRoomId, ':graduate_id' => $graduate2027]);
    $memberStmt->execute([':room_id' => $sharedRoomId, ':graduate_id' => $graduate2026]);
    $memberStmt->execute([':room_id' => $soloRoomId, ':graduate_id' => $graduate2027]);

    $surveyStmt = $db->prepare("INSERT INTO surveys
        (title, description, status, archived_at, status_before_archive)
        VALUES (:title, 'Integration test', 'inactive', NOW(), 'draft')");
    $surveyStmt->execute([':title' => 'Graduation year integration ' . $suffix]);
    $surveyId = (int) $db->lastInsertId();

    $questionStmt = $db->prepare("INSERT INTO survey_questions
        (survey_id, section, question_text, question_type, is_required, sort_order)
        VALUES (:survey_id, 'Profile', 'Year Graduated', 'text', 1, 1)");
    $questionStmt->execute([':survey_id' => $surveyId]);
    $questionId = (int) $db->lastInsertId();

    $responseStmt = $db->prepare('INSERT INTO survey_responses
        (survey_id, graduate_id, responses, submitted_at)
        VALUES (:survey_id, :graduate_id, :responses, NOW())');
    $responseStmt->execute([
        ':survey_id' => $surveyId,
        ':graduate_id' => $graduate2027,
        ':responses' => json_encode([(string) $questionId => '2027']),
    ]);
    $responseId = (int) $db->lastInsertId();

    $filterOptions = getOverviewFilterOptions($db, $surveyId, null);
    graduation_archive_assert(in_array('2027', $filterOptions['years'], true), 'reports derive 2027 from the selected survey response data');
    $details = getReportResponseDetails(getSurveyResponses($db, $surveyId)[0], getSurveyQuestions($db, $surveyId));
    graduation_archive_assert(
        responseMatchesOverviewFilters($details, ['graduation_year' => '2027']),
        'the reports graduation-year filter matches the parsed canonical response year'
    );
    graduation_archive_assert(
        !responseMatchesOverviewFilters($details, ['graduation_year' => '2026']),
        'the reports graduation-year filter excludes a different year'
    );

    graduation_archive_expect_status(
        static fn () => gradtrack_permanently_delete_graduate($db, $graduate2026),
        409,
        'permanent deletion rejects an active graduate'
    );

    $deleteGraduateResult = gradtrack_permanently_delete_graduate($db, $graduate2027);
    graduation_archive_assert(
        (int) $deleteGraduateResult['preserved_response_count'] === 1,
        'graduate deletion preserves and detaches historical survey responses'
    );
    $graduateCheck = $db->prepare('SELECT COUNT(*) FROM graduates WHERE id = :id');
    $graduateCheck->execute([':id' => $graduate2027]);
    graduation_archive_assert((int) $graduateCheck->fetchColumn() === 0, 'archived graduate is truly deleted from the database');
    $forumCheck = $db->prepare('SELECT COUNT(*) FROM forum_posts WHERE id = :id');
    $forumCheck->execute([':id' => $forumPostId]);
    graduation_archive_assert((int) $forumCheck->fetchColumn() === 0, 'graduate-owned forum post follows the inspected foreign-key cascade');
    $roomCheck = $db->prepare('SELECT created_by FROM forum_chat_rooms WHERE id = :id');
    $roomCheck->execute([':id' => $sharedRoomId]);
    graduation_archive_assert((int) $roomCheck->fetchColumn() === $graduate2026, 'shared chat room ownership is reassigned to a remaining member');
    $roomCheck->execute([':id' => $soloRoomId]);
    graduation_archive_assert($roomCheck->fetchColumn() === false, 'empty graduate-owned chat room follows the inspected foreign-key cascade');
    $responseCheck = $db->prepare('SELECT graduate_id FROM survey_responses WHERE id = :id');
    $responseCheck->execute([':id' => $responseId]);
    graduation_archive_assert($responseCheck->fetchColumn() === null, 'preserved historical response no longer references the deleted graduate');
    $historicalOptions = getOverviewFilterOptions($db, $surveyId, null);
    graduation_archive_assert(in_array('2027', $historicalOptions['years'], true), 'reports retain 2027 after its graduate record is permanently deleted');

    graduation_archive_expect_status(
        static fn () => gradtrack_permanently_delete_survey($db, $surveyId + 1000000000),
        404,
        'permanent survey deletion reports a missing record'
    );
    $deleteSurveyResult = gradtrack_permanently_delete_survey($db, $surveyId);
    graduation_archive_assert((int) $deleteSurveyResult['record']['id'] === $surveyId, 'archived survey permanent deletion succeeds');
    $surveyCheck = $db->prepare('SELECT COUNT(*) FROM surveys WHERE id = :id');
    $surveyCheck->execute([':id' => $surveyId]);
    graduation_archive_assert((int) $surveyCheck->fetchColumn() === 0, 'survey is truly deleted from the database');
    $responseCheck->execute([':id' => $responseId]);
    graduation_archive_assert($responseCheck->fetchColumn() === false, 'survey response is removed with its parent survey');

    $registryStmt = $db->prepare("INSERT INTO registered_alumni
        (full_name, normalized_name, course_id, course_name, course_code, batch_year, registration_status, archived_at)
        VALUES (:full_name, :normalized_name, :course_id, :course_name, :course_code, 2027, 'Unclaimed', :archived_at)");
    $registryStmt->execute([
        ':full_name' => 'Registry Test ' . $suffix,
        ':normalized_name' => 'registry test ' . $suffix,
        ':course_id' => (int) $program['id'],
        ':course_name' => (string) $program['name'],
        ':course_code' => (string) $program['code'],
        ':archived_at' => null,
    ]);
    $registryId = (int) $db->lastInsertId();
    graduation_archive_expect_status(
        static fn () => gradtrack_permanently_delete_registered_alumni($db, $registryId),
        409,
        'permanent deletion rejects an active alumni registry record'
    );
    $db->prepare('UPDATE registered_alumni SET archived_at = NOW() WHERE id = :id')->execute([':id' => $registryId]);
    gradtrack_permanently_delete_registered_alumni($db, $registryId);
    $registryCheck = $db->prepare('SELECT COUNT(*) FROM registered_alumni WHERE id = :id');
    $registryCheck->execute([':id' => $registryId]);
    graduation_archive_assert((int) $registryCheck->fetchColumn() === 0, 'archived alumni registry record is truly deleted');
} catch (Throwable $error) {
    graduation_archive_assert(false, 'integration test completed without an exception: ' . $error->getMessage());
} finally {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
}

graduation_archive_assert(!$db->inTransaction(), 'all integration fixtures were rolled back');

if ($failures > 0) {
    echo PHP_EOL . $failures . ' graduation/archive integration test(s) failed.' . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All graduation year and permanent-delete integration tests passed.' . PHP_EOL;
