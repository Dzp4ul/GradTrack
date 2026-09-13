<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/admin_auth.php';
require_once __DIR__ . '/../config/survey_response_analytics.php';
require_once __DIR__ . '/../config/graduation_years.php';

$database = new Database();
$db = $database->getConnection();
$authUser = gradtrack_require_admin_auth($db, ['admin'], 'Only Admin accounts can access predictive analytics');

try {
    $surveyStmt = $db->query(
        "SELECT id
         FROM surveys
         WHERE status = 'active'
           AND archived_at IS NULL
         ORDER BY created_at DESC, id DESC
         LIMIT 1"
    );
    $surveyId = (int)($surveyStmt->fetchColumn() ?: 0);
    if ($surveyId <= 0) {
        throw new Exception('No active survey is available for prediction.');
    }

    $coverage = gradtrack_get_survey_graduation_year_coverage($db, $surveyId);
    if (!$coverage['configured']) {
        http_response_code(422);
        echo json_encode([
            'success' => false,
            'code' => 'GRADUATION_YEAR_COVERAGE_NOT_CONFIGURED',
            'error' => 'Graduation year coverage has not been configured for the active survey.',
        ]);
        exit;
    }

    // Historical inputs use the same valid-graduate population and response
    // classifiers as the Dashboard and Reports endpoints.
    $analytics = gradtrack_analytics_calculate($db, $surveyId, [
        'allowed_graduation_years' => $coverage['years'],
    ]);
    $yearData = [];
    foreach ($analytics['by_year'] as $year) {
        if ($year['employment_rate'] === null || $year['alignment_rate'] === null) {
            continue;
        }
        $yearData[] = [
            'year' => (int)$year['year'],
            'total_graduates' => (int)$year['response_count'],
            'employed' => (int)$year['employed'],
            'employment_total' => (int)$year['employment_total'],
            'employment_rate' => (float)$year['employment_rate'],
            'aligned' => (int)$year['aligned'],
            'not_aligned' => (int)$year['not_aligned'],
            'alignment_total' => (int)$year['alignment_total'],
            'alignment_rate' => (float)$year['alignment_rate'],
        ];
    }
    
    // Need at least 2 data points for regression
    if (count($yearData) < 2) {
        throw new Exception('Insufficient historical data for prediction. Need at least 2 years of data.');
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
        
        // Calculate R-squared and standard error
        $meanY = $sumY / $n;
        $meanX = $sumX / $n;
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
        
        // Calculate standard error of estimate
        $standardError = $n > 2 ? sqrt($ssResidual / ($n - 2)) : 0;
        
        // Calculate sum of squared deviations for X (needed for prediction interval)
        $sumXDevSquared = 0;
        foreach ($data as $i => $point) {
            $sumXDevSquared += pow($i - $meanX, 2);
        }
        
        return [
            'slope' => $m,
            'intercept' => $b,
            'r_squared' => $rSquared,
            'standard_error' => $standardError,
            'mean_x' => $meanX,
            'sum_x_dev_squared' => $sumXDevSquared,
            'n' => $n
        ];
    }
    
    // Perform regression analysis
    $employmentRegression = linearRegression($yearData, 'employment_rate');
    $alignmentRegression = linearRegression($yearData, 'alignment_rate');
    
    // Generate predictions for next 3 years
    $lastYear = end($yearData)['year'];
    $lastIndex = count($yearData) - 1;
    $predictions = [];
    
    // t-value for 95% confidence interval
    $n = $employmentRegression['n'];
    $tValue = $n <= 30 ? 2.0 : 1.96;
    
    for ($i = 1; $i <= 3; $i++) {
        $futureYear = $lastYear + $i;
        $futureIndex = $lastIndex + $i;
        
        $predictedEmployment = $employmentRegression['slope'] * $futureIndex + $employmentRegression['intercept'];
        $predictedAlignment = $alignmentRegression['slope'] * $futureIndex + $alignmentRegression['intercept'];
        
        // Calculate prediction interval (increases with distance from mean)
        $distanceFromMean = $futureIndex - $employmentRegression['mean_x'];
        $predictionVariance = 1 + (1 / $n) + (pow($distanceFromMean, 2) / $employmentRegression['sum_x_dev_squared']);
        $predictionStdError = $employmentRegression['standard_error'] * sqrt($predictionVariance);
        $marginOfError = $tValue * $predictionStdError;
        
        // Cap margin of error at reasonable maximum (50% for small samples)
        // This prevents unrealistic margins when data is limited
        $maxMargin = $n < 5 ? 50 : 30;
        $marginOfError = min($marginOfError, $maxMargin);
        
        // Clamp values between 0 and 100
        $predictedEmployment = max(0, min(100, $predictedEmployment));
        $predictedAlignment = max(0, min(100, $predictedAlignment));
        
        $predictions[] = [
            'year' => $futureYear,
            'predicted_employment_rate' => round($predictedEmployment, 2),
            'predicted_alignment_rate' => round($predictedAlignment, 2),
            'margin_of_error' => round($marginOfError, 2)
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
    $groqApiKey = getenv('GROQ_API_KEY');
    
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
        "error" => gradtrack_public_exception_message($e, 'Unable to generate predictive analytics right now.', 'Predictive analytics API')
    ]);
}
