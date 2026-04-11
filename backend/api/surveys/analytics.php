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
    $questionResponseKeys = buildQuestionResponseKeys($questions, $responses);

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
        $responseKeys = $questionResponseKeys[(string)$question['id']] ?? [(string)$question['id']];
        foreach ($responses as $response) {
            $responseData = json_decode($response['responses'], true);
            if (!is_array($responseData)) {
                continue;
            }

            foreach ($responseKeys as $responseKey) {
                if (array_key_exists($responseKey, $responseData)) {
                    $answers[] = $responseData[$responseKey];
                    break;
                }
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
    $employmentAnalytics = analyzeEmploymentData($responses, $questions, $questionResponseKeys);
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

function collectResponseQuestionKeys($responses) {
    $keys = [];

    foreach ($responses as $response) {
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

function buildQuestionResponseKeys($questions, $responses) {
    $map = [];
    foreach ($questions as $question) {
        $questionId = (string)$question['id'];
        $map[$questionId] = [$questionId];
    }

    $responseKeys = collectResponseQuestionKeys($responses);
    if (empty($questions) || empty($responseKeys)) {
        return $map;
    }

    usort($questions, function ($a, $b) {
        return ((int)$a['sort_order']) <=> ((int)$b['sort_order']);
    });

    $firstResponseKey = min($responseKeys);
    $firstQuestion = $questions[0];
    $firstQuestionId = (int)$firstQuestion['id'];
    $firstSortOrder = (int)$firstQuestion['sort_order'];
    $idOffset = $firstQuestionId - $firstResponseKey;

    foreach ($questions as $question) {
        $questionId = (string)$question['id'];
        $historicalKeys = [
            $firstResponseKey + ((int)$question['sort_order'] - $firstSortOrder),
            (int)$question['id'] - $idOffset,
        ];

        foreach ($historicalKeys as $historicalKey) {
            $historicalKey = (string)$historicalKey;
            if ((int)$historicalKey > 0 && !in_array($historicalKey, $map[$questionId], true)) {
                $map[$questionId][] = $historicalKey;
            }
        }
    }

    return $map;
}

function getAnswerFromKeys($data, $keys) {
    foreach ($keys as $key) {
        if (array_key_exists($key, $data)) {
            return $data[$key];
        }
    }

    return null;
}

function answerToText($answer) {
    if (is_array($answer)) {
        return strtolower(trim(implode(' ', array_map(function ($value) {
            return is_scalar($value) ? (string)$value : '';
        }, $answer))));
    }

    return strtolower(trim((string)$answer));
}

function parseEmploymentAnswer($answer) {
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

function analyzeEmploymentData($responses, $questions, $questionResponseKeys) {
    // Find employment-related questions
    $employmentQuestionId = null;
    $alignmentQuestionId = null;
    $salaryQuestionId = null;
    $timeToJobQuestionId = null;
    $employmentPriority = -1;
    $alignmentPriority = -1;
    $salaryPriority = -1;
    $timeToJobPriority = -1;
    
    foreach ($questions as $q) {
        $text = strtolower(trim($q['question_text']));

        // Prefer direct employment-status questions over fields that merely mention employment.
        $currentEmploymentPriority = -1;
        if (strpos($text, 'are you presently employed') !== false) {
            $currentEmploymentPriority = 100;
        } elseif (strpos($text, 'present employment status') !== false) {
            $currentEmploymentPriority = 90;
        } elseif (strpos($text, 'employment status') !== false) {
            $currentEmploymentPriority = 80;
        } elseif (strpos($text, 'presently employed') !== false) {
            $currentEmploymentPriority = 10;
        }
        if ($currentEmploymentPriority > $employmentPriority) {
            $employmentPriority = $currentEmploymentPriority;
            $employmentQuestionId = (string)$q['id'];
        }

        $currentAlignmentPriority = -1;
        if (strpos($text, 'is your first job related') !== false) {
            $currentAlignmentPriority = 100;
        } elseif (strpos($text, 'job related to') !== false || strpos($text, 'related to your course') !== false) {
            $currentAlignmentPriority = 90;
        } elseif (strpos($text, 'curriculum relevant') !== false) {
            $currentAlignmentPriority = 50;
        }
        if ($currentAlignmentPriority > $alignmentPriority) {
            $alignmentPriority = $currentAlignmentPriority;
            $alignmentQuestionId = (string)$q['id'];
        }

        $currentSalaryPriority = -1;
        if (strpos($text, 'initial gross monthly') !== false || strpos($text, 'gross monthly earning') !== false) {
            $currentSalaryPriority = 100;
        } elseif (strpos($text, 'salary') !== false) {
            $currentSalaryPriority = 80;
        }
        if ($currentSalaryPriority > $salaryPriority) {
            $salaryPriority = $currentSalaryPriority;
            $salaryQuestionId = (string)$q['id'];
        }

        $currentTimeToJobPriority = -1;
        if (strpos($text, 'how long did it take') !== false && strpos($text, 'first job') !== false) {
            $currentTimeToJobPriority = 100;
        } elseif (strpos($text, 'how long') !== false && strpos($text, 'job') !== false) {
            $currentTimeToJobPriority = 80;
        }
        if ($currentTimeToJobPriority > $timeToJobPriority) {
            $timeToJobPriority = $currentTimeToJobPriority;
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
        if (!is_array($data)) {
            continue;
        }
        
        // Employment status
        $employmentAnswer = getAnswerFromKeys($data, $questionResponseKeys[$employmentQuestionId] ?? [$employmentQuestionId]);
        if ($employmentAnswer !== null) {
            $employmentStatus = parseEmploymentAnswer($employmentAnswer);

            if ($employmentStatus === true) {
                $employed++;
            } elseif ($employmentStatus === false) {
                $unemployed++;
            }
        }
        
        // Alignment
        if ($alignmentQuestionId) {
            $alignmentAnswer = getAnswerFromKeys($data, $questionResponseKeys[$alignmentQuestionId] ?? [$alignmentQuestionId]);
            $alignment = strtolower(trim((string)$alignmentAnswer));
            if ($alignment !== '') {
                if (strpos($alignment, 'directly') !== false || strpos($alignment, 'yes') !== false) {
                    $aligned++;
                } elseif (strpos($alignment, 'partially') !== false) {
                    $partiallyAligned++;
                } else {
                    $notAligned++;
                }
            }
        }
        
        // Salary
        if ($salaryQuestionId) {
            $salary = getAnswerFromKeys($data, $questionResponseKeys[$salaryQuestionId] ?? [$salaryQuestionId]);
            if ($salary !== null && $salary !== '') {
                if (!isset($salaryDistribution[$salary])) {
                    $salaryDistribution[$salary] = 0;
                }
                $salaryDistribution[$salary]++;
            }
        }
        
        // Time to job
        if ($timeToJobQuestionId) {
            $time = getAnswerFromKeys($data, $questionResponseKeys[$timeToJobQuestionId] ?? [$timeToJobQuestionId]);
            if ($time !== null && $time !== '') {
                if (!isset($timeToJobDistribution[$time])) {
                    $timeToJobDistribution[$time] = 0;
                }
                $timeToJobDistribution[$time]++;
            }
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
