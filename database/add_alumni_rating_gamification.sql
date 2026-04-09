USE gradtrackdb;

-- =============================================
-- Alumni Recognition / Gamification Support
-- =============================================
CREATE TABLE IF NOT EXISTS alumni_supporting_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    graduate_account_id INT NOT NULL,
    graduate_id INT NOT NULL,
    document_type ENUM('certificate', 'training', 'seminar', 'award', 'other') NOT NULL,
    title VARCHAR(180) NOT NULL,
    description TEXT NULL,
    original_file_name VARCHAR(255) NOT NULL,
    stored_file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    file_size_bytes INT NOT NULL,
    is_verified TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at DATETIME NULL,
    FOREIGN KEY (graduate_account_id) REFERENCES graduate_accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE,
    INDEX idx_alumni_docs_account_active (graduate_account_id, is_active),
    INDEX idx_alumni_docs_type (document_type),
    INDEX idx_alumni_docs_verified (is_verified)
) ENGINE=InnoDB;
