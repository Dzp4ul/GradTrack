<?php

if (!function_exists('gradtrack_engagement_dean_program_scopes')) {
    function gradtrack_engagement_dean_program_scopes(): array
    {
        return [
            'dean_cs' => ['BSCS', 'ACT'],
            'dean_coed' => ['BSED', 'BEED'],
            'dean_hm' => ['BSHM'],
        ];
    }
}

if (!function_exists('gradtrack_engagement_admin_roles')) {
    function gradtrack_engagement_admin_roles(): array
    {
        return [];
    }
}

if (!function_exists('gradtrack_engagement_table_exists')) {
    function gradtrack_engagement_table_exists(PDO $db, string $table): bool
    {
        $stmt = $db->prepare("SELECT COUNT(*) AS total
                              FROM INFORMATION_SCHEMA.TABLES
                              WHERE TABLE_SCHEMA = DATABASE()
                                AND TABLE_NAME = :table");
        $stmt->execute([':table' => $table]);
        return (int) ($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0) > 0;
    }
}

if (!function_exists('gradtrack_engagement_column_exists')) {
    function gradtrack_engagement_column_exists(PDO $db, string $table, string $column): bool
    {
        $stmt = $db->prepare("SELECT COUNT(*) AS total
                              FROM INFORMATION_SCHEMA.COLUMNS
                              WHERE TABLE_SCHEMA = DATABASE()
                                AND TABLE_NAME = :table
                                AND COLUMN_NAME = :column");
        $stmt->execute([
            ':table' => $table,
            ':column' => $column,
        ]);
        return (int) ($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0) > 0;
    }
}

if (!function_exists('gradtrack_engagement_add_column_if_missing')) {
    function gradtrack_engagement_add_column_if_missing(PDO $db, string $table, string $column, string $definition): void
    {
        if (!gradtrack_engagement_table_exists($db, $table)) {
            return;
        }

        if (!gradtrack_engagement_column_exists($db, $table, $column)) {
            $db->exec("ALTER TABLE {$table} ADD COLUMN {$definition}");
        }
    }
}

if (!function_exists('gradtrack_ensure_engagement_approval_schema')) {
    function gradtrack_ensure_engagement_approval_schema(PDO $db): void
    {
        $tables = ['mentors', 'job_posts'];

        foreach ($tables as $table) {
            gradtrack_engagement_add_column_if_missing(
                $db,
                $table,
                'approval_status',
                "approval_status VARCHAR(20) NOT NULL DEFAULT 'approved' AFTER is_active"
            );
            gradtrack_engagement_add_column_if_missing(
                $db,
                $table,
                'approval_reviewed_by',
                'approval_reviewed_by INT NULL AFTER approval_status'
            );
            gradtrack_engagement_add_column_if_missing(
                $db,
                $table,
                'approval_reviewed_at',
                'approval_reviewed_at DATETIME NULL AFTER approval_reviewed_by'
            );
            gradtrack_engagement_add_column_if_missing(
                $db,
                $table,
                'approval_notes',
                'approval_notes TEXT NULL AFTER approval_reviewed_at'
            );
        }

        gradtrack_engagement_add_column_if_missing(
            $db,
            'mentors',
            'proof_file_path',
            'proof_file_path VARCHAR(255) NULL AFTER approval_notes'
        );
        gradtrack_engagement_add_column_if_missing(
            $db,
            'mentors',
            'proof_file_name',
            'proof_file_name VARCHAR(255) NULL AFTER proof_file_path'
        );
        gradtrack_engagement_add_column_if_missing(
            $db,
            'mentors',
            'proof_mime_type',
            'proof_mime_type VARCHAR(120) NULL AFTER proof_file_name'
        );
        gradtrack_engagement_add_column_if_missing(
            $db,
            'mentors',
            'proof_file_size_bytes',
            'proof_file_size_bytes INT UNSIGNED NULL AFTER proof_mime_type'
        );
        gradtrack_engagement_add_column_if_missing(
            $db,
            'mentors',
            'proof_uploaded_at',
            'proof_uploaded_at DATETIME NULL AFTER proof_file_size_bytes'
        );
    }
}

if (!function_exists('gradtrack_engagement_program_placeholders')) {
    function gradtrack_engagement_program_placeholders(array $programCodes, array &$params, string $prefix): string
    {
        $placeholders = [];
        foreach ($programCodes as $index => $code) {
            $placeholder = ':' . $prefix . '_' . $index;
            $placeholders[] = $placeholder;
            $params[$placeholder] = $code;
        }

        return implode(', ', $placeholders);
    }
}
