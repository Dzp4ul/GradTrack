<?php
declare(strict_types=1);

return static function (PDO $db): void {
    if (!gradtrack_migration_table_exists($db, 'admin_users')) {
        throw new RuntimeException('Required table admin_users is missing.');
    }

    // Expand before changing values so both legacy roles remain valid during migration.
    $db->exec("ALTER TABLE admin_users MODIFY role
            ENUM('super_admin','superadmin','admin','mis_staff','research_coordinator','registrar','alumni_admin','alumni_president','dean_cs','dean_coed','dean_hm')
            NOT NULL DEFAULT 'research_coordinator'");

    $db->exec("UPDATE admin_users SET role = 'alumni_president' WHERE role = 'alumni_admin'");

    // The legacy roles are distinct: Super Admin becomes the canonical Admin,
    // while the former Admin account set becomes Research Coordinator.
    $db->exec("UPDATE admin_users SET role = 'research_coordinator' WHERE role = 'admin'");
    $db->exec("UPDATE admin_users SET role = 'admin' WHERE role IN ('super_admin', 'superadmin')");

    if (gradtrack_migration_table_exists($db, 'audit_trail')) {
            $db->exec("UPDATE audit_trail
                SET user_role = CASE
                    WHEN user_role = 'super_admin' THEN 'admin'
                    WHEN user_role = 'admin' THEN 'research_coordinator'
                    WHEN user_role = 'alumni_admin' THEN 'alumni_president'
                    ELSE user_role
                END
                WHERE user_role IN ('super_admin', 'admin', 'alumni_admin')");
    }

    $db->exec('ALTER TABLE admin_users MODIFY role ' . gradtrack_admin_role_enum_definition());
};
