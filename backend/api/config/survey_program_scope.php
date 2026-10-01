<?php

require_once __DIR__ . '/survey_versioning.php';

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
    /** Resolve a saved Degree Program & Specialization option to a master program. */
    function gradtrack_match_program_scope_option(array $programs, $value, $label = null): ?array
    {
        // The current label is authoritative for survey scope. option_value is
        // retained only as a stable historical response value and may describe
        // a program that has since been removed from this survey.
        $candidates = array_values(array_unique(array_filter([
            trim((string) ($label ?? '')),
            trim((string) $value),
        ], static fn (string $candidate): bool => $candidate !== '')));

        foreach ($candidates as $candidate) {
            if (ctype_digit($candidate)) {
                $candidateId = (int) $candidate;
                foreach ($programs as $program) {
                    if ((int) ($program['id'] ?? 0) === $candidateId) return $program;
                }
            }

            $candidateCode = strtoupper($candidate);
            foreach ($programs as $program) {
                if ($candidateCode === strtoupper(trim((string) ($program['code'] ?? '')))) return $program;
            }

            if (preg_match('/\(([A-Z0-9-]{2,20})\)\s*$/i', $candidate, $matches) === 1) {
                $parentheticalCode = strtoupper($matches[1]);
                foreach ($programs as $program) {
                    if ($parentheticalCode === strtoupper(trim((string) ($program['code'] ?? '')))) return $program;
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
                ) return $program;
            }
        }

        return null;
    }
}

if (!function_exists('gradtrack_survey_program_master_rows')) {
    function gradtrack_survey_program_master_rows(PDO $db): array
    {
        return $db->query('SELECT id, code, name FROM programs ORDER BY id ASC')
            ->fetchAll(PDO::FETCH_ASSOC);
    }
}

if (!function_exists('gradtrack_validate_survey_program_labels')) {
    /**
     * Validate the coordinator-entered Degree Program & Specialization options
     * against the registrar program master without creating another scope list.
     */
    function gradtrack_validate_survey_program_labels(PDO $db, array $labels): array
    {
        $programs = gradtrack_survey_program_master_rows($db);
        $resolved = [];
        $seenLabels = [];

        foreach (array_values($labels) as $index => $rawLabel) {
            $label = trim((string) $rawLabel);
            if ($label === '') {
                throw new InvalidArgumentException(
                    'Degree Program & Specialization option ' . ($index + 1) . ' cannot be empty.'
                );
            }

            $normalizedLabel = gradtrack_normalize_program_scope_text($label);
            if (isset($seenLabels[$normalizedLabel])) {
                throw new InvalidArgumentException(
                    'Degree Program & Specialization options cannot contain duplicate entries.'
                );
            }
            $seenLabels[$normalizedLabel] = true;

            $program = gradtrack_match_program_scope_option($programs, $label, $label);
            if ($program === null) {
                throw new InvalidArgumentException(
                    'Degree Program & Specialization option "' . $label
                    . '" does not match a program in the registrar master list.'
                );
            }
            $resolved[] = $program;
        }

        return $resolved;
    }
}

