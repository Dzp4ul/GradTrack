<?php
declare(strict_types=1);

require_once __DIR__ . '/../../backend/api/config/survey_program_scope.php';

return static function (PDO $db): void {
    if (!gradtrack_migration_table_exists($db, 'survey_question_options')) {
        throw new RuntimeException('Required baseline table survey_question_options is missing.');
    }
    if (!gradtrack_migration_table_exists($db, 'programs')) {
        throw new RuntimeException('Required baseline table programs is missing.');
    }

    gradtrack_migration_add_column(
        $db,
        'survey_question_options',
        'program_id',
        '`program_id` INT NULL AFTER `survey_question_id`'
    );

    $programs = gradtrack_survey_program_master_rows($db);
    $options = $db->query(
        "SELECT sqo.id, sqo.program_id, sqo.option_value, sqo.label
           FROM survey_question_options sqo
           JOIN survey_questions sq ON sq.id = sqo.survey_question_id
          WHERE sq.analytics_key = 'program'
          ORDER BY sqo.id"
    )->fetchAll(PDO::FETCH_ASSOC);
    $update = $db->prepare(
        'UPDATE survey_question_options SET program_id = :program_id WHERE id = :id'
    );
    foreach ($options as $option) {
        $program = gradtrack_match_program_scope_option(
            $programs,
            $option['option_value'] ?? '',
            $option['label'] ?? '',
            $option['program_id'] ?? null
        );
        if ($program === null) continue;
        $update->execute([':program_id' => (int) $program['id'], ':id' => (int) $option['id']]);
    }

    $indexStmt = $db->prepare(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'survey_question_options'
            AND INDEX_NAME = 'idx_survey_question_options_program_id'"
    );
    $indexStmt->execute();
    if ((int) $indexStmt->fetchColumn() === 0) {
        $db->exec(
            'ALTER TABLE survey_question_options
             ADD KEY idx_survey_question_options_program_id (program_id)'
        );
    }

    $constraintStmt = $db->prepare(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
          WHERE CONSTRAINT_SCHEMA = DATABASE()
            AND TABLE_NAME = 'survey_question_options'
            AND CONSTRAINT_NAME = 'fk_survey_question_options_program'"
    );
    $constraintStmt->execute();
    if ((int) $constraintStmt->fetchColumn() === 0) {
        $db->exec(
            'ALTER TABLE survey_question_options
             ADD CONSTRAINT fk_survey_question_options_program
             FOREIGN KEY (program_id) REFERENCES programs (id)
             ON DELETE SET NULL'
        );
    }
};
