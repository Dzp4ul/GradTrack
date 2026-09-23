<?php

/**
 * Reusable Chi-Square Test of Independence helpers for GradTrack reports.
 *
 * The record values consumed here come from survey_response_analytics.php so
 * descriptive and inferential reports share one canonical classification layer.
 */

const GRADTRACK_INFERENTIAL_ALPHA = 0.05;

function gradtrack_inferential_variable_definitions(): array
{
    return [
        'program' => [
            'key' => 'program',
            'label' => 'Course or Program',
            'record_field' => 'program_code',
            'source' => 'graduate_dimension',
        ],
        'graduation_year' => [
            'key' => 'graduation_year',
            'label' => 'Year Graduated',
            'record_field' => 'year',
            'source' => 'graduate_dimension',
        ],
        'employment_status' => [
            'key' => 'employment_status',
            'label' => 'Employment Status',
            'record_field' => 'employment_status',
            'source' => 'analytics_key',
            'analytics_key' => 'employment_status',
        ],
        'job_course_alignment' => [
            'key' => 'job_course_alignment',
            'label' => 'Job/Program Alignment',
            'record_field' => 'alignment_binary',
            'source' => 'analytics_key',
            'analytics_key' => 'job_course_alignment',
        ],
        'work_location' => [
            'key' => 'work_location',
            'label' => 'Work Location',
            'record_field' => 'work_location',
            'source' => 'analytics_key',
            'analytics_key' => 'work_location',
        ],
    ];
}

function gradtrack_inferential_available_variables(array $fieldAvailability): array
{
    $definitions = gradtrack_inferential_variable_definitions();
    $variables = [];

    foreach ($definitions as $key => $definition) {
        if (($definition['source'] ?? '') === 'analytics_key' && empty($fieldAvailability[$key])) {
            continue;
        }

        $variables[] = [
            'key' => $key,
            'label' => $definition['label'],
            'source' => $definition['source'],
            'analytics_key' => $definition['analytics_key'] ?? null,
        ];
    }

    return $variables;
}

/**
 * Preserve malformed/unanswered submissions in the inferential denominator.
 * Canonical analytics records provide classifications when possible; a response
 * that cannot produce an answer map is retained with null outcomes so it is
 * reported as excluded/missing instead of silently disappearing.
 */
function gradtrack_inferential_complete_record_set(array $responses, array $records): array
{
    $recordedResponseIds = [];
    foreach ($records as $record) {
        $responseId = (int)($record['response_id'] ?? 0);
        if ($responseId > 0) $recordedResponseIds[$responseId] = true;
    }

    foreach ($responses as $response) {
        $responseId = (int)($response['response_id'] ?? $response['id'] ?? 0);
        if ($responseId > 0 && isset($recordedResponseIds[$responseId])) continue;

        $records[] = [
            'response_id' => $responseId,
            'graduate_id' => (int)($response['graduate_id'] ?? 0),
            'program_id' => isset($response['program_id']) && $response['program_id'] !== null
                ? (int)$response['program_id']
                : null,
            'program_code' => strtoupper(trim((string)($response['program_code'] ?? ''))),
            'program_name' => trim((string)($response['program_name'] ?? '')),
            'year' => (int)($response['year_graduated'] ?? 0),
            'employment_status' => null,
            'alignment_status' => null,
            'alignment_binary' => null,
            'work_location' => null,
        ];
    }

    return $records;
}

function gradtrack_inferential_value(array $record, string $variable): ?string
{
    $definition = gradtrack_inferential_variable_definitions()[$variable] ?? null;
    if ($definition === null) {
        throw new InvalidArgumentException('Unsupported inferential variable.');
    }

    $value = $record[$definition['record_field']] ?? null;
    if ($variable === 'graduation_year') {
        $year = (int)$value;
        return $year >= 1900 && $year <= 2099 ? (string)$year : null;
    }

    $text = trim((string)($value ?? ''));
    if ($variable === 'program') {
        $text = strtoupper($text);
    }

    return $text !== '' ? $text : null;
}

