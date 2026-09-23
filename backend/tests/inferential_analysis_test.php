<?php

require_once __DIR__ . '/../api/config/inferential_analysis.php';

$failures = 0;

function inferential_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function inferential_assert_close(float $actual, float $expected, float $tolerance, string $message): void
{
    inferential_assert(abs($actual - $expected) <= $tolerance, $message . " (actual={$actual}, expected={$expected})");
}

function inferential_records_from_table(array $table): array
{
    $records = [];
    foreach ($table as $rowIndex => $row) {
        foreach ($row as $columnIndex => $count) {
            for ($index = 0; $index < $count; $index++) {
                $records[] = [
                    'program_code' => $rowIndex === 0 ? 'PROGRAM_A' : 'PROGRAM_B',
                    'employment_status' => $columnIndex === 0 ? 'employed' : 'unemployed',
                ];
            }
        }
    }
    return $records;
}

// Independently verified with Excel CHISQ.DIST.RT(4, 1), which returned
// 0.045500263896358382. The table gives expected=25 in every cell,
// chi2=4, df=1, and Cramer's V=0.2.
$result = gradtrack_inferential_analyze_records(
    inferential_records_from_table([[20, 30], [30, 20]]),
    'program',
    'employment_status'
);

inferential_assert($result['status'] === 'complete', 'controlled dataset produces a complete analysis');
inferential_assert($result['analysis']['validResponses'] === 100, 'valid paired-response count is exact');
inferential_assert($result['analysis']['excludedResponses'] === 0, 'no complete controlled rows are excluded');
inferential_assert($result['contingencyTable']['rows'][0]['frequencies'] === [20, 30], 'observed frequencies are exact');
inferential_assert_close((float)$result['expectedFrequencies']['rows'][0]['frequencies'][0], 25.0, 1e-12, 'expected frequency uses row total times column total over grand total');
inferential_assert_close((float)$result['analysis']['chiSquare'], 4.0, 1e-12, 'Chi-Square statistic matches the independent calculation');
inferential_assert($result['analysis']['degreesOfFreedom'] === 1, 'degrees of freedom equals (r-1)(c-1)');
inferential_assert_close((float)$result['analysis']['pValue'], 0.045500263896358382, 1e-12, 'p-value matches Excel CHISQ.DIST.RT');
inferential_assert_close((float)$result['analysis']['cramersV'], 0.2, 1e-12, "Cramer's V matches the verified value");
inferential_assert($result['analysis']['significant'] === true, 'p below 0.05 is statistically significant');
inferential_assert($result['analysis']['associationStrength'] === 'Weak', "Cramer's V threshold is applied consistently");
inferential_assert($result['assumptions']['passed'] === true, 'well-sized expected frequencies pass assumption checks');

$recordsWithMissing = inferential_records_from_table([[20, 30], [30, 20]]);
$recordsWithMissing[] = ['program_code' => 'PROGRAM_A', 'employment_status' => null];
$recordsWithMissing[] = ['program_code' => '', 'employment_status' => 'employed'];
$missingResult = gradtrack_inferential_analyze_records($recordsWithMissing, 'program', 'employment_status');
inferential_assert($missingResult['analysis']['validResponses'] === 100, 'missing values are never treated as categories');
inferential_assert($missingResult['analysis']['excludedResponses'] === 2, 'missing paired responses are reported as excluded');

$completedRecords = gradtrack_inferential_complete_record_set(
    [['response_id' => 10, 'graduate_id' => 2, 'program_code' => 'PROGRAM_A', 'year_graduated' => 2025]],
    []
);
inferential_assert(count($completedRecords) === 1, 'a malformed response remains in the candidate denominator');
inferential_assert($completedRecords[0]['employment_status'] === null, 'a malformed response is retained as missing, not invented');

$sparseResult = gradtrack_inferential_analyze_records(
    inferential_records_from_table([[1, 0], [0, 1]]),
    'program',
    'employment_status'
);
inferential_assert($sparseResult['assumptions']['cellsBelowOne'] === 4, 'expected frequencies below 1 are detected');
inferential_assert($sparseResult['assumptions']['passed'] === false, 'sparse tables show an assumption warning');

$oneCategory = gradtrack_inferential_analyze_records(
    array_fill(0, 10, ['program_code' => 'PROGRAM_A', 'employment_status' => 'employed']),
    'program',
    'employment_status'
);
inferential_assert($oneCategory['status'] === 'insufficient_variation', 'one-category input is not calculated');
inferential_assert($oneCategory['analysis']['chiSquare'] === null, 'invalid tables never return NaN or Infinity');

try {
    gradtrack_inferential_analyze_records([], 'program', 'program');
    inferential_assert(false, 'same-variable analysis is rejected');
} catch (InvalidArgumentException $exception) {
    inferential_assert(
        $exception->getMessage() === 'Please select two different variables for inferential analysis.',
        'same-variable analysis returns the expected validation message'
    );
}

if ($failures > 0) {
    echo PHP_EOL . "{$failures} inferential analysis test(s) failed." . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All inferential analysis tests passed.' . PHP_EOL;
