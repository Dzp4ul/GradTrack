<?php
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/admin_profile_image.php';
require_once __DIR__ . '/storage.php';

if (!function_exists('gradtrack_admin_user_select')) {
    function gradtrack_admin_user_select(PDO $db, int $userId): ?array
    {
        try {
            $stmt = $db->prepare('SELECT id, username, email, full_name, role, password, is_active FROM admin_users WHERE id = :id LIMIT 1');
            $stmt->execute([':id' => $userId]);
        } catch (PDOException $exception) {
            // Preserve compatibility with databases created before is_active was added.
            $stmt = $db->prepare('SELECT id, username, email, full_name, role, password, 1 AS is_active FROM admin_users WHERE id = :id LIMIT 1');
            $stmt->execute([':id' => $userId]);
        }

        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$user || (int) ($user['is_active'] ?? 1) !== 1) {
            return null;
        }

        $user['id'] = (int) $user['id'];
        $user['profile_image_path'] = gradtrack_storage_media_access_reference(
            gradtrack_admin_profile_image_path($db, $user['id'])
        );
        unset($user['is_active']);

        return $user;
    }
}

if (!function_exists('gradtrack_current_admin_user')) {
    function gradtrack_current_admin_user(PDO $db): ?array
    {
        gradtrack_start_session();
        $userId = isset($_SESSION['admin_user_id']) ? (int) $_SESSION['admin_user_id'] : 0;
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        if ($userId <= 0) {
            return null;
        }

        $user = gradtrack_admin_user_select($db, $userId);
        if ($user !== null) {
            return $user;
        }

        // Revoke only the session which supplied this invalid/deactivated ID.
        gradtrack_start_session();
        if ((int) ($_SESSION['admin_user_id'] ?? 0) === $userId) {
            gradtrack_destroy_current_session();
        } elseif (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        return null;
    }
}

if (!function_exists('gradtrack_require_admin_auth')) {
    function gradtrack_require_admin_auth(PDO $db, ?array $allowedRoles = null, ?string $forbiddenMessage = null): array
    {
        $user = gradtrack_current_admin_user($db);
        if ($user === null) {
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Authentication required']);
            exit;
        }

        if ($allowedRoles !== null && !in_array((string) $user['role'], $allowedRoles, true)) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => $forbiddenMessage ?: 'You do not have permission to access this resource',
            ]);
            exit;
        }

        return $user;
    }
}

if (!function_exists('gradtrack_admin_audit_context')) {
    function gradtrack_admin_audit_context(array $user): array
    {
        $role = (string) ($user['role'] ?? 'guest');
        $name = trim((string) ($user['full_name'] ?? ''));
        if ($name === '') {
            $name = trim((string) ($user['username'] ?? $user['email'] ?? 'Guest'));
        }

        return [
            'user_id' => isset($user['id']) ? (int) $user['id'] : null,
            'user_name' => $name !== '' ? $name : 'Guest',
            'user_role' => $role,
            'department' => function_exists('gradtrack_audit_role_department')
                ? gradtrack_audit_role_department($role)
                : null,
        ];
    }
}

if (!function_exists('gradtrack_public_admin_user')) {
    function gradtrack_public_admin_user(array $user): array
    {
        return [
            'id' => (int) $user['id'],
            'username' => (string) ($user['username'] ?? ''),
            'email' => (string) ($user['email'] ?? ''),
            'full_name' => (string) ($user['full_name'] ?? ''),
            'role' => (string) ($user['role'] ?? ''),
            'profile_image_path' => gradtrack_storage_media_access_reference($user['profile_image_path'] ?? null),
        ];
    }
}
