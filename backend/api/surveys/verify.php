<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/system_settings.php';
require_once __DIR__ . '/../config/archive.php';
require_once __DIR__ . '/../config/graduation_years.php';

function survey_verification_graduate_name(array $graduate): string
{
    return trim(($graduate['first_name'] ?? '') . ' ' . ($graduate['last_name'] ?? ''));
}

function survey_verification_graduate_profile(array $graduate): array
{
    return [
        "student_id" => $graduate['student_id'],
        "first_name" => $graduate['first_name'],
        "middle_name" => $graduate['middle_name'],
        "last_name" => $graduate['last_name'],
        "email" => $graduate['email'],
        "phone" => $graduate['phone'],
        "year_graduated" => $graduate['year_graduated'],
        "address" => $graduate['address'],
        "program_id" => $graduate['program_id'],
        "program_name" => $graduate['program_name'],
        "program_code" => $graduate['program_code']
    ];
}

function survey_verification_find_completed_covered_response(
    PDO $conn,
    int $graduateId,
    $graduationYear
): ?array {
    $stmt = $conn->prepare("SELECT sr.id, sr.survey_id, sr.graduate_account_id, sr.submitted_at,
                                  s.title AS survey_title, s.status AS survey_status, s.archived_at AS survey_archived_at
                           FROM survey_responses sr
                           JOIN surveys s ON s.id = sr.survey_id
                           WHERE sr.graduate_id = :graduate_id
                             AND sr.submitted_at IS NOT NULL
                           ORDER BY sr.submitted_at DESC, sr.id DESC");
    $stmt->execute([':graduate_id' => $graduateId]);

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $response) {
        $coverage = gradtrack_get_survey_graduation_year_coverage($conn, (int) $response['survey_id']);
        if ($coverage['configured'] && gradtrack_graduation_year_is_allowed($graduationYear, $coverage['years'])) {
            return $response;
        }
    }

    return null;
}

