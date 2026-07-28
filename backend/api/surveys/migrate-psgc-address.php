<?php
header('Content-Type: application/json');

require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();

function psgc_migration_normalize($value): string
{
    $text = strtolower(trim((string) ($value ?? '')));
    $text = preg_replace('/[^a-z0-9]+/', ' ', $text);
    return trim((string) $text);
}

function psgc_migration_column_exists(PDO $db, string $table, string $column): bool
{
    $stmt = $db->prepare("SHOW COLUMNS FROM {$table} LIKE :column_name");
    $stmt->execute([':column_name' => $column]);
    return (bool) $stmt->fetch(PDO::FETCH_ASSOC);
}

function psgc_migration_add_column_if_missing(PDO $db, string $column, string $definition): bool
{
    if (psgc_migration_column_exists($db, 'survey_responses', $column)) {
        return false;
    }

    $db->exec("ALTER TABLE survey_responses ADD COLUMN {$column} {$definition}");
    return true;
}

function psgc_migration_find_address_questions(array $questions): array
{
    $map = [];

    foreach ($questions as $question) {
        $label = psgc_migration_normalize($question['question_text'] ?? '');

        if (!isset($map['region']) && preg_match('/\bregion\b/', $label)) {
            $map['region'] = $question;
        } elseif (!isset($map['province']) && preg_match('/\bprovince\b/', $label)) {
            $map['province'] = $question;
        } elseif (!isset($map['city_municipality']) && (preg_match('/\bcity\b/', $label) || preg_match('/\bmunicipality\b/', $label))) {
            $map['city_municipality'] = $question;
        } elseif (!isset($map['barangay']) && preg_match('/\bbarangay\b/', $label)) {
            $map['barangay'] = $question;
        }
    }

    return $map;
}

function psgc_migration_update_question(PDO $db, array $question): void
{
    $stmt = $db->prepare(
        'UPDATE survey_questions
         SET question_type = :question_type,
             options = NULL,
             is_required = :is_required
         WHERE id = :id'
    );
    $stmt->execute([
        ':question_type' => 'text',
        ':is_required' => 1,
        ':id' => (int) $question['id'],
    ]);
}

function psgc_migration_insert_question_after(PDO $db, int $surveyId, ?string $section, int $anchorSort, string $questionText): array
{
    $insertSort = $anchorSort + 1;

    $shiftStmt = $db->prepare(
        'UPDATE survey_questions
         SET sort_order = sort_order + 1
         WHERE survey_id = :survey_id
           AND sort_order > :anchor_sort'
    );
    $shiftStmt->execute([
        ':survey_id' => $surveyId,
        ':anchor_sort' => $anchorSort,
    ]);

    $insertStmt = $db->prepare(
        'INSERT INTO survey_questions (
            survey_id,
            section,
            question_text,
            question_type,
            options,
            is_required,
            sort_order
        ) VALUES (
            :survey_id,
            :section,
            :question_text,
            :question_type,
            NULL,
            :is_required,
            :sort_order
        )'
    );
    $insertStmt->execute([
        ':survey_id' => $surveyId,
        ':section' => $section,
        ':question_text' => $questionText,
        ':question_type' => 'text',
        ':is_required' => 1,
        ':sort_order' => $insertSort,
    ]);

    return [
        'id' => (int) $db->lastInsertId(),
        'survey_id' => $surveyId,
        'section' => $section,
        'question_text' => $questionText,
        'question_type' => 'text',
        'options' => null,
        'is_required' => 1,
        'sort_order' => $insertSort,
    ];
}

try {
    $addedColumns = [];
    $columnDefinitions = [
        'region_code' => 'VARCHAR(10) NULL',
        'region_name' => 'VARCHAR(120) NULL',
        'province_code' => 'VARCHAR(10) NULL',
        'province_name' => 'VARCHAR(120) NULL',
        'city_municipality_code' => 'VARCHAR(10) NULL',
        'city_municipality_name' => 'VARCHAR(160) NULL',
        'barangay_code' => 'VARCHAR(10) NULL',
        'barangay_name' => 'VARCHAR(160) NULL',
    ];

    foreach ($columnDefinitions as $column => $definition) {
        if (psgc_migration_add_column_if_missing($db, $column, $definition)) {
            $addedColumns[] = $column;
        }
    }

    $surveyStmt = $db->query('SELECT id, title FROM surveys ORDER BY id ASC');
    $surveys = $surveyStmt->fetchAll(PDO::FETCH_ASSOC);

    $updatedSurveys = [];
    $skippedSurveys = [];

    foreach ($surveys as $survey) {
        $surveyId = (int) $survey['id'];
        $questionsStmt = $db->prepare(
            'SELECT id, survey_id, section, question_text, question_type, options, is_required, sort_order
             FROM survey_questions
             WHERE survey_id = :survey_id
             ORDER BY sort_order ASC, id ASC'
        );
        $questionsStmt->execute([':survey_id' => $surveyId]);
        $questions = $questionsStmt->fetchAll(PDO::FETCH_ASSOC);
        $map = psgc_migration_find_address_questions($questions);

        if (!isset($map['region'])) {
            $skippedSurveys[] = [
                'survey_id' => $surveyId,
                'title' => $survey['title'] ?? 'Untitled Survey',
                'reason' => 'no_region_question',
            ];
            continue;
        }

        $changes = [];
        foreach (['region', 'province', 'city_municipality', 'barangay'] as $field) {
            if (isset($map[$field])) {
                psgc_migration_update_question($db, $map[$field]);
            }
        }

        $anchorQuestion = $map['region'];
        foreach ([
            'province' => 'Province',
            'city_municipality' => 'City/Municipality',
            'barangay' => 'Barangay',
        ] as $field => $questionText) {
            if (!isset($map[$field])) {
                $inserted = psgc_migration_insert_question_after(
                    $db,
                    $surveyId,
                    $anchorQuestion['section'] ?? null,
                    (int) $anchorQuestion['sort_order'],
                    $questionText
                );
                $map[$field] = $inserted;
                $changes[] = 'inserted_' . $field;
            }

            $anchorQuestion = $map[$field];
        }

        $updatedSurveys[] = [
            'survey_id' => $surveyId,
            'title' => $survey['title'] ?? 'Untitled Survey',
            'changes' => $changes,
        ];
    }

    echo json_encode([
        'success' => true,
        'message' => 'PSGC address migration completed.',
        'added_columns' => $addedColumns,
        'updated_surveys' => $updatedSurveys,
        'skipped_surveys' => $skippedSurveys,
    ], JSON_PRETTY_PRINT);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
    ], JSON_PRETTY_PRINT);
}
