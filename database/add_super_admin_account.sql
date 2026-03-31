USE gradtrackdb;

ALTER TABLE admin_users
  MODIFY role ENUM('super_admin', 'admin', 'registrar', 'dean_cs', 'dean_coed', 'dean_hm') DEFAULT 'admin';

SET @is_active_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'admin_users'
    AND COLUMN_NAME = 'is_active'
);

SET @add_column_sql := IF(
  @is_active_exists = 0,
  'ALTER TABLE admin_users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);

PREPARE stmt_add_is_active FROM @add_column_sql;
EXECUTE stmt_add_is_active;
DEALLOCATE PREPARE stmt_add_is_active;

INSERT INTO admin_users (username, email, password, full_name, role, is_active)
VALUES (
  'superadmin',
  'superadmin@gradtrack.com',
  '$2y$10$M2FkQKG7ojGzVUZWV5bC8.1mT7e73LoLZIun13FQSFYpRvzLj6c9i',
  'Super Administrator',
  'super_admin',
  1
)
ON DUPLICATE KEY UPDATE
  username = VALUES(username),
  password = VALUES(password),
  full_name = VALUES(full_name),
  role = 'super_admin',
  is_active = 1;
