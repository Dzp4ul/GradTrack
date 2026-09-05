-- Conversation information, direct-message blocking, and group avatars.
-- Idempotent for GradTrack MySQL 8+ installations.

DROP PROCEDURE IF EXISTS gradtrack_add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE gradtrack_add_column_if_missing(
  IN target_table VARCHAR(64),
  IN target_column VARCHAR(64),
  IN ddl_statement TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = target_table
      AND COLUMN_NAME = target_column
  ) THEN
    SET @gradtrack_ddl = ddl_statement;
    PREPARE gradtrack_statement FROM @gradtrack_ddl;
    EXECUTE gradtrack_statement;
    DEALLOCATE PREPARE gradtrack_statement;
  END IF;
END$$
DELIMITER ;

CALL gradtrack_add_column_if_missing('forum_chat_rooms', 'group_image_path',
  'ALTER TABLE forum_chat_rooms ADD COLUMN group_image_path VARCHAR(255) NULL AFTER is_group');
CALL gradtrack_add_column_if_missing('forum_chat_rooms', 'group_image_original_name',
  'ALTER TABLE forum_chat_rooms ADD COLUMN group_image_original_name VARCHAR(255) NULL AFTER group_image_path');
CALL gradtrack_add_column_if_missing('forum_chat_rooms', 'group_image_mime_type',
  'ALTER TABLE forum_chat_rooms ADD COLUMN group_image_mime_type VARCHAR(120) NULL AFTER group_image_original_name');
CALL gradtrack_add_column_if_missing('forum_chat_rooms', 'group_image_updated_at',
  'ALTER TABLE forum_chat_rooms ADD COLUMN group_image_updated_at DATETIME NULL AFTER group_image_mime_type');

CREATE TABLE IF NOT EXISTS forum_chat_blocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  blocker_id INT NOT NULL,
  blocked_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_forum_chat_block (blocker_id, blocked_id),
  INDEX idx_forum_chat_blocks_blocked (blocked_id, blocker_id),
  CONSTRAINT fk_forum_chat_blocks_blocker FOREIGN KEY (blocker_id) REFERENCES graduates(id) ON DELETE CASCADE,
  CONSTRAINT fk_forum_chat_blocks_blocked FOREIGN KEY (blocked_id) REFERENCES graduates(id) ON DELETE CASCADE,
  CONSTRAINT chk_forum_chat_blocks_distinct CHECK (blocker_id <> blocked_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS gradtrack_add_column_if_missing;
