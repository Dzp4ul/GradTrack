<?php
declare(strict_types=1);

require_once __DIR__ . '/env.php';
require_once __DIR__ . '/../../vendor/autoload.php';

use PHPMailer\PHPMailer\PHPMailer;

if (!function_exists('gradtrack_email_clean_text')) {
    function gradtrack_email_clean_text($value): string
    {
        return trim((string) ($value ?? ''));
    }
}

if (!function_exists('gradtrack_email_escape')) {
    function gradtrack_email_escape($value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}

if (!function_exists('gradtrack_email_create_mailer')) {
    function gradtrack_email_create_mailer(): PHPMailer
    {
        $host = gradtrack_email_clean_text(gradtrack_env('MAIL_HOST', 'smtp.gmail.com'));
        $username = gradtrack_email_clean_text(gradtrack_env('MAIL_USERNAME', ''));
        $password = str_replace(' ', '', gradtrack_email_clean_text(gradtrack_env('MAIL_PASSWORD', '')));
        $fromAddress = gradtrack_email_clean_text(gradtrack_env('MAIL_FROM_ADDRESS', $username));
        $fromName = gradtrack_email_clean_text(gradtrack_env('MAIL_FROM_NAME', 'GRADTRACK'));
        $port = filter_var(gradtrack_env('MAIL_PORT', 587), FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1, 'max_range' => 65535],
        ]);

        if (
            $host === ''
            || $username === ''
            || $password === ''
            || $fromAddress === ''
            || !filter_var($fromAddress, FILTER_VALIDATE_EMAIL)
            || $port === false
        ) {
            throw new RuntimeException('Mail credentials are not configured correctly.');
        }

        $mail = new PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = $host;
        $mail->SMTPAuth = true;
        $mail->Username = $username;
        $mail->Password = $password;
        $mail->Port = (int) $port;
        $mail->CharSet = 'UTF-8';
        $mail->Timeout = 15;

        $encryption = strtolower(gradtrack_email_clean_text(gradtrack_env('MAIL_ENCRYPTION', 'tls')));
        if ($encryption === 'ssl' || $encryption === 'smtps') {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        } elseif ($encryption === 'tls' || $encryption === 'starttls') {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        }

        $mail->setFrom($fromAddress, $fromName !== '' ? $fromName : 'GRADTRACK');
        $mail->addReplyTo($fromAddress, $fromName !== '' ? $fromName : 'GRADTRACK');

        return $mail;
    }
}

