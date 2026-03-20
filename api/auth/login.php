<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

require_once '../config/database.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

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
