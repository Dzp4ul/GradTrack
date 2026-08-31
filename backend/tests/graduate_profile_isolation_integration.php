<?php
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/graduate_profile.php';

function profile_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$db = (new Database())->getConnection();
gradtrack_ensure_graduate_profile_table($db);

$profileStmt = $db->query('SELECT gp.*, ga.graduate_id
                           FROM graduate_profiles gp
                           JOIN graduate_accounts ga ON ga.id = gp.graduate_account_id
                           WHERE gp.initialized_from_survey_response_id IS NOT NULL
                           ORDER BY gp.id ASC
                           LIMIT 1');
$profile = $profileStmt->fetch(PDO::FETCH_ASSOC);
profile_test_assert((bool) $profile, 'A survey-initialized graduate profile is required for this integration test.');

$accountId = (int) $profile['graduate_account_id'];
$graduateId = (int) $profile['graduate_id'];
$surveyResponseId = (int) $profile['initialized_from_survey_response_id'];

$surveyStmt = $db->prepare('SELECT * FROM survey_responses WHERE id = :id LIMIT 1');
$surveyStmt->execute([':id' => $surveyResponseId]);
$surveyBefore = $surveyStmt->fetch(PDO::FETCH_ASSOC);
profile_test_assert((bool) $surveyBefore, 'The source survey response was not found.');

$graduateStmt = $db->prepare('SELECT * FROM graduates WHERE id = :id LIMIT 1');
$graduateStmt->execute([':id' => $graduateId]);
$graduateBefore = $graduateStmt->fetch(PDO::FETCH_ASSOC);

$employmentStmt = $db->prepare('SELECT * FROM employment WHERE graduate_id = :graduate_id ORDER BY id ASC');
$employmentStmt->execute([':graduate_id' => $graduateId]);
$employmentBefore = $employmentStmt->fetchAll(PDO::FETCH_ASSOC);

try {
    $db->beginTransaction();

    $updated = gradtrack_editable_profile_update($db, $accountId, [
        'first_name' => $profile['first_name'],
        'middle_name' => $profile['middle_name'],
        'last_name' => $profile['last_name'],
        'phone_number' => $profile['phone_number'],
        'birthday' => $profile['birthday'],
        'civil_status' => $profile['civil_status'],
        'sex_gender' => $profile['sex_gender'],
        'program_course' => $profile['program_course'],
        'graduation_year' => $profile['graduation_year'],
        'current_location' => 'Profile Isolation Test Location',
        'job_title' => 'Senior Software Developer',
        'company_name' => 'XYZ Company',
        'employment_location' => 'Norzagaray, Bulacan',
        'professional_status' => 'Currently Employed',
        'start_date' => '2024-01-15',
    ]);

    profile_test_assert($updated['job_title'] === 'Senior Software Developer', 'The editable profile job title was not updated.');
    profile_test_assert($updated['company_name'] === 'XYZ Company', 'The editable profile company was not updated.');

    $surveyStmt->execute([':id' => $surveyResponseId]);
    $surveyAfter = $surveyStmt->fetch(PDO::FETCH_ASSOC);
    profile_test_assert($surveyAfter === $surveyBefore, 'The original survey response changed during a profile update.');

    $graduateStmt->execute([':id' => $graduateId]);
    $graduateAfter = $graduateStmt->fetch(PDO::FETCH_ASSOC);
    profile_test_assert($graduateAfter === $graduateBefore, 'The graduates master record changed during a profile update.');

    $employmentStmt->execute([':graduate_id' => $graduateId]);
    $employmentAfter = $employmentStmt->fetchAll(PDO::FETCH_ASSOC);
    profile_test_assert($employmentAfter === $employmentBefore, 'Employment/tracer data changed during a profile update.');

    $db->rollBack();

    $restored = gradtrack_editable_profile_find($db, $accountId);
    profile_test_assert($restored !== null && $restored['job_title'] === $profile['job_title'], 'The test profile update did not roll back.');

    echo "Graduate profile isolation integration test passed.\n";
} catch (Throwable $exception) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    fwrite(STDERR, $exception->getMessage() . PHP_EOL);
    exit(1);
}

