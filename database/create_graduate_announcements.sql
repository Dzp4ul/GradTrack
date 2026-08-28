-- Graduate/Alumni Announcement feature
-- Safe to run against the configured GradTrack MySQL database.
-- Existing installations with the legacy announcements table are upgraded at runtime
-- by backend/api/config/announcements.php before the API handles a request.

CREATE TABLE IF NOT EXISTS announcements (
    id INT NOT NULL AUTO_INCREMENT,
    graduate_id INT DEFAULT NULL,
    created_by_admin_id INT DEFAULT NULL,
    title VARCHAR(255) NOT NULL,
    summary VARCHAR(500) DEFAULT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'general',
    event_date DATE DEFAULT NULL,
    cover_image_path VARCHAR(255) DEFAULT NULL,
    cover_image_original_name VARCHAR(255) DEFAULT NULL,
    cover_image_mime_type VARCHAR(120) DEFAULT NULL,
    cover_image_file_size_bytes INT DEFAULT NULL,
    status ENUM('draft','published','archived') NOT NULL DEFAULT 'published',
    published_at DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_announcements_graduate (graduate_id),
    KEY idx_announcements_status_created (status, created_at),
    KEY idx_announcements_category_created (category, created_at),
    CONSTRAINT fk_announcements_graduate
        FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE,
    CONSTRAINT fk_announcements_admin
        FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS announcement_images (
    id INT NOT NULL AUTO_INCREMENT,
    announcement_id INT NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    file_size_bytes INT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_announcement_images_announcement_order (announcement_id, sort_order, id),
    CONSTRAINT fk_announcement_images_announcement
        FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