if (!function_exists('gradtrack_prepare_survey_program_option_edit')) {
    /**
     * Build a safe editable definition list for the semantic program question.
     * Existing stable values are retained when an option still represents the
     * same master program. Repurposed options become new rows so old answers are
     * never relabelled as a different program.
     */
    function gradtrack_prepare_survey_program_option_edit(
        PDO $db,
        array $storedOptions,
        $submittedOptions,
        $submittedDefinitions
    ): array {
        if (is_string($submittedOptions)) {
            $decoded = json_decode($submittedOptions, true);
            $submittedOptions = is_array($decoded) ? $decoded : [];
        }
        if (!is_array($submittedOptions)) {
            throw new InvalidArgumentException('Degree Program & Specialization options must be a list.');
        }

        $labels = [];
        foreach (array_values($submittedOptions) as $option) {
            $labels[] = is_array($option)
                ? trim((string) ($option['label'] ?? $option['value'] ?? ''))
                : (is_scalar($option) ? trim((string) $option) : '');
        }
        $resolvedPrograms = gradtrack_validate_survey_program_labels($db, $labels);

        if (is_string($submittedDefinitions)) {
            $decoded = json_decode($submittedDefinitions, true);
            $submittedDefinitions = is_array($decoded) ? $decoded : [];
        }
        if (!is_array($submittedDefinitions)) {
            $submittedDefinitions = [];
        }

        if ($submittedDefinitions === [] && $labels === array_column($storedOptions, 'label')) {
            $submittedDefinitions = $storedOptions;
        }
        if (count($submittedDefinitions) !== count($labels)) {
            throw new InvalidArgumentException(
                'Refresh the survey editor before changing Degree Program & Specialization options.'
            );
        }

        $programs = gradtrack_survey_program_master_rows($db);
        $storedById = [];
        foreach ($storedOptions as $storedOption) {
            $storedById[(int) ($storedOption['id'] ?? 0)] = $storedOption;
        }

        $usedIds = [];
        $definitions = [];
        foreach ($labels as $index => $label) {
            $submittedDefinition = is_array($submittedDefinitions[$index] ?? null)
                ? $submittedDefinitions[$index]
                : [];
            $optionId = (int) ($submittedDefinition['id'] ?? 0);
            $storedOption = $optionId > 0 ? ($storedById[$optionId] ?? null) : null;
            if ($optionId > 0 && ($storedOption === null || isset($usedIds[$optionId]))) {
                throw new InvalidArgumentException(
                    'A Degree Program & Specialization option does not belong to this survey question.'
                );
            }

            if ($storedOption !== null) {
                $usedIds[$optionId] = true;
                $oldProgram = gradtrack_match_program_scope_option(
                    $programs,
                    $storedOption['value'] ?? '',
                    $storedOption['label'] ?? ''
                );
                $newProgram = $resolvedPrograms[$index];

                if ((int) ($oldProgram['id'] ?? 0) === (int) ($newProgram['id'] ?? 0)) {
                    $definitions[] = [
                        'id' => $optionId,
                        'key' => (string) ($storedOption['key'] ?? ''),
                        'value' => (string) ($storedOption['value'] ?? ''),
                        'label' => $label,
                        'sort_order' => $index + 1,
                    ];
                    continue;
                }
            }

            $definitions[] = [
                'id' => null,
                'key' => null,
                'value' => $label,
                'label' => $label,
                'sort_order' => $index + 1,
            ];
        }

        return ['labels' => $labels, 'definitions' => $definitions];
    }
}

