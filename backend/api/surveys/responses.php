<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/audit_trail.php';
require_once __DIR__ . '/../../vendor/autoload.php';

use PHPMailer\PHPMailer\Exception as MailException;
use PHPMailer\PHPMailer\PHPMailer;

function survey_response_clean_text($value): string
{
        return trim((string) ($value ?? ''));
}

function survey_response_escape($value): string
{
        return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function survey_response_mailer(): PHPMailer
{
        $host = survey_response_clean_text(getenv('MAIL_HOST') ?: 'smtp.gmail.com');
        $username = survey_response_clean_text(getenv('MAIL_USERNAME') ?: '');
        $password = str_replace(' ', '', survey_response_clean_text(getenv('MAIL_PASSWORD') ?: ''));
        $fromAddress = survey_response_clean_text(getenv('MAIL_FROM_ADDRESS') ?: $username);
        $fromName = survey_response_clean_text(getenv('MAIL_FROM_NAME') ?: 'GRADTRACK');

        if ($host === '' || $username === '' || $password === '' || $fromAddress === '') {
                throw new RuntimeException('Mail credentials are not configured.');
        }

        $mail = new PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = $host;
        $mail->SMTPAuth = true;
        $mail->Username = $username;
        $mail->Password = $password;
        $mail->Port = (int) (getenv('MAIL_PORT') ?: 587);
        $mail->CharSet = 'UTF-8';

        $encryption = strtolower(survey_response_clean_text(getenv('MAIL_ENCRYPTION') ?: 'tls'));
        if ($encryption === 'ssl' || $encryption === 'smtps') {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        } elseif ($encryption === 'tls' || $encryption === 'starttls') {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        }

        $mail->setFrom($fromAddress, $fromName);
        $mail->addReplyTo($fromAddress, $fromName);

        return $mail;
}

function survey_response_frontend_url(): string
{
        $configuredUrl = getenv('FRONTEND_URL') ?: getenv('APP_URL') ?: '';
        if (trim($configuredUrl) !== '') {
                return rtrim(trim($configuredUrl), '/');
        }

        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        return $origin !== '' ? rtrim($origin, '/') : 'http://localhost:5173';
}

    function survey_response_collect_question_keys(array $decodedResponses): array
    {
        $keys = [];
        foreach (array_keys($decodedResponses) as $key) {
            $stringKey = (string) $key;
            if ($stringKey !== '' && ctype_digit($stringKey)) {
                $keys[(int) $stringKey] = (int) $stringKey;
            }
        }

        if (empty($keys)) {
            return [];
        }

        sort($keys, SORT_NUMERIC);
        return array_values($keys);
    }

    function survey_response_build_question_key_map(array $questions, array $decodedResponses): array
    {
        $map = [];
        foreach ($questions as $question) {
            $questionId = (string) ($question['id'] ?? '');
            if ($questionId === '' || !ctype_digit($questionId)) {
                continue;
            }

            $map[$questionId] = [$questionId];
        }

        if (empty($map)) {
            return $map;
        }

        $responseKeys = survey_response_collect_question_keys($decodedResponses);
        if (empty($responseKeys)) {
            return $map;
        }

        usort($questions, static function ($a, $b) {
            return ((int) ($a['sort_order'] ?? 0)) <=> ((int) ($b['sort_order'] ?? 0));
        });

        $firstQuestion = $questions[0] ?? null;
        if ($firstQuestion === null || !isset($firstQuestion['id'])) {
            return $map;
        }

        $firstQuestionId = (int) $firstQuestion['id'];
        $firstSortOrder = (int) ($firstQuestion['sort_order'] ?? 0);
        $firstResponseKey = (int) min($responseKeys);
        $idOffset = $firstQuestionId - $firstResponseKey;

        foreach ($questions as $question) {
            if (!isset($question['id'])) {
                continue;
            }

            $questionId = (string) $question['id'];
            if (!isset($map[$questionId])) {
                continue;
            }

            $historicalKeys = [
                $firstResponseKey + ((int) ($question['sort_order'] ?? 0) - $firstSortOrder),
                (int) $question['id'] - $idOffset,
            ];

            foreach ($historicalKeys as $historicalKey) {
                if ($historicalKey <= 0) {
                    continue;
                }

                $historicalKeyString = (string) $historicalKey;
                if (!in_array($historicalKeyString, $map[$questionId], true)) {
                    $map[$questionId][] = $historicalKeyString;
                }
            }
        }

        return $map;
    }

    function survey_response_get_answer_by_keys(array $decodedResponses, array $keys)
    {
        foreach ($keys as $key) {
            if (array_key_exists($key, $decodedResponses)) {
                return $decodedResponses[$key];
            }
        }

        return null;
    }

function survey_response_send_confirmation_email(PDO $conn, int $graduateId, int $surveyId): array
{
        $graduateStmt = $conn->prepare("SELECT g.first_name, g.last_name, g.email, p.code AS program_code
                                                                     FROM graduates g
                                                                     LEFT JOIN programs p ON p.id = g.program_id
                                                                     WHERE g.id = :id
                                                                     LIMIT 1");
        $graduateStmt->execute([':id' => $graduateId]);
        $graduate = $graduateStmt->fetch(PDO::FETCH_ASSOC);

        if (!$graduate) {
                return ["sent" => false, "reason" => "Graduate record not found"];
        }

        $email = survey_response_clean_text($graduate['email'] ?? '');
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return ["sent" => false, "reason" => "Missing or invalid graduate email"];
        }

        $surveyStmt = $conn->prepare("SELECT title FROM surveys WHERE id = :id LIMIT 1");
        $surveyStmt->execute([':id' => $surveyId]);
        $survey = $surveyStmt->fetch(PDO::FETCH_ASSOC);
        $surveyTitle = (string) ($survey['title'] ?? 'Graduate Tracer Study Survey');

        $name = trim((string) ($graduate['first_name'] ?? '') . ' ' . (string) ($graduate['last_name'] ?? ''));
        $name = $name !== '' ? $name : 'Graduate';
        $programCode = survey_response_escape((string) ($graduate['program_code'] ?? ''));
        $surveyTitleEsc = survey_response_escape($surveyTitle);
        $safeName = survey_response_escape($name);
        $surveyLink = survey_response_frontend_url() . '/survey-verify?survey_id=' . urlencode((string) $surveyId);
        $safeSurveyLink = survey_response_escape($surveyLink);

        $subject = 'Survey Participation Confirmation - GradTrack';
        $html = <<<HTML
<!doctype html>
<html>
    <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#14213d;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:28px 12px;">
            <tr>
                <td align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #dbe4f0;border-radius:8px;overflow:hidden;">
                        <tr>
                            <td style="background:#173b80;padding:22px 28px;border-bottom:4px solid #f4c400;">
                                <div style="font-size:24px;font-weight:800;color:#ffffff;">Grad<span style="color:#f4c400;">Track</span></div>
                                <div style="margin-top:8px;font-size:13px;color:#dce8ff;">Norzagaray College Graduate Tracer Study</div>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:30px 28px 10px;">
                                <div style="display:inline-block;background:#eaf2ff;color:#173b80;border-radius:6px;padding:7px 10px;font-size:12px;font-weight:700;">{$programCode}</div>
                                <h1 style="margin:18px 0 10px;font-size:24px;line-height:1.3;color:#10213f;">Survey response received</h1>
                                <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#41516d;">Hello {$safeName},</p>
                                <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#41516d;">Thank you for participating in the survey. We have successfully recorded your response.</p>
                                <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#5d6b83;">Survey: <strong>{$surveyTitleEsc}</strong></p>
                                <p style="margin:0;font-size:12px;line-height:1.6;color:#7b8798;">Reference link:<br><a href="{$safeSurveyLink}" style="color:#173b80;word-break:break-all;">{$safeSurveyLink}</a></p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:24px 28px 30px;">
                                <div style="border-top:1px solid #e4eaf3;padding-top:18px;font-size:13px;line-height:1.7;color:#6b778d;">
                                    Thank you,<br>
                                    <strong style="color:#10213f;">GRADTRACK</strong>
                                </div>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
</html>
HTML;

        $text = "Hello {$name},\n\n"
                . "Thank you for participating in the survey. We have successfully recorded your response.\n\n"
                . "Survey: {$surveyTitle}\n"
                . "Reference link: {$surveyLink}\n\n"
                . "Thank you,\nGRADTRACK";

        $mailer = survey_response_mailer();
        $mailer->addAddress($email, $name);
        $mailer->Subject = $subject;
        $mailer->isHTML(true);
        $mailer->Body = $html;
        $mailer->AltBody = $text;
        $mailer->send();
        $mailer->smtpClose();

        return ["sent" => true, "email" => $email];
}

$database = new Database();
$conn = $database->getConnection();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    
    $token = $data['token'] ?? null;
    $surveyId = $data['survey_id'] ?? null;
    $graduateId = $data['graduate_id'] ?? null;
    $responses = $data['responses'] ?? [];

    try {
        $conn->beginTransaction();
        
        // If token provided, validate it
        if ($token) {
            $tokenQuery = "SELECT * FROM survey_tokens 
                          WHERE token = :token 
                          AND survey_id = :survey_id
                          AND submitted_at IS NULL";
            $tokenStmt = $conn->prepare($tokenQuery);
            $tokenStmt->bindParam(':token', $token);
            $tokenStmt->bindParam(':survey_id', $surveyId);
            $tokenStmt->execute();
            $tokenData = $tokenStmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$tokenData) {
                $conn->rollBack();
                http_response_code(403);
                echo json_encode([
                    "success" => false,
                    "error" => "Invalid token"
                ]);
                exit();
            }
            
            // Use graduate_id from token
            $graduateId = $tokenData['graduate_id'];
            
            // Get client IP
            $ipAddress = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null;
        }
        
        // Check for duplicate submission
        if ($graduateId && $surveyId) {
            $dupQuery = "SELECT id FROM survey_responses 
                        WHERE survey_id = :survey_id 
                        AND graduate_id = :graduate_id";
            $dupStmt = $conn->prepare($dupQuery);
            $dupStmt->bindParam(':survey_id', $surveyId);
            $dupStmt->bindParam(':graduate_id', $graduateId);
            $dupStmt->execute();
            
            if ($dupStmt->fetch()) {
                $conn->rollBack();
                http_response_code(409);
                echo json_encode([
                    "success" => false,
                    "error" => "Survey already submitted"
                ]);
                exit();
            }
        }
        
        // Insert survey response
        $query = "INSERT INTO survey_responses (survey_id, graduate_id, responses, submitted_at)
                  VALUES (:survey_id, :graduate_id, :responses, NOW())";

        $stmt = $conn->prepare($query);
        $responsesJson = json_encode($responses);

        $stmt->bindParam(':survey_id', $surveyId);
        $stmt->bindParam(':graduate_id', $graduateId);
        $stmt->bindParam(':responses', $responsesJson);

        $stmt->execute();
        $responseId = $conn->lastInsertId();
        
        // Mark token as submitted if token was used
        if ($token && isset($tokenData)) {
            $updateTokenQuery = "UPDATE survey_tokens 
                                SET submitted_at = NOW(), ip_address = :ip_address 
                                WHERE token = :token";
            $updateTokenStmt = $conn->prepare($updateTokenQuery);
            $updateTokenStmt->bindParam(':ip_address', $ipAddress);
            $updateTokenStmt->bindParam(':token', $token);
            $updateTokenStmt->execute();
        }
        
        $conn->commit();

        $auditGraduate = null;
        if ($graduateId) {
            $auditGraduateStmt = $conn->prepare("SELECT g.first_name, g.last_name, g.email, p.code AS program_code
                                                FROM graduates g
                                                LEFT JOIN programs p ON p.id = g.program_id
                                                WHERE g.id = :id
                                                LIMIT 1");
            $auditGraduateStmt->execute([':id' => $graduateId]);
            $auditGraduate = $auditGraduateStmt->fetch(PDO::FETCH_ASSOC);
        }

        $auditGraduateName = $auditGraduate
            ? gradtrack_audit_graduate_name($auditGraduate)
            : 'Survey Respondent';

        // Audit Trail: call logAuditTrail() after a survey response is successfully submitted and committed.
        logAuditTrail(
            $graduateId,
            $auditGraduateName,
            'graduate',
            $auditGraduate['program_code'] ?? null,
            'Submit',
            'Survey Responses',
            "Submitted survey response (Response ID: {$responseId}, Survey ID: {$surveyId})."
        );

        $emailNotification = [
            "sent" => false,
            "reason" => "Skipped"
        ];
        if ($graduateId) {
            try {
                $emailNotification = survey_response_send_confirmation_email($conn, (int) $graduateId, (int) $surveyId);
            } catch (MailException $mailException) {
                $emailNotification = ["sent" => false, "reason" => $mailException->getMessage()];
            } catch (Exception $mailException) {
                $emailNotification = ["sent" => false, "reason" => $mailException->getMessage()];
            }
        }

        http_response_code(201);
        echo json_encode([
            "success" => true,
            "message" => "Survey response saved successfully",
            "id" => $responseId,
            "survey_response_id" => $responseId,
            "email_notification" => $emailNotification
        ]);
    } catch(PDOException $e) {
        $conn->rollBack();
        http_response_code(500);
        echo json_encode([
            "success" => false,
            "error" => "Database error: " . $e->getMessage(),
            "hint" => "Please ensure graduate_id column allows NULL values"
        ]);
    } catch(Exception $e) {
        if (isset($conn) && $conn->inTransaction()) {
            $conn->rollBack();
        }
        http_response_code(500);
        echo json_encode([
            "success" => false,
            "error" => "Error: " . $e->getMessage()
        ]);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        if (!isset($_SESSION['user_id'])) {
            http_response_code(401);
            echo json_encode(["success" => false, "error" => "Authentication required"]);
            exit();
        }

        $role = $_SESSION['role'] ?? '';
        $roleProgramScopes = [
            'dean_cs' => ['BSCS', 'ACT'],
            'dean_coed' => ['BSED', 'BEED'],
            'dean_hm' => ['BSHM'],
        ];

        if ($role !== 'admin' && !isset($roleProgramScopes[$role])) {
            http_response_code(403);
            echo json_encode(["success" => false, "error" => "Not authorized to view survey responses"]);
            exit();
        }

        $responseId = isset($_GET['response_id']) && (int) $_GET['response_id'] > 0 ? (int) $_GET['response_id'] : null;
        $surveyId = isset($_GET['survey_id']) && (int) $_GET['survey_id'] > 0 ? (int) $_GET['survey_id'] : null;
        $graduateId = isset($_GET['graduate_id']) && (int) $_GET['graduate_id'] > 0 ? (int) $_GET['graduate_id'] : null;
        $whereParts = [];
        $params = [];

        if ($responseId !== null) {
            $whereParts[] = 'sr.id = :response_id';
            $params[':response_id'] = $responseId;
        }

        if ($surveyId !== null) {
            $whereParts[] = 'sr.survey_id = :survey_id';
            $params[':survey_id'] = $surveyId;
        }

        if ($graduateId !== null) {
            $whereParts[] = 'sr.graduate_id = :graduate_id';
            $params[':graduate_id'] = $graduateId;
        }

        if (isset($roleProgramScopes[$role])) {
            $programPlaceholders = [];
            foreach ($roleProgramScopes[$role] as $index => $code) {
                $placeholder = ':program_code_' . $index;
                $programPlaceholders[] = $placeholder;
                $params[$placeholder] = $code;
            }
            $whereParts[] = 'p.code IN (' . implode(', ', $programPlaceholders) . ')';
        }

        $whereClause = count($whereParts) > 0 ? 'WHERE ' . implode(' AND ', $whereParts) : '';

        $query = "
            SELECT
                sr.*,
                g.student_id,
                g.first_name,
                g.middle_name,
                g.last_name,
                g.email,
                g.year_graduated,
                p.code AS program_code,
                p.name AS program_name,
                s.title AS survey_title
            FROM survey_responses sr
            LEFT JOIN graduates g ON g.id = sr.graduate_id
            LEFT JOIN programs p ON p.id = g.program_id
            LEFT JOIN surveys s ON s.id = sr.survey_id
            $whereClause
            ORDER BY sr.submitted_at DESC, sr.id DESC
        ";
        $stmt = $conn->prepare($query);
        $stmt->execute($params);
        $responses = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $questionCache = [];
        foreach ($responses as &$response) {
            $responseSurveyId = (int) $response['survey_id'];
            if (!isset($questionCache[$responseSurveyId])) {
                $questionStmt = $conn->prepare("
                    SELECT id, section, question_text, question_type, sort_order
                    FROM survey_questions
                    WHERE survey_id = :survey_id
                    ORDER BY sort_order ASC, id ASC
                ");
                $questionStmt->execute([':survey_id' => $responseSurveyId]);
                $questions = $questionStmt->fetchAll(PDO::FETCH_ASSOC);

                $questionsById = [];
                foreach ($questions as $question) {
                    $questionsById[(string) $question['id']] = $question;
                }

                $questionCache[$responseSurveyId] = [
                    'ordered' => $questions,
                    'by_id' => $questionsById,
                ];
            }

            $decodedResponses = [];
            if ($response['responses']) {
                $decoded = json_decode((string) $response['responses'], true);
                $decodedResponses = is_array($decoded) ? $decoded : [];
            }

            $answers = [];
            $orderedQuestions = $questionCache[$responseSurveyId]['ordered'];
            $questionKeyMap = survey_response_build_question_key_map($orderedQuestions, $decodedResponses);
            $usedResponseKeys = [];

            // Only use historical fallback mapping when this response appears to come
            // from an older key schema (legacy numeric keys). For current-schema
            // responses, rely on exact question IDs to avoid cross-field leakage
            // (e.g., Region appearing under Name Extension).
            $questionIdSet = [];
            foreach ($orderedQuestions as $question) {
                $questionId = (string) ($question['id'] ?? '');
                if ($questionId !== '' && ctype_digit($questionId)) {
                    $questionIdSet[$questionId] = true;
                }
            }

            $numericResponseKeys = [];
            $exactQuestionKeyHits = 0;
            foreach (array_keys($decodedResponses) as $responseKey) {
                $responseKeyString = (string) $responseKey;
                if (!ctype_digit($responseKeyString)) {
                    continue;
                }

                $numericResponseKeys[$responseKeyString] = true;
                if (isset($questionIdSet[$responseKeyString])) {
                    $exactQuestionKeyHits++;
                }
            }

            $numericKeyCount = count($numericResponseKeys);
            $exactHitRatio = $numericKeyCount > 0 ? ($exactQuestionKeyHits / $numericKeyCount) : 0;
            $allowHistoricalFallback = $exactHitRatio < 0.5;

            foreach ($orderedQuestions as $question) {
                $questionKey = (string) ($question['id'] ?? '');
                if ($questionKey === '' || !isset($questionKeyMap[$questionKey])) {
                    continue;
                }

                $questionType = strtolower((string) ($question['question_type'] ?? ''));
                if ($questionType === 'header') {
                    continue;
                }

                $answer = null;
                $sourceKey = null;

                // Prefer exact question-id key first for current schema responses.
                if (array_key_exists($questionKey, $decodedResponses)) {
                    $answer = $decodedResponses[$questionKey];
                    $sourceKey = $questionKey;
                } elseif ($allowHistoricalFallback) {
                    // Fall back to historical key candidates, but never reuse a key already mapped.
                    foreach ($questionKeyMap[$questionKey] as $candidateKey) {
                        if (!array_key_exists($candidateKey, $decodedResponses)) {
                            continue;
                        }
                        if (isset($usedResponseKeys[$candidateKey])) {
                            continue;
                        }

                        $answer = $decodedResponses[$candidateKey];
                        $sourceKey = (string) $candidateKey;
                        break;
                    }
                }

                if ($sourceKey !== null) {
                    $usedResponseKeys[$sourceKey] = true;
                }

                $answers[] = [
                    'question_id' => $questionKey,
                    'question_text' => $question['question_text'] ?? ('Question ' . $questionKey),
                    'question_type' => $question['question_type'] ?? null,
                    'section' => $question['section'] ?? null,
                    'sort_order' => isset($question['sort_order']) ? (int) $question['sort_order'] : 0,
                    'answer' => $answer,
                ];
            }

            $response['id'] = (int) $response['id'];
            $response['survey_id'] = (int) $response['survey_id'];
            $response['graduate_id'] = $response['graduate_id'] !== null ? (int) $response['graduate_id'] : null;
            $response['responses'] = $decodedResponses;
            $response['answers'] = $answers;
        }
        unset($response);

        http_response_code(200);
        echo json_encode([
            "success" => true,
            "data" => $responses
        ]);
    } catch(PDOException $e) {
        http_response_code(500);
        echo json_encode(["error" => "Database error: " . $e->getMessage()]);
    }
}
?>
