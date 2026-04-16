<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/engagement_approval.php';

function gradtrack_notifications_json_error(int $statusCode, string $message): void
{
    http_response_code($statusCode);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function gradtrack_notifications_ensure_schema(PDO $db): void
{
    $db->exec("CREATE TABLE IF NOT EXISTS notification_reads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        target_type ENUM('admin','graduate') NOT NULL,
        target_id INT NOT NULL,
        notification_key VARCHAR(190) NOT NULL,
        read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_notification_read (target_type, target_id, notification_key),
        INDEX idx_notification_reads_target (target_type, target_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function gradtrack_notifications_date_token($value): string
{
    $token = preg_replace('/\D+/', '', (string) $value);
    return $token !== '' ? $token : '0';
}

function gradtrack_notifications_snippet($value, int $limit = 120): string
{
    $text = trim(preg_replace('/\s+/', ' ', strip_tags((string) $value)));
    if (strlen($text) <= $limit) {
        return $text;
    }

    return rtrim(substr($text, 0, $limit - 3)) . '...';
}

function gradtrack_notifications_add(
    array &$notifications,
    string $key,
    string $type,
    string $title,
    string $message,
    ?string $createdAt,
    ?string $link = null,
    string $priority = 'normal'
): void {
    $notifications[] = [
        'key' => substr($key, 0, 190),
        'type' => $type,
        'title' => $title,
        'message' => $message,
        'created_at' => $createdAt,
        'link' => $link,
        'priority' => $priority,
    ];
}

function gradtrack_notifications_program_placeholders(array $programCodes, array &$params, string $prefix): string
{
    $placeholders = [];
    foreach ($programCodes as $index => $code) {
        $placeholder = ':' . $prefix . '_' . $index;
        $placeholders[] = $placeholder;
        $params[$placeholder] = $code;
    }

    return implode(', ', $placeholders);
}

function gradtrack_notifications_add_announcements(PDO $db, array &$notifications, string $targetType): void
{
    $stmt = $db->query("SELECT id, title, content, category, published_at, created_at, updated_at
                       FROM announcements
                       WHERE status = 'published'
                       ORDER BY COALESCE(published_at, created_at) DESC, id DESC
                       LIMIT 5");

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $createdAt = $row['published_at'] ?: $row['created_at'];
        $token = gradtrack_notifications_date_token($row['updated_at'] ?: $createdAt);
        $category = ucfirst((string) ($row['category'] ?? 'general'));
        gradtrack_notifications_add(
            $notifications,
            'announcement:' . $row['id'] . ':' . $token,
            'announcement',
            (string) $row['title'],
            $category . ': ' . gradtrack_notifications_snippet($row['content']),
            $createdAt,
            $targetType === 'graduate' ? '/graduate/portal' : '/admin'
        );
    }
}

function gradtrack_notifications_add_admin_surveys(PDO $db, array &$notifications): void
{
    $totalGraduates = (int) ($db->query('SELECT COUNT(*) AS total FROM graduates')->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

    $stmt = $db->query("SELECT id, title, updated_at, created_at
                       FROM surveys
                       WHERE status = 'active'
                       ORDER BY updated_at DESC, id DESC
                       LIMIT 3");

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $survey) {
        $responseStmt = $db->prepare("SELECT COUNT(DISTINCT graduate_id) AS total
                                     FROM survey_responses
                                     WHERE survey_id = :survey_id
                                       AND graduate_id IS NOT NULL");
        $responseStmt->execute([':survey_id' => (int) $survey['id']]);
        $answered = (int) ($responseStmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);
        $pending = max(0, $totalGraduates - $answered);

        if ($pending > 0) {
            gradtrack_notifications_add(
                $notifications,
                'admin-survey-pending:' . $survey['id'] . ':' . $pending,
                'survey',
                'Survey responses pending',
                $pending . ' graduate' . ($pending === 1 ? '' : 's') . ' still need to answer "' . $survey['title'] . '".',
                $survey['updated_at'] ?: $survey['created_at'],
                '/admin/graduates',
                'high'
            );
        }
    }

    $recentStmt = $db->query("SELECT sr.id, sr.survey_id, sr.graduate_id, sr.submitted_at, s.title AS survey_title,
                                    g.first_name, g.last_name
                             FROM survey_responses sr
                             LEFT JOIN surveys s ON s.id = sr.survey_id
                             LEFT JOIN graduates g ON g.id = sr.graduate_id
                             ORDER BY sr.submitted_at DESC, sr.id DESC
                             LIMIT 5");

    foreach ($recentStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $name = trim((string) ($row['first_name'] ?? '') . ' ' . (string) ($row['last_name'] ?? ''));
        $link = '/admin/surveys/' . $row['survey_id'] . '/responses';
        if (!empty($row['graduate_id'])) {
            $link = '/admin/graduates?survey_id=' . (int) $row['survey_id']
                . '&graduate_id=' . (int) $row['graduate_id']
                . '&open_answers=1';
        }

        gradtrack_notifications_add(
            $notifications,
            'survey-response:' . $row['id'],
            'response',
            'New survey response',
            ($name !== '' ? $name : 'A graduate') . ' submitted "' . ($row['survey_title'] ?: 'a survey') . '".',
            $row['submitted_at'],
            $link
        );
    }
}

function gradtrack_notifications_add_registrar(PDO $db, array &$notifications): void
{
    $stmt = $db->query("SELECT g.id, g.first_name, g.last_name, g.created_at, p.code AS program_code
                       FROM graduates g
                       LEFT JOIN programs p ON p.id = g.program_id
                       ORDER BY g.created_at DESC, g.id DESC
                       LIMIT 5");

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $name = trim((string) $row['first_name'] . ' ' . (string) $row['last_name']);
        gradtrack_notifications_add(
            $notifications,
            'registrar-graduate:' . $row['id'],
            'graduate',
            'Graduate record added',
            $name . (($row['program_code'] ?? '') !== '' ? ' from ' . $row['program_code'] : '') . ' is in the registry.',
            $row['created_at'],
            '/admin/graduates'
        );
    }
}

function gradtrack_notifications_add_super_admin(PDO $db, array &$notifications, int $currentUserId): void
{
    $stmt = $db->prepare("SELECT id, full_name, username, role, created_at
                         FROM admin_users
                         WHERE id <> :id
                         ORDER BY created_at DESC, id DESC
                         LIMIT 5");
    $stmt->execute([':id' => $currentUserId]);

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $name = trim((string) ($row['full_name'] ?: $row['username']));
        gradtrack_notifications_add(
            $notifications,
            'admin-user:' . $row['id'],
            'user',
            'Admin account available',
            $name . ' has access as ' . str_replace('_', ' ', (string) $row['role']) . '.',
            $row['created_at'],
            '/admin/user-management'
        );
    }
}

function gradtrack_notifications_add_dean(PDO $db, array &$notifications, string $role): void
{
    $scopes = gradtrack_engagement_dean_program_scopes();
    if (!isset($scopes[$role])) {
        return;
    }

    $programCodes = $scopes[$role];

    $totalParams = [];
    $totalPlaceholders = gradtrack_notifications_program_placeholders($programCodes, $totalParams, 'total_program');
    $totalStmt = $db->prepare("SELECT COUNT(*) AS total
                              FROM graduates g
                              JOIN programs p ON p.id = g.program_id
                              WHERE p.code IN ($totalPlaceholders)");
    $totalStmt->execute($totalParams);
    $totalGraduates = (int) ($totalStmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

    $surveyStmt = $db->query("SELECT id, title, updated_at, created_at
                             FROM surveys
                             WHERE status = 'active'
                             ORDER BY updated_at DESC, id DESC
                             LIMIT 1");
    $survey = $surveyStmt->fetch(PDO::FETCH_ASSOC);

    if ($survey && $totalGraduates > 0) {
        $answerParams = [':survey_id' => (int) $survey['id']];
        $answerPlaceholders = gradtrack_notifications_program_placeholders($programCodes, $answerParams, 'answer_program');
        $answerStmt = $db->prepare("SELECT COUNT(DISTINCT sr.graduate_id) AS total
                                   FROM survey_responses sr
                                   JOIN graduates g ON g.id = sr.graduate_id
                                   JOIN programs p ON p.id = g.program_id
                                   WHERE sr.survey_id = :survey_id
                                     AND p.code IN ($answerPlaceholders)");
        $answerStmt->execute($answerParams);
        $answered = (int) ($answerStmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);
        $pending = max(0, $totalGraduates - $answered);

        if ($pending > 0) {
            gradtrack_notifications_add(
                $notifications,
                'dean-survey-pending:' . $role . ':' . $survey['id'] . ':' . $pending,
                'survey',
                'Program survey follow-up',
                $pending . ' graduate' . ($pending === 1 ? '' : 's') . ' in your program scope still need to answer "' . $survey['title'] . '".',
                $survey['updated_at'] ?: $survey['created_at'],
                '/admin/survey-status',
                'high'
            );
        }
    }

    $mentorParams = [];
    $mentorPlaceholders = gradtrack_notifications_program_placeholders($programCodes, $mentorParams, 'mentor_program');
    $mentorStmt = $db->prepare("SELECT m.id, m.created_at, g.first_name, g.last_name, p.code AS program_code
                               FROM mentors m
                               JOIN graduates g ON g.id = m.graduate_id
                               JOIN programs p ON p.id = g.program_id
                               WHERE m.approval_status = 'pending'
                                 AND p.code IN ($mentorPlaceholders)
                               ORDER BY m.created_at DESC, m.id DESC
                               LIMIT 5");
    $mentorStmt->execute($mentorParams);

    foreach ($mentorStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $name = trim((string) $row['first_name'] . ' ' . (string) $row['last_name']);
        gradtrack_notifications_add(
            $notifications,
            'mentor-approval:' . $row['id'],
            'approval',
            'Mentor approval needed',
            $name . ' from ' . $row['program_code'] . ' submitted a mentor profile.',
            $row['created_at'],
            '/admin/mentor-approvals',
            'high'
        );
    }

    $jobParams = [];
    $jobPlaceholders = gradtrack_notifications_program_placeholders($programCodes, $jobParams, 'job_program');
    $jobStmt = $db->prepare("SELECT jp.id, jp.title, jp.company, jp.created_at, p.code AS program_code
                            FROM job_posts jp
                            JOIN graduate_accounts ga ON ga.id = jp.posted_by_account_id
                            JOIN graduates g ON g.id = ga.graduate_id
                            JOIN programs p ON p.id = g.program_id
                            WHERE jp.approval_status = 'pending'
                              AND p.code IN ($jobPlaceholders)
                            ORDER BY jp.created_at DESC, jp.id DESC
                            LIMIT 5");
    $jobStmt->execute($jobParams);

    foreach ($jobStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        gradtrack_notifications_add(
            $notifications,
            'job-approval:' . $row['id'],
            'approval',
            'Job approval needed',
            '"' . $row['title'] . '" at ' . $row['company'] . ' is pending for ' . $row['program_code'] . '.',
            $row['created_at'],
            '/admin/job-approvals',
            'high'
        );
    }
}

function gradtrack_notifications_add_graduate(PDO $db, array &$notifications, array $user): void
{
    $accountId = (int) $user['account_id'];
    $graduateId = (int) $user['graduate_id'];

    $surveyStmt = $db->prepare("SELECT s.id, s.title, s.updated_at, s.created_at
                               FROM surveys s
                               WHERE s.status = 'active'
                                 AND NOT EXISTS (
                                    SELECT 1
                                    FROM survey_responses sr
                                    WHERE sr.survey_id = s.id
                                      AND sr.graduate_id = :graduate_id
                                 )
                               ORDER BY s.updated_at DESC, s.id DESC
                               LIMIT 3");
    $surveyStmt->execute([':graduate_id' => $graduateId]);

    foreach ($surveyStmt->fetchAll(PDO::FETCH_ASSOC) as $survey) {
        $token = gradtrack_notifications_date_token($survey['updated_at'] ?: $survey['created_at']);
        gradtrack_notifications_add(
            $notifications,
            'graduate-survey:' . $survey['id'] . ':' . $token,
            'survey',
            'Survey waiting for you',
            'Please answer "' . $survey['title'] . '" when you have time.',
            $survey['updated_at'] ?: $survey['created_at'],
            '/survey-verify?survey_id=' . $survey['id'],
            'high'
        );
    }

    $incomingStmt = $db->prepare("SELECT mr.id, mr.mentee_name, mr.topic, mr.requested_at
                                 FROM mentorship_requests mr
                                 JOIN mentors m ON m.id = mr.mentor_id
                                 WHERE m.graduate_account_id = :account_id
                                   AND mr.status = 'pending'
                                 ORDER BY mr.requested_at DESC, mr.id DESC
                                 LIMIT 5");
    $incomingStmt->execute([':account_id' => $accountId]);

    foreach ($incomingStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        gradtrack_notifications_add(
            $notifications,
            'mentorship-incoming:' . $row['id'],
            'mentorship',
            'New mentorship request',
            ($row['mentee_name'] ?: 'A graduate') . ' requested help' . (($row['topic'] ?? '') !== '' ? ' with ' . $row['topic'] : '') . '.',
            $row['requested_at'],
            '/graduate/portal?tab=requests',
            'high'
        );
    }

    $outgoingStmt = $db->prepare("SELECT mr.id, mr.status, mr.responded_at, mr.completed_at, mr.requested_at,
                                        g.first_name AS mentor_first_name, g.last_name AS mentor_last_name
                                 FROM mentorship_requests mr
                                 JOIN mentors m ON m.id = mr.mentor_id
                                 JOIN graduates g ON g.id = m.graduate_id
                                 WHERE mr.mentee_account_id = :account_id
                                   AND mr.status IN ('accepted','declined','completed','cancelled')
                                 ORDER BY COALESCE(mr.completed_at, mr.responded_at, mr.requested_at) DESC, mr.id DESC
                                 LIMIT 5");
    $outgoingStmt->execute([':account_id' => $accountId]);

    foreach ($outgoingStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $eventDate = $row['completed_at'] ?: ($row['responded_at'] ?: $row['requested_at']);
        $mentorName = trim((string) $row['mentor_first_name'] . ' ' . (string) $row['mentor_last_name']);
        gradtrack_notifications_add(
            $notifications,
            'mentorship-status:' . $row['id'] . ':' . $row['status'] . ':' . gradtrack_notifications_date_token($eventDate),
            'mentorship',
            'Mentorship request ' . $row['status'],
            ($mentorName !== '' ? $mentorName : 'Your mentor') . ' marked your request as ' . $row['status'] . '.',
            $eventDate,
            '/graduate/portal?tab=requests'
        );
    }

    $mentorStmt = $db->prepare("SELECT id, approval_status, approval_reviewed_at, approval_notes, updated_at, created_at
                               FROM mentors
                               WHERE graduate_account_id = :account_id
                               LIMIT 1");
    $mentorStmt->execute([':account_id' => $accountId]);
    $mentor = $mentorStmt->fetch(PDO::FETCH_ASSOC);

    if ($mentor) {
        $eventDate = $mentor['approval_reviewed_at'] ?: ($mentor['updated_at'] ?: $mentor['created_at']);
        gradtrack_notifications_add(
            $notifications,
            'mentor-profile-status:' . $mentor['id'] . ':' . $mentor['approval_status'] . ':' . gradtrack_notifications_date_token($eventDate),
            'approval',
            'Mentor profile ' . $mentor['approval_status'],
            ($mentor['approval_status'] === 'pending')
                ? 'Your mentor profile is waiting for dean approval.'
                : 'Your mentor profile was ' . $mentor['approval_status'] . '.',
            $eventDate,
            '/graduate/portal?tab=mentor_profile'
        );
    }

    $jobStmt = $db->prepare("SELECT id, title, company, approval_status, approval_reviewed_at, updated_at, created_at
                            FROM job_posts
                            WHERE posted_by_account_id = :account_id
                            ORDER BY updated_at DESC, id DESC
                            LIMIT 5");
    $jobStmt->execute([':account_id' => $accountId]);

    foreach ($jobStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $eventDate = $row['approval_reviewed_at'] ?: ($row['updated_at'] ?: $row['created_at']);
        gradtrack_notifications_add(
            $notifications,
            'job-post-status:' . $row['id'] . ':' . $row['approval_status'] . ':' . gradtrack_notifications_date_token($eventDate),
            'approval',
            'Job post ' . $row['approval_status'],
            '"' . $row['title'] . '" at ' . $row['company'] . ' is ' . $row['approval_status'] . '.',
            $eventDate,
            '/graduate/portal?tab=job_posting'
        );
    }
}

function gradtrack_notifications_current_user(PDO $db, string $audience = ''): array
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }

    if ($audience === 'graduate') {
        $graduate = gradtrack_current_graduate_user($db);
        if ($graduate) {
            return [
                'target_type' => 'graduate',
                'target_id' => (int) $graduate['account_id'],
                'role' => 'graduate',
                'user' => $graduate,
            ];
        }

        gradtrack_notifications_json_error(401, 'Graduate authentication required');
        return [];
    }

    if ($audience === 'admin') {
        if (isset($_SESSION['user_id'])) {
            return [
                'target_type' => 'admin',
                'target_id' => (int) $_SESSION['user_id'],
                'role' => (string) ($_SESSION['role'] ?? ''),
                'user' => [
                    'id' => (int) $_SESSION['user_id'],
                    'role' => (string) ($_SESSION['role'] ?? ''),
                ],
            ];
        }

        gradtrack_notifications_json_error(401, 'Admin authentication required');
        return [];
    }

    if (isset($_SESSION['user_id'])) {
        return [
            'target_type' => 'admin',
            'target_id' => (int) $_SESSION['user_id'],
            'role' => (string) ($_SESSION['role'] ?? ''),
            'user' => [
                'id' => (int) $_SESSION['user_id'],
                'role' => (string) ($_SESSION['role'] ?? ''),
            ],
        ];
    }

    $graduate = gradtrack_current_graduate_user($db);
    if ($graduate) {
        return [
            'target_type' => 'graduate',
            'target_id' => (int) $graduate['account_id'],
            'role' => 'graduate',
            'user' => $graduate,
        ];
    }

    gradtrack_notifications_json_error(401, 'Authentication required');
    return [];
}

function gradtrack_notifications_generate(PDO $db, array $auth): array
{
    $notifications = [];
    gradtrack_notifications_add_announcements($db, $notifications, $auth['target_type']);

    if ($auth['target_type'] === 'graduate') {
        gradtrack_notifications_add_graduate($db, $notifications, $auth['user']);
    } else {
        $role = (string) $auth['role'];

        if ($role === 'admin') {
            gradtrack_notifications_add_admin_surveys($db, $notifications);
        } elseif ($role === 'registrar') {
            gradtrack_notifications_add_registrar($db, $notifications);
        } elseif ($role === 'super_admin') {
            gradtrack_notifications_add_super_admin($db, $notifications, (int) $auth['target_id']);
        } else {
            gradtrack_notifications_add_dean($db, $notifications, $role);
        }
    }

    usort($notifications, function (array $left, array $right): int {
        $leftTime = strtotime((string) ($left['created_at'] ?? '')) ?: 0;
        $rightTime = strtotime((string) ($right['created_at'] ?? '')) ?: 0;

        if ($leftTime === $rightTime) {
            return strcmp($right['key'], $left['key']);
        }

        return $rightTime <=> $leftTime;
    });

    return $notifications;
}

function gradtrack_notifications_read_keys(PDO $db, string $targetType, int $targetId, array $keys): array
{
    if (count($keys) === 0) {
        return [];
    }

    $params = [
        ':target_type' => $targetType,
        ':target_id' => $targetId,
    ];
    $placeholders = [];
    foreach ($keys as $index => $key) {
        $placeholder = ':key_' . $index;
        $placeholders[] = $placeholder;
        $params[$placeholder] = $key;
    }

    $stmt = $db->prepare("SELECT notification_key
                         FROM notification_reads
                         WHERE target_type = :target_type
                           AND target_id = :target_id
                           AND notification_key IN (" . implode(', ', $placeholders) . ")");
    $stmt->execute($params);

    $read = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $read[(string) $row['notification_key']] = true;
    }

    return $read;
}

function gradtrack_notifications_apply_read_state(PDO $db, array $auth, array $notifications, int $limit): array
{
    $keys = array_values(array_unique(array_map(function (array $notification): string {
        return (string) $notification['key'];
    }, $notifications)));
    $readKeys = gradtrack_notifications_read_keys($db, $auth['target_type'], (int) $auth['target_id'], $keys);
    $unreadCount = 0;

    foreach ($notifications as &$notification) {
        $isRead = isset($readKeys[$notification['key']]);
        $notification['read'] = $isRead;
        if (!$isRead) {
            $unreadCount++;
        }
    }
    unset($notification);

    return [
        'notifications' => array_slice($notifications, 0, $limit),
        'unread_count' => $unreadCount,
    ];
}

function gradtrack_notifications_mark_read(PDO $db, string $targetType, int $targetId, array $keys): void
{
    $stmt = $db->prepare("INSERT INTO notification_reads (target_type, target_id, notification_key, read_at)
                         VALUES (:target_type, :target_id, :notification_key, NOW())
                         ON DUPLICATE KEY UPDATE read_at = NOW()");

    foreach ($keys as $key) {
        $cleanKey = substr(trim((string) $key), 0, 190);
        if ($cleanKey === '') {
            continue;
        }

        $stmt->execute([
            ':target_type' => $targetType,
            ':target_id' => $targetId,
            ':notification_key' => $cleanKey,
        ]);
    }
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    gradtrack_notifications_ensure_schema($db);
    gradtrack_ensure_engagement_approval_schema($db);
    $audience = isset($_GET['audience']) && in_array($_GET['audience'], ['admin', 'graduate'], true)
        ? (string) $_GET['audience']
        : '';
    $auth = gradtrack_notifications_current_user($db, $audience);

    if ($method === 'GET') {
        $limit = isset($_GET['limit']) ? min(50, max(1, (int) $_GET['limit'])) : 20;
        $notifications = gradtrack_notifications_generate($db, $auth);
        $payload = gradtrack_notifications_apply_read_state($db, $auth, $notifications, $limit);

        echo json_encode([
            'success' => true,
            'data' => $payload,
        ]);
        exit;
    }

    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            $data = [];
        }

        $action = trim((string) ($data['action'] ?? 'mark_read'));
        $keys = [];

        if ($action === 'mark_all_read') {
            if (isset($data['keys']) && is_array($data['keys'])) {
                $keys = $data['keys'];
            } else {
                $keys = array_map(function (array $notification): string {
                    return (string) $notification['key'];
                }, gradtrack_notifications_generate($db, $auth));
            }
        } else {
            $key = $data['key'] ?? null;
            if (is_string($key) && trim($key) !== '') {
                $keys = [$key];
            } elseif (isset($data['keys']) && is_array($data['keys'])) {
                $keys = $data['keys'];
            }
        }

        gradtrack_notifications_mark_read($db, $auth['target_type'], (int) $auth['target_id'], $keys);

        echo json_encode([
            'success' => true,
            'message' => 'Notifications updated',
        ]);
        exit;
    }

    gradtrack_notifications_json_error(405, 'Method not allowed');
} catch (Exception $e) {
    gradtrack_notifications_json_error(500, $e->getMessage());
}
