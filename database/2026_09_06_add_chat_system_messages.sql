-- Persist group membership events in the existing message stream.
-- Safe to run repeatedly; existing message values and history are preserved.

ALTER TABLE forum_chat_messages
  MODIFY COLUMN message_type ENUM('text', 'image', 'file', 'mixed', 'system') NOT NULL DEFAULT 'text';
