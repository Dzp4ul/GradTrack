<?php
declare(strict_types=1);

return static function (PDO $db): void {
    $count = static function (string $sql) use ($db): int {
        return (int)$db->query($sql)->fetchColumn();
    };
    $indexExists = static function (string $table, string $index) use ($db): bool {
        $statement = $db->prepare(
            'SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND INDEX_NAME = :index_name'
        );
        $statement->execute([':table' => $table, ':index_name' => $index]);
        return (int)$statement->fetchColumn() > 0;
    };
    $foreignKeyExists = static function (string $table, string $constraint) use ($db): bool {
        $statement = $db->prepare(
            'SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = :table
               AND CONSTRAINT_NAME = :constraint_name AND CONSTRAINT_TYPE = \'FOREIGN KEY\''
        );
        $statement->execute([':table' => $table, ':constraint_name' => $constraint]);
        return (int)$statement->fetchColumn() > 0;
    };

    if ($count('SELECT COUNT(*) FROM surveys WHERE template_id IS NULL') > 0) {
        throw new RuntimeException('Cannot enforce survey template integrity: an unversioned survey still exists.');
    }
    if ($count('SELECT COUNT(*) FROM survey_responses WHERE survey_version_id IS NULL OR survey_version_id <> survey_id') > 0) {
        throw new RuntimeException('Cannot enforce response version integrity: a response has no matching survey version.');
    }
    if ($count("SELECT COUNT(*) FROM survey_questions WHERE question_key IS NULL OR question_key = ''") > 0) {
        throw new RuntimeException('Cannot enforce question identity: a survey question has no stable key.');
    }
    if ($count(
        'SELECT COUNT(*) FROM (
            SELECT survey_id, sort_order FROM survey_questions
            GROUP BY survey_id, sort_order HAVING COUNT(*) > 1
         ) duplicate_orders'
    ) > 0) {
        throw new RuntimeException('Cannot enforce question ordering: duplicate display orders exist in a survey version.');
    }

    if ($foreignKeyExists('surveys', 'fk_surveys_template')) {
        $db->exec('ALTER TABLE surveys DROP FOREIGN KEY fk_surveys_template');
    }
    $db->exec('ALTER TABLE surveys MODIFY template_id INT NOT NULL');
    if (!$foreignKeyExists('surveys', 'fk_surveys_template')) {
        $db->exec(
            'ALTER TABLE surveys ADD CONSTRAINT fk_surveys_template
             FOREIGN KEY (template_id) REFERENCES survey_templates(id) ON DELETE RESTRICT'
        );
    }

    if ($foreignKeyExists('survey_responses', 'fk_survey_responses_version')) {
        $db->exec('ALTER TABLE survey_responses DROP FOREIGN KEY fk_survey_responses_version');
    }
    $db->exec('ALTER TABLE survey_responses MODIFY survey_version_id INT NOT NULL');
    if (!$foreignKeyExists('survey_responses', 'fk_survey_responses_version')) {
        $db->exec(
            'ALTER TABLE survey_responses ADD CONSTRAINT fk_survey_responses_version
             FOREIGN KEY (survey_version_id) REFERENCES surveys(id) ON DELETE RESTRICT'
        );
    }
    $db->exec('ALTER TABLE survey_questions MODIFY question_key CHAR(36) NOT NULL');

    if (!$indexExists('survey_questions', 'uq_survey_question_order')) {
        $db->exec(
            'ALTER TABLE survey_questions
             ADD UNIQUE KEY uq_survey_question_order (survey_id, sort_order)'
        );
    }
    if (!$foreignKeyExists('survey_templates', 'fk_survey_templates_current_version')) {
        $db->exec(
            'ALTER TABLE survey_templates
             ADD CONSTRAINT fk_survey_templates_current_version
             FOREIGN KEY (current_version_id) REFERENCES surveys(id) ON DELETE SET NULL'
        );
    }
};
