-- Persistent, role-isolated GradTrack GenAI conversation history.
-- Safe to run repeatedly on MySQL 8+.

CREATE TABLE IF NOT EXISTS ai_conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_user_id INT NOT NULL,
  role VARCHAR(40) NOT NULL,
  title VARCHAR(120) NOT NULL DEFAULT 'New conversation',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_conversations_owner_activity (admin_user_id, role, updated_at, id),
  CONSTRAINT fk_ai_conversations_admin_user
    FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender ENUM('user', 'assistant') NOT NULL,
  message MEDIUMTEXT NOT NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ai_messages_conversation_created (conversation_id, created_at, id),
  CONSTRAINT fk_ai_messages_conversation
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
