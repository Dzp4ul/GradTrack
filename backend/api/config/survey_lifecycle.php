<?php
declare(strict_types=1);

require_once __DIR__ . '/audit_trail.php';

const GRADTRACK_SURVEY_TIMEZONE = 'Asia/Manila';

if (!function_exists('gradtrack_survey_now')) {
    function gradtrack_survey_now(): DateTimeImmutable
    {
        return new DateTimeImmutable('now', new DateTimeZone(GRADTRACK_SURVEY_TIMEZONE));
    }
}

if (!function_exists('gradtrack_survey_parse_deadline')) {
    function gradtrack_survey_parse_deadline($value): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        $text = trim((string) $value);
        $text = str_replace('T', ' ', $text);
        if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $text) === 1) {
            $text .= ':00';
        }
        if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $text) !== 1) {
            throw new InvalidArgumentException('Survey deadline must include a valid date and time.');
        }

        $timezone = new DateTimeZone(GRADTRACK_SURVEY_TIMEZONE);
        $deadline = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $text, $timezone);
        $errors = DateTimeImmutable::getLastErrors();
        if (
            $deadline === false
            || ($errors !== false && ((int) $errors['warning_count'] > 0 || (int) $errors['error_count'] > 0))
            || $deadline->format('Y-m-d H:i:s') !== $text
        ) {
            throw new InvalidArgumentException('Survey deadline must include a valid date and time.');
        }

        return $deadline->format('Y-m-d H:i:s');
    }
}

if (!function_exists('gradtrack_survey_deadline_reached')) {
    function gradtrack_survey_deadline_reached(?string $deadline, ?DateTimeImmutable $now = null): bool
    {
        if ($deadline === null || trim($deadline) === '') return false;
        $timezone = new DateTimeZone(GRADTRACK_SURVEY_TIMEZONE);
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', trim($deadline), $timezone);
        if ($parsed === false) return true;
        return $parsed <= ($now ?? gradtrack_survey_now());
    }
}

if (!function_exists('gradtrack_survey_completion_message')) {
    function gradtrack_survey_completion_message(?string $reason): string
    {
        return match ((string) $reason) {
            'deadline_reached' => 'This survey has been completed because its deadline has passed.',
            'target_reached' => 'This survey has been completed because its respondent target has been reached.',
            'program_targets_reached' => 'This survey has been completed because all program respondent targets have been reached.',
            'manual' => 'This survey has been completed by the Research Coordinator.',
            default => 'This survey is no longer accepting responses.',
        };
    }
}

if (!function_exists('gradtrack_survey_program_targets')) {
    function gradtrack_survey_program_targets(PDO $db, int $surveyId): array
    {
        $stmt = $db->prepare(
            'SELECT target.program_id, target.target_responses, program.code, program.name
               FROM survey_program_targets target
               JOIN programs program ON program.id = target.program_id
              WHERE target.survey_id = :survey_id
              ORDER BY program.name ASC, program.id ASC'
        );
        $stmt->execute([':survey_id' => $surveyId]);
        return array_map(static fn (array $row): array => [
            'program_id' => (int) $row['program_id'],
            'program_code' => (string) $row['code'],
            'program_name' => (string) $row['name'],
            'target' => (int) $row['target_responses'],
        ], $stmt->fetchAll(PDO::FETCH_ASSOC));
    }
}

