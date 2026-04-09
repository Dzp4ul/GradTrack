<?php

if (!function_exists('gradtrack_start_session_if_needed')) {
    function gradtrack_start_session_if_needed(): void
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
    }
}

if (!function_exists('gradtrack_current_graduate_user')) {
    function gradtrack_current_graduate_user(PDO $db): ?array
    {
        gradtrack_start_session_if_needed();

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
