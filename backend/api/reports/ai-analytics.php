<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();

try {
    // Get overview data
    $stmt = $db->query("SELECT COUNT(*) as total FROM survey_responses");
    $totalResponses = $stmt->fetch(PDO::FETCH_ASSOC)['total'];
    
    $stmt = $db->query("SELECT q.id, q.question_text FROM surveys s JOIN survey_questions q ON s.id = q.survey_id WHERE s.status = 'active' ORDER BY q.sort_order");
    $questions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $questionMap = [];
    foreach ($questions as $q) {
        $questionMap[$q['id']] = strtolower($q['question_text']);
    }
    
    $stmt = $db->query("SELECT responses FROM survey_responses");
    $surveyResponses = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $employedCount = 0;
    $employedLocalCount = 0;
    $employedAbroadCount = 0;
    $alignedCount = 0;
    
    foreach ($surveyResponses as $response) {
        $data = json_decode($response['responses'], true);
        if (!is_array($data)) continue;
        
        $isEmployed = false;
        $jobRelated = '';
        $workLocation = '';
        
        foreach ($data as $questionId => $answer) {
            $questionText = isset($questionMap[$questionId]) ? $questionMap[$questionId] : '';
            
            if (strpos($questionText, 'employment status') !== false || strpos($questionText, 'presently employed') !== false) {
                if (is_string($answer) && (strtolower($answer) === 'employed' || strtolower($answer) === 'yes')) {
                    $isEmployed = true;
                    $employedCount++;
                }
            }
            
            if (strpos($questionText, 'place of work') !== false) {
                if (is_string($answer)) {
                    $workLocation = strtolower(trim($answer));
                }
            }
            
            if (strpos($questionText, 'job related to') !== false || strpos($questionText, 'related to your course') !== false) {
                $jobRelated = strtolower(trim($answer));
            }
        }
        
        if ($isEmployed) {
            if (strpos($workLocation, 'abroad') !== false || strpos($workLocation, 'overseas') !== false) {
                $employedAbroadCount++;
            } else {
                $employedLocalCount++;
            }
        }
        
        if ($isEmployed && (strpos($jobRelated, 'yes') !== false || strpos($jobRelated, 'directly related') !== false)) {
            $alignedCount++;
        }
    }

    $overview = [
        "total_graduates" => (int)$totalResponses,
        "total_employed" => (int)$employedCount,
        "total_employed_local" => (int)$employedLocalCount,
        "total_employed_abroad" => (int)$employedAbroadCount,
        "total_aligned" => (int)$alignedCount,
        "total_survey_responses" => (int)$totalResponses,
        "employment_rate" => $totalResponses > 0 ? round(($employedCount / $totalResponses) * 100, 1) : 0,
        "alignment_rate" => $employedCount > 0 ? round(($alignedCount / $employedCount) * 100, 1) : 0
    ];

    // Prepare data for AI analysis
    $dataContext = json_encode($overview);
    
    // Get GROQ API key from environment
    $groqApiKey = getenv('GROQ_API_KEY') ?: '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';
    
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
    
    $prompt = "Analyze this graduate employment data and provide a comprehensive, insightful narrative summary in 3-4 paragraphs. Focus on key trends, patterns, and actionable insights. Data: {$dataContext}. Write in a professional, analytical tone suitable for educational administrators.";
    
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
    
    echo json_encode([
        "success" => true,
        "data" => [
            "overview" => $overview,
            "ai_analysis" => $aiAnalysis
        ]
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "error" => $e->getMessage()
    ]);
}