if (!function_exists('gradtrack_survey_progress')) {
    function gradtrack_survey_progress(PDO $db, int $surveyId, ?array $survey = null): array
    {
        if ($survey === null) {
            $stmt = $db->prepare(
                'SELECT id, target_type, total_response_target, target_completion_suppressed,
                        status, deadline_at, completion_reason, completed_at
                   FROM surveys WHERE id = :id LIMIT 1'
            );
            $stmt->execute([':id' => $surveyId]);
            $survey = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        }

        $countStmt = $db->prepare(
            'SELECT COUNT(DISTINCT response.graduate_id)
               FROM survey_responses response
               JOIN graduates graduate
                 ON graduate.id = response.graduate_id
                AND graduate.archived_at IS NULL
              WHERE response.survey_id = :survey_id
                AND response.graduate_id IS NOT NULL
                AND response.submitted_at IS NOT NULL'
        );
        $countStmt->execute([':survey_id' => $surveyId]);
        $validResponses = (int) $countStmt->fetchColumn();

        $targetType = in_array(($survey['target_type'] ?? 'none'), ['none', 'total', 'program'], true)
            ? (string) $survey['target_type']
            : 'none';
        $totalTarget = $targetType === 'total' && (int) ($survey['total_response_target'] ?? 0) > 0
            ? (int) $survey['total_response_target']
            : null;
        $programProgress = [];
        $configuredTarget = $totalTarget;
        $targetProgressCount = $totalTarget !== null ? min($validResponses, $totalTarget) : null;
        $targetReached = $totalTarget !== null && $validResponses >= $totalTarget;

        if ($targetType === 'program') {
            $programStmt = $db->prepare(
                'SELECT target.program_id,
                        program.code AS program_code,
                        program.name AS program_name,
                        target.target_responses AS target,
                        COUNT(DISTINCT response.graduate_id) AS submitted
                   FROM survey_program_targets target
                   JOIN programs program ON program.id = target.program_id
              LEFT JOIN graduates graduate
                     ON graduate.program_id = target.program_id
                    AND graduate.archived_at IS NULL
              LEFT JOIN survey_responses response
                     ON response.graduate_id = graduate.id
                    AND response.survey_id = target.survey_id
                    AND response.submitted_at IS NOT NULL
                  WHERE target.survey_id = :survey_id
               GROUP BY target.program_id, program.code, program.name, target.target_responses
               ORDER BY program.name ASC, target.program_id ASC'
            );
            $programStmt->execute([':survey_id' => $surveyId]);
            $rows = $programStmt->fetchAll(PDO::FETCH_ASSOC);
            $configuredTarget = 0;
            $targetProgressCount = 0;
            $targetReached = $rows !== [];
            foreach ($rows as $row) {
                $target = (int) $row['target'];
                $submitted = (int) $row['submitted'];
                $configuredTarget += $target;
                $targetProgressCount += min($submitted, $target);
                $reached = $submitted >= $target;
                $targetReached = $targetReached && $reached;
                $programProgress[] = [
                    'program_id' => (int) $row['program_id'],
                    'program_code' => (string) $row['program_code'],
                    'program_name' => (string) $row['program_name'],
                    'target' => $target,
                    'submitted' => $submitted,
                    'remaining' => max(0, $target - $submitted),
                    'progress_percent' => round(min(100, ($submitted / $target) * 100), 1),
                    'reached' => $reached,
                ];
            }
        }

        $remaining = $configuredTarget !== null ? max(0, $configuredTarget - (int) $targetProgressCount) : null;
        $percent = $configuredTarget !== null && $configuredTarget > 0
            ? round(min(100, ((int) $targetProgressCount / $configuredTarget) * 100), 1)
            : null;

        return [
            'target_type' => $targetType,
            'configured_target' => $configuredTarget,
            'total_target' => $totalTarget,
            'valid_responses' => $validResponses,
            'target_progress_count' => $targetProgressCount,
            'remaining' => $remaining,
            'progress_percent' => $percent,
            'target_reached' => $targetReached,
            'target_completion_suppressed' => (bool) ($survey['target_completion_suppressed'] ?? false),
            'programs' => $programProgress,
        ];
    }
}

if (!function_exists('gradtrack_survey_completion_reason')) {
    function gradtrack_survey_completion_reason(
        array $survey,
        array $progress,
        ?DateTimeImmutable $now = null
    ): ?string {
        if (($survey['status'] ?? '') !== 'active' || !empty($survey['archived_at'])) return null;
        if (gradtrack_survey_deadline_reached($survey['deadline_at'] ?? null, $now)) {
            return 'deadline_reached';
        }
        if ((bool) ($survey['target_completion_suppressed'] ?? false)) return null;
        if (($progress['target_type'] ?? 'none') === 'total' && ($progress['target_reached'] ?? false)) {
            return 'target_reached';
        }
        if (($progress['target_type'] ?? 'none') === 'program' && ($progress['target_reached'] ?? false)) {
            return 'program_targets_reached';
        }
        return null;
    }
}

