<?php
declare(strict_types=1);

return static function (PDO $db): void {
    $db->exec("CREATE TABLE IF NOT EXISTS email_notification_deliveries (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        notification_type VARCHAR(64) NOT NULL,
        entity_id BIGINT UNSIGNED NOT NULL,
        recipient_email VARCHAR(255) NOT NULL,
        recipient_name VARCHAR(255) NULL,
        subject VARCHAR(255) NOT NULL,
        status ENUM('processing','sent','failed') NOT NULL DEFAULT 'processing',
        error_message TEXT NULL,
        reserved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sent_at DATETIME NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_email_notification_entity (notification_type, entity_id),
        INDEX idx_email_notification_status (status, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
};
