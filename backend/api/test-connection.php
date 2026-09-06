<?php
require_once __DIR__ . '/config/env.php';
gradtrack_require_development_endpoint();

header("Content-Type: application/json");

echo json_encode([
    "status" => "success",
    "message" => "Backend is accessible",
    "timestamp" => date('Y-m-d H:i:s')
]);
