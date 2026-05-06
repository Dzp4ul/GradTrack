<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();

function getSelectedSurveyId(PDO $db): ?int
{
    if (array_key_exists('survey_id', $_GET)) {
        $surveyId = $_GET['survey_id'];
        return is_scalar($surveyId) && (int)$surveyId > 0 ? (int)$surveyId : null;
    }

    $stmt = $db->query("
        SELECT id
        FROM surveys
        WHERE status = 'active'
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

function getOverviewData(PDO $db, ?int $surveyId): array
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
            'total_survey_responses' => 0,
            'employment_rate' => 0,
            'alignment_rate' => 0,
        ];
    }

    $stmt = $db->prepare("SELECT COUNT(*) as total FROM survey_responses WHERE survey_id = :survey_id");
    $stmt->bindValue(':survey_id', $surveyId, PDO::PARAM_INT);
    $stmt->execute();
    $totalResponses = (int)$stmt->fetch(PDO::FETCH_ASSOC)['total'];

    $stmt = $db->prepare("
        SELECT id, question_text, sort_order
        FROM survey_questions
        WHERE survey_id = :survey_id
        ORDER BY sort_order
    ");
    $stmt->bindValue(':survey_id', $surveyId, PDO::PARAM_INT);
    $stmt->execute();
    $questions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $questionMap = [];
    foreach ($questions as $q) {
        $questionMap[$q['id']] = strtolower((string)$q['question_text']);
    }

    $responseKeys = getSurveyResponseQuestionKeys($db, $surveyId);
    if (!empty($questions) && !empty($responseKeys)) {
        $firstResponseKey = min($responseKeys);
        $firstQuestion = $questions[0];
        $firstQuestionId = (int)$firstQuestion['id'];
        $firstSortOrder = (int)$firstQuestion['sort_order'];
        $idOffset = $firstQuestionId - $firstResponseKey;

        foreach ($questions as $q) {
            $questionText = strtolower((string)$q['question_text']);
            $historicalKeyBySort = $firstResponseKey + ((int)$q['sort_order'] - $firstSortOrder);
            $historicalKeyById = (int)$q['id'] - $idOffset;

            if ($historicalKeyBySort > 0 && !isset($questionMap[$historicalKeyBySort])) {
                $questionMap[$historicalKeyBySort] = $questionText;
            }
            if ($historicalKeyById > 0 && !isset($questionMap[$historicalKeyById])) {
                $questionMap[$historicalKeyById] = $questionText;
            }
        }
    }

    $stmt = $db->prepare("SELECT responses FROM survey_responses WHERE survey_id = :survey_id");
    $stmt->bindValue(':survey_id', $surveyId, PDO::PARAM_INT);
    $stmt->execute();
    $surveyResponses = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $employedCount = 0;
    $unemployedCount = 0;
    $employedLocalCount = 0;
    $employedAbroadCount = 0;
    $alignedCount = 0;

    foreach ($surveyResponses as $response) {
        $data = json_decode((string)$response['responses'], true);
        if (!is_array($data)) {
            continue;
        }

        $isEmployed = false;
        $isUnemployed = false;
        $jobRelated = '';
        $workLocation = '';

        foreach ($data as $questionId => $answer) {
            $questionText = $questionMap[$questionId] ?? '';
            $answerValue = is_string($answer) ? strtolower(trim($answer)) : '';

            if (strpos($questionText, 'employment status') !== false || strpos($questionText, 'presently employed') !== false) {
                $employmentAnswer = parseEmploymentAnswer($answer);
                if ($employmentAnswer !== null) {
                    if ($employmentAnswer) {
                        $isEmployed = true;
                    } else {
                        $isUnemployed = true;
                    }
                }
            }

            if (strpos($questionText, 'place of work') !== false) {
                $workLocation = $answerValue;
            }

            if (strpos($questionText, 'job related to') !== false || strpos($questionText, 'related to your course') !== false) {
                $jobRelated = $answerValue;
            }
        }

        if ($isEmployed) {
            $employedCount++;
            if (strpos($workLocation, 'abroad') !== false || strpos($workLocation, 'overseas') !== false) {
                $employedAbroadCount++;
            } else {
                $employedLocalCount++;
            }

            if (strpos($jobRelated, 'yes') !== false || strpos($jobRelated, 'directly related') !== false) {
                $alignedCount++;
            }
        } elseif ($isUnemployed) {
            $unemployedCount++;
        }
    }

    return [
        'survey_id' => $surveyId,
        'total_graduates' => $totalResponses,
        'total_employed' => $employedCount,
        'total_unemployed' => $unemployedCount,
        'total_employment_known' => $employedCount + $unemployedCount,
        'total_employed_local' => $employedLocalCount,
        'total_employed_abroad' => $employedAbroadCount,
        'total_aligned' => $alignedCount,
        'total_survey_responses' => $totalResponses,
        'employment_rate' => ($employedCount + $unemployedCount) > 0 ? round(($employedCount / ($employedCount + $unemployedCount)) * 100, 1) : 0,
        'alignment_rate' => $employedCount > 0 ? round(($alignedCount / $employedCount) * 100, 1) : 0,
    ];
}

