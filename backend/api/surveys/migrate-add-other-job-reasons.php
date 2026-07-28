<?php
header('Content-Type: application/json');

require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();

function job_reasons_migration_normalize($value): string
{
    $text = strtolower(trim((string) ($value ?? '')));
    $text = preg_replace('/[^a-z0-9]+/', ' ', $text);
    return trim((string) $text);
}

function job_reasons_migration_has_other_option(array $options): bool
{
    foreach ($options as $option) {
        $normalized = job_reasons_migration_normalize($option);
        if ($normalized === 'other' || $normalized === 'others') {
            return true;
        }
    }

    return false;
}

try {
    $db->beginTransaction();

    $stmt = $db->query(
        "SELECT id, survey_id, question_text, question_type, options
         FROM survey_questions
         WHERE LOWER(question_text) LIKE '%reason%for staying on the job%'
            OR LOWER(question_text) LIKE '%reason%for changing job%'
         ORDER BY survey_id ASC, sort_order ASC, id ASC"
    );
    $questions = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $updated = [];
    $skipped = [];

    $updateStmt = $db->prepare(
        'UPDATE survey_questions
         SET options = :options
         WHERE id = :id'
    );

    foreach ($questions as $question) {
        $questionType = strtolower(trim((string) ($question['question_type'] ?? '')));

        if (!in_array($questionType, ['multiple_choice', 'radio', 'checkbox'], true)) {
            $skipped[] = [
                'id' => (int) $question['id'],
                'survey_id' => (int) $question['survey_id'],
                'reason' => 'not_a_choice_question',
            ];
            continue;
        }

        $decodedOptions = json_decode((string) ($question['options'] ?? ''), true);
        $options = is_array($decodedOptions) ? array_values($decodedOptions) : [];

        if (job_reasons_migration_has_other_option($options)) {
            $skipped[] = [
                'id' => (int) $question['id'],
                'survey_id' => (int) $question['survey_id'],
                'reason' => 'already_has_other',
            ];
            continue;
        }

        $options[] = 'Other:';

        $updateStmt->execute([
            ':id' => (int) $question['id'],
            ':options' => json_encode($options, JSON_UNESCAPED_UNICODE),
        ]);

        $updated[] = [
            'id' => (int) $question['id'],
            'survey_id' => (int) $question['survey_id'],
            'question_text' => $question['question_text'],
        ];
    }

    $db->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Other option added to job reason questions.',
        'updated_count' => count($updated),
        'skipped_count' => count($skipped),
        'updated_questions' => $updated,
        'skipped_questions' => $skipped,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
    ], JSON_PRETTY_PRINT);
}
