-- GradTrack non-destructive record archives and report-based forum moderation.
-- This migration only adds metadata/visibility columns and preserves all rows,
-- survey answers, questions, media, accounts, and related foreign-key records.

ALTER TABLE graduates
    ADD COLUMN IF NOT EXISTS archived_at DATETIME NULL,
    ADD COLUMN IF NOT EXISTS archived_by INT NULL,
    ADD COLUMN IF NOT EXISTS restored_at DATETIME NULL,
    ADD COLUMN IF NOT EXISTS restored_by INT NULL,
    ADD INDEX IF NOT EXISTS idx_graduates_archived_at (archived_at);

ALTER TABLE registered_alumni
    ADD COLUMN IF NOT EXISTS archived_at DATETIME NULL,
    ADD COLUMN IF NOT EXISTS archived_by INT NULL,
    ADD COLUMN IF NOT EXISTS restored_at DATETIME NULL,
    ADD COLUMN IF NOT EXISTS restored_by INT NULL,
    ADD INDEX IF NOT EXISTS idx_registered_alumni_archived_at (archived_at);

ALTER TABLE surveys
    ADD COLUMN IF NOT EXISTS archived_at DATETIME NULL,
    ADD COLUMN IF NOT EXISTS archived_by INT NULL,
    ADD COLUMN IF NOT EXISTS restored_at DATETIME NULL,
    ADD COLUMN IF NOT EXISTS restored_by INT NULL,
    ADD COLUMN IF NOT EXISTS status_before_archive VARCHAR(30) NULL,
    ADD INDEX IF NOT EXISTS idx_surveys_archived_at (archived_at);

-- Legacy pending posts were waiting for pre-approval. Publish them before
-- changing the default so existing community content is not stranded.
UPDATE forum_posts SET status = 'approved' WHERE status = 'pending';
ALTER TABLE forum_posts
    MODIFY status ENUM('approved', 'hidden') NOT NULL DEFAULT 'approved';

ALTER TABLE forum_comments
    ADD COLUMN IF NOT EXISTS status ENUM('approved', 'hidden') NOT NULL DEFAULT 'approved' AFTER comment;

ALTER TABLE forum_reports
    ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER reason;

-- Expand first so legacy `reviewed` values can be converted safely.
ALTER TABLE forum_reports
    MODIFY status ENUM('pending', 'reviewed', 'resolved', 'dismissed') NOT NULL DEFAULT 'pending';
UPDATE forum_reports SET status = 'resolved' WHERE status = 'reviewed';
ALTER TABLE forum_reports
    MODIFY status ENUM('pending', 'resolved', 'dismissed') NOT NULL DEFAULT 'pending';
