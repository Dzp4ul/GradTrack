<?php

if (!function_exists('gradtrack_normalize_graduation_year')) {
    function gradtrack_normalize_graduation_year($value): ?int
    {
        if (!is_scalar($value)) {
            return null;
        }

        $text = trim((string) $value);
        if (preg_match('/^(19|20)\d{2}$/', $text) !== 1) {
            return null;
        }

        return (int) $text;
    }
}

if (!function_exists('gradtrack_normalize_graduation_years')) {
    function gradtrack_normalize_graduation_years(iterable $values, string $direction = 'desc'): array
    {
        $years = [];
        foreach ($values as $value) {
            if (is_array($value)) {
                $value = $value['year_graduated'] ?? $value['graduation_year'] ?? $value['batch_year'] ?? null;
            }

            $year = gradtrack_normalize_graduation_year($value);
            if ($year !== null) {
                $years[$year] = $year;
            }
        }

        if (strtolower($direction) === 'asc') {
            ksort($years, SORT_NUMERIC);
        } else {
            krsort($years, SORT_NUMERIC);
        }
        return array_values($years);
    }
}

if (!function_exists('gradtrack_normalize_survey_question_label')) {
    function gradtrack_normalize_survey_question_label($value): string
    {
        if (!is_scalar($value)) {
            return '';
        }

        $text = html_entity_decode(trim((string) $value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('/^\s*(?:q(?:uestion)?\s*)?\d+\s*[.\-:)]*\s*/i', '', $text) ?? $text;
        $text = strtolower($text);
        $text = preg_replace('/[^a-z0-9]+/', ' ', $text) ?? $text;
        return trim(preg_replace('/\s+/', ' ', $text) ?? $text);
    }
}

if (!function_exists('gradtrack_is_graduation_year_question')) {
    function gradtrack_is_graduation_year_question(array $question): bool
    {
        $label = gradtrack_normalize_survey_question_label($question['question_text'] ?? '');
        return in_array($label, [
            'year graduated',
            'year of graduation',
            'graduation year',
            'yr graduated',
        ], true);
    }
}

if (!function_exists('gradtrack_decode_survey_question_options')) {
    function gradtrack_decode_survey_question_options($options): ?array
    {
        if (is_array($options)) {
            return $options;
        }

        if (!is_string($options) || trim($options) === '') {
            return $options === null ? [] : null;
        }

        $decoded = json_decode($options, true);
        return is_array($decoded) ? $decoded : null;
    }
}

if (!function_exists('gradtrack_analyze_graduation_year_options')) {
    function gradtrack_analyze_graduation_year_options($options): array
    {
        $values = gradtrack_decode_survey_question_options($options);
        if ($values === null) {
            return [
                'years' => [],
                'options' => [],
                'errors' => ['Year Graduated options must be a list of four-digit years.'],
            ];
        }

        $years = [];
        $duplicates = [];
        $invalid = [];
        foreach ($values as $value) {
            if (!is_scalar($value)) {
                $invalid[] = 'non-text value';
                continue;
            }

            $text = trim((string) $value);
            if ($text === '') {
                continue;
            }

            $year = gradtrack_normalize_graduation_year($text);
            if ($year === null) {
                $invalid[] = $text;
                continue;
            }

            if (isset($years[$year])) {
                $duplicates[$year] = $year;
                continue;
            }
            $years[$year] = $year;
        }

        ksort($years, SORT_NUMERIC);
        $errors = [];
        if ($invalid !== []) {
            $errors[] = 'Year Graduated accepts valid four-digit years only. Invalid value(s): ' . implode(', ', array_unique($invalid)) . '.';
        }
        if ($duplicates !== []) {
            ksort($duplicates, SORT_NUMERIC);
            $errors[] = 'Year Graduated contains duplicate year(s): ' . implode(', ', $duplicates) . '.';
        }
        if ($years === []) {
            $errors[] = 'Add at least one Year Graduated option.';
        }

        $normalizedYears = array_values($years);
        return [
            'years' => $normalizedYears,
            'options' => array_map('strval', $normalizedYears),
            'errors' => $errors,
        ];
    }
}

if (!function_exists('gradtrack_prepare_survey_questions')) {
    function gradtrack_prepare_survey_questions(array $questions, bool $requireGraduationYearCoverage): array
    {
        $prepared = $questions;
        $yearQuestionIndexes = [];

        foreach ($prepared as $index => $question) {
            if (is_array($question) && gradtrack_is_graduation_year_question($question)) {
                $yearQuestionIndexes[] = $index;
            }
        }

        $errors = [];
        if (count($yearQuestionIndexes) > 1) {
            $errors[] = 'Only one Year Graduated question can define survey coverage.';
        }
        if ($requireGraduationYearCoverage && $yearQuestionIndexes === []) {
            $errors[] = 'Add a Year Graduated multiple-choice question before activating this survey.';
        }

        foreach ($yearQuestionIndexes as $index) {
            $question = $prepared[$index];
            if (($question['question_type'] ?? '') !== 'multiple_choice') {
                $errors[] = 'Year Graduated must use the Multiple Choice question type.';
            }

            $analysis = gradtrack_analyze_graduation_year_options($question['options'] ?? []);
            $errors = array_merge($errors, $analysis['errors']);
            $prepared[$index]['options'] = $analysis['options'];
        }

        return [
            'questions' => $prepared,
            'errors' => array_values(array_unique($errors)),
        ];
    }
}

if (!function_exists('gradtrack_get_survey_graduation_year_coverage')) {
    function gradtrack_get_survey_graduation_year_coverage(PDO $db, int $surveyId): array
    {
        $surveyStmt = $db->prepare(
            'SELECT id, title, status, archived_at FROM surveys WHERE id = :survey_id LIMIT 1'
        );
        $surveyStmt->execute([':survey_id' => $surveyId]);
        $survey = $surveyStmt->fetch(PDO::FETCH_ASSOC) ?: null;

        $base = [
            'survey' => $survey,
            'question_id' => null,
            'years' => [],
            'configured' => false,
            'error' => null,
        ];
        if ($survey === null) {
            $base['error'] = 'Survey not found.';
            return $base;
        }

        $questionStmt = $db->prepare(
            'SELECT id, question_text, question_type, options, sort_order
             FROM survey_questions
             WHERE survey_id = :survey_id
             ORDER BY sort_order ASC, id ASC'
        );
        $questionStmt->execute([':survey_id' => $surveyId]);
        $questions = array_values(array_filter(
            $questionStmt->fetchAll(PDO::FETCH_ASSOC),
            'gradtrack_is_graduation_year_question'
        ));

        if ($questions === []) {
            $base['error'] = 'Graduation year coverage has not been configured for this survey.';
            return $base;
        }
        if (count($questions) > 1) {
            $base['error'] = 'More than one Year Graduated question is configured for this survey.';
            return $base;
        }

        $question = $questions[0];
        $base['question_id'] = (int) $question['id'];
        if (($question['question_type'] ?? '') !== 'multiple_choice') {
            $base['error'] = 'The Year Graduated question must use the Multiple Choice type.';
            return $base;
        }

        $analysis = gradtrack_analyze_graduation_year_options($question['options'] ?? null);
        if ($analysis['errors'] !== []) {
            $base['error'] = implode(' ', $analysis['errors']);
            return $base;
        }

        $base['years'] = $analysis['years'];
        $base['configured'] = true;
        return $base;
    }
}

if (!function_exists('gradtrack_get_active_survey_graduation_year_coverage')) {
    function gradtrack_get_active_survey_graduation_year_coverage(PDO $db): array
    {
        $stmt = $db->query(
            "SELECT id FROM surveys
             WHERE status = 'active' AND archived_at IS NULL
             ORDER BY updated_at DESC, created_at DESC, id DESC
             LIMIT 1"
        );
        $surveyId = $stmt->fetchColumn();
        if ($surveyId === false) {
            return [
                'survey' => null,
                'question_id' => null,
                'years' => [],
                'configured' => false,
                'error' => 'No active survey is available.',
            ];
        }

        return gradtrack_get_survey_graduation_year_coverage($db, (int) $surveyId);
    }
}

if (!function_exists('gradtrack_append_graduation_year_coverage_filter')) {
    function gradtrack_append_graduation_year_coverage_filter(
        array &$whereParts,
        array &$params,
        string $column,
        array $allowedYears,
        string $prefix = 'coverage_year'
    ): void {
        if ($allowedYears === []) {
            $whereParts[] = '1 = 0';
            return;
        }

        $placeholders = [];
        foreach (array_values($allowedYears) as $index => $year) {
            $placeholder = ':' . $prefix . '_' . $index;
            $placeholders[] = $placeholder;
            $params[$placeholder] = (int) $year;
        }
        $whereParts[] = $column . ' IN (' . implode(', ', $placeholders) . ')';
    }
}

if (!function_exists('gradtrack_graduation_year_is_allowed')) {
    function gradtrack_graduation_year_is_allowed($value, array $allowedYears): bool
    {
        $year = gradtrack_normalize_graduation_year($value);
        return $year !== null && in_array($year, $allowedYears, true);
    }
}

if (!function_exists('gradtrack_format_graduation_year_coverage')) {
    function gradtrack_format_graduation_year_coverage(array $allowedYears): string
    {
        $years = gradtrack_normalize_graduation_years($allowedYears, 'asc');
        if ($years === []) {
            return '';
        }
        if (count($years) === 1) {
            return (string) $years[0];
        }

        $continuous = true;
        for ($index = 1; $index < count($years); $index++) {
            if ($years[$index] !== $years[$index - 1] + 1) {
                $continuous = false;
                break;
            }
        }
        if ($continuous) {
            return $years[0] . ' to ' . $years[count($years) - 1];
        }

        $labels = array_map('strval', $years);
        $last = array_pop($labels);
        return count($labels) === 1
            ? $labels[0] . ' and ' . $last
            : implode(', ', $labels) . ', and ' . $last;
    }
}

if (!function_exists('gradtrack_fetch_graduate_years')) {
    function gradtrack_fetch_graduate_years(
        PDO $db,
        string $archiveScope = 'active',
        ?int $programId = null,
        ?array $programCodes = null
    ): array {
        $where = [$archiveScope === 'archived' ? 'g.archived_at IS NOT NULL' : 'g.archived_at IS NULL'];
        $params = [];
        $join = '';

        if ($programId !== null && $programId > 0) {
            $where[] = 'g.program_id = :year_program_id';
            $params[':year_program_id'] = $programId;
        }

        if (is_array($programCodes)) {
            $cleanCodes = array_values(array_unique(array_filter(array_map(static function ($code): string {
                return strtoupper(trim((string) $code));
            }, $programCodes))));
            if ($cleanCodes === []) {
                return [];
            }

            $join = ' JOIN programs year_program ON year_program.id = g.program_id';
            $placeholders = [];
            foreach ($cleanCodes as $index => $code) {
                $placeholder = ':year_program_code_' . $index;
                $placeholders[] = $placeholder;
                $params[$placeholder] = $code;
            }
            $where[] = 'year_program.code IN (' . implode(', ', $placeholders) . ')';
        }

        $stmt = $db->prepare(
            'SELECT DISTINCT g.year_graduated FROM graduates g' . $join .
            ' WHERE ' . implode(' AND ', $where) .
            ' ORDER BY g.year_graduated DESC'
        );
        $stmt->execute($params);

        return gradtrack_normalize_graduation_years($stmt->fetchAll(PDO::FETCH_ASSOC));
    }
}
