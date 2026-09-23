<?php
declare(strict_types=1);

return static function (PDO $db): void {
    gradtrack_migration_add_column(
        $db,
        'survey_questions',
        'introduced_at',
        'introduced_at DATETIME NULL AFTER is_active'
    );
};
