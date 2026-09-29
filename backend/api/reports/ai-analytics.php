<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/survey_response_analytics.php';
require_once __DIR__ . '/../config/admin_auth.php';
require_once __DIR__ . '/../config/graduation_years.php';
require_once __DIR__ . '/../config/dean_program_scope.php';

$database = new Database();
$db = $database->getConnection();
$authUser = gradtrack_require_admin_auth(
    $db,
    array_merge(['research_coordinator'], gradtrack_dean_roles()),
    'Only authorized report accounts can access AI analytics'
);
$deanScope = gradtrack_dean_program_scope($db, $authUser);

function getSelectedSurveyId(PDO $db): ?int
{
    if (array_key_exists('survey_id', $_GET)) {
        $surveyId = $_GET['survey_id'];
        if (!is_scalar($surveyId)) {
            return null;
        }

        $surveyIdText = trim((string)$surveyId);
        if (in_array(strtolower($surveyIdText), ['', 'none', 'all', 'null', 'undefined'], true)) {
            return null;
        }

        return ctype_digit($surveyIdText) && (int)$surveyIdText > 0 ? (int)$surveyIdText : null;
    }

    $stmt = $db->query("
        SELECT id
        FROM surveys
        WHERE status = 'active' AND archived_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1
    ");
    $survey = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($survey) {
        return (int)$survey['id'];
    }

    return null;
}

function answerToText($answer): string
{
    if (is_array($answer)) {
        return strtolower(trim(implode(' ', array_map(static function ($value) {
            return is_scalar($value) ? (string)$value : '';
        }, $answer))));
    }

    return strtolower(trim((string)$answer));
}

function parseEmploymentAnswer($answer): ?bool
{
    $answerLower = answerToText($answer);
    if ($answerLower === '') {
        return null;
    }

    if (
        strpos($answerLower, 'unemployed') !== false
        || $answerLower === 'no'
        || strpos($answerLower, 'not employed') !== false
    ) {
        return false;
    }

    if (
        $answerLower === 'yes'
        || strpos($answerLower, 'employed') !== false
        || strpos($answerLower, 'regular') !== false
        || strpos($answerLower, 'permanent') !== false
        || strpos($answerLower, 'temporary') !== false
        || strpos($answerLower, 'casual') !== false
        || strpos($answerLower, 'contractual') !== false
        || strpos($answerLower, 'self-employed') !== false
        || strpos($answerLower, 'self employed') !== false
        || strpos($answerLower, 'freelance') !== false
    ) {
        return true;
    }

    return null;
}

function getOverviewData(PDO $db, ?int $surveyId, array $analyticsOptions = []): array
{
    if ($surveyId === null) {
        return [
            'survey_id' => null,
            'total_graduates' => 0,
            'total_employed' => 0,
            'total_unemployed' => 0,
            'total_employment_known' => 0,
            'total_employed_local' => 0,
            'total_employed_abroad' => 0,
            'total_aligned' => 0,
            'total_not_aligned' => 0,
            'total_alignment_known' => 0,
            'total_survey_responses' => 0,
            'employment_rate' => null,
            'alignment_rate' => null,
        ];
    }

    $coverage = gradtrack_get_survey_graduation_year_coverage($db, $surveyId);
    $options = $analyticsOptions;
    if ($coverage['configured']) {
        $options['allowed_graduation_years'] = $coverage['years'];
    }
    if (!$coverage['configured']
        && ($coverage['survey']['status'] ?? '') === 'active'
        && empty($coverage['survey']['archived_at'])) {
        throw new RuntimeException('Graduation year coverage has not been configured for the active survey.');
    }

    $analytics = gradtrack_analytics_calculate($db, $surveyId, $options);
    $summary = $analytics['summary'];

    return [
        'survey_id' => $surveyId,
        'total_graduates' => (int)$summary['response_count'],
        'total_employed' => (int)$summary['employed'],
        'total_unemployed' => (int)$summary['unemployed'],
        'total_employment_known' => (int)$summary['employment_total'],
        'total_employment_unknown' => (int)$summary['employment_unknown'],
        'total_employed_local' => (int)$summary['employed_local'],
        'total_employed_abroad' => (int)$summary['employed_abroad'],
        'total_aligned' => (int)$summary['aligned'],
        'total_not_aligned' => (int)$summary['not_aligned'],
        'total_alignment_known' => (int)$summary['alignment_total'],
        'total_survey_responses' => (int)$summary['response_count'],
        'employment_rate' => $summary['employment_rate'],
        'alignment_rate' => $summary['alignment_rate'],
    ];
}

function normalizeReportType(string $type): string
{
    $allowed = ['overview', 'by_program', 'by_year', 'employment_status', 'salary_distribution', 'formal_report'];
    return in_array($type, $allowed, true) ? $type : 'overview';
}

function normalizeDescriptiveAlignmentCategories(string $type, $reportData)
{
    // Report analytics expose the same binary alignment contract used by the UI:
    // aligned and not aligned.
    return $reportData;
}

function formatAnalyticsValue($value): string
{
    if ($value === null || $value === '') {
        return 'not available';
    }

    if (is_bool($value)) {
        return $value ? 'true' : 'false';
    }

    if (is_numeric($value)) {
        $number = (float)$value;
        if (floor($number) === $number) {
            return (string)((int)$number);
        }

        return rtrim(rtrim(number_format($number, 2, '.', ''), '0'), '.');
    }

    return trim((string)$value);
}

function formatAnalyticsRate($value): string
{
    return $value === null || $value === ''
        ? 'not available'
        : formatAnalyticsValue($value) . '%';
}

function analyticsIntValue(array $data, string $key): int
{
    $value = $data[$key] ?? 0;
    return is_numeric($value) ? (int)$value : 0;
}

function analyticsNumericValue(array $data, string $key): float
{
    $value = $data[$key] ?? 0;
    return is_numeric($value) ? (float)$value : 0.0;
}

function analyticsLabelValue(array $data, array $keys, string $fallback): string
{
    foreach ($keys as $key) {
        if (isset($data[$key]) && trim((string)$data[$key]) !== '') {
            return trim((string)$data[$key]);
        }
    }

    return $fallback;
}

function buildProgramCountParts(array $programRows): array
{
    $parts = [];
    foreach ($programRows as $index => $row) {
        if (!is_array($row)) {
            continue;
        }

        $label = analyticsLabelValue($row, ['code', 'name'], 'Program ' . ((int)$index + 1));
        $total = analyticsIntValue($row, 'total_graduates');
        $employmentTotal = array_key_exists('employment_total', $row)
            ? analyticsIntValue($row, 'employment_total')
            : $total;
        $employed = analyticsIntValue($row, 'employed');
        $notEmployed = max($employmentTotal - $employed, 0);
        $aligned = analyticsIntValue($row, 'aligned');
        $notAligned = analyticsIntValue($row, 'not_aligned');
        $alignmentTotal = $aligned + $notAligned;

        $parts[] = "{$label} - total {$total}, employment classified {$employmentTotal}, employed {$employed}, unemployed {$notEmployed}, aligned {$aligned}, not aligned {$notAligned}, alignment classified {$alignmentTotal}";
    }

    return $parts;
}

function buildBatchTrendCountParts(array $batchRows): array
{
    $parts = [];
    foreach ($batchRows as $index => $row) {
        if (!is_array($row)) {
            continue;
        }

        $year = analyticsLabelValue($row, ['year_graduated'], 'Batch ' . ((int)$index + 1));
        $employmentTotal = analyticsIntValue($row, 'employment_total');
        $employed = analyticsIntValue($row, 'employed');
        $unemployed = analyticsIntValue($row, 'unemployed');
        $aligned = analyticsIntValue($row, 'aligned');
        $notAligned = analyticsIntValue($row, 'not_aligned');
        $alignmentTotal = $aligned + $notAligned;
        $parts[] = "batch {$year} - employment classified {$employmentTotal}, employed {$employed}, unemployed {$unemployed}, employment rate "
            . formatAnalyticsRate($row['employment_rate'] ?? null)
            . ", alignment classified {$alignmentTotal}, aligned {$aligned}, not aligned {$notAligned}, alignment rate "
            . formatAnalyticsRate($row['alignment_rate'] ?? null);
    }

    return $parts;
}

function buildObservedDataSummary(string $type, $reportData): string
{
    if (!is_array($reportData) || $reportData === []) {
        return 'Observed data counts: no report data is available for the selected filters.';
    }

    if ($type === 'overview') {
        $overview = isset($reportData['overview']) && is_array($reportData['overview'])
            ? $reportData['overview']
            : $reportData;
        $programRows = isset($reportData['by_program']) && is_array($reportData['by_program'])
            ? $reportData['by_program']
            : [];

        $total = analyticsIntValue($overview, 'total_graduates');
        $surveyResponses = analyticsIntValue($overview, 'total_survey_responses');
        $employed = analyticsIntValue($overview, 'total_employed');
        $unemployed = analyticsIntValue($overview, 'total_unemployed');
        $employmentKnown = analyticsIntValue($overview, 'total_employment_known');
        $local = analyticsIntValue($overview, 'total_employed_local');
        $abroad = analyticsIntValue($overview, 'total_employed_abroad');
        $aligned = analyticsIntValue($overview, 'total_aligned');
        $notAligned = analyticsIntValue($overview, 'total_not_aligned');
        $alignmentKnown = $aligned + $notAligned;
        $unknown = max($total - ($employmentKnown > 0 ? $employmentKnown : ($employed + $unemployed)), 0);
        $batchRows = isset($reportData['by_batch_trends']) && is_array($reportData['by_batch_trends'])
            ? $reportData['by_batch_trends']
            : [];

        $summary = 'Observed data counts: '
            . "total graduate responses {$total}; "
            . "survey responses {$surveyResponses}; "
            . "employment known {$employmentKnown}; "
            . "employed {$employed}; "
            . "unemployed {$unemployed}; "
            . "employment unknown {$unknown}; "
            . "employed local {$local}; "
            . "employed abroad {$abroad}; "
            . "aligned {$aligned}; "
            . "not aligned {$notAligned}; "
            . "alignment classified {$alignmentKnown}; "
            . 'employment rate ' . formatAnalyticsRate($overview['employment_rate'] ?? null) . '; '
            . 'alignment rate ' . formatAnalyticsRate($overview['alignment_rate'] ?? null) . '.';

        $programParts = buildProgramCountParts($programRows);
        if ($programParts !== []) {
            $summary .= "\n\nProgram counts in the same dataset: " . implode('; ', $programParts) . '.';
        }

        $batchParts = buildBatchTrendCountParts($batchRows);
        if ($batchParts !== []) {
            $summary .= "\n\nBatch chart counts in the same dataset: " . implode('; ', $batchParts) . '.';
        }

        return $summary;
    }

    if ($type === 'by_program') {
        $programParts = buildProgramCountParts($reportData);
        return $programParts === []
            ? 'Observed program counts: no program rows are available for the selected filters.'
            : 'Observed program counts: ' . implode('; ', $programParts) . '.';
    }

    if ($type === 'by_year') {
        $parts = [];
        foreach ($reportData as $index => $row) {
            if (!is_array($row)) {
                continue;
            }

            $label = analyticsLabelValue($row, ['year_graduated'], 'Year ' . ((int)$index + 1));
            $total = analyticsIntValue($row, 'total_graduates');
            $employmentTotal = array_key_exists('employment_total', $row)
                ? analyticsIntValue($row, 'employment_total')
                : $total;
            $employed = analyticsIntValue($row, 'employed');
            $notEmployed = array_key_exists('unemployed', $row)
                ? analyticsIntValue($row, 'unemployed')
                : max($employmentTotal - $employed, 0);
            $aligned = analyticsIntValue($row, 'aligned');
            $alignmentTotal = analyticsIntValue($row, 'alignment_total');
            $notAligned = analyticsIntValue($row, 'not_aligned');
            $parts[] = "{$label} - total {$total}, employment classified {$employmentTotal}, employed {$employed}, unemployed {$notEmployed}, employment rate "
                . formatAnalyticsRate($row['employment_rate'] ?? null)
                . ", alignment classified {$alignmentTotal}, aligned {$aligned}, not aligned {$notAligned}, alignment rate "
                . formatAnalyticsRate($row['alignment_rate'] ?? null);
        }

        return $parts === []
            ? 'Observed year counts: no year rows are available for the selected filters.'
            : 'Observed year counts: ' . implode('; ', $parts) . '.';
    }

    if ($type === 'employment_status') {
        $statusRows = isset($reportData['statuses']) && is_array($reportData['statuses'])
            ? $reportData['statuses']
            : $reportData;
        $parts = [];
        $total = 0;
        foreach ($statusRows as $index => $row) {
            if (!is_array($row)) {
                continue;
            }

            $label = analyticsLabelValue($row, ['employment_status'], 'Status ' . ((int)$index + 1));
            $count = analyticsIntValue($row, 'count');
            $total += $count;
            $parts[] = "{$label} {$count}";
        }

        $summary = $parts === []
            ? 'Observed employment status counts: no status rows are available for the selected filters.'
            : 'Observed employment status counts: ' . implode('; ', $parts) . "; total classified {$total}.";

        if (isset($reportData['summary']) && is_array($reportData['summary'])) {
            $summary .= ' Summary counts: total employed ' . analyticsIntValue($reportData['summary'], 'total_employed')
                . ', local ' . analyticsIntValue($reportData['summary'], 'local_count')
                . ', abroad ' . analyticsIntValue($reportData['summary'], 'abroad_count')
                . ', unemployed ' . analyticsIntValue($reportData['summary'], 'unemployed_count') . '.';
        }

        return $summary;
    }

    if ($type === 'salary_distribution') {
        $salaryRows = isset($reportData['salary_buckets']) && is_array($reportData['salary_buckets'])
            ? $reportData['salary_buckets']
            : $reportData;
        $parts = [];
        $total = 0;
        foreach ($salaryRows as $index => $row) {
            if (!is_array($row)) {
                continue;
            }

            $label = analyticsLabelValue($row, ['salary_range'], 'Salary range ' . ((int)$index + 1));
            $count = analyticsIntValue($row, 'count');
            $total += $count;
            $parts[] = "{$label} {$count}";
        }

        $classifiedTotal = isset($reportData['summary']) && is_array($reportData['summary'])
            ? analyticsIntValue($reportData['summary'], 'total_classified')
            : $total;

        return $parts === []
            ? 'Observed salary counts: no salary rows are available for the selected filters.'
            : 'Observed salary counts: ' . implode('; ', $parts) . "; total classified {$classifiedTotal}.";
    }

    return 'Observed data counts: ' . json_encode($reportData, JSON_UNESCAPED_UNICODE);
}

function analyticsPercent(int $part, int $whole): string
{
    if ($whole <= 0) {
        return '0%';
    }

    return formatAnalyticsValue(round(($part / $whole) * 100, 1)) . '%';
}

function analyticsRows($data, string $nestedKey = ''): array
{
    $rows = [];
    $source = $data;
    if ($nestedKey !== '' && is_array($data) && isset($data[$nestedKey]) && is_array($data[$nestedKey])) {
        $source = $data[$nestedKey];
    }

    if (!is_array($source)) {
        return [];
    }

    foreach ($source as $row) {
        if (is_array($row)) {
            $rows[] = $row;
        }
    }

    return $rows;
}

function pickAnalyticsRowByValue(array $rows, string $key, bool $highest = true): ?array
{
    $picked = null;
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }

        if ($picked === null) {
            $picked = $row;
            continue;
        }

        $currentValue = analyticsIntValue($row, $key);
        $pickedValue = analyticsIntValue($picked, $key);
        if (($highest && $currentValue > $pickedValue) || (!$highest && $currentValue < $pickedValue)) {
            $picked = $row;
        }
    }

    return $picked;
}

