<?php
declare(strict_types=1);

return static function (PDO $db): void {
    if (!gradtrack_migration_table_exists($db, 'graduate_accounts')) {
        throw new RuntimeException('Required table graduate_accounts is missing.');
    }

    if (!gradtrack_migration_column_exists($db, 'graduate_accounts', 'reactivated_at')) {
        $db->exec('ALTER TABLE graduate_accounts ADD COLUMN reactivated_at DATETIME NULL AFTER last_login_at');
    }
};
