<?php
require_once __DIR__ . '/../api/config/survey_validation.php';

$failures = 0;

function survey_validation_assert(bool $condition, string $message): void
{
    global $failures;
    if (!$condition) {
        $failures++;
        echo "FAIL: {$message}" . PHP_EOL;
        return;
    }

    echo "PASS: {$message}" . PHP_EOL;
}

function survey_validation_question(string $text, string $type = 'text', array $options = [], bool $required = true): array
{
    return [
        'id' => 1,
        'section' => 'Test',
        'question_text' => $text,
        'question_type' => $type,
        'options' => $options,
        'is_required' => $required ? 1 : 0,
        'sort_order' => 1,
    ];
}

$validCases = [
    ['Master of Information Technology', 'Name of Graduate Program'],
    ['Master of Science in Computer Science', 'Name of Graduate Program'],
    ['Software Engineer', 'Present Occupation'],
    ['Web Developer', 'Present Occupation'],
    ['Guro', 'Present Occupation'],
    ['Guro sa Elementarya', 'Present Occupation'],
    ['Self-employed', 'Present Occupation'],
    ['BPO Agent', 'Present Occupation'],
    ['IT Staff', 'Present Occupation'],
    ['UI/UX Designer', 'Present Occupation'],
    ['Norzagaray College', 'Name of College/University'],
    ['Bulacan State University', 'Name of College/University'],
    ['San Jose del Monte', 'City/Municipality'],
    ['Quezon City', 'City/Municipality'],
    ['ABC Technologies Inc.', 'Company/Organization name'],
    ['J.P. Construction Services', 'Company/Organization name'],
    ['Programmer sa isang private company', 'Present Occupation'],
    ["St. Mary's College", 'Name of College/University'],
    ['Norzagaray', 'City/Municipality'],
    ['Master sa Pamamahala', 'Name of Graduate Program'],
    ['Negosyante', 'Present Occupation'],
    ['DepEd', 'Company/Organization name'],
    ['SM', 'Company/Organization name'],
    ['IBM', 'Company/Organization name'],
];

foreach ($validCases as [$value, $questionText]) {
    $question = survey_validation_question($questionText);
    $result = gradtrack_survey_validate_question_answer($question, $value);
    survey_validation_assert($result['is_valid'], "valid multilingual/proper-noun value '{$value}' is accepted");
}

$invalidCases = [
    'asdasdweqw',
    'xxxxxsdsda',
    'qwertyuiop',
    'asdfghjkl',
    'zzzzzzzzzz',
    'aaaaaaaaaa',
    'abcabcabcabc',
    'sdsdsdsdsd',
    '@@@###',
    '123123123',
    '!!!@@@123',
    'testtesttest',
    'hahahahahahah',
];

foreach ($invalidCases as $value) {
    $result = gradtrack_survey_validate_text($value, 'SHORT_TEXT', ['required' => true]);
    survey_validation_assert(!$result['is_valid'], "gibberish value '{$value}' is rejected");
}

$companyGarbage = gradtrack_survey_validate_text('asdasdweqw', 'COMPANY_NAME', ['required' => true]);
survey_validation_assert(!$companyGarbage['is_valid'], 'obvious keyboard-pattern garbage is rejected in a proper-noun-friendly field');
$repeatedProperNoun = gradtrack_survey_validate_text('Bonbon Shop', 'COMPANY_NAME', ['required' => true]);
survey_validation_assert($repeatedProperNoun['is_valid'], 'a plausible repeated-syllable proper noun is not rejected');

$blankResult = gradtrack_survey_validate_text('        ', 'SHORT_TEXT', ['required' => true]);
survey_validation_assert(!$blankResult['is_valid'], 'whitespace-only required value is rejected');

$normalized = gradtrack_survey_validate_text('   Software     Engineer   ', 'OCCUPATION', ['required' => true]);
survey_validation_assert(
    $normalized['is_valid'] && $normalized['value'] === 'Software Engineer',
    'leading, trailing, and repeated spaces are normalized before storage'
);

$hyphenated = gradtrack_survey_validate_text('Self-employed', 'OCCUPATION', ['required' => true]);
survey_validation_assert($hyphenated['is_valid'] && $hyphenated['value'] === 'Self-employed', 'hyphens are preserved');

