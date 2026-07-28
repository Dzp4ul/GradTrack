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

