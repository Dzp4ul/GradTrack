<?php
require_once __DIR__ . '/env.php';

if (!function_exists('gradtrack_admin_password_error')) {
    function gradtrack_admin_password_error(string $password): ?string
    {
        if (
            strlen($password) < 12
            || preg_match('/[a-z]/', $password) !== 1
            || preg_match('/[A-Z]/', $password) !== 1
            || preg_match('/\d/', $password) !== 1
            || preg_match('/[^A-Za-z0-9]/', $password) !== 1
        ) {
            return 'Password must be at least 12 characters and include uppercase, lowercase, number, and symbol';
        }
        return null;
    }
}

if (!function_exists('gradtrack_admin_password_is_hash')) {
    function gradtrack_admin_password_is_hash(string $storedPassword): bool
    {
        return !empty(password_get_info($storedPassword)['algo']);
    }
}

if (!function_exists('gradtrack_verify_admin_password')) {
    function gradtrack_verify_admin_password(string $password, string $storedPassword): bool
    {
        if (gradtrack_admin_password_is_hash($storedPassword)) {
            return password_verify($password, $storedPassword);
        }

        return !gradtrack_is_production()
            && gradtrack_env_bool('ALLOW_LEGACY_PLAINTEXT_PASSWORDS', true)
            && hash_equals($storedPassword, $password);
    }
}
