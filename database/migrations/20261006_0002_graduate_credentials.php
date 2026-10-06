<?php
declare(strict_types=1);

return static function (PDO $db): void {
    if (!gradtrack_migration_table_exists($db, 'graduate_accounts')) {
        throw new RuntimeException('Required graduate_accounts table is missing.');
    }

    $db->exec("CREATE TABLE IF NOT EXISTS graduate_credentials (
        id INT NOT NULL AUTO_INCREMENT,
        graduate_account_id INT NOT NULL,
        credential_name VARCHAR(255) NOT NULL,
        issuing_organization VARCHAR(255) NOT NULL,
        issue_date DATE NULL,
        expiration_date DATE NULL,
        credential_id VARCHAR(191) NULL,
        verification_url VARCHAR(2048) NULL,
        file_path VARCHAR(500) NOT NULL,
        original_file_name VARCHAR(255) NOT NULL,
        stored_file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size_bytes INT UNSIGNED NOT NULL,
        status ENUM('uploaded','pending','verified') NOT NULL DEFAULT 'uploaded',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_graduate_credentials_account_updated (graduate_account_id, updated_at, id),
        KEY idx_graduate_credentials_status (status),
        CONSTRAINT fk_graduate_credentials_account
            FOREIGN KEY (graduate_account_id) REFERENCES graduate_accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
};
