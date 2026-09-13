<?php

const GRADTRACK_BARANGAY_NOT_SPECIFIED_LABEL = 'Barangay not specified';
const GRADTRACK_BARANGAY_NOT_SPECIFIED_VALUE = '__barangay_not_specified__';

function gradtrack_survey_answer_label($answer): string
{
    if (is_array($answer)) {
        $parts = [];
        foreach ($answer as $value) {
            if (!is_scalar($value)) {
                continue;
            }

            $text = trim((string)$value);
            if ($text !== '') {
                $parts[] = $text;
            }
        }

        return implode(', ', $parts);
    }

    return trim((string)($answer ?? ''));
}

function gradtrack_survey_has_answer($answer): bool
{
    if (is_array($answer)) {
        foreach ($answer as $value) {
            if (gradtrack_survey_has_answer($value)) {
                return true;
            }
        }

        return false;
    }

    return trim((string)($answer ?? '')) !== '';
}

function gradtrack_survey_normalize_text($value): string
{
    $text = strtolower(trim((string)($value ?? '')));
    $text = str_replace(["\r", "\n", "\t"], ' ', $text);
    $text = preg_replace('/\s+/', ' ', $text);
    return trim((string)$text);
}

function gradtrack_survey_clean_location($value): ?string
{
    $text = trim((string)($value ?? ''));
    $text = preg_replace('/\s+/', ' ', $text);
    $text = trim((string)$text);

    return $text === '' ? null : $text;
}

function gradtrack_survey_collect_numeric_response_keys(array $data): array
{
    $keys = [];
    foreach (array_keys($data) as $key) {
        $keyText = (string)$key;
        if ($keyText !== '' && ctype_digit($keyText)) {
            $keys[(int)$keyText] = (int)$keyText;
        }
    }

    sort($keys, SORT_NUMERIC);
    return array_values($keys);
}

function gradtrack_survey_sorted_questions(array $questions): array
{
    usort($questions, static function ($a, $b) {
        $sortCompare = ((int)($a['sort_order'] ?? 0)) <=> ((int)($b['sort_order'] ?? 0));
        if ($sortCompare !== 0) {
            return $sortCompare;
        }

        return ((int)($a['id'] ?? 0)) <=> ((int)($b['id'] ?? 0));
    });

    return $questions;
}

function gradtrack_survey_exact_hit_ratio(array $questions, array $data): float
{
    $numericKeys = gradtrack_survey_collect_numeric_response_keys($data);
    if (empty($numericKeys)) {
        return 0.0;
    }

    $questionIds = [];
    foreach ($questions as $question) {
        $questionId = (string)($question['id'] ?? '');
        if ($questionId !== '' && ctype_digit($questionId)) {
            $questionIds[$questionId] = true;
        }
    }

    $hits = 0;
    foreach ($numericKeys as $key) {
        if (isset($questionIds[(string)$key])) {
            $hits++;
        }
    }

    return $hits / count($numericKeys);
}

