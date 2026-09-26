<?php
declare(strict_types=1);

putenv('FRONTEND_URL=https://grad-track.app');

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/graduate_email_notifications.php';

function graduate_email_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
    echo 'PASS: ' . $message . PHP_EOL;
}

$db = (new Database())->getConnection();
gradtrack_email_notification_ensure_schema($db);
$successEntityId = random_int(1000000000, 1999999999);
$failureEntityId = random_int(2000000000, 2999999999);
$typePrefix = 'test_' . bin2hex(random_bytes(6));
$successType = $typePrefix . '_success';
$failureType = $typePrefix . '_failure';
$surveyRecipientGraduateId = 0;
$surveyRecipientResponseId = 0;

try {
    $surveyUrl = gradtrack_frontend_url() . '/graduate/portal?tab=my_profile';
    $signinUrl = gradtrack_frontend_url() . '/graduate/signin';
    $surveyMessage = gradtrack_email_survey_submitted_message('John Paul Manansala', $surveyUrl, $signinUrl);
    $approvalMessage = gradtrack_email_account_approved_message('John Paul Manansala', $signinUrl);
    $otpMessage = gradtrack_email_password_reset_message('John Paul Manansala', '915795', $signinUrl);

    graduate_email_assert(
        $surveyMessage['subject'] === 'GradTrack – Graduate Tracer Survey Submitted Successfully',
        'survey confirmation uses the required subject'
    );
    graduate_email_assert(
        str_contains($surveyMessage['html'], 'Hello John Paul Manansala,')
        && str_contains($surveyMessage['html'], 'View My Survey')
        && str_contains($surveyMessage['html'], 'https://grad-track.app/graduate/portal?tab=my_profile'),
        'survey email includes the graduate name and configured portal link'
    );
    graduate_email_assert(
        $approvalMessage['subject'] === 'GradTrack – Your Account Registration Has Been Approved'
        && str_contains($approvalMessage['html'], 'Sign In to GradTrack')
        && str_contains($approvalMessage['html'], $signinUrl),
        'approval email includes the required subject and configured sign-in link'
    );
    graduate_email_assert(
        str_contains($otpMessage['html'], 'Password Reset Verification')
        && str_contains($otpMessage['html'], '915795'),
        'password-reset OTP uses the shared GradTrack email layout'
    );
    graduate_email_assert(
        gradtrack_graduate_email_full_name([
            'first_name' => 'John',
            'middle_name' => 'Paul',
            'last_name' => 'Manansala',
            'name_extension' => 'Jr.',
        ]) === 'John Paul Manansala Jr.',
        'graduate notifications use the complete stored name'
    );
    graduate_email_assert(
        !gradtrack_graduate_account_is_approved([
            'account_status' => 'pending_verification',
            'alumni_verification_status' => 'pending',
        ])
        && gradtrack_graduate_account_is_approved([
            'account_status' => 'active',
            'alumni_verification_status' => 'approved',
        ]),
        'approval notification eligibility requires a real transition into the approved state'
    );

    $emailQuestion = $db->query("SELECT id, survey_id, question_key
        FROM survey_questions
        WHERE analytics_key = 'email_address'
        ORDER BY id
        LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    if (!$emailQuestion) {
        throw new RuntimeException('An email survey question is required for the recipient test');
    }

    $recipientSuffix = bin2hex(random_bytes(6));
    $registrarEmail = 'registrar-record-' . $recipientSuffix . '@example.invalid';
    $surveyAnswerEmail = 'survey-answer-' . $recipientSuffix . '@example.invalid';
    $recipientGraduateStmt = $db->prepare("INSERT INTO graduates
        (student_id, first_name, last_name, email, year_graduated, status)
        VALUES (:student_id, 'Survey', 'Recipient', :email, 2025, 'active')");
    $recipientGraduateStmt->execute([
        ':student_id' => 'EMAIL-' . strtoupper($recipientSuffix),
        ':email' => $registrarEmail,
    ]);
    $surveyRecipientGraduateId = (int) $db->lastInsertId();

    $recipientResponseStmt = $db->prepare("INSERT INTO survey_responses
        (survey_id, survey_version_id, graduate_id, responses, submitted_at)
        VALUES (:survey_id, :survey_version_id, :graduate_id, JSON_OBJECT(), NOW())");
    $recipientResponseStmt->execute([
        ':survey_id' => (int) $emailQuestion['survey_id'],
        ':survey_version_id' => (int) $emailQuestion['survey_id'],
        ':graduate_id' => $surveyRecipientGraduateId,
    ]);
    $surveyRecipientResponseId = (int) $db->lastInsertId();

    graduate_email_assert(
        gradtrack_survey_notification_answer_email($db, $surveyRecipientResponseId) === '',
        'survey notification does not fall back to the registrar email when the survey email answer is missing'
    );

    $recipientAnswerStmt = $db->prepare("INSERT INTO survey_response_answers
        (survey_response_id, survey_question_id, question_key, source_question_id, is_canonical, answer_value)
        VALUES (:response_id, :question_id, :question_key, :source_question_id, 1, :answer_value)");
    $recipientAnswerStmt->execute([
        ':response_id' => $surveyRecipientResponseId,
        ':question_id' => (int) $emailQuestion['id'],
        ':question_key' => (string) $emailQuestion['question_key'],
        ':source_question_id' => (int) $emailQuestion['id'],
        ':answer_value' => json_encode($surveyAnswerEmail, JSON_THROW_ON_ERROR),
    ]);
    graduate_email_assert(
        gradtrack_survey_notification_answer_email($db, $surveyRecipientResponseId) === $surveyAnswerEmail,
        'survey confirmation recipient comes from the canonical submitted email answer'
    );

    $successfulSendCount = 0;
    $fakeSuccessfulSender = static function () use (&$successfulSendCount): void {
        $successfulSendCount++;
    };
    $first = gradtrack_email_notification_send_once(
        $db,
        $successType,
        $successEntityId,
        'graduate@example.com',
        'John Paul Manansala',
        $surveyMessage,
        'Test survey notification failed',
        $fakeSuccessfulSender
    );
    $duplicate = gradtrack_email_notification_send_once(
        $db,
        $successType,
        $successEntityId,
        'graduate@example.com',
        'John Paul Manansala',
        $surveyMessage,
        'Test survey notification failed',
        $fakeSuccessfulSender
    );

    graduate_email_assert($first['sent'] === true && $first['attempted'] === true, 'first notification is delivered after reservation');
    graduate_email_assert($duplicate['duplicate'] === true && $duplicate['attempted'] === false, 'duplicate notification is suppressed by database state');
    graduate_email_assert($successfulSendCount === 1, 'duplicate requests invoke the mail transport exactly once');

    $successLogStmt = $db->prepare('SELECT status, sent_at FROM email_notification_deliveries WHERE notification_type = :type AND entity_id = :entity_id');
    $successLogStmt->execute([':type' => $successType, ':entity_id' => $successEntityId]);
    $successLog = $successLogStmt->fetch(PDO::FETCH_ASSOC);
    graduate_email_assert(
        ($successLog['status'] ?? '') === 'sent' && !empty($successLog['sent_at']),
        'successful delivery is recorded for troubleshooting and idempotency'
    );

    $failedSendCount = 0;
    $fakeFailedSender = static function () use (&$failedSendCount): void {
        $failedSendCount++;
        throw new RuntimeException('Simulated SMTP failure');
    };
    $failed = gradtrack_email_notification_send_once(
        $db,
        $failureType,
        $failureEntityId,
        'graduate@example.com',
        'John Paul Manansala',
        $approvalMessage,
        'Registration approved successfully but approval email failed',
        $fakeFailedSender
    );
    $failedRetry = gradtrack_email_notification_send_once(
        $db,
        $failureType,
        $failureEntityId,
        'graduate@example.com',
        'John Paul Manansala',
        $approvalMessage,
        'Registration approved successfully but approval email failed',
        $fakeFailedSender
    );

    graduate_email_assert($failed['attempted'] === true && $failed['sent'] === false, 'mail failure is contained without throwing into the main workflow');
    graduate_email_assert($failedRetry['duplicate'] === true && $failedSendCount === 1, 'a failed delivery is not duplicated by an endpoint retry');

    $failureLogStmt = $db->prepare('SELECT status, error_message FROM email_notification_deliveries WHERE notification_type = :type AND entity_id = :entity_id');
    $failureLogStmt->execute([':type' => $failureType, ':entity_id' => $failureEntityId]);
    $failureLog = $failureLogStmt->fetch(PDO::FETCH_ASSOC);
    graduate_email_assert(
        ($failureLog['status'] ?? '') === 'failed'
        && str_contains((string) ($failureLog['error_message'] ?? ''), 'Simulated SMTP failure'),
        'mail failure reason is recorded in the backend delivery log'
    );

    echo PHP_EOL . 'Graduate email notification tests passed.' . PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, 'FAIL: ' . $error->getMessage() . PHP_EOL);
    $exitCode = 1;
} finally {
    $cleanup = $db->prepare('DELETE FROM email_notification_deliveries WHERE notification_type IN (:success_type, :failure_type)');
    $cleanup->execute([':success_type' => $successType, ':failure_type' => $failureType]);
    if ($surveyRecipientResponseId > 0) {
        $db->prepare('DELETE FROM survey_response_answers WHERE survey_response_id = :response_id')
            ->execute([':response_id' => $surveyRecipientResponseId]);
        $db->prepare('DELETE FROM survey_responses WHERE id = :response_id')
            ->execute([':response_id' => $surveyRecipientResponseId]);
    }
    if ($surveyRecipientGraduateId > 0) {
        $db->prepare('DELETE FROM graduates WHERE id = :graduate_id')
            ->execute([':graduate_id' => $surveyRecipientGraduateId]);
    }
}

exit($exitCode ?? 0);
