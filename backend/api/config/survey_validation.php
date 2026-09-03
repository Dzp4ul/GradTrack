<?php

final class GradTrackSurveyValidationException extends RuntimeException
{
    private array $fieldErrors;

    public function __construct(array $fieldErrors)
    {
        parent::__construct('One or more survey answers are invalid.');
        $this->fieldErrors = $fieldErrors;
    }

    public function getFieldErrors(): array
    {
        return $this->fieldErrors;
    }
}

function gradtrack_survey_mb_lower(string $value): string
{
    return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
}

function gradtrack_survey_mb_length(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function gradtrack_survey_normalize_text($value): string
{
    $text = (string) ($value ?? '');
    if (class_exists('Normalizer')) {
        $normalized = Normalizer::normalize($text, Normalizer::FORM_C);
        if (is_string($normalized)) {
            $text = $normalized;
        }
    }

    $text = preg_replace('/[\x{0000}-\x{0008}\x{000B}\x{000C}\x{000E}-\x{001F}\x{007F}\x{200B}-\x{200D}\x{FEFF}]/u', '', $text) ?? '';
    $text = strip_tags($text);
    return trim((string) (preg_replace('/\s+/u', ' ', $text) ?? $text));
}

function gradtrack_survey_normalize_comparison($value): string
{
    $text = gradtrack_survey_mb_lower(gradtrack_survey_normalize_text($value));
    $text = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $text) ?? '';
    return trim($text);
}

function gradtrack_survey_is_other_option(string $option): bool
{
    $normalized = gradtrack_survey_normalize_comparison($option);
    return $normalized === 'other' || $normalized === 'others';
}

function gradtrack_survey_other_option_label(string $option): string
{
    $label = trim((string) (preg_replace('/\s*:+\s*$/u', '', $option) ?? $option));
    return $label !== '' ? $label : trim($option);
}

function gradtrack_survey_is_other_answer(string $value, string $option): bool
{
    $trimmed = trim($value);
    $label = gradtrack_survey_other_option_label($option);
    if (gradtrack_survey_normalize_comparison($trimmed) === gradtrack_survey_normalize_comparison($label)) {
        return true;
    }

    if (preg_match('/^' . preg_quote($label, '/') . '\s*:/iu', $trimmed) === 1) {
        return true;
    }

    return gradtrack_survey_is_other_option($option)
        && preg_match('/^(other|others)\s*:/iu', $trimmed) === 1;
}

function gradtrack_survey_other_answer_text(string $value, string $option): string
{
    $label = gradtrack_survey_other_option_label($option);
    if (preg_match('/^' . preg_quote($label, '/') . '\s*:(.*)$/isu', $value, $matches) === 1) {
        return (string) ($matches[1] ?? '');
    }

    if (gradtrack_survey_normalize_comparison($value) === gradtrack_survey_normalize_comparison($label)) {
        return '';
    }

    if (gradtrack_survey_is_other_option($option)
        && preg_match('/^(other|others)\s*:(.*)$/isu', $value, $matches) === 1) {
        return (string) ($matches[2] ?? '');
    }

    return '';
}