function pickAnalyticsRowByNumericValue(array $rows, string $key, bool $highest = true): ?array
{
    $picked = null;
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }

        if ($picked === null) {
            $picked = $row;
            continue;
        }

        $currentValue = analyticsNumericValue($row, $key);
        $pickedValue = analyticsNumericValue($picked, $key);
        if (($highest && $currentValue > $pickedValue) || (!$highest && $currentValue < $pickedValue)) {
            $picked = $row;
        }
    }

    return $picked;
}

function buildProgramNarrative(array $programRows): string
{
    $parts = buildProgramCountParts($programRows);
    return $parts === [] ? '' : implode('; ', $parts) . '.';
}

function buildAnalyticsSummary(string $type, $reportData): string
{
    if (!is_array($reportData) || $reportData === []) {
        return 'No report data is available for the selected filters.';
    }

    if ($type === 'overview') {
        $overview = isset($reportData['overview']) && is_array($reportData['overview'])
            ? $reportData['overview']
            : $reportData;

        $total = analyticsIntValue($overview, 'total_graduates');
        $surveyResponses = analyticsIntValue($overview, 'total_survey_responses');
        $employed = analyticsIntValue($overview, 'total_employed');
        $unemployed = analyticsIntValue($overview, 'total_unemployed');
        $employmentKnown = analyticsIntValue($overview, 'total_employment_known');
        $local = analyticsIntValue($overview, 'total_employed_local');
        $abroad = analyticsIntValue($overview, 'total_employed_abroad');
        $aligned = analyticsIntValue($overview, 'total_aligned');
        $notAligned = analyticsIntValue($overview, 'total_not_aligned');
        $alignmentKnown = analyticsIntValue($overview, 'total_alignment_known');
        $unknown = max($total - ($employmentKnown > 0 ? $employmentKnown : ($employed + $unemployed)), 0);
        $programRows = isset($reportData['by_program']) && is_array($reportData['by_program'])
            ? $reportData['by_program']
            : [];
        $batchRows = isset($reportData['by_batch_trends']) && is_array($reportData['by_batch_trends'])
            ? $reportData['by_batch_trends']
            : [];
        $programNarrative = buildProgramNarrative($programRows);
        $programParagraph = $programNarrative !== ''
            ? "\n\nAt the program level, the same dataset is distributed as follows: {$programNarrative} These program counts add context to the overview by showing where the employed, not-employed, aligned, and not-aligned graduates are concentrated."
            : '';
        $batchParts = buildBatchTrendCountParts($batchRows);
        $batchParagraph = $batchParts !== []
            ? "\n\nThe batch charts contain these exact cohort results: " . implode('; ', $batchParts) . '.'
            : '';

        return "The selected overview is based on {$total} graduate responses and {$surveyResponses} survey responses. Employment status is classified for {$employmentKnown} graduates, while {$unknown} record remains without a classified employment status. Within the classified records, {$employed} graduates are employed and {$unemployed} are unemployed, producing an employment rate of "
            . formatAnalyticsRate($overview['employment_rate'] ?? null)
            . ".\n\nAmong the {$employed} employed graduates, {$local} are employed locally and {$abroad} are employed abroad. Local employment represents "
            . analyticsPercent($local, $employed)
            . ' of employed graduates, while abroad employment represents '
            . analyticsPercent($abroad, $employed)
            . ". Course alignment is classified for {$alignmentKnown} applicable responses: {$aligned} aligned and {$notAligned} not aligned. Aligned work represents "
            . analyticsPercent($aligned, $alignmentKnown)
            . ' of classified alignment responses, giving an alignment rate of '
            . formatAnalyticsRate($overview['alignment_rate'] ?? null)
            . " among valid applicable alignment responses.{$programParagraph}{$batchParagraph}";
    }

    if ($type === 'by_program') {
        $rows = analyticsRows($reportData);
        if ($rows === []) {
            return 'No program rows are available for the selected filters.';
        }

        $programCount = count($rows);
        $total = 0;
        $employed = 0;
        $aligned = 0;
        $notAligned = 0;
        foreach ($rows as $row) {
            $total += analyticsIntValue($row, 'total_graduates');
            $employed += analyticsIntValue($row, 'employed');
            $aligned += analyticsIntValue($row, 'aligned');
            $notAligned += analyticsIntValue($row, 'not_aligned');
        }
        $notEmployed = max($total - $employed, 0);
        $topEmployed = pickAnalyticsRowByValue($rows, 'employed', true);
        $topLabel = $topEmployed ? analyticsLabelValue($topEmployed, ['code', 'name'], 'the leading program') : 'the leading program';
        $topCount = $topEmployed ? analyticsIntValue($topEmployed, 'employed') : 0;

        return "The program dataset includes {$programCount} programs with {$total} graduates. Across these programs, {$employed} graduates are employed and {$notEmployed} are not employed, while course alignment counts include {$aligned} aligned and {$notAligned} not aligned graduates.\n\nBy employed count, {$topLabel} is the largest contributor with {$topCount} employed graduates. The program rows form a comparative distribution: each program contributes a different share of the total graduate population, employment count, and course-alignment count in the selected filters.";
    }

    if ($type === 'by_year') {
        $rows = analyticsRows($reportData);
        if ($rows === []) {
            return 'No year rows are available for the selected filters.';
        }

        $yearCount = count($rows);
        $total = 0;
        $employed = 0;
        $aligned = 0;
        foreach ($rows as $row) {
            $total += analyticsIntValue($row, 'total_graduates');
            $employed += analyticsIntValue($row, 'employed');
            $aligned += analyticsIntValue($row, 'aligned');
        }
        $notEmployed = max($total - $employed, 0);
        $topYear = pickAnalyticsRowByValue($rows, 'employed', true);
        $yearLabel = $topYear ? analyticsLabelValue($topYear, ['year_graduated'], 'the leading year') : 'the leading year';
        $topCount = $topYear ? analyticsIntValue($topYear, 'employed') : 0;

        return "The yearly dataset covers {$yearCount} graduation years with {$total} graduates. Across the selected years, {$employed} graduates are employed, {$notEmployed} are not employed, and {$aligned} are classified as aligned with their course.\n\nThe highest employed count appears in {$yearLabel} with {$topCount} employed graduates. This yearly view describes how the graduate totals, employment counts, and alignment counts are distributed across cohorts rather than combining them into a single overall figure.";
    }

    if ($type === 'employment_status') {
        $rows = analyticsRows($reportData, 'statuses');
        if ($rows === []) {
            return 'No employment status rows are available for the selected filters.';
        }

        $total = 0;
        $local = 0;
        $abroad = 0;
        $unemployed = 0;
        foreach ($rows as $row) {
            $label = strtolower(analyticsLabelValue($row, ['employment_status'], ''));
            $count = analyticsIntValue($row, 'count');
            $total += $count;
            if (strpos($label, 'local') !== false) {
                $local += $count;
            } elseif (strpos($label, 'abroad') !== false || strpos($label, 'overseas') !== false) {
                $abroad += $count;
            } elseif (strpos($label, 'unemployed') !== false) {
                $unemployed += $count;
            }
        }
        $employed = $local + $abroad;

        return "The employment status dataset classifies {$total} graduates across local employment, abroad employment, and unemployment. The counts are {$local} locally employed, {$abroad} employed abroad, and {$unemployed} unemployed.\n\nThe combined employed count is {$employed}, representing " . analyticsPercent($employed, $total) . ' of classified graduates. Local employment represents ' . analyticsPercent($local, $total) . ', abroad employment represents ' . analyticsPercent($abroad, $total) . ', and unemployment represents ' . analyticsPercent($unemployed, $total) . ' of the classified status distribution.';
    }

    if ($type === 'salary_distribution') {
        $rows = analyticsRows($reportData, 'salary_buckets');
        if ($rows === []) {
            return 'No salary rows are available for the selected filters.';
        }

        $total = 0;
        foreach ($rows as $row) {
            $total += analyticsIntValue($row, 'count');
        }
        $topSalary = pickAnalyticsRowByValue($rows, 'count', true);
        $topLabel = $topSalary ? analyticsLabelValue($topSalary, ['salary_range'], 'the leading salary range') : 'the leading salary range';
        $topCount = $topSalary ? analyticsIntValue($topSalary, 'count') : 0;

        return "The salary distribution contains {$total} classified salary responses across " . count($rows) . " salary brackets. Each bracket shows how many graduates fall within a reported income range for the selected filters.\n\nThe largest bracket is {$topLabel} with {$topCount} graduates, representing " . analyticsPercent($topCount, $total) . ' of classified salary responses. The remaining brackets describe how the rest of the salary responses are spread outside the largest concentration.';
    }

    return 'The selected analytics data is summarized by the observed counts shown in the descriptive analysis.';
}