function gradtrack_survey_build_answer_map(array $questions, array $data): array
{
    $answers = [];
    $questions = gradtrack_survey_sorted_questions($questions);

    foreach ($questions as $question) {
        $questionId = (string)($question['id'] ?? '');
        if ($questionId !== '') {
            $answers[$questionId] = null;
        }
    }

    if (empty($questions) || empty($data)) {
        return $answers;
    }

    $exactRatio = gradtrack_survey_exact_hit_ratio($questions, $data);
    if ($exactRatio >= 0.5) {
        foreach ($questions as $question) {
            $questionId = (string)($question['id'] ?? '');
            if ($questionId !== '' && array_key_exists($questionId, $data)) {
                $answers[$questionId] = $data[$questionId];
            }
        }

        return $answers;
    }

    $responseKeys = gradtrack_survey_collect_numeric_response_keys($data);
    if (empty($responseKeys)) {
        return $answers;
    }

    $firstQuestion = $questions[0];
    $firstQuestionId = (int)($firstQuestion['id'] ?? 0);
    $firstSortOrder = (int)($firstQuestion['sort_order'] ?? 0);
    $firstResponseKey = (int)min($responseKeys);
    $idOffset = $firstQuestionId - $firstResponseKey;

    $offsetHits = 0;
    foreach ($questions as $question) {
        $legacyKey = (string)((int)($question['id'] ?? 0) - $idOffset);
        if ((int)$legacyKey > 0 && array_key_exists($legacyKey, $data)) {
            $offsetHits++;
        }
    }

    $useIdOffset = $offsetHits > 0;
    $usedResponseKeys = [];

    foreach ($questions as $question) {
        $questionId = (string)($question['id'] ?? '');
        if ($questionId === '') {
            continue;
        }

        if (array_key_exists($questionId, $data)) {
            $answers[$questionId] = $data[$questionId];
            $usedResponseKeys[$questionId] = true;
            continue;
        }

        $candidateKey = $useIdOffset
            ? (string)((int)$questionId - $idOffset)
            : (string)($firstResponseKey + ((int)($question['sort_order'] ?? 0) - $firstSortOrder));

        if ((int)$candidateKey <= 0 || isset($usedResponseKeys[$candidateKey]) || !array_key_exists($candidateKey, $data)) {
            continue;
        }

        $answers[$questionId] = $data[$candidateKey];
        $usedResponseKeys[$candidateKey] = true;
    }

    return $answers;
}

function gradtrack_survey_percentage(int $count, int $total, int $decimals = 1): float
{
    if ($total <= 0) {
        return 0.0;
    }

    return round(($count / $total) * 100, $decimals);
}

function gradtrack_survey_response_identity(array $response): string
{
    $responseId = trim((string)($response['response_id'] ?? $response['id'] ?? ''));
    if ($responseId !== '') {
        return 'response:' . $responseId;
    }

    $graduateId = trim((string)($response['graduate_id'] ?? ''));
    return $graduateId !== '' ? 'graduate:' . $graduateId : 'anonymous:' . spl_object_id((object)$response);
}

function gradtrack_survey_is_duplicate_response(array $response, array &$seen): bool
{
    $identity = gradtrack_survey_response_identity($response);
    if (isset($seen[$identity])) {
        return true;
    }

    $seen[$identity] = true;
    return false;
}

function gradtrack_survey_normalize_barangay_filter(?string $value): ?string
{
    if ($value === null) {
        return null;
    }

    $clean = trim($value);
    if ($clean === '' || strtolower($clean) === 'all') {
        return null;
    }

    $normalized = strtolower(str_replace([' ', '-'], '_', $clean));
    if (
        $normalized === GRADTRACK_BARANGAY_NOT_SPECIFIED_VALUE
        || $normalized === 'barangay_not_specified'
        || $normalized === 'not_specified'
    ) {
        return GRADTRACK_BARANGAY_NOT_SPECIFIED_VALUE;
    }

    return $clean;
}

function gradtrack_survey_location_matches(?string $filter, ?string $code, ?string $name): bool
{
    if ($filter === null) {
        return true;
    }

    $filterText = gradtrack_survey_normalize_text($filter);
    if ($filterText === '') {
        return true;
    }

    $codeText = gradtrack_survey_normalize_text($code);
    $nameText = gradtrack_survey_normalize_text($name);

    return $filterText === $codeText || $filterText === $nameText;
}

function gradtrack_survey_barangay_matches(?string $filter, array $address): bool
{
    if ($filter === null) {
        return true;
    }

    $code = $address['barangay_code'] ?? null;
    $name = $address['barangay_name'] ?? null;
    $hasBarangay = gradtrack_survey_clean_location($code) !== null || gradtrack_survey_clean_location($name) !== null;

    if ($filter === GRADTRACK_BARANGAY_NOT_SPECIFIED_VALUE) {
        return !$hasBarangay;
    }

    return gradtrack_survey_location_matches($filter, $code, $name);
}

