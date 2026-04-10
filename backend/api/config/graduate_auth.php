why its locked, i want that<?php

if (!function_exists('gradtrack_start_session_if_needed')) {
    function gradtrack_start_session_if_needed(): void
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
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

if (!function_exists('gradtrack_current_graduate_user')) {
    function gradtrack_current_graduate_user(PDO $db): ?array
    {
        gradtrack_start_session_if_needed();
        gradtrack_ensure_graduate_profile_image_table($db);

        if (!isset($_SESSION['graduate_account_id'])) {
            return null;
        }

        $accountId = (int) $_SESSION['graduate_account_id'];
        $query = "SELECT ga.id AS account_id, ga.email, ga.status, ga.last_login_at,
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

        if (!$user || ($user['status'] ?? 'inactive') !== 'active') {
            return null;
        }

        $profileImageStmt = $db->prepare('SELECT file_path FROM graduate_profile_images WHERE graduate_account_id = :account_id LIMIT 1');
        $profileImageStmt->bindParam(':account_id', $accountId);
        $profileImageStmt->execute();
        $profileImagePath = $profileImageStmt->fetch(PDO::FETCH_ASSOC)['file_path'] ?? null;

        return [
            'account_id' => (int) $user['account_id'],
            'graduate_id' => (int) $user['graduate_id'],
            'email' => $user['email'],
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