function buildAnalyticsConclusion(string $type, $reportData): string
{
    if (!is_array($reportData) || $reportData === []) {
        return 'The available dataset is not sufficient to form a descriptive conclusion for the selected filters.';
    }

    if ($type === 'overview') {
        $overview = isset($reportData['overview']) && is_array($reportData['overview'])
            ? $reportData['overview']
            : $reportData;
        $employed = analyticsIntValue($overview, 'total_employed');
        $local = analyticsIntValue($overview, 'total_employed_local');
        $abroad = analyticsIntValue($overview, 'total_employed_abroad');
        $aligned = analyticsIntValue($overview, 'total_aligned');
        $notAligned = analyticsIntValue($overview, 'total_not_aligned');
        $alignmentKnown = analyticsIntValue($overview, 'total_alignment_known');
        $employmentRate = formatAnalyticsRate($overview['employment_rate'] ?? null);
        $alignmentRate = formatAnalyticsRate($overview['alignment_rate'] ?? null);
        $employmentKnown = analyticsIntValue($overview, 'total_employment_known');
        $unemployed = analyticsIntValue($overview, 'total_unemployed');
        $batchRows = isset($reportData['by_batch_trends']) && is_array($reportData['by_batch_trends'])
            ? analyticsRows($reportData, 'by_batch_trends')
            : [];

        $locationPattern = 'no classified employment location';
        if ($local > $abroad) {
            $locationPattern = 'local employment has the larger share';
        } elseif ($abroad > $local) {
            $locationPattern = 'abroad employment has the larger share';
        } elseif (($local + $abroad) > 0) {
            $locationPattern = 'local and abroad employment have equal counts';
        }

        $batchConclusion = '';
        if ($batchRows !== []) {
            $topEmploymentBatch = pickAnalyticsRowByNumericValue($batchRows, 'employment_rate', true);
            $topAlignmentBatch = pickAnalyticsRowByNumericValue($batchRows, 'alignment_rate', true);
            $topEmploymentLabel = $topEmploymentBatch
                ? analyticsLabelValue($topEmploymentBatch, ['year_graduated'], 'the leading employment batch')
                : 'the leading employment batch';
            $topAlignmentLabel = $topAlignmentBatch
                ? analyticsLabelValue($topAlignmentBatch, ['year_graduated'], 'the leading alignment batch')
                : 'the leading alignment batch';
            $batchConclusion = "\n\nAcross the displayed batch rows, batch {$topEmploymentLabel} has the highest employment rate at "
                . formatAnalyticsRate($topEmploymentBatch['employment_rate'] ?? null)
                . ", while batch {$topAlignmentLabel} has the highest alignment rate at "
                . formatAnalyticsRate($topAlignmentBatch['alignment_rate'] ?? null)
                . '. These comparisons use the valid classified responses inside each batch.';
        }

        return "Overall, the selected overview contains {$employmentKnown} graduates with a known employment status: {$employed} employed and {$unemployed} unemployed. The employment rate is {$employmentRate}, based on valid employment-status responses.\n\nWithin the employed group, {$locationPattern}. The local count is {$local} and the abroad count is {$abroad}. Alignment classifications contain {$aligned} aligned and {$notAligned} not-aligned responses out of {$alignmentKnown} applicable classified responses. The alignment rate is {$alignmentRate}.{$batchConclusion}";
    }

    if ($type === 'by_program') {
        $rows = analyticsRows($reportData);
        if ($rows === []) {
            return 'The available program dataset is not sufficient to form a descriptive conclusion.';
        }

        $topEmployed = pickAnalyticsRowByValue($rows, 'employed', true);
        $lowEmployed = pickAnalyticsRowByValue($rows, 'employed', false);
        $topAligned = pickAnalyticsRowByValue($rows, 'aligned', true);
        $topLabel = $topEmployed ? analyticsLabelValue($topEmployed, ['code', 'name'], 'the leading program') : 'the leading program';
        $lowLabel = $lowEmployed ? analyticsLabelValue($lowEmployed, ['code', 'name'], 'the lowest program') : 'the lowest program';
        $alignedLabel = $topAligned ? analyticsLabelValue($topAligned, ['code', 'name'], 'the leading alignment program') : 'the leading alignment program';

        return "Overall, program outcomes are highest by employed count in {$topLabel} and lowest by employed count in {$lowLabel}. This means the employment distribution is not even across all listed programs; one program contributes the largest employed group while another contributes the smallest employed group in the selected filters.\n\nCourse-aligned outcomes are highest in {$alignedLabel}. Read together, the employment and alignment counts describe both the volume of employed graduates and the degree to which those employed graduates are connected to their field of study.";
    }

    if ($type === 'by_year') {
        $rows = analyticsRows($reportData);
        if ($rows === []) {
            return 'The available yearly dataset is not sufficient to form a descriptive conclusion.';
        }

        $topYear = pickAnalyticsRowByValue($rows, 'employed', true);
        $lowYear = pickAnalyticsRowByValue($rows, 'employed', false);
        $alignedYear = pickAnalyticsRowByValue($rows, 'aligned', true);
        $topLabel = $topYear ? analyticsLabelValue($topYear, ['year_graduated'], 'the leading year') : 'the leading year';
        $lowLabel = $lowYear ? analyticsLabelValue($lowYear, ['year_graduated'], 'the lowest year') : 'the lowest year';
        $alignedLabel = $alignedYear ? analyticsLabelValue($alignedYear, ['year_graduated'], 'the leading alignment year') : 'the leading alignment year';

        return "Overall, the selected yearly data shows the highest employed count in {$topLabel} and the lowest employed count in {$lowLabel}. The spread between these years describes how employment outcomes vary across the graduation cohorts included in the filter.\n\nThe highest aligned count appears in {$alignedLabel}. This indicates that the strongest year for employment volume and the strongest year for course-aligned outcomes can be compared separately when reading the yearly analytics.";
    }

    if ($type === 'employment_status') {
        $rows = analyticsRows($reportData, 'statuses');
        if ($rows === []) {
            return 'The available employment-status dataset is not sufficient to form a descriptive conclusion.';
        }

        $total = 0;
        $local = 0;
        $abroad = 0;
        $unemployed = 0;
        foreach ($rows as $row) {
            $label = strtolower(analyticsLabelValue($row, ['employment_status'], ''));
            $count = analyticsIntValue($row, 'count');
            $total += $count;
            if (strpos($label, 'local') !== false) {
                $local += $count;
            } elseif (strpos($label, 'abroad') !== false || strpos($label, 'overseas') !== false) {
                $abroad += $count;
            } elseif (strpos($label, 'unemployed') !== false) {
                $unemployed += $count;
            }
        }

        $largestLabel = 'no single status category';
        $largestCount = 0;
        if ($local >= $abroad && $local >= $unemployed && $local > 0) {
            $largestLabel = 'local employment';
            $largestCount = $local;
        } elseif ($abroad >= $local && $abroad >= $unemployed && $abroad > 0) {
            $largestLabel = 'abroad employment';
            $largestCount = $abroad;
        } elseif ($unemployed > 0) {
            $largestLabel = 'unemployment';
            $largestCount = $unemployed;
        }

        return "Overall, {$largestLabel} is the largest employment-status category with {$largestCount} graduates, or " . analyticsPercent($largestCount, $total) . " of classified records. This identifies the dominant status group within the selected employment-status distribution.\n\nUnemployment accounts for {$unemployed} graduates, or " . analyticsPercent($unemployed, $total) . ". The local and abroad employment counts together describe the employed portion of the distribution, while the unemployed count describes the non-employed portion captured by the same dataset.";
    }

    if ($type === 'salary_distribution') {
        $rows = analyticsRows($reportData, 'salary_buckets');
        if ($rows === []) {
            return 'The available salary dataset is not sufficient to form a descriptive conclusion.';
        }

        $total = 0;
        foreach ($rows as $row) {
            $total += analyticsIntValue($row, 'count');
        }
        $topSalary = pickAnalyticsRowByValue($rows, 'count', true);
        $topLabel = $topSalary ? analyticsLabelValue($topSalary, ['salary_range'], 'the leading salary range') : 'the leading salary range';
        $topCount = $topSalary ? analyticsIntValue($topSalary, 'count') : 0;

        return "Overall, reported salaries are most concentrated in {$topLabel}, with {$topCount} graduates or " . analyticsPercent($topCount, $total) . " of classified salary responses. This bracket is the main concentration point in the selected salary dataset.\n\nThe conclusion is based only on classified salary responses. Because the salary chart is grouped by ranges, the result describes the distribution of reported salary categories rather than individual salary values.";
    }

    return 'Overall, the selected analytics data is described by the visible counts and percentages in the report.';
}

