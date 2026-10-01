<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/psgc_address.php';

header('Content-Type: application/json; charset=utf-8');

if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
    http_response_code(405);
    header('Allow: GET');
    echo json_encode(['success' => false, 'error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$path = ltrim(trim((string) ($_GET['path'] ?? '')), '/');
if (!gradtrack_psgc_is_allowed_collection_path($path)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid PSGC collection path'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    echo json_encode(
        ['success' => true, 'data' => gradtrack_psgc_fetch_collection($path)],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
    );
} catch (GradTrackPsgcUnavailableException $exception) {
    http_response_code(503);
    echo json_encode(
        ['success' => false, 'error' => 'Philippine address data is temporarily unavailable'],
        JSON_UNESCAPED_UNICODE
    );
} catch (Throwable $exception) {
    error_log('GradTrack PSGC endpoint failed: ' . $exception->getMessage());
    http_response_code(500);
    echo json_encode(
        ['success' => false, 'error' => 'Unable to load Philippine address data'],
        JSON_UNESCAPED_UNICODE
    );
}
