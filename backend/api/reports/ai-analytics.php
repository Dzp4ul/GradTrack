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

function buildTypeSpecificPrompt(string $type, string $year, string $department, string $dataContext): string
{
    $filterContext = "Filters applied - Year: {$year}, Department: {$department}.";
    $descriptionRules = "Only describe the data that is present. Include exact counts and percentages for every metric, category, and row in the provided data. Do not give recommendations, suggestions, action items, interventions, advice, strategies, next steps, or improvement ideas. Do not predict future outcomes. Keep the wording observational and descriptive.";

    if ($type === 'by_program') {
        return "Describe this graduate outcomes dataset grouped by program. {$filterContext} {$descriptionRules} Compare the listed programs using their exact totals, employed counts, not-employed counts, and alignment counts. Keep it clear in 2-4 concise paragraphs. Data: {$dataContext}";
    }

    if ($type === 'by_year') {
        return "Describe this year-based graduate outcomes dataset. {$filterContext} {$descriptionRules} State each year shown and compare the exact total, employed, not-employed, and aligned counts. Keep it clear in 2-4 concise paragraphs. Data: {$dataContext}";
    }

    if ($type === 'employment_status') {
        return "Describe this employment status distribution dataset. {$filterContext} {$descriptionRules} State the exact counts for local employed, abroad employed, unemployed, total employed, and total classified where available. Keep it clear in 2-4 concise paragraphs. Data: {$dataContext}";
    }

    if ($type === 'salary_distribution') {
        return "Describe this graduate salary distribution dataset. {$filterContext} {$descriptionRules} State every salary bracket and its exact count, including zero-count brackets. Keep it clear in 2-4 concise paragraphs. Data: {$dataContext}";
    }

    return "Describe this graduate employment overview dataset. {$filterContext} {$descriptionRules} State all overview metrics exactly, including total responses, employed, unemployed, local, abroad, aligned, employment rate, and alignment rate. Keep it clear in 2-4 concise paragraphs. Data: {$dataContext}";
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

    $dataContext = json_encode([
        'report_type' => $reportType,
        'survey_id' => $selectedSurveyId,
        'selected_year' => $selectedYear,
        'selected_department' => $selectedDepartment,
        'observed_data_counts' => $observedDataSummary,
        'report_data' => $reportData,
    ], JSON_UNESCAPED_UNICODE);
    
    // Get GROQ API key from environment
    $groqApiKey = getenv('GROQ_API_KEY');
    
    if (empty($groqApiKey)) {
        throw new Exception('GROQ_API_KEY not configured');
    }

    $prompt = buildTypeSpecificPrompt($reportType, $selectedYear, $selectedDepartment, (string)$dataContext);

    $candidateModels = [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
    ];

    $response = null;
    $httpCode = 0;
    $selectedModel = null;

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
                ['role' => 'system', 'content' => 'You are a descriptive data analyst for graduate employment outcomes. Describe only what is visible in the supplied data, using exact counts and percentages. Do not provide recommendations, suggestions, action items, interventions, advice, strategies, next steps, or improvement ideas. Do not predict future results. Return plain text only: no markdown, no headings, no bullets, no numbered lists, and no special formatting. Write 2 to 4 concise paragraphs.'],
                ['role' => 'user', 'content' => $prompt]
            ],
            'temperature' => 0.2,
            'max_tokens' => 1100
        ]));

        $attemptResponse = curl_exec($ch);
        $attemptCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $response = $attemptResponse;
        $httpCode = (int)$attemptCode;
        if ($httpCode === 200) {
            $selectedModel = $model;
            break;
        }

        // Retry with next Groq model when rate-limited.
        if ($httpCode !== 429) {
            // Non-rate-limit errors should stop retries to avoid masking real issues.
            break;
        }
    }
    
    $aiAnalysis = null;
    if ($httpCode === 200 && is_string($response) && $response !== '') {
        $result = json_decode($response, true);
        $aiAnalysis = $result['choices'][0]['message']['content'] ?? null;
    }

    if (!is_string($aiAnalysis) || trim($aiAnalysis) === '') {
        $errorPreview = is_string($response) ? substr($response, 0, 240) : '';
        throw new Exception('Groq AI request failed (HTTP ' . (int)$httpCode . '). ' . $errorPreview);
    }

    $aiAnalysis = removeAdvisorySentences(normalizeToParagraphs($aiAnalysis));
    if ($aiAnalysis === '') {
        $aiAnalysis = 'The selected analytics data is described by the observed counts above.';
    }
    $aiAnalysis = $observedDataSummary . "\n\n" . $aiAnalysis;

    $responseData = [
        'report_type' => $reportType,
        'survey_id' => $selectedSurveyId,
        'selected_year' => $selectedYear,
        'selected_department' => $selectedDepartment,
        'ai_model' => $selectedModel,
        'ai_analysis' => $aiAnalysis,
    ];

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
