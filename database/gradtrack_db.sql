-- GradTrack Database Schema
-- Run this SQL in phpMyAdmin or MySQL CLI

CREATE DATABASE IF NOT EXISTS gradtrack_db;
USE gradtrack_db;

-- =============================================
-- Programs Table
-- =============================================
CREATE TABLE programs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(10) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- =============================================
-- Admin Users Table
-- =============================================
CREATE TABLE admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(100),
  role ENUM('super_admin', 'admin') DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- =============================================
-- Graduates Table
-- =============================================
CREATE TABLE graduates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(20) UNIQUE,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(100) UNIQUE,
  phone VARCHAR(20),
  program_id INT,
  year_graduated INT,
  address TEXT,
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =============================================
-- Employment Records Table
-- =============================================
CREATE TABLE employment (
  id INT AUTO_INCREMENT PRIMARY KEY,
  graduate_id INT NOT NULL,
  company_name VARCHAR(200),
  job_title VARCHAR(200),
  industry VARCHAR(100),
  employment_status ENUM('employed', 'unemployed', 'self_employed', 'freelance') DEFAULT 'unemployed',
  is_aligned ENUM('aligned', 'partially_aligned', 'not_aligned') DEFAULT 'not_aligned',
  date_hired DATE,
  monthly_salary DECIMAL(10,2),
  time_to_employment INT DEFAULT 0 COMMENT 'Months after graduation',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =============================================
-- Surveys Table
-- =============================================
CREATE TABLE surveys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  status ENUM('active', 'inactive', 'draft') DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- =============================================
-- Survey Questions Table
-- =============================================
CREATE TABLE survey_questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  question_text TEXT NOT NULL,
  question_type ENUM('text', 'multiple_choice', 'rating', 'checkbox') DEFAULT 'text',
  options JSON,
  is_required TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =============================================
-- Survey Responses Table
-- =============================================
CREATE TABLE survey_responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  graduate_id INT NOT NULL,
  responses JSON,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =============================================
-- Announcements Table
-- =============================================
CREATE TABLE announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  category ENUM('general', 'event', 'opportunity', 'urgent') DEFAULT 'general',
  status ENUM('published', 'draft', 'archived') DEFAULT 'draft',
  published_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- =============================================
-- System Settings Table
-- =============================================
CREATE TABLE system_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT,
  setting_group VARCHAR(50) DEFAULT 'general',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- =============================================
-- Employment Trends (yearly snapshots)
-- =============================================
CREATE TABLE employment_trends (
  id INT AUTO_INCREMENT PRIMARY KEY,
  year INT NOT NULL,
  employment_rate DECIMAL(5,2) DEFAULT 0,
  alignment_rate DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- =============================================
-- Top Job Listings
-- =============================================
CREATE TABLE job_listings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_title VARCHAR(200) NOT NULL,
  company_name VARCHAR(200) NOT NULL,
  graduate_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- =============================================
-- SEED DATA
-- =============================================

-- Programs
INSERT INTO programs (name, code, description) VALUES
('Bachelor of Science in Information Technology', 'BSIT', 'Information Technology program'),
('Bachelor of Secondary Education', 'BSED', 'Secondary Education program'),
('Bachelor of Science in Business Administration', 'BSBA', 'Business Administration program');

-- Admin User (password: admin123)
INSERT INTO admin_users (username, email, password, full_name, role) VALUES
('admin', 'admin@norzagaray.edu.ph', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'System Administrator', 'super_admin');

-- Graduates (sample data)
INSERT INTO graduates (student_id, first_name, last_name, email, phone, program_id, year_graduated) VALUES
('2019-0001', 'Juan', 'Dela Cruz', 'juan@email.com', '09171234567', 1, 2019),
('2019-0002', 'Maria', 'Santos', 'maria@email.com', '09179876543', 1, 2019),
('2019-0003', 'Jose', 'Reyes', 'jose@email.com', '09171112233', 2, 2019),
('2019-0004', 'Anna', 'Garcia', 'anna@email.com', '09174445566', 2, 2019),
('2019-0005', 'Pedro', 'Mendoza', 'pedro@email.com', '09177778899', 3, 2019),
('2020-0001', 'Clara', 'Bautista', 'clara@email.com', '09171010101', 1, 2020),
('2020-0002', 'Carlos', 'Rivera', 'carlos@email.com', '09172020202', 1, 2020),
('2020-0003', 'Rosa', 'Aquino', 'rosa@email.com', '09173030303', 2, 2020),
('2020-0004', 'Miguel', 'Torres', 'miguel@email.com', '09174040404', 3, 2020),
('2020-0005', 'Elena', 'Villanueva', 'elena@email.com', '09175050505', 3, 2020),
('2021-0001', 'Rafael', 'Cruz', 'rafael@email.com', '09176060606', 1, 2021),
('2021-0002', 'Sofia', 'Ramos', 'sofia@email.com', '09177070707', 1, 2021),
('2021-0003', 'Diego', 'Fernandez', 'diego@email.com', '09178080808', 2, 2021),
('2021-0004', 'Lucia', 'Gonzales', 'lucia@email.com', '09179090909', 2, 2021),
('2021-0005', 'Marco', 'Pascual', 'marco@email.com', '09170101010', 3, 2021),
('2022-0001', 'Isabel', 'Morales', 'isabel@email.com', '09171111111', 1, 2022),
('2022-0002', 'Andre', 'Lopez', 'andre@email.com', '09172222222', 1, 2022),
('2022-0003', 'Carmen', 'Perez', 'carmen@email.com', '09173333333', 2, 2022),
('2022-0004', 'Luis', 'Castillo', 'luis@email.com', '09174444444', 3, 2022),
('2022-0005', 'Patricia', 'Navarro', 'patricia@email.com', '09175555555', 3, 2022);

-- Employment Records
INSERT INTO employment (graduate_id, company_name, job_title, industry, employment_status, is_aligned, date_hired, monthly_salary, time_to_employment) VALUES
(1, 'Tech Solutions Inc.', 'Web Developer', 'IT', 'employed', 'aligned', '2019-08-15', 25000, 3),
(2, 'DataCore Systems', 'Software Engineer', 'IT', 'employed', 'aligned', '2019-09-01', 28000, 4),
(3, 'Norzagaray National HS', 'Science Teacher', 'Education', 'employed', 'aligned', '2019-07-01', 22000, 2),
(4, 'St. Mary Academy', 'English Teacher', 'Education', 'employed', 'aligned', '2020-01-15', 20000, 8),
(5, 'Prime Innovations', 'Marketing Associate', 'Marketing', 'employed', 'partially_aligned', '2019-11-01', 18000, 6),
(6, 'CloudTech Corp', 'Full Stack Developer', 'IT', 'employed', 'aligned', '2020-10-01', 30000, 4),
(7, 'Global Systems Co.', 'IT Support Specialist', 'IT', 'employed', 'aligned', '2020-09-15', 22000, 3),
(8, 'Bulacan State College', 'Math Teacher', 'Education', 'employed', 'aligned', '2020-08-01', 21000, 2),
(9, 'ShopEasy Inc.', 'Sales Associate', 'Retail', 'employed', 'not_aligned', '2021-01-10', 15000, 7),
(10, 'FreelanceHub', 'Virtual Assistant', 'BPO', 'self_employed', 'not_aligned', '2020-12-01', 20000, 6),
(11, 'NetWave Solutions', 'Network Admin', 'IT', 'employed', 'aligned', '2021-09-01', 26000, 3),
(12, 'AppDev Studio', 'Mobile Developer', 'IT', 'employed', 'aligned', '2021-10-15', 32000, 4),
(13, 'City High School', 'Filipino Teacher', 'Education', 'employed', 'aligned', '2021-07-15', 22000, 1),
(14, NULL, NULL, NULL, 'unemployed', 'not_aligned', NULL, NULL, 0),
(15, 'QuickMart', 'Store Manager', 'Retail', 'employed', 'partially_aligned', '2022-02-01', 18000, 8),
(16, 'CyberLink Tech', 'Junior Developer', 'IT', 'employed', 'aligned', '2022-08-01', 23000, 2),
(17, NULL, NULL, NULL, 'unemployed', 'not_aligned', NULL, NULL, 0),
(18, 'Provincial School', 'Substitute Teacher', 'Education', 'employed', 'aligned', '2022-09-01', 18000, 3),
(19, 'Family Store', 'Business Owner', 'Retail', 'self_employed', 'partially_aligned', '2022-06-01', 25000, 0),
(20, NULL, NULL, NULL, 'unemployed', 'not_aligned', NULL, NULL, 0);

-- Employment Trends
INSERT INTO employment_trends (year, employment_rate, alignment_rate) VALUES
(2019, 80.00, 72.00),
(2020, 78.00, 68.00),
(2021, 76.00, 65.00),
(2022, 75.00, 60.00);

-- Job Listings (Top jobs held by graduates)
INSERT INTO job_listings (job_title, company_name, graduate_count) VALUES
('Web Developer', 'Tech Solutions Inc.', 5),
('Marketing Associate', 'Prime Innovations', 3),
('IT Support Specialist', 'Global Systems Co.', 4);

-- Surveys
INSERT INTO surveys (title, description, status) VALUES
('Graduate Tracer Study 2024', 'Annual tracer study for tracking graduate employment and career outcomes', 'active'),
('Course Satisfaction Survey', 'Evaluate graduate satisfaction with their academic program', 'active'),
('Alumni Engagement Survey', 'Assess alumni interest in college events and initiatives', 'draft');

-- Survey Questions
INSERT INTO survey_questions (survey_id, question_text, question_type, options, is_required, sort_order) VALUES
(1, 'What is your current employment status?', 'multiple_choice', '["Employed", "Self-employed", "Freelance", "Unemployed"]', 1, 1),
(1, 'How long did it take you to find your first job after graduation?', 'multiple_choice', '["Less than 1 month", "1-3 months", "3-6 months", "6-12 months", "More than 1 year"]', 1, 2),
(1, 'Is your current job related to your course?', 'multiple_choice', '["Yes, directly related", "Partially related", "Not related"]', 1, 3),
(1, 'What is your current monthly salary range?', 'multiple_choice', '["Below 10,000", "10,000-20,000", "20,000-30,000", "30,000-50,000", "Above 50,000"]', 0, 4),
(1, 'Any suggestions to improve the program?', 'text', NULL, 0, 5),
(2, 'Rate your overall satisfaction with your academic program', 'rating', '["1", "2", "3", "4", "5"]', 1, 1),
(2, 'Did the program prepare you well for your career?', 'multiple_choice', '["Strongly Agree", "Agree", "Neutral", "Disagree", "Strongly Disagree"]', 1, 2),
(2, 'What skills from the program are most useful in your career?', 'text', NULL, 0, 3);

-- Survey Responses
INSERT INTO survey_responses (survey_id, graduate_id, responses) VALUES
(1, 1, '{"1": "Employed", "2": "1-3 months", "3": "Yes, directly related", "4": "20,000-30,000", "5": "More hands-on projects"}'),
(1, 2, '{"1": "Employed", "2": "3-6 months", "3": "Yes, directly related", "4": "20,000-30,000", "5": ""}'),
(1, 3, '{"1": "Employed", "2": "Less than 1 month", "3": "Yes, directly related", "4": "20,000-30,000", "5": "Add more practicum hours"}'),
(1, 6, '{"1": "Employed", "2": "3-6 months", "3": "Yes, directly related", "4": "30,000-50,000", "5": ""}'),
(2, 1, '{"6": "4", "7": "Agree", "8": "Programming and problem-solving"}'),
(2, 3, '{"6": "5", "7": "Strongly Agree", "8": "Teaching methodologies"}');

-- Announcements
INSERT INTO announcements (title, content, category, status, published_at) VALUES
('Alumni Homecoming 2024', 'We are excited to invite all Norzagaray College alumni to our annual homecoming celebration on December 15, 2024. Join us for a day of reconnecting, networking, and celebrating our shared experiences.', 'event', 'published', '2024-11-01 09:00:00'),
('Graduate Tracer Study Now Open', 'Dear graduates, please take a few minutes to complete our annual tracer study. Your responses help us improve our programs and better serve future students.', 'general', 'published', '2024-10-15 08:00:00'),
('Job Fair - Partner Companies', 'Norzagaray College is hosting a job fair featuring our partner companies. Open to all recent graduates and alumni looking for new opportunities.', 'opportunity', 'published', '2024-09-20 10:00:00'),
('System Maintenance Notice', 'GradTrack will undergo scheduled maintenance on November 30. The system will be unavailable from 10 PM to 2 AM.', 'urgent', 'draft', NULL);

-- System Settings
INSERT INTO system_settings (setting_key, setting_value, setting_group) VALUES
('site_name', 'GradTrack - Norzagaray College', 'general'),
('site_description', 'Alumni Tracking System', 'general'),
('contact_email', 'norzagaraycollege2007@gmail.com', 'general'),
('contact_phone', '', 'general'),
('institution_name', 'Norzagaray College', 'institution'),
('institution_address', 'Norzagaray, Bulacan', 'institution'),
('academic_year', '2024-2025', 'academic'),
('survey_reminder_days', '30', 'notifications'),
('enable_email_notifications', 'true', 'notifications'),
('maintenance_mode', 'false', 'system');
