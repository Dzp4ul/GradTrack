<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$debug = [
    'current_file' => __FILE__,
    'current_dir' => __DIR__,
    'backend_root' => dirname(__DIR__),
    'env_path' => dirname(__DIR__) . '/.env',
    'env_exists' => file_exists(dirname(__DIR__) . '/.env'),
    'database_config_path' => __DIR__ . '/config/database.php',
    'database_config_exists' => file_exists(__DIR__ . '/config/database.php'),
];

// Try to load .env
$envFile = dirname(__DIR__) . '/.env';
if (file_exists($envFile)) {
    $envContent = file_get_contents($envFile);
    $debug['env_file_size'] = strlen($envContent);
    $debug['env_first_50_chars'] = substr($envContent, 0, 50);
    
    // Parse env
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    $envVars = [];
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        if (strpos($line, '=') !== false) {
            list($key, $value) = explode('=', $line, 2);
            $key = trim($key);
            // Hide password
            if ($key === 'DB_PASSWORD') {
                $envVars[$key] = '***HIDDEN***';
            } else {
                $envVars[$key] = trim($value);
            }
        }
    }
    $debug['env_variables'] = $envVars;
} else {
    $debug['env_error'] = '.env file not found';
}

// Test database connection
try {
    require_once __DIR__ . '/config/database.php';
    $database = new Database();
    $conn = $database->getConnection();
    $debug['database_connection'] = 'SUCCESS';
    
    // Test query
    $stmt = $conn->query("SELECT DATABASE() as current_db");
    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    $debug['current_database'] = $result['current_db'];
    
    // Check tables
    $stmt = $conn->query("SHOW TABLES");
    $tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
    $debug['tables_count'] = count($tables);
    $debug['tables'] = $tables;
    
} catch (Exception $e) {
    $debug['database_connection'] = 'FAILED';
    $debug['database_error'] = $e->getMessage();
}

echo json_encode($debug, JSON_PRETTY_PRINT);
