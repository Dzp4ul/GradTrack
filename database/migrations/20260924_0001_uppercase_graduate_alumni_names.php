<?php
declare(strict_types=1);

return static function (PDO $db): void {
    if (gradtrack_migration_table_exists($db, 'graduates')) {
        $assignments = [];
        foreach (['first_name', 'middle_name', 'last_name', 'name_extension'] as $column) {
            if (gradtrack_migration_column_exists($db, 'graduates', $column)) {
                $assignments[] = "`{$column}` = UPPER(TRIM(`{$column}`))";
            }
        }
        if ($assignments !== []) {
            $db->exec('UPDATE graduates SET ' . implode(', ', $assignments));
        }
    }

    if (gradtrack_migration_table_exists($db, 'registered_alumni')) {
        $db->exec('UPDATE registered_alumni SET full_name = UPPER(TRIM(full_name))');
    }

    if (gradtrack_migration_table_exists($db, 'graduate_profiles')) {
        $assignments = [];
        foreach (['first_name', 'middle_name', 'last_name'] as $column) {
            if (gradtrack_migration_column_exists($db, 'graduate_profiles', $column)) {
                $assignments[] = "`{$column}` = UPPER(TRIM(`{$column}`))";
            }
        }
        if ($assignments !== []) {
            $db->exec('UPDATE graduate_profiles SET ' . implode(', ', $assignments));
        }
    }
};
