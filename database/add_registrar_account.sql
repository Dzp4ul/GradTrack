USE gradtrackdb;

-- Allow registrar role in existing databases.
ALTER TABLE admin_users
  MODIFY role ENUM('super_admin', 'admin', 'registrar') DEFAULT 'admin';

-- Registrar credentials:
-- Email: registrar@norzagaray.edu.ph
-- Password: Registrar2026
INSERT INTO admin_users (username, email, password, full_name, role)
VALUES (
  'registrar',
  'registrar@norzagaray.edu.ph',
  '$2y$10$xdcUNUI9Rd//izOo8u5vROycB91SwWUThhaV2FD1TOd7IODqIGkRK',
  'Registrar Account',
  'registrar'
)
ON DUPLICATE KEY UPDATE
  password = VALUES(password),
  full_name = VALUES(full_name),
  role = 'registrar';
