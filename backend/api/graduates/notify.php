<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../../vendor/autoload.php';

use PHPMailer\PHPMailer\Exception as MailException;
use PHPMailer\PHPMailer\PHPMailer;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "error" => "Method not allowed"]);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(["success" => false, "error" => "Authentication required"]);
    exit;
}

if (($_SESSION['role'] ?? '') !== 'admin') {
    http_response_code(403);
    echo json_encode(["success" => false, "error" => "Only admin accounts can send graduate survey reminders"]);
    exit;
}

function notify_json_response(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

function notify_clean_text($value): string
{
    return trim((string) ($value ?? ''));
}

function notify_escape($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function notify_frontend_url(): string
{
    $configuredUrl = getenv('FRONTEND_URL') ?: getenv('APP_URL') ?: '';
    if (trim($configuredUrl) !== '') {
        return rtrim(trim($configuredUrl), '/');
    }

    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    return $origin !== '' ? rtrim($origin, '/') : 'http://localhost:5173';
}

function notify_create_mailer(): PHPMailer
{
    $host = notify_clean_text(getenv('MAIL_HOST') ?: 'smtp.gmail.com');
    $username = notify_clean_text(getenv('MAIL_USERNAME') ?: '');
    $password = str_replace(' ', '', notify_clean_text(getenv('MAIL_PASSWORD') ?: ''));
    $fromAddress = notify_clean_text(getenv('MAIL_FROM_ADDRESS') ?: $username);
    $fromName = notify_clean_text(getenv('MAIL_FROM_NAME') ?: 'GRADTRACK');

    if ($host === '' || $username === '' || $password === '' || $fromAddress === '') {
        notify_json_response(500, [
            "success" => false,
            "error" => "Mail credentials are not configured. Please check MAIL_HOST, MAIL_USERNAME, MAIL_PASSWORD, and MAIL_FROM_ADDRESS."
        ]);
    }

    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = $host;
    $mail->SMTPAuth = true;
    $mail->Username = $username;
    $mail->Password = $password;
    $mail->Port = (int) (getenv('MAIL_PORT') ?: 587);
    $mail->CharSet = 'UTF-8';
    $mail->SMTPKeepAlive = true;

    $encryption = strtolower(notify_clean_text(getenv('MAIL_ENCRYPTION') ?: 'tls'));
    if ($encryption === 'ssl' || $encryption === 'smtps') {
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
    } elseif ($encryption === 'tls' || $encryption === 'starttls') {
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    }

    $mail->setFrom($fromAddress, $fromName);
    $mail->addReplyTo($fromAddress, $fromName);

    return $mail;
}

function notify_graduate_name(array $graduate): string
{
    $name = trim(($graduate['first_name'] ?? '') . ' ' . ($graduate['last_name'] ?? ''));
    return $name !== '' ? $name : 'Graduate';
}

function notify_survey_link(array $survey): string
{
    return notify_frontend_url() . '/survey-verify?survey_id=' . urlencode((string) $survey['id']);
}

function notify_email_html(array $graduate, array $survey, string $message, string $surveyLink): string
{
    $name = notify_escape(notify_graduate_name($graduate));
    $surveyTitle = notify_escape($survey['title'] ?? 'Graduate Tracer Study Survey');
    $programCode = notify_escape($graduate['program_code'] ?? '');
    $messageHtml = nl2br(notify_escape($message));
    $safeSurveyLink = notify_escape($surveyLink);

    return <<<HTML
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#14213d;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #dbe4f0;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#173b80;padding:22px 28px;border-bottom:4px solid #f4c400;">
                <div style="font-size:24px;font-weight:800;letter-spacing:0;color:#ffffff;">Grad<span style="color:#f4c400;">Track</span></div>
                <div style="margin-top:8px;font-size:13px;color:#dce8ff;">Norzagaray College Graduate Tracer Study</div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 10px;">
                <div style="display:inline-block;background:#eaf2ff;color:#173b80;border-radius:6px;padding:7px 10px;font-size:12px;font-weight:700;">{$programCode}</div>
                <h1 style="margin:18px 0 10px;font-size:24px;line-height:1.3;color:#10213f;">Your tracer survey response is still needed</h1>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#41516d;">Hello {$name},</p>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#41516d;">{$messageHtml}</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                  <tr>
                    <td style="background:#f4c400;border-radius:6px;">
                      <a href="{$safeSurveyLink}" style="display:inline-block;padding:13px 20px;color:#10213f;font-weight:800;font-size:14px;text-decoration:none;">Answer the Survey</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#5d6b83;">Survey: <strong>{$surveyTitle}</strong></p>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#7b8798;">If the button does not open, use this link:<br><a href="{$safeSurveyLink}" style="color:#173b80;word-break:break-all;">{$safeSurveyLink}</a></p>
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
}

function notify_email_text(array $graduate, array $survey, string $message, string $surveyLink): string
{
    $name = notify_graduate_name($graduate);
    $surveyTitle = (string) ($survey['title'] ?? 'Graduate Tracer Study Survey');

    return "Hello {$name},\n\n"
        . "{$message}\n\n"
        . "Survey: {$surveyTitle}\n"
        . "Open the survey: {$surveyLink}\n\n"
        . "Thank you,\nGRADTRACK";
}

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) {
    notify_json_response(400, ["success" => false, "error" => "Invalid JSON payload"]);
}

$database = new Database();
$db = $database->getConnection();

try {
    $surveyId = isset($data['survey_id']) ? (int) $data['survey_id'] : 0;
    if ($surveyId > 0) {
        $surveyStmt = $db->prepare("SELECT id, title, status FROM surveys WHERE id = :id LIMIT 1");
        $surveyStmt->execute([':id' => $surveyId]);
    } else {
        $surveyStmt = $db->query("
            SELECT id, title, status
            FROM surveys
            ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, created_at DESC, id DESC
            LIMIT 1
        ");
    }

    $survey = $surveyStmt->fetch(PDO::FETCH_ASSOC);
    if (!$survey) {
        notify_json_response(404, ["success" => false, "error" => "Survey not found"]);
    }

    $surveyId = (int) $survey['id'];
    $mode = notify_clean_text($data['mode'] ?? 'selected');
    $onlyNotAnswered = array_key_exists('only_not_answered', $data)
        ? filter_var($data['only_not_answered'], FILTER_VALIDATE_BOOLEAN)
        : true;

    $whereParts = [];
    $params = [':survey_id' => $surveyId];

    if ($mode === 'filters') {
        $filters = is_array($data['filters'] ?? null) ? $data['filters'] : [];
        $search = notify_clean_text($filters['search'] ?? '');
        if ($search !== '') {
            $searchTerm = '%' . $search . '%';
            $whereParts[] = '(g.first_name LIKE :search_1 OR g.middle_name LIKE :search_2 OR g.last_name LIKE :search_3 OR g.student_id LIKE :search_4 OR g.email LIKE :search_5)';
            $params[':search_1'] = $searchTerm;
            $params[':search_2'] = $searchTerm;
            $params[':search_3'] = $searchTerm;
            $params[':search_4'] = $searchTerm;
            $params[':search_5'] = $searchTerm;
        }

        if (isset($filters['program_id']) && (int) $filters['program_id'] > 0) {
            $whereParts[] = 'g.program_id = :program_id';
            $params[':program_id'] = (int) $filters['program_id'];
        }

        if (isset($filters['year_graduated']) && (int) $filters['year_graduated'] > 0) {
            $whereParts[] = 'g.year_graduated = :year_graduated';
            $params[':year_graduated'] = (int) $filters['year_graduated'];
        }

        $status = notify_clean_text($filters['status'] ?? 'not_answered');
    } else {
        $graduateIds = array_values(array_unique(array_filter(array_map('intval', $data['graduate_ids'] ?? []), function ($id) {
            return $id > 0;
        })));

        if (empty($graduateIds)) {
            notify_json_response(400, ["success" => false, "error" => "Select at least one graduate to notify"]);
        }

        if (count($graduateIds) > 5000) {
            notify_json_response(400, ["success" => false, "error" => "You can notify up to 5000 graduates at a time"]);
        }

        $idPlaceholders = [];
        foreach ($graduateIds as $index => $id) {
            $placeholder = ':graduate_id_' . $index;
            $idPlaceholders[] = $placeholder;
            $params[$placeholder] = $id;
        }

        $whereParts[] = 'g.id IN (' . implode(', ', $idPlaceholders) . ')';
        $status = '';
    }

    $havingParts = [];
    if ($onlyNotAnswered || $status === 'not_answered') {
        $havingParts[] = 'COUNT(sr.id) = 0';
    } elseif ($status === 'answered') {
        $havingParts[] = 'COUNT(sr.id) > 0';
    }

    $whereClause = count($whereParts) > 0 ? 'WHERE ' . implode(' AND ', $whereParts) : '';
    $havingClause = count($havingParts) > 0 ? 'HAVING ' . implode(' AND ', $havingParts) : '';

    $recipientSql = "
        SELECT
            g.id,
            g.student_id,
            g.first_name,
            g.last_name,
            g.email,
            p.code AS program_code,
            COUNT(sr.id) AS response_count
        FROM graduates g
        LEFT JOIN programs p ON p.id = g.program_id
        LEFT JOIN survey_responses sr ON sr.graduate_id = g.id AND sr.survey_id = :survey_id
        $whereClause
        GROUP BY g.id
        $havingClause
        ORDER BY g.last_name ASC, g.first_name ASC
        LIMIT 5000
    ";

    $recipientStmt = $db->prepare($recipientSql);
    $recipientStmt->execute($params);
    $recipients = $recipientStmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($recipients)) {
        notify_json_response(400, ["success" => false, "error" => "No eligible graduates found for this reminder"]);
    }

    $subject = notify_clean_text($data['subject'] ?? '');
    if ($subject === '') {
        $subject = 'Reminder: Complete your Graduate Tracer Study Survey';
    }

    $message = notify_clean_text($data['message'] ?? '');
    if ($message === '') {
        $message = 'Please complete the Graduate Tracer Study Survey. Your response helps Norzagaray College improve its programs and support graduates with better alumni services.';
    }

    $surveyLink = notify_survey_link($survey);
    $mailer = notify_create_mailer();
    $sent = [];
    $failed = [];
    $skipped = [];

    foreach ($recipients as $recipient) {
        $email = notify_clean_text($recipient['email'] ?? '');
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $skipped[] = [
                "id" => (int) $recipient['id'],
                "reason" => "Missing or invalid email address"
            ];
            continue;
        }

        try {
            $mailer->clearAddresses();
            $mailer->addAddress($email, notify_graduate_name($recipient));
            $mailer->Subject = $subject;
            $mailer->isHTML(true);
            $mailer->Body = notify_email_html($recipient, $survey, $message, $surveyLink);
            $mailer->AltBody = notify_email_text($recipient, $survey, $message, $surveyLink);
            $mailer->send();

            $sent[] = [
                "id" => (int) $recipient['id'],
                "email" => $email
            ];
        } catch (MailException $mailException) {
            $failed[] = [
                "id" => (int) $recipient['id'],
                "email" => $email,
                "error" => $mailException->getMessage()
            ];
        } catch (Exception $exception) {
            $failed[] = [
                "id" => (int) $recipient['id'],
                "email" => $email,
                "error" => $exception->getMessage()
            ];
        }
    }

    $mailer->smtpClose();

    echo json_encode([
        "success" => count($failed) === 0,
        "message" => "Reminder email processing finished",
        "counts" => [
            "eligible" => count($recipients),
            "sent" => count($sent),
            "failed" => count($failed),
            "skipped" => count($skipped),
        ],
        "sent" => $sent,
        "failed" => $failed,
        "skipped" => $skipped,
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