function getSurveyResponseQuestionKeys(PDO $db, ?int $surveyId): array
{
    if ($surveyId === null) {
        return [];
    }

    $stmt = $db->prepare("
        SELECT responses
        FROM survey_responses
        WHERE survey_id = :survey_id
        ORDER BY id ASC
        LIMIT 25
    ");
    $stmt->bindValue(':survey_id', $surveyId, PDO::PARAM_INT);
    $stmt->execute();

    $keys = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $response) {
        $data = json_decode((string)$response['responses'], true);
        if (!is_array($data)) {
            continue;
        }

        foreach (array_keys($data) as $key) {
            if (ctype_digit((string)$key)) {
                $keys[(int)$key] = (int)$key;
            }
        }
    }

    sort($keys, SORT_NUMERIC);
    return array_values($keys);
}

function normalizeReportType(string $type): string
{
    $allowed = ['overview', 'by_program', 'by_year', 'employment_status', 'salary_distribution'];
    return in_array($type, $allowed, true) ? $type : 'overview';
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

function analyticsIntValue(array $data, string $key): int
{
    $value = $data[$key] ?? 0;
    return is_numeric($value) ? (int)$value : 0;
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
        $employed = analyticsIntValue($row, 'employed');
        $notEmployed = max($total - $employed, 0);
        $aligned = analyticsIntValue($row, 'aligned');
        $partiallyAligned = analyticsIntValue($row, 'partially_aligned');
        $notAligned = analyticsIntValue($row, 'not_aligned');

        $parts[] = "{$label} - total {$total}, employed {$employed}, not employed {$notEmployed}, aligned {$aligned}, partially aligned {$partiallyAligned}, not aligned {$notAligned}";
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
        $unknown = max($total - ($employmentKnown > 0 ? $employmentKnown : ($employed + $unemployed)), 0);

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
            . 'employment rate ' . formatAnalyticsValue($overview['employment_rate'] ?? 0) . ' percent; '
            . 'alignment rate ' . formatAnalyticsValue($overview['alignment_rate'] ?? 0) . ' percent.';

        $programParts = buildProgramCountParts($programRows);
        if ($programParts !== []) {
            $summary .= "\n\nProgram counts in the same dataset: " . implode('; ', $programParts) . '.';
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
            $employed = analyticsIntValue($row, 'employed');
            $notEmployed = max($total - $employed, 0);
            $aligned = analyticsIntValue($row, 'aligned');
            $parts[] = "{$label} - total {$total}, employed {$employed}, not employed {$notEmployed}, aligned {$aligned}";
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
        $unknown = max($total - ($employmentKnown > 0 ? $employmentKnown : ($employed + $unemployed)), 0);
        $programRows = isset($reportData['by_program']) && is_array($reportData['by_program'])
            ? $reportData['by_program']
            : [];
        $programNarrative = buildProgramNarrative($programRows);
        $programParagraph = $programNarrative !== ''
            ? "\n\nAt the program level, the same dataset is distributed as follows: {$programNarrative} These program counts add context to the overview by showing where the employed, not-employed, aligned, partially aligned, and not-aligned graduates are concentrated."
            : '';

        return "The selected overview is based on {$total} graduate responses and {$surveyResponses} survey responses. Employment status is classified for {$employmentKnown} graduates, while {$unknown} record remains without a classified employment status. Within the classified records, {$employed} graduates are employed and {$unemployed} are unemployed, producing an employment rate of "
            . formatAnalyticsValue($overview['employment_rate'] ?? 0)
            . "%.\n\nAmong the {$employed} employed graduates, {$local} are employed locally and {$abroad} are employed abroad. Local employment represents "
            . analyticsPercent($local, $employed)
            . ' of employed graduates, while abroad employment represents '
            . analyticsPercent($abroad, $employed)
            . ". Course alignment is recorded for {$aligned} employed graduates, giving an alignment rate of "
            . formatAnalyticsValue($overview['alignment_rate'] ?? 0)
            . "% among employed graduates.{$programParagraph}";
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
        $partiallyAligned = 0;
        $notAligned = 0;
        foreach ($rows as $row) {
            $total += analyticsIntValue($row, 'total_graduates');
            $employed += analyticsIntValue($row, 'employed');
            $aligned += analyticsIntValue($row, 'aligned');
            $partiallyAligned += analyticsIntValue($row, 'partially_aligned');
            $notAligned += analyticsIntValue($row, 'not_aligned');
        }
        $notEmployed = max($total - $employed, 0);
        $topEmployed = pickAnalyticsRowByValue($rows, 'employed', true);
        $topLabel = $topEmployed ? analyticsLabelValue($topEmployed, ['code', 'name'], 'the leading program') : 'the leading program';
        $topCount = $topEmployed ? analyticsIntValue($topEmployed, 'employed') : 0;

        return "The program dataset includes {$programCount} programs with {$total} graduates. Across these programs, {$employed} graduates are employed and {$notEmployed} are not employed, while course alignment counts include {$aligned} aligned, {$partiallyAligned} partially aligned, and {$notAligned} not aligned graduates.\n\nBy employed count, {$topLabel} is the largest contributor with {$topCount} employed graduates. The program rows form a comparative distribution: each program contributes a different share of the total graduate population, employment count, and course-alignment count in the selected filters.";
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
        $employmentRate = formatAnalyticsValue($overview['employment_rate'] ?? 0);
        $alignmentRate = formatAnalyticsValue($overview['alignment_rate'] ?? 0);
        $employmentKnown = analyticsIntValue($overview, 'total_employment_known');
        $unemployed = analyticsIntValue($overview, 'total_unemployed');

        $locationPattern = 'no classified employment location';
        if ($local > $abroad) {
            $locationPattern = 'local employment has the larger share';
        } elseif ($abroad > $local) {
            $locationPattern = 'abroad employment has the larger share';
        } elseif (($local + $abroad) > 0) {
            $locationPattern = 'local and abroad employment have equal counts';
        }

        return "Overall, the selected overview describes a mostly classified employment dataset: {$employmentKnown} graduates have a known employment status, with {$employed} employed and {$unemployed} unemployed. The employment rate is {$employmentRate}%, so the employed group forms the larger portion of the classified employment-status records.\n\nWithin the employed group, {$locationPattern}. The local count is {$local}, the abroad count is {$abroad}, and the aligned count is {$aligned}. The alignment rate of {$alignmentRate}% indicates that more than half of the employed graduates in this selected overview are recorded as working in a field aligned with their course.";
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
    $descriptionRules = "Only analyze the data that is present. Include exact counts and percentages for the important metrics, categories, and rows in the provided data. Do not give recommendations, suggestions, action items, interventions, advice, strategies, next steps, or improvement ideas. Do not predict future outcomes. Keep the wording observational, clear, and evidence-based.";

    if ($type === 'by_program') {
        $focus = 'Compare the listed programs using their exact totals, employed counts, not-employed counts, alignment counts, and visible differences between programs.';
    } elseif ($type === 'by_year') {
        $focus = 'Compare the graduation years using their exact total, employed, not-employed, and aligned counts, and describe the pattern across cohorts.';
    } elseif ($type === 'employment_status') {
        $focus = 'Analyze the employment status distribution, including exact counts for local employed, abroad employed, unemployed, total employed, total classified, and the relative share of each category.';
    } elseif ($type === 'salary_distribution') {
        $focus = 'Analyze every salary bracket and its exact count, including zero-count brackets, and describe where the responses are concentrated.';
    } else {
        $focus = 'Analyze the overview metrics, including total responses, employed, unemployed, local employment, abroad employment, aligned graduates, employment rate, alignment rate, and program-level context when provided.';
    }

    return "Generate a complete descriptive analytics write-up for this graduate outcomes dataset. {$filterContext} {$descriptionRules} {$focus} Return plain text only in exactly this section format: [DESCRIPTIVE_ANALYSIS] then 4 to 6 clear paragraphs, [SUMMARY] then 3 to 4 detailed analytical paragraphs, and [CONCLUSION] then 2 to 3 well-developed paragraphs that synthesize what the selected data indicates without giving advice. Do not use markdown, bullets, numbered lists, or JSON. Data: {$dataContext}";
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

    $markerSections = [
        'descriptive_analysis' => '',
        'summary' => '',
        'conclusion' => '',
    ];

    if (preg_match('/\[DESCRIPTIVE_ANALYSIS\]\s*(.*?)(?=\[SUMMARY\]|\z)/is', $candidate, $matches)) {
        $markerSections['descriptive_analysis'] = trim($matches[1]);
    }
    if (preg_match('/\[SUMMARY\]\s*(.*?)(?=\[CONCLUSION\]|\z)/is', $candidate, $matches)) {
        $markerSections['summary'] = trim($matches[1]);
    }
    if (preg_match('/\[CONCLUSION\]\s*(.*)$/is', $candidate, $matches)) {
        $markerSections['conclusion'] = trim($matches[1]);
    }

    if (implode('', $markerSections) !== '') {
        return $markerSections;
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
        return [
            'descriptive_analysis' => $decoded['descriptive_analysis'] ?? $decoded['analysis'] ?? $decoded['ai_analysis'] ?? '',
            'summary' => $decoded['summary'] ?? $decoded['ai_summary'] ?? '',
            'conclusion' => $decoded['conclusion'] ?? $decoded['ai_conclusion'] ?? '',
        ];
    }

    $sections = [
        'descriptive_analysis' => '',
        'summary' => '',
        'conclusion' => '',
    ];

    if (preg_match('/(?:^|\n)\s*(?:descriptive analysis|descriptive_analysis)\s*:?\s*(.*?)(?=\n\s*(?:summary)\s*:|\z)/is', $candidate, $matches)) {
        $sections['descriptive_analysis'] = trim($matches[1]);
    }
    if (preg_match('/(?:^|\n)\s*summary\s*:?\s*(.*?)(?=\n\s*(?:conclusion)\s*:|\z)/is', $candidate, $matches)) {
        $sections['summary'] = trim($matches[1]);
    }
    if (preg_match('/(?:^|\n)\s*conclusion\s*:?\s*(.*)$/is', $candidate, $matches)) {
        $sections['conclusion'] = trim($matches[1]);
    }

    return implode('', $sections) === '' ? null : $sections;
}

function cleanAiSectionText($text, string $fallback): string
{
    if (!is_string($text) || trim($text) === '') {
        return $fallback;
    }

    $cleaned = normalizeToParagraphs($text);
    $cleaned = preg_replace('/^(descriptive analysis|descriptive_analysis|summary|conclusion)\s*:?\s*/i', '', $cleaned) ?? $cleaned;
    $cleaned = removeAdvisorySentences($cleaned);

    return $cleaned === '' ? $fallback : $cleaned;
}

function buildFallbackAnalysis(string $observedDataSummary, string $analyticsSummary): string
{
    return $observedDataSummary . "\n\n" . $analyticsSummary;
}

try {
    $reportType = normalizeReportType((string)($_GET['type'] ?? 'overview'));
    $selectedYear = (string)($_GET['year'] ?? 'all');
    $selectedDepartment = strtoupper((string)($_GET['department'] ?? 'all'));
    $selectedSurveyId = getSelectedSurveyId($db);

    $requestBody = json_decode((string)file_get_contents('php://input'), true);
    $reportData = is_array($requestBody) && array_key_exists('report_data', $requestBody)
        ? $requestBody['report_data']
        : null;

    $overview = null;
    if ($reportType === 'overview' && ($reportData === null || $reportData === [])) {
        $overview = getOverviewData($db, $selectedSurveyId);
        $reportData = $overview;
    }

    if ($reportData === null) {
        $reportData = [];
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
    $aiError = null;
    $selectedModel = null;

    // Get GROQ API key from environment. If AI is not available, keep the local fallback text.
    $groqApiKey = getenv('GROQ_API_KEY');
    if (empty($groqApiKey)) {
        $aiError = 'GROQ_API_KEY not configured';
    } else {
        $prompt = buildTypeSpecificPrompt($reportType, $selectedYear, $selectedDepartment, (string)$dataContext);

        $candidateModels = [
            'llama-3.3-70b-versatile',
            'llama-3.1-8b-instant',
        ];

        $response = null;
        $httpCode = 0;

        foreach ($candidateModels as $model) {
            $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $groqApiKey
            ]);
            curl_setopt($ch, CURLOPT_TIMEOUT, 40);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
                'model' => $model,
                'messages' => [
                    ['role' => 'system', 'content' => 'You are a descriptive data analyst for graduate employment outcomes. Analyze only what is visible in the supplied data, using exact counts and percentages. Do not provide recommendations, suggestions, action items, interventions, advice, strategies, next steps, or improvement ideas. Do not predict future results. Return plain text only with exactly these section markers: [DESCRIPTIVE_ANALYSIS], [SUMMARY], and [CONCLUSION]. Do not use markdown, bullets, numbered lists, or JSON.'],
                    ['role' => 'user', 'content' => $prompt]
                ],
                'temperature' => 0.2,
                'max_tokens' => 2600
            ]));

            $attemptResponse = curl_exec($ch);
            $attemptCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);

            $response = $attemptResponse;
            $httpCode = (int)$attemptCode;
            if ($httpCode === 200) {
                $selectedModel = $model;
                break;
            }

            $aiError = $curlError !== ''
                ? $curlError
                : 'Groq AI request failed (HTTP ' . (int)$httpCode . '). ' . (is_string($response) ? substr($response, 0, 240) : '');

            // Retry with next Groq model when rate-limited.
            if ($httpCode !== 429) {
                break;
            }
        }

        $aiContent = null;
        if ($httpCode === 200 && is_string($response) && $response !== '') {
            $result = json_decode($response, true);
            $aiContent = $result['choices'][0]['message']['content'] ?? null;
        }

        if (is_string($aiContent) && trim($aiContent) !== '') {
            $aiSections = parseAiAnalyticsSections($aiContent);
            if ($aiSections !== null) {
                $aiAnalysis = cleanAiSectionText(
                    $aiSections['descriptive_analysis'] ?? '',
                    $aiAnalysis
                );
                $analyticsSummary = cleanAiSectionText(
                    $aiSections['summary'] ?? '',
                    $analyticsSummary
                );
                $analyticsConclusion = cleanAiSectionText(
                    $aiSections['conclusion'] ?? '',
                    $analyticsConclusion
                );
            } else {
                $cleanedAiContent = removeAdvisorySentences(normalizeToParagraphs($aiContent));
                if ($cleanedAiContent !== '') {
                    $aiAnalysis = $observedDataSummary . "\n\n" . $cleanedAiContent;
                }
            }
        } elseif ($aiError === null) {
            $aiError = 'Groq AI response was empty.';
        }
    }

    $responseData = [
        'report_type' => $reportType,
        'survey_id' => $selectedSurveyId,
        'selected_year' => $selectedYear,
        'selected_department' => $selectedDepartment,
        'ai_model' => $selectedModel,
        'ai_analysis' => $aiAnalysis,
        'ai_summary' => $analyticsSummary,
        'ai_conclusion' => $analyticsConclusion,
    ];

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
        "error" => $e->getMessage()
    ]);
}
