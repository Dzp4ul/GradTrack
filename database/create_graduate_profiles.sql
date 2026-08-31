CREATE TABLE IF NOT EXISTS graduate_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    graduate_account_id INT NOT NULL UNIQUE,
    first_name VARCHAR(50) NOT NULL,
    middle_name VARCHAR(100) NULL,
    last_name VARCHAR(50) NOT NULL,
    phone_number VARCHAR(30) NULL,
    birthday DATE NULL,
    civil_status VARCHAR(50) NULL,
    sex_gender VARCHAR(50) NULL,
    program_course VARCHAR(180) NULL,
    graduation_year SMALLINT UNSIGNED NULL,
    current_location VARCHAR(500) NULL,
    job_title VARCHAR(200) NULL,
    company_name VARCHAR(200) NULL,
    employment_location VARCHAR(255) NULL,
    professional_status VARCHAR(100) NULL,
    start_date DATE NULL,
    initialized_from_survey_response_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_graduate_profiles_survey_response (initialized_from_survey_response_id),
    CONSTRAINT fk_graduate_profiles_account
        FOREIGN KEY (graduate_account_id) REFERENCES graduate_accounts(id) ON DELETE CASCADE,
    CONSTRAINT fk_graduate_profiles_survey_response
        FOREIGN KEY (initialized_from_survey_response_id) REFERENCES survey_responses(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
