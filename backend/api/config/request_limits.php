<?php
require_once __DIR__ . '/env.php';

if (!function_exists('gradtrack_enforce_request_size_limit')) {
    function gradtrack_enforce_request_size_limit(): void
    {
        $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        if (!in_array($method, ['POST', 'PUT', 'PATCH'], true)) return;

        $maxMb = (int) gradtrack_env('UPLOAD_REQUEST_MAX_MB', 256);
        $maxMb = max(1, min($maxMb, 512));
        $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($contentLength <= $maxMb * 1024 * 1024) return;

        http_response_code(413);
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store');
        echo json_encode([
            'success' => false,
            'error' => "The request exceeds the {$maxMb} MB upload limit.",
            'code' => 'request_too_large',
        ]);
        exit;
    }
}
