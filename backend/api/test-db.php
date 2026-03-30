<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Load environment variables
function loadEnv() {
    $envFile = __DIR__ . '/../.env';
    if (file_exists($envFile)) {
        $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (strpos(trim($line), '#') === 0) continue;
            list($key, $value) = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);
            if (!getenv($key)) {
                putenv("$key=$value");
            }
        }
    }
}

loadEnv();

$response = [
    'status' => 'testing',
    'environment' => [
        'DB_HOST' => getenv('DB_HOST'),
        'DB_NAME' => getenv('DB_NAME'),
        'DB_USER' => getenv('DB_USER'),
        'DB_PORT' => getenv('DB_PORT'),
        'DB_PASSWORD' => getenv('DB_PASSWORD') ? '***SET***' : 'NOT SET'
    ]
];

// Test database connection
try {
    $host = getenv('DB_HOST');
    $dbname = getenv('DB_NAME');
    $username = getenv('DB_USER');
    $password = getenv('DB_PASSWORD');
    $port = getenv('DB_PORT') ?: 3306;
    
    $dsn = "mysql:host=$host;port=$port;dbname=$dbname";
    $pdo = new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
    
    $response['database_connection'] = 'SUCCESS';
    
    // Test if users table exists
    $stmt = $pdo->query("SHOW TABLES LIKE 'users'");
    if ($stmt->rowCount() > 0) {
        $response['users_table'] = 'EXISTS';
        
        // Count users
        $stmt = $pdo->query("SELECT COUNT(*) as count FROM users");
        $count = $stmt->fetch();
        $response['users_count'] = $count['count'];
        
        // Get first user (without password)
        $stmt = $pdo->query("SELECT id, email, username, role FROM users LIMIT 1");
        $user = $stmt->fetch();
        $response['sample_user'] = $user ?: 'No users found';
    } else {
        $response['users_table'] = 'NOT FOUND';
    }
    
} catch (PDOException $e) {
    $response['database_connection'] = 'FAILED';
    $response['error'] = $e->getMessage();
}

echo json_encode($response, JSON_PRETTY_PRINT);
