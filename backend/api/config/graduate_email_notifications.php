<?php
declare(strict_types=1);

require_once __DIR__ . '/email.php';

if (!function_exists('gradtrack_email_notification_ensure_schema')) {
    function gradtrack_email_notification_ensure_schema(PDO $db): void
    {
        if (!gradtrack_runtime_schema_changes_allowed()) {
            return;
        }

        $db->exec("CREATE TABLE IF NOT EXISTS email_notification_deliveries (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            notification_type VARCHAR(64) NOT NULL,
            entity_id BIGINT UNSIGNED NOT NULL,
            recipient_email VARCHAR(255) NOT NULL,
            recipient_name VARCHAR(255) NULL,
            subject VARCHAR(255) NOT NULL,
            status ENUM('processing','sent','failed') NOT NULL DEFAULT 'processing',
            error_message TEXT NULL,
            reserved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            sent_at DATETIME NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_email_notification_entity (notification_type, entity_id),
            INDEX idx_email_notification_status (status, updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }
}

if (!function_exists('gradtrack_email_notification_reserve')) {
    function gradtrack_email_notification_reserve(
        PDO $db,
        string $notificationType,
        int $entityId,
        string $email,
        string $recipientName,
        string $subject
    ): bool {
        gradtrack_email_notification_ensure_schema($db);

        try {
            $stmt = $db->prepare("INSERT INTO email_notification_deliveries
                (notification_type, entity_id, recipient_email, recipient_name, subject, status)
                VALUES (:notification_type, :entity_id, :recipient_email, :recipient_name, :subject, 'processing')");
            $stmt->execute([
                ':notification_type' => substr($notificationType, 0, 64),
                ':entity_id' => $entityId,
                ':recipient_email' => substr($email, 0, 255),
                ':recipient_name' => substr($recipientName, 0, 255),
                ':subject' => substr($subject, 0, 255),
            ]);
            return true;
        } catch (PDOException $error) {
            if ((string) $error->getCode() === '23000') {
                return false;
            }
            throw $error;
        }
    }
}

if (!function_exists('gradtrack_email_notification_complete')) {
    function gradtrack_email_notification_complete(
        PDO $db,
        string $notificationType,
        int $entityId,
        string $status,
        ?string $errorMessage = null
    ): void {
        $status = $status === 'sent' ? 'sent' : 'failed';
        $stmt = $db->prepare("UPDATE email_notification_deliveries
            SET status = :status,
                error_message = :error_message,
                sent_at = CASE WHEN :sent_status = 'sent' THEN CURRENT_TIMESTAMP ELSE NULL END
            WHERE notification_type = :notification_type
              AND entity_id = :entity_id");
        $stmt->execute([
            ':status' => $status,
            ':error_message' => $errorMessage,
            ':sent_status' => $status,
            ':notification_type' => $notificationType,
            ':entity_id' => $entityId,
        ]);
    }
}

if (!function_exists('gradtrack_email_notification_log_failure')) {
    function gradtrack_email_notification_log_failure(string $context, string $reason): void
    {
        $safeContext = preg_replace('/[^A-Za-z0-9_. -]/', '_', $context) ?: 'Email notification failed';
        $safeReason = str_replace(["\r", "\n"], ' ', substr($reason, 0, 2000));
        error_log('[GradTrack] ' . $safeContext . ': ' . $safeReason);
    }
}

if (!function_exists('gradtrack_email_notification_send_once')) {
    function gradtrack_email_notification_send_once(
        PDO $db,
        string $notificationType,
        int $entityId,
        string $email,
        string $recipientName,
        array $message,
        string $failureLogContext,
        ?callable $sender = null
    ): array {
        $subject = gradtrack_email_clean_text($message['subject'] ?? '');

        try {
            $reserved = gradtrack_email_notification_reserve(
                $db,
                $notificationType,
                $entityId,
                $email,
                $recipientName,
                $subject
            );
        } catch (Throwable $error) {
            $reason = gradtrack_email_safe_error_message($error);
            gradtrack_email_notification_log_failure($failureLogContext, $reason);
            return ['attempted' => false, 'sent' => false, 'duplicate' => false];
        }

        if (!$reserved) {
            return ['attempted' => false, 'sent' => false, 'duplicate' => true];
        }

        try {
            if ($sender !== null) {
                $sender($email, $recipientName, $message);
            } else {
                gradtrack_email_send($email, $recipientName, $message);
            }
            gradtrack_email_notification_complete($db, $notificationType, $entityId, 'sent');
            return ['attempted' => true, 'sent' => true, 'duplicate' => false];
        } catch (Throwable $error) {
            $reason = gradtrack_email_safe_error_message($error);
            try {
                gradtrack_email_notification_complete($db, $notificationType, $entityId, 'failed', $reason);
            } catch (Throwable $logError) {
                gradtrack_email_notification_log_failure($failureLogContext . ' (delivery log update also failed)', gradtrack_email_safe_error_message($logError));
            }
            gradtrack_email_notification_log_failure($failureLogContext, $reason);
            return ['attempted' => true, 'sent' => false, 'duplicate' => false];
        }
    }
}

if (!function_exists('gradtrack_graduate_email_full_name')) {
    function gradtrack_graduate_email_full_name(array $graduate): string
    {
        $parts = [
            $graduate['first_name'] ?? '',
            $graduate['middle_name'] ?? '',
            $graduate['last_name'] ?? '',
            $graduate['name_extension'] ?? '',
        ];
        $name = trim(implode(' ', array_filter($parts, static fn ($part): bool => trim((string) $part) !== '')));
        return $name !== '' ? $name : 'Graduate';
    }
}

if (!function_exists('gradtrack_graduate_account_is_approved')) {
    function gradtrack_graduate_account_is_approved(array $account): bool
    {
        return strtolower((string) ($account['account_status'] ?? $account['status'] ?? '')) === 'active'
            && strtolower((string) ($account['alumni_verification_status'] ?? '')) === 'approved';
    }
}

if (!function_exists('gradtrack_survey_notification_answer_email')) {
    function gradtrack_survey_notification_answer_email(PDO $db, int $surveyResponseId): string
    {
        $stmt = $db->prepare("SELECT sra.answer_value
            FROM survey_response_answers sra
            JOIN survey_questions sq ON sq.id = sra.survey_question_id
            WHERE sra.survey_response_id = :response_id
              AND sra.is_canonical = 1
              AND sq.analytics_key = 'email_address'
            ORDER BY sra.id
            LIMIT 1");
        $stmt->execute([':response_id' => $surveyResponseId]);
        $storedValue = $stmt->fetchColumn();
        if ($storedValue === false || $storedValue === null) {
            return '';
        }

        $decoded = json_decode((string) $storedValue, true);
        $email = is_string($decoded) ? $decoded : (string) $storedValue;
        return strtolower(gradtrack_email_clean_text($email));
    }
}

if (!function_exists('gradtrack_send_survey_submission_notification')) {
    function gradtrack_send_survey_submission_notification(
        PDO $db,
        int $surveyResponseId,
        int $graduateId
    ): array {
        try {
            $stmt = $db->prepare("SELECT
                    g.first_name, g.middle_name, g.last_name, g.name_extension
                FROM graduates g
                WHERE g.id = :graduate_id
                LIMIT 1");
            $stmt->execute([':graduate_id' => $graduateId]);
            $graduate = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$graduate) {
                gradtrack_email_notification_log_failure(
                    'Survey saved successfully but confirmation email failed',
                    'Graduate record was not found.'
                );
                return ['attempted' => false, 'sent' => false, 'duplicate' => false];
            }

            // The submitted survey answer is authoritative for this confirmation.
            // Do not fall back to the registrar-maintained graduate email or account email.
            $email = gradtrack_survey_notification_answer_email($db, $surveyResponseId);
            $name = gradtrack_graduate_email_full_name($graduate);
            $baseUrl = gradtrack_frontend_url();
            $message = gradtrack_email_survey_submitted_message(
                $name,
                $baseUrl . '/graduate/portal?tab=my_profile',
                $baseUrl . '/graduate/signin'
            );

            return gradtrack_email_notification_send_once(
                $db,
                'graduate_survey_submitted',
                $surveyResponseId,
                $email,
                $name,
                $message,
                'Survey saved successfully but confirmation email failed'
            );
        } catch (Throwable $error) {
            gradtrack_email_notification_log_failure(
                'Survey saved successfully but confirmation email failed',
                gradtrack_email_safe_error_message($error)
            );
            return ['attempted' => false, 'sent' => false, 'duplicate' => false];
        }
    }
}

if (!function_exists('gradtrack_send_registration_approved_notification')) {
    function gradtrack_send_registration_approved_notification(PDO $db, array $account): array
    {
        $accountId = (int) ($account['account_id'] ?? 0);
        $email = strtolower(gradtrack_email_clean_text($account['email'] ?? ''));
        $name = gradtrack_graduate_email_full_name($account);

        try {
            if ($accountId <= 0) {
                throw new InvalidArgumentException('Graduate account ID is missing.');
            }

            $signinUrl = gradtrack_frontend_url() . '/graduate/signin';
            $message = gradtrack_email_account_approved_message($name, $signinUrl);

            return gradtrack_email_notification_send_once(
                $db,
                'graduate_registration_approved',
                $accountId,
                $email,
                $name,
                $message,
                'Registration approved successfully but approval email failed'
            );
        } catch (Throwable $error) {
            gradtrack_email_notification_log_failure(
                'Registration approved successfully but approval email failed',
                gradtrack_email_safe_error_message($error)
            );
            return ['attempted' => false, 'sent' => false, 'duplicate' => false];
        }
    }
}
