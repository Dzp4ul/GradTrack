<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/alumni_rating.php';
require_once __DIR__ . '/../config/engagement_approval.php';
require_once __DIR__ . '/../../vendor/autoload.php';

use PHPMailer\PHPMailer\Exception as MailException;
use PHPMailer\PHPMailer\PHPMailer;

function gradtrack_mail_clean_text($value): string
{
        return trim((string) ($value ?? ''));
}

function gradtrack_mail_escape($value): string
{
        return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function gradtrack_mail_frontend_url(): string
{
        $configuredUrl = getenv('FRONTEND_URL') ?: getenv('APP_URL') ?: '';
        if (trim($configuredUrl) !== '') {
                return rtrim(trim($configuredUrl), '/');
        }

        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        return $origin !== '' ? rtrim($origin, '/') : 'http://localhost:5173';
}

function gradtrack_create_mailer(): PHPMailer
{
        $host = gradtrack_mail_clean_text(getenv('MAIL_HOST') ?: 'smtp.gmail.com');
        $username = gradtrack_mail_clean_text(getenv('MAIL_USERNAME') ?: '');
        $password = str_replace(' ', '', gradtrack_mail_clean_text(getenv('MAIL_PASSWORD') ?: ''));
        $fromAddress = gradtrack_mail_clean_text(getenv('MAIL_FROM_ADDRESS') ?: $username);
        $fromName = gradtrack_mail_clean_text(getenv('MAIL_FROM_NAME') ?: 'GRADTRACK');

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

        $encryption = strtolower(gradtrack_mail_clean_text(getenv('MAIL_ENCRYPTION') ?: 'tls'));
        if ($encryption === 'ssl' || $encryption === 'smtps') {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        } elseif ($encryption === 'tls' || $encryption === 'starttls') {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        }

        $mail->setFrom($fromAddress, $fromName);
        $mail->addReplyTo($fromAddress, $fromName);

        return $mail;
}

function gradtrack_send_mentorship_request_email(PDO $db, int $requestId, array $user, int $mentorId): array
{
        $recipientEmail = gradtrack_mail_clean_text($user['email'] ?? '');
        if ($recipientEmail === '' || !filter_var($recipientEmail, FILTER_VALIDATE_EMAIL)) {
                return ['sent' => false, 'reason' => 'Missing or invalid graduate email'];
        }

        $mentorStmt = $db->prepare("SELECT g.first_name, g.last_name
                                                             FROM mentors m
                                                             JOIN graduates g ON g.id = m.graduate_id
                                                             WHERE m.id = :id
                                                             LIMIT 1");
        $mentorStmt->execute([':id' => $mentorId]);
        $mentor = $mentorStmt->fetch(PDO::FETCH_ASSOC) ?: [];

        $graduateName = trim((string) ($user['first_name'] ?? '') . ' ' . (string) ($user['last_name'] ?? ''));
        $graduateName = $graduateName !== '' ? $graduateName : 'Graduate';
        $mentorName = trim((string) ($mentor['first_name'] ?? '') . ' ' . (string) ($mentor['last_name'] ?? ''));
        $mentorName = $mentorName !== '' ? $mentorName : 'Selected Mentor';
        $requestsLink = gradtrack_mail_frontend_url() . '/mentorship';

        $safeGraduateName = gradtrack_mail_escape($graduateName);
        $safeMentorName = gradtrack_mail_escape($mentorName);
        $safeLink = gradtrack_mail_escape($requestsLink);
        $safeProgram = gradtrack_mail_escape((string) (($user['program_code'] ?? '') ?: ($user['program_name'] ?? '')));

        $subject = 'Mentorship Request Confirmation - GradTrack';
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
                                <div style="display:inline-block;background:#eaf2ff;color:#173b80;border-radius:6px;padding:7px 10px;font-size:12px;font-weight:700;">{$safeProgram}</div>
                                <h1 style="margin:18px 0 10px;font-size:24px;line-height:1.3;color:#10213f;">Mentorship request submitted</h1>
                                <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#41516d;">Hello {$safeGraduateName},</p>
                                <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#41516d;">Your mentorship request has been submitted successfully to <strong>{$safeMentorName}</strong>.</p>
                                <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#5d6b83;">Request reference ID: <strong>#{$requestId}</strong></p>
                                <p style="margin:0;font-size:12px;line-height:1.6;color:#7b8798;">Track your request status here:<br><a href="{$safeLink}" style="color:#173b80;word-break:break-all;">{$safeLink}</a></p>
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

        $text = "Hello {$graduateName},\n\n"
                . "Your mentorship request has been submitted successfully to {$mentorName}.\n"
                . "Request reference ID: #{$requestId}\n"
                . "Track status: {$requestsLink}\n\n"
                . "Thank you,\nGRADTRACK";

        $mailer = gradtrack_create_mailer();
        $mailer->addAddress($recipientEmail, $graduateName);
        $mailer->Subject = $subject;
        $mailer->isHTML(true);
        $mailer->Body = $html;
        $mailer->AltBody = $text;
        $mailer->send();
        $mailer->smtpClose();

        return ['sent' => true, 'email' => $recipientEmail];
}

function gradtrack_send_mentor_incoming_request_email(PDO $db, int $requestId, array $user, int $mentorId, ?string $requestMessage): array
{
        $mentorStmt = $db->prepare("SELECT ga.email, g.first_name, g.last_name
                                                             FROM mentors m
                                                             JOIN graduate_accounts ga ON ga.id = m.graduate_account_id
                                                             JOIN graduates g ON g.id = m.graduate_id
                                                             WHERE m.id = :id
                                                             LIMIT 1");
        $mentorStmt->execute([':id' => $mentorId]);
        $mentor = $mentorStmt->fetch(PDO::FETCH_ASSOC);

        if (!$mentor) {
                return ['sent' => false, 'reason' => 'Mentor account not found'];
        }

        $mentorEmail = gradtrack_mail_clean_text($mentor['email'] ?? '');
        if ($mentorEmail === '' || !filter_var($mentorEmail, FILTER_VALIDATE_EMAIL)) {
                return ['sent' => false, 'reason' => 'Missing or invalid mentor email'];
        }

        $mentorName = trim((string) ($mentor['first_name'] ?? '') . ' ' . (string) ($mentor['last_name'] ?? ''));
        $mentorName = $mentorName !== '' ? $mentorName : 'Mentor';

        $menteeName = trim((string) ($user['first_name'] ?? '') . ' ' . (string) ($user['last_name'] ?? ''));
        $menteeName = $menteeName !== '' ? $menteeName : 'Graduate';
        $menteeProgram = (string) (($user['program_code'] ?? '') ?: ($user['program_name'] ?? ''));
        $cleanMessage = gradtrack_mail_clean_text($requestMessage ?? '');
        $safeMessage = $cleanMessage !== ''
                ? nl2br(gradtrack_mail_escape($cleanMessage))
                : '<em style="color:#6b778d;">No message provided.</em>';

        $incomingLink = gradtrack_mail_frontend_url() . '/mentorship?type=incoming';
        $safeMentorName = gradtrack_mail_escape($mentorName);
        $safeMenteeName = gradtrack_mail_escape($menteeName);
        $safeMenteeProgram = gradtrack_mail_escape($menteeProgram);
        $safeIncomingLink = gradtrack_mail_escape($incomingLink);

        $subject = 'New Incoming Mentorship Request - GradTrack';
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
                                <h1 style="margin:0 0 10px;font-size:24px;line-height:1.3;color:#10213f;">You have a new mentorship request</h1>
                                <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#41516d;">Hello {$safeMentorName},</p>
                                <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#41516d;"><strong>{$safeMenteeName}</strong> sent you a mentorship request.</p>
                                <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#5d6b83;">Program: <strong>{$safeMenteeProgram}</strong></p>
                                <p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#5d6b83;">Message:</p>
                                <div style="background:#f7f9fc;border:1px solid #e4eaf3;border-radius:6px;padding:12px;font-size:14px;line-height:1.6;color:#41516d;">{$safeMessage}</div>
                                <p style="margin:16px 0 0;font-size:14px;line-height:1.7;color:#5d6b83;">Request reference ID: <strong>#{$requestId}</strong></p>
                                <p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#7b8798;">Review it here:<br><a href="{$safeIncomingLink}" style="color:#173b80;word-break:break-all;">{$safeIncomingLink}</a></p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
</html>
HTML;

        $text = "Hello {$mentorName},\n\n"
                . "{$menteeName} sent you a mentorship request.\n"
                . "Program: {$menteeProgram}\n"
                . ($cleanMessage !== '' ? ("Message: {$cleanMessage}\n") : '')
                . "Request reference ID: #{$requestId}\n"
                . "Review it here: {$incomingLink}\n\n"
                . "Thank you,\nGRADTRACK";

        $mailer = gradtrack_create_mailer();
        $mailer->addAddress($mentorEmail, $mentorName);
        $mailer->Subject = $subject;
        $mailer->isHTML(true);
        $mailer->Body = $html;
        $mailer->AltBody = $text;
        $mailer->send();
        $mailer->smtpClose();

        return ['sent' => true, 'email' => $mentorEmail];
}

function gradtrack_send_mentee_session_details_email(PDO $db, int $requestId): array
{
        $stmt = $db->prepare("SELECT mr.id, mr.request_message, mr.reason_for_request, mr.topic, mr.preferred_schedule,
                                                             mr.session_date, mr.session_time, mr.session_type, mr.meeting_link, mr.meeting_location, mr.session_notes,
                                                             ga_mentee.email AS mentee_email,
                                                             COALESCE(mr.mentee_name, CONCAT(g_mentee.first_name, ' ', g_mentee.last_name)) AS mentee_name,
                                                             COALESCE(mr.mentee_program, p_mentee.code, p_mentee.name) AS mentee_program,
                                                             CONCAT(g_mentor.first_name, ' ', g_mentor.last_name) AS mentor_name,
                                                             m.current_job_title AS mentor_job_title,
                                                             m.company AS mentor_company
                                                      FROM mentorship_requests mr
                                                      JOIN graduate_accounts ga_mentee ON ga_mentee.id = mr.mentee_account_id
                                                      JOIN graduates g_mentee ON g_mentee.id = ga_mentee.graduate_id
                                                      LEFT JOIN programs p_mentee ON p_mentee.id = g_mentee.program_id
                                                      JOIN mentors m ON m.id = mr.mentor_id
                                                      JOIN graduates g_mentor ON g_mentor.id = m.graduate_id
                                                      WHERE mr.id = :id
                                                      LIMIT 1");
        $stmt->execute([':id' => $requestId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
                return ['sent' => false, 'reason' => 'Mentorship request not found'];
        }

        $menteeEmail = gradtrack_mail_clean_text($row['mentee_email'] ?? '');
        if ($menteeEmail === '' || !filter_var($menteeEmail, FILTER_VALIDATE_EMAIL)) {
                return ['sent' => false, 'reason' => 'Missing or invalid mentee email'];
        }

        $menteeName = gradtrack_mail_clean_text($row['mentee_name'] ?? '');
        $menteeName = $menteeName !== '' ? $menteeName : 'Graduate';
        $mentorName = gradtrack_mail_clean_text($row['mentor_name'] ?? '');
        $mentorName = $mentorName !== '' ? $mentorName : 'Your mentor';

        $sessionDate = gradtrack_mail_clean_text($row['session_date'] ?? '');
        $sessionTime = gradtrack_mail_clean_text($row['session_time'] ?? '');
        $sessionType = gradtrack_mail_clean_text($row['session_type'] ?? '');
        $meetingLink = gradtrack_mail_clean_text($row['meeting_link'] ?? '');
        $meetingLocation = gradtrack_mail_clean_text($row['meeting_location'] ?? '');
        $sessionNotes = gradtrack_mail_clean_text($row['session_notes'] ?? '');
        $topic = gradtrack_mail_clean_text($row['topic'] ?? '');
        $reasonForRequest = gradtrack_mail_clean_text($row['reason_for_request'] ?? '');
        $preferredSchedule = gradtrack_mail_clean_text($row['preferred_schedule'] ?? '');
        $requestMessage = gradtrack_mail_clean_text($row['request_message'] ?? '');
        $mentorJobTitle = gradtrack_mail_clean_text($row['mentor_job_title'] ?? '');
        $mentorCompany = gradtrack_mail_clean_text($row['mentor_company'] ?? '');
        $menteeProgram = gradtrack_mail_clean_text($row['mentee_program'] ?? '');

        $dashboardLink = gradtrack_mail_frontend_url() . '/graduate/portal?tab=requests';
        $safeMenteeName = gradtrack_mail_escape($menteeName);
        $safeMentorName = gradtrack_mail_escape($mentorName);
        $safeMentorRole = gradtrack_mail_escape(trim($mentorJobTitle . ($mentorCompany !== '' ? (' at ' . $mentorCompany) : '')));
        $safeProgram = gradtrack_mail_escape($menteeProgram !== '' ? $menteeProgram : 'N/A');
        $safeDate = gradtrack_mail_escape($sessionDate !== '' ? $sessionDate : 'N/A');
        $safeTime = gradtrack_mail_escape($sessionTime !== '' ? $sessionTime : 'N/A');
        $safeType = gradtrack_mail_escape($sessionType !== '' ? $sessionType : 'N/A');
        $safeMeetingLink = gradtrack_mail_escape($meetingLink !== '' ? $meetingLink : 'N/A');
        $safeMeetingLocation = gradtrack_mail_escape($meetingLocation !== '' ? $meetingLocation : 'N/A');
        $safeNotes = gradtrack_mail_escape($sessionNotes !== '' ? $sessionNotes : 'N/A');
        $safeTopic = gradtrack_mail_escape($topic !== '' ? $topic : 'N/A');
        $safeReason = gradtrack_mail_escape($reasonForRequest !== '' ? $reasonForRequest : 'N/A');
        $safePreferred = gradtrack_mail_escape($preferredSchedule !== '' ? $preferredSchedule : 'N/A');
        $safeRequestMessage = gradtrack_mail_escape($requestMessage !== '' ? $requestMessage : 'N/A');
        $safeDashboardLink = gradtrack_mail_escape($dashboardLink);

        $subject = 'Mentorship Session Set by Mentor - GradTrack';
        $html = <<<HTML
<!doctype html>
<html>
    <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#14213d;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:28px 12px;">
            <tr>
                <td align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #dbe4f0;border-radius:8px;overflow:hidden;">
                        <tr>
                            <td style="background:#173b80;padding:22px 28px;border-bottom:4px solid #f4c400;">
                                <div style="font-size:24px;font-weight:800;color:#ffffff;">Grad<span style="color:#f4c400;">Track</span></div>
                                <div style="margin-top:8px;font-size:13px;color:#dce8ff;">Norzagaray College Graduate Tracer Study</div>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:30px 28px 20px;">
                                <h1 style="margin:0 0 10px;font-size:24px;line-height:1.3;color:#10213f;">Your mentorship session is scheduled</h1>
                                <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#41516d;">Hello {$safeMenteeName}, your mentor <strong>{$safeMentorName}</strong> has accepted your request and set a session.</p>
                                <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#5d6b83;">Program: <strong>{$safeProgram}</strong><br>Mentor role: <strong>{$safeMentorRole}</strong><br>Reference ID: <strong>#{$requestId}</strong></p>
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e4eaf3;border-radius:6px;overflow:hidden;">
                                    <tr><td style="padding:10px 12px;background:#f7f9fc;font-weight:700;">Session Date</td><td style="padding:10px 12px;">{$safeDate}</td></tr>
                                    <tr><td style="padding:10px 12px;background:#f7f9fc;font-weight:700;">Session Time</td><td style="padding:10px 12px;">{$safeTime}</td></tr>
                                    <tr><td style="padding:10px 12px;background:#f7f9fc;font-weight:700;">Session Type</td><td style="padding:10px 12px;">{$safeType}</td></tr>
                                    <tr><td style="padding:10px 12px;background:#f7f9fc;font-weight:700;">Meeting Link</td><td style="padding:10px 12px;word-break:break-all;">{$safeMeetingLink}</td></tr>
                                    <tr><td style="padding:10px 12px;background:#f7f9fc;font-weight:700;">Meeting Location</td><td style="padding:10px 12px;">{$safeMeetingLocation}</td></tr>
                                    <tr><td style="padding:10px 12px;background:#f7f9fc;font-weight:700;">Session Notes</td><td style="padding:10px 12px;">{$safeNotes}</td></tr>
                                    <tr><td style="padding:10px 12px;background:#f7f9fc;font-weight:700;">Topic</td><td style="padding:10px 12px;">{$safeTopic}</td></tr>
                                    <tr><td style="padding:10px 12px;background:#f7f9fc;font-weight:700;">Reason for Request</td><td style="padding:10px 12px;">{$safeReason}</td></tr>
                                    <tr><td style="padding:10px 12px;background:#f7f9fc;font-weight:700;">Preferred Schedule</td><td style="padding:10px 12px;">{$safePreferred}</td></tr>
                                    <tr><td style="padding:10px 12px;background:#f7f9fc;font-weight:700;">Your Request Message</td><td style="padding:10px 12px;">{$safeRequestMessage}</td></tr>
                                </table>
                                <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#7b8798;">View details in portal:<br><a href="{$safeDashboardLink}" style="color:#173b80;word-break:break-all;">{$safeDashboardLink}</a></p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
</html>
HTML;

        $text = "Hello {$menteeName},\n\n"
                . "Your mentor {$mentorName} accepted your request and set a session.\n"
                . "Reference ID: #{$requestId}\n"
                . "Session Date: " . ($sessionDate !== '' ? $sessionDate : 'N/A') . "\n"
                . "Session Time: " . ($sessionTime !== '' ? $sessionTime : 'N/A') . "\n"
                . "Session Type: " . ($sessionType !== '' ? $sessionType : 'N/A') . "\n"
                . "Meeting Link: " . ($meetingLink !== '' ? $meetingLink : 'N/A') . "\n"
                . "Meeting Location: " . ($meetingLocation !== '' ? $meetingLocation : 'N/A') . "\n"
                . "Session Notes: " . ($sessionNotes !== '' ? $sessionNotes : 'N/A') . "\n"
                . "Topic: " . ($topic !== '' ? $topic : 'N/A') . "\n"
                . "Reason for Request: " . ($reasonForRequest !== '' ? $reasonForRequest : 'N/A') . "\n"
                . "Preferred Schedule: " . ($preferredSchedule !== '' ? $preferredSchedule : 'N/A') . "\n"
                . "Your Request Message: " . ($requestMessage !== '' ? $requestMessage : 'N/A') . "\n"
                . "Portal link: {$dashboardLink}\n\n"
                . "Thank you,\nGRADTRACK";

        $mailer = gradtrack_create_mailer();
        $mailer->addAddress($menteeEmail, $menteeName);
        $mailer->Subject = $subject;
        $mailer->isHTML(true);
        $mailer->Body = $html;
        $mailer->AltBody = $text;
        $mailer->send();
        $mailer->smtpClose();

        return ['sent' => true, 'email' => $menteeEmail];
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

function gradtrack_request_column_info(PDO $db, string $table, string $column): ?array
{
    $stmt = $db->prepare("SELECT DATA_TYPE, COLUMN_TYPE
                          FROM INFORMATION_SCHEMA.COLUMNS
                          WHERE TABLE_SCHEMA = DATABASE()
                            AND TABLE_NAME = :table
                            AND COLUMN_NAME = :column
                          LIMIT 1");
    $stmt->execute([
        ':table' => $table,
        ':column' => $column,
    ]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function gradtrack_ensure_request_column(PDO $db, string $column, string $definition): void
{
    if (!gradtrack_request_column_info($db, 'mentorship_requests', $column)) {
        $db->exec("ALTER TABLE mentorship_requests ADD COLUMN {$definition}");
    }
}

function gradtrack_ensure_mentorship_request_schema(PDO $db): void
{
    $statusInfo = gradtrack_request_column_info($db, 'mentorship_requests', 'status');
    if ($statusInfo && strpos((string) ($statusInfo['COLUMN_TYPE'] ?? ''), 'cancelled') === false) {
        $db->exec("ALTER TABLE mentorship_requests
                   MODIFY status ENUM('pending','accepted','declined','completed','cancelled') DEFAULT 'pending'");
    }

    gradtrack_ensure_request_column($db, 'mentee_name', 'mentee_name VARCHAR(160) NULL AFTER mentee_account_id');
    gradtrack_ensure_request_column($db, 'mentee_email', 'mentee_email VARCHAR(160) NULL AFTER mentee_name');
    gradtrack_ensure_request_column($db, 'mentee_program', 'mentee_program VARCHAR(160) NULL AFTER mentee_email');
    gradtrack_ensure_request_column($db, 'reason_for_request', 'reason_for_request TEXT NULL AFTER request_message');
    gradtrack_ensure_request_column($db, 'topic', 'topic VARCHAR(150) NULL AFTER reason_for_request');
    gradtrack_ensure_request_column($db, 'preferred_schedule', 'preferred_schedule VARCHAR(150) NULL AFTER topic');
    gradtrack_ensure_request_column($db, 'session_date', 'session_date DATE NULL AFTER preferred_schedule');
    gradtrack_ensure_request_column($db, 'session_time', 'session_time VARCHAR(80) NULL AFTER session_date');
    gradtrack_ensure_request_column($db, 'session_type', 'session_type VARCHAR(50) NULL AFTER session_time');
    gradtrack_ensure_request_column($db, 'meeting_link', 'meeting_link VARCHAR(255) NULL AFTER session_type');
    gradtrack_ensure_request_column($db, 'meeting_location', 'meeting_location VARCHAR(255) NULL AFTER meeting_link');
    gradtrack_ensure_request_column($db, 'session_notes', 'session_notes TEXT NULL AFTER meeting_location');

    if (!gradtrack_request_column_info($db, 'mentorship_feedback', 'mentor_helpful')) {
        $db->exec('ALTER TABLE mentorship_feedback ADD COLUMN mentor_helpful TINYINT(1) NULL AFTER rating');
    }

    $db->exec("CREATE TABLE IF NOT EXISTS mentorship_mentor_feedback (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mentorship_request_id INT NOT NULL UNIQUE,
        mentor_account_id INT NOT NULL,
        mentee_attended TINYINT(1) NULL,
        session_completed TINYINT(1) NULL,
        remarks TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_mentor_feedback_request FOREIGN KEY (mentorship_request_id) REFERENCES mentorship_requests(id) ON DELETE CASCADE,
        CONSTRAINT fk_mentor_feedback_account FOREIGN KEY (mentor_account_id) REFERENCES graduate_accounts(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

try {
    $user = gradtrack_require_graduate_auth($db);
    gradtrack_ensure_mentorship_request_schema($db);
    gradtrack_ensure_engagement_approval_schema($db);

    if ($method === 'GET') {
        $type = isset($_GET['type']) ? trim((string) $_GET['type']) : 'outgoing';

        if ($type === 'incoming') {
            $query = "SELECT mr.*, m.id AS mentor_id,
                             COALESCE(mr.mentee_email, ga.email) AS mentee_email,
                             COALESCE(mr.mentee_name, CONCAT(g.first_name, ' ', g.last_name)) AS mentee_name,
                             COALESCE(mr.mentee_program, p.code, p.name) AS mentee_program,
                             g.first_name AS mentee_first_name,
                             g.last_name AS mentee_last_name,
                             mf.rating AS mentee_feedback_rating,
                             mf.feedback_text AS mentee_feedback_text,
                             mf.mentor_helpful AS mentee_found_helpful,
                             mmf.mentee_attended AS mentor_feedback_attended,
                             mmf.session_completed AS mentor_feedback_completed,
                             mmf.remarks AS mentor_feedback_remarks
                      FROM mentorship_requests mr
                      JOIN mentors m ON mr.mentor_id = m.id
                      JOIN graduate_accounts ga ON mr.mentee_account_id = ga.id
                      JOIN graduates g ON ga.graduate_id = g.id
                      LEFT JOIN programs p ON g.program_id = p.id
                      LEFT JOIN mentorship_feedback mf ON mf.mentorship_request_id = mr.id
                      LEFT JOIN mentorship_mentor_feedback mmf ON mmf.mentorship_request_id = mr.id
                      WHERE m.graduate_account_id = :account_id
                      ORDER BY mr.requested_at DESC";
            $stmt = $db->prepare($query);
            $stmt->bindParam(':account_id', $user['account_id']);
            $stmt->execute();
        } else {
            $query = "SELECT mr.*, m.id AS mentor_id,
                             mg.first_name AS mentor_first_name,
                             mg.last_name AS mentor_last_name,
                             m.current_job_title, m.company, m.industry,
                             m.job_alignment, m.mentor_type, m.availability_status,
                             gpi.file_path AS mentor_profile_image_path,
                             mf.rating AS mentee_feedback_rating,
                             mf.feedback_text AS mentee_feedback_text,
                             mf.mentor_helpful AS mentee_found_helpful,
                             mmf.mentee_attended AS mentor_feedback_attended,
                             mmf.session_completed AS mentor_feedback_completed,
                             mmf.remarks AS mentor_feedback_remarks
                      FROM mentorship_requests mr
                      JOIN mentors m ON mr.mentor_id = m.id
                      JOIN graduates mg ON m.graduate_id = mg.id
                      JOIN graduate_accounts mga ON m.graduate_account_id = mga.id
                      LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = mga.id
                      LEFT JOIN mentorship_feedback mf ON mf.mentorship_request_id = mr.id
                      LEFT JOIN mentorship_mentor_feedback mmf ON mmf.mentorship_request_id = mr.id
                      WHERE mr.mentee_account_id = :account_id
                      ORDER BY mr.requested_at DESC";
            $stmt = $db->prepare($query);
            $stmt->bindParam(':account_id', $user['account_id']);
            $stmt->execute();
        }

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$row) {
            $row['id'] = (int) $row['id'];
            $row['mentor_id'] = (int) $row['mentor_id'];
            $row['mentee_account_id'] = (int) $row['mentee_account_id'];
            if (isset($row['mentee_feedback_rating'])) {
                $row['mentee_feedback_rating'] = $row['mentee_feedback_rating'] !== null ? (int) $row['mentee_feedback_rating'] : null;
            }
            if (isset($row['mentee_found_helpful'])) {
                $row['mentee_found_helpful'] = $row['mentee_found_helpful'] !== null ? (bool) $row['mentee_found_helpful'] : null;
            }
            if (isset($row['mentor_feedback_attended'])) {
                $row['mentor_feedback_attended'] = $row['mentor_feedback_attended'] !== null ? (bool) $row['mentor_feedback_attended'] : null;
            }
            if (isset($row['mentor_feedback_completed'])) {
                $row['mentor_feedback_completed'] = $row['mentor_feedback_completed'] !== null ? (bool) $row['mentor_feedback_completed'] : null;
            }
        }

        echo json_encode(['success' => true, 'data' => $rows]);
        exit;
    }

    if ($method === 'POST') {
        gradtrack_require_feature_access($db, $user, 'mentorship_request');
        $data = json_decode(file_get_contents('php://input'), true);
        $mentorId = isset($data['mentor_id']) ? (int) $data['mentor_id'] : 0;
        $requestMessage = isset($data['request_message']) ? trim((string) $data['request_message']) : null;
        $menteeName = isset($data['mentee_name']) ? trim((string) $data['mentee_name']) : '';
        $menteeEmail = isset($data['mentee_email']) ? trim((string) $data['mentee_email']) : '';
        $menteeProgram = isset($data['mentee_program']) ? trim((string) $data['mentee_program']) : '';
        $reasonForRequest = isset($data['reason_for_request']) ? trim((string) $data['reason_for_request']) : null;
        $topic = isset($data['topic']) ? trim((string) $data['topic']) : null;
        $preferredSchedule = isset($data['preferred_schedule']) ? trim((string) $data['preferred_schedule']) : null;

        if ($menteeName === '') {
            $menteeName = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''));
        }

        if ($menteeEmail === '') {
            $menteeEmail = (string) ($user['email'] ?? '');
        }

        if ($menteeProgram === '') {
            $menteeProgram = (string) (($user['program_code'] ?? '') ?: ($user['program_name'] ?? ''));
        }

        if ($mentorId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'mentor_id is required']);
            exit;
        }

        $mentorOwnerStmt = $db->prepare("SELECT graduate_account_id
                                         FROM mentors
                                         WHERE id = :id
                                           AND is_active = 1
                                           AND approval_status = 'approved'");
        $mentorOwnerStmt->bindParam(':id', $mentorId);
        $mentorOwnerStmt->execute();
        $mentor = $mentorOwnerStmt->fetch(PDO::FETCH_ASSOC);

        if (!$mentor) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Mentor not found, inactive, or not yet approved']);
            exit;
        }

        if ((int) $mentor['graduate_account_id'] === $user['account_id']) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'You cannot send a request to yourself']);
            exit;
        }

        $dupStmt = $db->prepare("SELECT id FROM mentorship_requests
                                 WHERE mentor_id = :mentor_id
                                   AND mentee_account_id = :mentee_account_id
                                   AND status = 'pending'");
        $dupStmt->bindParam(':mentor_id', $mentorId);
        $dupStmt->bindParam(':mentee_account_id', $user['account_id']);
        $dupStmt->execute();

        if ($dupStmt->fetch(PDO::FETCH_ASSOC)) {
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => 'You already have a pending request for this mentor']);
            exit;
        }

        $insertStmt = $db->prepare("INSERT INTO mentorship_requests
                                    (mentor_id, mentee_account_id, mentee_name, mentee_email, mentee_program,
                                     request_message, reason_for_request, topic, preferred_schedule)
                                    VALUES
                                    (:mentor_id, :mentee_account_id, :mentee_name, :mentee_email, :mentee_program,
                                     :request_message, :reason_for_request, :topic, :preferred_schedule)");
        $insertStmt->bindParam(':mentor_id', $mentorId);
        $insertStmt->bindParam(':mentee_account_id', $user['account_id']);
        $insertStmt->bindParam(':mentee_name', $menteeName);
        $insertStmt->bindParam(':mentee_email', $menteeEmail);
        $insertStmt->bindParam(':mentee_program', $menteeProgram);
        $insertStmt->bindParam(':request_message', $requestMessage);
        $insertStmt->bindParam(':reason_for_request', $reasonForRequest);
        $insertStmt->bindParam(':topic', $topic);
        $insertStmt->bindParam(':preferred_schedule', $preferredSchedule);
        $insertStmt->execute();
        $requestId = (int) $db->lastInsertId();

        $emailNotification = [
            'sent' => false,
            'reason' => 'Skipped'
        ];
        $mentorEmailNotification = [
            'sent' => false,
            'reason' => 'Skipped'
        ];

        try {
            $emailNotification = gradtrack_send_mentorship_request_email($db, $requestId, $user, $mentorId);
        } catch (MailException $mailException) {
            $emailNotification = ['sent' => false, 'reason' => $mailException->getMessage()];
        } catch (Exception $mailException) {
            $emailNotification = ['sent' => false, 'reason' => $mailException->getMessage()];
        }

        try {
            $mentorEmailNotification = gradtrack_send_mentor_incoming_request_email($db, $requestId, $user, $mentorId, $requestMessage);
        } catch (MailException $mailException) {
            $mentorEmailNotification = ['sent' => false, 'reason' => $mailException->getMessage()];
        } catch (Exception $mailException) {
            $mentorEmailNotification = ['sent' => false, 'reason' => $mailException->getMessage()];
        }

        echo json_encode([
            'success' => true,
            'message' => 'Mentorship request sent',
            'request_id' => $requestId,
            'email_notification' => $emailNotification,
            'mentor_email_notification' => $mentorEmailNotification
        ]);
        exit;
    }

    if ($method === 'PUT') {
        $data = json_decode(file_get_contents('php://input'), true);
        $requestId = isset($data['id']) ? (int) $data['id'] : 0;
        $status = isset($data['status']) ? trim((string) $data['status']) : '';
        $menteeSessionEmailNotification = [
            'sent' => false,
            'reason' => 'Skipped'
        ];

        if ($requestId <= 0 || $status === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'id and status are required']);
            exit;
        }

        $requestStmt = $db->prepare("SELECT mr.*, m.graduate_account_id AS mentor_account_id
                                     FROM mentorship_requests mr
                                     JOIN mentors m ON mr.mentor_id = m.id
                                     WHERE mr.id = :id");
        $requestStmt->bindParam(':id', $requestId);
        $requestStmt->execute();
        $request = $requestStmt->fetch(PDO::FETCH_ASSOC);

        if (!$request) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Mentorship request not found']);
            exit;
        }

        if (in_array($status, ['accepted', 'declined'], true)) {
            if ((int) $request['mentor_account_id'] !== $user['account_id']) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'Only the mentor can respond to this request']);
                exit;
            }

            if ($status === 'accepted') {
                $sessionDate = array_key_exists('session_date', $data) ? trim((string) $data['session_date']) : (string) ($request['session_date'] ?? '');
                $sessionTime = array_key_exists('session_time', $data) ? trim((string) $data['session_time']) : (string) ($request['session_time'] ?? '');
                $sessionType = array_key_exists('session_type', $data) ? trim((string) $data['session_type']) : (string) ($request['session_type'] ?? '');
                $meetingLink = array_key_exists('meeting_link', $data) ? trim((string) $data['meeting_link']) : (string) ($request['meeting_link'] ?? '');
                $meetingLocation = array_key_exists('meeting_location', $data) ? trim((string) $data['meeting_location']) : (string) ($request['meeting_location'] ?? '');
                $sessionNotes = array_key_exists('session_notes', $data) ? trim((string) $data['session_notes']) : (string) ($request['session_notes'] ?? '');

                $sessionDate = $sessionDate !== '' ? $sessionDate : null;
                $sessionTime = $sessionTime !== '' ? $sessionTime : null;
                $sessionType = $sessionType !== '' ? $sessionType : null;
                $meetingLink = $meetingLink !== '' ? $meetingLink : null;
                $meetingLocation = $meetingLocation !== '' ? $meetingLocation : null;
                $sessionNotes = $sessionNotes !== '' ? $sessionNotes : null;

                $updateStmt = $db->prepare("UPDATE mentorship_requests
                                            SET status = 'accepted',
                                                responded_at = NOW(),
                                                session_date = :session_date,
                                                session_time = :session_time,
                                                session_type = :session_type,
                                                meeting_link = :meeting_link,
                                                meeting_location = :meeting_location,
                                                session_notes = :session_notes
                                            WHERE id = :id");
                $updateStmt->bindValue(':session_date', $sessionDate);
                $updateStmt->bindValue(':session_time', $sessionTime);
                $updateStmt->bindValue(':session_type', $sessionType);
                $updateStmt->bindValue(':meeting_link', $meetingLink);
                $updateStmt->bindValue(':meeting_location', $meetingLocation);
                $updateStmt->bindValue(':session_notes', $sessionNotes);
                $updateStmt->bindParam(':id', $requestId);
                $updateStmt->execute();

                try {
                    $menteeSessionEmailNotification = gradtrack_send_mentee_session_details_email($db, $requestId);
                } catch (MailException $mailException) {
                    $menteeSessionEmailNotification = ['sent' => false, 'reason' => $mailException->getMessage()];
                } catch (Exception $mailException) {
                    $menteeSessionEmailNotification = ['sent' => false, 'reason' => $mailException->getMessage()];
                }
            } else {
                $updateStmt = $db->prepare('UPDATE mentorship_requests SET status = :status, responded_at = NOW() WHERE id = :id');
                $updateStmt->bindParam(':status', $status);
                $updateStmt->bindParam(':id', $requestId);
                $updateStmt->execute();
            }
        } elseif ($status === 'completed') {
            $isParticipant = (int) $request['mentor_account_id'] === $user['account_id']
                || (int) $request['mentee_account_id'] === $user['account_id'];

            if (!$isParticipant) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'Only participants can complete this mentorship']);
                exit;
            }

            $updateStmt = $db->prepare("UPDATE mentorship_requests
                                        SET status = 'completed', completed_at = NOW()
                                        WHERE id = :id");
            $updateStmt->bindParam(':id', $requestId);
            $updateStmt->execute();
        } elseif ($status === 'cancelled') {
            $isParticipant = (int) $request['mentor_account_id'] === $user['account_id']
                || (int) $request['mentee_account_id'] === $user['account_id'];

            if (!$isParticipant) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'Only participants can cancel this mentorship']);
                exit;
            }

            $updateStmt = $db->prepare("UPDATE mentorship_requests
                                        SET status = 'cancelled'
                                        WHERE id = :id");
            $updateStmt->bindParam(':id', $requestId);
            $updateStmt->execute();
        } else {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid status transition']);
            exit;
        }

        echo json_encode([
            'success' => true,
            'message' => 'Mentorship request updated',
            'mentee_session_email_notification' => $menteeSessionEmailNotification
        ]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