function survey_verification_registration_token(PDO $conn, array $surveyResponse, int $graduateId): string
{
    $surveyId = (int) ($surveyResponse['survey_id'] ?? 0);
    if ($surveyId <= 0) {
        return '';
    }

    $tokenStmt = $conn->prepare("SELECT token
                                 FROM survey_tokens
                                 WHERE survey_id = :survey_id
                                   AND graduate_id = :graduate_id
                                   AND submitted_at IS NOT NULL
                                   AND expires_at >= NOW()
                                 ORDER BY submitted_at DESC, id DESC
                                 LIMIT 1");
    $tokenStmt->execute([
        ':survey_id' => $surveyId,
        ':graduate_id' => $graduateId,
    ]);
    $existingToken = trim((string) ($tokenStmt->fetchColumn() ?: ''));
    if ($existingToken !== '') {
        return $existingToken;
    }

    // A completed response remains valid for portal registration even after its
    // survey becomes inactive. Fresh identity verification grants a short-lived
    // token without reopening the historical survey for editing.
    $token = bin2hex(random_bytes(32));
    $tokenValues = [
        ':survey_id' => $surveyId,
        ':graduate_id' => $graduateId,
        ':token' => $token,
        ':submitted_at' => $surveyResponse['submitted_at'] ?? date('Y-m-d H:i:s'),
    ];
    $refreshStmt = $conn->prepare("UPDATE survey_tokens
                                   SET token = :token,
                                       expires_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE),
                                       submitted_at = :submitted_at
                                   WHERE survey_id = :survey_id
                                     AND graduate_id = :graduate_id
                                   ORDER BY id DESC
                                   LIMIT 1");
    $refreshStmt->execute($tokenValues);

    if ($refreshStmt->rowCount() === 0) {
        $insertStmt = $conn->prepare("INSERT INTO survey_tokens
            (survey_id, graduate_id, token, expires_at, submitted_at)
            VALUES (:survey_id, :graduate_id, :token, DATE_ADD(NOW(), INTERVAL 30 MINUTE), :submitted_at)");
        $insertStmt->execute($tokenValues);
    }

    return $token;
}

function survey_verification_send_already_answered(
    PDO $conn,
    array $graduate,
    array $graduateProfile,
    ?array $surveyResponse
): void {
    $graduateId = (int) $graduate['id'];
    $surveyResponseId = $surveyResponse && isset($surveyResponse['id']) ? (int) $surveyResponse['id'] : null;

    $accountStmt = $conn->prepare("SELECT id FROM graduate_accounts WHERE graduate_id = :graduate_id LIMIT 1");
    $accountStmt->execute([':graduate_id' => $graduateId]);
    $existingAccount = $accountStmt->fetch(PDO::FETCH_ASSOC);
    $hasAccount = (bool) $existingAccount;
    $registrationToken = !$hasAccount && $surveyResponseId !== null && $surveyResponseId > 0
        ? survey_verification_registration_token($conn, $surveyResponse ?? [], $graduateId)
        : '';
    $canCreateAccount = !$hasAccount && $surveyResponseId !== null && $surveyResponseId > 0 && $registrationToken !== '';

    http_response_code(409);
    echo json_encode([
        "success" => false,
        "error" => "Survey already submitted",
        "message" => $hasAccount
            ? "You have already completed this survey and already have a Graduate Portal account"
            : "You have already completed this survey",
        "data" => [
            "already_answered" => true,
            "account_exists" => $hasAccount,
            "can_create_account" => $canCreateAccount,
            "graduate_id" => $graduateId,
            "graduate_name" => survey_verification_graduate_name($graduate),
            "program" => $graduate['program_name'],
            "survey_response_id" => $surveyResponseId,
            "survey_id" => isset($surveyResponse['survey_id']) ? (int) $surveyResponse['survey_id'] : null,
            "survey_title" => $surveyResponse['survey_title'] ?? null,
            "survey_token" => $canCreateAccount ? $registrationToken : null,
            "profile" => $graduateProfile
        ]
    ]);
    exit();
}

$database = new Database();
$conn = $database->getConnection();
gradtrack_ensure_archive_schema($conn, 'surveys', true);
gradtrack_ensure_archive_schema($conn, 'graduates');
gradtrack_system_require_feature_enabled($conn, 'graduate_survey', 'Graduate Tracer Survey');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    
    $verificationMethod = $data['verification_method'] ?? 'student_number';
    $studentNumber = trim($data['student_number'] ?? '');
    $email = strtolower(trim($data['email'] ?? ''));
    $lastName = trim($data['last_name'] ?? '');
    $program = trim($data['program'] ?? '');
    $surveyId = $data['survey_id'] ?? null;
    $verificationMethod = $verificationMethod === 'email' ? 'email' : 'student_number';
    $identifierLabel = $verificationMethod === 'email' ? 'email address' : 'student number';
    $identifierValue = $verificationMethod === 'email' ? $email : $studentNumber;
    
    // Validate required fields
    if (empty($identifierValue) || empty($lastName) || empty($program)) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error" => ucfirst($identifierLabel) . ", last name, and program are required"
        ]);
        exit();
    }

    if ($verificationMethod === 'email' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode([
            "success" => false,
            "error" => "Invalid email address",
            "message" => "Please enter a valid email address"
        ]);
        exit();
    }
    
    try {
        // Step 1: Verify graduate exists in registrar database
        $identifierColumn = $verificationMethod === 'email' ? 'LOWER(g.email)' : 'g.student_id';
        $identifierParam = $verificationMethod === 'email' ? ':email' : ':student_number';
        $query = "SELECT g.*, p.name as program_name, p.code as program_code 
                  FROM graduates g
                  LEFT JOIN programs p ON g.program_id = p.id
                  WHERE {$identifierColumn} = {$identifierParam}
                  AND g.last_name LIKE :last_name
                  AND g.archived_at IS NULL";
        
        $stmt = $conn->prepare($query);
        $lastNamePattern = "%{$lastName}%";
        if ($verificationMethod === 'email') {
            $stmt->bindParam(':email', $email);
        } else {
            $stmt->bindParam(':student_number', $studentNumber);
        }
        $stmt->bindParam(':last_name', $lastNamePattern);
        $stmt->execute();
        
        $graduate = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$graduate) {
            http_response_code(404);
            echo json_encode([
                "success" => false,
                "error" => "Graduate not found in registrar records",
                "message" => "Please check your {$identifierLabel} and last name"
            ]);
            exit();
        }
        
        // Step 2: Verify program
        $programMatch = (
            stripos($graduate['program_name'], $program) !== false ||
            stripos($graduate['program_code'], $program) !== false ||
            $graduate['program_id'] == $program
        );
        
        if (!$programMatch) {
            http_response_code(403);
            echo json_encode([
                "success" => false,
                "error" => "Program does not match registrar records",
                "message" => "The program you selected does not match your records"
            ]);
            exit();
        }

        $graduateProfile = survey_verification_graduate_profile($graduate);

        // Portal onboarding follows the survey period assigned to the graduate's
        // Registrar graduation year. A response to that period remains valid
        // after another survey is activated.
        $completedCoveredResponse = survey_verification_find_completed_covered_response(
            $conn,
            (int) $graduate['id'],
            $graduate['year_graduated'] ?? null
        );
        if ($completedCoveredResponse !== null) {
            survey_verification_send_already_answered(
                $conn,
                $graduate,
                $graduateProfile,
                $completedCoveredResponse
            );
        }

        // Eligibility is based on the Registrar's stored graduation year and the
        // active survey's configured Year Graduated options. Student-number
        // prefixes and client-provided values are never used for this decision.
        $coverage = gradtrack_get_active_survey_graduation_year_coverage($conn);
        if ($coverage['survey'] === null) {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'code' => 'NO_ACTIVE_SURVEY',
                'title' => 'Survey Not Available',
                'error' => 'Survey not available',
                'message' => 'There is no active Graduate Tracer Survey available right now.',
            ]);
            exit();
        }
        if (!$coverage['configured']) {
            http_response_code(503);
            echo json_encode([
                'success' => false,
                'code' => 'GRADUATION_YEAR_COVERAGE_NOT_CONFIGURED',
                'title' => 'Survey Not Available',
                'error' => 'Survey not available',
                'message' => 'The Graduate Tracer Survey is not available right now because its graduation year coverage has not been configured. Please contact the administrator.',
            ]);
            exit();
        }

        $activeSurveyId = (int) $coverage['survey']['id'];
        if ($surveyId !== null && (int) $surveyId !== $activeSurveyId) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'code' => 'ACTIVE_SURVEY_REQUIRED',
                'title' => 'Survey Not Available',
                'error' => 'Survey not active',
                'message' => 'This Graduate Tracer Survey is no longer active.',
            ]);
            exit();
        }
        $surveyId = $activeSurveyId;

        if (!gradtrack_graduation_year_is_allowed($graduate['year_graduated'] ?? null, $coverage['years'])) {
            $coverageLabel = gradtrack_format_graduation_year_coverage($coverage['years']);
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'code' => 'GRADUATION_YEAR_NOT_ELIGIBLE',
                'title' => 'Survey Not Available',
                'error' => 'Graduation year not included',
                'message' => "This Graduate Tracer Survey is currently intended for graduates from {$coverageLabel}. Your graduation year is not included in the current survey.",
            ]);
            exit();
        }
        
        // Step 3: Check if survey exists
        if ($surveyId) {
            $surveyQuery = "SELECT * FROM surveys WHERE id = :survey_id AND archived_at IS NULL";
            $surveyStmt = $conn->prepare($surveyQuery);
            $surveyStmt->bindParam(':survey_id', $surveyId);
            $surveyStmt->execute();
            $survey = $surveyStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$survey) {
                http_response_code(404);
                echo json_encode([
                    "success" => false,
                    "error" => "Survey not found"
                ]);
                exit();
            }

            // Step 4: Block if a response already exists for this graduate/survey
            $responseCheckQuery = "SELECT sr.id, sr.survey_id, sr.graduate_account_id, sr.submitted_at,
                                          s.title AS survey_title
                                   FROM survey_responses sr
                                   JOIN surveys s ON s.id = sr.survey_id
                                   WHERE sr.survey_id = :survey_id
                                     AND sr.graduate_id = :graduate_id
                                   ORDER BY sr.submitted_at DESC, sr.id DESC
                                   LIMIT 1";
            $responseCheckStmt = $conn->prepare($responseCheckQuery);
            $responseCheckStmt->bindParam(':survey_id', $surveyId);
            $responseCheckStmt->bindParam(':graduate_id', $graduate['id']);
            $responseCheckStmt->execute();
            $existingSurveyResponse = $responseCheckStmt->fetch(PDO::FETCH_ASSOC);

            if ($existingSurveyResponse) {
                survey_verification_send_already_answered($conn, $graduate, $graduateProfile, $existingSurveyResponse);
            }
            
            // Step 5: Check if already submitted via token record
            $checkQuery = "SELECT * FROM survey_tokens 
                          WHERE survey_id = :survey_id 
                          AND graduate_id = :graduate_id 
                          AND submitted_at IS NOT NULL";
            $checkStmt = $conn->prepare($checkQuery);
            $checkStmt->bindParam(':survey_id', $surveyId);
            $checkStmt->bindParam(':graduate_id', $graduate['id']);
            $checkStmt->execute();
            
            if ($checkStmt->fetch()) {
                $submittedResponseStmt = $conn->prepare("SELECT sr.id, sr.survey_id, sr.graduate_account_id, sr.submitted_at,
                                                               s.title AS survey_title
                                                        FROM survey_responses sr
                                                        JOIN surveys s ON s.id = sr.survey_id
                                                        WHERE sr.survey_id = :survey_id
                                                          AND sr.graduate_id = :graduate_id
                                                        ORDER BY sr.submitted_at DESC, sr.id DESC
                                                        LIMIT 1");
                $submittedResponseStmt->bindParam(':survey_id', $surveyId);
                $submittedResponseStmt->bindParam(':graduate_id', $graduate['id']);
                $submittedResponseStmt->execute();
                $submittedResponse = $submittedResponseStmt->fetch(PDO::FETCH_ASSOC) ?: null;

                survey_verification_send_already_answered($conn, $graduate, $graduateProfile, $submittedResponse);
            }

            if (($survey['status'] ?? '') !== 'active') {
                http_response_code(404);
                echo json_encode([
                    "success" => false,
                    "error" => "Survey not active",
                    "message" => "This survey is no longer active"
                ]);
                exit();
            }
            
            // Step 6: Generate or retrieve token
            $tokenQuery = "SELECT token, expires_at FROM survey_tokens 
                          WHERE survey_id = :survey_id 
                          AND graduate_id = :graduate_id 
                          AND submitted_at IS NULL
                          AND expires_at >= NOW()";
            $tokenStmt = $conn->prepare($tokenQuery);
            $tokenStmt->bindParam(':survey_id', $surveyId);
            $tokenStmt->bindParam(':graduate_id', $graduate['id']);
            $tokenStmt->execute();
            $existingToken = $tokenStmt->fetch(PDO::FETCH_ASSOC);
            
            if ($existingToken) {
                // Reuse the unfinished survey token so graduates can resume later.
                $token = $existingToken['token'];
            } else {
                // Generate new token
                $token = bin2hex(random_bytes(32));
                $expiresAt = '9999-12-31 23:59:59';
                
                // Insert new token
                $insertQuery = "INSERT INTO survey_tokens (survey_id, graduate_id, token, expires_at)
                               VALUES (:survey_id, :graduate_id, :token, :expires_at)";
                $insertStmt = $conn->prepare($insertQuery);
                $insertStmt->bindParam(':survey_id', $surveyId);
                $insertStmt->bindParam(':graduate_id', $graduate['id']);
                $insertStmt->bindParam(':token', $token);
                $insertStmt->bindParam(':expires_at', $expiresAt);
                $insertStmt->execute();
            }
            
            // Return success with token
            http_response_code(200);
            echo json_encode([
                "success" => true,
                "message" => "Verification successful",
                "data" => [
                    "token" => $token,
                    "graduate_id" => $graduate['id'],
                    "graduate_name" => survey_verification_graduate_name($graduate),
                    "program" => $graduate['program_name'],
                    "survey_id" => (int) $surveyId,
                    "profile" => $graduateProfile
                ]
            ]);
        } else {
            // No survey ID provided, just verify identity
            http_response_code(200);
            echo json_encode([
                "success" => true,
                "message" => "Graduate verified",
                "data" => [
                    "graduate_id" => $graduate['id'],
                    "graduate_name" => survey_verification_graduate_name($graduate),
                    "program" => $graduate['program_name'],
                    "profile" => $graduateProfile
                ]
            ]);
        }
        
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode([
            "success" => false,
            "error" => gradtrack_public_exception_message($e, 'Unable to verify the survey invitation right now.', 'Survey verification API')
        ]);
    }
}
?>
