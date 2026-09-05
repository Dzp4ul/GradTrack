-- GradTrack ERD schema for DrawSQL
-- Source reviewed: GradTrack backend/database files and C:\Users\celvn\Downloads\gddb.sql
-- Data, seed records, triggers, routines, and production database operations are intentionally omitted.

CREATE TABLE `admin_users` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `email` VARCHAR(100) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `full_name` VARCHAR(100) DEFAULT NULL,
    `role` ENUM('super_admin','admin','mis_staff','research_coordinator','registrar','alumni_admin','dean_cs','dean_coed','dean_hm') DEFAULT 'admin',
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_admin_users_username` (`username`),
    UNIQUE KEY `uq_admin_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `programs` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `description` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_programs_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `surveys` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT DEFAULT NULL,
    `status` ENUM('active','inactive','draft') DEFAULT 'draft',
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `created_by` VARCHAR(100) DEFAULT NULL,
    `modified_by` VARCHAR(100) DEFAULT NULL,
    `modified_at` TIMESTAMP NULL DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `archived_at` DATETIME DEFAULT NULL,
    `archived_by` INT DEFAULT NULL,
    `restored_at` DATETIME DEFAULT NULL,
    `restored_by` INT DEFAULT NULL,
    `status_before_archive` VARCHAR(30) DEFAULT NULL,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `announcements` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `graduate_id` INT DEFAULT NULL,
    `created_by_admin_id` INT DEFAULT NULL,
    `title` VARCHAR(255) NOT NULL,
    `summary` VARCHAR(500) DEFAULT NULL,
    `content` TEXT NOT NULL,
    `category` VARCHAR(50) NOT NULL DEFAULT 'general',
    `event_date` DATE DEFAULT NULL,
    `cover_image_path` VARCHAR(255) DEFAULT NULL,
    `cover_image_original_name` VARCHAR(255) DEFAULT NULL,
    `cover_image_mime_type` VARCHAR(120) DEFAULT NULL,
    `cover_image_file_size_bytes` INT DEFAULT NULL,
    `status` ENUM('draft','published','archived') NOT NULL DEFAULT 'published',
    `published_at` DATETIME DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_announcements_graduate` (`graduate_id`),
    KEY `idx_announcements_status_created` (`status`, `created_at`),
    KEY `idx_announcements_category_created` (`category`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `announcement_images` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `announcement_id` INT NOT NULL,
    `file_path` VARCHAR(255) NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(120) NOT NULL,
    `file_size_bytes` INT NOT NULL,
    `sort_order` INT NOT NULL DEFAULT 0,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_announcement_images_announcement_order` (`announcement_id`, `sort_order`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `employment_trends` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `year` INT NOT NULL,
    `employment_rate` DECIMAL(5,2) DEFAULT NULL,
    `alignment_rate` DECIMAL(5,2) DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `job_listings` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(200) NOT NULL,
    `company` VARCHAR(150) NOT NULL,
    `location` VARCHAR(150) DEFAULT NULL,
    `job_type` ENUM('full_time','part_time','contract','internship') DEFAULT 'full_time',
    `description` TEXT DEFAULT NULL,
    `requirements` TEXT DEFAULT NULL,
    `salary_range` VARCHAR(100) DEFAULT NULL,
    `posted_date` DATE DEFAULT NULL,
    `deadline` DATE DEFAULT NULL,
    `status` ENUM('active','closed','draft') DEFAULT 'active',
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `graduates` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `student_id` VARCHAR(20) NOT NULL,
    `first_name` VARCHAR(50) NOT NULL,
    `middle_name` VARCHAR(50) DEFAULT NULL,
    `last_name` VARCHAR(50) NOT NULL,
    `name_extension` VARCHAR(20) DEFAULT NULL,
    `email` VARCHAR(100) DEFAULT NULL,
    `phone` VARCHAR(20) DEFAULT NULL,
    `program_id` INT DEFAULT NULL,
    `year_graduated` YEAR DEFAULT NULL,
    `address` TEXT DEFAULT NULL,
    `status` ENUM('active','inactive') DEFAULT 'active',
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `archived_at` DATETIME DEFAULT NULL,
    `archived_by` INT DEFAULT NULL,
    `restored_at` DATETIME DEFAULT NULL,
    `restored_by` INT DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_graduates_student_id` (`student_id`),
    UNIQUE KEY `uq_graduates_email` (`email`),
    KEY `idx_graduates_program_id` (`program_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `audit_trail` (
    `audit_id` INT NOT NULL AUTO_INCREMENT,
    `user_id` INT DEFAULT NULL,
    `user_name` VARCHAR(150) DEFAULT NULL,
    `user_role` VARCHAR(50) DEFAULT NULL,
    `department` VARCHAR(100) DEFAULT NULL,
    `action` VARCHAR(50) NOT NULL,
    `module` VARCHAR(100) NOT NULL,
    `description` TEXT DEFAULT NULL,
    `record_id` VARCHAR(100) DEFAULT NULL,
    `previous_values` LONGTEXT DEFAULT NULL,
    `new_values` LONGTEXT DEFAULT NULL,
    `metadata` LONGTEXT DEFAULT NULL,
    `ip_address` VARCHAR(45) DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`audit_id`),
    KEY `idx_audit_trail_created_at` (`created_at`),
    KEY `idx_audit_trail_action` (`action`),
    KEY `idx_audit_trail_module` (`module`),
    KEY `idx_audit_trail_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `admin_password_resets` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `admin_user_id` INT NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `otp_hash` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME NOT NULL,
    `attempt_count` INT NOT NULL DEFAULT 0,
    `verified_at` DATETIME DEFAULT NULL,
    `verified_token_hash` VARCHAR(255) DEFAULT NULL,
    `verified_expires_at` DATETIME DEFAULT NULL,
    `used_at` DATETIME DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_admin_password_resets_admin_user` (`admin_user_id`),
    KEY `idx_admin_password_resets_email` (`email`),
    KEY `idx_admin_password_resets_verified_token` (`verified_token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `admin_profile_images` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `admin_user_id` INT NOT NULL,
    `file_path` VARCHAR(255) NOT NULL,
    `original_file_name` VARCHAR(255) DEFAULT NULL,
    `mime_type` VARCHAR(120) DEFAULT NULL,
    `file_size_bytes` INT DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_admin_profile_images_admin_user` (`admin_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `system_settings` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `setting_key` VARCHAR(100) NOT NULL,
    `setting_value` TEXT DEFAULT NULL,
    `setting_group` VARCHAR(50) DEFAULT 'general',
    `updated_by_admin_user_id` INT DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_system_settings_key` (`setting_key`),
    KEY `idx_system_settings_group` (`setting_group`),
    KEY `idx_system_settings_updated_by` (`updated_by_admin_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `website_content` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `page` VARCHAR(40) NOT NULL,
    `section_key` VARCHAR(80) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `subtitle` VARCHAR(255) DEFAULT NULL,
    `content` TEXT NOT NULL,
    `image_path` VARCHAR(500) DEFAULT NULL,
    `default_image_path` VARCHAR(500) DEFAULT NULL,
    `image_alt` VARCHAR(255) DEFAULT NULL,
    `display_order` INT NOT NULL DEFAULT 0,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `updated_by_admin_user_id` INT DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_website_content_page_section` (`page`, `section_key`),
    KEY `idx_website_content_page_order` (`page`, `is_active`, `display_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `faq_categories` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `display_order` INT NOT NULL DEFAULT 0,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_faq_categories_order` (`is_active`, `display_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `faq_items` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `category_id` INT NOT NULL,
    `question` VARCHAR(500) NOT NULL,
    `answer` TEXT NOT NULL,
    `display_order` INT NOT NULL DEFAULT 0,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_faq_items_category_order` (`category_id`, `is_active`, `display_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `privacy_policy_meta` (
    `id` TINYINT UNSIGNED NOT NULL,
    `introductory_statement` TEXT NOT NULL,
    `effective_date` DATE NOT NULL,
    `last_updated_date` DATE NOT NULL,
    `updated_by_admin_user_id` INT DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `privacy_sections` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `heading` VARCHAR(255) NOT NULL,
    `content_html` MEDIUMTEXT NOT NULL,
    `display_order` INT NOT NULL DEFAULT 0,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_privacy_sections_order` (`is_active`, `display_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `employment` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `graduate_id` INT DEFAULT NULL,
    `company_name` VARCHAR(150) DEFAULT NULL,
    `job_title` VARCHAR(100) DEFAULT NULL,
    `industry` VARCHAR(100) DEFAULT NULL,
    `employment_status` ENUM('employed','unemployed','self_employed','freelance') DEFAULT 'unemployed',
    `is_aligned` ENUM('aligned','partially_aligned','not_aligned') DEFAULT 'not_aligned',
    `date_hired` DATE DEFAULT NULL,
    `monthly_salary` DECIMAL(10,2) DEFAULT NULL,
    `time_to_employment` INT DEFAULT 0 COMMENT 'Months after graduation',
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_employment_graduate_id` (`graduate_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `survey_questions` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `survey_id` INT DEFAULT NULL,
    `section` VARCHAR(100) DEFAULT NULL,
    `question_text` TEXT NOT NULL,
    `question_type` ENUM('text','date','multiple_choice','radio','rating','checkbox') DEFAULT 'text',
    `options` JSON DEFAULT NULL,
    `is_required` TINYINT(1) DEFAULT 0,
    `sort_order` INT DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `idx_survey_questions_survey_id` (`survey_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `survey_tokens` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `survey_id` INT NOT NULL,
    `graduate_id` INT NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `expires_at` TIMESTAMP NOT NULL,
    `submitted_at` TIMESTAMP NULL DEFAULT NULL,
    `ip_address` VARCHAR(45) DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_survey_tokens_token` (`token`),
    KEY `idx_survey_tokens_survey_id` (`survey_id`),
    KEY `idx_survey_tokens_graduate_id` (`graduate_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `survey_responses` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `survey_id` INT DEFAULT NULL,
    `graduate_id` INT DEFAULT NULL,
    `responses` JSON DEFAULT NULL,
    `submitted_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `graduate_account_id` INT DEFAULT NULL,
    `region_code` VARCHAR(20) DEFAULT NULL,
    `region_name` VARCHAR(120) DEFAULT NULL,
    `province_code` VARCHAR(20) DEFAULT NULL,
    `province_name` VARCHAR(120) DEFAULT NULL,
    `city_code` VARCHAR(20) DEFAULT NULL,
    `city_name` VARCHAR(120) DEFAULT NULL,
    `barangay_code` VARCHAR(20) DEFAULT NULL,
    `barangay_name` VARCHAR(120) DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_survey_responses_survey_id` (`survey_id`),
    KEY `idx_survey_responses_graduate_id` (`graduate_id`),
    KEY `idx_survey_responses_graduate_account_id` (`graduate_account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `graduate_accounts` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `graduate_id` INT NOT NULL,
    `email` VARCHAR(150) DEFAULT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `status` ENUM('pending_verification','active','inactive','rejected') NOT NULL DEFAULT 'pending_verification',
    `alumni_verification_status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    `alumni_verification_reason` TEXT DEFAULT NULL,
    `alumni_verification_reviewed_by` INT DEFAULT NULL,
    `alumni_verification_reviewed_at` DATETIME DEFAULT NULL,
    `alumni_verification_submitted_at` DATETIME DEFAULT NULL,
    `source_survey_response_id` INT DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `last_login_at` DATETIME DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_graduate_accounts_graduate_id` (`graduate_id`),
    UNIQUE KEY `uq_graduate_accounts_email` (`email`),
    KEY `idx_graduate_accounts_reviewed_by` (`alumni_verification_reviewed_by`),
    KEY `idx_graduate_accounts_source_response` (`source_survey_response_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `graduate_password_resets` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `graduate_account_id` INT NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `otp_hash` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME NOT NULL,
    `attempt_count` INT NOT NULL DEFAULT 0,
    `verified_at` DATETIME DEFAULT NULL,
    `verified_token_hash` VARCHAR(255) DEFAULT NULL,
    `verified_expires_at` DATETIME DEFAULT NULL,
    `used_at` DATETIME DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_graduate_password_resets_account` (`graduate_account_id`),
    KEY `idx_graduate_password_resets_email` (`email`),
    KEY `idx_graduate_password_resets_verified_token` (`verified_token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `graduate_profile_images` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `graduate_account_id` INT NOT NULL,
    `file_path` VARCHAR(255) NOT NULL,
    `original_file_name` VARCHAR(255) DEFAULT NULL,
    `mime_type` VARCHAR(120) DEFAULT NULL,
    `file_size_bytes` INT DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_graduate_profile_images_account` (`graduate_account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `graduate_cover_images` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `graduate_account_id` INT NOT NULL,
    `file_path` VARCHAR(255) NOT NULL,
    `original_file_name` VARCHAR(255) DEFAULT NULL,
    `mime_type` VARCHAR(120) DEFAULT NULL,
    `file_size_bytes` INT DEFAULT NULL,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_graduate_cover_images_account` (`graduate_account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `graduate_presence` (
    `graduate_id` INT NOT NULL,
    `status` ENUM('online','away','offline') DEFAULT 'offline',
    `last_seen` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`graduate_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `alumni_import_history` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `file_name` VARCHAR(255) NOT NULL,
    `worksheet_name` VARCHAR(255) DEFAULT NULL,
    `total_rows` INT DEFAULT 0,
    `imported_rows` INT DEFAULT 0,
    `skipped_rows` INT DEFAULT 0,
    `duplicate_rows` INT DEFAULT 0,
    `imported_by` INT DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_alumni_import_history_imported_by` (`imported_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `registered_alumni` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `full_name` VARCHAR(255) NOT NULL,
    `normalized_name` VARCHAR(255) NOT NULL,
    `course_id` INT DEFAULT NULL,
    `course_name` VARCHAR(255) DEFAULT NULL,
    `course_code` VARCHAR(50) DEFAULT NULL,
    `batch_year` INT NOT NULL,
    `registration_status` ENUM('Unclaimed','Registered','Verified','Inactive') DEFAULT 'Unclaimed',
    `linked_user_id` INT DEFAULT NULL,
    `source_file` VARCHAR(255) DEFAULT NULL,
    `import_batch_id` INT DEFAULT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `archived_at` DATETIME DEFAULT NULL,
    `archived_by` INT DEFAULT NULL,
    `restored_at` DATETIME DEFAULT NULL,
    `restored_by` INT DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_registered_alumni_linked_user` (`linked_user_id`),
    KEY `idx_registered_alumni_name_batch` (`normalized_name`, `batch_year`),
    KEY `idx_registered_alumni_course_batch` (`course_id`, `batch_year`),
    KEY `idx_registered_alumni_import_batch` (`import_batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `alumni_supporting_documents` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `graduate_account_id` INT NOT NULL,
    `graduate_id` INT NOT NULL,
    `document_type` ENUM('certificate','training','seminar','award','other') NOT NULL DEFAULT 'certificate',
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT DEFAULT NULL,
    `original_file_name` VARCHAR(255) NOT NULL,
    `stored_file_name` VARCHAR(255) NOT NULL,
    `file_path` VARCHAR(500) NOT NULL,
    `mime_type` VARCHAR(100) DEFAULT NULL,
    `file_size_bytes` INT DEFAULT NULL,
    `is_verified` TINYINT(1) NOT NULL DEFAULT 0,
    `is_active` TINYINT(1) NOT NULL DEFAULT 1,
    `uploaded_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `verified_at` DATETIME DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_alumni_docs_account_active` (`graduate_account_id`, `is_active`),
    KEY `idx_alumni_docs_graduate_active` (`graduate_id`, `is_active`),
    KEY `idx_alumni_docs_type` (`document_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `forum_posts` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `graduate_id` INT NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL,
    `category` VARCHAR(100) NOT NULL,
    `status` ENUM('approved','hidden') NOT NULL DEFAULT 'approved',
    `media_url` VARCHAR(500) DEFAULT NULL,
    `media_type` ENUM('image','video','document') DEFAULT NULL,
    `is_edited` TINYINT(1) DEFAULT 0,
    `is_deleted` TINYINT(1) DEFAULT 0,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_forum_posts_graduate_id` (`graduate_id`),
    KEY `idx_forum_posts_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `forum_post_media` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `post_id` INT NOT NULL,
    `file_url` VARCHAR(500) NOT NULL,
    `file_name` VARCHAR(255) DEFAULT NULL,
    `file_type` ENUM('image','video','document') NOT NULL,
    `file_size` INT DEFAULT NULL,
    `mime_type` VARCHAR(100) DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_forum_post_media_post_id` (`post_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `forum_comments` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `post_id` INT NOT NULL,
    `graduate_id` INT NOT NULL,
    `content` TEXT NOT NULL,
    `status` ENUM('approved','hidden') NOT NULL DEFAULT 'approved',
    `is_edited` TINYINT(1) DEFAULT 0,
    `is_deleted` TINYINT(1) DEFAULT 0,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_forum_comments_post_id` (`post_id`),
    KEY `idx_forum_comments_graduate_id` (`graduate_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `forum_post_likes` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `post_id` INT NOT NULL,
    `graduate_id` INT NOT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_forum_post_likes_post_graduate` (`post_id`, `graduate_id`),
    KEY `idx_forum_post_likes_graduate_id` (`graduate_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `forum_reports` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `post_id` INT DEFAULT NULL,
    `comment_id` INT DEFAULT NULL,
    `reporter_graduate_id` INT NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `description` TEXT DEFAULT NULL,
    `status` ENUM('pending','resolved','dismissed') DEFAULT 'pending',
    `reviewed_by` INT DEFAULT NULL,
    `reviewed_at` TIMESTAMP NULL DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_forum_reports_post_id` (`post_id`),
    KEY `idx_forum_reports_comment_id` (`comment_id`),
    KEY `idx_forum_reports_reporter` (`reporter_graduate_id`),
    KEY `idx_forum_reports_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `forum_activity_logs` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `graduate_id` INT NOT NULL,
    `action` ENUM('post_created','post_edited','post_deleted','comment_created','comment_edited','comment_deleted','post_liked','post_unliked','media_uploaded') NOT NULL,
    `post_id` INT DEFAULT NULL,
    `comment_id` INT DEFAULT NULL,
    `details` JSON DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_forum_activity_graduate_id` (`graduate_id`),
    KEY `idx_forum_activity_action` (`action`),
    KEY `idx_forum_activity_created_at` (`created_at`),
    KEY `idx_forum_activity_post_id` (`post_id`),
    KEY `idx_forum_activity_comment_id` (`comment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `forum_chat_rooms` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) DEFAULT NULL,
    `type` ENUM('direct','group') DEFAULT 'direct',
    `created_by` INT DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_chat_rooms_type` (`type`),
    KEY `idx_chat_rooms_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `forum_chat_members` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `room_id` INT NOT NULL,
    `graduate_id` INT NOT NULL,
    `joined_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `last_read_at` TIMESTAMP NULL DEFAULT NULL,
    `last_read_message_id` INT DEFAULT NULL,
    `is_admin` TINYINT(1) DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_chat_members_room_graduate` (`room_id`, `graduate_id`),
    KEY `idx_chat_members_graduate_id` (`graduate_id`),
    KEY `idx_chat_members_read_message` (`room_id`, `graduate_id`, `last_read_message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `forum_chat_messages` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `room_id` INT NOT NULL,
    `graduate_id` INT NOT NULL,
    `message` TEXT DEFAULT NULL,
    `message_type` ENUM('text','image','file','mixed','system') DEFAULT 'text',
    `file_url` VARCHAR(500) DEFAULT NULL,
    `file_name` VARCHAR(255) DEFAULT NULL,
    `file_size` INT DEFAULT NULL,
    `is_edited` TINYINT(1) DEFAULT 0,
    `is_deleted` TINYINT(1) DEFAULT 0,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_chat_messages_room_id` (`room_id`),
    KEY `idx_chat_messages_graduate_id` (`graduate_id`),
    KEY `idx_chat_messages_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `forum_chat_message_attachments` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `message_id` INT NOT NULL,
    `room_id` INT NOT NULL,
    `uploaded_by` INT NOT NULL,
    `file_url` VARCHAR(500) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `original_name` VARCHAR(255) DEFAULT NULL,
    `file_type` ENUM('image','video','document','audio','other') NOT NULL DEFAULT 'other',
    `mime_type` VARCHAR(100) DEFAULT NULL,
    `file_size` INT DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_chat_attachments_message_id` (`message_id`),
    KEY `idx_chat_attachments_room_id` (`room_id`),
    KEY `idx_chat_attachments_uploaded_by` (`uploaded_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `job_posts` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `posted_by_account_id` INT NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `company` VARCHAR(150) NOT NULL,
    `location` VARCHAR(150) DEFAULT NULL,
    `salary_range` VARCHAR(100) DEFAULT NULL,
    `job_type` ENUM('full_time','part_time','contract','internship','remote') DEFAULT 'full_time',
    `industry` VARCHAR(100) DEFAULT NULL,
    `description` TEXT NOT NULL,
    `qualifications` TEXT DEFAULT NULL,
    `required_skills` TEXT DEFAULT NULL,
    `course_program_fit` TEXT DEFAULT NULL,
    `application_deadline` DATE DEFAULT NULL,
    `contact_email` VARCHAR(150) DEFAULT NULL,
    `application_link` VARCHAR(500) DEFAULT NULL,
    `application_method` VARCHAR(120) DEFAULT NULL,
    `is_active` TINYINT(1) DEFAULT 1,
    `approval_status` VARCHAR(20) NOT NULL DEFAULT 'approved',
    `approval_reviewed_by` INT DEFAULT NULL,
    `approval_reviewed_at` DATETIME DEFAULT NULL,
    `approval_notes` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_job_posts_account` (`posted_by_account_id`),
    KEY `idx_job_posts_active` (`is_active`),
    KEY `idx_job_posts_deadline` (`application_deadline`),
    KEY `idx_job_posts_approval_status` (`approval_status`),
    KEY `idx_job_posts_approval_reviewed_by` (`approval_reviewed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `job_applications` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `job_post_id` INT NOT NULL,
    `applicant_account_id` INT NOT NULL,
    `cover_letter` TEXT DEFAULT NULL,
    `resume_path` VARCHAR(255) DEFAULT NULL,
    `status` ENUM('submitted','reviewed','shortlisted','rejected','withdrawn') DEFAULT 'submitted',
    `applied_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_job_applications_post_applicant` (`job_post_id`, `applicant_account_id`),
    KEY `idx_job_applications_applicant` (`applicant_account_id`),
    KEY `idx_job_applications_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `mentors` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `graduate_account_id` INT NOT NULL,
    `graduate_id` INT NOT NULL,
    `current_job_title` VARCHAR(150) NOT NULL,
    `company` VARCHAR(150) DEFAULT NULL,
    `industry` VARCHAR(120) DEFAULT NULL,
    `job_alignment` VARCHAR(80) DEFAULT NULL,
    `mentor_type` VARCHAR(80) DEFAULT NULL,
    `max_members` INT UNSIGNED NOT NULL DEFAULT 5,
    `post_status` ENUM('open','closed') NOT NULL DEFAULT 'open',
    `skills` TEXT DEFAULT NULL,
    `bio` TEXT DEFAULT NULL,
    `availability_status` VARCHAR(160) NOT NULL DEFAULT 'Weekdays, flexible hours',
    `preferred_topics` TEXT DEFAULT NULL,
    `is_active` TINYINT(1) DEFAULT 1,
    `approval_status` VARCHAR(20) NOT NULL DEFAULT 'approved',
    `approval_reviewed_by` INT DEFAULT NULL,
    `approval_reviewed_at` DATETIME DEFAULT NULL,
    `approval_notes` TEXT DEFAULT NULL,
    `proof_file_path` VARCHAR(255) DEFAULT NULL,
    `proof_original_name` VARCHAR(255) DEFAULT NULL,
    `proof_mime_type` VARCHAR(120) DEFAULT NULL,
    `proof_file_size` INT DEFAULT NULL,
    `proof_uploaded_at` DATETIME DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_mentors_account` (`graduate_account_id`),
    KEY `idx_mentors_graduate` (`graduate_id`),
    KEY `idx_mentors_active` (`is_active`),
    KEY `idx_mentors_approval_status` (`approval_status`),
    KEY `idx_mentors_approval_reviewed_by` (`approval_reviewed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `mentorship_requests` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `mentor_id` INT NOT NULL,
    `mentee_account_id` INT NOT NULL,
    `message` TEXT DEFAULT NULL,
    `status` ENUM('pending','accepted','declined','cancelled','completed') DEFAULT 'pending',
    `responded_at` DATETIME DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_mentorship_request_pair` (`mentor_id`, `mentee_account_id`),
    KEY `idx_mentorship_requests_mentee` (`mentee_account_id`),
    KEY `idx_mentorship_requests_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `mentorship_messages` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `mentorship_request_id` INT NOT NULL,
    `sender_account_id` INT NOT NULL,
    `body` TEXT NOT NULL,
    `is_read` TINYINT(1) DEFAULT 0,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_mentorship_messages_request` (`mentorship_request_id`),
    KEY `idx_mentorship_messages_sender` (`sender_account_id`),
    KEY `idx_mentorship_messages_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `mentorship_feedback` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `mentorship_request_id` INT NOT NULL,
    `mentee_account_id` INT NOT NULL,
    `rating` TINYINT NOT NULL,
    `comment` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_mentorship_feedback_request_mentee` (`mentorship_request_id`, `mentee_account_id`),
    KEY `idx_mentorship_feedback_mentee` (`mentee_account_id`),
    CONSTRAINT `chk_mentorship_feedback_rating` CHECK (`rating` >= 1 AND `rating` <= 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `mentorship_mentor_feedback` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `mentor_account_id` INT NOT NULL,
    `mentorship_request_id` INT NOT NULL,
    `mentee_account_id` INT NOT NULL,
    `feedback_summary` TEXT DEFAULT NULL,
    `recommended_next_steps` TEXT DEFAULT NULL,
    `strengths` TEXT DEFAULT NULL,
    `improvement_areas` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_mentor_feedback_request` (`mentorship_request_id`),
    KEY `idx_mentor_feedback_mentor` (`mentor_account_id`),
    KEY `idx_mentor_feedback_mentee` (`mentee_account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `survey_reminder_logs` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `survey_id` INT NOT NULL,
    `graduate_id` INT NOT NULL,
    `recipient_email` VARCHAR(150) NOT NULL,
    `token` VARCHAR(64) DEFAULT NULL,
    `subject` VARCHAR(255) DEFAULT NULL,
    `status` ENUM('sent','failed') NOT NULL DEFAULT 'sent',
    `error_message` TEXT DEFAULT NULL,
    `sent_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_survey_reminder_lookup` (`survey_id`, `graduate_id`, `status`, `sent_at`),
    KEY `idx_survey_reminder_graduate` (`graduate_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `notification_reads` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `target_type` ENUM('admin','graduate') NOT NULL,
    `target_id` INT NOT NULL,
    `notification_key` VARCHAR(190) NOT NULL,
    `read_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_notification_reads_target_key` (`target_type`, `target_id`, `notification_key`),
    KEY `idx_notification_reads_target` (`target_type`, `target_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `admin_password_resets`
    ADD CONSTRAINT `fk_admin_password_resets_admin_user`
    FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `admin_profile_images`
    ADD CONSTRAINT `fk_admin_profile_images_admin_user`
    FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `system_settings`
    ADD CONSTRAINT `fk_system_settings_updated_by`
    FOREIGN KEY (`updated_by_admin_user_id`) REFERENCES `admin_users` (`id`)
    ON DELETE SET NULL;

ALTER TABLE `graduates`
    ADD CONSTRAINT `fk_graduates_program`
    FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`)
    ON DELETE SET NULL;

ALTER TABLE `announcements`
    ADD CONSTRAINT `fk_announcements_graduate`
    FOREIGN KEY (`graduate_id`) REFERENCES `graduates` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `announcements`
    ADD CONSTRAINT `fk_announcements_admin`
    FOREIGN KEY (`created_by_admin_id`) REFERENCES `admin_users` (`id`)
    ON DELETE SET NULL;

ALTER TABLE `announcement_images`
    ADD CONSTRAINT `fk_announcement_images_announcement`
    FOREIGN KEY (`announcement_id`) REFERENCES `announcements` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `employment`
    ADD CONSTRAINT `fk_employment_graduate`
    FOREIGN KEY (`graduate_id`) REFERENCES `graduates` (`id`);

ALTER TABLE `survey_questions`
    ADD CONSTRAINT `fk_survey_questions_survey`
    FOREIGN KEY (`survey_id`) REFERENCES `surveys` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `survey_tokens`
    ADD CONSTRAINT `fk_survey_tokens_survey`
    FOREIGN KEY (`survey_id`) REFERENCES `surveys` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `survey_tokens`
    ADD CONSTRAINT `fk_survey_tokens_graduate`
    FOREIGN KEY (`graduate_id`) REFERENCES `graduates` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `survey_responses`
    ADD CONSTRAINT `fk_survey_responses_survey`
    FOREIGN KEY (`survey_id`) REFERENCES `surveys` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `survey_responses`
    ADD CONSTRAINT `fk_survey_responses_graduate`
    FOREIGN KEY (`graduate_id`) REFERENCES `graduates` (`id`)
    ON DELETE SET NULL;

ALTER TABLE `survey_responses`
    ADD CONSTRAINT `fk_survey_responses_graduate_account`
    FOREIGN KEY (`graduate_account_id`) REFERENCES `graduate_accounts` (`id`)
    ON DELETE SET NULL;

ALTER TABLE `graduate_accounts`
    ADD CONSTRAINT `fk_graduate_accounts_graduate`
    FOREIGN KEY (`graduate_id`) REFERENCES `graduates` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `graduate_accounts`
    ADD CONSTRAINT `fk_graduate_accounts_reviewed_by`
    FOREIGN KEY (`alumni_verification_reviewed_by`) REFERENCES `admin_users` (`id`)
    ON DELETE SET NULL;

ALTER TABLE `graduate_accounts`
    ADD CONSTRAINT `fk_graduate_accounts_source_response`
    FOREIGN KEY (`source_survey_response_id`) REFERENCES `survey_responses` (`id`)
    ON DELETE SET NULL;

ALTER TABLE `graduate_password_resets`
    ADD CONSTRAINT `fk_graduate_password_resets_account`
    FOREIGN KEY (`graduate_account_id`) REFERENCES `graduate_accounts` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `graduate_profile_images`
    ADD CONSTRAINT `fk_graduate_profile_images_account`
    FOREIGN KEY (`graduate_account_id`) REFERENCES `graduate_accounts` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `graduate_cover_images`
    ADD CONSTRAINT `fk_graduate_cover_images_account`
    FOREIGN KEY (`graduate_account_id`) REFERENCES `graduate_accounts` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `graduate_presence`
    ADD CONSTRAINT `fk_graduate_presence_graduate`
    FOREIGN KEY (`graduate_id`) REFERENCES `graduates` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `alumni_import_history`
    ADD CONSTRAINT `fk_alumni_import_history_admin`
    FOREIGN KEY (`imported_by`) REFERENCES `admin_users` (`id`)
    ON DELETE SET NULL;

ALTER TABLE `registered_alumni`
    ADD CONSTRAINT `fk_registered_alumni_program`
    FOREIGN KEY (`course_id`) REFERENCES `programs` (`id`)
    ON DELETE SET NULL;

ALTER TABLE `registered_alumni`
    ADD CONSTRAINT `fk_registered_alumni_linked_user`
    FOREIGN KEY (`linked_user_id`) REFERENCES `graduate_accounts` (`id`)
    ON DELETE SET NULL;

ALTER TABLE `registered_alumni`
    ADD CONSTRAINT `fk_registered_alumni_import_batch`
    FOREIGN KEY (`import_batch_id`) REFERENCES `alumni_import_history` (`id`)
    ON DELETE SET NULL;

ALTER TABLE `alumni_supporting_documents`
    ADD CONSTRAINT `fk_alumni_docs_account`
    FOREIGN KEY (`graduate_account_id`) REFERENCES `graduate_accounts` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `alumni_supporting_documents`
    ADD CONSTRAINT `fk_alumni_docs_graduate`
    FOREIGN KEY (`graduate_id`) REFERENCES `graduates` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `forum_posts`
    ADD CONSTRAINT `fk_forum_posts_graduate`
    FOREIGN KEY (`graduate_id`) REFERENCES `graduates` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `forum_post_media`
    ADD CONSTRAINT `fk_forum_post_media_post`
    FOREIGN KEY (`post_id`) REFERENCES `forum_posts` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `forum_comments`
    ADD CONSTRAINT `fk_forum_comments_post`
    FOREIGN KEY (`post_id`) REFERENCES `forum_posts` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `forum_comments`
    ADD CONSTRAINT `fk_forum_comments_graduate`
    FOREIGN KEY (`graduate_id`) REFERENCES `graduates` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `forum_post_likes`
    ADD CONSTRAINT `fk_forum_post_likes_post`
    FOREIGN KEY (`post_id`) REFERENCES `forum_posts` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `forum_post_likes`
    ADD CONSTRAINT `fk_forum_post_likes_graduate`
    FOREIGN KEY (`graduate_id`) REFERENCES `graduates` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `forum_reports`
    ADD CONSTRAINT `fk_forum_reports_post`
    FOREIGN KEY (`post_id`) REFERENCES `forum_posts` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `forum_reports`
    ADD CONSTRAINT `fk_forum_reports_comment`
    FOREIGN KEY (`comment_id`) REFERENCES `forum_comments` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `forum_reports`
    ADD CONSTRAINT `fk_forum_reports_reporter`
    FOREIGN KEY (`reporter_graduate_id`) REFERENCES `graduates` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `forum_activity_logs`
    ADD CONSTRAINT `fk_forum_activity_graduate`
    FOREIGN KEY (`graduate_id`) REFERENCES `graduates` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `forum_activity_logs`
    ADD CONSTRAINT `fk_forum_activity_post`
    FOREIGN KEY (`post_id`) REFERENCES `forum_posts` (`id`)
    ON DELETE SET NULL;

ALTER TABLE `forum_activity_logs`
    ADD CONSTRAINT `fk_forum_activity_comment`
    FOREIGN KEY (`comment_id`) REFERENCES `forum_comments` (`id`)
    ON DELETE SET NULL;

ALTER TABLE `forum_chat_rooms`
    ADD CONSTRAINT `fk_chat_rooms_created_by`
    FOREIGN KEY (`created_by`) REFERENCES `graduates` (`id`)
    ON DELETE SET NULL;

ALTER TABLE `forum_chat_members`
    ADD CONSTRAINT `fk_chat_members_room`
    FOREIGN KEY (`room_id`) REFERENCES `forum_chat_rooms` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `forum_chat_members`
    ADD CONSTRAINT `fk_chat_members_graduate`
    FOREIGN KEY (`graduate_id`) REFERENCES `graduates` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `forum_chat_messages`
    ADD CONSTRAINT `fk_chat_messages_room`
    FOREIGN KEY (`room_id`) REFERENCES `forum_chat_rooms` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `forum_chat_messages`
    ADD CONSTRAINT `fk_chat_messages_graduate`
    FOREIGN KEY (`graduate_id`) REFERENCES `graduates` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `forum_chat_message_attachments`
    ADD CONSTRAINT `fk_chat_attachments_message`
    FOREIGN KEY (`message_id`) REFERENCES `forum_chat_messages` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `forum_chat_message_attachments`
    ADD CONSTRAINT `fk_chat_attachments_room`
    FOREIGN KEY (`room_id`) REFERENCES `forum_chat_rooms` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `forum_chat_message_attachments`
    ADD CONSTRAINT `fk_chat_attachments_uploaded_by`
    FOREIGN KEY (`uploaded_by`) REFERENCES `graduates` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `job_posts`
    ADD CONSTRAINT `fk_job_posts_account`
    FOREIGN KEY (`posted_by_account_id`) REFERENCES `graduate_accounts` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `job_posts`
    ADD CONSTRAINT `fk_job_posts_approval_reviewed_by`
    FOREIGN KEY (`approval_reviewed_by`) REFERENCES `admin_users` (`id`)
    ON DELETE SET NULL;

ALTER TABLE `job_applications`
    ADD CONSTRAINT `fk_job_applications_post`
    FOREIGN KEY (`job_post_id`) REFERENCES `job_posts` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `job_applications`
    ADD CONSTRAINT `fk_job_applications_applicant`
    FOREIGN KEY (`applicant_account_id`) REFERENCES `graduate_accounts` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `mentors`
    ADD CONSTRAINT `fk_mentors_account`
    FOREIGN KEY (`graduate_account_id`) REFERENCES `graduate_accounts` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `mentors`
    ADD CONSTRAINT `fk_mentors_graduate`
    FOREIGN KEY (`graduate_id`) REFERENCES `graduates` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `mentors`
    ADD CONSTRAINT `fk_mentors_approval_reviewed_by`
    FOREIGN KEY (`approval_reviewed_by`) REFERENCES `admin_users` (`id`)
    ON DELETE SET NULL;

ALTER TABLE `mentorship_requests`
    ADD CONSTRAINT `fk_mentorship_requests_mentor`
    FOREIGN KEY (`mentor_id`) REFERENCES `mentors` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `mentorship_requests`
    ADD CONSTRAINT `fk_mentorship_requests_mentee`
    FOREIGN KEY (`mentee_account_id`) REFERENCES `graduate_accounts` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `mentorship_messages`
    ADD CONSTRAINT `fk_mentorship_messages_request`
    FOREIGN KEY (`mentorship_request_id`) REFERENCES `mentorship_requests` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `mentorship_messages`
    ADD CONSTRAINT `fk_mentorship_messages_sender`
    FOREIGN KEY (`sender_account_id`) REFERENCES `graduate_accounts` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `mentorship_feedback`
    ADD CONSTRAINT `fk_mentorship_feedback_request`
    FOREIGN KEY (`mentorship_request_id`) REFERENCES `mentorship_requests` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `mentorship_feedback`
    ADD CONSTRAINT `fk_mentorship_feedback_mentee`
    FOREIGN KEY (`mentee_account_id`) REFERENCES `graduate_accounts` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `mentorship_mentor_feedback`
    ADD CONSTRAINT `fk_mentor_feedback_mentor_account`
    FOREIGN KEY (`mentor_account_id`) REFERENCES `graduate_accounts` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `mentorship_mentor_feedback`
    ADD CONSTRAINT `fk_mentor_feedback_request`
    FOREIGN KEY (`mentorship_request_id`) REFERENCES `mentorship_requests` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `mentorship_mentor_feedback`
    ADD CONSTRAINT `fk_mentor_feedback_mentee_account`
    FOREIGN KEY (`mentee_account_id`) REFERENCES `graduate_accounts` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `survey_reminder_logs`
    ADD CONSTRAINT `fk_survey_reminder_logs_survey`
    FOREIGN KEY (`survey_id`) REFERENCES `surveys` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `survey_reminder_logs`
    ADD CONSTRAINT `fk_survey_reminder_logs_graduate`
    FOREIGN KEY (`graduate_id`) REFERENCES `graduates` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `website_content`
    ADD CONSTRAINT `fk_website_content_updated_by`
    FOREIGN KEY (`updated_by_admin_user_id`) REFERENCES `admin_users` (`id`)
    ON DELETE SET NULL;

ALTER TABLE `faq_items`
    ADD CONSTRAINT `fk_faq_items_category`
    FOREIGN KEY (`category_id`) REFERENCES `faq_categories` (`id`)
    ON DELETE CASCADE;

ALTER TABLE `privacy_policy_meta`
    ADD CONSTRAINT `fk_privacy_policy_meta_updated_by`
    FOREIGN KEY (`updated_by_admin_user_id`) REFERENCES `admin_users` (`id`)
    ON DELETE SET NULL;
