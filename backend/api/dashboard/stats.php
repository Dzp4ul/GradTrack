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

function getQuestionMap(PDO $db, ?int $surveyId): array
{
    if ($surveyId === null) {
        return [];
    }

    $stmt = $db->prepare("
        SELECT id, question_text, sort_order
        FROM survey_questions
        WHERE survey_id = :survey_id
        ORDER BY sort_order
    ");
    $stmt->bindValue(':survey_id', $surveyId, PDO::PARAM_INT);
    $stmt->execute();

    $questionMap = [];
    $questions = $stmt->fetchAll(PDO::FETCH_ASSOC);
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

    return $questionMap;
}

function getSurveyResponses(PDO $db, ?int $surveyId): array
{
    if ($surveyId === null) {
        return [];
    }

    $stmt = $db->prepare("
        SELECT sr.responses, g.year_graduated, p.code AS graduate_program_code, p.name AS graduate_program_name
        FROM survey_responses sr
        LEFT JOIN graduates g ON g.id = sr.graduate_id
        LEFT JOIN programs p ON p.id = g.program_id
        WHERE sr.survey_id = :survey_id
    ");
    $stmt->bindValue(':survey_id', $surveyId, PDO::PARAM_INT);
    $stmt->execute();

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function getSurveyResponseCount(PDO $db, ?int $surveyId): int
{
    if ($surveyId === null) {
        return 0;
    }

    $stmt = $db->prepare("SELECT COUNT(*) as total FROM survey_responses WHERE survey_id = :survey_id");
    $stmt->bindValue(':survey_id', $surveyId, PDO::PARAM_INT);
    $stmt->execute();

    return (int)$stmt->fetch(PDO::FETCH_ASSOC)['total'];
}

function getSurveyTitle(PDO $db, ?int $surveyId): string
{
    if ($surveyId === null) {
        return '';
    }

    $stmt = $db->prepare("SELECT title FROM surveys WHERE id = :survey_id LIMIT 1");
    $stmt->bindValue(':survey_id', $surveyId, PDO::PARAM_INT);
    $stmt->execute();

    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ? (string)$row['title'] : '';
}

function getTotalEligibleGraduates(PDO $db): int
{
    $stmt = $db->query("SELECT COUNT(*) as total FROM graduates WHERE status = 'active' OR status IS NULL");
    return (int)$stmt->fetch(PDO::FETCH_ASSOC)['total'];
}

try {
    $selectedSurveyId = getSelectedSurveyId($db);

    if ($selectedSurveyId === null) {
        $stmt = $db->query("SELECT COUNT(*) as total FROM surveys WHERE status = 'active'");
        $activeSurveys = (int)$stmt->fetch(PDO::FETCH_ASSOC)['total'];
        $totalEligibleGraduates = getTotalEligibleGraduates($db);

        echo json_encode([
            "success" => true,
            "data" => [
                "total_graduates" => 0,
                "employment_rate" => 0,
                "alignment_rate" => 0,
                "avg_time_to_employment" => 0,
                "selected_survey_id" => null,
                "at_risk_programs" => [],
                "program_stats" => [],
                "employment_trends" => [],
                "alignment_distribution" => [],
                "top_jobs" => [],
                "recommended_actions" => [],
                "total_responses" => 0,
                "active_surveys" => $activeSurveys,
                "selected_survey_title" => "",
                "total_eligible_graduates" => $totalEligibleGraduates,
                "pending_responses" => $totalEligibleGraduates,
                "survey_completion_rate" => 0
            ]
        ]);
        exit;
    }

    // Get selected survey responses with canonical graduate program/year context
    $surveyResponses = getSurveyResponses($db, $selectedSurveyId);

    // Get selected survey questions to map responses, including historical IDs from saved responses
    $questionMap = getQuestionMap($db, $selectedSurveyId);
    
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
                $employmentAnswer = parseEmploymentAnswer($answer);
                if ($employmentAnswer !== null) {
                    if ($employmentAnswer) {
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
                $jobRelated = answerToText($answer);
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

    // Responses for the selected dashboard survey
    $totalResponses = getSurveyResponseCount($db, $selectedSurveyId);

    // Survey coverage and active job-post metrics
    $selectedSurveyTitle = getSurveyTitle($db, $selectedSurveyId);
    $totalEligibleGraduates = getTotalEligibleGraduates($db);
    $pendingResponses = max($totalEligibleGraduates - $totalResponses, 0);
    $surveyCompletionRate = $totalEligibleGraduates > 0
        ? round(($totalResponses / $totalEligibleGraduates) * 100, 1)
        : 0;
    $topJobs = [];

    // Recommended actions based on data
    $actions = [];
    foreach ($atRiskPrograms as $p) {
        $actions[] = "Review " . $p['code'] . " outcomes with program faculty";
    }
    $weakestProgram = !empty($programStats) ? $programStats[count($programStats) - 1] : null;
    if ($weakestProgram && (float)$weakestProgram['employability_index'] < 80) {
        $actions[] = "Prioritize employer leads for " . $weakestProgram['code'];
    }
    if ($pendingResponses > 0 && $surveyCompletionRate < 85) {
        $actions[] = "Send reminders to " . $pendingResponses . " graduates without survey responses";
    }
    if ($employmentRate < 75) {
        $actions[] = "Enhance Career Placement Programs";
    }
    if ($alignmentRate < 70) {
        $actions[] = "Review course-to-career alignment with industry partners";
    }
    if (empty($actions)) {
        $actions[] = "Maintain monthly outcome review";
    }

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
            "selected_survey_id" => $selectedSurveyId,
            "at_risk_programs" => array_map(function($p) { return $p['code']; }, $atRiskPrograms),
            "program_stats" => $programStats,
            "employment_trends" => $trends,
            "alignment_distribution" => $alignmentDistribution,
            "top_jobs" => $topJobs,
            "recommended_actions" => array_slice($actions, 0, 5),
            "total_responses" => (int)$totalResponses,
            "active_surveys" => (int)$activeSurveys,
            "selected_survey_title" => $selectedSurveyTitle,
            "total_eligible_graduates" => $totalEligibleGraduates,
            "pending_responses" => $pendingResponses,
            "survey_completion_rate" => $surveyCompletionRate
        ]
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
