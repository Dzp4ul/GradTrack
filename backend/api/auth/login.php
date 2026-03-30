<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["error" => "Method not allowed"]);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);

if (!isset($data['email']) || !isset($data['password'])) {
    http_response_code(400);
    echo json_encode(["error" => "Email and password are required"]);
    exit;
}

$email = trim($data['email']);
$password = $data['password'];

// Hardcoded admin credentials
$hardcodedEmail = "admin@norzagaray.edu.ph";
$hardcodedPassword = "admin123";

// Check hardcoded credentials first
if ($email === $hardcodedEmail && $password === $hardcodedPassword) {
    // Start session
    session_start();
    $_SESSION['user_id'] = 1;
    $_SESSION['email'] = $hardcodedEmail;
    $_SESSION['username'] = "admin";
    $_SESSION['full_name'] = "System Administrator";
    $_SESSION['role'] = "super_admin";

    http_response_code(200);
    echo json_encode([
        "success" => true,
        "user" => [
            "id" => 1,
            "username" => "admin",
            "email" => $hardcodedEmail,
            "full_name" => "System Administrator",
            "role" => "super_admin"
        ]
    ]);
    exit;
}

// Check database for other users
$database = new Database();
$conn = $database->getConnection();

try {
    $query = "SELECT id, username, email, full_name, role FROM admin_users WHERE email = :email";
    $stmt = $conn->prepare($query);
    $stmt->bindParam(':email', $email);
    $stmt->execute();

    if ($stmt->rowCount() === 0) {
        http_response_code(401);
        echo json_encode(["error" => "Invalid email or password"]);
        exit;
    }

    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    // Verify password (check against hashed password in database)
    $hashedPasswordQuery = "SELECT password FROM admin_users WHERE email = :email";
    $hashStmt = $conn->prepare($hashedPasswordQuery);
    $hashStmt->bindParam(':email', $email);
    $hashStmt->execute();
    $hashResult = $hashStmt->fetch(PDO::FETCH_ASSOC);

    if (!password_verify($password, $hashResult['password']) && $hashResult['password'] !== $password) {
        http_response_code(401);
        echo json_encode(["error" => "Invalid email or password"]);
        exit;
    }

    // Start session
    session_start();
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['email'] = $user['email'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['full_name'] = $user['full_name'];
    $_SESSION['role'] = $user['role'];

    http_response_code(200);
    echo json_encode([
        "success" => true,
        "user" => $user
    ]);

} catch(PDOException $e) {
    http_response_code(500);
    echo json_encode(["error" => "Database error: " . $e->getMessage()]);
}
?>
