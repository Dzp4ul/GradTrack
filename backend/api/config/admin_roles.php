<?php

if (!function_exists('gradtrack_admin_role_values')) {
    function gradtrack_admin_role_values(): array
    {
        return [
            'admin',
            'mis_staff',
            'research_coordinator',
            'registrar',
            'alumni_president',
            'dean_cs',
            'dean_coed',
            'dean_hm',
        ];
    }
}

if (!function_exists('gradtrack_role_labels')) {
    function gradtrack_role_labels(): array
    {
        return [
            'admin' => 'Admin',
            'research_coordinator' => 'Research Coordinator',
            'mis_staff' => 'MIS Staff',
            'registrar' => 'Registrar',
            'alumni_president' => 'Alumni President',
            'dean_cs' => 'Dean - CCS',
            'dean_coed' => 'Dean - COED',
            'dean_hm' => 'Dean - HM',
        ];
    }
}

if (!function_exists('gradtrack_role_label')) {
    function gradtrack_role_label(string $role): string
    {
        return gradtrack_role_labels()[$role] ?? ucwords(str_replace('_', ' ', $role));
    }
}

if (!function_exists('gradtrack_research_coordinator_roles')) {
    function gradtrack_research_coordinator_roles(): array
    {
        return ['research_coordinator'];
    }
}

if (!function_exists('gradtrack_system_admin_roles')) {
    function gradtrack_system_admin_roles(): array
    {
        return ['admin'];
    }
}

if (!function_exists('gradtrack_job_posting_admin_roles')) {
    function gradtrack_job_posting_admin_roles(): array
    {
        return ['research_coordinator', 'alumni_president', 'dean_cs', 'dean_coed', 'dean_hm'];
    }
}

if (!function_exists('gradtrack_job_posting_auto_approval_roles')) {
    function gradtrack_job_posting_auto_approval_roles(): array
    {
        return ['alumni_president'];
    }
}

if (!function_exists('gradtrack_admin_role_enum_definition')) {
    function gradtrack_admin_role_enum_definition(): string
    {
        $quotedRoles = array_map(static function (string $role): string {
            return "'" . str_replace("'", "''", $role) . "'";
        }, gradtrack_admin_role_values());

        return 'ENUM(' . implode(', ', $quotedRoles) . ") NOT NULL DEFAULT 'admin'";
    }
}

if (!function_exists('gradtrack_admin_role_enum_type')) {
    function gradtrack_admin_role_enum_type(): string
    {
        $quotedRoles = array_map(static function (string $role): string {
            return "'" . str_replace("'", "''", $role) . "'";
        }, gradtrack_admin_role_values());

        return 'enum(' . implode(',', $quotedRoles) . ')';
    }
}

if (!function_exists('gradtrack_ensure_admin_role_column')) {
    function gradtrack_ensure_admin_role_column(PDO $db): void
    {
        if (!gradtrack_runtime_schema_changes_allowed()) return;

        $columnStmt = $db->query("SHOW COLUMNS FROM admin_users LIKE 'role'");
        $column = $columnStmt !== false ? $columnStmt->fetch(PDO::FETCH_ASSOC) : false;
        if ($column === false) {
            throw new RuntimeException('The admin_users.role column is missing. Run the database migrations.');
        }

        $normalize = static function (string $value): string {
            return strtolower((string) preg_replace('/\s+/', '', $value));
        };

        $hasCanonicalType = $normalize((string) ($column['Type'] ?? '')) === $normalize(gradtrack_admin_role_enum_type());
        $isRequired = strtoupper((string) ($column['Null'] ?? '')) === 'NO';
        $hasCanonicalDefault = (string) ($column['Default'] ?? '') === 'admin';
        if ($hasCanonicalType && $isRequired && $hasCanonicalDefault) return;

        $db->exec('ALTER TABLE admin_users MODIFY role ' . gradtrack_admin_role_enum_definition());
    }
}

if (!function_exists('gradtrack_ensure_admin_is_active_column')) {
    function gradtrack_ensure_admin_is_active_column(PDO $db): void
    {
        if (!gradtrack_runtime_schema_changes_allowed()) return;
        $columnStmt = $db->query("SHOW COLUMNS FROM admin_users LIKE 'is_active'");
        if ($columnStmt === false || $columnStmt->rowCount() === 0) {
            $db->exec('ALTER TABLE admin_users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1');
        }
    }
}
