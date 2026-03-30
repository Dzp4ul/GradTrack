<?php
if (!function_exists('gradtrack_load_env_file')) {
    function gradtrack_load_env_file()
    {
        $envFile = __DIR__ . '/../../.env';
        if (!file_exists($envFile)) {
            return;
        }

        $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            return;
        }

        foreach ($lines as $line) {
            $trimmed = trim($line);
            if ($trimmed === '' || strpos($trimmed, '#') === 0 || strpos($trimmed, '=') === false) {
                continue;
            }

            list($key, $value) = explode('=', $trimmed, 2);
            $key = trim($key);
            $value = trim($value);

            if ($key !== '' && getenv($key) === false) {
                putenv($key . '=' . $value);
            }
        }
    }
}

gradtrack_load_env_file();

$defaultAllowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174'
];

$configuredOrigins = getenv('CORS_ALLOWED_ORIGINS');
$allowedOrigins = $defaultAllowedOrigins;

if ($configuredOrigins !== false && trim($configuredOrigins) !== '') {
    $allowedOrigins = array_values(array_filter(array_map('trim', explode(',', $configuredOrigins)), function ($origin) {
        return $origin !== '';
    }));
}

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowAnyOrigin = in_array('*', $allowedOrigins, true);

if ($origin !== '' && ($allowAnyOrigin || in_array($origin, $allowedOrigins, true))) {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
} elseif (!empty($allowedOrigins)) {
    // Fallback keeps local development working when Origin is absent.
    header('Access-Control-Allow-Origin: ' . $allowedOrigins[0]);
}

header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Max-Age: 3600');
header('Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With');

$isHttps = (
    (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
    || (isset($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443)
    || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string) $_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https')
);

$secureFromEnv = getenv('SESSION_COOKIE_SECURE');
$isSecureCookie = $secureFromEnv !== false && $secureFromEnv !== ''
    ? filter_var($secureFromEnv, FILTER_VALIDATE_BOOLEAN)
    : $isHttps;

$sameSite = getenv('SESSION_COOKIE_SAMESITE');
$sameSite = $sameSite !== false && $sameSite !== '' ? ucfirst(strtolower($sameSite)) : ($isSecureCookie ? 'None' : 'Lax');

if (!in_array($sameSite, ['Lax', 'Strict', 'None'], true)) {
    $sameSite = $isSecureCookie ? 'None' : 'Lax';
}

if ($sameSite === 'None' && !$isSecureCookie) {
    // Browsers reject SameSite=None without Secure on HTTP.
    $sameSite = 'Lax';
}

$cookieDomain = getenv('SESSION_COOKIE_DOMAIN') ?: '';
$cookiePath = getenv('SESSION_COOKIE_PATH') ?: '/';

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => $cookiePath,
        'domain' => $cookieDomain,
        'secure' => $isSecureCookie,
        'httponly' => true,
        'samesite' => $sameSite
    ]);
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
