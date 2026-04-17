<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/engagement_approval.php';
require_once __DIR__ . '/../../vendor/autoload.php';

use PHPMailer\PHPMailer\Exception as MailException;
use PHPMailer\PHPMailer\PHPMailer;

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function gradtrack_moderation_json_error(int $statusCode, string $message): void
{
    http_response_code($statusCode);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function gradtrack_moderation_clean_text($value): string
{
        return trim((string) ($value ?? ''));
}

function gradtrack_moderation_escape($value): string
{
        return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function gradtrack_moderation_frontend_url(): string
{
        $configuredUrl = getenv('FRONTEND_URL') ?: getenv('APP_URL') ?: '';
        if (trim($configuredUrl) !== '') {
                return rtrim(trim($configuredUrl), '/');
        }

        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        return $origin !== '' ? rtrim($origin, '/') : 'http://localhost:5173';
}

function gradtrack_moderation_create_mailer(): PHPMailer
{
        $host = gradtrack_moderation_clean_text(getenv('MAIL_HOST') ?: 'smtp.gmail.com');
        $username = gradtrack_moderation_clean_text(getenv('MAIL_USERNAME') ?: '');
        $password = str_replace(' ', '', gradtrack_moderation_clean_text(getenv('MAIL_PASSWORD') ?: ''));
        $fromAddress = gradtrack_moderation_clean_text(getenv('MAIL_FROM_ADDRESS') ?: $username);
        $fromName = gradtrack_moderation_clean_text(getenv('MAIL_FROM_NAME') ?: 'GRADTRACK');

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

        $encryption = strtolower(gradtrack_moderation_clean_text(getenv('MAIL_ENCRYPTION') ?: 'tls'));
        if ($encryption === 'ssl' || $encryption === 'smtps') {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        } elseif ($encryption === 'tls' || $encryption === 'starttls') {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        }

        $mail->setFrom($fromAddress, $fromName);
        $mail->addReplyTo($fromAddress, $fromName);

        return $mail;
}

function gradtrack_moderation_send_approval_email(PDO $db, string $itemType, int $itemId): array
{
        if ($itemType === 'mentor') {
                $stmt = $db->prepare("SELECT ga.email, g.first_name, g.last_name, p.code AS program_code
                                                            FROM mentors m
                                                            JOIN graduate_accounts ga ON ga.id = m.graduate_account_id
                                                            JOIN graduates g ON g.id = m.graduate_id
                                                            LEFT JOIN programs p ON p.id = g.program_id
                                                            WHERE m.id = :id
                                                            LIMIT 1");
                $stmt->execute([':id' => $itemId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);

                if (!$row) {
                        return ['sent' => false, 'reason' => 'Mentor profile owner not found'];
                }

                $email = gradtrack_moderation_clean_text($row['email'] ?? '');
                if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                        return ['sent' => false, 'reason' => 'Missing or invalid graduate email'];
                }

                $name = trim((string) ($row['first_name'] ?? '') . ' ' . (string) ($row['last_name'] ?? ''));
                $name = $name !== '' ? $name : 'Graduate';
                $programCode = gradtrack_moderation_escape((string) ($row['program_code'] ?? ''));
                $safeName = gradtrack_moderation_escape($name);
                $link = gradtrack_moderation_frontend_url() . '/mentorship';
                $safeLink = gradtrack_moderation_escape($link);

                $subject = 'Mentor Profile Approved - GradTrack';
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
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:30px 28px 10px;">
                                <div style="display:inline-block;background:#eaf2ff;color:#173b80;border-radius:6px;padding:7px 10px;font-size:12px;font-weight:700;">{$programCode}</div>
                                <h1 style="margin:18px 0 10px;font-size:24px;line-height:1.3;color:#10213f;">Mentor profile approved</h1>
                                <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#41516d;">Hello {$safeName}, your mentor profile has been approved.</p>
                                <p style="margin:0;font-size:12px;line-height:1.6;color:#7b8798;">Open mentorship: <a href="{$safeLink}" style="color:#173b80;word-break:break-all;">{$safeLink}</a></p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
</html>
HTML;
                $text = "Hello {$name},\n\nYour mentor profile has been approved.\nOpen mentorship: {$link}\n\nThank you,\nGRADTRACK";
        } else {
                $stmt = $db->prepare("SELECT ga.email, g.first_name, g.last_name, p.code AS program_code, jp.title, jp.company
                                                            FROM job_posts jp
                                                            JOIN graduate_accounts ga ON ga.id = jp.posted_by_account_id
                                                            JOIN graduates g ON g.id = ga.graduate_id
                                                            LEFT JOIN programs p ON p.id = g.program_id
                                                            WHERE jp.id = :id
                                                            LIMIT 1");
                $stmt->execute([':id' => $itemId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);

                if (!$row) {
                        return ['sent' => false, 'reason' => 'Job post owner not found'];
                }

                $email = gradtrack_moderation_clean_text($row['email'] ?? '');
                if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                        return ['sent' => false, 'reason' => 'Missing or invalid graduate email'];
                }

                $name = trim((string) ($row['first_name'] ?? '') . ' ' . (string) ($row['last_name'] ?? ''));
                $name = $name !== '' ? $name : 'Graduate';
                $programCode = gradtrack_moderation_escape((string) ($row['program_code'] ?? ''));
                $safeName = gradtrack_moderation_escape($name);
                $safeTitle = gradtrack_moderation_escape((string) ($row['title'] ?? 'Job Post'));
                $safeCompany = gradtrack_moderation_escape((string) ($row['company'] ?? ''));
                $link = gradtrack_moderation_frontend_url() . '/jobs';
                $safeLink = gradtrack_moderation_escape($link);

                $subject = 'Job Post Approved - GradTrack';
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
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:30px 28px 10px;">
                                <div style="display:inline-block;background:#eaf2ff;color:#173b80;border-radius:6px;padding:7px 10px;font-size:12px;font-weight:700;">{$programCode}</div>
                                <h1 style="margin:18px 0 10px;font-size:24px;line-height:1.3;color:#10213f;">Job post approved</h1>
                                <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#41516d;">Hello {$safeName}, your job post <strong>{$safeTitle}</strong> at <strong>{$safeCompany}</strong> has been approved and is now visible.</p>
                                <p style="margin:0;font-size:12px;line-height:1.6;color:#7b8798;">Open jobs page: <a href="{$safeLink}" style="color:#173b80;word-break:break-all;">{$safeLink}</a></p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
</html>
HTML;
                $text = "Hello {$name},\n\nYour job post \"" . (string) ($row['title'] ?? 'Job Post') . "\" at " . (string) ($row['company'] ?? '') . " has been approved and is now visible.\nOpen jobs page: {$link}\n\nThank you,\nGRADTRACK";
        }

        $mailer = gradtrack_moderation_create_mailer();
        $mailer->addAddress($email, $name);
        $mailer->Subject = $subject;
        $mailer->isHTML(true);
        $mailer->Body = $html;
        $mailer->AltBody = $text;
        $mailer->send();
        $mailer->smtpClose();

        return ['sent' => true, 'email' => $email];
}

function gradtrack_moderation_reviewer(): array
{
    if (!isset($_SESSION['user_id'])) {
        gradtrack_moderation_json_error(401, 'Authentication required');
    }

    $role = $_SESSION['role'] ?? '';
    $deanScopes = gradtrack_engagement_dean_program_scopes();
    $canReviewAll = in_array($role, gradtrack_engagement_admin_roles(), true);

    if (!$canReviewAll && !isset($deanScopes[$role])) {
        gradtrack_moderation_json_error(403, 'Only dean accounts can review approvals');
    }

    return [
        'id' => (int) $_SESSION['user_id'],
        'role' => $role,
        'program_scope' => $canReviewAll ? [] : $deanScopes[$role],
        'can_review_all' => $canReviewAll,
    ];
}

function gradtrack_moderation_scope_clause(array $reviewer, string $programAlias, array &$params, string $prefix): string
{
    if ($reviewer['can_review_all']) {
        return '';
    }

    $placeholders = gradtrack_engagement_program_placeholders($reviewer['program_scope'], $params, $prefix);
    return " AND {$programAlias}.code IN ({$placeholders})";
}

function gradtrack_moderation_status_clause(string $column, string $status, array &$params, string $prefix): string
{
    if ($status === 'all') {
        return '';
    }

    $placeholder = ':' . $prefix . '_approval_status';
    $params[$placeholder] = $status;
    return " AND {$column} = {$placeholder}";
}

function gradtrack_moderation_search_clause(array $columns, string $search, array &$params, string $prefix): string
{
    $term = trim($search);
    if ($term === '') {
        return '';
    }

    $parts = [];
    foreach ($columns as $index => $column) {
        $placeholder = ':' . $prefix . '_search_' . $index;
        $parts[] = "{$column} LIKE {$placeholder}";
        $params[$placeholder] = '%' . $term . '%';
    }

    return ' AND (' . implode(' OR ', $parts) . ')';
}

function gradtrack_moderation_counts(PDO $db, string $type, array $reviewer): array
{
    $params = [];

    if ($type === 'mentors') {
        $scopeClause = gradtrack_moderation_scope_clause($reviewer, 'p', $params, 'mentor_count_program');
        $sql = "SELECT m.approval_status, COUNT(*) AS total
                FROM mentors m
                JOIN graduates g ON m.graduate_id = g.id
                LEFT JOIN programs p ON g.program_id = p.id
                WHERE 1=1 {$scopeClause}
                GROUP BY m.approval_status";
    } else {
        $scopeClause = gradtrack_moderation_scope_clause($reviewer, 'p', $params, 'job_count_program');
        $sql = "SELECT jp.approval_status, COUNT(*) AS total
                FROM job_posts jp
                JOIN graduate_accounts ga ON jp.posted_by_account_id = ga.id
                JOIN graduates g ON ga.graduate_id = g.id
                LEFT JOIN programs p ON g.program_id = p.id
                WHERE 1=1 {$scopeClause}
                GROUP BY jp.approval_status";
    }

    $stmt = $db->prepare($sql);
    $stmt->execute($params);

    $counts = ['pending' => 0, 'approved' => 0, 'declined' => 0];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $status = (string) ($row['approval_status'] ?? '');
        if (array_key_exists($status, $counts)) {
            $counts[$status] = (int) $row['total'];
        }
    }

    return $counts;
}

function gradtrack_moderation_fetch_mentors(PDO $db, array $reviewer, string $status, string $search): array
{
    $params = [];
    $scopeClause = gradtrack_moderation_scope_clause($reviewer, 'p', $params, 'mentor_program');
    $statusClause = gradtrack_moderation_status_clause('m.approval_status', $status, $params, 'mentor');
    $searchClause = gradtrack_moderation_search_clause([
        'g.first_name',
        'g.last_name',
        'ga.email',
        'p.code',
        'p.name',
        'm.current_job_title',
        'm.company',
        'm.industry',
        'm.skills',
    ], $search, $params, 'mentor');

    $sql = "SELECT m.id, m.current_job_title, m.company, m.industry, m.skills, m.bio,
                   m.availability_status, m.preferred_topics, m.is_active, m.created_at,
                   m.approval_status, m.approval_reviewed_at, m.approval_notes,
                   reviewer.full_name AS approval_reviewed_by_name,
                   g.first_name, g.middle_name, g.last_name, g.year_graduated,
                   ga.email AS contact_email,
                   p.name AS program_name, p.code AS program_code
            FROM mentors m
            JOIN graduate_accounts ga ON m.graduate_account_id = ga.id
            JOIN graduates g ON m.graduate_id = g.id
            LEFT JOIN programs p ON g.program_id = p.id
            LEFT JOIN admin_users reviewer ON reviewer.id = m.approval_reviewed_by
            WHERE 1=1 {$scopeClause} {$statusClause} {$searchClause}
            ORDER BY CASE m.approval_status
                         WHEN 'pending' THEN 0
                         WHEN 'declined' THEN 1
                         ELSE 2
                     END,
                     m.created_at DESC";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$row) {
        $row['id'] = (int) $row['id'];
        $row['is_active'] = (int) $row['is_active'];
        $row['year_graduated'] = $row['year_graduated'] !== null ? (int) $row['year_graduated'] : null;
    }

    return $rows;
}

function gradtrack_moderation_fetch_jobs(PDO $db, array $reviewer, string $status, string $search): array
{
    $params = [];
    $scopeClause = gradtrack_moderation_scope_clause($reviewer, 'p', $params, 'job_program');
    $statusClause = gradtrack_moderation_status_clause('jp.approval_status', $status, $params, 'job');
    $searchClause = gradtrack_moderation_search_clause([
        'jp.title',
        'jp.company',
        'jp.location',
        'jp.industry',
        'jp.description',
        'jp.required_skills',
        'jp.course_program_fit',
        'g.first_name',
        'g.last_name',
        'ga.email',
        'p.code',
        'p.name',
    ], $search, $params, 'job');

    $sql = "SELECT jp.id, jp.title, jp.company, jp.location, jp.salary_range, jp.job_type,
                   jp.industry, jp.description, jp.required_skills, jp.course_program_fit,
                   jp.application_deadline, jp.contact_email, jp.application_link,
                   jp.application_method, jp.is_active, jp.created_at,
                   jp.approval_status, jp.approval_reviewed_at, jp.approval_notes,
                   reviewer.full_name AS approval_reviewed_by_name,
                   g.first_name, g.middle_name, g.last_name, g.year_graduated,
                   ga.email AS poster_email,
                   p.name AS poster_program_name, p.code AS poster_program_code
            FROM job_posts jp
            JOIN graduate_accounts ga ON jp.posted_by_account_id = ga.id
            JOIN graduates g ON ga.graduate_id = g.id
            LEFT JOIN programs p ON g.program_id = p.id
            LEFT JOIN admin_users reviewer ON reviewer.id = jp.approval_reviewed_by
            WHERE 1=1 {$scopeClause} {$statusClause} {$searchClause}
            ORDER BY CASE jp.approval_status
                         WHEN 'pending' THEN 0
                         WHEN 'declined' THEN 1
                         ELSE 2
                     END,
                     jp.created_at DESC";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$row) {
        $row['id'] = (int) $row['id'];
        $row['is_active'] = (int) $row['is_active'];
        $row['year_graduated'] = $row['year_graduated'] !== null ? (int) $row['year_graduated'] : null;
    }

    return $rows;
}

function gradtrack_moderation_item_program(PDO $db, string $itemType, int $id): ?array
{
    if ($itemType === 'mentor') {
        $sql = "SELECT m.id, p.code AS program_code
                FROM mentors m
                JOIN graduates g ON m.graduate_id = g.id
                LEFT JOIN programs p ON g.program_id = p.id
                WHERE m.id = :id";
    } else {
        $sql = "SELECT jp.id, p.code AS program_code
                FROM job_posts jp
                JOIN graduate_accounts ga ON jp.posted_by_account_id = ga.id
                JOIN graduates g ON ga.graduate_id = g.id
                LEFT JOIN programs p ON g.program_id = p.id
                WHERE jp.id = :id";
    }

    $stmt = $db->prepare($sql);
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
}

function gradtrack_moderation_assert_can_review(array $reviewer, ?array $item): void
{
    if (!$item) {
        gradtrack_moderation_json_error(404, 'Approval item not found');
    }

    if ($reviewer['can_review_all']) {
        return;
    }

    $programCode = (string) ($item['program_code'] ?? '');
    if ($programCode === '' || !in_array($programCode, $reviewer['program_scope'], true)) {
        gradtrack_moderation_json_error(403, 'This item is outside your dean program scope');
    }
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    gradtrack_ensure_engagement_approval_schema($db);
    $reviewer = gradtrack_moderation_reviewer();

    if ($method === 'GET') {
        $status = isset($_GET['status']) ? trim((string) $_GET['status']) : 'pending';
        $search = isset($_GET['search']) ? trim((string) $_GET['search']) : '';
        $allowedStatuses = ['pending', 'approved', 'declined', 'all'];

        if (!in_array($status, $allowedStatuses, true)) {
            $status = 'pending';
        }

        echo json_encode([
            'success' => true,
            'program_scope' => $reviewer['program_scope'],
            'can_review_all' => $reviewer['can_review_all'],
            'summary' => [
                'mentors' => gradtrack_moderation_counts($db, 'mentors', $reviewer),
                'jobs' => gradtrack_moderation_counts($db, 'jobs', $reviewer),
            ],
            'data' => [
                'mentors' => gradtrack_moderation_fetch_mentors($db, $reviewer, $status, $search),
                'jobs' => gradtrack_moderation_fetch_jobs($db, $reviewer, $status, $search),
            ],
        ]);
        exit;
    }

    if ($method === 'PUT') {
        $data = json_decode(file_get_contents('php://input'), true);
        $itemType = isset($data['item_type']) ? trim((string) $data['item_type']) : '';
        $itemId = isset($data['id']) ? (int) $data['id'] : 0;
        $approvalStatus = isset($data['approval_status']) ? trim((string) $data['approval_status']) : '';
        $notes = isset($data['notes']) ? trim((string) $data['notes']) : null;

        if (!in_array($itemType, ['mentor', 'job'], true) || $itemId <= 0) {
            gradtrack_moderation_json_error(400, 'item_type and valid id are required');
        }

        if (!in_array($approvalStatus, ['approved', 'declined'], true)) {
            gradtrack_moderation_json_error(400, 'approval_status must be approved or declined');
        }

        $item = gradtrack_moderation_item_program($db, $itemType, $itemId);
        gradtrack_moderation_assert_can_review($reviewer, $item);

        $table = $itemType === 'mentor' ? 'mentors' : 'job_posts';
        $updateStmt = $db->prepare("UPDATE {$table}
                                    SET approval_status = :approval_status,
                                        approval_reviewed_by = :reviewed_by,
                                        approval_reviewed_at = NOW(),
                                        approval_notes = :notes
                                    WHERE id = :id");
        $updateStmt->execute([
            ':approval_status' => $approvalStatus,
            ':reviewed_by' => $reviewer['id'],
            ':notes' => $notes !== '' ? $notes : null,
            ':id' => $itemId,
        ]);

        $emailNotification = [
            'sent' => false,
            'reason' => 'Skipped'
        ];

        if ($approvalStatus === 'approved') {
            try {
                $emailNotification = gradtrack_moderation_send_approval_email($db, $itemType, $itemId);
            } catch (MailException $mailException) {
                $emailNotification = ['sent' => false, 'reason' => $mailException->getMessage()];
            } catch (Exception $mailException) {
                $emailNotification = ['sent' => false, 'reason' => $mailException->getMessage()];
            }
        }

        echo json_encode([
            'success' => true,
            'message' => ucfirst($itemType) . ' ' . $approvalStatus . ' successfully',
            'email_notification' => $emailNotification,
        ]);
        exit;
    }

    gradtrack_moderation_json_error(405, 'Method not allowed');
} catch (Exception $e) {
    gradtrack_moderation_json_error(500, $e->getMessage());
}
