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
        $account = [
            'username' => 'alumni@gradtrack.com',
            'email' => 'alumni@gradtrack.com',
            'password' => 'alumni123',
            'full_name' => 'Alumni Admin',
            'role' => 'alumni_admin',
        ];

        gradtrack_ensure_admin_role_column($db);
        gradtrack_ensure_admin_is_active_column($db);

        $checkStmt = $db->prepare('SELECT id FROM admin_users WHERE email = :email LIMIT 1');
        $checkStmt->execute([':email' => $account['email']]);
        $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);

        $passwordHash = password_hash($account['password'], PASSWORD_BCRYPT);

        if ($existing) {
            $updateStmt = $db->prepare("
                UPDATE admin_users
                SET username = :username,
                    password = :password,
                    full_name = :full_name,
                    role = :role,
                    is_active = 1
                WHERE id = :id
            ");
            $updateStmt->execute([
                ':username' => $account['username'],
                ':password' => $passwordHash,
                ':full_name' => $account['full_name'],
                ':role' => $account['role'],
                ':id' => (int) $existing['id'],
            ]);

            return ['email' => $account['email'], 'password' => $account['password'], 'status' => 'updated'];
        }

        $insertStmt = $db->prepare("
            INSERT INTO admin_users (username, email, password, full_name, role, is_active)
            VALUES (:username, :email, :password, :full_name, :role, 1)
        ");
        $insertStmt->execute([
            ':username' => $account['username'],
            ':email' => $account['email'],
            ':password' => $passwordHash,
            ':full_name' => $account['full_name'],
            ':role' => $account['role'],
        ]);

        return ['email' => $account['email'], 'password' => $account['password'], 'status' => 'created'];
    }
}
