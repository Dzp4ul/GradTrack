<?php
declare(strict_types=1);

return static function (PDO $db): void {
    gradtrack_migration_add_column(
        $db,
        'graduates',
        'name_extension',
        'name_extension VARCHAR(20) NULL AFTER last_name'
    );
};
