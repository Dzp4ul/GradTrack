<?php
declare(strict_types=1);

require_once __DIR__ . '/../../backend/api/config/graduate_account_status.php';

return static function (PDO $db): void {
    if (!gradtrack_migration_table_exists($db, 'graduate_accounts')) {
        throw new RuntimeException('Required table graduate_accounts is missing.');
    }

    $db->exec('ALTER TABLE graduate_accounts MODIFY status ' . gradtrack_graduate_account_status_enum_definition());
    gradtrack_disable_inactive_graduate_accounts($db);
};
