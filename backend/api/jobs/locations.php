<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/admin_auth.php';
require_once __DIR__ . '/../config/admin_roles.php';
require_once __DIR__ . '/../config/psgc_address.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

try {
    $db = (new Database())->getConnection();
    $graduate = gradtrack_current_graduate_user($db);
    $admin = gradtrack_current_admin_user($db);
    $authorizedAdmin = $admin
        && in_array((string) ($admin['role'] ?? ''), gradtrack_job_posting_admin_roles(), true);

    if (!$graduate && !$authorizedAdmin) {
        http_response_code($admin ? 403 : 401);
        echo json_encode(['success' => false, 'error' => 'Authentication required']);
        exit;
    }

    $locations = gradtrack_psgc_fetch_collection('cities-municipalities');
    $items = [];
    foreach ($locations as $location) {
        $cityMunicipality = trim((string) ($location['name'] ?? ''));
        $province = trim((string) ($location['province'] ?? ''));
        $region = trim((string) ($location['region'] ?? ''));
        if ($cityMunicipality === '' || empty($location['code'])) {
            continue;
        }

        $area = $province !== '' ? $province : $region;
        $items[] = [
            'code' => (string) $location['code'],
            'name' => $cityMunicipality . ($area !== '' ? ', ' . $area : ''),
            'city_municipality' => $cityMunicipality,
            'province' => $province !== '' ? $province : null,
            'region' => $region !== '' ? $region : null,
            'type' => isset($location['type']) ? (string) $location['type'] : null,
        ];
    }

    usort($items, static function (array $left, array $right): int {
        return strcasecmp((string) $left['name'], (string) $right['name']);
    });

    echo json_encode(['success' => true, 'data' => $items], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (GradTrackPsgcUnavailableException $error) {
    http_response_code(503);
    echo json_encode(['success' => false, 'error' => 'Philippine location suggestions are temporarily unavailable.']);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => gradtrack_public_exception_message($error, 'Unable to load Philippine locations right now.', 'Job locations API'),
    ]);
}