function buildTypeSpecificPrompt(string $type, string $year, string $department, string $dataContext): string
{
    $filterContext = "Filters applied - Year: {$year}, Department: {$department}.";
    $descriptionRules = "Analyze only the supplied numerical data. Explain what the observed values show instead of repeating a list. Use counts and percentages where helpful and always identify the denominator. GradTrack reports use exactly two course-alignment categories: Aligned and Not Aligned. Never introduce another alignment category. Do not invent causes, perform inferential analysis, predict future outcomes, or call any difference statistically significant. Do not rank a program as better or worse from raw counts when sample sizes differ. Do not give recommendations or action plans. Use clear academic English suitable for undergraduate graduate-tracer research.";

    if ($type === 'by_program') {
        $focus = 'Compare every listed program using response totals, known employment denominators, employed and unemployed counts, employment rates, valid alignment denominators, and alignment categories. Explain sample-size differences and concentrations without turning raw counts into performance rankings.';
    } elseif ($type === 'by_year') {
        $focus = 'Describe every displayed graduation year, including response totals, employment counts and rates, alignment counts and rates, and visible increases or decreases. Note that cohort response totals may differ.';
    } elseif ($type === 'employment_status') {
        $focus = 'Analyze local employment, overseas employment, unemployment, and any unknown classifications. Distinguish the employed denominator used for location shares from the known-employment denominator used for unemployment.';
    } elseif ($type === 'salary_distribution') {
        $focus = 'Analyze every salary bracket, including zero-count brackets, percentages among valid salary responses, ties, concentrations, and the difference between all selected responses and valid salary responses. Never treat missing salary as zero or infer an exact average from grouped ranges.';
    } else {
        $focus = 'Explain respondent coverage, known and unknown employment status, employment and unemployment, local and overseas work, program-level differences, course alignment, and any available yearly or salary pattern. State why applicable denominators can differ from total responses.';
    }

    return "Generate a research-oriented descriptive analytics write-up for this graduate outcomes dataset. {$filterContext} {$descriptionRules} {$focus} Return plain text using exactly these markers: [KEY_FINDINGS], [DESCRIPTIVE_ANALYSIS], [EMPLOYMENT_INTERPRETATION], [PROGRAM_LEVEL_ANALYSIS], [COURSE_ALIGNMENT_ANALYSIS], [SUMMARY], and [DATA_NOTES]. Keep each section distinct: descriptive analysis explains distributions, key findings contains only the most important numerical findings, summary synthesizes patterns without repeating paragraphs, and data notes explains missing or differing denominators. Use 2 to 4 readable paragraphs where the available data support them. Do not use markdown or numbered lists. Data: {$dataContext}";
}