if (!function_exists('gradtrack_survey_record_auto_completion')) {
    function gradtrack_survey_record_auto_completion(PDO $db, int $surveyId, string $title, string $reason): void
    {
        try {
            $stmt = $db->prepare(
                'INSERT INTO audit_trail
                    (user_id, user_name, user_role, action, module, description, record_id, new_values)
                 VALUES
                    (NULL, :user_name, :user_role, :action, :module, :description, :record_id, :new_values)'
            );
            $stmt->execute([
                ':user_name' => 'System Scheduler',
                ':user_role' => 'admin',
                ':action' => 'Auto Complete',
                ':module' => 'Survey Management',
                ':description' => "Automatically completed survey {$surveyId} ({$title}) because {$reason}.",
                ':record_id' => (string) $surveyId,
                ':new_values' => json_encode([
                    'status' => 'completed',
                    'completion_reason' => $reason,
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
        } catch (Throwable $exception) {
            error_log('Survey automatic-completion audit failed: ' . $exception->getMessage());
        }
    }
}

if (!function_exists('gradtrack_enforce_survey_completion')) {
    /**
     * Reconcile active survey state. When called inside a transaction, the
     * caller owns commit/rollback. The survey row lock serializes submissions,
     * target evaluation, manual updates, and scheduler runs.
     */
    function gradtrack_enforce_survey_completion(
        PDO $db,
        ?int $surveyId = null,
        ?DateTimeImmutable $now = null
    ): array {
        if ($surveyId === null) {
            $ids = array_map('intval', $db->query(
                "SELECT id FROM surveys WHERE status = 'active' AND archived_at IS NULL ORDER BY id ASC"
            )->fetchAll(PDO::FETCH_COLUMN));
            $results = [];
            foreach ($ids as $id) {
                $results[] = gradtrack_enforce_survey_completion($db, $id, $now);
            }
            return $results;
        }

        $ownsTransaction = !$db->inTransaction();
        if ($ownsTransaction) $db->beginTransaction();
        try {
            $stmt = $db->prepare('SELECT * FROM surveys WHERE id = :id LIMIT 1 FOR UPDATE');
            $stmt->execute([':id' => $surveyId]);
            $survey = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$survey) {
                if ($ownsTransaction) $db->commit();
                return ['survey' => null, 'progress' => null, 'transitioned' => false, 'reason' => null];
            }

            $progress = gradtrack_survey_progress($db, $surveyId, $survey);
            $reason = gradtrack_survey_completion_reason($survey, $progress, $now);
            $transitioned = false;
            if ($reason !== null) {
                $update = $db->prepare(
                    "UPDATE surveys
                        SET status = 'completed',
                            completion_reason = :completion_reason,
                            completed_at = NOW(),
                            modified_by = 'System Scheduler',
                            modified_at = NOW()
                      WHERE id = :id AND status = 'active' AND archived_at IS NULL"
                );
                $update->execute([':completion_reason' => $reason, ':id' => $surveyId]);
                $transitioned = $update->rowCount() === 1;
                if ($transitioned) {
                    $survey['status'] = 'completed';
                    $survey['completion_reason'] = $reason;
                    $survey['completed_at'] = ($now ?? gradtrack_survey_now())->format('Y-m-d H:i:s');
                    gradtrack_survey_record_auto_completion(
                        $db,
                        $surveyId,
                        (string) ($survey['title'] ?? ''),
                        $reason
                    );
                }
            }

            if ($ownsTransaction) $db->commit();
            return [
                'survey' => $survey,
                'progress' => $progress,
                'transitioned' => $transitioned,
                'reason' => $reason,
            ];
        } catch (Throwable $exception) {
            if ($ownsTransaction && $db->inTransaction()) $db->rollBack();
            throw $exception;
        }
    }
}

if (!function_exists('gradtrack_survey_validate_target_configuration')) {
    function gradtrack_survey_validate_target_configuration(PDO $db, array $data): array
    {
        $targetType = strtolower(trim((string) ($data['target_type'] ?? 'none')));
        if (!in_array($targetType, ['none', 'total', 'program'], true)) {
            throw new InvalidArgumentException('Target type must be No Target, Total Target, or Per Program.');
        }

        $totalTarget = null;
        $programTargets = [];
        if ($targetType === 'total') {
            $rawTarget = $data['total_response_target'] ?? $data['total_target'] ?? null;
            if (filter_var($rawTarget, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) === false) {
                throw new InvalidArgumentException('Total response target must be a positive whole number.');
            }
            $totalTarget = (int) $rawTarget;
        } elseif ($targetType === 'program') {
            $rawTargets = $data['program_targets'] ?? [];
            if (!is_array($rawTargets)) {
                throw new InvalidArgumentException('Program targets must be provided as a list.');
            }
            foreach ($rawTargets as $key => $rawTarget) {
                $programId = 0;
                $targetValue = null;
                if (is_array($rawTarget)) {
                    $programId = (int) ($rawTarget['program_id'] ?? $key);
                    $targetValue = $rawTarget['target'] ?? $rawTarget['target_responses'] ?? null;
                } else {
                    $programId = (int) $key;
                    $targetValue = $rawTarget;
                }
                if ($targetValue === null || trim((string) $targetValue) === '') continue;
                if ($programId <= 0 || filter_var($targetValue, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) === false) {
                    throw new InvalidArgumentException('Each configured program target must be a positive whole number.');
                }
                $programTargets[$programId] = (int) $targetValue;
            }
            if ($programTargets === []) {
                throw new InvalidArgumentException('Configure at least one program target or select No Target.');
            }

            $placeholders = implode(',', array_fill(0, count($programTargets), '?'));
            $programStmt = $db->prepare("SELECT id FROM programs WHERE id IN ({$placeholders})");
            $programStmt->execute(array_keys($programTargets));
            $knownIds = array_map('intval', $programStmt->fetchAll(PDO::FETCH_COLUMN));
            sort($knownIds);
            $submittedIds = array_map('intval', array_keys($programTargets));
            sort($submittedIds);
            if ($knownIds !== $submittedIds) {
                throw new InvalidArgumentException('One or more selected graduate programs no longer exist.');
            }
        }

        ksort($programTargets);
        return [
            'target_type' => $targetType,
            'total_response_target' => $totalTarget,
            'program_targets' => $programTargets,
        ];
    }
}

if (!function_exists('gradtrack_survey_replace_program_targets')) {
    function gradtrack_survey_replace_program_targets(PDO $db, int $surveyId, array $programTargets): void
    {
        $db->prepare('DELETE FROM survey_program_targets WHERE survey_id = :survey_id')
            ->execute([':survey_id' => $surveyId]);
        if ($programTargets === []) return;
        $insert = $db->prepare(
            'INSERT INTO survey_program_targets (survey_id, program_id, target_responses)
             VALUES (:survey_id, :program_id, :target_responses)'
        );
        foreach ($programTargets as $programId => $target) {
            $insert->execute([
                ':survey_id' => $surveyId,
                ':program_id' => (int) $programId,
                ':target_responses' => (int) $target,
            ]);
        }
    }
}

if (!function_exists('gradtrack_survey_configuration_signature')) {
    function gradtrack_survey_configuration_signature(string $targetType, ?int $totalTarget, array $programTargets): string
    {
        ksort($programTargets);
        return hash('sha256', json_encode([
            'target_type' => $targetType,
            'total_response_target' => $totalTarget,
            'program_targets' => $programTargets,
        ], JSON_UNESCAPED_SLASHES));
    }
}
