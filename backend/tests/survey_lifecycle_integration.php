<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/survey_lifecycle.php';

function lifecycle_assert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
    echo 'PASS: ' . $message . PHP_EOL;
}

$db = (new Database())->getConnection();
$db->beginTransaction();

try {
    $suffix = strtoupper(bin2hex(random_bytes(4)));
    $programInsert = $db->prepare(
        'INSERT INTO programs (name, code, description) VALUES (:name, :code, :description)'
    );
    $programIds = [];
    foreach (['A', 'B', 'EMPTY'] as $programLabel) {
        $programInsert->execute([
            ':name' => "Lifecycle Program {$programLabel} {$suffix}",
            ':code' => "LC{$programLabel}{$suffix}",
            ':description' => 'Survey lifecycle integration fixture',
        ]);
        $programIds[$programLabel] = (int) $db->lastInsertId();
    }

    $graduateInsert = $db->prepare(
        "INSERT INTO graduates
            (student_id, first_name, last_name, email, program_id, year_graduated, status)
         VALUES (:student_id, :first_name, 'Lifecycle', NULL, :program_id, 2026, 'active')"
    );
    $graduates = ['A' => [], 'B' => []];
    foreach (['A', 'B'] as $programLabel) {
        for ($index = 1; $index <= 6; $index++) {
            $graduateInsert->execute([
                ':student_id' => "{$programLabel}{$index}-{$suffix}",
                ':first_name' => "{$programLabel}{$index}",
                ':program_id' => $programIds[$programLabel],
            ]);
            $graduates[$programLabel][] = (int) $db->lastInsertId();
        }
    }

    $createSurvey = static function (
        string $title,
        string $deadline,
        string $targetType = 'none',
        ?int $totalTarget = null
    ) use ($db, $suffix): int {
        $template = $db->prepare(
            'INSERT INTO survey_templates (template_key, title, description)
             VALUES (:template_key, :title, :description)'
        );
        $template->execute([
            ':template_key' => bin2hex(random_bytes(16)),
            ':title' => $title . ' ' . $suffix,
            ':description' => 'Lifecycle integration fixture',
        ]);
        $templateId = (int) $db->lastInsertId();
        $survey = $db->prepare(
            "INSERT INTO surveys
                (template_id, version_number, title, description, status, published_at, locked_at,
                 deadline_at, target_type, total_response_target, created_by, modified_by, modified_at)
             VALUES
                (:template_id, 1, :title, 'Lifecycle integration fixture', 'active', NOW(), NOW(),
                 :deadline_at, :target_type, :total_target, 'integration-test', 'integration-test', NOW())"
        );
        $survey->execute([
            ':template_id' => $templateId,
            ':title' => $title . ' ' . $suffix,
            ':deadline_at' => $deadline,
            ':target_type' => $targetType,
            ':total_target' => $totalTarget,
        ]);
        $surveyId = (int) $db->lastInsertId();
        $db->prepare('UPDATE survey_templates SET current_version_id = :survey_id WHERE id = :template_id')
            ->execute([':survey_id' => $surveyId, ':template_id' => $templateId]);
        return $surveyId;
    };

    $addResponse = static function (int $surveyId, int $graduateId) use ($db): int {
        $stmt = $db->prepare(
            'INSERT INTO survey_responses
                (survey_id, survey_version_id, graduate_id, responses, submitted_at)
             VALUES (:survey_id, :survey_version_id, :graduate_id, JSON_OBJECT(), NOW())'
        );
        $stmt->execute([
            ':survey_id' => $surveyId,
            ':survey_version_id' => $surveyId,
            ':graduate_id' => $graduateId,
        ]);
        return (int) $db->lastInsertId();
    };

    $future = gradtrack_survey_now()->modify('+7 days')->format('Y-m-d H:i:s');
    $past = gradtrack_survey_now()->modify('-1 minute')->format('Y-m-d H:i:s');

    $deadlineSurvey = $createSurvey('Expired deadline', $past);
    $deadlineResult = gradtrack_enforce_survey_completion($db, $deadlineSurvey);
    lifecycle_assert(($deadlineResult['survey']['status'] ?? '') === 'completed', 'an active survey completes when its Philippine deadline passes');
    lifecycle_assert(($deadlineResult['reason'] ?? '') === 'deadline_reached', 'deadline completion records deadline_reached');

    $noTargetSurvey = $createSurvey('Future no target', $future);
    $noTargetResult = gradtrack_enforce_survey_completion($db, $noTargetSurvey);
    lifecycle_assert(($noTargetResult['survey']['status'] ?? '') === 'active', 'a future active survey without a target remains active');

    $totalSurvey = $createSurvey('Total target', $future, 'total', 2);
    $firstTotalResponse = $addResponse($totalSurvey, $graduates['A'][0]);
    $firstTotalResult = gradtrack_enforce_survey_completion($db, $totalSurvey);
    lifecycle_assert(($firstTotalResult['survey']['status'] ?? '') === 'active', 'a total-target survey stays active below target');
    $secondTotalResponse = $addResponse($totalSurvey, $graduates['B'][0]);
    $secondTotalResult = gradtrack_enforce_survey_completion($db, $totalSurvey);
    lifecycle_assert(($secondTotalResult['survey']['status'] ?? '') === 'completed', 'a total-target survey completes at its target');
    lifecycle_assert(($secondTotalResult['reason'] ?? '') === 'target_reached', 'total-target completion records target_reached');

    $duplicateRejected = false;
    try {
        $addResponse($totalSurvey, $graduates['A'][0]);
    } catch (PDOException $exception) {
        $duplicateRejected = $exception->getCode() === '23000';
    }
    lifecycle_assert($duplicateRejected, 'the database unique constraint rejects duplicate graduate submissions');

    $db->prepare(
        "UPDATE surveys
            SET status = 'active', completion_reason = NULL, completed_at = NULL,
                target_completion_suppressed = 1, reactivated_at = NOW(), reactivation_reason = 'Collect more responses'
          WHERE id = :id"
    )->execute([':id' => $totalSurvey]);
    $reopenedResult = gradtrack_enforce_survey_completion($db, $totalSurvey);
    lifecycle_assert(($reopenedResult['survey']['status'] ?? '') === 'active', 'manual reopening suppresses an already-satisfied target');
    $addResponse($totalSurvey, $graduates['A'][1]);
    $reopenedWithExtraResult = gradtrack_enforce_survey_completion($db, $totalSurvey);
    lifecycle_assert(($reopenedWithExtraResult['survey']['status'] ?? '') === 'active', 'a reopened survey does not immediately close after an additional response');

    $responseCountBeforeTargetChange = (int) $db->query(
        "SELECT COUNT(*) FROM survey_responses WHERE survey_id = {$totalSurvey}"
    )->fetchColumn();
    $db->prepare(
        'UPDATE surveys SET total_response_target = 4, target_completion_suppressed = 0 WHERE id = :id'
    )->execute([':id' => $totalSurvey]);
    $increasedTargetResult = gradtrack_enforce_survey_completion($db, $totalSurvey);
    lifecycle_assert(($increasedTargetResult['survey']['status'] ?? '') === 'active', 'increasing a target beyond the current count allows collection to continue');
    $addResponse($totalSurvey, $graduates['B'][1]);
    $increasedTargetReached = gradtrack_enforce_survey_completion($db, $totalSurvey);
    lifecycle_assert(($increasedTargetReached['survey']['status'] ?? '') === 'completed', 'the increased total target completes when newly reached');
    $responseCountAfterTargetChange = (int) $db->query(
        "SELECT COUNT(*) FROM survey_responses WHERE survey_id = {$totalSurvey}"
    )->fetchColumn();
    lifecycle_assert($responseCountAfterTargetChange === $responseCountBeforeTargetChange + 1, 'changing targets preserves every existing response');

    $programSurvey = $createSurvey('Program targets', $future, 'program');
    gradtrack_survey_replace_program_targets($db, $programSurvey, [
        $programIds['A'] => 2,
        $programIds['B'] => 2,
    ]);
    $addResponse($programSurvey, $graduates['A'][2]);
    $addResponse($programSurvey, $graduates['A'][3]);
    $addResponse($programSurvey, $graduates['A'][4]);
    $addResponse($programSurvey, $graduates['B'][2]);
    $unevenResult = gradtrack_enforce_survey_completion($db, $programSurvey);
    lifecycle_assert(($unevenResult['survey']['status'] ?? '') === 'active', 'uneven program responses do not prematurely complete the survey');
    lifecycle_assert((int) ($unevenResult['progress']['target_progress_count'] ?? 0) === 3, 'overall program progress caps each program at its configured target');
    $addResponse($programSurvey, $graduates['B'][3]);
    $programCompleted = gradtrack_enforce_survey_completion($db, $programSurvey);
    lifecycle_assert(($programCompleted['survey']['status'] ?? '') === 'completed', 'a program-target survey completes only after every configured target is reached');
    lifecycle_assert(($programCompleted['reason'] ?? '') === 'program_targets_reached', 'program completion records program_targets_reached');

    $onlyOneProgramSurvey = $createSurvey('Selective program target', $future, 'program');
    gradtrack_survey_replace_program_targets($db, $onlyOneProgramSurvey, [$programIds['A'] => 1]);
    $addResponse($onlyOneProgramSurvey, $graduates['A'][5]);
    $selectiveResult = gradtrack_enforce_survey_completion($db, $onlyOneProgramSurvey);
    lifecycle_assert(($selectiveResult['survey']['status'] ?? '') === 'completed', 'a program without a configured target is not required for completion');

    $invalidDateRejected = false;
    try {
        gradtrack_survey_parse_deadline('2026-02-30T10:00');
    } catch (InvalidArgumentException $exception) {
        $invalidDateRejected = true;
    }
    lifecycle_assert($invalidDateRejected, 'invalid calendar deadlines are rejected');

    $invalidTargetRejected = false;
    try {
        gradtrack_survey_validate_target_configuration($db, [
            'target_type' => 'total',
            'total_response_target' => 0,
        ]);
    } catch (InvalidArgumentException $exception) {
        $invalidTargetRejected = true;
    }
    lifecycle_assert($invalidTargetRejected, 'zero and non-positive response targets are rejected');

    $emptyProgramTargetRejected = false;
    try {
        gradtrack_survey_validate_target_configuration($db, [
            'target_type' => 'program',
            'program_targets' => [[
                'program_id' => $programIds['EMPTY'],
                'target' => 1,
            ]],
        ]);
    } catch (InvalidArgumentException $exception) {
        $emptyProgramTargetRejected = str_contains($exception->getMessage(), 'no active Registrar graduate records');
    }
    lifecycle_assert($emptyProgramTargetRejected, 'program targets reject catalog entries with no active Registrar graduate records');

    lifecycle_assert($firstTotalResponse > 0 && $secondTotalResponse > 0, 'valid response fixtures were stored successfully');
    echo PHP_EOL . 'Survey lifecycle integration test passed.' . PHP_EOL;
    $db->rollBack();
    exit(0);
} catch (Throwable $exception) {
    if ($db->inTransaction()) $db->rollBack();
    fwrite(STDERR, 'FAIL: ' . $exception->getMessage() . PHP_EOL);
    exit(1);
}
