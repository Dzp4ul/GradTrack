<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();

try {
    // Get survey responses with canonical graduate program/year context
    $stmt = $db->query("\n        SELECT sr.responses, g.year_graduated, p.code AS graduate_program_code, p.name AS graduate_program_name\n        FROM survey_responses sr\n        LEFT JOIN graduates g ON g.id = sr.graduate_id\n        LEFT JOIN programs p ON p.id = g.program_id\n    ");
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
    $latestGraduationYear = 0;
    $yearlyStats = [];
    
    foreach ($surveyResponses as $response) {
        $data = json_decode($response['responses'], true);
        
        if (!is_array($data)) continue;
        
        // Find employment status and job alignment
        $isEmployed = false;
        $degreeProgramCode = '';
        $degreeProgramName = '';
        if (!empty($response['graduate_program_code'])) {
            $degreeProgramCode = strtoupper(trim((string)$response['graduate_program_code']));
            $degreeProgramName = (string)$response['graduate_program_name'];
        }

        $responseYear = isset($response['year_graduated']) ? (int)$response['year_graduated'] : 0;
        if ($responseYear > $latestGraduationYear) {
            $latestGraduationYear = $responseYear;
        }
        if ($responseYear > 0) {
            if (!isset($yearlyStats[$responseYear])) {
                $yearlyStats[$responseYear] = [
                    'total' => 0,
                    'employed' => 0,
                    'aligned' => 0,
                ];
            }
            $yearlyStats[$responseYear]['total']++;
        }

        $fallbackProgramAnswer = '';
        $jobRelated = '';
        
        foreach ($data as $questionId => $answer) {
            $questionText = isset($questionMap[$questionId]) ? $questionMap[$questionId] : '';
            
            // Check for employment status
            if (strpos($questionText, 'employment status') !== false || strpos($questionText, 'presently employed') !== false || strpos($questionText, 'are you employed') !== false) {
                if (is_string($answer)) {
                    $answerLower = strtolower(trim($answer));
                    $isUnemployed = (strpos($answerLower, 'unemployed') !== false) || ($answerLower === 'no');
                    if (!$isUnemployed && ($answerLower === 'yes' || $answerLower === 'employed' || strpos($answerLower, 'employed') !== false)) {
                        $isEmployed = true;
                    }
                }
            }
            
            // Check for degree program (fallback when graduate program relation is missing)
            if (strpos($questionText, 'degree program') !== false || strpos($questionText, 'program') !== false) {
                if (is_string($answer) && !empty($answer)) {
                    $fallbackProgramAnswer = trim($answer);
                }
            }
            
            // Check job alignment from survey
            if (strpos($questionText, 'job related to') !== false || strpos($questionText, 'related to your course') !== false) {
                $jobRelated = strtolower(trim($answer));
            }
        }

        if ($isEmployed) {
            $employedCount++;
            if ($responseYear > 0 && isset($yearlyStats[$responseYear])) {
                $yearlyStats[$responseYear]['employed']++;
            }
        }
        
        // Count alignment based on survey response
        if ($isEmployed) {
            if (strpos($jobRelated, 'yes') !== false || strpos($jobRelated, 'directly related') !== false) {
                $alignedCount++;
                if ($responseYear > 0 && isset($yearlyStats[$responseYear])) {
                    $yearlyStats[$responseYear]['aligned']++;
                }
            } else if (strpos($jobRelated, 'partially') !== false) {
                $partiallyAlignedCount++;
            } else if (!empty($jobRelated)) {
                $notAlignedCount++;
            }
        }
        
        // Resolve fallback program code/name from survey answer if canonical graduate program is not available
        if (empty($degreeProgramCode) && !empty($fallbackProgramAnswer)) {
            $degreeProgramCode = getProgramCode($fallbackProgramAnswer);
            $degreeProgramName = $fallbackProgramAnswer;
        }

        // Track program data
        if (!empty($degreeProgramCode)) {
            if (!isset($programData[$degreeProgramCode])) {
                $programData[$degreeProgramCode] = [
                    'code' => $degreeProgramCode,
                    'name' => $degreeProgramName ?: $degreeProgramCode,
                    'total' => 0,
                    'employed' => 0,
                    'aligned' => 0
                ];
            }
            if (empty($programData[$degreeProgramCode]['name']) || $programData[$degreeProgramCode]['name'] === $degreeProgramCode) {
                $programData[$degreeProgramCode]['name'] = $degreeProgramName ?: $degreeProgramCode;
            }

            $programData[$degreeProgramCode]['total']++;
            if ($isEmployed) {
                $programData[$degreeProgramCode]['employed']++;
                if (strpos($jobRelated, 'yes') !== false || strpos($jobRelated, 'directly related') !== false) {
                    $programData[$degreeProgramCode]['aligned']++;
                }
            }
        }
    }
    
    // Calculate rates
    $employmentRate = $totalResponses > 0 ? round(($employedCount / $totalResponses) * 100, 1) : 0;
    $alignmentRate = $employedCount > 0 ? round(($alignedCount / $employedCount) * 100, 1) : 0;
    
    $stmt = $db->query("SELECT AVG(time_to_employment) as avg_time FROM employment WHERE employment_status IN ('employed', 'self_employed', 'freelance') AND time_to_employment > 0");
    $avgTime = round($stmt->fetch(PDO::FETCH_ASSOC)['avg_time'] ?? 0, 1);

    // Map program names to codes
    function getProgramCode($programName) {
        $programLower = strtolower($programName);
        if (strpos($programLower, 'computer science') !== false) return 'BSCS';
        if (strpos($programLower, 'secondary education') !== false) return 'BSED';
        if (strpos($programLower, 'elementary education') !== false) return 'BEED';
        if (strpos($programLower, 'hospitality management') !== false) return 'BSHM';
        if (strpos($programLower, 'computer technology') !== false) return 'ACT';
        preg_match('/\b([A-Z]{3,})\b/', $programName, $matches);
        return isset($matches[1]) && strlen($matches[1]) > 3 ? $matches[1] : strtoupper(substr(preg_replace('/[^A-Za-z]/', '', $programName), 0, 4));
    }

    // Build program stats from survey data
    $programStats = [];
    foreach ($programData as $stats) {
        $employabilityIndex = $stats['total'] > 0 ? round(($stats['employed'] / $stats['total']) * 100, 1) : 0;
        $alignmentIndex = $stats['employed'] > 0 ? round(($stats['aligned'] / $stats['employed']) * 100, 1) : 0;
        $programStats[] = [
            'code' => $stats['code'] ?: 'PROG',
            'name' => $stats['name'] ?: ($stats['code'] ?: 'Program'),
            'total_graduates' => $stats['total'],
            'employed_count' => $stats['employed'],
            'aligned_count' => $stats['aligned'],
            'employability_index' => $employabilityIndex,
            'alignment_index' => $alignmentIndex
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

    // Employment trends - build a 5-year window ending at latest graduation year
    $stmt = $db->query("SELECT year, employment_rate, alignment_rate FROM employment_trends ORDER BY year ASC");
    $trendRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $trendDefaultsByYear = [];
    foreach ($trendRows as $row) {
        $year = (int)$row['year'];
        if ($year <= 0) {
            continue;
        }
        $trendDefaultsByYear[$year] = [
            'employment_rate' => (float)$row['employment_rate'],
            'alignment_rate' => (float)$row['alignment_rate'],
        ];
    }

    $trendYear = $latestGraduationYear > 0 ? $latestGraduationYear : (int)date('Y');
    $startYear = $trendYear - 4;
    $trends = [];

    for ($year = $startYear; $year <= $trendYear; $year++) {
        $total = isset($yearlyStats[$year]) ? (int)$yearlyStats[$year]['total'] : 0;
        $employed = isset($yearlyStats[$year]) ? (int)$yearlyStats[$year]['employed'] : 0;
        $aligned = isset($yearlyStats[$year]) ? (int)$yearlyStats[$year]['aligned'] : 0;

        if ($total > 0) {
            $yearEmploymentRate = round(($employed / $total) * 100, 1);
            $yearAlignmentRate = $employed > 0 ? round(($aligned / $employed) * 100, 1) : 0;
        } else if (isset($trendDefaultsByYear[$year])) {
            $yearEmploymentRate = $trendDefaultsByYear[$year]['employment_rate'];
            $yearAlignmentRate = $trendDefaultsByYear[$year]['alignment_rate'];
        } else {
            $yearEmploymentRate = 0;
            $yearAlignmentRate = 0;
        }

        $trends[] = [
            'year' => $year,
            'employment_rate' => $yearEmploymentRate,
            'alignment_rate' => $yearAlignmentRate,
        ];
    }

    // If no trends data, create sample data
    if (empty($trends)) {
        $trends = [
            ['year' => $trendYear - 3, 'employment_rate' => 75, 'alignment_rate' => 65],
            ['year' => $trendYear - 2, 'employment_rate' => 78, 'alignment_rate' => 68],
            ['year' => $trendYear - 1, 'employment_rate' => 80, 'alignment_rate' => 70],
            ['year' => $trendYear, 'employment_rate' => $employmentRate, 'alignment_rate' => $alignmentRate],
        ];
    }

    // Job alignment distribution from survey responses
    $totalEmployedForAlignment = $alignedCount + $partiallyAlignedCount + $notAlignedCount;
    $alignmentDistribution = [
        ['name' => 'Aligned', 'value' => $alignedCount, 'percentage' => $totalEmployedForAlignment > 0 ? round(($alignedCount / $totalEmployedForAlignment) * 100) : 0],
        ['name' => 'Partially Aligned', 'value' => $partiallyAlignedCount, 'percentage' => $totalEmployedForAlignment > 0 ? round(($partiallyAlignedCount / $totalEmployedForAlignment) * 100) : 0],
        ['name' => 'Not Aligned', 'value' => $notAlignedCount, 'percentage' => $totalEmployedForAlignment > 0 ? round(($notAlignedCount / $totalEmployedForAlignment) * 100) : 0],
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