function gradtrack_survey_classify_text_field(array $question): string
{
    $text = gradtrack_survey_normalize_comparison($question['question_text'] ?? '');
    $questionType = (string) ($question['question_type'] ?? 'text');

    if (preg_match('/\b(e mail|email)\b/', $text)) return 'EMAIL';
    if (preg_match('/\b(mobile|cellphone|telephone|phone|contact number|contact no)\b/', $text)) return 'PHONE';
    if (preg_match('/\b(earned units?|units earned)\b/', $text)) return 'NUMERIC';
    if (preg_match('/\b(year graduated|year of graduation|graduation year|yr graduated)\b/', $text)) return 'NUMERIC';
    if ($questionType === 'text' && preg_match('/(^|\s)rating($|\s)/', $text)) return 'NUMERIC';

    if (preg_match('/\b(first name|middle name|last name|surname|given name|family name|full name)\b/', $text)
        && !preg_match('/\b(company|organization|institution|school|college|university|program|examination)\b/', $text)) {
        return 'PERSON_NAME';
    }

    if (preg_match('/\b(mobile address|address|region|province|city|municipality|barangay|place of residence)\b/', $text)) {
        return 'ADDRESS';
    }

    if (preg_match('/\b(occupation|position|designation|job title|profession)\b/', $text)) return 'OCCUPATION';
    if (preg_match('/\b(company|organization|employer|business name)\b/', $text)) return 'COMPANY_NAME';
    if (preg_match('/\b(school|college|university|training institution|institution name)\b/', $text)) return 'SCHOOL_NAME';
    if (preg_match('/\b(duration|length of training)\b/', $text)) return 'DURATION';

    if (preg_match('/\b(reason|what made|other competencies|other skills)\b/', $text)) return 'SHORT_TEXT';
    if (preg_match('/\b(suggestion|suggest|improvement|describe|explain|what skills|what competencies|additional skills)\b/', $text)) {
        return 'LONG_TEXT';
    }

    if (preg_match('/\b(graduate program|degree program|course title|name of examination|title of training|program name)\b/', $text)) {
        return 'PROGRAM_NAME';
    }

    return $questionType === 'text' ? 'SHORT_TEXT' : 'LONG_TEXT';
}

function gradtrack_survey_has_keyboard_run(string $token): bool
{
    $rows = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
    $length = strlen($token);
    foreach ($rows as $row) {
        $reverse = strrev($row);
        for ($index = 0; $index <= $length - 4; $index++) {
            $fragment = substr($token, $index, 4);
            if (strpos($row, $fragment) !== false || strpos($reverse, $fragment) !== false) {
                return true;
            }
        }
    }

    return false;
}

