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
    
    // Admin credentials
    $adminEmail = 'admin@norzagaray.edu.ph';
    $adminPassword = 'admin123';
    $adminUsername = 'admin';
    $adminFullName = 'System Administrator';
    $adminRole = 'super_admin';
    
    // Check if admin already exists
    $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->execute([$adminEmail]);
    
    if ($stmt->rowCount() > 0) {
        echo json_encode([
            'status' => 'exists',
            'message' => 'Admin user already exists',
            'email' => $adminEmail
        ], JSON_PRETTY_PRINT);
    } else {
        // Create admin user
        $hashedPassword = password_hash($adminPassword, PASSWORD_DEFAULT);
        
        $stmt = $pdo->prepare("
            INSERT INTO users (email, password, username, full_name, role, created_at) 
            VALUES (?, ?, ?, ?, ?, NOW())
        ");
        
        $stmt->execute([
            $adminEmail,
            $hashedPassword,
            $adminUsername,
            $adminFullName,
            $adminRole
        ]);
        
        echo json_encode([
            'status' => 'created',
            'message' => 'Admin user created successfully',
            'credentials' => [
                'email' => $adminEmail,
                'password' => $adminPassword,
                'username' => $adminUsername
            ]
        ], JSON_PRETTY_PRINT);
    }
    
} catch (PDOException $e) {
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ], JSON_PRETTY_PRINT);
}
