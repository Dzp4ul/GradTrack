<?php

if (!function_exists('gradtrack_admin_role_values')) {
    function gradtrack_admin_role_values(): array
    {
        return [
            'super_admin',
            'admin',
            'mis_staff',
            'research_coordinator',
            'registrar',
            'alumni_admin',
            'dean_cs',
            'dean_coed',
            'dean_hm',
        ];
    }
}

if (!function_exists('gradtrack_admin_role_enum_definition')) {
    function gradtrack_admin_role_enum_definition(): string
    {
        $quotedRoles = array_map(static function (string $role): string {
            return "'" . str_replace("'", "''", $role) . "'";
        }, gradtrack_admin_role_values());

        return 'ENUM(' . implode(', ', $quotedRoles) . ") DEFAULT 'admin'";
    }
}

if (!function_exists('gradtrack_ensure_admin_role_column')) {
    function gradtrack_ensure_admin_role_column(PDO $db): void
    {
        $db->exec('ALTER TABLE admin_users MODIFY role ' . gradtrack_admin_role_enum_definition());
    }
}

if (!function_exists('gradtrack_ensure_admin_is_active_column')) {
    function gradtrack_ensure_admin_is_active_column(PDO $db): void
    {
        $columnStmt = $db->query("SHOW COLUMNS FROM admin_users LIKE 'is_active'");
        if ($columnStmt === false || $columnStmt->rowCount() === 0) {
            $db->exec('ALTER TABLE admin_users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1');
        }
    }
}

if (!function_exists('gradtrack_upsert_alumni_admin_account')) {
    function gradtrack_upsert_alumni_admin_account(PDO $db): array
    {
        throw new RuntimeException('Public alumni-admin bootstrap is disabled. Manage administrator accounts through User Management.');
    }
}
