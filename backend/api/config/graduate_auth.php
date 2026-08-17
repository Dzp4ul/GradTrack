<?php

if (!function_exists('gradtrack_start_session_if_needed')) {
    function gradtrack_start_session_if_needed(): void
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
    }
}

if (!function_exists('gradtrack_graduate_account_column')) {
    function gradtrack_graduate_account_column(PDO $db, string $column): ?array
    {
        $stmt = $db->query('SHOW COLUMNS FROM graduate_accounts LIKE ' . $db->quote($column));
        $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;

        return $row ?: null;
    }
}

if (!function_exists('gradtrack_ensure_graduate_account_verification_schema')) {
    function gradtrack_ensure_graduate_account_verification_schema(PDO $db): void
    {
        $statusColumn = gradtrack_graduate_account_column($db, 'status');
        $statusType = strtolower((string) ($statusColumn['Type'] ?? ''));

        if (!$statusColumn) {
            $db->exec("ALTER TABLE graduate_accounts ADD COLUMN status ENUM('pending_verification','active','inactive','rejected') NOT NULL DEFAULT 'pending_verification'");
        } elseif (
            strpos($statusType, 'pending_verification') === false
            || strpos($statusType, 'rejected') === false
        ) {
            $db->exec("UPDATE graduate_accounts SET status = 'active' WHERE status IS NULL");
            $db->exec("ALTER TABLE graduate_accounts MODIFY status ENUM('pending_verification','active','inactive','rejected') NOT NULL DEFAULT 'pending_verification'");
        }

        $addedVerificationStatus = false;
        if (!gradtrack_graduate_account_column($db, 'alumni_verification_status')) {
            $db->exec("ALTER TABLE graduate_accounts ADD COLUMN alumni_verification_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' AFTER status");
            $addedVerificationStatus = true;
        }

        if (!gradtrack_graduate_account_column($db, 'alumni_verification_reason')) {
            $db->exec("ALTER TABLE graduate_accounts ADD COLUMN alumni_verification_reason TEXT NULL AFTER alumni_verification_status");
        }

        if (!gradtrack_graduate_account_column($db, 'alumni_verification_reviewed_by')) {
            $db->exec("ALTER TABLE graduate_accounts ADD COLUMN alumni_verification_reviewed_by INT NULL AFTER alumni_verification_reason");
        }

        if (!gradtrack_graduate_account_column($db, 'alumni_verification_reviewed_at')) {
            $db->exec("ALTER TABLE graduate_accounts ADD COLUMN alumni_verification_reviewed_at DATETIME NULL AFTER alumni_verification_reviewed_by");
        }

        if (!gradtrack_graduate_account_column($db, 'alumni_verification_submitted_at')) {
            $db->exec("ALTER TABLE graduate_accounts ADD COLUMN alumni_verification_submitted_at DATETIME NULL AFTER alumni_verification_reviewed_at");
        }

        if ($addedVerificationStatus) {
            $db->exec("UPDATE graduate_accounts
                       SET alumni_verification_status = CASE
                           WHEN status = 'active' THEN 'approved'
                           WHEN status = 'rejected' THEN 'rejected'
                           ELSE 'pending'
                       END");
        }

        $db->exec("UPDATE graduate_accounts
                   SET alumni_verification_submitted_at = COALESCE(alumni_verification_submitted_at, created_at, NOW())
                   WHERE alumni_verification_submitted_at IS NULL");
    }
}

if (!function_exists('gradtrack_graduate_account_is_verified')) {
    function gradtrack_graduate_account_is_verified(array $account): bool
    {
        $status = strtolower((string) ($account['status'] ?? ''));
        $verificationStatus = strtolower((string) ($account['alumni_verification_status'] ?? ''));

        return $status === 'active' && $verificationStatus === 'approved';
    }
}

if (!function_exists('gradtrack_graduate_account_access_error')) {
    function gradtrack_graduate_account_access_error(array $account): ?array
    {
        if (gradtrack_graduate_account_is_verified($account)) {
            return null;
        }

        $status = strtolower((string) ($account['status'] ?? 'inactive'));
        $verificationStatus = strtolower((string) ($account['alumni_verification_status'] ?? 'pending'));

        if ($status === 'pending_verification' || $verificationStatus === 'pending') {
            return [
                'code' => 'pending_verification',
                'account_status' => 'pending_verification',
                'error' => 'Your account is currently pending alumni verification. Please wait for the Alumni Admin to review and approve your account.',
            ];
        }

        if ($status === 'rejected' || $verificationStatus === 'rejected') {
            $reason = trim((string) ($account['alumni_verification_reason'] ?? ''));
            return [
                'code' => 'rejected',
                'account_status' => 'rejected',
                'rejection_reason' => $reason !== '' ? $reason : null,
                'error' => $reason !== ''
                    ? 'Your Graduate Portal registration was rejected. Reason: ' . $reason
                    : 'Your Graduate Portal registration was rejected by the Alumni Admin.',
            ];
        }

        return [
            'code' => 'inactive',
            'account_status' => 'inactive',
            'error' => 'Account is inactive',
        ];
    }
}

if (!function_exists('gradtrack_update_graduate_account_verification')) {
    function gradtrack_update_graduate_account_verification(
        PDO $db,
        int $accountId,
        string $verificationStatus,
        ?int $reviewedBy = null,
        ?string $reason = null
    ): void {
        gradtrack_ensure_graduate_account_verification_schema($db);

        $verificationStatus = strtolower(trim($verificationStatus));
        if (!in_array($verificationStatus, ['pending', 'approved', 'rejected'], true)) {
            throw new InvalidArgumentException('Invalid alumni verification status');
        }

        $accountStatus = 'pending_verification';
        if ($verificationStatus === 'approved') {
            $accountStatus = 'active';
            $reason = null;
        } elseif ($verificationStatus === 'rejected') {
            $accountStatus = 'rejected';
        }

        $cleanReason = $reason !== null ? trim(substr((string) $reason, 0, 1000)) : null;
        if ($cleanReason === '') {
            $cleanReason = null;
        }

        $reviewedAtSql = $verificationStatus === 'pending' ? 'NULL' : 'NOW()';
        $reviewedByValue = $verificationStatus === 'pending' ? null : $reviewedBy;

        $stmt = $db->prepare("UPDATE graduate_accounts
                              SET status = :account_status,
                                  alumni_verification_status = :verification_status,
                                  alumni_verification_reason = :reason,
                                  alumni_verification_reviewed_by = :reviewed_by,
                                  alumni_verification_reviewed_at = {$reviewedAtSql},
                                  alumni_verification_submitted_at = COALESCE(alumni_verification_submitted_at, created_at, NOW())
                              WHERE id = :account_id");
        $stmt->execute([
            ':account_status' => $accountStatus,
            ':verification_status' => $verificationStatus,
            ':reason' => $cleanReason,
            ':reviewed_by' => $reviewedByValue,
            ':account_id' => $accountId,
        ]);
    }
}

if (!function_exists('gradtrack_ensure_graduate_profile_image_table')) {
    function gradtrack_ensure_graduate_profile_image_table(PDO $db): void
    {
        $db->exec("CREATE TABLE IF NOT EXISTS graduate_profile_images (
            id INT AUTO_INCREMENT PRIMARY KEY,
            graduate_account_id INT NOT NULL UNIQUE,
            file_path VARCHAR(255) NOT NULL,
            original_file_name VARCHAR(255) NULL,
            mime_type VARCHAR(120) NULL,
            file_size_bytes INT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_profile_image_account FOREIGN KEY (graduate_account_id) REFERENCES graduate_accounts(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }
}

if (!function_exists('gradtrack_ensure_graduate_cover_image_table')) {
    function gradtrack_ensure_graduate_cover_image_table(PDO $db): void
    {
        $db->exec("CREATE TABLE IF NOT EXISTS graduate_cover_images (
            id INT AUTO_INCREMENT PRIMARY KEY,
            graduate_account_id INT NOT NULL UNIQUE,
            file_path VARCHAR(255) NOT NULL,
            original_file_name VARCHAR(255) NULL,
            mime_type VARCHAR(120) NULL,
            file_size_bytes INT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_cover_image_account FOREIGN KEY (graduate_account_id) REFERENCES graduate_accounts(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }
}

if (!function_exists('gradtrack_current_graduate_user')) {
    function gradtrack_current_graduate_user(PDO $db): ?array
    {
        gradtrack_start_session_if_needed();
        gradtrack_ensure_graduate_account_verification_schema($db);
        gradtrack_ensure_graduate_profile_image_table($db);
        gradtrack_ensure_graduate_cover_image_table($db);

        if (!isset($_SESSION['graduate_account_id'])) {
            return null;
        }

        $accountId = (int) $_SESSION['graduate_account_id'];
        $query = "SELECT ga.id AS account_id, ga.email, ga.status, ga.last_login_at,
                         ga.alumni_verification_status, ga.alumni_verification_reason,
                         ga.alumni_verification_reviewed_at, ga.alumni_verification_submitted_at,
                         g.id AS graduate_id, g.student_id, g.first_name, g.middle_name, g.last_name,
                         g.phone, g.year_graduated, g.address,
                         p.id AS program_id, p.name AS program_name, p.code AS program_code
                  FROM graduate_accounts ga
                  JOIN graduates g ON ga.graduate_id = g.id
                  LEFT JOIN programs p ON g.program_id = p.id
                  WHERE ga.id = :account_id";

        $stmt = $db->prepare($query);
        $stmt->bindParam(':account_id', $accountId);
        $stmt->execute();
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user || !gradtrack_graduate_account_is_verified($user)) {
            unset($_SESSION['graduate_account_id']);
            return null;
        }

        $profileImageStmt = $db->prepare('SELECT file_path FROM graduate_profile_images WHERE graduate_account_id = :account_id LIMIT 1');
        $profileImageStmt->bindParam(':account_id', $accountId);
        $profileImageStmt->execute();
        $profileImagePath = $profileImageStmt->fetch(PDO::FETCH_ASSOC)['file_path'] ?? null;

        $coverImageStmt = $db->prepare('SELECT file_path FROM graduate_cover_images WHERE graduate_account_id = :account_id LIMIT 1');
        $coverImageStmt->bindParam(':account_id', $accountId);
        $coverImageStmt->execute();
        $coverImagePath = $coverImageStmt->fetch(PDO::FETCH_ASSOC)['file_path'] ?? null;

        return [
            'account_id' => (int) $user['account_id'],
            'graduate_id' => (int) $user['graduate_id'],
            'email' => $user['email'],
            'account_status' => $user['status'],
            'alumni_verification_status' => $user['alumni_verification_status'],
            'alumni_verification_submitted_at' => $user['alumni_verification_submitted_at'],
            'alumni_verification_reviewed_at' => $user['alumni_verification_reviewed_at'],
            'full_name' => trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')),
            'first_name' => $user['first_name'],
            'middle_name' => $user['middle_name'],
            'last_name' => $user['last_name'],
            'student_id' => $user['student_id'],
            'phone' => $user['phone'],
            'year_graduated' => $user['year_graduated'] !== null ? (int) $user['year_graduated'] : null,
            'address' => $user['address'],
            'program_id' => $user['program_id'] !== null ? (int) $user['program_id'] : null,
            'program_name' => $user['program_name'],
            'program_code' => $user['program_code'],
            'profile_image_path' => $profileImagePath,
            'cover_image_path' => $coverImagePath,
            'role' => 'graduate'
        ];
    }
}

if (!function_exists('gradtrack_require_graduate_auth')) {
    function gradtrack_require_graduate_auth(PDO $db): array
    {
        $user = gradtrack_current_graduate_user($db);

        if (!$user) {
            http_response_code(401);
            echo json_encode([
                'success' => false,
                'error' => 'Graduate authentication required'
            ]);
            exit;
        }

        return $user;
    }
}