$typo = gradtrack_survey_validate_text('Softwre Enginer', 'OCCUPATION', ['required' => true]);
survey_validation_assert(
    !$typo['is_valid'] && strpos((string) ($typo['error'] ?? ''), 'Software Engineer') !== false,
    'a high-confidence common-title typo gets a suggestion without auto-correction'
);

$earnedUnitsQuestion = survey_validation_question('Earned Units');
survey_validation_assert(
    gradtrack_survey_validate_question_answer($earnedUnitsQuestion, '36')['is_valid'],
    'reasonable earned units are accepted'
);
survey_validation_assert(
    !gradtrack_survey_validate_question_answer($earnedUnitsQuestion, 'thirty-six')['is_valid'],
    'letters are rejected for earned units'
);
survey_validation_assert(
    !gradtrack_survey_validate_question_answer($earnedUnitsQuestion, '999')['is_valid'],
    'unreasonable earned units are rejected'
);

$emailQuestion = survey_validation_question('Email Address');
survey_validation_assert(
    gradtrack_survey_validate_question_answer($emailQuestion, 'graduate@example.com')['is_valid'],
    'valid email is accepted'
);
survey_validation_assert(
    !gradtrack_survey_validate_question_answer($emailQuestion, 'graduate-at-example')['is_valid'],
    'invalid email is rejected'
);

$phoneQuestion = survey_validation_question('Mobile Number');
survey_validation_assert(
    gradtrack_survey_validate_question_answer($phoneQuestion, '+63 917 123 4567')['is_valid'],
    'valid Philippine mobile number is accepted'
);
survey_validation_assert(
    !gradtrack_survey_validate_question_answer($phoneQuestion, '12345')['is_valid'],
    'invalid Philippine phone number is rejected'
);

$otherQuestion = survey_validation_question(
    'Name of Graduate Program',
    'radio',
    ['Master of Arts in Education', 'Other:'],
    false
);
$otherResult = gradtrack_survey_validate_question_answer(
    $otherQuestion,
    'Other:   Master   of Information Technology  '
);
survey_validation_assert(
    $otherResult['is_valid'] && $otherResult['value'] === 'Other: Master of Information Technology',
    'Other detail is validated and normalized without losing internal word boundaries'
);
$blankOtherResult = gradtrack_survey_validate_question_answer($otherQuestion, 'Other:');
survey_validation_assert(
    !$blankOtherResult['is_valid'] && ($blankOtherResult['error'] ?? '') === 'Please specify your answer.',
    'selected Other option requires a real detail'
);

$conditionalQuestions = [
    [
        'id' => 10,
        'section' => 'Employment Data',
        'question_text' => 'Are you presently employed?',
        'question_type' => 'multiple_choice',
        'options' => ['Yes', 'No'],
        'is_required' => 1,
        'sort_order' => 1,
    ],
    [
        'id' => 11,
        'section' => 'Employment Data',
        'question_text' => 'Present Occupation',
        'question_type' => 'text',
        'options' => null,
        'is_required' => 1,
        'sort_order' => 2,
    ],
    [
        'id' => 12,
        'section' => 'Employment Data',
        'question_text' => 'Reason(s) why you are not yet employed',
        'question_type' => 'checkbox',
        'options' => ['Advance or further study', 'Other:'],
        'is_required' => 0,
        'sort_order' => 3,
    ],
];
$notEmployed = gradtrack_survey_validate_responses($conditionalQuestions, [
    10 => 'No',
    11 => 'qwertyuiop',
]);
survey_validation_assert(
    $notEmployed['is_valid'] && !array_key_exists(11, $notEmployed['responses']),
    'inactive conditional answers are ignored instead of stored'
);

$employed = gradtrack_survey_validate_responses($conditionalQuestions, [
    10 => 'Yes',
    11 => 'qwertyuiop',
]);
survey_validation_assert(
    !$employed['is_valid'] && isset($employed['errors'][11]),
    'active employment text is authoritatively validated'
);

if ($failures > 0) {
    echo PHP_EOL . "{$failures} survey validation rule test(s) failed." . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All survey validation rule tests passed.' . PHP_EOL;
