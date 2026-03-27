<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method !== 'GET') {
        http_response_code(405);
        echo json_encode(["success" => false, "error" => "Method not allowed"]);
        exit;
    }

    $surveyId = $_GET['survey_id'] ?? null;

    if (!$surveyId) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "survey_id is required"]);
        exit;
    }

    // Get survey details
    $stmt = $db->prepare("SELECT * FROM surveys WHERE id = :id");
    $stmt->bindParam(':id', $surveyId);
    $stmt->execute();
    $survey = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$survey) {
        http_response_code(404);
        echo json_encode(["success" => false, "error" => "Survey not found"]);
        exit;
    }

    // Get total responses
    $stmt = $db->prepare("SELECT COUNT(*) as total FROM survey_responses WHERE survey_id = :id");
    $stmt->bindParam(':id', $surveyId);
    $stmt->execute();
    $totalResponses = (int)$stmt->fetch(PDO::FETCH_ASSOC)['total'];

    // Get all responses
    $stmt = $db->prepare("SELECT responses FROM survey_responses WHERE survey_id = :id");
    $stmt->bindParam(':id', $surveyId);
    $stmt->execute();
    $responses = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Get questions
    $stmt = $db->prepare("SELECT * FROM survey_questions WHERE survey_id = :id ORDER BY sort_order ASC");
    $stmt->bindParam(':id', $surveyId);
    $stmt->execute();
    $questions = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Analyze responses
    $analytics = [
        'survey_id' => $surveyId,
        'survey_title' => $survey['title'],
        'total_responses' => $totalResponses,
        'response_rate' => calculateResponseRate($db, $surveyId),
        'completion_rate' => 100, // Assuming all submitted responses are complete
        'questions_analytics' => []
    ];

    // Analyze each question
    foreach ($questions as $question) {
        $questionId = (string)$question['id'];
        $questionAnalytics = [
            'question_id' => $question['id'],
            'question_text' => $question['question_text'],
            'question_type' => $question['question_type'],
            'total_answers' => 0,
            'data' => []
        ];

        $answers = [];
        foreach ($responses as $response) {
            $responseData = json_decode($response['responses'], true);
            if (isset($responseData[$questionId])) {
                $answers[] = $responseData[$questionId];
            }
        }

        $questionAnalytics['total_answers'] = count($answers);

        // Analyze based on question type
        switch ($question['question_type']) {
            case 'multiple_choice':
            case 'rating':
                $questionAnalytics['data'] = analyzeMultipleChoice($answers);
                break;
            case 'checkbox':
                $questionAnalytics['data'] = analyzeCheckbox($answers);
                break;
            case 'text':
                $questionAnalytics['data'] = analyzeText($answers);
                break;
        }

        $analytics['questions_analytics'][] = $questionAnalytics;
    }

    // Employment-specific analytics
    $employmentAnalytics = analyzeEmploymentData($responses, $questions);
    if ($employmentAnalytics) {
        $analytics['employment_insights'] = $employmentAnalytics;
    }

    echo json_encode(["success" => true, "data" => $analytics]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}

function calculateResponseRate($db, $surveyId) {
    // Get total graduates
    $stmt = $db->query("SELECT COUNT(*) as total FROM graduates WHERE status = 'active'");
    $totalGraduates = (int)$stmt->fetch(PDO::FETCH_ASSOC)['total'];
    
    // Get total responses
    $stmt = $db->prepare("SELECT COUNT(*) as total FROM survey_responses WHERE survey_id = :id");
    $stmt->bindParam(':id', $surveyId);
    $stmt->execute();
    $totalResponses = (int)$stmt->fetch(PDO::FETCH_ASSOC)['total'];
    
    if ($totalGraduates === 0) return 0;
    return round(($totalResponses / $totalGraduates) * 100, 2);
}

function analyzeMultipleChoice($answers) {
    $distribution = [];
    $total = count($answers);
    
    foreach ($answers as $answer) {
        if (!isset($distribution[$answer])) {
            $distribution[$answer] = 0;
        }
        $distribution[$answer]++;
    }
    
    $result = [];
    foreach ($distribution as $option => $count) {
        $result[] = [
            'option' => $option,
            'count' => $count,
            'percentage' => $total > 0 ? round(($count / $total) * 100, 2) : 0
        ];
    }
    
    return $result;
}

