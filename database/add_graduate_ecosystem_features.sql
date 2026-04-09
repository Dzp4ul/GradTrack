USE gradtrackdb;

-- =============================================
-- Graduate Account Layer (for alumni login)
-- =============================================
CREATE TABLE IF NOT EXISTS graduate_accounts (
	id INT AUTO_INCREMENT PRIMARY KEY,
	graduate_id INT NOT NULL,
	email VARCHAR(150) NOT NULL UNIQUE,
	password_hash VARCHAR(255) NOT NULL,
	status ENUM('active', 'inactive') DEFAULT 'active',
	source_survey_response_id INT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	last_login_at DATETIME NULL,
	UNIQUE KEY uq_graduate_accounts_graduate (graduate_id),
	FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE,
	FOREIGN KEY (source_survey_response_id) REFERENCES survey_responses(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Link a survey response to a created graduate account (optional linkage)
ALTER TABLE survey_responses
	ADD COLUMN graduate_account_id INT NULL,
	ADD INDEX idx_survey_responses_account (graduate_account_id),
	ADD CONSTRAINT fk_survey_responses_account
		FOREIGN KEY (graduate_account_id) REFERENCES graduate_accounts(id) ON DELETE SET NULL;

-- =============================================
-- Mentorship Tables
-- =============================================
CREATE TABLE IF NOT EXISTS mentors (
	id INT AUTO_INCREMENT PRIMARY KEY,
	graduate_account_id INT NOT NULL,
	graduate_id INT NOT NULL,
	current_job_title VARCHAR(150) NULL,
	company VARCHAR(150) NULL,
	industry VARCHAR(100) NULL,
	skills TEXT NULL,
	bio TEXT NULL,
	availability_status ENUM('available', 'busy', 'unavailable') DEFAULT 'available',
	preferred_topics TEXT NULL,
	is_active TINYINT(1) NOT NULL DEFAULT 1,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	UNIQUE KEY uq_mentor_account (graduate_account_id),
	FOREIGN KEY (graduate_account_id) REFERENCES graduate_accounts(id) ON DELETE CASCADE,
	FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mentorship_requests (
	id INT AUTO_INCREMENT PRIMARY KEY,
	mentor_id INT NOT NULL,
	mentee_account_id INT NOT NULL,
	request_message TEXT NULL,
	status ENUM('pending', 'accepted', 'declined', 'completed') DEFAULT 'pending',
	requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	responded_at DATETIME NULL,
	completed_at DATETIME NULL,
	FOREIGN KEY (mentor_id) REFERENCES mentors(id) ON DELETE CASCADE,
	FOREIGN KEY (mentee_account_id) REFERENCES graduate_accounts(id) ON DELETE CASCADE,
	INDEX idx_mentor_status (mentor_id, status),
	INDEX idx_mentee_status (mentee_account_id, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mentorship_messages (
	id INT AUTO_INCREMENT PRIMARY KEY,
	mentorship_request_id INT NOT NULL,
	sender_account_id INT NOT NULL,
	message_text TEXT NOT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (mentorship_request_id) REFERENCES mentorship_requests(id) ON DELETE CASCADE,
	FOREIGN KEY (sender_account_id) REFERENCES graduate_accounts(id) ON DELETE CASCADE,
	INDEX idx_request_messages (mentorship_request_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mentorship_feedback (
	id INT AUTO_INCREMENT PRIMARY KEY,
	mentorship_request_id INT NOT NULL,
	mentee_account_id INT NOT NULL,
	rating TINYINT NOT NULL,
	feedback_text TEXT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	UNIQUE KEY uq_feedback_request (mentorship_request_id),
	FOREIGN KEY (mentorship_request_id) REFERENCES mentorship_requests(id) ON DELETE CASCADE,
	FOREIGN KEY (mentee_account_id) REFERENCES graduate_accounts(id) ON DELETE CASCADE,
	CHECK (rating >= 1 AND rating <= 5)
) ENGINE=InnoDB;

-- =============================================
-- Job Portal Tables
-- =============================================
CREATE TABLE IF NOT EXISTS job_posts (
	id INT AUTO_INCREMENT PRIMARY KEY,
	posted_by_account_id INT NOT NULL,
	title VARCHAR(180) NOT NULL,
	company VARCHAR(180) NOT NULL,
	location VARCHAR(180) NULL,
	job_type ENUM('full_time', 'part_time', 'contract', 'internship', 'remote') DEFAULT 'full_time',
	industry VARCHAR(120) NULL,
	description TEXT NOT NULL,
	qualifications TEXT NULL,
	required_skills TEXT NULL,
	application_deadline DATE NULL,
	application_method TEXT NULL,
	is_active TINYINT(1) NOT NULL DEFAULT 1,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	FOREIGN KEY (posted_by_account_id) REFERENCES graduate_accounts(id) ON DELETE CASCADE,
	INDEX idx_job_posts_lookup (is_active, job_type, industry)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_applications (
	id INT AUTO_INCREMENT PRIMARY KEY,
	job_post_id INT NOT NULL,
	applicant_account_id INT NOT NULL,
	application_note TEXT NULL,
	status ENUM('pending', 'reviewed', 'shortlisted', 'rejected', 'hired') DEFAULT 'pending',
	applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	UNIQUE KEY uq_job_application (job_post_id, applicant_account_id),
	FOREIGN KEY (job_post_id) REFERENCES job_posts(id) ON DELETE CASCADE,
	FOREIGN KEY (applicant_account_id) REFERENCES graduate_accounts(id) ON DELETE CASCADE,
	INDEX idx_job_applications_status (status)
) ENGINE=InnoDB;
