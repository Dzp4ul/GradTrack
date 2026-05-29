<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/survey_reminders.php';

if (PHP_SAPI !== 'cli') {
    header('Content-Type: application/json; charset=UTF-8');
}

function auto_reminder_is_cli(): bool
{
    return PHP_SAPI === 'cli';
}

function auto_reminder_response(int $statusCode, array $payload): void
{
    if (!auto_reminder_is_cli()) {
        http_response_code($statusCode);
    }

    echo json_encode($payload, JSON_PRETTY_PRINT) . PHP_EOL;
    exit($statusCode >= 400 ? 1 : 0);
}

function auto_reminder_arg(string $name, $default = null)
{
    if (!auto_reminder_is_cli()) {
        return $_GET[$name] ?? $_POST[$name] ?? $default;
    }

    global $argv;
    $prefix = '--' . $name . '=';
    foreach ($argv ?? [] as $arg) {
        if ($arg === '--' . $name) {
            return true;
        }
        if (strpos($arg, $prefix) === 0) {
            return substr($arg, strlen($prefix));
        }
    }

    return $default;
}

function auto_reminder_authorize(): void
{
    if (auto_reminder_is_cli()) {
        return;
    }

    if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'POST'], true)) {
        auto_reminder_response(405, ['success' => false, 'error' => 'Method not allowed']);
    }

    $expectedSecret = gradtrack_survey_reminder_clean_text(getenv('SURVEY_REMINDER_CRON_SECRET') ?: '');
    if ($expectedSecret === '') {
        auto_reminder_response(403, [
            'success' => false,
            'error' => 'Run this reminder from PHP CLI or set SURVEY_REMINDER_CRON_SECRET for HTTP scheduling.',
        ]);
    }

    $providedSecret = gradtrack_survey_reminder_clean_text(
        $_SERVER['HTTP_X_CRON_SECRET'] ?? $_GET['secret'] ?? $_POST['secret'] ?? ''
    );

    if (!hash_equals($expectedSecret, $providedSecret)) {
        auto_reminder_response(403, ['success' => false, 'error' => 'Invalid reminder secret']);
    }
}

function auto_reminder_setting(PDO $db, string $key, string $default): string
{
    try {
        $stmt = $db->prepare("SELECT setting_value FROM system_settings WHERE setting_key = :key LIMIT 1");
        $stmt->execute([':key' => $key]);
        $value = $stmt->fetchColumn();
        $value = gradtrack_survey_reminder_clean_text($value);

        return $value !== '' ? $value : $default;
    } catch (Throwable $ignored) {
        return $default;
    }
}

function auto_reminder_int_setting(PDO $db, string $key, int $default, int $min, int $max): int
{
    $envKey = strtoupper($key);
    $raw = getenv($envKey);
    if ($key === 'survey_reminder_days') {
        $raw = getenv('SURVEY_REMINDER_INTERVAL_DAYS') ?: $raw;
    }
    $raw = $raw ?: auto_reminder_setting($db, $key, (string) $default);
    $value = (int) $raw;
    if ($value < $min) {
        return $min;
    }
    if ($value > $max) {
        return $max;
    }
    return $value;
}

function auto_reminder_bool_setting(PDO $db, string $key, bool $default): bool
{
    $raw = getenv(strtoupper($key));
    if ($raw !== false && gradtrack_survey_reminder_clean_text($raw) !== '') {
        return gradtrack_survey_reminder_bool($raw, $default);
    }

    return gradtrack_survey_reminder_bool(auto_reminder_setting($db, $key, $default ? 'true' : 'false'), $default);
}

function auto_reminder_default_message(int $intervalDays): string
{
    return 'Please complete the Graduate Tracer Study Survey. Your response helps Norzagaray College improve its programs and support graduates with better alumni services. We will send this reminder only once every '
        . $intervalDays
        . ' day'
        . ($intervalDays === 1 ? '' : 's')
        . ' while your response is still pending.';
}

