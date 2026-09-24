<?php
declare(strict_types=1);

return static function (PDO $db): void {
    if (!gradtrack_migration_table_exists($db, 'admin_users')) {
        throw new RuntimeException('Required table admin_users is missing.');
    }

    $db->exec('ALTER TABLE admin_users MODIFY role ' . gradtrack_admin_role_enum_definition());

    $accountStmt = $db->prepare("SELECT id
        FROM admin_users
        WHERE email = 'superadmin@gradtrack.com'
           OR username = 'superadmin'
           OR full_name = 'Super Administrator'
        ORDER BY CASE WHEN email = 'superadmin@gradtrack.com' THEN 0 ELSE 1 END, id
        LIMIT 1");
    $accountStmt->execute();
    $accountId = (int) ($accountStmt->fetchColumn() ?: 0);

    if ($accountId > 0) {
        $updateAccount = $db->prepare("UPDATE admin_users SET role = 'admin' WHERE id = :id");
        $updateAccount->execute([':id' => $accountId]);
    }
};