function gradtrack_inferential_category_label(string $variable, string $value): string
{
    $labels = [
        'employment_status' => [
            'employed' => 'Employed',
            'unemployed' => 'Unemployed',
        ],
        'job_course_alignment' => [
            'aligned' => 'Aligned',
            'not_aligned' => 'Not Aligned',
        ],
        'work_location' => [
            'local' => 'Local',
            'abroad' => 'Abroad',
        ],
    ];

    return $labels[$variable][$value] ?? $value;
}

function gradtrack_inferential_sort_categories(array $categories, string $variable): array
{
    $order = [
        'employment_status' => ['employed' => 0, 'unemployed' => 1],
        'job_course_alignment' => ['aligned' => 0, 'not_aligned' => 1],
        'work_location' => ['local' => 0, 'abroad' => 1],
    ];

    usort($categories, static function (string $left, string $right) use ($variable, $order): int {
        if ($variable === 'graduation_year') {
            return ((int)$left) <=> ((int)$right);
        }

        if (isset($order[$variable])) {
            $leftOrder = $order[$variable][$left] ?? PHP_INT_MAX;
            $rightOrder = $order[$variable][$right] ?? PHP_INT_MAX;
            $comparison = $leftOrder <=> $rightOrder;
            if ($comparison !== 0) {
                return $comparison;
            }
        }

        return strnatcasecmp($left, $right);
    });

    return $categories;
}

/** Lanczos approximation of ln(Gamma(x)) for positive x. */
function gradtrack_inferential_log_gamma(float $value): float
{
    if ($value <= 0.0) {
        throw new InvalidArgumentException('Gamma input must be positive.');
    }

    $coefficients = [
        676.5203681218851,
        -1259.1392167224028,
        771.32342877765313,
        -176.61502916214059,
        12.507343278686905,
        -0.13857109526572012,
        9.9843695780195716e-6,
        1.5056327351493116e-7,
    ];

    if ($value < 0.5) {
        return log(M_PI) - log(sin(M_PI * $value)) - gradtrack_inferential_log_gamma(1.0 - $value);
    }

    $shifted = $value - 1.0;
    $series = 0.99999999999980993;
    foreach ($coefficients as $index => $coefficient) {
        $series += $coefficient / ($shifted + $index + 1.0);
    }
    $t = $shifted + count($coefficients) - 0.5;

    return 0.5 * log(2.0 * M_PI) + ($shifted + 0.5) * log($t) - $t + log($series);
}

/** Regularized upper incomplete gamma Q(a, x). */
function gradtrack_inferential_regularized_gamma_q(float $shape, float $x): float
{
    if ($shape <= 0.0 || $x < 0.0) {
        throw new InvalidArgumentException('Invalid incomplete gamma parameters.');
    }
    if ($x === 0.0) {
        return 1.0;
    }

    $epsilon = 3.0e-14;
    $minimum = 1.0e-300;
    $maximumIterations = 1000;
    $logFactor = -$x + $shape * log($x) - gradtrack_inferential_log_gamma($shape);

    if ($x < $shape + 1.0) {
        $sum = 1.0 / $shape;
        $term = $sum;
        $denominator = $shape;
        for ($iteration = 1; $iteration <= $maximumIterations; $iteration++) {
            $denominator += 1.0;
            $term *= $x / $denominator;
            $sum += $term;
            if (abs($term) <= abs($sum) * $epsilon) {
                break;
            }
        }
        $lower = $sum * exp($logFactor);
        return max(0.0, min(1.0, 1.0 - $lower));
    }

    $b = $x + 1.0 - $shape;
    $c = 1.0 / $minimum;
    $d = 1.0 / max(abs($b), $minimum);
    $continuedFraction = $d;
    for ($iteration = 1; $iteration <= $maximumIterations; $iteration++) {
        $an = -$iteration * ($iteration - $shape);
        $b += 2.0;
        $d = $an * $d + $b;
        if (abs($d) < $minimum) {
            $d = $minimum;
        }
        $c = $b + $an / $c;
        if (abs($c) < $minimum) {
            $c = $minimum;
        }
        $d = 1.0 / $d;
        $delta = $d * $c;
        $continuedFraction *= $delta;
        if (abs($delta - 1.0) <= $epsilon) {
            break;
        }
    }

    return max(0.0, min(1.0, exp($logFactor) * $continuedFraction));
}

