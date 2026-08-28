-- GradTrack public website content management tables.
-- Safe to run more than once; the API seeds the current public copy on first access.
CREATE TABLE IF NOT EXISTS website_content (
    id INT AUTO_INCREMENT PRIMARY KEY, page VARCHAR(40) NOT NULL, section_key VARCHAR(80) NOT NULL,
    title VARCHAR(255) NOT NULL, subtitle VARCHAR(255) NULL, content TEXT NOT NULL,
    image_path VARCHAR(500) NULL, default_image_path VARCHAR(500) NULL, image_alt VARCHAR(255) NULL,
    display_order INT NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
    updated_by_admin_user_id INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_website_content_page_section (page, section_key),
    INDEX idx_website_content_page_order (page, is_active, display_order),
    CONSTRAINT fk_website_content_updated_by FOREIGN KEY (updated_by_admin_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS faq_categories (
    id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(150) NOT NULL, display_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_faq_categories_order (is_active, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS faq_items (
    id INT AUTO_INCREMENT PRIMARY KEY, category_id INT NOT NULL, question VARCHAR(500) NOT NULL,
    answer TEXT NOT NULL, display_order INT NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_faq_items_category_order (category_id, is_active, display_order),
    CONSTRAINT fk_faq_items_category FOREIGN KEY (category_id) REFERENCES faq_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS privacy_policy_meta (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY, introductory_statement TEXT NOT NULL,
    effective_date DATE NOT NULL, last_updated_date DATE NOT NULL, updated_by_admin_user_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_privacy_policy_meta_updated_by FOREIGN KEY (updated_by_admin_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS privacy_sections (
    id INT AUTO_INCREMENT PRIMARY KEY, heading VARCHAR(255) NOT NULL, content_html MEDIUMTEXT NOT NULL,
    display_order INT NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_privacy_sections_order (is_active, display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
