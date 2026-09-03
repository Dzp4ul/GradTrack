<?php
require_once __DIR__ . '/env.php';
require_once __DIR__ . '/session.php';

gradtrack_load_env_file();

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
    $allowedOrigins = array_values(array_filter(array_map('trim', explode(',', $configuredOrigins)), function ($origin) {
        return $origin !== '';
    }));
}

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowAnyOrigin = in_array('*', $allowedOrigins, true);
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
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Max-Age: 3600');
header('Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With');

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