function gradtrack_inferential_chi_square_p_value(float $chiSquare, int $degreesOfFreedom): float
{
    if ($chiSquare < 0.0 || $degreesOfFreedom <= 0) {
        throw new InvalidArgumentException('Chi-Square and degrees of freedom must be valid.');
    }

    return gradtrack_inferential_regularized_gamma_q($degreesOfFreedom / 2.0, $chiSquare / 2.0);
}

function gradtrack_inferential_association_strength(float $cramersV): string
{
    if ($cramersV < 0.1) return 'Very Weak';
    if ($cramersV < 0.3) return 'Weak';
    if ($cramersV < 0.5) return 'Moderate';
    return 'Strong';
}

function gradtrack_inferential_format_probability(float $value): string
{
    return $value < 0.001 ? 'less than 0.001' : number_format($value, 3, '.', '');
}

function gradtrack_inferential_build_interpretation(array $analysis): string
{
    $variable1 = (string)$analysis['variable1']['label'];
    $variable2 = (string)$analysis['variable2']['label'];
    $chiSquare = number_format((float)$analysis['chiSquare'], 3, '.', '');
    $degreesOfFreedom = (int)$analysis['degreesOfFreedom'];
    $pValue = (float)$analysis['pValue'];
    $alpha = number_format((float)$analysis['alpha'], 2, '.', '');
    $cramersV = number_format((float)$analysis['cramersV'], 3, '.', '');
    $strength = strtolower((string)$analysis['associationStrength']);

    $decisionText = !empty($analysis['significant'])
        ? "The p-value of " . gradtrack_inferential_format_probability($pValue) . " is below the {$alpha} significance level, so there is sufficient statistical evidence of an association between {$variable1} and {$variable2}."
        : "The p-value of " . gradtrack_inferential_format_probability($pValue) . " is greater than or equal to the {$alpha} significance level, so the analysis does not provide sufficient statistical evidence of an association between {$variable1} and {$variable2}.";

    return "A Chi-Square Test of Independence was conducted to examine the association between {$variable1} and {$variable2} among the selected graduate respondents. The test produced Chi-Square = {$chiSquare}, df = {$degreesOfFreedom}. {$decisionText} Cramer's V = {$cramersV} indicates a {$strength} association. Cramer's V describes association strength and does not determine statistical significance or causation.";
}

