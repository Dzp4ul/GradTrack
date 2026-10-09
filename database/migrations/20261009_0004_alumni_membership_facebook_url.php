<?php
declare(strict_types=1);

return static function (PDO $db): void {
    if (!gradtrack_migration_table_exists($db, 'alumni_membership_versions')) {
        throw new RuntimeException('Required table alumni_membership_versions is missing.');
    }

    if (!gradtrack_migration_column_exists($db, 'alumni_membership_versions', 'facebook_url')) {
        $db->exec("ALTER TABLE alumni_membership_versions
            ADD COLUMN facebook_url VARCHAR(1000) NOT NULL DEFAULT 'https://www.facebook.com/norcaa' AFTER registration_button_enabled");
    }
};