function normalizeToParagraphs(string $text): string
{
    $normalized = str_replace(["\r\n", "\r"], "\n", $text);

    // Remove common markdown wrappers and heading markers.
    $normalized = preg_replace('/^\s{0,3}#{1,6}\s*/m', '', $normalized) ?? $normalized;
    $normalized = preg_replace('/\*\*(.*?)\*\*/s', '$1', $normalized) ?? $normalized;
    $normalized = preg_replace('/__(.*?)__/s', '$1', $normalized) ?? $normalized;
    $normalized = preg_replace('/^[\t ]*[-*+]\s+/m', '', $normalized) ?? $normalized;

    // Convert numbered list items to sentence lines.
    $normalized = preg_replace('/^[\t ]*\d+\.\s+/m', '', $normalized) ?? $normalized;

    // Collapse excessive blank lines while preserving paragraph breaks.
    $normalized = preg_replace('/\n{3,}/', "\n\n", $normalized) ?? $normalized;

    return trim($normalized);
}

function removeAdvisorySentences(string $text): string
{
    $advisoryPattern = '/\b(recommend|recommendation|suggest|suggestion|should|must|need to|needs to|actionable|action item|next step|intervention|strategy|strategies|improve|improvement|enhance|consider|advice|advise)\b/i';
    $paragraphs = preg_split('/\n{2,}/', trim($text)) ?: [];
    $cleanParagraphs = [];

    foreach ($paragraphs as $paragraph) {
        $sentences = preg_split('/(?<=[.!?])\s+/', trim($paragraph)) ?: [];
        $keptSentences = [];
        foreach ($sentences as $sentence) {
            $sentence = trim($sentence);
            if ($sentence === '' || preg_match($advisoryPattern, $sentence)) {
                continue;
            }
            $keptSentences[] = $sentence;
        }

        if ($keptSentences !== []) {
            $cleanParagraphs[] = implode(' ', $keptSentences);
        }
    }

    return trim(implode("\n\n", $cleanParagraphs));
}

