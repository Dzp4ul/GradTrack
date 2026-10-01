<?php
declare(strict_types=1);

return static function (PDO $db): void {
    foreach (['surveys', 'programs', 'survey_questions', 'survey_question_options'] as $table) {
        if (!gradtrack_migration_table_exists($db, $table)) {
            throw new RuntimeException("Required table {$table} is missing.");
        }
    }

    $db->exec("CREATE TABLE IF NOT EXISTS survey_programs (
        survey_id INT NOT NULL,
        program_id INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (survey_id, program_id),
        KEY idx_survey_programs_program (program_id),
        CONSTRAINT fk_survey_programs_survey
            FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
        CONSTRAINT fk_survey_programs_program
            FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    require_once __DIR__ . '/../../backend/api/config/survey_program_scope.php';
    $surveyIds = $db->query(
        "SELECT DISTINCT survey_id
         FROM survey_questions
         WHERE analytics_key = 'program' AND is_active = 1
         ORDER BY survey_id"
    )->fetchAll(PDO::FETCH_COLUMN);
    foreach ($surveyIds as $surveyId) {
        $scopeExistsStmt = $db->prepare(
            'SELECT COUNT(*) FROM survey_programs WHERE survey_id = :survey_id'
        );
        $scopeExistsStmt->execute([':survey_id' => (int) $surveyId]);
        if ((int) $scopeExistsStmt->fetchColumn() > 0) {
            continue;
        }
        gradtrack_sync_survey_program_scope(
            $db,
            (int) $surveyId,
            gradtrack_infer_survey_program_ids($db, (int) $surveyId)
        );
    }
};

