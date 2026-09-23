<?php
declare(strict_types=1);

return static function (PDO $db): void {
    gradtrack_migration_add_column(
        $db,
        'survey_questions',
        'retired_at',
        'retired_at DATETIME NULL AFTER is_active'
    );

    // Preserve a reasonable historical boundary if a database already contains
    // inactive questions from an earlier deployment.
    $db->exec(
        'UPDATE survey_questions
         SET retired_at = COALESCE(retired_at, updated_at, created_at, NOW())
         WHERE is_active = 0 AND retired_at IS NULL'
    );
};