function gradtrack_survey_is_keyboard_fragment(string $fragment): bool
{
    if (strlen($fragment) < 3) return false;
    foreach (['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as $row) {
        if (strpos($row, $fragment) !== false || strpos(strrev($row), $fragment) !== false) return true;
    }
    return false;
}

function gradtrack_survey_has_repeated_pattern(string $letters, bool $allowLoosePrefix = true): bool
{
    if (preg_match('/([\p{L}])\1{4,}/u', $letters) === 1) return true;

    $letterLength = gradtrack_survey_mb_length($letters);
    $maxPatternLength = min(6, (int) floor($letterLength / 3));
    for ($patternLength = 2; $patternLength <= $maxPatternLength; $patternLength++) {
        $pattern = function_exists('mb_substr')
            ? mb_substr($letters, 0, $patternLength, 'UTF-8')
            : substr($letters, 0, $patternLength);
        $repetitions = 0;
        while (true) {
            $fragment = function_exists('mb_substr')
                ? mb_substr($letters, $repetitions * $patternLength, $patternLength, 'UTF-8')
                : substr($letters, $repetitions * $patternLength, $patternLength);
            if ($fragment !== $pattern) break;
            $repetitions++;
        }
        $coveredLength = $repetitions * $patternLength;
        if ($repetitions >= 3 && $letterLength - $coveredLength <= 1) return true;
    }

    if ($allowLoosePrefix
        && strlen($letters) >= 8
        && preg_match('/^([a-z]{2,3})\1([a-z]{1,5})$/i', $letters, $matches) === 1) {
        return gradtrack_survey_is_keyboard_fragment(strtolower((string) ($matches[1] ?? '')));
    }

    return false;
}

function gradtrack_survey_gibberish_result(string $value, string $fieldType = 'SHORT_TEXT'): array
{
    preg_match_all('/[\p{L}\p{M}]+/u', gradtrack_survey_mb_lower($value), $matches);
    $tokens = $matches[0] ?? [];
    $compactLetters = implode('', $tokens);
    if ($compactLetters === '') {
        return ['gibberish' => false, 'keyboard' => false];
    }

    $properNounFriendly = in_array($fieldType, ['PERSON_NAME', 'SCHOOL_NAME', 'COMPANY_NAME', 'ADDRESS'], true);
    if (gradtrack_survey_has_repeated_pattern($compactLetters, true)) {
        return ['gibberish' => true, 'keyboard' => false];
    }

    foreach ($tokens as $token) {
        if (strlen($token) >= 4 && gradtrack_survey_has_keyboard_run($token)) {
            return ['gibberish' => true, 'keyboard' => true];
        }
    }

    if ($properNounFriendly) {
        return ['gibberish' => false, 'keyboard' => false];
    }

    foreach ($tokens as $token) {
        if (gradtrack_survey_mb_length($token) < 7) continue;
        preg_match_all('/[^aeiouyáéíóúàèìòùâêîôûäëïöüñ]+/iu', $token, $runs);
        foreach (($runs[0] ?? []) as $run) {
            if (gradtrack_survey_mb_length($run) >= 7) {
                return ['gibberish' => true, 'keyboard' => false];
            }
        }
    }

    return ['gibberish' => false, 'keyboard' => false];
}

function gradtrack_survey_common_phrases(string $fieldType): array
{
    $phrases = [
        'OCCUPATION' => [
            'Software Engineer',
            'Web Developer',
            'Civil Engineer',
            'Call Center Agent',
            'IT Support Specialist',
            'Administrative Assistant',
            'Computer Programmer',
            'Data Analyst',
            'Grade School Teacher',
        ],
        'PROGRAM_NAME' => [
            'Master of Information Technology',
            'Master of Science in Information Technology',
            'Master of Science in Computer Science',
            'Master of Arts in Education',
            'Master of Science in Hospitality Management',
        ],
    ];

    return $phrases[$fieldType] ?? [];
}

function gradtrack_survey_safe_spelling_suggestion(string $value, string $fieldType): ?string
{
    $comparableValue = gradtrack_survey_normalize_comparison($value);
    if ($comparableValue === '') return null;

    $valueWordCount = count(array_values(array_filter(explode(' ', $comparableValue))));
    $closest = null;
    $closestDistance = PHP_INT_MAX;
    foreach (gradtrack_survey_common_phrases($fieldType) as $phrase) {
        $comparablePhrase = gradtrack_survey_normalize_comparison($phrase);
        $phraseWordCount = count(array_values(array_filter(explode(' ', $comparablePhrase))));
        if ($phraseWordCount !== $valueWordCount) continue;

        $distance = levenshtein($comparableValue, $comparablePhrase);
        if ($distance > 0 && $distance <= 2 && $distance < $closestDistance) {
            $closest = $phrase;
            $closestDistance = $distance;
        }
    }

    return $closest;
}

function gradtrack_survey_field_max_length(string $fieldType): int
{
    $lengths = [
        'PERSON_NAME' => 120,
        'OCCUPATION' => 160,
        'PROGRAM_NAME' => 200,
        'SCHOOL_NAME' => 200,
        'COMPANY_NAME' => 200,
        'ADDRESS' => 250,
        'DURATION' => 80,
        'SHORT_TEXT' => 250,
        'LONG_TEXT' => 1200,
        'NUMERIC' => 20,
        'EMAIL' => 254,
        'PHONE' => 30,
    ];

    return $lengths[$fieldType] ?? 250;
}

function gradtrack_survey_validation_result(bool $isValid, $value, ?string $error = null, ?string $code = null): array
{
    $result = ['is_valid' => $isValid, 'value' => $value];
    if ($error !== null) $result['error'] = $error;
    if ($code !== null) $result['code'] = $code;
    return $result;
}

function gradtrack_survey_validate_text($value, string $fieldType, array $options = []): array
{
    $normalized = gradtrack_survey_normalize_text($value);
    $required = !empty($options['required']);
    if ($normalized === '') {
        return $required
            ? gradtrack_survey_validation_result(false, '', 'This field is required.', 'required')
            : gradtrack_survey_validation_result(true, '');
    }

    if (gradtrack_survey_mb_length($normalized) > gradtrack_survey_field_max_length($fieldType)) {
        return gradtrack_survey_validation_result(false, $normalized, 'Please shorten your answer.', 'too_long');
    }

    if ($fieldType === 'EMAIL') {
        return filter_var($normalized, FILTER_VALIDATE_EMAIL) !== false
            ? gradtrack_survey_validation_result(true, $normalized)
            : gradtrack_survey_validation_result(false, $normalized, 'Please enter a valid email address.', 'email');
    }

    if ($fieldType === 'PHONE') {
        $compactPhone = preg_replace('/[\s().-]/', '', $normalized) ?? '';
        return preg_match('/^(?:\+63\d{9,10}|0\d{9,10})$/', $compactPhone) === 1
            ? gradtrack_survey_validation_result(true, $normalized)
            : gradtrack_survey_validation_result(false, $normalized, 'Please enter a valid Philippine phone number.', 'phone');
    }

    if ($fieldType === 'NUMERIC') {
        if (preg_match('/^\d+(?:\.\d+)?$/', $normalized) !== 1) {
            return gradtrack_survey_validation_result(false, $normalized, 'Please enter a valid number.', 'numeric');
        }

        $numberValue = (float) $normalized;
        if ((isset($options['min']) && $numberValue < (float) $options['min'])
            || (isset($options['max']) && $numberValue > (float) $options['max'])) {
            return gradtrack_survey_validation_result(false, $normalized, 'Please enter a valid number.', 'numeric_range');
        }

        return gradtrack_survey_validation_result(true, $normalized);
    }

    preg_match_all('/[^\p{L}\p{M}\p{N}\s.,\'’\/&()#+-]/u', $normalized, $symbolMatches);
    $unwantedSymbolCount = count($symbolMatches[0] ?? []);
    if (preg_match('/[@$%^*_={}\[\]\\\\|<>~`!]{3,}/u', $normalized) === 1
        || $unwantedSymbolCount / max(gradtrack_survey_mb_length($normalized), 1) > 0.2) {
        return gradtrack_survey_validation_result(false, $normalized, 'Please remove unnecessary special characters.', 'symbols');
    }

    if (preg_match('/[\p{L}\p{M}]/u', $normalized) !== 1) {
        return gradtrack_survey_validation_result(false, $normalized, 'Please enter a valid answer using words.', 'words_required');
    }

    if ($fieldType === 'PERSON_NAME'
        && preg_match('/^[\p{L}\p{M} .\-\'’]+$/u', $normalized) !== 1) {
        return gradtrack_survey_validation_result(false, $normalized, 'Please enter a valid and readable answer.', 'name');
    }

    $placeholders = ['test', 'testing', 'sample', 'asdf', 'qwerty', 'n a', 'na', 'none'];
    if (in_array(gradtrack_survey_normalize_comparison($normalized), $placeholders, true)) {
        return gradtrack_survey_validation_result(false, $normalized, 'Please enter a valid and readable answer.', 'placeholder');
    }

    $gibberish = gradtrack_survey_gibberish_result($normalized, $fieldType);
    if ($gibberish['gibberish']) {
        return gradtrack_survey_validation_result(
            false,
            $normalized,
            $gibberish['keyboard']
                ? 'Please enter a meaningful answer instead of random characters.'
                : 'Please enter a valid and readable answer.',
            $gibberish['keyboard'] ? 'keyboard_input' : 'gibberish'
        );
    }

    preg_match_all('/[\p{L}\p{M}]/u', $normalized, $letterMatches);
    preg_match_all('/[\p{L}\p{M}]+/u', $normalized, $wordMatches);
    $letterCount = count($letterMatches[0] ?? []);
    $wordCount = count($wordMatches[0] ?? []);
    if ($fieldType === 'LONG_TEXT' && ($letterCount < 6 || ($wordCount < 2 && $letterCount < 8))) {
        return gradtrack_survey_validation_result(false, $normalized, 'Please provide a more complete answer.', 'too_short');
    }

    $suggestion = gradtrack_survey_safe_spelling_suggestion($normalized, $fieldType);
    if ($suggestion !== null) {
        return gradtrack_survey_validation_result(
            false,
            $normalized,
            "Please check the spelling. Did you mean '{$suggestion}'?",
            'spelling'
        );
    }

    return gradtrack_survey_validation_result(true, $normalized);
}

function gradtrack_survey_question_options(array $question): array
{
    $options = $question['options'] ?? [];
    if (is_string($options)) {
        $decoded = json_decode($options, true);
        $options = is_array($decoded) ? $decoded : [];
    }

    return is_array($options) ? array_values(array_map('strval', $options)) : [];
}

function gradtrack_survey_numeric_options(array $question): array
{
    $text = gradtrack_survey_normalize_comparison($question['question_text'] ?? '');
    if (preg_match('/\bearned units?\b/', $text)) return ['min' => 0, 'max' => 300];
    if (preg_match('/\b(year graduated|year of graduation|graduation year|yr graduated)\b/', $text)) {
        return ['min' => 1900, 'max' => ((int) date('Y')) + 1];
    }
    if (preg_match('/\brating\b/', $text)) return ['min' => 0, 'max' => 100];
    return [];
}

function gradtrack_survey_validate_other_detail(array $question, string $option, string $answer): array
{
    $detail = gradtrack_survey_other_answer_text($answer, $option);
    $result = gradtrack_survey_validate_text($detail, gradtrack_survey_classify_text_field($question), ['required' => true]);
    if (!$result['is_valid']) {
        if (($result['code'] ?? '') === 'required') {
            $result['error'] = 'Please specify your answer.';
        }
        return $result;
    }

    return gradtrack_survey_validation_result(
        true,
        gradtrack_survey_other_option_label($option) . ': ' . $result['value']
    );
}

function gradtrack_survey_answer_is_empty($answer): bool
{
    if (is_array($answer)) return count($answer) === 0;
    return gradtrack_survey_normalize_text($answer) === '';
}

function gradtrack_survey_validate_question_answer(array $question, $answer): array
{
    $required = (int) ($question['is_required'] ?? 0) === 1;
    if ($answer !== null && !is_scalar($answer) && !is_array($answer)) {
        return gradtrack_survey_validation_result(false, '', 'Please enter a valid answer.', 'invalid_type');
    }

    if (gradtrack_survey_answer_is_empty($answer)) {
        return $required
            ? gradtrack_survey_validation_result(false, $answer, 'This field is required.', 'required')
            : gradtrack_survey_validation_result(true, is_array($answer) ? [] : '');
    }

    $questionType = (string) ($question['question_type'] ?? 'text');
    if ($questionType === 'date') {
        if (is_array($answer)) {
            return gradtrack_survey_validation_result(false, '', 'Please enter a valid date.', 'date');
        }
        $normalized = gradtrack_survey_normalize_text($answer);
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $normalized);
        $isValid = $date instanceof DateTimeImmutable && $date->format('Y-m-d') === $normalized;
        return $isValid
            ? gradtrack_survey_validation_result(true, $normalized)
            : gradtrack_survey_validation_result(false, $normalized, 'Please enter a valid date.', 'date');
    }

    if ($questionType === 'rating') {
        if (is_array($answer) || filter_var($answer, FILTER_VALIDATE_INT) === false) {
            return gradtrack_survey_validation_result(false, $answer, 'Please select a valid rating.', 'rating');
        }
        $rating = (int) $answer;
        return $rating >= 1 && $rating <= 5
            ? gradtrack_survey_validation_result(true, $rating)
            : gradtrack_survey_validation_result(false, $answer, 'Please select a valid rating.', 'rating');
    }

    if (in_array($questionType, ['multiple_choice', 'radio', 'checkbox'], true)) {
        $options = gradtrack_survey_question_options($question);
        $otherOption = null;
        foreach ($options as $option) {
            if (gradtrack_survey_is_other_option($option)) {
                $otherOption = $option;
                break;
            }
        }

        if ($questionType !== 'checkbox' && is_array($answer)) {
            return gradtrack_survey_validation_result(false, $answer, 'Please select a valid option.', 'option');
        }

        $submittedValues = is_array($answer) ? array_values($answer) : [$answer];
        $normalizedValues = [];
        foreach ($submittedValues as $submittedValue) {
            if (!is_scalar($submittedValue)) {
                return gradtrack_survey_validation_result(false, $answer, 'Please select a valid option.', 'option');
            }
            $submittedText = (string) $submittedValue;
            if ($otherOption !== null && gradtrack_survey_is_other_answer($submittedText, $otherOption)) {
                $otherResult = gradtrack_survey_validate_other_detail($question, $otherOption, $submittedText);
                if (!$otherResult['is_valid']) return $otherResult;
                $normalizedValues[] = $otherResult['value'];
                continue;
            }

            if (!in_array($submittedText, $options, true)) {
                return gradtrack_survey_validation_result(false, $answer, 'Please select a valid option.', 'option');
            }
            $normalizedValues[] = $submittedText;
        }

        return gradtrack_survey_validation_result(
            true,
            $questionType === 'checkbox' ? $normalizedValues : ($normalizedValues[0] ?? '')
        );
    }

    if (is_array($answer)) {
        return gradtrack_survey_validation_result(false, '', 'Please enter a valid answer.', 'invalid_type');
    }

    return gradtrack_survey_validate_text(
        $answer,
        gradtrack_survey_classify_text_field($question),
        array_merge(['required' => $required], gradtrack_survey_numeric_options($question))
    );
}

