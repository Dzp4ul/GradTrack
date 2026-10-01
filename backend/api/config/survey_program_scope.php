<?php

require_once __DIR__ . '/survey_versioning.php';

if (!function_exists('gradtrack_survey_program_scope_table_exists')) {
    function gradtrack_survey_program_scope_table_exists(PDO $db): bool
    {
        $stmt = $db->query("SELECT COUNT(*)
                            FROM INFORMATION_SCHEMA.TABLES
                            WHERE TABLE_SCHEMA = DATABASE()
                              AND TABLE_NAME = 'survey_programs'");
        return (int) $stmt->fetchColumn() > 0;
    }
}

if (!function_exists('gradtrack_normalize_program_scope_text')) {
    function gradtrack_normalize_program_scope_text($value): string
    {
        $text = html_entity_decode(trim((string) $value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = strtolower($text);
        $text = preg_replace('/[^a-z0-9]+/', ' ', $text) ?? $text;
        return trim(preg_replace('/\s+/', ' ', $text) ?? $text);
    }
}

if (!function_exists('gradtrack_match_program_scope_option')) {
    /**
     * Resolve a saved survey option to the program master row. Exact IDs/codes
     * are preferred; a longer option such as "... Education Major in ..." may
     * extend a canonical program name without duplicating that program.
     */
    function gradtrack_match_program_scope_option(array $programs, $value, $label = null): ?array
    {
        $candidates = array_values(array_unique(array_filter([
            trim((string) $value),
            trim((string) ($label ?? '')),
        ], static fn (string $candidate): bool => $candidate !== '')));

        foreach ($candidates as $candidate) {
            if (ctype_digit($candidate)) {
                $candidateId = (int) $candidate;
                foreach ($programs as $program) {
                    if ((int) ($program['id'] ?? 0) === $candidateId) {
                        return $program;
                    }
                }
            }

            $candidateCode = strtoupper($candidate);
            foreach ($programs as $program) {
                if ($candidateCode === strtoupper(trim((string) ($program['code'] ?? '')))) {
                    return $program;
                }
            }

            if (preg_match('/\(([A-Z0-9-]{2,20})\)\s*$/i', $candidate, $matches) === 1) {
                $parentheticalCode = strtoupper($matches[1]);
                foreach ($programs as $program) {
                    if ($parentheticalCode === strtoupper(trim((string) ($program['code'] ?? '')))) {
                        return $program;
                    }
                }
            }
        }

        $programsByLongestName = $programs;
        usort($programsByLongestName, static function (array $left, array $right): int {
            return strlen((string) ($right['name'] ?? '')) <=> strlen((string) ($left['name'] ?? ''));
        });
        foreach ($candidates as $candidate) {
            $normalizedCandidate = gradtrack_normalize_program_scope_text($candidate);
            foreach ($programsByLongestName as $program) {
                $normalizedName = gradtrack_normalize_program_scope_text($program['name'] ?? '');
                if (
                    $normalizedName !== ''
                    && (
                        $normalizedCandidate === $normalizedName
                        || str_starts_with($normalizedCandidate, $normalizedName . ' major ')
                        || str_starts_with($normalizedCandidate, $normalizedName . ' specialization ')
                    )
                ) {
                    return $program;
                }
            }
        }

        return null;
    }
}

if (!function_exists('gradtrack_survey_program_option_rows')) {
    function gradtrack_survey_program_option_rows(PDO $db, int $surveyId): array
    {
        $questionStmt = $db->prepare(
            "SELECT id, options
             FROM survey_questions
             WHERE survey_id = :survey_id
               AND analytics_key = 'program'
               AND is_active = 1
             ORDER BY sort_order ASC, id ASC
             LIMIT 1"
        );
        $questionStmt->execute([':survey_id' => $surveyId]);
        $question = $questionStmt->fetch(PDO::FETCH_ASSOC);
        if (!$question) {
            return [];
        }

        $optionStmt = $db->prepare(
            'SELECT option_value, label
             FROM survey_question_options
             WHERE survey_question_id = :question_id
             ORDER BY sort_order ASC, id ASC'
        );
        $optionStmt->execute([':question_id' => (int) $question['id']]);
        $rows = $optionStmt->fetchAll(PDO::FETCH_ASSOC);
        if ($rows !== []) {
            return $rows;
        }

        return array_map(static fn (string $option): array => [
            'option_value' => $option,
            'label' => $option,
        ], gradtrack_survey_decode_options($question['options'] ?? null));
    }
}

if (!function_exists('gradtrack_infer_survey_program_ids')) {
    function gradtrack_infer_survey_program_ids(PDO $db, int $surveyId): array
    {
        $programs = $db->query('SELECT id, code, name FROM programs ORDER BY id ASC')
            ->fetchAll(PDO::FETCH_ASSOC);
        $programIds = [];
        foreach (gradtrack_survey_program_option_rows($db, $surveyId) as $option) {
            $program = gradtrack_match_program_scope_option(
                $programs,
                $option['option_value'] ?? '',
                $option['label'] ?? ''
            );
            if ($program !== null) {
                $programIds[(int) $program['id']] = (int) $program['id'];
            }
        }
        return array_values($programIds);
    }
}

if (!function_exists('gradtrack_sync_survey_program_scope')) {
    function gradtrack_sync_survey_program_scope(PDO $db, int $surveyId, $programIds): array
    {
        if (!is_array($programIds)) {
            throw new InvalidArgumentException('Scope of Departments must be a list of program IDs.');
        }
        if (!gradtrack_survey_program_scope_table_exists($db)) {
            throw new RuntimeException('The survey program scope schema is missing. Run the database migrations.');
        }

        $normalizedIds = [];
        foreach ($programIds as $programId) {
            if (filter_var($programId, FILTER_VALIDATE_INT) === false || (int) $programId <= 0) {
                throw new InvalidArgumentException('Scope of Departments contains an invalid program ID.');
            }
            $normalizedIds[(int) $programId] = (int) $programId;
        }
        $normalizedIds = array_values($normalizedIds);

        if ($normalizedIds !== []) {
            $placeholders = implode(',', array_fill(0, count($normalizedIds), '?'));
            $programStmt = $db->prepare("SELECT id FROM programs WHERE id IN ($placeholders)");
            $programStmt->execute($normalizedIds);
            $existingIds = array_map('intval', $programStmt->fetchAll(PDO::FETCH_COLUMN));
            sort($existingIds, SORT_NUMERIC);
            $expectedIds = $normalizedIds;
            sort($expectedIds, SORT_NUMERIC);
            if ($existingIds !== $expectedIds) {
                throw new InvalidArgumentException('Scope of Departments contains a program that does not exist.');
            }
        }

        $deleteStmt = $db->prepare('DELETE FROM survey_programs WHERE survey_id = :survey_id');
        $deleteStmt->execute([':survey_id' => $surveyId]);
        if ($normalizedIds !== []) {
            $insertStmt = $db->prepare(
                'INSERT INTO survey_programs (survey_id, program_id) VALUES (:survey_id, :program_id)'
            );
            foreach ($normalizedIds as $programId) {
                $insertStmt->execute([
                    ':survey_id' => $surveyId,
                    ':program_id' => $programId,
                ]);
            }
        }

        return $normalizedIds;
    }
}

if (!function_exists('gradtrack_get_survey_program_scope')) {
    function gradtrack_get_survey_program_scope(PDO $db, int $surveyId): array
    {
        $surveyStmt = $db->prepare(
            'SELECT id, title, status, archived_at FROM surveys WHERE id = :survey_id LIMIT 1'
        );
        $surveyStmt->execute([':survey_id' => $surveyId]);
        $survey = $surveyStmt->fetch(PDO::FETCH_ASSOC) ?: null;
        $result = [
            'survey' => $survey,
            'departments' => [],
            'program_ids' => [],
            'configured' => false,
            'error' => null,
        ];
        if ($survey === null) {
            $result['error'] = 'Survey not found.';
            return $result;
        }

        if (gradtrack_survey_program_scope_table_exists($db)) {
            $scopeStmt = $db->prepare(
                'SELECT p.id, p.code, p.name
                 FROM survey_programs sp
                 JOIN programs p ON p.id = sp.program_id
                 WHERE sp.survey_id = :survey_id
                 ORDER BY p.name ASC, p.id ASC'
            );
            $scopeStmt->execute([':survey_id' => $surveyId]);
            $departments = $scopeStmt->fetchAll(PDO::FETCH_ASSOC);
        } else {
            // Compatibility for an installation that has not applied the new
            // migration yet. Never fall back to every master program.
            $programIds = gradtrack_infer_survey_program_ids($db, $surveyId);
            $departments = [];
            if ($programIds !== []) {
                $placeholders = implode(',', array_fill(0, count($programIds), '?'));
                $programStmt = $db->prepare(
                    "SELECT id, code, name FROM programs WHERE id IN ($placeholders) ORDER BY name ASC, id ASC"
                );
                $programStmt->execute($programIds);
                $departments = $programStmt->fetchAll(PDO::FETCH_ASSOC);
            }
        }

        $result['departments'] = array_map(static fn (array $department): array => [
            'id' => (int) $department['id'],
            'code' => (string) $department['code'],
            'name' => (string) $department['name'],
        ], $departments);
        $result['program_ids'] = array_column($result['departments'], 'id');
        $result['configured'] = $result['departments'] !== [];
        if (!$result['configured']) {
            $result['error'] = 'No departments are currently assigned to this survey. Please contact the survey administrator.';
        }
        return $result;
    }
}

if (!function_exists('gradtrack_get_active_survey_program_scope')) {
    function gradtrack_get_active_survey_program_scope(PDO $db): array
    {
        $surveyId = $db->query(
            "SELECT id FROM surveys
             WHERE status = 'active' AND archived_at IS NULL
             ORDER BY updated_at DESC, created_at DESC, id DESC
             LIMIT 1"
        )->fetchColumn();
        if ($surveyId === false) {
            return [
                'survey' => null,
                'departments' => [],
                'program_ids' => [],
                'configured' => false,
                'error' => 'No active survey is available.',
            ];
        }
        return gradtrack_get_survey_program_scope($db, (int) $surveyId);
    }
}