if (!function_exists('gradtrack_email_render_layout')) {
    /**
     * @param string[] $paragraphs
     * @param string[] $postscriptParagraphs
     */
    function gradtrack_email_render_layout(
        string $heading,
        string $recipientName,
        array $paragraphs,
        ?string $actionLabel,
        ?string $actionUrl,
        string $signinUrl,
        string $signinLabel = 'GradTrack sign in',
        ?string $callout = null,
        array $postscriptParagraphs = []
    ): string {
        $safeHeading = gradtrack_email_escape($heading);
        $safeName = gradtrack_email_escape($recipientName !== '' ? $recipientName : 'Graduate');
        $safeSigninUrl = gradtrack_email_escape($signinUrl);
        $safeSigninLabel = gradtrack_email_escape($signinLabel);

        $paragraphHtml = '';
        foreach ($paragraphs as $paragraph) {
            $paragraphHtml .= '<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#41516d;">'
                . nl2br(gradtrack_email_escape($paragraph))
                . '</p>';
        }

        $calloutHtml = $callout !== null && trim($callout) !== ''
            ? '<div style="display:inline-block;margin:2px 0 18px;font-size:28px;letter-spacing:4px;font-weight:800;color:#173b80;background:#eaf2ff;padding:14px 18px;border-radius:8px;">'
                . gradtrack_email_escape($callout)
                . '</div>'
            : '';

        $postscriptHtml = '';
        foreach ($postscriptParagraphs as $paragraph) {
            $postscriptHtml .= '<p style="margin:0 0 12px;font-size:13px;line-height:1.7;color:#5d6b83;">'
                . nl2br(gradtrack_email_escape($paragraph))
                . '</p>';
        }

        $buttonHtml = '';
        if ($actionLabel !== null && trim($actionLabel) !== '' && $actionUrl !== null && trim($actionUrl) !== '') {
            $safeActionLabel = gradtrack_email_escape($actionLabel);
            $safeActionUrl = gradtrack_email_escape($actionUrl);
            $buttonHtml = <<<HTML
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 22px;">
                <tr>
                  <td style="border-radius:8px;background:#173b80;">
                    <a href="{$safeActionUrl}" style="display:inline-block;border-radius:8px;padding:13px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">{$safeActionLabel}</a>
                  </td>
                </tr>
              </table>
HTML;
        }

        return <<<HTML
<!doctype html>
<html lang="en">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  </head>
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#14213d;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f3f6fb;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #dbe4f0;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#173b80;padding:22px 28px;border-bottom:4px solid #f4c400;">
                <div style="font-size:24px;font-weight:800;color:#ffffff;">Grad<span style="color:#f4c400;">Track</span></div>
                <div style="margin-top:8px;font-size:13px;line-height:1.5;color:#dce8ff;">Norzagaray College Graduate Tracer Study</div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 12px;">
                <h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;color:#10213f;">{$safeHeading}</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#41516d;">Hello {$safeName},</p>
                {$paragraphHtml}
                {$calloutHtml}
                {$postscriptHtml}
                {$buttonHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 28px;">
                <div style="border-top:1px solid #e4eaf3;padding-top:18px;font-size:13px;line-height:1.7;color:#6b778d;">
                  {$safeSigninLabel}: <a href="{$safeSigninUrl}" style="color:#173b80;word-break:break-all;">{$safeSigninUrl}</a><br>
                  <span style="color:#7b8798;">Norzagaray College Graduate Tracer Study</span><br>
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

if (!function_exists('gradtrack_email_render_text')) {
    /** @param string[] $paragraphs */
    function gradtrack_email_render_text(
        string $heading,
        string $recipientName,
        array $paragraphs,
        ?string $actionLabel,
        ?string $actionUrl,
        string $signinUrl,
        ?string $callout = null
    ): string {
        $lines = [$heading, '', 'Hello ' . ($recipientName !== '' ? $recipientName : 'Graduate') . ',', ''];
        foreach ($paragraphs as $paragraph) {
            $lines[] = $paragraph;
            $lines[] = '';
        }
        if ($callout !== null && trim($callout) !== '') {
            $lines[] = $callout;
            $lines[] = '';
        }
        if ($actionLabel !== null && $actionUrl !== null) {
            $lines[] = $actionLabel . ': ' . $actionUrl;
            $lines[] = '';
        }
        $lines[] = 'GradTrack sign in: ' . $signinUrl;
        $lines[] = 'Norzagaray College Graduate Tracer Study';
        $lines[] = 'GRADTRACK';

        return implode("\n", $lines);
    }
}

if (!function_exists('gradtrack_email_password_reset_message')) {
    function gradtrack_email_password_reset_message(string $fullName, string $otpCode, string $signinUrl, bool $admin = false): array
    {
        $heading = $admin ? 'Admin Password Reset Verification' : 'Password Reset Verification';
        $paragraphs = [
            $admin
                ? 'Use this OTP code to verify your admin password reset request:'
                : 'Use this OTP code to verify your password reset request:',
        ];
        $postscript = ['This code expires in 10 minutes. If you did not request a password reset, you can ignore this email.'];

        return [
            'subject' => $admin ? 'GradTrack Admin Password Reset OTP' : 'GradTrack Password Reset OTP',
            'html' => gradtrack_email_render_layout(
                $heading,
                $fullName,
                $paragraphs,
                null,
                null,
                $signinUrl,
                $admin ? 'Admin sign in' : 'GradTrack sign in',
                $otpCode,
                $postscript
            ),
            'text' => gradtrack_email_render_text($heading, $fullName, array_merge($paragraphs, $postscript), null, null, $signinUrl, $otpCode),
        ];
    }
}

if (!function_exists('gradtrack_email_survey_submitted_message')) {
    function gradtrack_email_survey_submitted_message(string $fullName, string $surveyUrl, string $signinUrl): array
    {
        $heading = 'Survey Submitted Successfully';
        $paragraphs = [
            'Thank you for completing the Norzagaray College Graduate Tracer Survey.',
            'Your responses have been successfully submitted and recorded in GradTrack. Your participation will help Norzagaray College better understand the employment status, career development, and experiences of its graduates.',
            'You may log in to your GradTrack account to review your submitted survey information.',
        ];

        return [
            'subject' => 'GradTrack – Graduate Tracer Survey Submitted Successfully',
            'html' => gradtrack_email_render_layout($heading, $fullName, $paragraphs, 'View My Survey', $surveyUrl, $signinUrl),
            'text' => gradtrack_email_render_text($heading, $fullName, $paragraphs, 'View My Survey', $surveyUrl, $signinUrl),
        ];
    }
}

if (!function_exists('gradtrack_email_account_approved_message')) {
    function gradtrack_email_account_approved_message(string $fullName, string $signinUrl): array
    {
        $heading = 'Account Registration Approved';
        $paragraphs = [
            'Your GradTrack account registration has been approved by the Alumni President.',
            'You can now sign in to your GradTrack account and access the available graduate services, including the Graduate Tracer Survey, Community Forum, Announcements, Messaging, and Job Opportunities.',
        ];

        return [
            'subject' => 'GradTrack – Your Account Registration Has Been Approved',
            'html' => gradtrack_email_render_layout($heading, $fullName, $paragraphs, 'Sign In to GradTrack', $signinUrl, $signinUrl),
            'text' => gradtrack_email_render_text($heading, $fullName, $paragraphs, 'Sign In to GradTrack', $signinUrl, $signinUrl),
        ];
    }
}

if (!function_exists('gradtrack_email_send')) {
    function gradtrack_email_send(string $email, string $recipientName, array $message): void
    {
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Recipient email address is missing or invalid.');
        }

        $subject = gradtrack_email_clean_text($message['subject'] ?? '');
        $html = (string) ($message['html'] ?? '');
        $text = (string) ($message['text'] ?? '');
        if ($subject === '' || $html === '' || $text === '') {
            throw new InvalidArgumentException('Email message content is incomplete.');
        }

        $mailer = gradtrack_email_create_mailer();
        try {
            $mailer->addAddress($email, $recipientName !== '' ? $recipientName : 'GradTrack User');
            $mailer->Subject = $subject;
            $mailer->isHTML(true);
            $mailer->Body = $html;
            $mailer->AltBody = $text;
            $mailer->send();
        } finally {
            $mailer->smtpClose();
        }
    }
}

if (!function_exists('gradtrack_email_safe_error_message')) {
    function gradtrack_email_safe_error_message(Throwable $error): string
    {
        $message = str_replace(["\r", "\n"], ' ', trim($error->getMessage()));
        foreach (['MAIL_PASSWORD', 'MAIL_USERNAME'] as $key) {
            $secret = gradtrack_email_clean_text(gradtrack_env($key, ''));
            if ($secret !== '') {
                $message = str_replace($secret, '[redacted]', $message);
                $message = str_replace(str_replace(' ', '', $secret), '[redacted]', $message);
            }
        }

        return substr($message !== '' ? $message : get_class($error), 0, 2000);
    }
}