function parseAiAnalyticsSections(string $text): ?array
{
    $candidate = trim($text);
    $candidate = preg_replace('/^```(?:json)?\s*/i', '', $candidate) ?? $candidate;
    $candidate = preg_replace('/\s*```$/', '', $candidate) ?? $candidate;

    $sections = [
        'key_findings' => '',
        'descriptive_analysis' => '',
        'employment_interpretation' => '',
        'program_level_analysis' => '',
        'course_alignment_analysis' => '',
        'summary' => '',
        'data_notes' => '',
    ];
    foreach (array_keys($sections) as $key) {
        $marker = strtoupper($key);
        if (preg_match('/\[' . preg_quote($marker, '/') . '\]\s*(.*?)(?=\[[A-Z_]+\]|\z)/is', $candidate, $matches)) {
            $sections[$key] = trim($matches[1]);
        }
    }
    // Backward compatibility with a provider response using the previous conclusion marker.
    if ($sections['data_notes'] === '' && preg_match('/\[CONCLUSION\]\s*(.*)$/is', $candidate, $matches)) {
        $sections['data_notes'] = trim($matches[1]);
    }

    if (implode('', $sections) !== '') {
        return $sections;
    }

    $decoded = json_decode($candidate, true);

    if (!is_array($decoded)) {
        $start = strpos($candidate, '{');
        $end = strrpos($candidate, '}');
        if ($start !== false && $end !== false && $end > $start) {
            $decoded = json_decode(substr($candidate, $start, $end - $start + 1), true);
        }
    }

    if (is_array($decoded)) {
        $sections['key_findings'] = $decoded['key_findings'] ?? '';
        $sections['descriptive_analysis'] = $decoded['descriptive_analysis'] ?? $decoded['analysis'] ?? $decoded['ai_analysis'] ?? '';
        $sections['employment_interpretation'] = $decoded['employment_interpretation'] ?? '';
        $sections['program_level_analysis'] = $decoded['program_level_analysis'] ?? $decoded['program_analysis'] ?? '';
        $sections['course_alignment_analysis'] = $decoded['course_alignment_analysis'] ?? $decoded['alignment_analysis'] ?? '';
        $sections['summary'] = $decoded['summary'] ?? $decoded['ai_summary'] ?? '';
        $sections['data_notes'] = $decoded['data_notes'] ?? $decoded['conclusion'] ?? $decoded['ai_conclusion'] ?? '';
        return $sections;
    }

    foreach (array_keys($sections) as $key) {
        $label = str_replace('_', '[ _-]', preg_quote($key, '/'));
        if (preg_match('/(?:^|\n)\s*' . $label . '\s*:?\s*(.*?)(?=\n\s*[A-Za-z _-]+\s*:|\z)/is', $candidate, $matches)) {
            $sections[$key] = trim($matches[1]);
        }
    }

    return implode('', $sections) === '' ? null : $sections;
}

function cleanAiSectionText($text, string $fallback): string
{
    if (!is_string($text) || trim($text) === '') {
        return $fallback;
    }

    $cleaned = normalizeToParagraphs($text);
    $cleaned = preg_replace('/^(key findings|descriptive analysis|descriptive_analysis|employment interpretation|program level analysis|course alignment analysis|summary|data notes|conclusion)\s*:?\s*/i', '', $cleaned) ?? $cleaned;
    $cleaned = removeAdvisorySentences($cleaned);

    return $cleaned === '' ? $fallback : $cleaned;
}

function buildFallbackAnalysis(string $observedDataSummary, string $analyticsSummary): string
{
    return $observedDataSummary . "\n\n" . $analyticsSummary;
}