function gradtrack_survey_find_question(array $questions, string $section, string $text): ?array
{
    $normalizedSection = gradtrack_survey_normalize_comparison($section);
    $normalizedText = gradtrack_survey_normalize_comparison($text);
    foreach ($questions as $question) {
        $questionSection = gradtrack_survey_normalize_comparison($question['section'] ?? '');
        $questionText = gradtrack_survey_normalize_comparison($question['question_text'] ?? '');
        if (strpos($questionSection, $normalizedSection) !== false && strpos($questionText, $normalizedText) !== false) {
            return $question;
        }
    }

    return null;
}

function gradtrack_survey_response_value(array $responses, ?array $question)
{
    $id = isset($question['id']) ? (int) $question['id'] : 0;
    return $id > 0 && array_key_exists($id, $responses) ? $responses[$id] : null;
}

function gradtrack_survey_answer_comparison($answer): string
{
    if (is_array($answer)) {
        return gradtrack_survey_normalize_comparison(implode(' ', array_map('strval', $answer)));
    }
    return gradtrack_survey_normalize_comparison($answer);
}

function gradtrack_survey_question_is_active(array $question, array $questions, array $responses): bool
{
    $section = gradtrack_survey_normalize_comparison($question['section'] ?? '');
    $text = gradtrack_survey_normalize_comparison($question['question_text'] ?? '');

    if (strpos($section, 'employment data') !== false) {
        $employedQuestion = gradtrack_survey_find_question($questions, 'Employment Data', 'Are you presently employed');
        if ($employedQuestion !== null) {
            $employedId = (int) ($employedQuestion['id'] ?? 0);
            if ((int) ($question['id'] ?? 0) !== $employedId) {
                $employedAnswer = gradtrack_survey_answer_comparison(gradtrack_survey_response_value($responses, $employedQuestion));
                $isNotEmployedReason = strpos($text, 'reason s why you are not yet employed') !== false;
                if ($isNotEmployedReason) return $employedAnswer === 'no';
                if ($employedAnswer !== 'yes') return false;
            }
        }
    }

    if (strpos($section, 'educational background') !== false
        && (strpos($text, 'date taken') !== false || preg_match('/(^|\s)rating($|\s)/', $text))) {
        $control = gradtrack_survey_find_question($questions, 'Educational Background', 'Name of Examination');
        return gradtrack_survey_answer_comparison(gradtrack_survey_response_value($responses, $control)) !== '';
    }

    if (strpos($section, 'trainings attended after college') !== false
        && (strpos($text, 'duration') !== false || strpos($text, 'name of training institution') !== false)) {
        $control = gradtrack_survey_find_question($questions, 'Trainings Attended After College', 'Title of Training');
        return gradtrack_survey_answer_comparison(gradtrack_survey_response_value($responses, $control)) !== '';
    }

    if (strpos($section, 'graduate studies') !== false
        && (strpos($text, 'earned units') !== false
            || strpos($text, 'name of college university') !== false
            || strpos($text, 'what made you pursue advance studies') !== false)) {
        $control = gradtrack_survey_find_question($questions, 'Graduate Studies', 'Name of Graduate Program');
        return gradtrack_survey_answer_comparison(gradtrack_survey_response_value($responses, $control)) !== '';
    }

    if (strpos($section, 'employment data') !== false && strpos($text, 'if self employed') !== false) {
        $control = gradtrack_survey_find_question($questions, 'Employment Data', 'Present Employment Status');
        return strpos(gradtrack_survey_answer_comparison(gradtrack_survey_response_value($responses, $control)), 'self employed') !== false;
    }

    if (strpos($section, 'employment data') !== false && strpos($text, 'reason s for staying on the job') !== false) {
        $control = gradtrack_survey_find_question($questions, 'Employment Data', 'Is this your first job after college');
        return strpos(gradtrack_survey_answer_comparison(gradtrack_survey_response_value($responses, $control)), 'yes') === 0;
    }

    if (strpos($section, 'employment data') !== false && strpos($text, 'reason s for changing job') !== false) {
        $control = gradtrack_survey_find_question($questions, 'Employment Data', 'Is this your first job after college');
        return strpos(gradtrack_survey_answer_comparison(gradtrack_survey_response_value($responses, $control)), 'no') === 0;
    }

    if (strpos($section, 'employment data') !== false && strpos($text, 'what competencies were useful') !== false) {
        $control = gradtrack_survey_find_question($questions, 'Employment Data', 'college curriculum relevant');
        return strpos(gradtrack_survey_answer_comparison(gradtrack_survey_response_value($responses, $control)), 'yes') === 0;
    }

    return true;
}