function gradtrack_survey_location_bucket(?string $code, ?string $name, string $fallbackLabel): array
{
    $cleanCode = gradtrack_survey_clean_location($code);
    $cleanName = gradtrack_survey_clean_location($name);
    $isBarangayFallback = $fallbackLabel === GRADTRACK_BARANGAY_NOT_SPECIFIED_LABEL;

    if ($cleanCode === null && $cleanName === null) {
        return [
            'id' => $isBarangayFallback ? GRADTRACK_BARANGAY_NOT_SPECIFIED_VALUE : '__not_specified__',
            'code' => null,
            'name' => null,
            'label' => $fallbackLabel,
            'is_not_specified' => true,
        ];
    }

    return [
        'id' => $cleanCode ?? $cleanName,
        'code' => $cleanCode,
        'name' => $cleanName,
        'label' => $cleanName ?? $cleanCode,
        'is_not_specified' => false,
    ];
}

/**
 * Canonical graduate-survey analytics helpers.
 *
 * Active analytics always start from an existing, active, non-archived graduate.
 * Survey responses are historical records and may intentionally outlive a graduate,
 * so response-only queries must not be used for current operational statistics.
 */
function gradtrack_analytics_active_graduate_condition(string $alias = 'g'): string
{
    if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $alias) !== 1) {
        throw new InvalidArgumentException('Invalid graduate table alias');
    }

    return "{$alias}.status = 'active' AND {$alias}.archived_at IS NULL";
}