function graduateTracerSystemPrompt(string $outputInstruction): string
{
    return 'You are a research data analyst specializing in graduate tracer studies and descriptive statistics. '
        . 'Analyze only the numerical data supplied by GradTrack. Explain observed patterns clearly and academically without making unsupported assumptions. '
        . 'Describe respondent coverage, employment status and rate, local and overseas employment, program-level differences, course alignment, yearly patterns, salary distribution, notable concentrations, and limitations when those data are available. '
        . 'Use counts and percentages where helpful and always identify the correct denominator. Do not simply list values; explain what the values show. '
        . 'Do not invent causes, claim causation, perform inferential analysis, predict future employment, or call a difference statistically significant unless a supplied inferential test established it. '
        . 'Do not describe a program as better, worse, successful, or unsuccessful solely from raw counts, especially when sample sizes differ. '
        . "Use evidence-based phrases such as 'the data show', 'within the selected responses', 'among the valid responses', and 'the observed distribution indicates'. "
        . "Avoid phrases such as 'this proves', 'this caused', 'graduates prefer', and 'the program is more successful'. "
        . 'Write clear academic English that undergraduate researchers can understand. '
        . $outputInstruction;
}

function callGroqAnalytics(string $systemPrompt, string $userPrompt, int $maxTokens = 4200): array
{
    $apiKey = getenv('GROQ_API_KEY');
    if (empty($apiKey)) {
        return ['content' => null, 'model' => null, 'error' => 'GROQ_API_KEY not configured'];
    }

    $configuredModel = trim((string)getenv('GROQ_MODEL'));
    $candidateModels = array_values(array_unique(array_filter([
        $configuredModel !== '' ? $configuredModel : null,
        'openai/gpt-oss-120b',
        'qwen/qwen3.8-27b',
        'openai/gpt-oss-20b',
    ])));
    $lastError = null;

    foreach ($candidateModels as $model) {
        $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey,
        ]);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 8);
        curl_setopt($ch, CURLOPT_TIMEOUT, 28);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
            'model' => $model,
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => $userPrompt],
            ],
            'temperature' => 0.15,
            'max_tokens' => $maxTokens,
        ]));

        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($httpCode === 200 && is_string($response) && $response !== '') {
            $decoded = json_decode($response, true);
            $content = $decoded['choices'][0]['message']['content'] ?? null;
            if (is_string($content) && trim($content) !== '') {
                return ['content' => trim($content), 'model' => $model, 'error' => null];
            }
            $lastError = 'Groq AI returned an empty response.';
        } else {
            $lastError = $curlError !== ''
                ? $curlError
                : 'Groq AI request failed with HTTP status ' . $httpCode . '.';
        }

        // Try the next configured model when a model is unavailable, retired, or
        // temporarily rate-limited. Authentication and request errors will not be
        // fixed by changing models, so return those immediately.
        if (!in_array($httpCode, [400, 404, 429], true)) {
            break;
        }
    }

    return ['content' => null, 'model' => null, 'error' => $lastError ?? 'Groq AI request failed.'];
}

function parseFormalReportInterpretations(string $content): ?array
{
    $candidate = trim($content);
    $candidate = preg_replace('/^```(?:json)?\s*/i', '', $candidate) ?? $candidate;
    $candidate = preg_replace('/\s*```$/', '', $candidate) ?? $candidate;
    $decoded = json_decode($candidate, true);
    if (!is_array($decoded)) {
        $start = strpos($candidate, '{');
        $end = strrpos($candidate, '}');
        if ($start !== false && $end !== false && $end > $start) {
            $decoded = json_decode(substr($candidate, $start, $end - $start + 1), true);
        }
    }
    if (!is_array($decoded)) {
        return null;
    }

    return [
        'overview' => $decoded['overview'] ?? '',
        'programPerformance' => $decoded['programPerformance'] ?? $decoded['program_performance'] ?? '',
        'yearlyTrend' => $decoded['yearlyTrend'] ?? $decoded['yearly_trend'] ?? '',
        'employmentStatus' => $decoded['employmentStatus'] ?? $decoded['employment_status'] ?? '',
        'salaryDistribution' => $decoded['salaryDistribution'] ?? $decoded['salary_distribution'] ?? '',
    ];
}

function validFormalReportInterpretation($value): bool
{
    if (!is_string($value) || trim($value) === '') {
        return false;
    }
    $clean = trim($value);
    $wordCount = count(preg_split('/\s+/', $clean) ?: []);
    if ($wordCount < 35 || preg_match('/\b(?:NaN|Infinity|undefined|null)\b/i', $clean)) {
        return false;
    }
    return preg_match('/\b(?:statistically significant|significant relationship|caused?|proves?|best program|worst program|more successful|less successful)\b/i', $clean) !== 1;
}

