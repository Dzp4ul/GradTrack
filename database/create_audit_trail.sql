CREATE TABLE IF NOT EXISTS audit_trail (
    audit_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    user_name VARCHAR(150),
    user_role VARCHAR(100),
    department VARCHAR(150) NULL,
    action VARCHAR(100),
    module VARCHAR(100),
    description TEXT,
    ip_address VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_created_at (created_at),
    INDEX idx_audit_user_role (user_role),
    INDEX idx_audit_department (department),
    INDEX idx_audit_action (action),
    INDEX idx_audit_module (module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