function gradtrack_analytics_fetch_questions(PDO $db, int $surveyId): array
{
    if ($surveyId <= 0) {
        return [];
    }

    $stmt = $db->prepare(
        'SELECT id, survey_id, section, question_text, question_type, options, is_required, sort_order
         FROM survey_questions
         WHERE survey_id = :survey_id
         ORDER BY sort_order ASC, id ASC'
    );
    $stmt->bindValue(':survey_id', $surveyId, PDO::PARAM_INT);
    $stmt->execute();

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function gradtrack_analytics_normalize_program_codes($values): array
{
    if (!is_array($values)) {
        return [];
    }

    return array_values(array_unique(array_filter(array_map(static function ($value): string {
        return strtoupper(trim((string)$value));
    }, $values), static function (string $value): bool {
        return $value !== '';
    })));
}

function gradtrack_analytics_append_program_filters(
    array &$where,
    array &$bindings,
    array $options,
    string $graduateAlias = 'g',
    string $programAlias = 'p',
    string $prefix = 'analytics'
): void {
    $programId = (int)($options['program_id'] ?? 0);
    if ($programId > 0) {
        $placeholder = ':' . $prefix . '_program_id';
        $where[] = "{$graduateAlias}.program_id = {$placeholder}";
        $bindings[$placeholder] = ['value' => $programId, 'type' => PDO::PARAM_INT];
    }

    $programCodes = gradtrack_analytics_normalize_program_codes($options['program_codes'] ?? null);
    if ($programCodes !== []) {
        $placeholders = [];
        foreach ($programCodes as $index => $code) {
            $placeholder = ':' . $prefix . '_program_code_' . $index;
            $placeholders[] = $placeholder;
            $bindings[$placeholder] = ['value' => $code, 'type' => PDO::PARAM_STR];
        }
        $where[] = "{$programAlias}.code IN (" . implode(', ', $placeholders) . ')';
    }
}

function gradtrack_analytics_append_graduation_year_coverage(
    array &$where,
    array &$bindings,
    array $options,
    string $graduateAlias = 'g',
    string $prefix = 'analytics_coverage'
): void {
    if (!array_key_exists('allowed_graduation_years', $options)) {
        return;
    }

    $years = is_array($options['allowed_graduation_years'])
        ? array_values(array_unique(array_map('intval', $options['allowed_graduation_years'])))
        : [];
    $years = array_values(array_filter($years, static fn (int $year): bool => $year > 0));
    if ($years === []) {
        $where[] = '1 = 0';
        return;
    }

    $placeholders = [];
    foreach ($years as $index => $year) {
        $placeholder = ':' . $prefix . '_year_' . $index;
        $placeholders[] = $placeholder;
        $bindings[$placeholder] = ['value' => $year, 'type' => PDO::PARAM_INT];
    }
    $where[] = "{$graduateAlias}.year_graduated IN (" . implode(', ', $placeholders) . ')';
}

function gradtrack_analytics_bind_values(PDOStatement $stmt, array $bindings): void
{
    foreach ($bindings as $placeholder => $binding) {
        $stmt->bindValue($placeholder, $binding['value'], $binding['type']);
    }
}

function gradtrack_analytics_fetch_valid_responses(PDO $db, int $surveyId, array $options = []): array
{
    if ($surveyId <= 0) {
        return [];
    }

    $where = [
        'sr.survey_id = :analytics_survey_id',
        'sr.submitted_at IS NOT NULL',
        gradtrack_analytics_active_graduate_condition('g'),
    ];
    $bindings = [
        ':analytics_survey_id' => ['value' => $surveyId, 'type' => PDO::PARAM_INT],
        ':analytics_dedupe_survey_id' => ['value' => $surveyId, 'type' => PDO::PARAM_INT],
    ];

    gradtrack_analytics_append_program_filters($where, $bindings, $options);
    gradtrack_analytics_append_graduation_year_coverage($where, $bindings, $options, 'g', 'analytics_response_coverage');

    $graduationYear = trim((string)($options['graduation_year'] ?? ''));
    if ($graduationYear !== '') {
        $where[] = 'g.year_graduated = :analytics_graduation_year';
        $bindings[':analytics_graduation_year'] = ['value' => (int)$graduationYear, 'type' => PDO::PARAM_INT];
    }

    // The submission flow prevents duplicates per survey/graduate. MAX(id) is a
    // deterministic safeguard for legacy databases that predate that validation.
    $sql = '
        SELECT
            sr.id AS response_id,
            sr.graduate_id,
            sr.graduate_account_id,
            sr.responses,
            sr.submitted_at,
            g.year_graduated,
            g.program_id,
            p.code AS program_code,
            p.name AS program_name
        FROM survey_responses sr
        INNER JOIN (
            SELECT graduate_id, MAX(id) AS response_id
            FROM survey_responses
            WHERE survey_id = :analytics_dedupe_survey_id
              AND submitted_at IS NOT NULL
              AND graduate_id IS NOT NULL
            GROUP BY graduate_id
        ) latest_response ON latest_response.response_id = sr.id
        INNER JOIN graduates g ON g.id = sr.graduate_id
        LEFT JOIN programs p ON p.id = g.program_id
        WHERE ' . implode(' AND ', $where) . '
        ORDER BY sr.id ASC';

    $stmt = $db->prepare($sql);
    gradtrack_analytics_bind_values($stmt, $bindings);
    $stmt->execute();

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function gradtrack_analytics_fetch_program_dimensions(PDO $db, array $options = []): array
{
    $joinConditions = [gradtrack_analytics_active_graduate_condition('g')];
    $where = [];
    $bindings = [];
    gradtrack_analytics_append_graduation_year_coverage($joinConditions, $bindings, $options, 'g', 'program_dimension_coverage');

    $programId = (int)($options['program_id'] ?? 0);
    if ($programId > 0) {
        $where[] = 'p.id = :dimension_program_id';
        $bindings[':dimension_program_id'] = ['value' => $programId, 'type' => PDO::PARAM_INT];
    }

    $programCodes = gradtrack_analytics_normalize_program_codes($options['program_codes'] ?? null);
    if ($programCodes !== []) {
        $placeholders = [];
        foreach ($programCodes as $index => $code) {
            $placeholder = ':dimension_program_code_' . $index;
            $placeholders[] = $placeholder;
            $bindings[$placeholder] = ['value' => $code, 'type' => PDO::PARAM_STR];
        }
        $where[] = 'p.code IN (' . implode(', ', $placeholders) . ')';
    }

    $sql = '
        SELECT p.id AS program_id, p.code, p.name, COUNT(g.id) AS active_graduate_count
        FROM programs p
        INNER JOIN graduates g ON g.program_id = p.id AND ' . implode(' AND ', $joinConditions) .
        ($where !== [] ? ' WHERE ' . implode(' AND ', $where) : '') . '
        GROUP BY p.id, p.code, p.name
        ORDER BY p.code ASC';

    $stmt = $db->prepare($sql);
    gradtrack_analytics_bind_values($stmt, $bindings);
    $stmt->execute();

    return array_map(static function (array $row): array {
        return [
            'program_id' => (int)$row['program_id'],
            'code' => (string)$row['code'],
            'name' => (string)$row['name'],
            'active_graduate_count' => (int)$row['active_graduate_count'],
        ];
    }, $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function gradtrack_analytics_fetch_year_dimensions(PDO $db, array $options = []): array
{
    $where = [
        gradtrack_analytics_active_graduate_condition('g'),
        'g.year_graduated IS NOT NULL',
    ];
    $bindings = [];
    gradtrack_analytics_append_program_filters($where, $bindings, $options, 'g', 'p', 'year_dimension');
    gradtrack_analytics_append_graduation_year_coverage($where, $bindings, $options, 'g', 'year_dimension_coverage');

    $graduationYear = trim((string)($options['graduation_year'] ?? ''));
    if ($graduationYear !== '') {
        $where[] = 'g.year_graduated = :year_dimension_graduation_year';
        $bindings[':year_dimension_graduation_year'] = ['value' => (int)$graduationYear, 'type' => PDO::PARAM_INT];
    }

    $stmt = $db->prepare('
        SELECT g.year_graduated AS year, COUNT(*) AS active_graduate_count
        FROM graduates g
        LEFT JOIN programs p ON p.id = g.program_id
        WHERE ' . implode(' AND ', $where) . '
        GROUP BY g.year_graduated
        ORDER BY g.year_graduated ASC
    ');
    gradtrack_analytics_bind_values($stmt, $bindings);
    $stmt->execute();

    $years = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $year = (int)$row['year'];
        if ($year < 1900 || $year > 2099) {
            continue;
        }
        $years[] = [
            'year' => $year,
            'active_graduate_count' => (int)$row['active_graduate_count'],
        ];
    }

    return $years;
}

function gradtrack_analytics_question_roles(array $questions): array
{
    $candidates = [
        'employment' => [],
        'alignment' => [],
        'work_location' => [],
    ];

    foreach ($questions as $question) {
        $questionId = (string)($question['id'] ?? '');
        if ($questionId === '') {
            continue;
        }

        $text = gradtrack_survey_normalize_text($question['question_text'] ?? '');
        $employmentScore = -1;
        if (strpos($text, 'are you presently employed') !== false) $employmentScore = 100;
        elseif (strpos($text, 'present employment status') !== false) $employmentScore = 90;
        elseif (strpos($text, 'employment status') !== false) $employmentScore = 80;
        if ($employmentScore >= 0) $candidates['employment'][] = ['id' => $questionId, 'score' => $employmentScore];

        $alignmentScore = -1;
        if (strpos($text, 'is your first job related') !== false) $alignmentScore = 100;
        elseif (strpos($text, 'job related to') !== false || strpos($text, 'related to your course') !== false) $alignmentScore = 90;
        if ($alignmentScore >= 0) $candidates['alignment'][] = ['id' => $questionId, 'score' => $alignmentScore];

        $locationScore = -1;
        if ($text === 'place of work') $locationScore = 100;
        elseif (strpos($text, 'place of work') !== false) $locationScore = 90;
        if ($locationScore >= 0) $candidates['work_location'][] = ['id' => $questionId, 'score' => $locationScore];
    }

    $roles = [];
    foreach ($candidates as $role => $roleCandidates) {
        usort($roleCandidates, static function (array $a, array $b): int {
            return ($b['score'] <=> $a['score']) ?: ((int)$a['id'] <=> (int)$b['id']);
        });
        $roles[$role] = array_column($roleCandidates, 'id');
    }

    return $roles;
}

function gradtrack_analytics_classify_employment($answer): ?string
{
    $text = gradtrack_survey_normalize_text(gradtrack_survey_answer_label($answer));
    if ($text === '' || in_array($text, ['n/a', 'na', 'not applicable', 'prefer not to say'], true)) {
        return null;
    }

    if ($text === 'no' || strpos($text, 'unemployed') !== false || strpos($text, 'not employed') !== false) {
        return 'unemployed';
    }

    if (
        $text === 'yes'
        || $text === 'employed'
        || strpos($text, 'regular') !== false
        || strpos($text, 'permanent') !== false
        || strpos($text, 'temporary') !== false
        || strpos($text, 'casual') !== false
        || strpos($text, 'contractual') !== false
        || strpos($text, 'self-employed') !== false
        || strpos($text, 'self employed') !== false
        || strpos($text, 'freelance') !== false
    ) {
        return 'employed';
    }

    return null;
}

function gradtrack_analytics_classify_alignment($answer): ?string
{
    $text = gradtrack_survey_normalize_text(gradtrack_survey_answer_label($answer));
    if ($text === '' || in_array($text, ['n/a', 'na', 'not applicable', 'prefer not to say'], true)) {
        return null;
    }

    if (strpos($text, 'partially') !== false) {
        return 'partially_aligned';
    }
    if ($text === 'no' || strpos($text, 'not related') !== false || strpos($text, 'not aligned') !== false || strpos($text, 'unrelated') !== false) {
        return 'not_aligned';
    }
    if ($text === 'yes' || strpos($text, 'directly related') !== false || strpos($text, 'aligned') !== false) {
        return 'aligned';
    }

    return null;
}

function gradtrack_analytics_classify_work_location($answer): ?string
{
    $text = gradtrack_survey_normalize_text(gradtrack_survey_answer_label($answer));
    if ($text === '') {
        return null;
    }
    if (strpos($text, 'abroad') !== false || strpos($text, 'overseas') !== false) {
        return 'abroad';
    }
    if ($text === 'local' || strpos($text, 'local') !== false) {
        return 'local';
    }

    return null;
}

function gradtrack_analytics_first_classified_answer(array $answerMap, array $questionIds, callable $classifier): ?string
{
    foreach ($questionIds as $questionId) {
        $classification = $classifier($answerMap[(string)$questionId] ?? null);
        if ($classification !== null) {
            return $classification;
        }
    }

    return null;
}

function gradtrack_analytics_build_records(array $responses, array $questions): array
{
    $roles = gradtrack_analytics_question_roles($questions);
    $records = [];

    foreach ($responses as $response) {
        $data = json_decode((string)($response['responses'] ?? ''), true);
        if (!is_array($data)) {
            continue;
        }

        $answerMap = gradtrack_survey_build_answer_map($questions, $data);
        $employmentStatus = gradtrack_analytics_first_classified_answer(
            $answerMap,
            $roles['employment'] ?? [],
            'gradtrack_analytics_classify_employment'
        );
        $alignmentStatus = null;
        $workLocation = null;
        if ($employmentStatus === 'employed') {
            $alignmentStatus = gradtrack_analytics_first_classified_answer(
                $answerMap,
                array_slice($roles['alignment'] ?? [], 0, 1),
                'gradtrack_analytics_classify_alignment'
            );
            $workLocation = gradtrack_analytics_first_classified_answer(
                $answerMap,
                array_slice($roles['work_location'] ?? [], 0, 1),
                'gradtrack_analytics_classify_work_location'
            );
        }

        $year = (int)($response['year_graduated'] ?? 0);
        $programId = isset($response['program_id']) && $response['program_id'] !== null
            ? (int)$response['program_id']
            : null;
        $programCode = strtoupper(trim((string)($response['program_code'] ?? '')));
        $programName = trim((string)($response['program_name'] ?? ''));

        $records[] = [
            'response_id' => (int)($response['response_id'] ?? $response['id'] ?? 0),
            'graduate_id' => (int)($response['graduate_id'] ?? 0),
            'program_id' => $programId,
            'program_code' => $programCode,
            'program_name' => $programName,
            'year' => $year,
            'employment_status' => $employmentStatus,
            'alignment_status' => $alignmentStatus,
            'alignment_binary' => $alignmentStatus === 'aligned'
                ? 'aligned'
                : (in_array($alignmentStatus, ['partially_aligned', 'not_aligned'], true) ? 'not_aligned' : null),
            'work_location' => $workLocation,
        ];
    }

    return $records;
}

function gradtrack_analytics_filter_records(array $records, array $options = []): array
{
    $programId = (int)($options['program_id'] ?? 0);
    $programCodes = gradtrack_analytics_normalize_program_codes($options['program_codes'] ?? null);
    $graduationYear = (int)($options['graduation_year'] ?? 0);
    $employmentStatus = strtolower(trim((string)($options['employment_status'] ?? '')));
    $alignmentStatus = strtolower(trim((string)($options['alignment_status'] ?? $options['program_alignment'] ?? '')));

    return array_values(array_filter($records, static function (array $record) use (
        $programId,
        $programCodes,
        $graduationYear,
        $employmentStatus,
        $alignmentStatus
    ): bool {
        if ($programId > 0 && (int)($record['program_id'] ?? 0) !== $programId) return false;
        if ($programCodes !== [] && !in_array((string)($record['program_code'] ?? ''), $programCodes, true)) return false;
        if ($graduationYear > 0 && (int)($record['year'] ?? 0) !== $graduationYear) return false;
        if ($employmentStatus !== '' && ($record['employment_status'] ?? null) !== $employmentStatus) return false;
        if ($alignmentStatus !== '' && ($record['alignment_binary'] ?? null) !== $alignmentStatus) return false;
        return true;
    }));
}

function gradtrack_analytics_empty_bucket(): array
{
    return [
        'response_count' => 0,
        'employed' => 0,
        'unemployed' => 0,
        'employment_total' => 0,
        'employment_unknown' => 0,
        'employment_rate' => null,
        'aligned' => 0,
        'partially_aligned' => 0,
        'explicit_not_aligned' => 0,
        'not_aligned' => 0,
        'alignment_total' => 0,
        'alignment_rate' => null,
        'employed_local' => 0,
        'employed_abroad' => 0,
    ];
}

function gradtrack_analytics_accumulate(array &$bucket, array $record): void
{
    $bucket['response_count']++;
    $employmentStatus = $record['employment_status'] ?? null;
    if ($employmentStatus === 'employed') {
        $bucket['employed']++;
        $bucket['employment_total']++;
        if (($record['work_location'] ?? null) === 'local') $bucket['employed_local']++;
        elseif (($record['work_location'] ?? null) === 'abroad') $bucket['employed_abroad']++;
    } elseif ($employmentStatus === 'unemployed') {
        $bucket['unemployed']++;
        $bucket['employment_total']++;
    } else {
        $bucket['employment_unknown']++;
    }

    if ($employmentStatus !== 'employed') {
        return;
    }

    $alignmentStatus = $record['alignment_status'] ?? null;
    if ($alignmentStatus === 'aligned') {
        $bucket['aligned']++;
        $bucket['alignment_total']++;
    } elseif ($alignmentStatus === 'partially_aligned') {
        $bucket['partially_aligned']++;
        $bucket['not_aligned']++;
        $bucket['alignment_total']++;
    } elseif ($alignmentStatus === 'not_aligned') {
        $bucket['explicit_not_aligned']++;
        $bucket['not_aligned']++;
        $bucket['alignment_total']++;
    }
}

function gradtrack_analytics_finalize_bucket(array $bucket): array
{
    $bucket['employment_rate'] = $bucket['employment_total'] > 0
        ? gradtrack_survey_percentage((int)$bucket['employed'], (int)$bucket['employment_total'], 1)
        : null;
    $bucket['alignment_rate'] = $bucket['alignment_total'] > 0
        ? gradtrack_survey_percentage((int)$bucket['aligned'], (int)$bucket['alignment_total'], 1)
        : null;

    return $bucket;
}

function gradtrack_analytics_summarize_records(array $records): array
{
    $summary = gradtrack_analytics_empty_bucket();
    foreach ($records as $record) {
        gradtrack_analytics_accumulate($summary, $record);
    }

    return gradtrack_analytics_finalize_bucket($summary);
}

function gradtrack_analytics_distribution(array $bucket): array
{
    $total = (int)($bucket['alignment_total'] ?? 0);
    return [
        [
            'name' => 'Aligned',
            'value' => (int)($bucket['aligned'] ?? 0),
            'percentage' => $total > 0
                ? gradtrack_survey_percentage((int)($bucket['aligned'] ?? 0), $total, 1)
                : null,
        ],
        [
            'name' => 'Not Aligned',
            'value' => (int)($bucket['not_aligned'] ?? 0),
            'percentage' => $total > 0
                ? gradtrack_survey_percentage((int)($bucket['not_aligned'] ?? 0), $total, 1)
                : null,
        ],
    ];
}

function gradtrack_analytics_group_by_program(array $records, array $dimensions = []): array
{
    $buckets = [];
    foreach ($dimensions as $program) {
        $key = (string)$program['program_id'];
        $buckets[$key] = array_merge(gradtrack_analytics_empty_bucket(), $program);
    }

    foreach ($records as $record) {
        $programId = (int)($record['program_id'] ?? 0);
        $key = $programId > 0 ? (string)$programId : 'unassigned';
        if (!isset($buckets[$key])) {
            $buckets[$key] = array_merge(gradtrack_analytics_empty_bucket(), [
                'program_id' => $programId > 0 ? $programId : null,
                'code' => (string)($record['program_code'] ?? '') ?: 'UNASSIGNED',
                'name' => (string)($record['program_name'] ?? '') ?: 'Program not assigned',
                'active_graduate_count' => 0,
            ]);
        }
        gradtrack_analytics_accumulate($buckets[$key], $record);
    }

    $rows = [];
    foreach ($buckets as $bucket) {
        $bucket = gradtrack_analytics_finalize_bucket($bucket);
        $bucket['distribution'] = gradtrack_analytics_distribution($bucket);
        $rows[] = $bucket;
    }
    usort($rows, static function (array $a, array $b): int {
        return strcmp((string)$a['code'], (string)$b['code']);
    });

    return $rows;
}

function gradtrack_analytics_group_by_year(array $records, array $dimensions = []): array
{
    $buckets = [];
    foreach ($dimensions as $dimension) {
        $year = (int)($dimension['year'] ?? 0);
        if ($year > 0) {
            $buckets[$year] = array_merge(gradtrack_analytics_empty_bucket(), $dimension);
        }
    }

    foreach ($records as $record) {
        $year = (int)($record['year'] ?? 0);
        if ($year <= 0) {
            continue;
        }
        if (!isset($buckets[$year])) {
            $buckets[$year] = array_merge(gradtrack_analytics_empty_bucket(), [
                'year' => $year,
                'active_graduate_count' => 0,
            ]);
        }
        gradtrack_analytics_accumulate($buckets[$year], $record);
    }

    ksort($buckets, SORT_NUMERIC);
    return array_map('gradtrack_analytics_finalize_bucket', array_values($buckets));
}

function gradtrack_analytics_calculate(PDO $db, int $surveyId, array $options = []): array
{
    $queryOptions = [
        'program_id' => $options['program_id'] ?? null,
        'program_codes' => $options['program_codes'] ?? null,
        'graduation_year' => $options['graduation_year'] ?? null,
    ];
    if (array_key_exists('allowed_graduation_years', $options)) {
        $queryOptions['allowed_graduation_years'] = $options['allowed_graduation_years'];
    }
    $responses = gradtrack_analytics_fetch_valid_responses($db, $surveyId, $queryOptions);
    $questions = gradtrack_analytics_fetch_questions($db, $surveyId);
    $records = gradtrack_analytics_build_records($responses, $questions);
    $records = gradtrack_analytics_filter_records($records, $options);

    $programDimensions = !empty($options['include_empty_programs'])
        ? gradtrack_analytics_fetch_program_dimensions($db, $queryOptions)
        : [];
    $yearDimensions = !empty($options['include_empty_years'])
        ? gradtrack_analytics_fetch_year_dimensions($db, $queryOptions)
        : [];
    $summary = gradtrack_analytics_summarize_records($records);
    $summary['distribution'] = gradtrack_analytics_distribution($summary);

    return [
        'summary' => $summary,
        'by_program' => gradtrack_analytics_group_by_program($records, $programDimensions),
        'by_year' => gradtrack_analytics_group_by_year($records, $yearDimensions),
        'records' => $records,
        'questions' => $questions,
        'responses' => $responses,
    ];
}
