<?php
declare(strict_types=1);

return static function (PDO $db): void {
    if (!gradtrack_migration_table_exists($db, 'admin_users')) {
        throw new RuntimeException('Required table admin_users is missing.');
    }

    $accountStmt = $db->prepare("SELECT id
        FROM admin_users
        WHERE email = 'superadmin@gradtrack.com'
           OR username = 'superadmin'
           OR full_name = 'Super Administrator'
        ORDER BY CASE WHEN email = 'superadmin@gradtrack.com' THEN 0 ELSE 1 END, id
        LIMIT 1");
    $accountStmt->execute();
    $accountId = (int) ($accountStmt->fetchColumn() ?: 0);

    if ($accountId <= 0) {
        return;
    }

    $updateAccount = $db->prepare("UPDATE admin_users SET role = 'admin' WHERE id = :id");
    $updateAccount->execute([':id' => $accountId]);

    if (gradtrack_migration_table_exists($db, 'audit_trail')) {
        $updateAudit = $db->prepare("UPDATE audit_trail
            SET user_role = 'admin'
            WHERE user_id = :user_id
              AND user_role = 'research_coordinator'");
        $updateAudit->execute([':user_id' => $accountId]);
    }
};
