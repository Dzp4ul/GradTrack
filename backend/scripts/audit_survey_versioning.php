<?php

require_once __DIR__ . '/../api/config/database.php';

$db = (new Database())->getConnection();
if (in_array('--summary', $argv ?? [], true)) {
    $rawNumericAnswers = 0;
    foreach ($db->query('SELECT responses FROM survey_responses') as $row) {
        $decoded = json_decode((string)$row['responses'], true);
        if (!is_array($decoded)) continue;
        foreach (array_keys($decoded) as $key) {
            if (ctype_digit((string)$key)) $rawNumericAnswers++;
        }
    }
    $summary = [
        'survey_templates' => (int)$db->query('SELECT COUNT(*) FROM survey_templates')->fetchColumn(),
        'survey_versions' => (int)$db->query('SELECT COUNT(*) FROM surveys')->fetchColumn(),
        'survey_questions' => (int)$db->query('SELECT COUNT(*) FROM survey_questions')->fetchColumn(),
        'questions_with_stable_key' => (int)$db->query("SELECT COUNT(*) FROM survey_questions WHERE question_key IS NOT NULL AND question_key <> ''")->fetchColumn(),
        'questions_with_analytics_key' => (int)$db->query("SELECT COUNT(*) FROM survey_questions WHERE analytics_key IS NOT NULL AND analytics_key <> ''")->fetchColumn(),
        'survey_sections' => (int)$db->query('SELECT COUNT(*) FROM survey_sections')->fetchColumn(),
        'survey_question_options' => (int)$db->query('SELECT COUNT(*) FROM survey_question_options')->fetchColumn(),
        'survey_responses' => (int)$db->query('SELECT COUNT(*) FROM survey_responses')->fetchColumn(),
        'versioned_responses' => (int)$db->query('SELECT COUNT(*) FROM survey_responses WHERE survey_version_id = survey_id AND survey_version_id IS NOT NULL')->fetchColumn(),
        'raw_numeric_answers' => $rawNumericAnswers,
        'normalized_answers' => (int)$db->query('SELECT COUNT(*) FROM survey_response_answers')->fetchColumn(),
        'canonical_answers' => (int)$db->query('SELECT COUNT(*) FROM survey_response_answers WHERE is_canonical = 1')->fetchColumn(),
        'preserved_noncanonical_answers' => (int)$db->query('SELECT COUNT(*) FROM survey_response_answers WHERE is_canonical = 0')->fetchColumn(),
    ];
    echo json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
    foreach ($db->query(
        'SELECT s.id, s.template_id, s.version_number, s.based_on_survey_id,
                s.title, s.status, s.created_by, s.created_at,
                COUNT(DISTINCT q.id) AS questions,
                COUNT(DISTINCT r.id) AS responses,
                COUNT(DISTINCT q.analytics_key) AS analytics_keys
         FROM surveys s
         LEFT JOIN survey_questions q ON q.survey_id = s.id
         LEFT JOIN survey_responses r ON r.survey_id = s.id
         GROUP BY s.id ORDER BY s.id'
    ) as $row) {
        echo json_encode($row, JSON_UNESCAPED_UNICODE) . PHP_EOL;
    }
    exit(0);
}
$responseArgument = array_values(array_filter($argv ?? [], static fn (string $argument): bool => str_starts_with($argument, '--response=')));
if ($responseArgument !== []) {
    $responseId = (int)substr($responseArgument[0], strlen('--response='));
    $statement = $db->prepare('SELECT id, survey_id, responses FROM survey_responses WHERE id = :id');
    $statement->execute([':id' => $responseId]);
    $response = $statement->fetch(PDO::FETCH_ASSOC);
    echo json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
    if ($response) {
        $questions = $db->prepare(
            'SELECT id, sort_order, question_key, analytics_key, question_text
             FROM survey_questions WHERE survey_id = :survey_id ORDER BY sort_order, id'
        );
        $questions->execute([':survey_id' => (int)$response['survey_id']]);
        echo json_encode($questions->fetchAll(PDO::FETCH_ASSOC), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
    }
    exit(0);
}
$tables = ['surveys', 'survey_questions', 'survey_responses'];

foreach ($tables as $table) {
    echo PHP_EOL . '[' . $table . ']' . PHP_EOL;
    $statement = $db->prepare(
        'SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION'
    );
    $statement->execute([$table]);
    foreach ($statement as $column) {
        echo implode(' | ', array_values($column)) . PHP_EOL;
    }
    echo 'count=' . $db->query('SELECT COUNT(*) FROM `' . $table . '`')->fetchColumn() . PHP_EOL;
}

echo PHP_EOL . '[SURVEYS]' . PHP_EOL;
foreach ($db->query(
    'SELECT s.id, s.title, s.status, s.archived_at,
            COUNT(DISTINCT q.id) AS questions,
            COUNT(DISTINCT r.id) AS responses
     FROM surveys s
     LEFT JOIN survey_questions q ON q.survey_id = s.id
     LEFT JOIN survey_responses r ON r.survey_id = s.id
     GROUP BY s.id
     ORDER BY s.id'
) as $row) {
    echo json_encode($row, JSON_UNESCAPED_UNICODE) . PHP_EOL;
}

if (in_array('--processes', $argv ?? [], true)) {
    echo PHP_EOL . '[DATABASE PROCESSES]' . PHP_EOL;
    foreach ($db->query('SHOW FULL PROCESSLIST') as $row) {
        echo json_encode($row, JSON_UNESCAPED_UNICODE) . PHP_EOL;
    }
    exit(0);
}

echo PHP_EOL . '[QUESTIONS]' . PHP_EOL;
foreach ($db->query(
    'SELECT id, survey_id, sort_order, section, question_type, is_required, question_text
     FROM survey_questions
     ORDER BY survey_id, sort_order, id'
) as $row) {
    echo json_encode($row, JSON_UNESCAPED_UNICODE) . PHP_EOL;
}

echo PHP_EOL . '[RESPONSE KEY PROFILES]' . PHP_EOL;
foreach ($db->query(
    'SELECT id, survey_id, graduate_id, JSON_LENGTH(responses) AS answer_count,
            LEFT(responses, 250) AS sample
     FROM survey_responses
     ORDER BY id
     LIMIT 10'
) as $row) {
    echo json_encode($row, JSON_UNESCAPED_UNICODE) . PHP_EOL;
}
