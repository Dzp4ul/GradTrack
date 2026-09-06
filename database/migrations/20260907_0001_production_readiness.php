<?php
declare(strict_types=1);

return static function (PDO $db): void {
    gradtrack_ensure_admin_role_column($db);
    gradtrack_ensure_admin_is_active_column($db);
    gradtrack_ensure_admin_profile_image_table($db);
    gradtrack_alumni_registry_ensure_schema($db);
    gradtrack_announcements_ensure_schema($db);
    gradtrack_ensure_audit_trail_table($db);
    gradtrack_forum_ensure_schema($db);

    gradtrack_migration_add_column($db, 'forum_chat_rooms', 'is_group', 'is_group TINYINT(1) NOT NULL DEFAULT 0 AFTER name');
    if (gradtrack_migration_column_exists($db, 'forum_chat_rooms', 'type')) {
        $db->exec("UPDATE forum_chat_rooms SET is_group = CASE WHEN type = 'group' THEN 1 ELSE 0 END");
    }
    gradtrack_chat_ensure_schema($db);
    if (gradtrack_migration_column_exists($db, 'forum_chat_messages', 'is_deleted')) {
        $db->exec('UPDATE forum_chat_messages SET deleted_at = created_at WHERE is_deleted = 1 AND deleted_at IS NULL');
    }
    foreach ([
        'stored_name' => 'stored_name VARCHAR(255) NULL',
        'storage_path' => 'storage_path VARCHAR(1024) NULL',
        'attachment_type' => "attachment_type ENUM('image', 'file') NULL",
        'updated_at' => 'updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    ] as $column => $definition) {
        gradtrack_migration_add_column($db, 'forum_chat_message_attachments', $column, $definition);
    }
    if (gradtrack_migration_column_exists($db, 'forum_chat_message_attachments', 'file_url')) {
        $db->exec("UPDATE forum_chat_message_attachments SET storage_path = file_url WHERE storage_path IS NULL OR storage_path = ''");
    }
    if (gradtrack_migration_column_exists($db, 'forum_chat_message_attachments', 'file_name')) {
        $db->exec("UPDATE forum_chat_message_attachments SET stored_name = file_name WHERE stored_name IS NULL OR stored_name = ''");
    }
    if (gradtrack_migration_column_exists($db, 'forum_chat_message_attachments', 'file_type')) {
        $db->exec("UPDATE forum_chat_message_attachments SET attachment_type = CASE WHEN file_type = 'image' THEN 'image' ELSE 'file' END WHERE attachment_type IS NULL");
    }
    gradtrack_genai_ensure_conversation_schema($db);
    gradtrack_ensure_graduate_account_verification_schema($db);
    gradtrack_ensure_graduate_profile_image_table($db);
    gradtrack_ensure_graduate_cover_image_table($db);
    gradtrack_ensure_graduate_profile_table($db);
    gradtrack_public_content_ensure_schema($db);
    gradtrack_survey_reminder_ensure_log_table($db);
    gradtrack_ensure_system_settings_table($db);
    gradtrack_ensure_engagement_approval_schema($db);

    gradtrack_ensure_archive_schema($db, 'graduates');
    gradtrack_ensure_archive_schema($db, 'registered_alumni');
    gradtrack_ensure_archive_schema($db, 'surveys', true);

    foreach ([
        'created_by' => 'created_by VARCHAR(255) NULL AFTER created_at',
        'modified_by' => 'modified_by VARCHAR(255) NULL AFTER created_by',
        'modified_at' => 'modified_at TIMESTAMP NULL DEFAULT NULL AFTER modified_by',
    ] as $column => $definition) {
        gradtrack_migration_add_column($db, 'surveys', $column, $definition);
    }

    foreach ([
        'salary_range' => 'salary_range VARCHAR(120) NULL AFTER location',
        'course_program_fit' => 'course_program_fit VARCHAR(255) NULL AFTER required_skills',
        'contact_email' => 'contact_email VARCHAR(180) NULL AFTER application_deadline',
        'application_link' => 'application_link VARCHAR(255) NULL AFTER contact_email',
        'requirements_file_path' => 'requirements_file_path VARCHAR(1024) NULL AFTER application_method',
        'requirements_file_name' => 'requirements_file_name VARCHAR(255) NULL AFTER requirements_file_path',
        'requirements_mime_type' => 'requirements_mime_type VARCHAR(150) NULL AFTER requirements_file_name',
        'requirements_file_size_bytes' => 'requirements_file_size_bytes BIGINT UNSIGNED NULL AFTER requirements_mime_type',
        'requirements_uploaded_at' => 'requirements_uploaded_at DATETIME NULL AFTER requirements_file_size_bytes',
    ] as $column => $definition) {
        gradtrack_migration_add_column($db, 'job_posts', $column, $definition);
    }

    foreach ([
        'job_alignment' => 'job_alignment VARCHAR(120) NULL AFTER industry',
        'mentor_type' => 'mentor_type VARCHAR(120) NULL AFTER job_alignment',
        'max_members' => 'max_members INT UNSIGNED NOT NULL DEFAULT 5 AFTER mentor_type',
        'post_status' => "post_status ENUM('open','closed') NOT NULL DEFAULT 'open' AFTER max_members",
        'proof_file_path' => 'proof_file_path VARCHAR(1024) NULL',
        'proof_file_name' => 'proof_file_name VARCHAR(255) NULL',
        'proof_mime_type' => 'proof_mime_type VARCHAR(150) NULL',
        'proof_file_size_bytes' => 'proof_file_size_bytes BIGINT UNSIGNED NULL',
        'proof_uploaded_at' => 'proof_uploaded_at DATETIME NULL',
    ] as $column => $definition) {
        gradtrack_migration_add_column($db, 'mentors', $column, $definition);
    }

    foreach ([
        'request_message' => 'request_message TEXT NULL AFTER mentee_account_id',
        'mentee_name' => 'mentee_name VARCHAR(160) NULL AFTER mentee_account_id',
        'mentee_email' => 'mentee_email VARCHAR(160) NULL AFTER mentee_name',
        'mentee_program' => 'mentee_program VARCHAR(160) NULL AFTER mentee_email',
        'reason_for_request' => 'reason_for_request TEXT NULL AFTER request_message',
        'topic' => 'topic VARCHAR(150) NULL AFTER reason_for_request',
        'preferred_schedule' => 'preferred_schedule VARCHAR(150) NULL AFTER topic',
        'session_date' => 'session_date DATE NULL AFTER preferred_schedule',
        'session_time' => 'session_time VARCHAR(80) NULL AFTER session_date',
        'session_type' => 'session_type VARCHAR(50) NULL AFTER session_time',
        'meeting_link' => 'meeting_link VARCHAR(255) NULL AFTER session_type',
        'meeting_location' => 'meeting_location VARCHAR(255) NULL AFTER meeting_link',
        'session_notes' => 'session_notes TEXT NULL AFTER meeting_location',
    ] as $column => $definition) {
        gradtrack_migration_add_column($db, 'mentorship_requests', $column, $definition);
    }
    if (gradtrack_migration_column_exists($db, 'mentorship_requests', 'message')) {
        $db->exec('UPDATE mentorship_requests SET request_message = message WHERE request_message IS NULL');
    }
    $statusStmt = $db->query("SHOW COLUMNS FROM mentorship_requests LIKE 'status'");
    $statusType = strtolower((string) (($statusStmt ? $statusStmt->fetch(PDO::FETCH_ASSOC) : [])['Type'] ?? ''));
    if ($statusType !== '' && strpos($statusType, 'cancelled') === false) {
        $db->exec("ALTER TABLE mentorship_requests MODIFY status ENUM('pending','accepted','declined','completed','cancelled') DEFAULT 'pending'");
    }

    gradtrack_migration_add_column($db, 'mentorship_feedback', 'mentor_helpful', 'mentor_helpful TINYINT(1) NULL AFTER rating');
    gradtrack_migration_add_column($db, 'mentorship_feedback', 'feedback_text', 'feedback_text TEXT NULL AFTER mentor_helpful');
    if (gradtrack_migration_column_exists($db, 'mentorship_feedback', 'comment')) {
        $db->exec('UPDATE mentorship_feedback SET feedback_text = comment WHERE feedback_text IS NULL');
    }

    $db->exec("CREATE TABLE IF NOT EXISTS mentorship_mentor_feedback (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mentorship_request_id INT NOT NULL UNIQUE,
        mentor_account_id INT NOT NULL,
        mentee_attended TINYINT(1) NULL,
        session_completed TINYINT(1) NULL,
        remarks TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    foreach ([
        'mentee_attended' => 'mentee_attended TINYINT(1) NULL',
        'session_completed' => 'session_completed TINYINT(1) NULL',
        'remarks' => 'remarks TEXT NULL',
    ] as $column => $definition) {
        gradtrack_migration_add_column($db, 'mentorship_mentor_feedback', $column, $definition);
    }

    $db->exec("CREATE TABLE IF NOT EXISTS notification_reads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        target_type ENUM('admin','graduate') NOT NULL,
        target_id INT NOT NULL,
        notification_key VARCHAR(190) NOT NULL,
        read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_notification_read (target_type, target_id, notification_key),
        INDEX idx_notification_reads_target (target_type, target_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    foreach ([
        'graduate_id' => 'graduate_id INT NOT NULL DEFAULT 0 AFTER survey_id',
        'email' => "email VARCHAR(255) NOT NULL DEFAULT '' AFTER graduate_id",
        'subject' => "subject VARCHAR(255) NOT NULL DEFAULT '' AFTER email",
        'reminder_type' => "reminder_type ENUM('manual', 'auto') NOT NULL DEFAULT 'auto' AFTER subject",
        'error_message' => 'error_message TEXT NULL AFTER status',
        'sent_at' => 'sent_at DATETIME NULL AFTER error_message',
    ] as $column => $definition) {
        gradtrack_migration_add_column($db, 'survey_reminder_logs', $column, $definition);
    }
    $reminderStatusStmt = $db->query("SHOW COLUMNS FROM survey_reminder_logs LIKE 'status'");
    $reminderStatusType = strtolower((string) (($reminderStatusStmt ? $reminderStatusStmt->fetch(PDO::FETCH_ASSOC) : [])['Type'] ?? ''));
    if ($reminderStatusType !== '' && (
        strpos($reminderStatusType, "'sent'") === false
        || strpos($reminderStatusType, "'skipped'") === false
        || strpos($reminderStatusType, "'active'") !== false
    )) {
        $db->exec("ALTER TABLE survey_reminder_logs MODIFY status ENUM('sent','failed','skipped','active','closed','draft') NOT NULL DEFAULT 'sent'");
        $db->exec("UPDATE survey_reminder_logs SET status = 'skipped' WHERE status IN ('active','closed','draft')");
        $db->exec("ALTER TABLE survey_reminder_logs MODIFY status ENUM('sent','failed','skipped') NOT NULL DEFAULT 'sent'");
    }

    $db->exec("CREATE TABLE IF NOT EXISTS admin_password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY, admin_user_id INT NOT NULL, email VARCHAR(255) NOT NULL,
        otp_hash VARCHAR(255) NOT NULL, expires_at DATETIME NOT NULL, attempt_count INT NOT NULL DEFAULT 0,
        verified_at DATETIME NULL, verified_token_hash CHAR(64) NULL, verified_expires_at DATETIME NULL,
        used_at DATETIME NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_admin_password_resets_email_created (email, created_at),
        INDEX idx_admin_password_resets_user_created (admin_user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("CREATE TABLE IF NOT EXISTS graduate_password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY, graduate_account_id INT NOT NULL, email VARCHAR(255) NOT NULL,
        otp_hash VARCHAR(255) NOT NULL, expires_at DATETIME NOT NULL, attempt_count INT NOT NULL DEFAULT 0,
        verified_at DATETIME NULL, verified_token_hash CHAR(64) NULL, verified_expires_at DATETIME NULL,
        used_at DATETIME NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_grad_password_resets_email_created (email, created_at),
        INDEX idx_grad_password_resets_account_created (graduate_account_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
};
