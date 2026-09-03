<?php

/**
 * Shared, non-destructive archive schema used by important GradTrack records.
 *
 * The application intentionally keeps the original row and all foreign-key
 * relationships intact. Only explicitly whitelisted parent tables may use
 * this helper.
 */
if (!function_exists('gradtrack_archive_allowed_tables')) {
    function gradtrack_archive_allowed_tables(): array
    {
        return ['graduates', 'registered_alumni', 'surveys'];
    }
}

if (!function_exists('gradtrack_archive_column_exists')) {
    function gradtrack_archive_column_exists(PDO $db, string $table, string $column): bool
    {
        if (!in_array($table, gradtrack_archive_allowed_tables(), true)) {
            throw new InvalidArgumentException('Archive table is not allowed');
        }

        $stmt = $db->query("SHOW COLUMNS FROM `{$table}` LIKE " . $db->quote($column));
        return $stmt !== false && $stmt->fetch(PDO::FETCH_ASSOC) !== false;
    }
}

if (!function_exists('gradtrack_archive_index_exists')) {
    function gradtrack_archive_index_exists(PDO $db, string $table, string $index): bool
    {
        if (!in_array($table, gradtrack_archive_allowed_tables(), true)) {
            throw new InvalidArgumentException('Archive table is not allowed');
        }

        $stmt = $db->query("SHOW INDEX FROM `{$table}` WHERE Key_name = " . $db->quote($index));
        return $stmt !== false && $stmt->fetch(PDO::FETCH_ASSOC) !== false;
    }
}

if (!function_exists('gradtrack_ensure_archive_schema')) {
    function gradtrack_ensure_archive_schema(PDO $db, string $table, bool $rememberStatus = false): void
    {
        if (!in_array($table, gradtrack_archive_allowed_tables(), true)) {
            throw new InvalidArgumentException('Archive table is not allowed');
        }

        $columns = [
            'archived_at' => "ALTER TABLE `{$table}` ADD COLUMN archived_at DATETIME NULL",
            'archived_by' => "ALTER TABLE `{$table}` ADD COLUMN archived_by INT NULL",
            'restored_at' => "ALTER TABLE `{$table}` ADD COLUMN restored_at DATETIME NULL",
            'restored_by' => "ALTER TABLE `{$table}` ADD COLUMN restored_by INT NULL",
        ];

        if ($rememberStatus) {
            $columns['status_before_archive'] = "ALTER TABLE `{$table}` ADD COLUMN status_before_archive VARCHAR(30) NULL";
        }

        foreach ($columns as $column => $sql) {
            if (!gradtrack_archive_column_exists($db, $table, $column)) {
                $db->exec($sql);
            }
        }

        $indexName = 'idx_' . $table . '_archived_at';
        if (!gradtrack_archive_index_exists($db, $table, $indexName)) {
            $db->exec("ALTER TABLE `{$table}` ADD INDEX `{$indexName}` (archived_at)");
        }
    }
}

