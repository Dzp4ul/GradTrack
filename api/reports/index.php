<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();

try {
    $reportType = isset($_GET['type']) ? $_GET['type'] : 'overview';

    switch ($reportType) {
        case 'overview':
            // Get survey responses count
            $stmt = $db->query("SELECT COUNT(*) as total FROM survey_responses");
            $totalResponses = $stmt->fetch(PDO::FETCH_ASSOC)['total'];
            
            // Get active survey questions to map responses
            $stmt = $db->query("SELECT q.id, q.question_text FROM surveys s JOIN survey_questions q ON s.id = q.survey_id WHERE s.status = 'active' ORDER BY q.sort_order");
            $questions = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $questionMap = [];
            foreach ($questions as $q) {
                $questionMap[$q['id']] = strtolower($q['question_text']);
            }
            
            // Parse survey responses
            $stmt = $db->query("SELECT responses FROM survey_responses");
            $surveyResponses = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $employedCount = 0;
            $alignedCount = 0;
            
            foreach ($surveyResponses as $response) {
                $data = json_decode($response['responses'], true);
                if (!is_array($data)) continue;
                
                $isEmployed = false;
                $jobRelated = '';
                
                foreach ($data as $questionId => $answer) {
                    $questionText = isset($questionMap[$questionId]) ? $questionMap[$questionId] : '';
                    
                    // Check for employment status
                    if (strpos($questionText, 'employment status') !== false || strpos($questionText, 'presently employed') !== false) {
                        if (is_string($answer) && (strtolower($answer) === 'employed' || strtolower($answer) === 'yes')) {
                            $isEmployed = true;
                            $employedCount++;
                        }
                    }
                    
                    // Check job alignment from survey
                    if (strpos($questionText, 'job related to') !== false || strpos($questionText, 'related to your course') !== false) {
                        $jobRelated = strtolower(trim($answer));
                    }
                }
                
                // Count as aligned if job is directly related
                if ($isEmployed && (strpos($jobRelated, 'yes') !== false || strpos($jobRelated, 'directly related') !== false)) {
                    $alignedCount++;
                }
            }

            $aligned = $alignedCount;

            echo json_encode(["success" => true, "data" => [
                "total_graduates" => (int)$totalResponses,
                "total_employed" => (int)$employedCount,
                "total_aligned" => (int)$aligned,
                "total_survey_responses" => (int)$totalResponses,
                "employment_rate" => $totalResponses > 0 ? round(($employedCount / $totalResponses) * 100, 1) : 0,
                "alignment_rate" => $employedCount > 0 ? round(($aligned / $employedCount) * 100, 1) : 0
            ]]);
            break;

        case 'by_program':
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

            // Get survey responses and parse by program
            $stmt = $db->query("SELECT q.id, q.question_text FROM surveys s JOIN survey_questions q ON s.id = q.survey_id WHERE s.status = 'active' ORDER BY q.sort_order");
            $questions = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $questionMap = [];
            foreach ($questions as $q) {
                $questionMap[$q['id']] = strtolower($q['question_text']);
            }
            
            $stmt = $db->query("SELECT responses FROM survey_responses");
            $surveyResponses = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $programData = [];
            
            foreach ($surveyResponses as $response) {
                $data = json_decode($response['responses'], true);
                if (!is_array($data)) continue;
                
                $degreeProgram = '';
                $isEmployed = false;
                $jobRelated = '';
                
                foreach ($data as $questionId => $answer) {
                    $questionText = isset($questionMap[$questionId]) ? $questionMap[$questionId] : '';
                    
                    // Find degree program
                    if (strpos($questionText, 'degree program') !== false) {
                        if (is_string($answer) && !empty($answer)) {
                            $degreeProgram = $answer;
                        }
                    }
                    
                    // Check employment
                    if (strpos($questionText, 'employment status') !== false || strpos($questionText, 'presently employed') !== false) {
                        if (is_string($answer) && (strtolower($answer) === 'employed' || strtolower($answer) === 'yes')) {
                            $isEmployed = true;
                        }
                    }
                    
                    // Check job alignment
                    if (strpos($questionText, 'job related to') !== false || strpos($questionText, 'related to your course') !== false) {
                        $jobRelated = strtolower(trim($answer));
                    }
                }
                
                if (!empty($degreeProgram)) {
                    $code = getProgramCode($degreeProgram);
                    
                    if (!isset($programData[$code])) {
                        $programData[$code] = [
                            'code' => $code,
                            'name' => $degreeProgram,
                            'total_graduates' => 0,
                            'employed' => 0,
                            'aligned' => 0,
                            'partially_aligned' => 0,
                            'not_aligned' => 0,
                            'avg_time_to_employment' => null,
                            'avg_salary' => null
                        ];
                    }
                    
                    $programData[$code]['total_graduates']++;
                    if ($isEmployed) {
                        $programData[$code]['employed']++;
                        
                        // Calculate alignment from survey response
                        if (strpos($jobRelated, 'yes') !== false || strpos($jobRelated, 'directly related') !== false) {
                            $programData[$code]['aligned']++;
                        } else if (strpos($jobRelated, 'partially') !== false) {
                            $programData[$code]['partially_aligned']++;
                        } else if (!empty($jobRelated)) {
                            $programData[$code]['not_aligned']++;
                        }
                    }
                }
            }
            
            echo json_encode(["success" => true, "data" => array_values($programData)]);
            break;

        case 'by_year':
            // Get survey responses and parse by year
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
                    
                    // Find year graduated
                    if (strpos($questionText, 'year graduated') !== false) {
                        if (is_string($answer) && !empty($answer)) {
                            $yearGraduated = $answer;
                        }
                    }
                    
                    // Check employment
                    if (strpos($questionText, 'employment status') !== false || strpos($questionText, 'presently employed') !== false) {
                        if (is_string($answer) && (strtolower($answer) === 'employed' || strtolower($answer) === 'yes')) {
                            $isEmployed = true;
                        }
                    }
                    
                    // Check job alignment
                    if (strpos($questionText, 'job related to') !== false || strpos($questionText, 'related to your course') !== false) {
                        $jobRelated = strtolower(trim($answer));
                    }
                }
                
                if (!empty($yearGraduated)) {
                    if (!isset($yearData[$yearGraduated])) {
                        $yearData[$yearGraduated] = [
                            'year_graduated' => (int)$yearGraduated,
                            'total_graduates' => 0,
                            'employed' => 0,
                            'aligned' => 0,
                            'avg_salary' => null
                        ];
                    }
                    
                    $yearData[$yearGraduated]['total_graduates']++;
                    if ($isEmployed) {
                        $yearData[$yearGraduated]['employed']++;
                        
                        // Calculate alignment from survey
                        if (strpos($jobRelated, 'yes') !== false || strpos($jobRelated, 'directly related') !== false) {
                            $yearData[$yearGraduated]['aligned']++;
                        }
                    }
                }
            }
            
            // Sort by year descending
            krsort($yearData);
            
            echo json_encode(["success" => true, "data" => array_values($yearData)]);
            break;

        case 'employment_status':
            // Get survey responses and count employment status
            $stmt = $db->query("SELECT q.id, q.question_text FROM surveys s JOIN survey_questions q ON s.id = q.survey_id WHERE s.status = 'active' ORDER BY q.sort_order");
            $questions = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $questionMap = [];
            foreach ($questions as $q) {
                $questionMap[$q['id']] = strtolower($q['question_text']);
            }
            
            $stmt = $db->query("SELECT responses FROM survey_responses");
            $surveyResponses = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            $statusCount = ['employed' => 0, 'unemployed' => 0];
            
            foreach ($surveyResponses as $response) {
                $data = json_decode($response['responses'], true);
                if (!is_array($data)) continue;
                
                foreach ($data as $questionId => $answer) {
                    $questionText = isset($questionMap[$questionId]) ? $questionMap[$questionId] : '';
                    
                    if (strpos($questionText, 'employment status') !== false || strpos($questionText, 'presently employed') !== false) {
                        if (is_string($answer)) {
                            $answerLower = strtolower($answer);
                            if ($answerLower === 'employed' || $answerLower === 'yes') {
                                $statusCount['employed']++;
                            } else if ($answerLower === 'unemployed' || $answerLower === 'no') {
                                $statusCount['unemployed']++;
                            }
                        }
                    }
                }
            }
            
            $data = [
                ['employment_status' => 'employed', 'count' => $statusCount['employed']],
                ['employment_status' => 'unemployed', 'count' => $statusCount['unemployed']]
            ];
            
            echo json_encode(["success" => true, "data" => $data]);
            break;

        case 'salary_distribution':
            // For now, return sample data as salary info needs to be added to survey
            $data = [
                ['salary_range' => 'Below 15K', 'count' => 2],
                ['salary_range' => '15K-20K', 'count' => 5],
                ['salary_range' => '20K-30K', 'count' => 8],
                ['salary_range' => '30K-50K', 'count' => 4],
                ['salary_range' => 'Above 50K', 'count' => 1]
            ];
            echo json_encode(["success" => true, "data" => $data]);
            break;

        default:
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Invalid report type"]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
