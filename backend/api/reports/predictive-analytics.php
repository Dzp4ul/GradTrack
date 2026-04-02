<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();

try {
    // Get historical data by year
    $stmt = $db->query("SELECT q.id, q.question_text FROM surveys s JOIN survey_questions q ON s.id = q.survey_id WHERE s.status = 'active' ORDER BY q.sort_order");
    $questions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $questionMap = [];
    foreach ($questions as $q) {
        $questionMap[$q['id']] = strtolower($q['question_text']);
    }
    
    $stmt = $db->query("SELECT responses FROM survey_responses");
    $surveyResponses = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $yearData = [];
    
    foreach ($surveyResponses as $response) {
        $data = json_decode($response['responses'], true);
        if (!is_array($data)) continue;
        
        $yearGraduated = '';
        $isEmployed = false;
        $jobRelated = '';
        
        foreach ($data as $questionId => $answer) {
            $questionText = isset($questionMap[$questionId]) ? $questionMap[$questionId] : '';
            
            if (strpos($questionText, 'year graduated') !== false) {
                if (is_string($answer) && !empty($answer)) {
                    $yearGraduated = $answer;
                }
            }
            
            if (strpos($questionText, 'employment status') !== false || strpos($questionText, 'presently employed') !== false) {
                if (is_string($answer) && (strtolower($answer) === 'employed' || strtolower($answer) === 'yes')) {
                    $isEmployed = true;
                }
            }
            
            if (strpos($questionText, 'job related to') !== false || strpos($questionText, 'related to your course') !== false) {
                $jobRelated = strtolower(trim($answer));
            }
        }
        
        if (!empty($yearGraduated)) {
            if (!isset($yearData[$yearGraduated])) {
                $yearData[$yearGraduated] = [
                    'year' => (int)$yearGraduated,
                    'total_graduates' => 0,
                    'employed' => 0,
                    'aligned' => 0
                ];
            }
            
            $yearData[$yearGraduated]['total_graduates']++;
            if ($isEmployed) {
                $yearData[$yearGraduated]['employed']++;
                
                if (strpos($jobRelated, 'yes') !== false || strpos($jobRelated, 'directly related') !== false) {
                    $yearData[$yearGraduated]['aligned']++;
                }
            }
        }
    }
    
    // Sort by year
    ksort($yearData);
    $yearData = array_values($yearData);
    
    // Need at least 2 data points for regression
    if (count($yearData) < 2) {
        throw new Exception('Insufficient historical data for prediction. Need at least 2 years of data.');
    }
    
    // Calculate employment rates
    foreach ($yearData as &$year) {
        $year['employment_rate'] = $year['total_graduates'] > 0 
            ? round(($year['employed'] / $year['total_graduates']) * 100, 2) 
            : 0;
        $year['alignment_rate'] = $year['employed'] > 0 
            ? round(($year['aligned'] / $year['employed']) * 100, 2) 
            : 0;
    }
    
    // Linear Regression for Employment Rate
    function linearRegression($data, $metric) {
        $n = count($data);
        $sumX = 0;
        $sumY = 0;
        $sumXY = 0;
        $sumX2 = 0;
        
        foreach ($data as $i => $point) {
            $x = $i; // Use index as x (time series)
            $y = $point[$metric];
            $sumX += $x;
            $sumY += $y;
            $sumXY += $x * $y;
            $sumX2 += $x * $x;
        }
        
        // Calculate slope (m) and intercept (b)
        $m = ($n * $sumXY - $sumX * $sumY) / ($n * $sumX2 - $sumX * $sumX);
        $b = ($sumY - $m * $sumX) / $n;
        
        // Calculate R-squared
        $meanY = $sumY / $n;
        $ssTotal = 0;
        $ssResidual = 0;
        
        foreach ($data as $i => $point) {
            $x = $i;
            $y = $point[$metric];
            $predicted = $m * $x + $b;
            $ssTotal += pow($y - $meanY, 2);
            $ssResidual += pow($y - $predicted, 2);
        }
        
        $rSquared = $ssTotal > 0 ? 1 - ($ssResidual / $ssTotal) : 0;
        
        return [
            'slope' => $m,
            'intercept' => $b,
            'r_squared' => $rSquared
        ];
    }
    
    // Perform regression analysis
    $employmentRegression = linearRegression($yearData, 'employment_rate');
    $alignmentRegression = linearRegression($yearData, 'alignment_rate');
    
    // Generate predictions for next 3 years
    $lastYear = end($yearData)['year'];
    $predictions = [];
    
    for ($i = 1; $i <= 3; $i++) {
        $futureYear = $lastYear + $i;
        $futureIndex = count($yearData) + $i - 1;
        
        $predictedEmployment = $employmentRegression['slope'] * $futureIndex + $employmentRegression['intercept'];
        $predictedAlignment = $alignmentRegression['slope'] * $futureIndex + $alignmentRegression['intercept'];
        
        // Clamp values between 0 and 100
        $predictedEmployment = max(0, min(100, $predictedEmployment));
        $predictedAlignment = max(0, min(100, $predictedAlignment));
        
        $predictions[] = [
            'year' => $futureYear,
            'predicted_employment_rate' => round($predictedEmployment, 2),
            'predicted_alignment_rate' => round($predictedAlignment, 2),
            'confidence' => round($employmentRegression['r_squared'] * 100, 2)
        ];
    }
    
    // Prepare data for AI analysis
    $analysisData = [
        'historical_data' => $yearData,
        'employment_regression' => [
            'slope' => round($employmentRegression['slope'], 4),
            'r_squared' => round($employmentRegression['r_squared'], 4),
            'trend' => $employmentRegression['slope'] > 0 ? 'increasing' : ($employmentRegression['slope'] < 0 ? 'decreasing' : 'stable')
        ],
        'alignment_regression' => [
            'slope' => round($alignmentRegression['slope'], 4),
            'r_squared' => round($alignmentRegression['r_squared'], 4),
            'trend' => $alignmentRegression['slope'] > 0 ? 'increasing' : ($alignmentRegression['slope'] < 0 ? 'decreasing' : 'stable')
        ],
        'predictions' => $predictions
    ];
    
    $dataContext = json_encode($analysisData);
    
    // Get GROQ API key
    $groqApiKey = getenv('GROQ_API_KEY') ?: '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';
    
    if (empty($groqApiKey)) {
        // Return predictions without AI analysis
        echo json_encode([
            "success" => true,
            "data" => [
                "historical_data" => $yearData,
                "predictions" => $predictions,
                "regression_analysis" => [
                    'employment' => $employmentRegression,
                    'alignment' => $alignmentRegression
                ],
                "ai_analysis" => "AI analysis unavailable. Configure GROQ_API_KEY for AI-powered insights."
            ]
        ]);
        exit;
    }

    // Call Groq API for predictive insights
    $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $groqApiKey
    ]);
    
    $prompt = "Analyze this predictive analytics data for graduate employment. The data includes historical trends and linear regression predictions for the next 3 years. Provide insights about: 1) Historical trends and patterns, 2) Prediction reliability (R-squared values), 3) Future outlook, 4) Actionable recommendations. Data: {$dataContext}. Write 3-4 paragraphs in a professional, analytical tone.";
    
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
        'model' => 'llama-3.3-70b-versatile',
        'messages' => [
            ['role' => 'system', 'content' => 'You are an expert data scientist specializing in predictive analytics and educational outcomes forecasting.'],
            ['role' => 'user', 'content' => $prompt]
        ],
        'temperature' => 0.7,
        'max_tokens' => 900
    ]));
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    $aiAnalysis = "Predictive analysis available. Configure GROQ_API_KEY for AI-powered insights.";
    
    if ($httpCode === 200) {
        $result = json_decode($response, true);
        $aiAnalysis = $result['choices'][0]['message']['content'] ?? $aiAnalysis;
    }
    
    echo json_encode([
        "success" => true,
        "data" => [
            "historical_data" => $yearData,
            "predictions" => $predictions,
            "regression_analysis" => [
                'employment' => [
                    'slope' => round($employmentRegression['slope'], 4),
                    'intercept' => round($employmentRegression['intercept'], 4),
                    'r_squared' => round($employmentRegression['r_squared'], 4),
                    'trend' => $employmentRegression['slope'] > 0 ? 'increasing' : ($employmentRegression['slope'] < 0 ? 'decreasing' : 'stable')
                ],
                'alignment' => [
                    'slope' => round($alignmentRegression['slope'], 4),
                    'intercept' => round($alignmentRegression['intercept'], 4),
                    'r_squared' => round($alignmentRegression['r_squared'], 4),
                    'trend' => $alignmentRegression['slope'] > 0 ? 'increasing' : ($alignmentRegression['slope'] < 0 ? 'decreasing' : 'stable')
                ]
            ],
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
