<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../api/config/database.php';

$requirements = [
    'admin_users' => ['id', 'username', 'email', 'password', 'role', 'is_active'],
    'programs' => ['id', 'name', 'code'],
    'graduates' => ['id', 'student_id', 'first_name', 'last_name', 'name_extension', 'program_id', 'year_graduated', 'archived_at'],
    'surveys' => ['id', 'title', 'status', 'created_by', 'modified_by', 'modified_at', 'archived_at', 'status_before_archive'],
    'survey_questions' => ['id', 'survey_id', 'question_text', 'question_type'],
    'survey_tokens' => ['id', 'survey_id', 'graduate_id', 'token', 'expires_at'],
    'survey_responses' => ['id', 'survey_id', 'graduate_id', 'responses', 'graduate_account_id', 'region_code', 'province_code', 'city_code', 'barangay_code'],
    'graduate_accounts' => ['id', 'graduate_id', 'email', 'password_hash', 'status', 'alumni_verification_status', 'last_login_at'],
    'admin_password_resets' => ['id', 'admin_user_id', 'email', 'otp_hash', 'verified_token_hash', 'used_at'],
    'graduate_password_resets' => ['id', 'graduate_account_id', 'email', 'otp_hash', 'verified_token_hash', 'used_at'],
    'admin_profile_images' => ['id', 'admin_user_id', 'file_path'],
    'graduate_profile_images' => ['id', 'graduate_account_id', 'file_path'],
    'graduate_cover_images' => ['id', 'graduate_account_id', 'file_path'],
    'graduate_profiles' => ['id', 'graduate_account_id'],
    'system_settings' => ['id', 'setting_key', 'setting_value', 'setting_group'],
    'website_content' => ['id', 'page'],
    'faq_categories' => ['id'],
    'faq_items' => ['id', 'category_id'],
    'privacy_policy_meta' => ['id'],
    'privacy_sections' => ['id'],
    'alumni_import_history' => ['id'],
    'registered_alumni' => ['id', 'normalized_name', 'course_id', 'batch_year', 'archived_at'],
    'alumni_supporting_documents' => ['id', 'graduate_account_id', 'file_path'],
    'announcements' => ['id', 'title', 'status', 'cover_image_path'],
    'announcement_images' => ['id', 'announcement_id', 'file_path'],
    'forum_posts' => ['id', 'graduate_id', 'content', 'status'],
    'forum_post_media' => ['id', 'post_id', 'file_path'],
    'forum_comments' => ['id', 'post_id', 'graduate_id', 'comment', 'status'],
    'forum_post_likes' => ['id', 'post_id', 'graduate_id'],
    'forum_reports' => ['id', 'reporter_graduate_id', 'target_type', 'status', 'description'],
    'forum_activity_logs' => ['id', 'graduate_id', 'action'],
    'forum_chat_rooms' => ['id', 'created_by', 'is_group', 'last_message_at', 'group_image_path'],
    'forum_chat_members' => ['id', 'room_id', 'graduate_id', 'last_read_at', 'last_read_message_id'],
    'forum_chat_messages' => ['id', 'room_id', 'graduate_id', 'message', 'message_type', 'client_message_id', 'delivered_at', 'read_at', 'deleted_at'],
    'forum_chat_message_attachments' => ['id', 'room_id', 'message_id', 'uploaded_by', 'stored_name', 'storage_path', 'attachment_type'],
    'forum_chat_blocks' => ['id', 'blocker_id', 'blocked_id'],
    'graduate_presence' => ['graduate_id', 'last_active_at'],
    'job_posts' => ['id', 'posted_by_account_id', 'title', 'salary_range', 'course_program_fit', 'contact_email', 'application_link', 'requirements_file_path'],
    'job_applications' => ['id', 'job_post_id', 'applicant_account_id', 'status'],
    'mentors' => ['id', 'graduate_account_id', 'job_alignment', 'mentor_type', 'max_members', 'post_status', 'proof_file_path'],
    'mentorship_requests' => ['id', 'mentor_id', 'mentee_account_id', 'request_message', 'status', 'session_date', 'session_notes'],
    'mentorship_messages' => ['id', 'mentorship_request_id', 'sender_account_id', 'body'],
    'mentorship_feedback' => ['id', 'mentorship_request_id', 'mentee_account_id', 'rating', 'mentor_helpful', 'feedback_text'],
    'mentorship_mentor_feedback' => ['id', 'mentorship_request_id', 'mentor_account_id', 'mentee_attended', 'session_completed', 'remarks'],
    'survey_reminder_logs' => ['id', 'survey_id', 'graduate_id', 'email', 'subject', 'reminder_type', 'status', 'sent_at'],
    'notification_reads' => ['id', 'target_type', 'target_id', 'notification_key', 'read_at'],
    'ai_conversations' => ['id', 'admin_user_id', 'role', 'title'],
    'ai_messages' => ['id', 'conversation_id', 'sender', 'message', 'metadata'],
    'audit_trail' => ['user_id', 'user_name', 'user_role', 'action', 'module', 'description', 'record_id', 'previous_values', 'new_values', 'metadata'],
    'schema_migrations' => ['version', 'checksum', 'applied_at'],
];

$db = (new Database())->getConnection();
$rows = $db->query('SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE()')->fetchAll(PDO::FETCH_ASSOC);
$actual = [];
foreach ($rows as $row) $actual[(string) $row['TABLE_NAME']][(string) $row['COLUMN_NAME']] = true;

$failures = [];
foreach ($requirements as $table => $columns) {
    if (!isset($actual[$table])) {
        $failures[] = "missing table: {$table}";
        continue;
    }
    foreach ($columns as $column) {
        if (!isset($actual[$table][$column])) $failures[] = "missing column: {$table}.{$column}";
    }
}

$requiredIndexes = [
    ['forum_chat_messages', 'room_id,graduate_id,client_message_id', true],
    ['forum_chat_members', 'room_id,graduate_id', true],
    ['forum_chat_blocks', 'blocker_id,blocked_id', true],
    ['notification_reads', 'target_type,target_id,notification_key', true],
];
$indexRows = $db->query("SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE,
    GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS columns_list
    FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
    GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE")->fetchAll(PDO::FETCH_ASSOC);
foreach ($requiredIndexes as [$table, $signature, $unique]) {
    $found = false;
    foreach ($indexRows as $row) {
        if ($row['TABLE_NAME'] === $table && $row['columns_list'] === $signature && (!$unique || (int) $row['NON_UNIQUE'] === 0)) {
            $found = true;
            break;
        }
    }
    if (!$found) $failures[] = "missing index: {$table}({$signature})";
}

if ($failures !== []) {
    fwrite(STDERR, "Schema verification failed:\n- " . implode("\n- ", $failures) . "\n");
    exit(1);
}

echo 'Schema verification passed: ' . count($requirements) . " tables checked; no changes made.\n";
