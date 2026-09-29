<?php
declare(strict_types=1);

return static function (PDO $db): void {
    if (!gradtrack_migration_table_exists($db, 'graduate_accounts')
        || !gradtrack_migration_table_exists($db, 'job_posts')
        || !gradtrack_migration_table_exists($db, 'forum_chat_messages')) {
        throw new RuntimeException('Required graduate, job, or messaging tables are missing.');
    }

    $db->exec("CREATE TABLE IF NOT EXISTS saved_jobs (
        id INT NOT NULL AUTO_INCREMENT,
        graduate_account_id INT NOT NULL,
        job_post_id INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_saved_jobs_account_job (graduate_account_id, job_post_id),
        KEY idx_saved_jobs_job (job_post_id),
        CONSTRAINT fk_saved_jobs_account
            FOREIGN KEY (graduate_account_id) REFERENCES graduate_accounts(id) ON DELETE CASCADE,
        CONSTRAINT fk_saved_jobs_job
            FOREIGN KEY (job_post_id) REFERENCES job_posts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    if (!gradtrack_migration_column_exists($db, 'forum_chat_messages', 'reference_id')) {
        $db->exec('ALTER TABLE forum_chat_messages ADD COLUMN reference_id INT NULL AFTER message_type');
    }

    $messageTypeStmt = $db->query("SELECT COLUMN_TYPE
                                   FROM INFORMATION_SCHEMA.COLUMNS
                                   WHERE TABLE_SCHEMA = DATABASE()
                                     AND TABLE_NAME = 'forum_chat_messages'
                                     AND COLUMN_NAME = 'message_type'
                                   LIMIT 1");
    $messageType = strtolower((string) ($messageTypeStmt ? $messageTypeStmt->fetchColumn() : ''));
    if (!str_contains($messageType, "'job_share'")) {
        $db->exec("ALTER TABLE forum_chat_messages
                   MODIFY message_type ENUM('text','image','file','mixed','system','job_share')
                   NOT NULL DEFAULT 'text'");
    }

    $referenceIndexStmt = $db->query("SELECT COUNT(*)
                                      FROM INFORMATION_SCHEMA.STATISTICS
                                      WHERE TABLE_SCHEMA = DATABASE()
                                        AND TABLE_NAME = 'forum_chat_messages'
                                        AND INDEX_NAME = 'idx_chat_messages_job_reference'");
    if ((int) $referenceIndexStmt->fetchColumn() === 0) {
        $db->exec('ALTER TABLE forum_chat_messages ADD INDEX idx_chat_messages_job_reference (message_type, reference_id)');
    }

    // These records were presented to their personnel authors as "Published"
    // and explicitly submitted with is_active = 1, but older API behavior stored
    // them as pending. Reconcile only authorized personnel-owned records; the
    // graduate/alumni approval workflow remains unchanged.
    $db->exec("UPDATE job_posts post
               JOIN admin_users admin ON admin.id = post.created_by_admin_id
               SET post.approval_status = 'approved',
                   post.approval_reviewed_by = admin.id,
                   post.approval_reviewed_at = COALESCE(post.approval_reviewed_at, post.created_at, NOW()),
                   post.approval_notes = NULL
               WHERE post.posted_by_account_id IS NULL
                 AND post.created_by_admin_id IS NOT NULL
                 AND post.is_active = 1
                 AND post.archived_at IS NULL
                 AND post.approval_status = 'pending'
                 AND admin.role IN ('research_coordinator','alumni_president','dean_cs','dean_coed','dean_hm')");
};
