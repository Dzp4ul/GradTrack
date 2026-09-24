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

if (!function_exists('gradtrack_disable_inactive_graduate_accounts')) {
    function gradtrack_disable_inactive_graduate_accounts(PDO $db, ?DateTimeImmutable $serverNow = null): int
    {
        if ($serverNow === null && (string) $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
            $stmt = $db->prepare("UPDATE graduate_accounts
                                  SET status = 'disabled'
                                  WHERE status = 'active'
                                    AND last_login_at IS NOT NULL
                                    AND last_login_at <= DATE_SUB(NOW(), INTERVAL 1 YEAR)");
            $stmt->execute();
            return $stmt->rowCount();
        }

        $serverNow = $serverNow ?: new DateTimeImmutable('now');
        $cutoff = $serverNow->sub(new DateInterval('P1Y'))->format('Y-m-d H:i:s');
        $stmt = $db->prepare("UPDATE graduate_accounts
                              SET status = 'disabled'
                              WHERE status = 'active'
                                AND last_login_at IS NOT NULL
                                AND last_login_at <= :cutoff");
        $stmt->execute([':cutoff' => $cutoff]);

        return $stmt->rowCount();
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