if (!function_exists('gradtrack_sync_editable_survey_program_options')) {
    /** Synchronize only the current program choices; response values are untouched. */
    function gradtrack_sync_editable_survey_program_options(
        PDO $db,
        int $questionId,
        array $definitions
    ): array {
        $currentById = [];
        $currentStmt = $db->prepare(
            'SELECT id, option_key, option_value, label, sort_order
             FROM survey_question_options
             WHERE survey_question_id = :question_id'
        );
        $currentStmt->execute([':question_id' => $questionId]);
        foreach ($currentStmt->fetchAll(PDO::FETCH_ASSOC) as $option) {
            $currentById[(int) $option['id']] = $option;
        }

        $retainedIds = array_values(array_filter(array_map(
            static fn (array $definition): int => (int) ($definition['id'] ?? 0),
            $definitions
        ), static fn (int $id): bool => $id > 0));

        if ($retainedIds === []) {
            $deleteStmt = $db->prepare(
                'DELETE FROM survey_question_options WHERE survey_question_id = :question_id'
            );
            $deleteStmt->execute([':question_id' => $questionId]);
        } else {
            $placeholders = implode(',', array_fill(0, count($retainedIds), '?'));
            $deleteStmt = $db->prepare(
                "DELETE FROM survey_question_options
                 WHERE survey_question_id = ? AND id NOT IN ($placeholders)"
            );
            $deleteStmt->execute(array_merge([$questionId], $retainedIds));
        }

        $updateStmt = $db->prepare(
            'UPDATE survey_question_options
             SET label = :label, sort_order = :sort_order
             WHERE id = :option_id AND survey_question_id = :question_id'
        );
        $insertStmt = $db->prepare(
            'INSERT INTO survey_question_options
             (survey_question_id, option_key, option_value, label, sort_order)
             VALUES (:question_id, :option_key, :option_value, :label, :sort_order)'
        );

        $saved = [];
        foreach (array_values($definitions) as $index => $definition) {
            $label = trim((string) ($definition['label'] ?? ''));
            $optionId = (int) ($definition['id'] ?? 0);
            if ($optionId > 0 && isset($currentById[$optionId])) {
                $updateStmt->execute([
                    ':label' => $label,
                    ':sort_order' => $index + 1,
                    ':option_id' => $optionId,
                    ':question_id' => $questionId,
                ]);
                $saved[] = [
                    'id' => $optionId,
                    'key' => (string) $currentById[$optionId]['option_key'],
                    'value' => (string) $currentById[$optionId]['option_value'],
                    'label' => $label,
                    'sort_order' => $index + 1,
                ];
                continue;
            }

            $optionKey = gradtrack_survey_uuid();
            $insertStmt->execute([
                ':question_id' => $questionId,
                ':option_key' => $optionKey,
                ':option_value' => $label,
                ':label' => $label,
                ':sort_order' => $index + 1,
            ]);
            $saved[] = [
                'id' => (int) $db->lastInsertId(),
                'key' => $optionKey,
                'value' => $label,
                'label' => $label,
                'sort_order' => $index + 1,
            ];
        }

        return $saved;
    }
}

if (!function_exists('gradtrack_validate_survey_program_questions')) {
    /** Validate program options during draft creation and unrestricted edits. */
    function gradtrack_validate_survey_program_questions(PDO $db, array $questions): void
    {
        foreach ($questions as $question) {
            $analyticsKey = trim((string) ($question['analytics_key'] ?? ''));
            if ($analyticsKey === '') {
                $analyticsKey = gradtrack_survey_legacy_analytics_key($question['question_text'] ?? '') ?? '';
            }
            if ($analyticsKey !== 'program') continue;

            gradtrack_validate_survey_program_labels(
                $db,
                gradtrack_survey_decode_options($question['options'] ?? null)
            );
        }
    }
}

if (!function_exists('gradtrack_survey_program_option_rows')) {
    /** Read the exact saved options of this survey's semantic program question. */
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
        if (!$question) return [];

        $optionStmt = $db->prepare(
            'SELECT id, option_key, option_value, label, sort_order
             FROM survey_question_options
             WHERE survey_question_id = :question_id
             ORDER BY sort_order ASC, id ASC'
        );
        $optionStmt->execute([':question_id' => (int) $question['id']]);
        $rows = $optionStmt->fetchAll(PDO::FETCH_ASSOC);
        if ($rows !== []) return $rows;

        return array_map(static fn (string $option): array => [
            'option_value' => $option,
            'label' => $option,
        ], gradtrack_survey_decode_options($question['options'] ?? null));
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

        $programs = gradtrack_survey_program_master_rows($db);
        $departmentsById = [];
        foreach (gradtrack_survey_program_option_rows($db, $surveyId) as $option) {
            $program = gradtrack_match_program_scope_option(
                $programs,
                $option['option_value'] ?? '',
                $option['label'] ?? ''
            );
            if ($program === null) continue;

            $programId = (int) $program['id'];
            if (!isset($departmentsById[$programId])) {
                $departmentsById[$programId] = [
                    'id' => $programId,
                    'code' => (string) $program['code'],
                    'name' => (string) $program['name'],
                ];
            }
        }

        $result['departments'] = array_values($departmentsById);
        $result['program_ids'] = array_keys($departmentsById);
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

