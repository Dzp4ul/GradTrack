-- Add survey tokens table for graduate verification
-- Run this SQL in phpMyAdmin or MySQL CLI

USE gradtrackdb;

-- =============================================
-- Survey Tokens Table
-- =============================================
CREATE TABLE IF NOT EXISTS survey_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  survey_id INT NOT NULL,
  graduate_id INT NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  submitted_at DATETIME NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE,
  UNIQUE KEY unique_survey_graduate (survey_id, graduate_id)
) ENGINE=InnoDB;

-- Add index for faster token lookups
CREATE INDEX idx_token ON survey_tokens(token);
CREATE INDEX idx_survey_graduate ON survey_tokens(survey_id, graduate_id);
