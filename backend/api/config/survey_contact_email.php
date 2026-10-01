<?php
declare(strict_types=1);

/**
 * Normalize a survey-provided contact email without changing stored answers.
 */
function gradtrack_survey_contact_email_normalize($value): ?string
{
    if (!is_string($value)) {
        return null;
    }

    $email = strtolower(trim($value));
    if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        return null;
    }

    return $email;
}

function gradtrack_survey_contact_email_decode($storedValue): ?string
{
    if ($storedValue === null || $storedValue === false) {
        return null;
    }

    $decoded = json_decode((string) $storedValue, true);
    $value = json_last_error() === JSON_ERROR_NONE ? $decoded : $storedValue;

    return gradtrack_survey_contact_email_normalize($value);
}

/**
 * Resolve the email answer from one submitted response using stable survey
 * metadata. The response-to-graduate foreign key is checked by callers that
 * provide a graduate ID; names are never involved.
 */
function gradtrack_survey_response_contact_email(
    PDO $db,
    int $surveyResponseId,
    ?int $graduateId = null
): ?string {
    if ($surveyResponseId <= 0) {
        return null;
    }

    $whereGraduate = '';
    $params = [':response_id' => $surveyResponseId];
    if ($graduateId !== null) {
        $whereGraduate = ' AND sr.graduate_id = :graduate_id';
        $params[':graduate_id'] = $graduateId;
    }

    $stmt = $db->prepare("SELECT sra.answer_value
        FROM survey_responses sr
        JOIN survey_response_answers sra ON sra.survey_response_id = sr.id
        JOIN survey_questions sq ON sq.id = sra.survey_question_id
        WHERE sr.id = :response_id
          AND sr.submitted_at IS NOT NULL
          {$whereGraduate}
          AND sra.is_canonical = 1
          AND sq.analytics_key = 'email_address'
        ORDER BY sra.id DESC");
    $stmt->execute($params);

    while (($storedValue = $stmt->fetchColumn()) !== false) {
        $email = gradtrack_survey_contact_email_decode($storedValue);
        if ($email !== null) {
            return $email;
        }
    }

    return null;
}

/**
 * Return the latest valid submitted survey email for each requested graduate.
 */
function gradtrack_survey_contact_email_map(
    PDO $db,
    int $surveyId,
    array $graduateIds
): array {
    $graduateIds = array_values(array_unique(array_filter(
        array_map('intval', $graduateIds),
        static fn (int $id): bool => $id > 0
    )));
    if ($surveyId <= 0 || $graduateIds === []) {
        return [];
    }

    $placeholders = [];
    $params = [':survey_id' => $surveyId];
    foreach ($graduateIds as $index => $graduateId) {
        $placeholder = ':graduate_id_' . $index;
        $placeholders[] = $placeholder;
        $params[$placeholder] = $graduateId;
    }

    $stmt = $db->prepare("SELECT sr.graduate_id, sra.answer_value
        FROM survey_responses sr
        JOIN survey_response_answers sra ON sra.survey_response_id = sr.id
        JOIN survey_questions sq ON sq.id = sra.survey_question_id
        WHERE sr.survey_id = :survey_id
          AND sr.graduate_id IN (" . implode(', ', $placeholders) . ")
          AND sr.submitted_at IS NOT NULL
          AND sra.is_canonical = 1
          AND sq.analytics_key = 'email_address'
        ORDER BY sr.graduate_id ASC, sr.submitted_at DESC, sr.id DESC, sra.id DESC");
    $stmt->execute($params);

    $emails = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $graduateId = (int) ($row['graduate_id'] ?? 0);
        if ($graduateId <= 0 || isset($emails[$graduateId])) {
            continue;
        }

        $email = gradtrack_survey_contact_email_decode($row['answer_value'] ?? null);
        if ($email !== null) {
            $emails[$graduateId] = $email;
        }
    }

    return $emails;
}

function gradtrack_graduate_email_column_length(PDO $db): int
{
    static $lengthByConnection = [];
    $connectionId = spl_object_id($db);
    if (isset($lengthByConnection[$connectionId])) {
        return $lengthByConnection[$connectionId];
    }

    try {
        $stmt = $db->query("SELECT CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'graduates'
              AND COLUMN_NAME = 'email'
            LIMIT 1");
        $length = (int) ($stmt ? $stmt->fetchColumn() : 0);
    } catch (Throwable $error) {
        $length = 0;
    }

    $lengthByConnection[$connectionId] = $length > 0 ? $length : 100;
    return $lengthByConnection[$connectionId];
}

/**
 * Fill a blank registrar graduate contact email. Existing non-empty values and
 * emails already assigned to another graduate are deliberately left untouched.
 */
function gradtrack_sync_blank_graduate_email(PDO $db, int $graduateId, $emailValue): array
{
    $email = gradtrack_survey_contact_email_normalize($emailValue);
    if ($graduateId <= 0 || $email === null) {
        return ['status' => 'missing_or_invalid', 'email' => null, 'updated' => false];
    }
    if (strlen($email) > gradtrack_graduate_email_column_length($db)) {
        return ['status' => 'too_long', 'email' => $email, 'updated' => false];
    }

    try {
        $graduateStmt = $db->prepare('SELECT email FROM graduates WHERE id = :graduate_id LIMIT 1');
        $graduateStmt->execute([':graduate_id' => $graduateId]);
        $storedEmail = $graduateStmt->fetchColumn();
        if ($storedEmail === false) {
            return ['status' => 'graduate_not_found', 'email' => $email, 'updated' => false];
        }

        $existingEmail = trim((string) ($storedEmail ?? ''));
        if ($existingEmail !== '') {
            $status = strtolower($existingEmail) === $email ? 'already_same' : 'kept_existing';
            return ['status' => $status, 'email' => $email, 'updated' => false];
        }

        $conflictStmt = $db->prepare('SELECT id
            FROM graduates
            WHERE id <> :graduate_id
              AND email IS NOT NULL
              AND LOWER(TRIM(email)) = :email
            LIMIT 1');
        $conflictStmt->execute([
            ':graduate_id' => $graduateId,
            ':email' => $email,
        ]);
        if ($conflictStmt->fetchColumn() !== false) {
            return ['status' => 'email_in_use', 'email' => $email, 'updated' => false];
        }

        $updateStmt = $db->prepare("UPDATE graduates
            SET email = :email
            WHERE id = :graduate_id
              AND (email IS NULL OR TRIM(email) = '')");
        $updateStmt->execute([
            ':email' => $email,
            ':graduate_id' => $graduateId,
        ]);

        return [
            'status' => $updateStmt->rowCount() === 1 ? 'updated' : 'unchanged',
            'email' => $email,
            'updated' => $updateStmt->rowCount() === 1,
        ];
    } catch (Throwable $error) {
        error_log('[GradTrack] Survey contact email synchronization failed for graduate ID '
            . $graduateId . ': ' . $error->getMessage());
        return ['status' => 'sync_failed', 'email' => $email, 'updated' => false];
    }
}

/**
 * Synchronize only when the response is actually linked to this graduate.
 * Failures are reported but never thrown so a saved survey is not duplicated by
 * a retry solely because contact synchronization failed.
 */
function gradtrack_sync_graduate_email_from_survey_response(
    PDO $db,
    int $surveyResponseId,
    int $graduateId
): array {
    try {
        $email = gradtrack_survey_response_contact_email($db, $surveyResponseId, $graduateId);
        return gradtrack_sync_blank_graduate_email($db, $graduateId, $email);
    } catch (Throwable $error) {
        error_log('[GradTrack] Unable to resolve survey contact email for response ID '
            . $surveyResponseId . ': ' . $error->getMessage());
        return ['status' => 'sync_failed', 'email' => null, 'updated' => false];
    }
}
