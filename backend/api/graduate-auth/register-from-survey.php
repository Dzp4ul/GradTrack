<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$responseId = isset($data['survey_response_id']) ? (int) $data['survey_response_id'] : 0;
$graduateId = isset($data['graduate_id']) ? (int) $data['graduate_id'] : 0;
$email = isset($data['email']) ? strtolower(trim($data['email'])) : '';
$password = $data['password'] ?? '';
$confirmPassword = $data['confirm_password'] ?? '';

if ($responseId <= 0 || $graduateId <= 0 || $email === '' || $password === '' || $confirmPassword === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Required fields are missing']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Please provide a valid email address']);
    exit;
}

if (!preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/', $password)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol']);
    exit;
}

if ($password !== $confirmPassword) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Password and confirm password do not match']);
    exit;
}

$database = new Database();
$db = $database->getConnection();

try {
    $db->beginTransaction();

    $responseQuery = "SELECT id, graduate_id FROM survey_responses WHERE id = :response_id";
    $responseStmt = $db->prepare($responseQuery);
    $responseStmt->bindParam(':response_id', $responseId);
    $responseStmt->execute();
    $response = $responseStmt->fetch(PDO::FETCH_ASSOC);

    if (!$response) {
        $db->rollBack();
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Survey submission record not found']);
        exit;
    }

    if ((int) $response['graduate_id'] !== $graduateId) {
        $db->rollBack();
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Survey submission does not match graduate profile']);
        exit;
    }

    $dupQuery = "SELECT id FROM graduate_accounts WHERE email = :email";
    $dupStmt = $db->prepare($dupQuery);
    $dupStmt->bindParam(':email', $email);
    $dupStmt->execute();

    if ($dupStmt->fetch(PDO::FETCH_ASSOC)) {
        $db->rollBack();
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'error' => 'An account with this email already exists',
            'suggestion' => 'Please sign in instead of creating a new account'
        ]);
        exit;
    }

    $existingGraduateAccountQuery = "SELECT id FROM graduate_accounts WHERE graduate_id = :graduate_id";
    $existingGraduateAccountStmt = $db->prepare($existingGraduateAccountQuery);
    $existingGraduateAccountStmt->bindParam(':graduate_id', $graduateId);
    $existingGraduateAccountStmt->execute();

    if ($existingGraduateAccountStmt->fetch(PDO::FETCH_ASSOC)) {
        $db->rollBack();
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'error' => 'This graduate already has an account',
            'suggestion' => 'Please sign in using your existing account'
        ]);
        exit;
    }

    $updateGraduate = $db->prepare("UPDATE graduates
        SET email = :email,
            phone = COALESCE(:phone, phone),
            year_graduated = COALESCE(:year_graduated, year_graduated),
            address = COALESCE(:address, address),
            program_id = COALESCE(:program_id, program_id)
        WHERE id = :graduate_id");

    $phone = isset($data['phone']) && trim((string) $data['phone']) !== '' ? trim((string) $data['phone']) : null;
    $yearGraduated = isset($data['year_graduated']) && is_numeric($data['year_graduated']) ? (int) $data['year_graduated'] : null;
    $address = isset($data['address']) && trim((string) $data['address']) !== '' ? trim((string) $data['address']) : null;
    $programId = isset($data['program_id']) && is_numeric($data['program_id']) ? (int) $data['program_id'] : null;

    $updateGraduate->bindParam(':email', $email);
    $updateGraduate->bindParam(':phone', $phone);
    $updateGraduate->bindParam(':year_graduated', $yearGraduated);
    $updateGraduate->bindParam(':address', $address);
    $updateGraduate->bindParam(':program_id', $programId);
    $updateGraduate->bindParam(':graduate_id', $graduateId);
    $updateGraduate->execute();

    $passwordHash = password_hash($password, PASSWORD_BCRYPT);

    $createAccountQuery = "INSERT INTO graduate_accounts (graduate_id, email, password_hash, source_survey_response_id)
                           VALUES (:graduate_id, :email, :password_hash, :source_response_id)";
    $createAccountStmt = $db->prepare($createAccountQuery);
    $createAccountStmt->bindParam(':graduate_id', $graduateId);
    $createAccountStmt->bindParam(':email', $email);
    $createAccountStmt->bindParam(':password_hash', $passwordHash);
    $createAccountStmt->bindParam(':source_response_id', $responseId);
    $createAccountStmt->execute();

    $accountId = (int) $db->lastInsertId();

    $linkSurveyQuery = "UPDATE survey_responses
                        SET graduate_account_id = :account_id
                        WHERE id = :response_id";
    $linkSurveyStmt = $db->prepare($linkSurveyQuery);
    $linkSurveyStmt->bindParam(':account_id', $accountId);
    $linkSurveyStmt->bindParam(':response_id', $responseId);
    $linkSurveyStmt->execute();

    gradtrack_start_session_if_needed();
    $_SESSION['graduate_account_id'] = $accountId;

    $db->commit();

    $user = gradtrack_current_graduate_user($db);

    http_response_code(201);
    echo json_encode([
        'success' => true,
        'message' => 'Graduate account created successfully',
        'user' => $user
    ]);
} catch (Exception $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to create account: ' . $e->getMessage()]);
}
