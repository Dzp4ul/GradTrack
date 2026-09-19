<?php
declare(strict_types=1);

return static function (PDO $db): void {
    gradtrack_migration_add_column(
        $db,
        'job_posts',
        'created_by_admin_id',
        'created_by_admin_id INT NULL AFTER posted_by_account_id'
    );

    $columnStmt = $db->query("SELECT IS_NULLABLE
                              FROM INFORMATION_SCHEMA.COLUMNS
                              WHERE TABLE_SCHEMA = DATABASE()
                                AND TABLE_NAME = 'job_posts'
                                AND COLUMN_NAME = 'posted_by_account_id'
                              LIMIT 1");
    $column = $columnStmt ? $columnStmt->fetch(PDO::FETCH_ASSOC) : false;
    if ($column && strtoupper((string) ($column['IS_NULLABLE'] ?? 'NO')) !== 'YES') {
        $db->exec('ALTER TABLE job_posts MODIFY posted_by_account_id INT NULL');
    }

    $indexStmt = $db->query("SELECT COUNT(*)
                             FROM INFORMATION_SCHEMA.STATISTICS
                             WHERE TABLE_SCHEMA = DATABASE()
                               AND TABLE_NAME = 'job_posts'
                               AND INDEX_NAME = 'idx_job_posts_admin'");
    if ((int) $indexStmt->fetchColumn() === 0) {
        $db->exec('ALTER TABLE job_posts ADD INDEX idx_job_posts_admin (created_by_admin_id)');
    }

    $foreignKeyStmt = $db->query("SELECT COUNT(*)
                                  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                                  WHERE TABLE_SCHEMA = DATABASE()
                                    AND TABLE_NAME = 'job_posts'
                                    AND COLUMN_NAME = 'created_by_admin_id'
                                    AND REFERENCED_TABLE_NAME = 'admin_users'");
    if ((int) $foreignKeyStmt->fetchColumn() === 0) {
        $db->exec('ALTER TABLE job_posts
                   ADD CONSTRAINT fk_job_posts_admin
                   FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id)
                   ON DELETE SET NULL');
    }
};
