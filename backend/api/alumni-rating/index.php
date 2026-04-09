<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/alumni_rating.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

try {
    $database = new Database();
    $db = $database->getConnection();
    $user = gradtrack_require_graduate_auth($db);

    $rating = gradtrack_get_alumni_rating($db, $user);

    echo json_encode([
        'success' => true,
        'data' => [
            'user' => [
                'account_id' => $user['account_id'],
                'graduate_id' => $user['graduate_id'],
                'full_name' => $user['full_name'],
            ],
            'rating' => $rating,
        ],
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
