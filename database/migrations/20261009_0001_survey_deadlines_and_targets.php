<?php
declare(strict_types=1);

return static function (PDO $db): void {
    if (!gradtrack_migration_table_exists($db, 'surveys')) {
        throw new RuntimeException('Required baseline table surveys is missing.');
    }
    if (!gradtrack_migration_table_exists($db, 'survey_responses')) {
        throw new RuntimeException('Required baseline table survey_responses is missing.');
    }
    if (!gradtrack_migration_table_exists($db, 'programs')) {
        throw new RuntimeException('Required baseline table programs is missing.');
    }

    // Refuse before any DDL is attempted. Existing responses are never merged,
    // deleted, or silently re-assigned by this migration.
    $duplicatePairs = (int) $db->query(
        'SELECT COUNT(*) FROM (
            SELECT survey_id, graduate_id
              FROM survey_responses
             WHERE survey_id IS NOT NULL AND graduate_id IS NOT NULL
             GROUP BY survey_id, graduate_id
            HAVING COUNT(*) > 1
        ) duplicate_pairs'
    )->fetchColumn();
    if ($duplicatePairs > 0) {
        throw new RuntimeException(
            "Cannot enforce one response per graduate: {$duplicatePairs} duplicate survey/graduate pair(s) require review. No response was deleted."
        );
    }

    // Keep the legacy inactive state for manually closed surveys while adding a
    // distinct terminal state for deadline/target/manual completion.
    $db->exec(
        "ALTER TABLE surveys
         MODIFY status ENUM('active','inactive','draft','completed') NOT NULL DEFAULT 'draft'"
    );

    gradtrack_migration_add_column(
        $db,
        'surveys',
        'deadline_at',
        '`deadline_at` DATETIME NULL AFTER `locked_at`'
    );
    gradtrack_migration_add_column(
        $db,
        'surveys',
        'target_type',
        "`target_type` ENUM('none','total','program') NOT NULL DEFAULT 'none' AFTER `deadline_at`"
    );
    gradtrack_migration_add_column(
        $db,
        'surveys',
        'total_response_target',
        '`total_response_target` INT UNSIGNED NULL AFTER `target_type`'
    );
    gradtrack_migration_add_column(
        $db,
        'surveys',
        'completion_reason',
        '`completion_reason` VARCHAR(50) NULL AFTER `total_response_target`'
    );
    gradtrack_migration_add_column(
        $db,
        'surveys',
        'completed_at',
        '`completed_at` DATETIME NULL AFTER `completion_reason`'
    );
    gradtrack_migration_add_column(
        $db,
        'surveys',
        'target_completion_suppressed',
        '`target_completion_suppressed` TINYINT(1) NOT NULL DEFAULT 0 AFTER `completed_at`'
    );
    gradtrack_migration_add_column(
        $db,
        'surveys',
        'reactivated_at',
        '`reactivated_at` DATETIME NULL AFTER `target_completion_suppressed`'
    );
    gradtrack_migration_add_column(
        $db,
        'surveys',
        'reactivated_by',
        '`reactivated_by` INT NULL AFTER `reactivated_at`'
    );
    gradtrack_migration_add_column(
        $db,
        'surveys',
        'reactivation_reason',
        '`reactivation_reason` VARCHAR(500) NULL AFTER `reactivated_by`'
    );

    if (!gradtrack_migration_table_exists($db, 'survey_program_targets')) {
        $db->exec(
            'CREATE TABLE survey_program_targets (
                id INT NOT NULL AUTO_INCREMENT,
                survey_id INT NOT NULL,
                program_id INT NOT NULL,
                target_responses INT UNSIGNED NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_survey_program_target (survey_id, program_id),
                KEY idx_survey_program_targets_program (program_id),
                CONSTRAINT fk_survey_program_targets_survey
                    FOREIGN KEY (survey_id) REFERENCES surveys (id) ON DELETE CASCADE,
                CONSTRAINT fk_survey_program_targets_program
                    FOREIGN KEY (program_id) REFERENCES programs (id) ON DELETE RESTRICT,
                CONSTRAINT chk_survey_program_target_positive CHECK (target_responses > 0)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
    }

    $deadlineIndex = $db->prepare(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'surveys'
            AND INDEX_NAME = 'idx_surveys_active_deadline'"
    );
    $deadlineIndex->execute();
    if ((int) $deadlineIndex->fetchColumn() === 0) {
        $db->exec('ALTER TABLE surveys ADD KEY idx_surveys_active_deadline (status, deadline_at, archived_at)');
    }

    $responseUniqueIndex = $db->prepare(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'survey_responses'
            AND INDEX_NAME = 'uq_survey_responses_survey_graduate'"
    );
    $responseUniqueIndex->execute();
    if ((int) $responseUniqueIndex->fetchColumn() === 0) {
        $db->exec(
            'ALTER TABLE survey_responses
             ADD UNIQUE KEY uq_survey_responses_survey_graduate (survey_id, graduate_id)'
        );
    }
};
