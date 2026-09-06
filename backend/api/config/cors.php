<?php
require_once __DIR__ . '/env.php';
require_once __DIR__ . '/session.php';
require_once __DIR__ . '/csrf.php';
require_once __DIR__ . '/request_limits.php';

gradtrack_load_env_file();
gradtrack_register_production_error_handler();

$defaultAllowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175',
    'http://127.0.0.1:5176'
];

$configuredOrigins = getenv('CORS_ALLOWED_ORIGINS');
$allowedOrigins = $defaultAllowedOrigins;

if ($configuredOrigins !== false && trim($configuredOrigins) !== '') {
    $allowedOrigins = array_values(array_filter(array_map(static function ($origin) {
        $trimmed = trim((string) $origin);
        return $trimmed === '*' ? $trimmed : rtrim($trimmed, '/');
    }, explode(',', $configuredOrigins)), function ($origin) {
        return $origin !== '';
    }));
}

if (gradtrack_is_production()) {
    if ($configuredOrigins === false || trim($configuredOrigins) === '') {
        throw new RuntimeException('CORS_ALLOWED_ORIGINS is required in production.');
    }
    if ($allowedOrigins === []) {
        throw new RuntimeException('At least one production CORS origin is required.');
    }
    foreach ($allowedOrigins as $allowedOrigin) {
        $parsed = parse_url($allowedOrigin);
        $host = strtolower((string) ($parsed['host'] ?? ''));
        if (
            $allowedOrigin === '*'
            || filter_var($allowedOrigin, FILTER_VALIDATE_URL) === false
            || strtolower((string) ($parsed['scheme'] ?? '')) !== 'https'
            || $host === ''
            || in_array($host, ['localhost', '127.0.0.1'], true)
            || isset($parsed['user'])
            || isset($parsed['pass'])
            || isset($parsed['query'])
            || isset($parsed['fragment'])
            || (($parsed['path'] ?? '') !== '')
            || preg_match('/(?:example|change-me|your-)/i', $allowedOrigin) === 1
        ) {
            throw new RuntimeException('Production CORS origins must be explicit real HTTPS origins.');
        }
    }
}

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowAnyOrigin = !gradtrack_is_production() && in_array('*', $allowedOrigins, true);
$originAllowed = $origin === '' || $allowAnyOrigin || in_array($origin, $allowedOrigins, true);

if (!$originAllowed && strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'OPTIONS') {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Request origin is not allowed']);
    exit;
}

if ($origin !== '' && $originAllowed) {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
}

header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Max-Age: 3600');
header('Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With, X-CSRF-Token');

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

gradtrack_enforce_request_size_limit();
gradtrack_enforce_csrf_for_request();
