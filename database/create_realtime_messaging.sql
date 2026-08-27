-- GradTrack realtime messaging schema extension (idempotent, MySQL 8+).
-- Run after the existing forum chat tables have been created.

DROP PROCEDURE IF EXISTS gradtrack_add_column_if_missing;
DROP PROCEDURE IF EXISTS gradtrack_add_index_if_missing;

DELIMITER $$

CREATE PROCEDURE gradtrack_add_column_if_missing(
  IN target_table VARCHAR(64),
  IN target_column VARCHAR(64),
  IN ddl_statement TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
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

CREATE PROCEDURE gradtrack_add_index_if_missing(
  IN target_table VARCHAR(64),
  IN target_columns VARCHAR(255),
  IN require_unique TINYINT,
  IN ddl_statement TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT INDEX_NAME, NON_UNIQUE,
             GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS indexed_columns
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = target_table
      GROUP BY INDEX_NAME, NON_UNIQUE
    ) existing_indexes
    WHERE existing_indexes.indexed_columns = target_columns
      AND (require_unique = 0 OR existing_indexes.NON_UNIQUE = 0)
  ) THEN
    SET @gradtrack_ddl = ddl_statement;
    PREPARE gradtrack_statement FROM @gradtrack_ddl;
    EXECUTE gradtrack_statement;
    DEALLOCATE PREPARE gradtrack_statement;
  END IF;
END$$

DELIMITER ;

CALL gradtrack_add_column_if_missing(
  'forum_chat_rooms',
  'last_message_at',
  'ALTER TABLE forum_chat_rooms ADD COLUMN last_message_at DATETIME NULL AFTER updated_at'
);

CALL gradtrack_add_column_if_missing(
  'forum_chat_members',
  'last_read_at',
  'ALTER TABLE forum_chat_members ADD COLUMN last_read_at DATETIME NULL AFTER joined_at'
);
CALL gradtrack_add_column_if_missing(
  'forum_chat_members',
  'created_at',
  'ALTER TABLE forum_chat_members ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER last_read_at'
);
CALL gradtrack_add_column_if_missing(
  'forum_chat_members',
  'updated_at',
  'ALTER TABLE forum_chat_members ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at'
);

ALTER TABLE forum_chat_messages MODIFY message TEXT NULL;
CALL gradtrack_add_column_if_missing(
  'forum_chat_messages',
  'message_type',
  'ALTER TABLE forum_chat_messages ADD COLUMN message_type ENUM(''text'', ''image'', ''file'', ''mixed'') NOT NULL DEFAULT ''text'' AFTER message'
);
CALL gradtrack_add_column_if_missing(
  'forum_chat_messages',
  'client_message_id',
  'ALTER TABLE forum_chat_messages ADD COLUMN client_message_id VARCHAR(80) NULL AFTER message_type'
);
CALL gradtrack_add_column_if_missing(
  'forum_chat_messages',
  'delivered_at',
  'ALTER TABLE forum_chat_messages ADD COLUMN delivered_at DATETIME NULL AFTER client_message_id'
);
CALL gradtrack_add_column_if_missing(
  'forum_chat_messages',
  'read_at',
  'ALTER TABLE forum_chat_messages ADD COLUMN read_at DATETIME NULL AFTER delivered_at'
);
CALL gradtrack_add_column_if_missing(
  'forum_chat_messages',
  'updated_at',
  'ALTER TABLE forum_chat_messages ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at'
);
CALL gradtrack_add_column_if_missing(
  'forum_chat_messages',
  'deleted_at',
  'ALTER TABLE forum_chat_messages ADD COLUMN deleted_at DATETIME NULL AFTER updated_at'
);

CALL gradtrack_add_index_if_missing(
  'forum_chat_rooms',
  'last_message_at,updated_at,id',
  0,
  'ALTER TABLE forum_chat_rooms ADD INDEX idx_forum_chat_rooms_last_message (last_message_at, updated_at, id)'
);
CALL gradtrack_add_index_if_missing(
  'forum_chat_members',
  'room_id,graduate_id,last_read_at',
  0,
  'ALTER TABLE forum_chat_members ADD INDEX idx_forum_chat_members_read (room_id, graduate_id, last_read_at)'
);
CALL gradtrack_add_index_if_missing(
  'forum_chat_messages',
  'room_id,id',
  0,
  'ALTER TABLE forum_chat_messages ADD INDEX idx_forum_chat_messages_room_id (room_id, id)'
);
CALL gradtrack_add_index_if_missing(
  'forum_chat_messages',
  'graduate_id,created_at',
  0,
  'ALTER TABLE forum_chat_messages ADD INDEX idx_forum_chat_messages_sender_created (graduate_id, created_at)'
);
CALL gradtrack_add_index_if_missing(
  'forum_chat_messages',
  'created_at,id',
  0,
  'ALTER TABLE forum_chat_messages ADD INDEX idx_forum_chat_messages_created (created_at, id)'
);
CALL gradtrack_add_index_if_missing(
  'forum_chat_messages',
  'room_id,graduate_id,client_message_id',
  1,
  'ALTER TABLE forum_chat_messages ADD UNIQUE KEY uniq_forum_chat_client_message (room_id, graduate_id, client_message_id)'
);

CREATE TABLE IF NOT EXISTS forum_chat_message_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  message_id INT NULL,
  uploaded_by INT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  storage_path VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size INT NOT NULL,
  attachment_type ENUM('image', 'file') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_forum_chat_attachment_path (storage_path),
  INDEX idx_forum_chat_attachment_message (message_id),
  INDEX idx_forum_chat_attachment_room (room_id, created_at),
  INDEX idx_forum_chat_attachment_uploader (uploaded_by),
  CONSTRAINT fk_forum_chat_attachment_room FOREIGN KEY (room_id) REFERENCES forum_chat_rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_forum_chat_attachment_message FOREIGN KEY (message_id) REFERENCES forum_chat_messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_forum_chat_attachment_uploader FOREIGN KEY (uploaded_by) REFERENCES graduates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS graduate_presence (
  graduate_id INT PRIMARY KEY,
  last_active_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_graduate_presence_graduate FOREIGN KEY (graduate_id) REFERENCES graduates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

UPDATE forum_chat_rooms r
SET r.last_message_at = (
  SELECT MAX(fcm.created_at)
  FROM forum_chat_messages fcm
  WHERE fcm.room_id = r.id
    AND fcm.deleted_at IS NULL
)
WHERE r.last_message_at IS NULL;

DROP PROCEDURE IF EXISTS gradtrack_add_column_if_missing;
DROP PROCEDURE IF EXISTS gradtrack_add_index_if_missing;