function auto_reminder_load_recipients(PDO $db, int $intervalDays, int $limit): array
{
    $sql = "
        SELECT
            s.id AS survey_id,
            s.title AS survey_title,
            s.created_at AS survey_created_at,
            s.updated_at AS survey_updated_at,
            g.id AS graduate_id,
            g.student_id,
            g.first_name,
            g.last_name,
            g.email,
            p.code AS program_code,
            MAX(rl.sent_at) AS last_reminded_at
        FROM surveys s
        CROSS JOIN graduates g
        LEFT JOIN programs p ON p.id = g.program_id
        LEFT JOIN survey_responses sr
            ON sr.survey_id = s.id
            AND sr.graduate_id = g.id
        LEFT JOIN survey_reminder_logs rl
            ON rl.survey_id = s.id
            AND rl.graduate_id = g.id
            AND rl.status = 'sent'
        WHERE s.status = 'active'
          AND sr.id IS NULL
          AND g.email IS NOT NULL
          AND TRIM(g.email) <> ''
        GROUP BY
            s.id,
            s.title,
            s.created_at,
            s.updated_at,
            g.id,
            g.student_id,
            g.first_name,
            g.last_name,
            g.email,
            p.code
        HAVING last_reminded_at IS NULL
            OR last_reminded_at <= DATE_SUB(NOW(), INTERVAL {$intervalDays} DAY)
        ORDER BY
            CASE WHEN last_reminded_at IS NULL THEN 0 ELSE 1 END ASC,
            last_reminded_at ASC,
            s.updated_at DESC,
            g.last_name ASC,
            g.first_name ASC
        LIMIT :limit
    ";

    $stmt = $db->prepare($sql);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

auto_reminder_authorize();

$database = new Database();
$db = $database->getConnection();

try {
    gradtrack_survey_reminder_ensure_log_table($db);

    $emailEnabled = auto_reminder_bool_setting($db, 'enable_email_notifications', true);
    if (!$emailEnabled) {
        auto_reminder_response(200, [
            'success' => true,
            'message' => 'Email notifications are disabled in system settings.',
            'counts' => ['eligible' => 0, 'sent' => 0, 'failed' => 0, 'skipped' => 0],
        ]);
    }

    $intervalDays = auto_reminder_int_setting($db, 'survey_reminder_days', 3, 1, 365);
    $limit = (int) auto_reminder_arg('limit', getenv('SURVEY_REMINDER_BATCH_LIMIT') ?: 100);
    $limit = max(1, min(5000, $limit));
    $dryRun = gradtrack_survey_reminder_bool(auto_reminder_arg('dry-run', auto_reminder_arg('dry_run', false)), false);

    $subject = gradtrack_survey_reminder_clean_text(
        auto_reminder_arg('subject', getenv('SURVEY_REMINDER_SUBJECT') ?: 'Reminder: Complete your Graduate Tracer Study Survey')
    );
    $message = gradtrack_survey_reminder_clean_text(
        auto_reminder_arg('message', getenv('SURVEY_REMINDER_MESSAGE') ?: auto_reminder_default_message($intervalDays))
    );

    $recipients = auto_reminder_load_recipients($db, $intervalDays, $limit);
    $sent = [];
    $failed = [];
    $skipped = [];

    if ($dryRun) {
        auto_reminder_response(200, [
            'success' => true,
            'message' => 'Dry run finished. No emails were sent.',
            'settings' => [
                'interval_days' => $intervalDays,
                'limit' => $limit,
            ],
            'counts' => [
                'eligible' => count($recipients),
                'sent' => 0,
                'failed' => 0,
                'skipped' => 0,
            ],
            'eligible' => array_map(static function ($recipient) {
                return [
                    'survey_id' => (int) $recipient['survey_id'],
                    'graduate_id' => (int) $recipient['graduate_id'],
                    'email' => $recipient['email'],
                    'last_reminded_at' => $recipient['last_reminded_at'],
                ];
            }, $recipients),
        ]);
    }

    if (empty($recipients)) {
        auto_reminder_response(200, [
            'success' => true,
            'message' => 'No graduates are due for an automatic survey reminder.',
            'settings' => [
                'interval_days' => $intervalDays,
                'limit' => $limit,
            ],
            'counts' => ['eligible' => 0, 'sent' => 0, 'failed' => 0, 'skipped' => 0],
        ]);
    }

    $mailer = gradtrack_survey_reminder_create_mailer();

    foreach ($recipients as $recipient) {
        $email = gradtrack_survey_reminder_clean_text($recipient['email'] ?? '');
        $survey = [
            'id' => (int) $recipient['survey_id'],
            'title' => (string) $recipient['survey_title'],
        ];
        $graduate = [
            'id' => (int) $recipient['graduate_id'],
            'first_name' => $recipient['first_name'] ?? '',
            'last_name' => $recipient['last_name'] ?? '',
            'program_code' => $recipient['program_code'] ?? '',
        ];

        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $skipped[] = [
                'survey_id' => (int) $recipient['survey_id'],
                'graduate_id' => (int) $recipient['graduate_id'],
                'reason' => 'Missing or invalid email address',
            ];
            gradtrack_survey_reminder_log($db, (int) $recipient['survey_id'], (int) $recipient['graduate_id'], $email, $subject, 'auto', 'skipped', 'Missing or invalid email address');
            continue;
        }

        try {
            $surveyLink = gradtrack_survey_reminder_survey_link($survey);
            $mailer->clearAddresses();
            $mailer->addAddress($email, gradtrack_survey_reminder_graduate_name($graduate));
            $mailer->Subject = $subject;
            $mailer->isHTML(true);
            $mailer->Body = gradtrack_survey_reminder_html($graduate, $survey, $message, $surveyLink);
            $mailer->AltBody = gradtrack_survey_reminder_text($graduate, $survey, $message, $surveyLink);
            $mailer->send();

            $sent[] = [
                'survey_id' => (int) $recipient['survey_id'],
                'graduate_id' => (int) $recipient['graduate_id'],
                'email' => $email,
            ];
            gradtrack_survey_reminder_log($db, (int) $recipient['survey_id'], (int) $recipient['graduate_id'], $email, $subject, 'auto', 'sent', null, date('Y-m-d H:i:s'));
        } catch (Throwable $exception) {
            $failed[] = [
                'survey_id' => (int) $recipient['survey_id'],
                'graduate_id' => (int) $recipient['graduate_id'],
                'email' => $email,
                'error' => $exception->getMessage(),
            ];
            gradtrack_survey_reminder_log($db, (int) $recipient['survey_id'], (int) $recipient['graduate_id'], $email, $subject, 'auto', 'failed', $exception->getMessage());
        }
    }

    $mailer->smtpClose();

    auto_reminder_response(count($failed) === 0 ? 200 : 207, [
        'success' => count($failed) === 0,
        'message' => 'Automatic survey reminder processing finished.',
        'settings' => [
            'interval_days' => $intervalDays,
            'limit' => $limit,
        ],
        'counts' => [
            'eligible' => count($recipients),
            'sent' => count($sent),
            'failed' => count($failed),
            'skipped' => count($skipped),
        ],
        'sent' => $sent,
        'failed' => $failed,
        'skipped' => $skipped,
    ]);
} catch (Throwable $exception) {
    auto_reminder_response(500, [
        'success' => false,
        'error' => $exception->getMessage(),
    ]);
}
