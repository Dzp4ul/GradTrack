<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/graduate_account_status.php';

$db = (new Database())->getConnection();
$updated = gradtrack_disable_inactive_graduate_accounts($db);
echo json_encode([
    'success' => true,
    'disabled_accounts' => $updated,
    'processed_at' => date(DATE_ATOM),
], JSON_PRETTY_PRINT) . PHP_EOL;