function buildFormalReportPrompt(array $reportData, array $filters): string
{
    $payload = json_encode([
        'filters' => $filters,
        'analytics' => $reportData,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    return 'Create five separate descriptive interpretations for a formal graduate tracer report. '
        . 'Each interpretation must use only its matching dataset and the shared overview denominators. '
        . 'For datasets with enough observations, target approximately 120 to 220 words in 2 to 4 short paragraphs; use a shorter explanation for very small or empty datasets. '
        . 'Overview must cover total responses, known employment, employed, unemployed, local, abroad, valid alignment responses, aligned, not aligned, and denominator differences. GradTrack has exactly two alignment categories: Aligned and Not Aligned; do not introduce any other category. '
        . 'Program performance must discuss every program, sample-size differences, employment rates, and alignment rates without ranking programs from raw counts. '
        . 'Yearly trend must discuss every displayed year and visible count changes while noting different cohort sample sizes. '
        . 'Employment status must distinguish local/abroad shares among employed respondents from unemployment among known employment responses. '
        . 'Salary distribution must discuss every range, valid salary responses, percentages, ties, concentration, and missing salary responses without treating missing values as zero or estimating an exact mean. '
        . 'Return valid JSON only, with exactly these string keys: overview, programPerformance, yearlyTrend, employmentStatus, salaryDistribution. '
        . 'Do not include markdown, headings inside the strings, recommendations, causal claims, or inferential claims. Payload: ' . $payload;
}

try {
    $reportType = normalizeReportType((string)($_GET['type'] ?? 'overview'));
    $selectedYearValue = trim((string)($_GET['year'] ?? 'all'));
    if ($selectedYearValue === '' || strtolower($selectedYearValue) === 'all') {
        $selectedYear = 'all';
    } else {
        $normalizedSelectedYear = gradtrack_normalize_graduation_year($selectedYearValue);
        if ($normalizedSelectedYear === null) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Graduation year must be a valid four-digit year.']);
            exit;
        }
        $selectedYear = (string)$normalizedSelectedYear;
    }
    $selectedDepartment = $deanScope !== null
        ? (string)$deanScope['department_code']
        : strtoupper((string)($_GET['department'] ?? 'all'));
    $selectedSurveyId = getSelectedSurveyId($db);

    if ($selectedSurveyId !== null) {
        $selectedCoverage = gradtrack_get_survey_graduation_year_coverage($db, $selectedSurveyId);
        if (!$selectedCoverage['configured']
            && ($selectedCoverage['survey']['status'] ?? '') === 'active'
            && empty($selectedCoverage['survey']['archived_at'])) {
            http_response_code(422);
            echo json_encode([
                'success' => false,
                'code' => 'GRADUATION_YEAR_COVERAGE_NOT_CONFIGURED',
                'error' => 'Graduation year coverage has not been configured for the active survey.',
            ]);
            exit;
        }
        if ($selectedYear !== 'all'
            && $selectedCoverage['configured']
            && !in_array((int)$selectedYear, $selectedCoverage['years'], true)) {
            http_response_code(422);
            echo json_encode([
                'success' => false,
                'error' => 'The selected graduation year is not included in this survey.',
            ]);
            exit;
        }
    }

    $requestBody = json_decode((string)file_get_contents('php://input'), true);
    $reportData = is_array($requestBody) && array_key_exists('report_data', $requestBody)
        ? $requestBody['report_data']
        : null;

    $overview = null;
    if ($reportType === 'overview' && ($reportData === null || $reportData === [])) {
        $fallbackAnalyticsOptions = [];
        if ($deanScope !== null) {
            $fallbackAnalyticsOptions['program_codes'] = $deanScope['program_codes'];
        }
        if ($selectedYear !== 'all') {
            $fallbackAnalyticsOptions['graduation_year'] = (int)$selectedYear;
        }
        $overview = getOverviewData($db, $selectedSurveyId, $fallbackAnalyticsOptions);
        $reportData = $overview;
    }

    if ($reportData === null) {
        $reportData = [];
    }

    $reportData = normalizeDescriptiveAlignmentCategories($reportType, $reportData);

    if ($reportType === 'formal_report') {
        $filters = is_array($requestBody) && is_array($requestBody['filters'] ?? null)
            ? $requestBody['filters']
            : [];
        $providerResult = callGroqAnalytics(
            graduateTracerSystemPrompt('Return valid JSON only in the exact structure requested by the user prompt.'),
            buildFormalReportPrompt(is_array($reportData) ? $reportData : [], $filters),
            4600
        );
        $interpretations = is_string($providerResult['content'] ?? null)
            ? parseFormalReportInterpretations((string)$providerResult['content'])
            : null;
        $valid = is_array($interpretations);
        if ($valid) {
            foreach ($interpretations as $interpretation) {
                if (!validFormalReportInterpretation($interpretation)) {
                    $valid = false;
                    break;
                }
            }
        }

        echo json_encode([
            'success' => true,
            'data' => [
                'report_type' => 'formal_report',
                'ai_model' => $valid ? $providerResult['model'] : null,
                'pdf_interpretations' => $valid ? $interpretations : [],
                'ai_error' => $valid ? null : 'AI interpretation unavailable; use the verified local fallback.',
            ],
            'cached' => false,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $observedDataSummary = buildObservedDataSummary($reportType, $reportData);
    $analyticsSummary = buildAnalyticsSummary($reportType, $reportData);
    $analyticsConclusion = buildAnalyticsConclusion($reportType, $reportData);

    $dataContext = json_encode([
        'report_type' => $reportType,
        'survey_id' => $selectedSurveyId,
        'selected_year' => $selectedYear,
        'selected_department' => $selectedDepartment,
        'observed_data_counts' => $observedDataSummary,
        'descriptive_summary' => $analyticsSummary,
        'descriptive_conclusion' => $analyticsConclusion,
        'report_data' => $reportData,
    ], JSON_UNESCAPED_UNICODE);
    
    $aiAnalysis = buildFallbackAnalysis($observedDataSummary, $analyticsSummary);
    $aiKeyFindings = $analyticsSummary;
    $aiOverallSummary = $analyticsConclusion;
    $aiError = null;
    $selectedModel = null;
    $aiSections = null;
    $prompt = buildTypeSpecificPrompt($reportType, $selectedYear, $selectedDepartment, (string)$dataContext);
    $providerResult = callGroqAnalytics(
        graduateTracerSystemPrompt('Return plain text only with the exact section markers requested by the user prompt. Do not use markdown or JSON.'),
        $prompt,
        3200
    );
    $aiContent = $providerResult['content'] ?? null;
    if (is_string($aiContent) && trim($aiContent) !== ''
        && preg_match('/\b(?:statistically significant|significant relationship|caused?|proves?|best program|worst program|more successful|less successful)\b/i', $aiContent) !== 1) {
        $parsedSections = parseAiAnalyticsSections($aiContent);
        if ($parsedSections !== null) {
            $requiredKeys = $reportType === 'overview'
                ? ['descriptive_analysis', 'employment_interpretation', 'program_level_analysis', 'course_alignment_analysis', 'summary']
                : ['descriptive_analysis', 'key_findings', 'summary'];
            $hasRequiredSections = true;
            foreach ($requiredKeys as $requiredKey) {
                if (!is_string($parsedSections[$requiredKey] ?? null)
                    || trim((string)$parsedSections[$requiredKey]) === '') {
                    $hasRequiredSections = false;
                    break;
                }
            }
            if (!$hasRequiredSections) {
                $aiError = 'GROQ AI output was incomplete; deterministic fallback used.';
            } else {
                $aiSections = [];
                foreach ($parsedSections as $key => $value) {
                    $aiSections[$key] = cleanAiSectionText($value, '');
                }
                $aiAnalysis = cleanAiSectionText($aiSections['descriptive_analysis'] ?? '', $aiAnalysis);
                $aiKeyFindings = cleanAiSectionText($aiSections['key_findings'] ?? '', $aiKeyFindings);
                $aiOverallSummary = cleanAiSectionText($aiSections['summary'] ?? '', $aiOverallSummary);
                $selectedModel = $providerResult['model'] ?? null;
            }
        } else {
            $aiError = 'GROQ AI output could not be validated; deterministic fallback used.';
        }
    } else {
        $aiError = 'GROQ AI unavailable or invalid; deterministic fallback used.';
    }

    $responseData = [
        'report_type' => $reportType,
        'survey_id' => $selectedSurveyId,
        'selected_year' => $selectedYear,
        'selected_department' => $selectedDepartment,
        'ai_model' => $selectedModel,
        'ai_analysis' => $aiAnalysis,
        'ai_summary' => $aiKeyFindings,
        'ai_conclusion' => $aiOverallSummary,
    ];

    if (is_array($aiSections)) {
        $responseData['ai_sections'] = $aiSections;
    }

    if ($aiError !== null) {
        $responseData['ai_error'] = $aiError;
    }

    if ($reportType === 'overview' && is_array($reportData)) {
        $responseData['overview'] = $reportData;
    }

    echo json_encode([
        "success" => true,
        "data" => $responseData,
        "cached" => false
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error" => gradtrack_public_exception_message($e, 'Unable to generate AI analytics right now.', 'AI analytics API')
    ]);
}
