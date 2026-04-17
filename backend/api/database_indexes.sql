-- Performance optimization indexes for GradTrack
-- Run this SQL file to add indexes that will speed up queries

-- Mentors table indexes
ALTER TABLE mentors ADD INDEX idx_active_approved (is_active, approval_status);
ALTER TABLE mentors ADD INDEX idx_graduate_account (graduate_account_id);
ALTER TABLE mentors ADD INDEX idx_graduate_id (graduate_id);
ALTER TABLE mentors ADD INDEX idx_industry (industry);
ALTER TABLE mentors ADD INDEX idx_created_at (created_at);

-- Mentorship requests indexes
ALTER TABLE mentorship_requests ADD INDEX idx_mentor_status (mentor_id, status);
ALTER TABLE mentorship_requests ADD INDEX idx_mentee_status (mentee_account_id, status);
ALTER TABLE mentorship_requests ADD INDEX idx_requested_at (requested_at);

-- Job posts indexes
ALTER TABLE job_posts ADD INDEX idx_active_approved (is_active, approval_status);
ALTER TABLE job_posts ADD INDEX idx_posted_by (posted_by_account_id);
ALTER TABLE job_posts ADD INDEX idx_job_type (job_type);
ALTER TABLE job_posts ADD INDEX idx_created_at (created_at);

-- Graduate accounts indexes
ALTER TABLE graduate_accounts ADD INDEX idx_graduate_id (graduate_id);

-- Graduates indexes
ALTER TABLE graduates ADD INDEX idx_program_id (program_id);
ALTER TABLE graduates ADD INDEX idx_year_graduated (year_graduated);

-- Mentorship feedback indexes
ALTER TABLE mentorship_feedback ADD INDEX idx_request_id (mentorship_request_id);

-- Graduate profile images indexes
ALTER TABLE graduate_profile_images ADD INDEX idx_graduate_account (graduate_account_id);
