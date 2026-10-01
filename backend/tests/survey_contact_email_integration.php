<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/survey_versioning.php';
require_once __DIR__ . '/../api/config/survey_contact_email.php';
require_once __DIR__ . '/../api/config/survey_validation.php';

function survey_contact_email_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
    echo 'PASS: ' . $message . PHP_EOL;
}

function survey_contact_email_create_graduate(PDO $db, string $suffix, string $label, ?string $email): int
{
    $stmt = $db->prepare("INSERT INTO graduates
        (student_id, first_name, last_name, email, year_graduated, status)
        VALUES (:student_id, 'Similar', :last_name, :email, 2025, 'active')");
    $stmt->execute([
        ':student_id' => 'EMAIL-' . $label . '-' . $suffix,
        ':last_name' => 'Name',
        ':email' => $email,
    ]);
    return (int) $db->lastInsertId();
}

function survey_contact_email_create_response(
    PDO $db,
    int $surveyId,
    int $graduateId,
    int $questionId,
    string $questionKey,
    ?string $email,
    string $submittedAt = '2026-10-01 12:00:00'
): int {
    $responses = $email === null ? [] : [(string) $questionId => $email];
    $stmt = $db->prepare('INSERT INTO survey_responses
        (survey_id, survey_version_id, graduate_id, responses, submitted_at)
        VALUES (:survey_id, :survey_version_id, :graduate_id, :responses, :submitted_at)');
    $stmt->execute([
        ':survey_id' => $surveyId,
        ':survey_version_id' => $surveyId,
        ':graduate_id' => $graduateId,
        ':responses' => json_encode($responses, JSON_THROW_ON_ERROR),
        ':submitted_at' => $submittedAt,
    ]);
    $responseId = (int) $db->lastInsertId();

    if ($email !== null) {
        $answerStmt = $db->prepare('INSERT INTO survey_response_answers
            (survey_response_id, survey_question_id, question_key, source_question_id, is_canonical, answer_value)
            VALUES (:response_id, :question_id, :question_key, :source_question_id, 1, :answer_value)');
        $answerStmt->execute([
            ':response_id' => $responseId,
            ':question_id' => $questionId,
            ':question_key' => $questionKey,
            ':source_question_id' => $questionId,
            ':answer_value' => json_encode($email, JSON_THROW_ON_ERROR),
        ]);
    }

    return $responseId;
}

$db = (new Database())->getConnection();
$db->beginTransaction();

try {
    $suffix = bin2hex(random_bytes(5));
    $templateKey = gradtrack_survey_uuid();
    $questionKey = gradtrack_survey_uuid();

    $templateStmt = $db->prepare("INSERT INTO survey_templates (template_key, title, description)
        VALUES (:template_key, :title, 'Survey email integration fixture')");
    $templateStmt->execute([
        ':template_key' => $templateKey,
        ':title' => 'Survey Email Fixture ' . $suffix,
    ]);
    $templateId = (int) $db->lastInsertId();

    $surveyStmt = $db->prepare("INSERT INTO surveys
        (template_id, version_number, title, description, status, published_at, locked_at)
        VALUES (:template_id, 1, :title, 'Survey email integration fixture', 'inactive', NOW(), NOW())");
    $surveyStmt->execute([
        ':template_id' => $templateId,
        ':title' => 'Survey Email Fixture ' . $suffix,
    ]);
    $surveyId = (int) $db->lastInsertId();

    $questionStmt = $db->prepare("INSERT INTO survey_questions
        (survey_id, question_key, analytics_key, section, question_text, question_type, is_required, sort_order)
        VALUES (:survey_id, :question_key, 'email_address', 'Personal Information',
                'Renamable contact field', 'text', 0, 1)");
    $questionStmt->execute([
        ':survey_id' => $surveyId,
        ':question_key' => $questionKey,
    ]);
    $questionId = (int) $db->lastInsertId();

    survey_contact_email_assert(
        gradtrack_survey_contact_email_normalize('  User@GMAIL.Com  ') === 'user@gmail.com',
        'email normalization trims and lowercases a valid address'
    );
    survey_contact_email_assert(
        gradtrack_survey_contact_email_normalize('not-an-email') === null
        && gradtrack_survey_contact_email_normalize('   ') === null,
        'invalid and blank survey emails are rejected'
    );
    $stableEmailValidation = gradtrack_survey_validate_question_answer([
        'analytics_key' => 'email_address',
        'question_text' => 'Renamable contact field',
        'question_type' => 'text',
        'is_required' => 0,
    ], '  Mixed.Case@Example.COM ');
    survey_contact_email_assert(
        ($stableEmailValidation['is_valid'] ?? false) === true
        && ($stableEmailValidation['value'] ?? null) === 'mixed.case@example.com',
        'stable email_address metadata validates and normalizes email without relying on question label or order'
    );

    $nullEmailGraduate = survey_contact_email_create_graduate($db, $suffix, 'NULL', null);
    $nullEmailResponse = survey_contact_email_create_response(
        $db,
        $surveyId,
        $nullEmailGraduate,
        $questionId,
        $questionKey,
        '  Null.User@Example.COM '
    );
    $nullResult = gradtrack_sync_graduate_email_from_survey_response($db, $nullEmailResponse, $nullEmailGraduate);
    survey_contact_email_assert(
        ($nullResult['updated'] ?? false) === true
        && (string) $db->query('SELECT email FROM graduates WHERE id = ' . $nullEmailGraduate)->fetchColumn() === 'null.user@example.com',
        'Test 1: a null graduate email is synchronized from its linked valid survey answer'
    );

    $emptyEmailGraduate = survey_contact_email_create_graduate($db, $suffix, 'EMPTY', '');
    $emptyEmailResponse = survey_contact_email_create_response(
        $db,
        $surveyId,
        $emptyEmailGraduate,
        $questionId,
        $questionKey,
        'empty.user@example.com'
    );
    gradtrack_sync_graduate_email_from_survey_response($db, $emptyEmailResponse, $emptyEmailGraduate);
    survey_contact_email_assert(
        (string) $db->query('SELECT email FROM graduates WHERE id = ' . $emptyEmailGraduate)->fetchColumn() === 'empty.user@example.com',
        'Test 2: an empty graduate email is synchronized from its linked valid survey answer'
    );

    $sameEmailGraduate = survey_contact_email_create_graduate($db, $suffix, 'SAME', 'existing.' . $suffix . '@example.com');
    $sameEmailResponse = survey_contact_email_create_response(
        $db,
        $surveyId,
        $sameEmailGraduate,
        $questionId,
        $questionKey,
        'EXISTING.' . strtoupper($suffix) . '@EXAMPLE.COM'
    );
    $sameResult = gradtrack_sync_graduate_email_from_survey_response($db, $sameEmailResponse, $sameEmailGraduate);
    survey_contact_email_assert(
        ($sameResult['status'] ?? '') === 'already_same',
        'Test 3: the same existing email does not cause a duplicate update'
    );

    $differentEmailGraduate = survey_contact_email_create_graduate($db, $suffix, 'KEEP', 'official.' . $suffix . '@example.com');
    $differentEmailResponse = survey_contact_email_create_response(
        $db,
        $surveyId,
        $differentEmailGraduate,
        $questionId,
        $questionKey,
        'survey.' . $suffix . '@example.com'
    );
    $differentResult = gradtrack_sync_graduate_email_from_survey_response($db, $differentEmailResponse, $differentEmailGraduate);
    survey_contact_email_assert(
        ($differentResult['status'] ?? '') === 'kept_existing'
        && (string) $db->query('SELECT email FROM graduates WHERE id = ' . $differentEmailGraduate)->fetchColumn() === 'official.' . $suffix . '@example.com',
        'an existing different graduate email is preserved'
    );

    $optionalGraduate = survey_contact_email_create_graduate($db, $suffix, 'OPTIONAL', null);
    $optionalResponse = survey_contact_email_create_response(
        $db,
        $surveyId,
        $optionalGraduate,
        $questionId,
        $questionKey,
        null
    );
    $optionalResult = gradtrack_sync_graduate_email_from_survey_response($db, $optionalResponse, $optionalGraduate);
    survey_contact_email_assert(
        ($optionalResult['status'] ?? '') === 'missing_or_invalid'
        && $db->query('SELECT email FROM graduates WHERE id = ' . $optionalGraduate)->fetchColumn() === null,
        'Test 4: an optional unanswered email remains blank'
    );

    $unansweredGraduate = survey_contact_email_create_graduate($db, $suffix, 'UNANSWERED', null);
    $unansweredMap = gradtrack_survey_contact_email_map($db, $surveyId, [$unansweredGraduate]);
    survey_contact_email_assert(
        !isset($unansweredMap[$unansweredGraduate]),
        'Test 5: a graduate without a submitted response keeps existing behavior'
    );

    $similarA = survey_contact_email_create_graduate($db, $suffix, 'SIMILAR-A', null);
    $similarB = survey_contact_email_create_graduate($db, $suffix, 'SIMILAR-B', null);
    $responseA = survey_contact_email_create_response(
        $db,
        $surveyId,
        $similarA,
        $questionId,
        $questionKey,
        'first.' . $suffix . '@example.com'
    );
    $responseB = survey_contact_email_create_response(
        $db,
        $surveyId,
        $similarB,
        $questionId,
        $questionKey,
        'second.' . $suffix . '@example.com'
    );
    $wrongIdentityResult = gradtrack_sync_graduate_email_from_survey_response($db, $responseA, $similarB);
    $similarMap = gradtrack_survey_contact_email_map($db, $surveyId, [$similarA, $similarB]);
    survey_contact_email_assert(
        ($wrongIdentityResult['status'] ?? '') === 'missing_or_invalid'
        && ($similarMap[$similarA] ?? null) === 'first.' . $suffix . '@example.com'
        && ($similarMap[$similarB] ?? null) === 'second.' . $suffix . '@example.com',
        'Test 6: similar names cannot mix emails because response and graduate IDs must match'
    );

    $historicalDisplayEmail = $similarMap[$similarA] ?? null;
    survey_contact_email_assert(
        $historicalDisplayEmail === 'first.' . $suffix . '@example.com',
        'Test 7: an existing submitted response is available through the live API fallback map'
    );

    $newSubmissionResult = gradtrack_sync_graduate_email_from_survey_response($db, $responseB, $similarB);
    survey_contact_email_assert(
        ($newSubmissionResult['updated'] ?? false) === true
        && (string) $db->query('SELECT email FROM graduates WHERE id = ' . $similarB)->fetchColumn() === 'second.' . $suffix . '@example.com',
        'Test 8: the survey submission hook immediately synchronizes a new valid email'
    );

    echo PHP_EOL . 'All survey contact email integration checks passed.' . PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, 'FAIL: ' . $error->getMessage() . PHP_EOL);
    $exitCode = 1;
} finally {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
}

exit($exitCode ?? 0);
