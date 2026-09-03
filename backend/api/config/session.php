<?php
require_once __DIR__ . '/env.php';

gradtrack_load_env_file();

if (!function_exists('gradtrack_request_is_https')) {
    function gradtrack_request_is_https(): bool
    {
        return (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
            || (isset($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443)
            || (isset($_SERVER['HTTP_X_FORWARDED_PROTO'])
                && strtolower(trim(explode(',', (string) $_SERVER['HTTP_X_FORWARDED_PROTO'])[0])) === 'https');
    }
}

if (!function_exists('gradtrack_session_cookie_name')) {
    function gradtrack_session_cookie_name(): string
    {
        $name = trim((string) gradtrack_env(
            'SESSION_COOKIE_NAME',
            gradtrack_env('PHP_SESSION_COOKIE_NAME', 'GRADTRACKSESSID')
        ));

        return preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/', $name) === 1
            ? $name
            : 'GRADTRACKSESSID';
    }
}

if (!function_exists('gradtrack_session_cookie_options')) {
    function gradtrack_session_cookie_options(): array
    {
        $secureSetting = gradtrack_env('SESSION_COOKIE_SECURE');
        $secure = $secureSetting !== null
            ? filter_var($secureSetting, FILTER_VALIDATE_BOOLEAN)
            : gradtrack_request_is_https();

        $sameSiteSetting = trim((string) gradtrack_env('SESSION_COOKIE_SAMESITE', $secure ? 'None' : 'Lax'));
        $sameSite = ucfirst(strtolower($sameSiteSetting));
        if (!in_array($sameSite, ['Lax', 'Strict', 'None'], true)) {
            $sameSite = $secure ? 'None' : 'Lax';
        }
        if ($sameSite === 'None' && !$secure) {
            $sameSite = 'Lax';
        }

        return [
            'lifetime' => 0,
            'path' => (string) gradtrack_env('SESSION_COOKIE_PATH', '/'),
            'domain' => (string) gradtrack_env('SESSION_COOKIE_DOMAIN', ''),
            'secure' => $secure,
            'httponly' => true,
            'samesite' => $sameSite,
        ];
    }
}

if (!function_exists('gradtrack_configure_session')) {
    function gradtrack_configure_session(): void
    {
        if (session_status() !== PHP_SESSION_NONE) {
            return;
        }

        ini_set('session.use_cookies', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_trans_sid', '0');
        ini_set('session.cookie_httponly', '1');
        ini_set('session.cookie_secure', gradtrack_session_cookie_options()['secure'] ? '1' : '0');
        ini_set('session.cookie_samesite', gradtrack_session_cookie_options()['samesite']);
        ini_set('session.sid_length', '48');
        ini_set('session.sid_bits_per_character', '5');

        session_name(gradtrack_session_cookie_name());
        session_set_cookie_params(gradtrack_session_cookie_options());
    }
}

if (!function_exists('gradtrack_start_session')) {
    function gradtrack_start_session(): void
    {
        if (session_status() === PHP_SESSION_NONE) {
            gradtrack_configure_session();
            if (!session_start()) {
                throw new RuntimeException('Unable to start the authenticated session');
            }
        }
    }
}

if (!function_exists('gradtrack_send_private_no_store_headers')) {
    function gradtrack_send_private_no_store_headers(): void
    {
        if (headers_sent()) {
            return;
        }

        header('Cache-Control: no-store, no-cache, must-revalidate, private');
        header('Pragma: no-cache');
        header('Expires: 0');
        header('Vary: Cookie', false);
    }
}

if (!function_exists('gradtrack_establish_session_identity')) {
    function gradtrack_establish_session_identity(string $identityKey, int $identityId): void
    {
        if (!in_array($identityKey, ['admin_user_id', 'graduate_account_id'], true) || $identityId <= 0) {
            throw new InvalidArgumentException('Invalid authenticated session identity');
        }

        gradtrack_start_session();
        $_SESSION = [];
        if (!session_regenerate_id(true)) {
            throw new RuntimeException('Unable to rotate the authenticated session');
        }
        $_SESSION[$identityKey] = $identityId;
        $_SESSION['authenticated_at'] = time();
        gradtrack_send_private_no_store_headers();
    }
}

if (!function_exists('gradtrack_destroy_current_session')) {
    function gradtrack_destroy_current_session(): void
    {
        gradtrack_start_session();
        $_SESSION = [];

        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 42000,
                'path' => $params['path'] ?: '/',
                'domain' => $params['domain'] ?: '',
                'secure' => (bool) $params['secure'],
                'httponly' => true,
                'samesite' => $params['samesite'] ?: 'Lax',
            ]);
        }

        session_destroy();
        gradtrack_send_private_no_store_headers();
    }
}

gradtrack_configure_session();
