<?php
require_once __DIR__ . '/session.php';

if (!function_exists('gradtrack_csrf_token')) {
    function gradtrack_csrf_token(): string
    {
        gradtrack_start_session();
        $token = (string) ($_SESSION['csrf_token'] ?? '');
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            $token = bin2hex(random_bytes(32));
            $_SESSION['csrf_token'] = $token;
        }
        gradtrack_send_private_no_store_headers();
        return $token;
    }
}

if (!function_exists('gradtrack_request_has_authenticated_session')) {
    function gradtrack_request_has_authenticated_session(): bool
    {
        return (int) ($_SESSION['admin_user_id'] ?? 0) > 0
            || (int) ($_SESSION['graduate_account_id'] ?? 0) > 0;
    }
}

if (!function_exists('gradtrack_csrf_token_matches')) {
    function gradtrack_csrf_token_matches(string $expected, string $provided): bool
    {
        return $expected !== '' && $provided !== '' && hash_equals($expected, $provided);
    }
}

if (!function_exists('gradtrack_enforce_csrf_for_request')) {
    /**
     * Require a synchronizer token only when an unsafe request carries an
     * authenticated PHP session. This keeps login, password recovery, and
     * public survey invitation flows available before authentication.
     */
    function gradtrack_enforce_csrf_for_request(): void
    {
        if (PHP_SAPI === 'cli' || (defined('GRADTRACK_CSRF_EXEMPT') && GRADTRACK_CSRF_EXEMPT === true)) {
            return;
        }

        $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        if (!in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            return;
        }

        gradtrack_start_session();
        if (!gradtrack_request_has_authenticated_session()) {
            session_write_close();
            return;
        }

        $expected = (string) ($_SESSION['csrf_token'] ?? '');
        $provided = trim((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
        $valid = gradtrack_csrf_token_matches($expected, $provided);
        session_write_close();

        if ($valid) {
            return;
        }

        http_response_code(419);
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store');
        echo json_encode([
            'success' => false,
            'error' => 'Your secure session token is missing or expired. Please retry.',
            'code' => 'csrf_invalid',
        ]);
        exit;
    }
}
