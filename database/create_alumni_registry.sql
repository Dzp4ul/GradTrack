-- GRADTRACK Alumni Registered List registry tables.
-- Run against the GradTrack database before using the Alumni Admin import page.

INSERT INTO programs (name, code, description)
SELECT 'Bachelor of Science in Computer Science', 'BSCS', 'Official alumni registry course mapping'
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE code = 'BSCS');

INSERT INTO programs (name, code, description)
SELECT 'Associate in Computer Technology', 'ACT', 'Official alumni registry course mapping'
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE code = 'ACT');

INSERT INTO programs (name, code, description)
SELECT 'Bachelor of Science in Hotel and Restaurant Management', 'BSHM', 'Official alumni registry course mapping'
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE code = 'BSHM');

INSERT INTO programs (name, code, description)
SELECT 'Bachelor of Secondary Education', 'BSED', 'Official alumni registry course mapping'
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE code = 'BSED');

INSERT INTO programs (name, code, description)
SELECT 'Bachelor of Elementary Education', 'BEED', 'Official alumni registry course mapping'
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE code = 'BEED');

INSERT INTO programs (name, code, description)
SELECT 'Bachelor of Science in Nursing', 'BSN', 'Official alumni registry course mapping'
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE code = 'BSN');

CREATE TABLE IF NOT EXISTS alumni_import_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    worksheet_name VARCHAR(120) NULL,
    total_rows INT NOT NULL DEFAULT 0,
    successful_rows INT NOT NULL DEFAULT 0,
    duplicate_rows INT NOT NULL DEFAULT 0,
    invalid_rows INT NOT NULL DEFAULT 0,
    updated_rows INT NOT NULL DEFAULT 0,
    imported_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_alumni_import_history_imported_by (imported_by),
    INDEX idx_alumni_import_history_created_at (created_at),
    CONSTRAINT fk_alumni_import_history_admin
        FOREIGN KEY (imported_by) REFERENCES admin_users(id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS registered_alumni (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(180) NOT NULL,
    normalized_name VARCHAR(180) NOT NULL,
    course_id INT NULL,
    course_name VARCHAR(180) NOT NULL,
    course_code VARCHAR(10) NOT NULL,
    batch_year INT NOT NULL,
    registration_status ENUM('Unclaimed', 'Registered', 'Verified', 'Inactive') NOT NULL DEFAULT 'Unclaimed',
    linked_user_id INT NULL,
    source_file VARCHAR(255) NULL,
    import_batch_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_registered_alumni_identity (normalized_name, course_code, batch_year),
    UNIQUE KEY uq_registered_alumni_linked_user (linked_user_id),
    INDEX idx_registered_alumni_normalized_name (normalized_name),
    INDEX idx_registered_alumni_course_id (course_id),
    INDEX idx_registered_alumni_course_code (course_code),
    INDEX idx_registered_alumni_batch_year (batch_year),
    INDEX idx_registered_alumni_status (registration_status),
    INDEX idx_registered_alumni_linked_user (linked_user_id),
    INDEX idx_registered_alumni_import_batch (import_batch_id),
    CONSTRAINT fk_registered_alumni_course
        FOREIGN KEY (course_id) REFERENCES programs(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_registered_alumni_linked_user
        FOREIGN KEY (linked_user_id) REFERENCES graduate_accounts(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_registered_alumni_import_batch
        FOREIGN KEY (import_batch_id) REFERENCES alumni_import_history(id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
