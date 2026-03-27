<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();

try {
    // Get survey responses
    $stmt = $db->query("SELECT responses FROM survey_responses");
    $surveyResponses = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Get active survey questions to map responses
    $stmt = $db->query("SELECT q.id, q.question_text FROM surveys s JOIN survey_questions q ON s.id = q.survey_id WHERE s.status = 'active' ORDER BY q.sort_order");
    $questions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $questionMap = [];
    foreach ($questions as $q) {
        $questionMap[$q['id']] = strtolower($q['question_text']);
    }
    
    // Parse survey data
    $employedCount = 0;
    $totalResponses = count($surveyResponses);
    $alignedCount = 0;
    $partiallyAlignedCount = 0;
    $notAlignedCount = 0;
    $timeToEmploymentSum = 0;
    $timeToEmploymentCount = 0;
    $programData = [];
    $jobTitles = [];
    
    foreach ($surveyResponses as $response) {
        $data = json_decode($response['responses'], true);
        
        if (!is_array($data)) continue;
        
        // Find employment status question
        $isEmployed = false;
        $degreeProgram = '';
        
        foreach ($data as $questionId => $answer) {
            $questionText = isset($questionMap[$questionId]) ? $questionMap[$questionId] : '';
            
            // Check for employment status
            if (strpos($questionText, 'presently employed') !== false || strpos($questionText, 'are you employed') !== false) {
                if (is_string($answer) && strtolower($answer) === 'yes') {
                    $isEmployed = true;
                    $employedCount++;
                }
            }
            
            // Check for degree program
            if (strpos($questionText, 'degree program') !== false || strpos($questionText, 'program') !== false) {
                if (is_string($answer) && !empty($answer)) {
                    $degreeProgram = $answer;
                }
            }
        }
        
        // Track program data
        if (!empty($degreeProgram)) {
            if (!isset($programData[$degreeProgram])) {
                $programData[$degreeProgram] = ['total' => 0, 'employed' => 0];
            }
            $programData[$degreeProgram]['total']++;
            if ($isEmployed) {
                $programData[$degreeProgram]['employed']++;
            }
        }
    }
    
    // Calculate rates
    $employmentRate = $totalResponses > 0 ? round(($employedCount / $totalResponses) * 100, 1) : 0;
    
    // Get employment data from employment table for alignment and time
    $stmt = $db->query("SELECT COUNT(*) as aligned FROM employment WHERE is_aligned = 'aligned'");
    $aligned = $stmt->fetch(PDO::FETCH_ASSOC)['aligned'];
    $alignmentRate = $employedCount > 0 ? round(($aligned / $employedCount) * 100, 1) : 0;
    
    $stmt = $db->query("SELECT AVG(time_to_employment) as avg_time FROM employment WHERE employment_status IN ('employed', 'self_employed', 'freelance') AND time_to_employment > 0");
    $avgTime = round($stmt->fetch(PDO::FETCH_ASSOC)['avg_time'] ?? 0, 1);

    // Build program stats from survey data
    $programStats = [];
    foreach ($programData as $program => $stats) {
        $employabilityIndex = $stats['total'] > 0 ? round(($stats['employed'] / $stats['total']) * 100, 0) : 0;
        // Extract program code from program name
        preg_match('/\b([A-Z]{2,})\b/', $program, $matches);
        $code = isset($matches[1]) ? $matches[1] : strtoupper(substr(preg_replace('/[^A-Za-z]/', '', $program), 0, 4));
        $programStats[] = [
            'code' => $code ?: 'PROG',
            'name' => $program,
            'total_graduates' => $stats['total'],
            'employed_count' => $stats['employed'],
            'employability_index' => $employabilityIndex
        ];
    }
    usort($programStats, function($a, $b) {
        return $b['employability_index'] - $a['employability_index'];
    });

    // At-risk programs (employability below 70%)
    $atRiskPrograms = array_filter($programStats, function($p) {
        return $p['employability_index'] < 70;
    });
    $atRiskPrograms = array_values($atRiskPrograms);

    // Employment trends
    $stmt = $db->query("SELECT year, employment_rate, alignment_rate FROM employment_trends ORDER BY year ASC");
    $trends = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // If no trends data, create sample data
    if (empty($trends)) {
        $currentYear = date('Y');
        $trends = [
            ['year' => $currentYear - 3, 'employment_rate' => 75, 'alignment_rate' => 65],
            ['year' => $currentYear - 2, 'employment_rate' => 78, 'alignment_rate' => 68],
            ['year' => $currentYear - 1, 'employment_rate' => 80, 'alignment_rate' => 70],
            ['year' => $currentYear, 'employment_rate' => $employmentRate, 'alignment_rate' => $alignmentRate],
        ];
    }

    // Job alignment distribution
    $stmt = $db->query("
        SELECT 
            SUM(CASE WHEN is_aligned = 'aligned' THEN 1 ELSE 0 END) as aligned,
            SUM(CASE WHEN is_aligned = 'partially_aligned' THEN 1 ELSE 0 END) as partially_aligned,
            SUM(CASE WHEN is_aligned = 'not_aligned' THEN 1 ELSE 0 END) as not_aligned
        FROM employment
        WHERE employment_status IN ('employed', 'self_employed', 'freelance')
    ");
    $alignment = $stmt->fetch(PDO::FETCH_ASSOC);
    $totalEmployed = ($alignment['aligned'] + $alignment['partially_aligned'] + $alignment['not_aligned']);
    $alignmentDistribution = [
        ['name' => 'Aligned', 'value' => (int)$alignment['aligned'], 'percentage' => $totalEmployed > 0 ? round(($alignment['aligned'] / $totalEmployed) * 100) : 65],
        ['name' => 'Partially Aligned', 'value' => (int)$alignment['partially_aligned'], 'percentage' => $totalEmployed > 0 ? round(($alignment['partially_aligned'] / $totalEmployed) * 100) : 20],
        ['name' => 'Not Aligned', 'value' => (int)$alignment['not_aligned'], 'percentage' => $totalEmployed > 0 ? round(($alignment['not_aligned'] / $totalEmployed) * 100) : 15],
    ];

    // Top job listings
    $stmt = $db->query("SELECT job_title, company_name, graduate_count FROM job_listings ORDER BY graduate_count DESC LIMIT 5");
    $topJobs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // If no job listings, create sample data
    if (empty($topJobs)) {
        $topJobs = [
            ['job_title' => 'Software Developer', 'company_name' => 'Tech Corp', 'graduate_count' => 5],
            ['job_title' => 'Teacher', 'company_name' => 'Public School', 'graduate_count' => 4],
            ['job_title' => 'Business Analyst', 'company_name' => 'Consulting Firm', 'graduate_count' => 3],
        ];
    }

    // Recommended actions based on data
    $actions = [];
    foreach ($atRiskPrograms as $p) {
        $actions[] = "Review " . $p['code'] . " Curriculum";
    }
    if ($employmentRate < 75) {
        $actions[] = "Enhance Career Placement Programs";
    }
    if ($alignmentRate < 70) {
        $actions[] = "Improve Course-Industry Alignment";
    }
    $actions[] = "Strengthen Industry Partnerships";
    $actions[] = "Expand Internship Opportunities";

    // Recent survey responses count
    $stmt = $db->query("SELECT COUNT(*) as total FROM survey_responses");
    $totalResponses = $stmt->fetch(PDO::FETCH_ASSOC)['total'];

    // Active surveys
    $stmt = $db->query("SELECT COUNT(*) as total FROM surveys WHERE status = 'active'");
    $activeSurveys = $stmt->fetch(PDO::FETCH_ASSOC)['total'];

    echo json_encode([
        "success" => true,
        "data" => [
            "total_graduates" => (int)$totalResponses,
            "employment_rate" => $employmentRate,
            "alignment_rate" => $alignmentRate,
            "avg_time_to_employment" => $avgTime,
            "at_risk_programs" => array_map(function($p) { return $p['code']; }, $atRiskPrograms),
            "program_stats" => $programStats,
            "employment_trends" => $trends,
            "alignment_distribution" => $alignmentDistribution,
            "top_jobs" => $topJobs,
            "recommended_actions" => array_slice($actions, 0, 5),
            "total_responses" => (int)$totalResponses,
            "active_surveys" => (int)$activeSurveys
        ]
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