function gradtrack_survey_validate_responses(array $questions, array $responses, array $skipQuestionIds = []): array
{
    $normalizedResponses = [];
    if (isset($responses['__psgc_address']) && is_array($responses['__psgc_address'])) {
        $normalizedResponses['__psgc_address'] = $responses['__psgc_address'];
    }

    $skipMap = array_fill_keys(array_map('intval', $skipQuestionIds), true);
    $errors = [];
    foreach ($questions as $question) {
        $questionId = (int) ($question['id'] ?? 0);
        if ($questionId <= 0 || (string) ($question['question_type'] ?? '') === 'header') continue;
        if (!gradtrack_survey_question_is_active($question, $questions, $responses)) continue;

        $answer = array_key_exists($questionId, $responses) ? $responses[$questionId] : null;
        if (isset($skipMap[$questionId])) {
            if ($answer !== null && !is_array($answer)) {
                $normalizedAnswer = gradtrack_survey_normalize_text($answer);
                if ($normalizedAnswer !== '') $normalizedResponses[$questionId] = $normalizedAnswer;
            }
            continue;
        }

        $result = gradtrack_survey_validate_question_answer($question, $answer);
        if (!$result['is_valid']) {
            $errors[$questionId] = $result['error'] ?? 'Please enter a valid and readable answer.';
            continue;
        }

        $normalizedAnswer = $result['value'];
        if ($normalizedAnswer !== '' && (!is_array($normalizedAnswer) || count($normalizedAnswer) > 0)) {
            $normalizedResponses[$questionId] = $normalizedAnswer;
        }
    }

    return [
        'is_valid' => count($errors) === 0,
        'responses' => $normalizedResponses,
        'errors' => $errors,
        'first_invalid_question_id' => count($errors) > 0 ? (int) array_key_first($errors) : null,
    ];
}
