<?php
require_once __DIR__ . '/../../vendor/autoload.php';

use PHPMailer\PHPMailer\PHPMailer;

if (!function_exists('gradtrack_survey_reminder_clean_text')) {
    function gradtrack_survey_reminder_clean_text($value): string
    {
        return trim((string) ($value ?? ''));
    }
}

if (!function_exists('gradtrack_survey_reminder_escape')) {
    function gradtrack_survey_reminder_escape($value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
    }
}

if (!function_exists('gradtrack_survey_reminder_bool')) {
    function gradtrack_survey_reminder_bool($value, bool $default = false): bool
    {
        if ($value === null || $value === '') {
            return $default;
        }

        return filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? $default;
    }
}

if (!function_exists('gradtrack_survey_reminder_frontend_url')) {
    function gradtrack_survey_reminder_frontend_url(): string
    {
        $configuredUrl = getenv('FRONTEND_URL') ?: getenv('APP_URL') ?: '';
        if (trim($configuredUrl) !== '') {
            return rtrim(trim($configuredUrl), '/');
        }

        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        return $origin !== '' ? rtrim($origin, '/') : 'http://localhost:5173';
    }
}

if (!function_exists('gradtrack_survey_reminder_survey_link')) {
    function gradtrack_survey_reminder_survey_link(array $survey): string
    {
        return gradtrack_survey_reminder_frontend_url() . '/survey-verify?survey_id=' . urlencode((string) $survey['id']);
    }
}

if (!function_exists('gradtrack_survey_reminder_graduate_name')) {
    function gradtrack_survey_reminder_graduate_name(array $graduate): string
    {
        $name = trim((string) ($graduate['first_name'] ?? '') . ' ' . (string) ($graduate['last_name'] ?? ''));
        return $name !== '' ? $name : 'Graduate';
    }
}

if (!function_exists('gradtrack_survey_reminder_create_mailer')) {
    function gradtrack_survey_reminder_create_mailer(): PHPMailer
    {
        $host = gradtrack_survey_reminder_clean_text(getenv('MAIL_HOST') ?: 'smtp.gmail.com');
        $username = gradtrack_survey_reminder_clean_text(getenv('MAIL_USERNAME') ?: '');
        $password = str_replace(' ', '', gradtrack_survey_reminder_clean_text(getenv('MAIL_PASSWORD') ?: ''));
        $fromAddress = gradtrack_survey_reminder_clean_text(getenv('MAIL_FROM_ADDRESS') ?: $username);
        $fromName = gradtrack_survey_reminder_clean_text(
            getenv('REMINDER_FROM_NAME') ?: getenv('MAIL_FROM_NAME') ?: 'GRADTRACK'
        );

        if ($host === '' || $username === '' || $password === '' || $fromAddress === '') {
            throw new RuntimeException('Mail credentials are not configured. Please check MAIL_HOST, MAIL_USERNAME, MAIL_PASSWORD, and MAIL_FROM_ADDRESS.');
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

        $encryption = strtolower(gradtrack_survey_reminder_clean_text(getenv('MAIL_ENCRYPTION') ?: 'tls'));
        if ($encryption === 'ssl' || $encryption === 'smtps') {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        } elseif ($encryption === 'tls' || $encryption === 'starttls') {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        }

        $mail->setFrom($fromAddress, $fromName);
        $mail->addReplyTo($fromAddress, $fromName);

        return $mail;
    }
}

if (!function_exists('gradtrack_survey_reminder_ensure_log_table')) {
    function gradtrack_survey_reminder_ensure_log_table(PDO $db): void
    {
        $db->exec("
            CREATE TABLE IF NOT EXISTS survey_reminder_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                survey_id INT NOT NULL,
                graduate_id INT NOT NULL,
                email VARCHAR(255) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                reminder_type ENUM('manual', 'auto') NOT NULL DEFAULT 'auto',
                status ENUM('sent', 'failed', 'skipped') NOT NULL DEFAULT 'sent',
                error_message TEXT NULL,
                sent_at DATETIME NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_survey_reminder_lookup (survey_id, graduate_id, status, sent_at),
                INDEX idx_survey_reminder_type (reminder_type, status, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
    }
}

if (!function_exists('gradtrack_survey_reminder_log')) {
    function gradtrack_survey_reminder_log(
        PDO $db,
        int $surveyId,
        int $graduateId,
        string $email,
        string $subject,
        string $reminderType,
        string $status,
        ?string $errorMessage = null,
        ?string $sentAt = null
    ): void {
        try {
            gradtrack_survey_reminder_ensure_log_table($db);
            $stmt = $db->prepare("
                INSERT INTO survey_reminder_logs
                    (survey_id, graduate_id, email, subject, reminder_type, status, error_message, sent_at)
                VALUES
                    (:survey_id, :graduate_id, :email, :subject, :reminder_type, :status, :error_message, :sent_at)
            ");
            $stmt->execute([
                ':survey_id' => $surveyId,
                ':graduate_id' => $graduateId,
                ':email' => substr($email, 0, 255),
                ':subject' => substr($subject, 0, 255),
                ':reminder_type' => $reminderType === 'manual' ? 'manual' : 'auto',
                ':status' => in_array($status, ['sent', 'failed', 'skipped'], true) ? $status : 'failed',
                ':error_message' => $errorMessage,
                ':sent_at' => $sentAt,
            ]);
        } catch (Throwable $ignored) {
            // Logging must never block a reminder email from being processed.
        }
    }
}

if (!function_exists('gradtrack_survey_reminder_html')) {
    function gradtrack_survey_reminder_html(array $graduate, array $survey, string $message, string $surveyLink): string
    {
        $name = gradtrack_survey_reminder_escape(gradtrack_survey_reminder_graduate_name($graduate));
        $surveyTitle = gradtrack_survey_reminder_escape($survey['title'] ?? 'Graduate Tracer Study Survey');
        $programCode = gradtrack_survey_reminder_escape($graduate['program_code'] ?? '');
        $messageHtml = nl2br(gradtrack_survey_reminder_escape($message));
        $safeSurveyLink = gradtrack_survey_reminder_escape($surveyLink);

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
                <div style="font-size:24px;font-weight:800;color:#ffffff;">Grad<span style="color:#f4c400;">Track</span></div>
                <div style="margin-top:8px;font-size:13px;color:#dce8ff;">Norzagaray College Graduate Tracer Study</div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 10px;">
                <div style="display:inline-block;background:#eaf2ff;color:#173b80;border-radius:6px;padding:7px 10px;font-size:12px;font-weight:700;">{$programCode}</div>
                <h1 style="margin:18px 0 10px;font-size:24px;line-height:1.3;color:#10213f;">Your tracer survey is still waiting</h1>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#41516d;">Hello {$name},</p>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#41516d;">{$messageHtml}</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                  <tr>
                    <td style="background:#f4c400;border-radius:6px;">
                      <a href="{$safeSurveyLink}" style="display:inline-block;padding:13px 20px;color:#10213f;font-weight:800;font-size:14px;text-decoration:none;">Complete the Survey</a>
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
}

if (!function_exists('gradtrack_survey_reminder_text')) {
    function gradtrack_survey_reminder_text(array $graduate, array $survey, string $message, string $surveyLink): string
    {
        $name = gradtrack_survey_reminder_graduate_name($graduate);
        $surveyTitle = (string) ($survey['title'] ?? 'Graduate Tracer Study Survey');

        return "Hello {$name},\n\n"
            . "{$message}\n\n"
            . "Survey: {$surveyTitle}\n"
            . "Open the survey: {$surveyLink}\n\n"
            . "Thank you,\nGRADTRACK";
    }
}
