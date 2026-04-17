<?php
header('Content-Type: application/json');

require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();

$nameExtensionOptions = json_encode(['Jr.', 'Sr.', 'II', 'III', 'IV', 'V', 'VI']);

try {
    $db->beginTransaction();

    $surveyStmt = $db->query('SELECT id, title FROM surveys ORDER BY id ASC');
    $surveys = $surveyStmt->fetchAll(PDO::FETCH_ASSOC);

    $updated = [];
    $skipped = [];

    foreach ($surveys as $survey) {
        $surveyId = (int) $survey['id'];
        $surveyTitle = (string) ($survey['title'] ?? 'Untitled Survey');

        $existsStmt = $db->prepare(
            'SELECT id FROM survey_questions
             WHERE survey_id = :survey_id
               AND LOWER(REPLACE(REPLACE(question_text, ".", ""), "  ", " ")) LIKE :needle
             LIMIT 1'
        );
        $existsStmt->execute([
            ':survey_id' => $surveyId,
            ':needle' => '%name extension%',
        ]);

        if ($existsStmt->fetch(PDO::FETCH_ASSOC)) {
            $skipped[] = [
                'survey_id' => $surveyId,
                'title' => $surveyTitle,
                'reason' => 'already_has_name_extension',
            ];
            continue;
        }

        $middleNameStmt = $db->prepare(
            'SELECT sort_order, section
             FROM survey_questions
             WHERE survey_id = :survey_id
               AND LOWER(question_text) LIKE :needle
             ORDER BY sort_order ASC, id ASC
             LIMIT 1'
        );
        $middleNameStmt->execute([
            ':survey_id' => $surveyId,
            ':needle' => '%middle name%',
        ]);
        $middleNameQuestion = $middleNameStmt->fetch(PDO::FETCH_ASSOC);

        $insertSort = null;
        $insertSection = null;

        if ($middleNameQuestion) {
            $insertSort = (int) $middleNameQuestion['sort_order'] + 1;
            $insertSection = $middleNameQuestion['section'];
        } else {
            $nameAnchorStmt = $db->prepare(
                'SELECT MAX(sort_order) AS max_sort, MAX(section) AS section
                 FROM survey_questions
                 WHERE survey_id = :survey_id
                   AND (
                        LOWER(question_text) LIKE :last_name
                        OR LOWER(question_text) LIKE :first_name
                   )'
            );
            $nameAnchorStmt->execute([
                ':survey_id' => $surveyId,
                ':last_name' => '%last name%',
                ':first_name' => '%first name%',
            ]);
            $nameAnchor = $nameAnchorStmt->fetch(PDO::FETCH_ASSOC);

            if ($nameAnchor && $nameAnchor['max_sort'] !== null) {
                $insertSort = (int) $nameAnchor['max_sort'] + 1;
                $insertSection = $nameAnchor['section'];
            } else {
                $maxSortStmt = $db->prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM survey_questions WHERE survey_id = :survey_id');
                $maxSortStmt->execute([':survey_id' => $surveyId]);
                $maxSort = (int) ($maxSortStmt->fetch(PDO::FETCH_ASSOC)['max_sort'] ?? 0);
                $insertSort = $maxSort + 1;
            }
        }

        $shiftSortStmt = $db->prepare(
            'UPDATE survey_questions
             SET sort_order = sort_order + 1
             WHERE survey_id = :survey_id
               AND sort_order >= :insert_sort'
        );
        $shiftSortStmt->execute([
            ':survey_id' => $surveyId,
            ':insert_sort' => $insertSort,
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
                :options,
                :is_required,
                :sort_order
            )'
        );

        $insertStmt->execute([
            ':survey_id' => $surveyId,
            ':section' => $insertSection,
            ':question_text' => 'Name Extension',
            ':question_type' => 'multiple_choice',
            ':options' => $nameExtensionOptions,
            ':is_required' => 0,
            ':sort_order' => $insertSort,
        ]);

        $updated[] = [
            'survey_id' => $surveyId,
            'title' => $surveyTitle,
            'inserted_sort_order' => $insertSort,
        ];
    }

    $db->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Name Extension migration completed.',
        'updated_count' => count($updated),
        'skipped_count' => count($skipped),
        'updated_surveys' => $updated,
        'skipped_surveys' => $skipped,
    ], JSON_PRETTY_PRINT);
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
