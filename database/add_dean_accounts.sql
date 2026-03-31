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

-- Ensure ACT exists for dean_cs scope.
INSERT INTO programs (name, code, description)
SELECT 'Associate in Computer Technology', 'ACT', 'Associate in Computer Technology program'
WHERE NOT EXISTS (
  SELECT 1 FROM programs WHERE code = 'ACT'
);

-- dean_cs handles BSCS and ACT
INSERT INTO admin_users (username, email, password, full_name, role, is_active)
VALUES (
  'dean_cs',
  'deancs@gradtrack.com',
  '$2y$10$kK0dRboh18OnTKsS7z1tnu7rpvJ.DvmKq1HYyU.8H4dC/Owzawcs.',
  'Dean - College of Computer Studies',
  'dean_cs',
  1
)
ON DUPLICATE KEY UPDATE
  password = VALUES(password),
  full_name = VALUES(full_name),
  role = 'dean_cs',
  is_active = 1;

-- dean_coed handles BSED and BEED
INSERT INTO admin_users (username, email, password, full_name, role, is_active)
VALUES (
  'dean_coed',
  'deancoed@gradtrack.com',
  '$2y$10$jmCoiznvvHO5fkbCOyb9hO1.xhEq004Qqg91S.WmHYJ2Xmyf9zQxm',
  'Dean - College of Education',
  'dean_coed',
  1
)
ON DUPLICATE KEY UPDATE
  password = VALUES(password),
  full_name = VALUES(full_name),
  role = 'dean_coed',
  is_active = 1;

-- dean_hm handles BSHM
INSERT INTO admin_users (username, email, password, full_name, role, is_active)
VALUES (
  'dean_hm',
  'deanhm@gradtrack.com',
  '$2y$10$fAI6GBuGlcYYino2Hhr5eOJ5xrnl0os0TcI6qBIqDo/zn6Qr50SMm',
  'Dean - Hospitality Management',
  'dean_hm',
  1
)
ON DUPLICATE KEY UPDATE
  password = VALUES(password),
  full_name = VALUES(full_name),
  role = 'dean_hm',
  is_active = 1;