function analyzeCheckbox($answers) {
    $distribution = [];
    $total = count($answers);
    
    foreach ($answers as $answer) {
        // Checkbox answers can be arrays or comma-separated strings
        $options = is_array($answer) ? $answer : explode(',', $answer);
        foreach ($options as $option) {
            $option = trim($option);
            if (!isset($distribution[$option])) {
                $distribution[$option] = 0;
            }
            $distribution[$option]++;
        }
    }
    
    $result = [];
    foreach ($distribution as $option => $count) {
        $result[] = [
            'option' => $option,
            'count' => $count,
            'percentage' => $total > 0 ? round(($count / $total) * 100, 2) : 0
        ];
    }
    
    return $result;
}

function analyzeText($answers) {
    // For text responses, return sample responses and word count
    $nonEmpty = array_filter($answers, function($a) { return !empty(trim($a)); });
    
    return [
        'total_responses' => count($nonEmpty),
        'sample_responses' => array_slice($nonEmpty, 0, 5),
        'avg_length' => count($nonEmpty) > 0 ? round(array_sum(array_map('strlen', $nonEmpty)) / count($nonEmpty), 2) : 0
    ];
}

function analyzeEmploymentData($responses, $questions) {
    // Find employment-related questions
    $employmentQuestionId = null;
    $alignmentQuestionId = null;
    $salaryQuestionId = null;
    $timeToJobQuestionId = null;
    
    foreach ($questions as $q) {
        $text = strtolower($q['question_text']);
        if (strpos($text, 'presently employed') !== false || strpos($text, 'employment status') !== false) {
            $employmentQuestionId = (string)$q['id'];
        }
        if (strpos($text, 'related to your course') !== false || strpos($text, 'job related') !== false) {
            $alignmentQuestionId = (string)$q['id'];
        }
        if (strpos($text, 'salary') !== false) {
            $salaryQuestionId = (string)$q['id'];
        }
        if (strpos($text, 'how long') !== false && strpos($text, 'job') !== false) {
            $timeToJobQuestionId = (string)$q['id'];
        }
    }
    
    if (!$employmentQuestionId) return null;
    
    $employed = 0;
    $unemployed = 0;
    $aligned = 0;
    $partiallyAligned = 0;
    $notAligned = 0;
    $salaryDistribution = [];
    $timeToJobDistribution = [];
    
    foreach ($responses as $response) {
        $data = json_decode($response['responses'], true);
        
        // Employment status
        if (isset($data[$employmentQuestionId])) {
            $status = strtolower($data[$employmentQuestionId]);
            if (strpos($status, 'yes') !== false || strpos($status, 'employed') !== false) {
                $employed++;
            } else {
                $unemployed++;
            }
        }
        
        // Alignment
        if ($alignmentQuestionId && isset($data[$alignmentQuestionId])) {
            $alignment = strtolower($data[$alignmentQuestionId]);
            if (strpos($alignment, 'directly') !== false || strpos($alignment, 'yes') !== false) {
                $aligned++;
            } elseif (strpos($alignment, 'partially') !== false) {
                $partiallyAligned++;
            } else {
                $notAligned++;
            }
        }
        
        // Salary
        if ($salaryQuestionId && isset($data[$salaryQuestionId])) {
            $salary = $data[$salaryQuestionId];
            if (!isset($salaryDistribution[$salary])) {
                $salaryDistribution[$salary] = 0;
            }
            $salaryDistribution[$salary]++;
        }
        
        // Time to job
        if ($timeToJobQuestionId && isset($data[$timeToJobQuestionId])) {
            $time = $data[$timeToJobQuestionId];
            if (!isset($timeToJobDistribution[$time])) {
                $timeToJobDistribution[$time] = 0;
            }
            $timeToJobDistribution[$time]++;
        }
    }
    
    $total = $employed + $unemployed;
    $totalAlignment = $aligned + $partiallyAligned + $notAligned;
    
    return [
        'employment_rate' => $total > 0 ? round(($employed / $total) * 100, 2) : 0,
        'employed_count' => $employed,
        'unemployed_count' => $unemployed,
        'alignment_rate' => $totalAlignment > 0 ? round(($aligned / $totalAlignment) * 100, 2) : 0,
        'aligned_count' => $aligned,
        'partially_aligned_count' => $partiallyAligned,
        'not_aligned_count' => $notAligned,
        'salary_distribution' => $salaryDistribution,
        'time_to_job_distribution' => $timeToJobDistribution
    ];
}
