<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/archive.php';
require_once __DIR__ . '/../config/survey_reminders.php';
require_once __DIR__ . '/../config/admin_auth.php';
require_once __DIR__ . '/../config/admin_roles.php';
require_once __DIR__ . '/../config/graduation_years.php';
require_once __DIR__ . '/../config/audit_trail.php';
require_once __DIR__ . '/../../vendor/autoload.php';

use PHPMailer\PHPMailer\Exception as MailException;
use PHPMailer\PHPMailer\PHPMailer;

$database = new Database();
$db = $database->getConnection();
$authUser = gradtrack_require_admin_auth($db, gradtrack_system_admin_roles(), 'Only the Admin can manage auto reminders');
$auditUser = gradtrack_admin_audit_context($authUser);
$method = $_SERVER['REQUEST_METHOD'];

function coordinator_reminder_json_response(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

function coordinator_reminder_clean_text($value): string
{
    return trim((string) ($value ?? ''));
}

function coordinator_reminder_escape($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function coordinator_reminder_frontend_url(): string
{
    return gradtrack_frontend_url();
}

function coordinator_reminder_create_mailer(): PHPMailer
{
    $host = coordinator_reminder_clean_text(getenv('MAIL_HOST') ?: 'smtp.gmail.com');
    $username = coordinator_reminder_clean_text(getenv('MAIL_USERNAME') ?: '');
    $password = str_replace(' ', '', coordinator_reminder_clean_text(getenv('MAIL_PASSWORD') ?: ''));
    $fromAddress = coordinator_reminder_clean_text(getenv('MAIL_FROM_ADDRESS') ?: $username);
    $fromName = coordinator_reminder_clean_text(getenv('MAIL_FROM_NAME') ?: 'GRADTRACK');

    if ($host === '' || $username === '' || $password === '' || $fromAddress === '') {
        coordinator_reminder_json_response(500, [
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

    $encryption = strtolower(coordinator_reminder_clean_text(getenv('MAIL_ENCRYPTION') ?: 'tls'));
    if ($encryption === 'ssl' || $encryption === 'smtps') {
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
    } elseif ($encryption === 'tls' || $encryption === 'starttls') {
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    }

    $mail->setFrom($fromAddress, $fromName);
    $mail->addReplyTo($fromAddress, $fromName);

    return $mail;
}

function coordinator_reminder_graduate_name(array $graduate): string
{
    $name = trim(($graduate['first_name'] ?? '') . ' ' . ($graduate['last_name'] ?? ''));
    return $name !== '' ? $name : 'Graduate';
}

function coordinator_reminder_survey_link(array $survey): string
{
    return coordinator_reminder_frontend_url() . '/survey-verify?survey_id=' . urlencode((string) $survey['id']);
}

function coordinator_reminder_email_html(array $graduate, array $survey, string $message, string $surveyLink): string
{
    $name = coordinator_reminder_escape(coordinator_reminder_graduate_name($graduate));
    $surveyTitle = coordinator_reminder_escape($survey['title'] ?? 'Graduate Tracer Study Survey');
    $programCode = coordinator_reminder_escape($graduate['program_code'] ?? '');
    $messageHtml = nl2br(coordinator_reminder_escape($message));
    $safeSurveyLink = coordinator_reminder_escape($surveyLink);

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

function coordinator_reminder_email_text(array $graduate, array $survey, string $message, string $surveyLink): string
{
    $name = coordinator_reminder_graduate_name($graduate);
    $surveyTitle = (string) ($survey['title'] ?? 'Graduate Tracer Study Survey');

    return "Hello {$name},\n\n"
        . "{$message}\n\n"
        . "Survey: {$surveyTitle}\n"
        . "Open the survey: {$surveyLink}\n\n"
        . "Thank you,\nGRADTRACK";
}

function coordinator_reminder_get_setting(PDO $db, string $key, string $default): string
{
    try {
        $stmt = $db->prepare("SELECT setting_value FROM system_settings WHERE setting_key = :key LIMIT 1");
        $stmt->execute([':key' => $key]);
        $value = $stmt->fetchColumn();
        return $value !== false && trim((string) $value) !== '' ? trim((string) $value) : $default;
    } catch (Throwable $ignored) {
        return $default;
    }
}

function coordinator_reminder_get_active_survey(PDO $db): ?array
{
    $coverage = gradtrack_get_active_survey_graduation_year_coverage($db);
    return $coverage['survey'];
}

function coordinator_reminder_get_eligible_graduates(PDO $db, int $surveyId, array $allowedYears, int $limit = 5000): array
{
    $whereParts = [
        'sr.id IS NULL',
        'g.archived_at IS NULL',
        'g.email IS NOT NULL',
        "TRIM(g.email) <> ''",
    ];
    $params = [':survey_id' => $surveyId];
    gradtrack_append_graduation_year_coverage_filter(
        $whereParts,
        $params,
        'g.year_graduated',
        $allowedYears,
        'coordinator_reminder_coverage_year'
    );
    $sql = "
        SELECT g.id, g.student_id, g.first_name, g.last_name, g.email, p.code AS program_code
        FROM graduates g
        LEFT JOIN programs p ON p.id = g.program_id
        LEFT JOIN survey_responses sr ON sr.graduate_id = g.id AND sr.survey_id = :survey_id AND sr.submitted_at IS NOT NULL
        WHERE " . implode(' AND ', $whereParts) . "
        ORDER BY g.last_name ASC, g.first_name ASC
        LIMIT :limit
    ";
    $stmt = $db->prepare($sql);
    foreach ($params as $placeholder => $value) {
        $stmt->bindValue($placeholder, $value, PDO::PARAM_INT);
    }
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function coordinator_reminder_get_logs(PDO $db, int $limit = 50): array
{
    try {
        $stmt = $db->query("
            SELECT rl.*, s.title AS survey_title, g.first_name, g.last_name
            FROM survey_reminder_logs rl
            LEFT JOIN surveys s ON s.id = rl.survey_id
            LEFT JOIN graduates g ON g.id = rl.graduate_id
            ORDER BY rl.created_at DESC
            LIMIT $limit
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $ignored) {
        return [];
    }
}

function coordinator_reminder_get_stats(PDO $db): array
{
    try {
        $totalSent = (int) $db->query("SELECT COUNT(*) FROM survey_reminder_logs WHERE status = 'sent'")->fetchColumn();
        $totalFailed = (int) $db->query("SELECT COUNT(*) FROM survey_reminder_logs WHERE status = 'failed'")->fetchColumn();
        $totalSkipped = (int) $db->query("SELECT COUNT(*) FROM survey_reminder_logs WHERE status = 'skipped'")->fetchColumn();
        $lastRun = $db->query("SELECT MAX(created_at) FROM survey_reminder_logs")->fetchColumn();
        
        $autoSent = (int) $db->query("SELECT COUNT(*) FROM survey_reminder_logs WHERE status = 'sent' AND reminder_type = 'auto'")->fetchColumn();
        $manualSent = (int) $db->query("SELECT COUNT(*) FROM survey_reminder_logs WHERE status = 'sent' AND reminder_type = 'manual'")->fetchColumn();
        
        return [
            'total_sent' => $totalSent,
            'total_failed' => $totalFailed,
            'total_skipped' => $totalSkipped,
            'auto_sent' => $autoSent,
            'manual_sent' => $manualSent,
            'last_run' => $lastRun ?: null,
        ];
    } catch (Throwable $ignored) {
        return [
            'total_sent' => 0,
            'total_failed' => 0,
            'total_skipped' => 0,
            'auto_sent' => 0,
            'manual_sent' => 0,
            'last_run' => null,
        ];
    }
}

try {
    gradtrack_ensure_archive_schema($db, 'graduates');
    gradtrack_ensure_archive_schema($db, 'surveys', true);
    gradtrack_survey_reminder_ensure_log_table($db);

    if ($method === 'GET') {
        $action = coordinator_reminder_clean_text($_GET['action'] ?? 'status');

        if ($action === 'status') {
            $coverage = gradtrack_get_active_survey_graduation_year_coverage($db);
            $activeSurvey = $coverage['survey'];
            $eligibleCount = 0;
            if ($activeSurvey && $coverage['configured']) {
                $eligible = coordinator_reminder_get_eligible_graduates($db, (int) $activeSurvey['id'], $coverage['years'], 999999);
                $eligibleCount = count($eligible);
            }

            $intervalDays = (int) coordinator_reminder_get_setting($db, 'survey_reminder_days', '3');
            $emailEnabled = coordinator_reminder_get_setting($db, 'enable_email_notifications', 'true') === 'true';

            echo json_encode([
                'success' => true,
                'data' => [
                    'active_survey' => $activeSurvey,
                    'allowed_graduation_years' => $coverage['years'],
                    'configuration_error' => $activeSurvey && !$coverage['configured']
                        ? 'Graduation year coverage has not been configured for the active survey.'
                        : null,
                    'eligible_count' => $eligibleCount,
                    'interval_days' => $intervalDays,
                    'email_enabled' => $emailEnabled,
                    'stats' => coordinator_reminder_get_stats($db),
                ],
            ]);
            exit;
        }

        if ($action === 'logs') {
            $logLimit = isset($_GET['limit']) ? min(200, max(1, (int) $_GET['limit'])) : 50;
            echo json_encode([
                'success' => true,
                'data' => coordinator_reminder_get_logs($db, $logLimit),
            ]);
            exit;
        }

        if ($action === 'eligible') {
            $coverage = gradtrack_get_active_survey_graduation_year_coverage($db);
            if ($coverage['survey'] === null) {
                coordinator_reminder_json_response(409, ['success' => false, 'error' => 'No active survey found']);
            }
            if (!$coverage['configured']) {
                coordinator_reminder_json_response(422, [
                    'success' => false,
                    'code' => 'GRADUATION_YEAR_COVERAGE_NOT_CONFIGURED',
                    'error' => 'Graduation year coverage has not been configured for the active survey.',
                ]);
            }
            $surveyId = isset($_GET['survey_id']) ? (int) $_GET['survey_id'] : 0;
            if ($surveyId <= 0) {
                $surveyId = (int) $coverage['survey']['id'];
            }
            if ($surveyId !== (int) $coverage['survey']['id']) {
                coordinator_reminder_json_response(409, ['success' => false, 'error' => 'Reminders can only use the active survey']);
            }
            $eligible = coordinator_reminder_get_eligible_graduates($db, $surveyId, $coverage['years']);
            echo json_encode([
                'success' => true,
                'data' => $eligible,
                'total' => count($eligible),
            ]);
            exit;
        }

        coordinator_reminder_json_response(400, ['success' => false, 'error' => 'Unknown action']);
    }

    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            coordinator_reminder_json_response(400, ['success' => false, 'error' => 'Invalid JSON payload']);
        }

        $action = coordinator_reminder_clean_text($data['action'] ?? 'send_reminders');

        if ($action === 'send_reminders') {
            $coverage = gradtrack_get_active_survey_graduation_year_coverage($db);
            if ($coverage['survey'] === null) {
                coordinator_reminder_json_response(409, ['success' => false, 'error' => 'No active survey found']);
            }
            if (!$coverage['configured']) {
                coordinator_reminder_json_response(422, [
                    'success' => false,
                    'code' => 'GRADUATION_YEAR_COVERAGE_NOT_CONFIGURED',
                    'error' => 'Graduation year coverage has not been configured for the active survey.',
                ]);
            }
            $surveyId = isset($data['survey_id']) ? (int) $data['survey_id'] : 0;
            if ($surveyId <= 0) {
                $surveyId = (int) $coverage['survey']['id'];
            }
            if ($surveyId !== (int) $coverage['survey']['id']) {
                coordinator_reminder_json_response(409, ['success' => false, 'error' => 'Reminders can only use the active survey']);
            }

            $surveyStmt = $db->prepare("SELECT id, title, status FROM surveys WHERE id = :id AND archived_at IS NULL LIMIT 1");
            $surveyStmt->execute([':id' => $surveyId]);
            $survey = $surveyStmt->fetch(PDO::FETCH_ASSOC);
            if (!$survey) {
                coordinator_reminder_json_response(404, ['success' => false, 'error' => 'Survey not found']);
            }

            $emailEnabled = coordinator_reminder_get_setting($db, 'enable_email_notifications', 'true') === 'true';
            if (!$emailEnabled) {
                coordinator_reminder_json_response(400, ['success' => false, 'error' => 'Email notifications are disabled in system settings']);
            }

            $subject = coordinator_reminder_clean_text($data['subject'] ?? '');
            if ($subject === '') {
                $subject = 'Reminder: Complete your Graduate Tracer Study Survey';
            }

            $message = coordinator_reminder_clean_text($data['message'] ?? '');
            if ($message === '') {
                $message = 'Please complete the Graduate Tracer Study Survey. Your response helps Norzagaray College improve its programs and support graduates with better alumni services.';
            }

            $reminderType = coordinator_reminder_clean_text($data['reminder_type'] ?? 'manual');
            $reminderType = in_array($reminderType, ['manual', 'auto'], true) ? $reminderType : 'manual';

            $graduateIds = isset($data['graduate_ids']) && is_array($data['graduate_ids'])
                ? array_values(array_unique(array_filter(array_map('intval', $data['graduate_ids']), function ($id) { return $id > 0; })))
                : [];

            if (!empty($graduateIds)) {
                $params = [':survey_id' => $surveyId];
                $whereParts = [
                    'g.archived_at IS NULL',
                    'sr.id IS NULL',
                    'g.email IS NOT NULL',
                    "TRIM(g.email) <> ''",
                ];
                gradtrack_append_graduation_year_coverage_filter(
                    $whereParts,
                    $params,
                    'g.year_graduated',
                    $coverage['years'],
                    'super_selected_coverage_year'
                );
                $idPlaceholders = [];
                foreach ($graduateIds as $index => $id) {
                    $placeholder = ':gid_' . $index;
                    $idPlaceholders[] = $placeholder;
                    $params[$placeholder] = $id;
                }
                $sql = "
                    SELECT g.id, g.student_id, g.first_name, g.last_name, g.email, p.code AS program_code
                    FROM graduates g
                    LEFT JOIN programs p ON p.id = g.program_id
                    LEFT JOIN survey_responses sr ON sr.graduate_id = g.id AND sr.survey_id = :survey_id AND sr.submitted_at IS NOT NULL
                    WHERE g.id IN (" . implode(', ', $idPlaceholders) . ")
                      AND " . implode(' AND ', $whereParts) . "
                    ORDER BY g.last_name ASC, g.first_name ASC
                ";
                $stmt = $db->prepare($sql);
                $stmt->execute($params);
                $recipients = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } else {
                $recipients = coordinator_reminder_get_eligible_graduates($db, $surveyId, $coverage['years']);
            }

            if (empty($recipients)) {
                coordinator_reminder_json_response(400, ['success' => false, 'error' => 'No eligible graduates found for this reminder']);
            }

            $surveyLink = coordinator_reminder_survey_link($survey);
            $mailer = coordinator_reminder_create_mailer();
            $sent = [];
            $failed = [];
            $skipped = [];

            foreach ($recipients as $recipient) {
                $email = coordinator_reminder_clean_text($recipient['email'] ?? '');
                if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    $skipped[] = [
                        "id" => (int) $recipient['id'],
                        "reason" => "Missing or invalid email address"
                    ];
                    gradtrack_survey_reminder_log(
                        $db, $surveyId, (int) $recipient['id'], $email, $subject,
                        $reminderType, 'skipped', 'Missing or invalid email address'
                    );
                    continue;
                }

                try {
                    $mailer->clearAddresses();
                    $mailer->addAddress($email, coordinator_reminder_graduate_name($recipient));
                    $mailer->Subject = $subject;
                    $mailer->isHTML(true);
                    $mailer->Body = coordinator_reminder_email_html($recipient, $survey, $message, $surveyLink);
                    $mailer->AltBody = coordinator_reminder_email_text($recipient, $survey, $message, $surveyLink);
                    $mailer->send();

                    $sent[] = ["id" => (int) $recipient['id'], "email" => $email];
                    gradtrack_survey_reminder_log($db, $surveyId, (int) $recipient['id'], $email, $subject, $reminderType, 'sent', null, date('Y-m-d H:i:s'));
                } catch (MailException $mailException) {
                    $failed[] = ["id" => (int) $recipient['id'], "email" => $email, "error" => gradtrack_public_exception_message($mailException, 'Email could not be sent.', 'Survey reminder email')];
                    gradtrack_survey_reminder_log($db, $surveyId, (int) $recipient['id'], $email, $subject, $reminderType, 'failed', $mailException->getMessage());
                } catch (Exception $exception) {
                    $failed[] = ["id" => (int) $recipient['id'], "email" => $email, "error" => gradtrack_public_exception_message($exception, 'Email could not be sent.', 'Survey reminder email')];
                    gradtrack_survey_reminder_log($db, $surveyId, (int) $recipient['id'], $email, $subject, $reminderType, 'failed', $exception->getMessage());
                }
            }

            $mailer->smtpClose();

            logAuditTrail(
                $auditUser['user_id'],
                $auditUser['user_name'],
                $auditUser['user_role'],
                $auditUser['department'],
                'Send',
                'Auto Email Reminders',
                'Processed survey reminder emails.',
                $surveyId,
                null,
                null,
                ['eligible' => count($recipients), 'sent' => count($sent), 'failed' => count($failed), 'skipped' => count($skipped)]
            );

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
            exit;
        }

        if ($action === 'update_settings') {
            $intervalDays = isset($data['interval_days']) ? max(1, min(365, (int) $data['interval_days'])) : null;
            if ($intervalDays !== null) {
                $stmt = $db->prepare("
                    INSERT INTO system_settings (setting_key, setting_value, setting_group)
                    VALUES ('survey_reminder_days', :value, 'surveys')
                    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
                ");
                $stmt->execute([':value' => (string) $intervalDays]);
                logAuditTrail(
                    $auditUser['user_id'],
                    $auditUser['user_name'],
                    $auditUser['user_role'],
                    $auditUser['department'],
                    'Update',
                    'Auto Email Reminders',
                    'Updated the survey reminder interval.',
                    null,
                    null,
                    ['interval_days' => $intervalDays]
                );
            }

            echo json_encode([
                'success' => true,
                'message' => 'Auto-reminder settings updated',
                'data' => [
                    'interval_days' => $intervalDays ?? (int) coordinator_reminder_get_setting($db, 'survey_reminder_days', '3'),
                ],
            ]);
            exit;
        }

        coordinator_reminder_json_response(400, ['success' => false, 'error' => 'Unknown action']);
    }

    coordinator_reminder_json_response(405, ['success' => false, 'error' => 'Method not allowed']);
} catch (Exception $e) {
    coordinator_reminder_json_response(500, ['success' => false, 'error' => gradtrack_public_exception_message($e, 'Unable to process reminders right now.', 'Admin reminders API')]);
}
