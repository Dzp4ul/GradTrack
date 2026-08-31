-- GradTrack S3 storage metadata migration (idempotent, MySQL 8+).
-- Review and run against development first. Do not run in production without approval.

DROP PROCEDURE IF EXISTS gradtrack_add_s3_column_if_missing;

DELIMITER $$

CREATE PROCEDURE gradtrack_add_s3_column_if_missing(
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
    SET @gradtrack_s3_ddl = ddl_statement;
    PREPARE gradtrack_s3_statement FROM @gradtrack_s3_ddl;
    EXECUTE gradtrack_s3_statement;
    DEALLOCATE PREPARE gradtrack_s3_statement;
  END IF;
END$$

DELIMITER ;

CALL gradtrack_add_s3_column_if_missing(
  'job_posts',
  'requirements_file_path',
  'ALTER TABLE job_posts ADD COLUMN requirements_file_path VARCHAR(1024) NULL AFTER application_method'
);
CALL gradtrack_add_s3_column_if_missing(
  'job_posts',
  'requirements_file_name',
  'ALTER TABLE job_posts ADD COLUMN requirements_file_name VARCHAR(255) NULL AFTER requirements_file_path'
);
CALL gradtrack_add_s3_column_if_missing(
  'job_posts',
  'requirements_mime_type',
  'ALTER TABLE job_posts ADD COLUMN requirements_mime_type VARCHAR(150) NULL AFTER requirements_file_name'
);
CALL gradtrack_add_s3_column_if_missing(
  'job_posts',
  'requirements_file_size_bytes',
  'ALTER TABLE job_posts ADD COLUMN requirements_file_size_bytes BIGINT UNSIGNED NULL AFTER requirements_mime_type'
);
CALL gradtrack_add_s3_column_if_missing(
  'job_posts',
  'requirements_uploaded_at',
  'ALTER TABLE job_posts ADD COLUMN requirements_uploaded_at DATETIME NULL AFTER requirements_file_size_bytes'
);

DROP PROCEDURE IF EXISTS gradtrack_add_s3_column_if_missing;
