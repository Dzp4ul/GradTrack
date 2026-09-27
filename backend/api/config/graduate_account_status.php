<?php

if (!function_exists('gradtrack_graduate_account_status_values')) {
    function gradtrack_graduate_account_status_values(): array
    {
        return ['pending_verification', 'active', 'inactive', 'rejected', 'disabled'];
    }
}

if (!function_exists('gradtrack_graduate_account_status_enum_definition')) {
    function gradtrack_graduate_account_status_enum_definition(): string
    {
        return "ENUM('pending_verification','active','inactive','rejected','disabled') NOT NULL DEFAULT 'pending_verification'";
    }
}

if (!function_exists('gradtrack_graduate_account_has_reactivation_column')) {
    function gradtrack_graduate_account_has_reactivation_column(PDO $db): bool
    {
        $driver = (string)$db->getAttribute(PDO::ATTR_DRIVER_NAME);
        if ($driver === 'sqlite') {
            foreach ($db->query('PRAGMA table_info(graduate_accounts)')->fetchAll(PDO::FETCH_ASSOC) as $column) {
                if (($column['name'] ?? '') === 'reactivated_at') return true;
            }
            return false;
        }

        $stmt = $db->query("SHOW COLUMNS FROM graduate_accounts LIKE 'reactivated_at'");
        return $stmt !== false && (bool)$stmt->fetch(PDO::FETCH_ASSOC);
    }
}

if (!function_exists('gradtrack_graduate_account_activity_expression')) {
    function gradtrack_graduate_account_activity_expression(PDO $db): string
    {
        if (!gradtrack_graduate_account_has_reactivation_column($db)) return 'last_login_at';
        if ((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
            return 'COALESCE(GREATEST(last_login_at, reactivated_at), last_login_at, reactivated_at)';
        }
        return "COALESCE(
                    CASE
                        WHEN last_login_at IS NULL THEN reactivated_at
                        WHEN reactivated_at IS NULL THEN last_login_at
                        WHEN last_login_at >= reactivated_at THEN last_login_at
                        ELSE reactivated_at
                    END,
                    last_login_at,
                    reactivated_at
                )";
    }
}

if (!function_exists('gradtrack_disable_inactive_graduate_accounts')) {
    function gradtrack_disable_inactive_graduate_accounts(PDO $db, ?DateTimeImmutable $serverNow = null): int
    {
        $activityExpression = gradtrack_graduate_account_activity_expression($db);
        if ($serverNow === null && (string) $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
            $stmt = $db->prepare("UPDATE graduate_accounts
                                  SET status = 'disabled'
                                  WHERE status = 'active'
                                    AND {$activityExpression} IS NOT NULL
                                    AND {$activityExpression} <= DATE_SUB(NOW(), INTERVAL 365 DAY)");
            $stmt->execute();
            return $stmt->rowCount();
        }

        $serverNow = $serverNow ?: new DateTimeImmutable('now');
        $cutoff = $serverNow->sub(new DateInterval('P365D'))->format('Y-m-d H:i:s');
        $stmt = $db->prepare("UPDATE graduate_accounts
                              SET status = 'disabled'
                              WHERE status = 'active'
                                AND {$activityExpression} IS NOT NULL
                                AND {$activityExpression} <= :cutoff");
        $stmt->execute([':cutoff' => $cutoff]);

        return $stmt->rowCount();
    }
}

if (!function_exists('gradtrack_disable_inactive_graduate_account')) {
    function gradtrack_disable_inactive_graduate_account(PDO $db, int $accountId, ?DateTimeImmutable $serverNow = null): bool
    {
        if ($accountId <= 0) return false;
        $activityExpression = gradtrack_graduate_account_activity_expression($db);

        if ($serverNow === null && (string) $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
            $stmt = $db->prepare("UPDATE graduate_accounts
                                  SET status = 'disabled'
                                  WHERE id = :account_id
                                    AND status = 'active'
                                    AND {$activityExpression} IS NOT NULL
                                    AND {$activityExpression} <= DATE_SUB(NOW(), INTERVAL 365 DAY)");
            $stmt->execute([':account_id' => $accountId]);
            return $stmt->rowCount() > 0;
        }

        $serverNow = $serverNow ?: new DateTimeImmutable('now');
        $cutoff = $serverNow->sub(new DateInterval('P365D'))->format('Y-m-d H:i:s');
        $stmt = $db->prepare("UPDATE graduate_accounts
                              SET status = 'disabled'
                              WHERE id = :account_id
                                AND status = 'active'
                                AND {$activityExpression} IS NOT NULL
                                AND {$activityExpression} <= :cutoff");
        $stmt->execute([':account_id' => $accountId, ':cutoff' => $cutoff]);
        return $stmt->rowCount() > 0;
    }
}

if (!function_exists('gradtrack_registry_account_status_sql')) {
    function gradtrack_registry_account_status_sql(string $accountAlias = 'ga'): string
    {
        $alias = preg_replace('/[^A-Za-z0-9_]/', '', $accountAlias) ?: 'ga';
        return "CASE
                    WHEN {$alias}.id IS NULL THEN 'inactive'
                    WHEN {$alias}.status = 'disabled' THEN 'disabled'
                    WHEN {$alias}.status = 'active' THEN 'active'
                    ELSE 'inactive'
                END";
    }
}
