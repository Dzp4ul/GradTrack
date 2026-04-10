<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();

function getOverviewData(PDO $db): array
{
    $stmt = $db->query("SELECT COUNT(*) as total FROM survey_responses");
    $totalResponses = (int)$stmt->fetch(PDO::FETCH_ASSOC)['total'];

    $stmt = $db->query("SELECT q.id, q.question_text FROM surveys s JOIN survey_questions q ON s.id = q.survey_id WHERE s.status = 'active' ORDER BY q.sort_order");
    $questions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $questionMap = [];
    foreach ($questions as $q) {
        $questionMap[$q['id']] = strtolower((string)$q['question_text']);
    }

    $stmt = $db->query("SELECT responses FROM survey_responses");
    $surveyResponses = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $employedCount = 0;
    $employedLocalCount = 0;
    $employedAbroadCount = 0;
    $alignedCount = 0;

    foreach ($surveyResponses as $response) {
        $data = json_decode((string)$response['responses'], true);
        if (!is_array($data)) {
            continue;
        }

        $isEmployed = false;
        $jobRelated = '';
        $workLocation = '';

        foreach ($data as $questionId => $answer) {
            $questionText = $questionMap[$questionId] ?? '';
            $answerValue = is_string($answer) ? strtolower(trim($answer)) : '';

            if (strpos($questionText, 'employment status') !== false || strpos($questionText, 'presently employed') !== false) {
                if ($answerValue === 'employed' || $answerValue === 'yes') {
                    $isEmployed = true;
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
        }
    }

    return [
        'total_graduates' => $totalResponses,
        'total_employed' => $employedCount,
        'total_employed_local' => $employedLocalCount,
        'total_employed_abroad' => $employedAbroadCount,
        'total_aligned' => $alignedCount,
        'total_survey_responses' => $totalResponses,
        'employment_rate' => $totalResponses > 0 ? round(($employedCount / $totalResponses) * 100, 1) : 0,
        'alignment_rate' => $employedCount > 0 ? round(($alignedCount / $employedCount) * 100, 1) : 0,
    ];
}

function normalizeReportType(string $type): string
{
    $allowed = ['overview', 'by_program', 'by_year', 'employment_status', 'salary_distribution'];
    return in_array($type, $allowed, true) ? $type : 'overview';
}

function buildTypeSpecificPrompt(string $type, string $year, string $department, string $dataContext): string
{
    $filterContext = "Filters applied - Year: {$year}, Department: {$department}.";

    if ($type === 'by_program') {
        return "Analyze this graduate outcomes dataset grouped by program. {$filterContext} Focus on high and low performing programs, employment-alignment gaps, and practical actions per program. Keep it descriptive and concise in 3-4 paragraphs. Data: {$dataContext}";
    }

    if ($type === 'by_year') {
        return "Analyze this year-based graduate outcomes dataset. {$filterContext} Highlight trends over time, possible shifts in employment/alignment, and operational recommendations for college leadership. Keep it descriptive and concise in 3-4 paragraphs. Data: {$dataContext}";
    }

    if ($type === 'employment_status') {
        return "Analyze this employment status distribution dataset. {$filterContext} Explain local vs abroad vs unemployed distribution, implications for career services, and targeted intervention ideas. Keep it descriptive and concise in 3-4 paragraphs. Data: {$dataContext}";
    }

    if ($type === 'salary_distribution') {
        return "Analyze this graduate salary distribution dataset. {$filterContext} Explain dominant salary brackets, likely early-career positioning, and actionable suggestions for improving earning outcomes. Keep it descriptive and concise in 3-4 paragraphs. Data: {$dataContext}";
    }

    return "Analyze this graduate employment overview dataset and provide a comprehensive narrative summary in 3-4 paragraphs. {$filterContext} Focus on key patterns, interpretation, and actionable insights for educational administrators. Data: {$dataContext}";
}

try {
    $reportType = normalizeReportType((string)($_GET['type'] ?? 'overview'));
    $selectedYear = (string)($_GET['year'] ?? 'all');
    $selectedDepartment = strtoupper((string)($_GET['department'] ?? 'all'));

    $requestBody = json_decode((string)file_get_contents('php://input'), true);
    $reportData = is_array($requestBody) && array_key_exists('report_data', $requestBody)
        ? $requestBody['report_data']
        : null;

    $overview = null;
    if ($reportType === 'overview' && ($reportData === null || $reportData === [])) {
        $overview = getOverviewData($db);
        $reportData = $overview;
    }

    if ($reportData === null) {
        $reportData = [];
    }

    $dataContext = json_encode([
        'report_type' => $reportType,
        'selected_year' => $selectedYear,
        'selected_department' => $selectedDepartment,
        'report_data' => $reportData,
    ], JSON_UNESCAPED_UNICODE);
    
    // Get GROQ API key from environment
    $groqApiKey = getenv('GROQ_API_KEY');
    
    if (empty($groqApiKey)) {
        throw new Exception('GROQ_API_KEY not configured');
    }

    // Call Groq API
    $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $groqApiKey
    ]);
    
    $prompt = buildTypeSpecificPrompt($reportType, $selectedYear, $selectedDepartment, (string)$dataContext);
    
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
        'model' => 'llama-3.3-70b-versatile',
        'messages' => [
            ['role' => 'system', 'content' => 'You are an expert data analyst specializing in graduate employment outcomes and educational analytics.'],
            ['role' => 'user', 'content' => $prompt]
        ],
        'temperature' => 0.7,
        'max_tokens' => 800
    ]));
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200) {
        throw new Exception('AI service unavailable');
    }
    
    $result = json_decode($response, true);
    $aiAnalysis = $result['choices'][0]['message']['content'] ?? 'Analysis unavailable';

    $responseData = [
        'report_type' => $reportType,
        'selected_year' => $selectedYear,
        'selected_department' => $selectedDepartment,
        'ai_analysis' => $aiAnalysis,
    ];

    if ($reportType === 'overview' && is_array($reportData)) {
        $responseData['overview'] = $reportData;
    }
    
    echo json_encode([
        "success" => true,
        "data" => $responseData
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error" => $e->getMessage()
    ]);
}
