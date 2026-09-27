<?php
declare(strict_types=1);

return static function (PDO $db): void {
    if (!gradtrack_migration_table_exists($db, 'job_posts')) {
        throw new RuntimeException('Required table job_posts is missing.');
    }

    $columns = [
        'archived_at' => 'ALTER TABLE job_posts ADD COLUMN archived_at DATETIME NULL AFTER approval_notes',
        'archived_by' => 'ALTER TABLE job_posts ADD COLUMN archived_by INT NULL AFTER archived_at',
        'restored_at' => 'ALTER TABLE job_posts ADD COLUMN restored_at DATETIME NULL AFTER archived_by',
        'restored_by' => 'ALTER TABLE job_posts ADD COLUMN restored_by INT NULL AFTER restored_at',
    ];
    foreach ($columns as $column => $sql) {
        if (!gradtrack_migration_column_exists($db, 'job_posts', $column)) {
            $db->exec($sql);
        }
    }

    $indexStmt = $db->query("SELECT COUNT(*) AS total
                              FROM INFORMATION_SCHEMA.STATISTICS
                              WHERE TABLE_SCHEMA = DATABASE()
                                AND TABLE_NAME = 'job_posts'
                                AND INDEX_NAME = 'idx_job_posts_visibility'");
    if ((int) ($indexStmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0) === 0) {
        $db->exec('ALTER TABLE job_posts ADD INDEX idx_job_posts_visibility (approval_status, archived_at, is_active, application_deadline)');
    }

    foreach (['archived_by' => 'fk_job_posts_archived_by', 'restored_by' => 'fk_job_posts_restored_by'] as $column => $constraint) {
        $fkStmt = $db->prepare("SELECT COUNT(*) AS total
                                FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                                WHERE TABLE_SCHEMA = DATABASE()
                                  AND TABLE_NAME = 'job_posts'
                                  AND COLUMN_NAME = :column_name
                                  AND REFERENCED_TABLE_NAME = 'admin_users'");
        $fkStmt->execute([':column_name' => $column]);
        if ((int) ($fkStmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0) === 0) {
            $db->exec("ALTER TABLE job_posts ADD CONSTRAINT {$constraint} FOREIGN KEY ({$column}) REFERENCES admin_users(id) ON DELETE SET NULL");
        }
    }
};