function gradtrack_inferential_analyze_records(
    array $records,
    string $variable1,
    string $variable2,
    float $alpha = GRADTRACK_INFERENTIAL_ALPHA
): array {
    $definitions = gradtrack_inferential_variable_definitions();
    if (!isset($definitions[$variable1]) || !isset($definitions[$variable2])) {
        throw new InvalidArgumentException('One or more selected variables are unsupported.');
    }
    if ($variable1 === $variable2) {
        throw new InvalidArgumentException('Please select two different variables for inferential analysis.');
    }

    $counts = [];
    $rowValues = [];
    $columnValues = [];
    $validResponses = 0;

    foreach ($records as $record) {
        $rowValue = gradtrack_inferential_value($record, $variable1);
        $columnValue = gradtrack_inferential_value($record, $variable2);
        if ($rowValue === null || $columnValue === null) {
            continue;
        }

        $rowValues[$rowValue] = true;
        $columnValues[$columnValue] = true;
        $counts[$rowValue][$columnValue] = ($counts[$rowValue][$columnValue] ?? 0) + 1;
        $validResponses++;
    }

    $excludedResponses = max(count($records) - $validResponses, 0);
    $rowCategories = gradtrack_inferential_sort_categories(array_keys($rowValues), $variable1);
    $columnCategories = gradtrack_inferential_sort_categories(array_keys($columnValues), $variable2);
    $rowTotals = [];
    $columnTotals = array_fill_keys($columnCategories, 0);
    $observedRows = [];

    foreach ($rowCategories as $rowCategory) {
        $frequencies = [];
        $rowTotal = 0;
        foreach ($columnCategories as $columnCategory) {
            $frequency = (int)($counts[$rowCategory][$columnCategory] ?? 0);
            $frequencies[] = $frequency;
            $rowTotal += $frequency;
            $columnTotals[$columnCategory] += $frequency;
        }
        $rowTotals[$rowCategory] = $rowTotal;
        $observedRows[] = [
            'key' => $rowCategory,
            'label' => gradtrack_inferential_category_label($variable1, $rowCategory),
            'frequencies' => $frequencies,
            'total' => $rowTotal,
        ];
    }

    $baseAnalysis = [
        'variable1' => ['key' => $variable1, 'label' => $definitions[$variable1]['label']],
        'variable2' => ['key' => $variable2, 'label' => $definitions[$variable2]['label']],
        'test' => 'Chi-Square Test of Independence',
        'validResponses' => $validResponses,
        'excludedResponses' => $excludedResponses,
        'alpha' => $alpha,
        'canCalculate' => false,
    ];
    $contingencyTable = [
        'rowVariable' => $baseAnalysis['variable1'],
        'columnVariable' => $baseAnalysis['variable2'],
        'columns' => array_map(static fn (string $value): array => [
            'key' => $value,
            'label' => gradtrack_inferential_category_label($variable2, $value),
        ], $columnCategories),
        'rows' => $observedRows,
        'columnTotals' => array_values($columnTotals),
        'grandTotal' => $validResponses,
    ];

    if ($validResponses === 0 || count($rowCategories) < 2 || count($columnCategories) < 2) {
        $insufficientWarnings = [];
        if ($validResponses === 0) {
            $insufficientWarnings[] = 'No valid paired responses are available for the selected variables and filters.';
        } elseif ($validResponses < 20) {
            $insufficientWarnings[] = 'The valid sample is too small for a dependable Chi-Square approximation.';
        }
        if ($validResponses > 0 && (count($rowCategories) < 2 || count($columnCategories) < 2)) {
            $insufficientWarnings[] = 'At least two observed categories are required for each selected variable.';
        }
        return [
            'status' => 'insufficient_variation',
            'message' => 'Insufficient variation in the selected data to perform a Chi-Square Test of Independence.',
            'analysis' => array_merge($baseAnalysis, [
                'chiSquare' => null,
                'degreesOfFreedom' => null,
                'pValue' => null,
                'significant' => null,
                'cramersV' => null,
                'associationStrength' => null,
                'decision' => 'Not calculated',
            ]),
            'contingencyTable' => $contingencyTable,
            'expectedFrequencies' => [],
            'chartData' => gradtrack_inferential_chart_data($observedRows, $contingencyTable['columns']),
            'assumptions' => [
                'passed' => false,
                'cellsBelowOne' => 0,
                'cellsBelowFive' => 0,
                'percentageBelowFive' => 0.0,
                'minimumExpected' => null,
                'warnings' => $insufficientWarnings,
            ],
            'interpretation' => '',
        ];
    }

    $expectedRows = [];
    $chiSquare = 0.0;
    $minimumExpected = INF;
    $cellsBelowOne = 0;
    $cellsBelowFive = 0;
    $totalCells = count($rowCategories) * count($columnCategories);

    foreach ($rowCategories as $rowIndex => $rowCategory) {
        $expectedValues = [];
        foreach ($columnCategories as $columnIndex => $columnCategory) {
            $expected = ($rowTotals[$rowCategory] * $columnTotals[$columnCategory]) / $validResponses;
            if ($expected <= 0.0 || !is_finite($expected)) {
                throw new RuntimeException('The contingency table produced an invalid expected frequency.');
            }
            $observed = (float)$observedRows[$rowIndex]['frequencies'][$columnIndex];
            $difference = $observed - $expected;
            $chiSquare += ($difference * $difference) / $expected;
            $expectedValues[] = $expected;
            $minimumExpected = min($minimumExpected, $expected);
            if ($expected < 1.0) $cellsBelowOne++;
            if ($expected < 5.0) $cellsBelowFive++;
        }
        $expectedRows[] = [
            'key' => $rowCategory,
            'label' => gradtrack_inferential_category_label($variable1, $rowCategory),
            'frequencies' => $expectedValues,
            'total' => (float)$rowTotals[$rowCategory],
        ];
    }

    $degreesOfFreedom = (count($rowCategories) - 1) * (count($columnCategories) - 1);
    $pValue = gradtrack_inferential_chi_square_p_value($chiSquare, $degreesOfFreedom);
    $denominatorDimension = min(count($rowCategories) - 1, count($columnCategories) - 1);
    $cramersV = $denominatorDimension > 0
        ? sqrt($chiSquare / ($validResponses * $denominatorDimension))
        : 0.0;
    $percentageBelowFive = $totalCells > 0 ? ($cellsBelowFive / $totalCells) * 100.0 : 0.0;
    $warnings = [];
    if ($validResponses < 20) {
        $warnings[] = 'The valid sample is small; interpret the Chi-Square result with caution.';
    }
    if ($cellsBelowOne > 0) {
        $warnings[] = 'At least one expected frequency is below 1, so the Chi-Square approximation may be unreliable.';
    }
    if ($percentageBelowFive > 20.0) {
        $warnings[] = 'Some expected frequencies are below the recommended threshold; more than 20% of cells have an expected frequency below 5.';
    }

    $significant = $pValue < $alpha;
    $analysis = array_merge($baseAnalysis, [
        'canCalculate' => true,
        'chiSquare' => $chiSquare,
        'degreesOfFreedom' => $degreesOfFreedom,
        'pValue' => $pValue,
        'significant' => $significant,
        'cramersV' => $cramersV,
        'associationStrength' => gradtrack_inferential_association_strength($cramersV),
        'decision' => $significant ? 'Statistically Significant' : 'Not Statistically Significant',
    ]);

    return [
        'status' => 'complete',
        'message' => null,
        'analysis' => $analysis,
        'contingencyTable' => $contingencyTable,
        'expectedFrequencies' => [
            'columns' => $contingencyTable['columns'],
            'rows' => $expectedRows,
            'columnTotals' => array_map('floatval', array_values($columnTotals)),
            'grandTotal' => (float)$validResponses,
        ],
        'chartData' => gradtrack_inferential_chart_data($observedRows, $contingencyTable['columns']),
        'assumptions' => [
            'passed' => $warnings === [],
            'cellsBelowOne' => $cellsBelowOne,
            'cellsBelowFive' => $cellsBelowFive,
            'percentageBelowFive' => $percentageBelowFive,
            'minimumExpected' => $minimumExpected,
            'warnings' => $warnings,
        ],
        'interpretation' => gradtrack_inferential_build_interpretation($analysis)
            . ($warnings !== []
                ? ' One or more Chi-Square approximation assumptions were not adequately satisfied, so this result should be interpreted with caution.'
                : ''),
    ];
}

function gradtrack_inferential_chart_data(array $observedRows, array $columns): array
{
    $categories = [];
    foreach ($observedRows as $row) {
        $chartRow = ['category' => $row['label']];
        foreach ($columns as $index => $column) {
            $chartRow['series_' . $index] = (int)($row['frequencies'][$index] ?? 0);
        }
        $categories[] = $chartRow;
    }

    return [
        'categories' => $categories,
        'series' => array_map(static fn (array $column, int $index): array => [
            'key' => 'series_' . $index,
            'label' => $column['label'],
        ], $columns, array_keys($columns)),
    ];
}
