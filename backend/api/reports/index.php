<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/audit_trail.php';

$database = new Database();
$db = $database->getConnection();
$auditUser = gradtrack_audit_current_admin_context();

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

function answerIndicatesWorkLocation(string $answerText): bool
{
    return $answerText === 'local'
        || $answerText === 'abroad'
        || strpos($answerText, 'abroad') !== false
        || strpos($answerText, 'overseas') !== false;
}

function answerIndicatesAlignment(string $answerText): bool
{
    if ($answerText === '') {
        return false;
    }

    return $answerText === 'yes'
        || $answerText === 'no'
        || strpos($answerText, 'directly related') !== false
        || strpos($answerText, 'partially related') !== false
        || strpos($answerText, 'not related') !== false;
}

function getNeighborAnswerText(array $data, $questionId, int $offset = -1): string
{
    if (!is_numeric($questionId)) {
        return '';
    }

    $neighborKey = (string)(((int)$questionId) + $offset);
    if (!array_key_exists($neighborKey, $data)) {
        return '';
    }

    return answerToText($data[$neighborKey]);
}

function mapSalaryAnswerToRange(string $answerText): ?string
{
    $normalized = strtolower(trim($answerText));
    if ($normalized === '' || $normalized === 'n/a' || $normalized === 'na') {
        return null;
    }

    $normalized = str_replace(['php', 'p', '₱', ',', '.00'], ['', '', '', '', ''], $normalized);
    $normalized = preg_replace('/\s+/', ' ', $normalized ?? '');

    if (strpos($normalized, 'below') !== false && strpos($normalized, '5000') !== false) {
        return 'Below ₱5,000';
    }
    if (strpos($normalized, '25000') !== false && strpos($normalized, 'above') !== false) {
        return '₱25,000 and above';
    }
    if (strpos($normalized, '20000') !== false && strpos($normalized, '25000') !== false) {
        return '₱20,000 - ₱25,000';
    }
    if (strpos($normalized, '15000') !== false && strpos($normalized, '20000') !== false) {
        return '₱15,000 - ₱20,000';
    }
    if (strpos($normalized, '10000') !== false && strpos($normalized, '15000') !== false) {
        return '₱10,000 - ₱15,000';
    }
    if (strpos($normalized, '5000') !== false && strpos($normalized, '10000') !== false) {
        return '₱5,000 - ₱10,000';
    }

    return null;
}

function getProgramDisplayNameByCode(string $programCode): string
{
    $map = [
        'BSCS' => 'Bachelor of Science in Computer Science',
        'ACT' => 'Associate in Computer Technology',
        'BSED' => 'Bachelor of Secondary Education',
        'BEED' => 'Bachelor of Elementary Education',
        'BSHM' => 'Bachelor of Science in Hospitality Management',
    ];

    return $map[$programCode] ?? $programCode;
}

function isYearLikeAnswer(string $value): bool
{
    $trimmed = trim($value);
    return preg_match('/^(19|20)\d{2}$/', $trimmed) === 1;
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

function getSurveyResponses(PDO $db, ?int $surveyId): array
{
    if ($surveyId === null) {
        return [];
    }

    $stmt = $db->prepare("
        SELECT sr.responses, g.year_graduated, p.code AS program_code, p.name AS program_name
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

try {
    $reportType = isset($_GET['type']) ? $_GET['type'] : 'overview';
    $filterYear = isset($_GET['year']) && $_GET['year'] !== 'all' ? $_GET['year'] : null;
    $filterDepartment = isset($_GET['department']) && $_GET['department'] !== 'all'
        ? strtoupper(trim((string)$_GET['department']))
        : null;
    $selectedSurveyId = getSelectedSurveyId($db);

    $role = $_SESSION['role'] ?? '';
    $roleProgramScopes = [
        'dean_cs' => ['BSCS', 'ACT'],
        'dean_coed' => ['BSED', 'BEED'],
        'dean_hm' => ['BSHM'],
    ];
    $allowedProgramCodes = $roleProgramScopes[$role] ?? null;

    if ($filterDepartment !== null && is_array($allowedProgramCodes) && !in_array($filterDepartment, $allowedProgramCodes, true)) {
        http_response_code(403);
        echo json_encode(["success" => false, "error" => "Unauthorized department filter"]);
        exit;
    }

    $auditAction = strtolower(trim((string)($_GET['audit_action'] ?? 'generate')));
    $reportAuditAction = strpos($auditAction, 'export') !== false ? 'Export' : 'Generate';
    $reportAuditVerbPast = $reportAuditAction === 'Export' ? 'Exported' : 'Generated';
    $auditDepartment = $filterDepartment ?? $auditUser['department'];

    // Audit Trail: call logAuditTrail() when report data is generated or requested for export.
    logAuditTrail(
        $auditUser['user_id'],
        $auditUser['user_name'],
        $auditUser['user_role'],
        $auditDepartment,
        $reportAuditAction,
        'Reports',
        "{$reportAuditVerbPast} {$reportType} report data" .
            ($selectedSurveyId !== null ? " for survey ID {$selectedSurveyId}" : '') .
            ($filterYear !== null ? " filtered by year {$filterYear}" : '') .
            ($filterDepartment !== null ? " filtered by department {$filterDepartment}" : '') .
            '.'
    );

    switch ($reportType) {
        case 'overview':
            // Get survey responses count
            $totalResponses = getSurveyResponseCount($db, $selectedSurveyId);
            
            // Get the selected survey questions to map responses
            $questionMap = getQuestionMap($db, $selectedSurveyId);
            
            // Parse survey responses with canonical graduate year/program context
            $surveyResponses = getSurveyResponses($db, $selectedSurveyId);
            
            $employedCount = 0;
            $unemployedCount = 0;
            $employedLocalCount = 0;
            $employedAbroadCount = 0;
            $alignedCount = 0;
            
            foreach ($surveyResponses as $response) {
                $rowProgramCode = strtoupper((string)($response['program_code'] ?? ''));
                if ($filterDepartment !== null && $rowProgramCode !== $filterDepartment) {
                    continue;
                }
                if (is_array($allowedProgramCodes) && ($rowProgramCode === '' || !in_array($rowProgramCode, $allowedProgramCodes, true))) {
                    continue;
                }

                $data = json_decode($response['responses'], true);
                if (!is_array($data)) continue;
                
                $isEmployed = false;
                $isUnemployed = false;
                $jobRelated = '';
                $workLocation = '';
                
                foreach ($data as $questionId => $answer) {
                    $questionText = isset($questionMap[$questionId]) ? $questionMap[$questionId] : '';
                    
                    // Check for employment status
                    if (strpos($questionText, 'employment status') !== false || strpos($questionText, 'presently employed') !== false) {
                        $employmentAnswer = parseEmploymentAnswer($answer);
                        if ($employmentAnswer !== null) {
                            if ($employmentAnswer) {
                                $isEmployed = true;
                            } else {
                                $isUnemployed = true;
                            }
                        }
                    }
                    
                    // Check place of work
                    if (strpos($questionText, 'place of work') !== false || strpos($questionText, 'major line of business') !== false) {
                        $candidateLocation = answerToText($answer);
                        if (!answerIndicatesWorkLocation($candidateLocation) && strpos($questionText, 'place of work') !== false) {
                            $candidateLocation = getNeighborAnswerText($data, $questionId, -1);
                        }

                        if (answerIndicatesWorkLocation($candidateLocation)) {
                            $workLocation = $candidateLocation;
                        }
                    }
                    
                    // Check job alignment from survey
                    if (
                        strpos($questionText, 'job related to') !== false
                        || strpos($questionText, 'related to your course') !== false
                        || strpos($questionText, 'reason(s) for staying on the job') !== false
                    ) {
                        $candidateRelated = answerToText($answer);
                        if (!answerIndicatesAlignment($candidateRelated) && strpos($questionText, 'job related to') !== false) {
                            $candidateRelated = getNeighborAnswerText($data, $questionId, -1);
                        }

                        if (answerIndicatesAlignment($candidateRelated)) {
                            $jobRelated = $candidateRelated;
                        }
                    }
                }

                if ($isEmployed) {
                    $employedCount++;
                } elseif ($isUnemployed) {
                    $unemployedCount++;
                }
                
                // Count local vs abroad employment
                if ($isEmployed) {
                    if (strpos($workLocation, 'abroad') !== false || strpos($workLocation, 'overseas') !== false) {
                        $employedAbroadCount++;
                    } else {
                        $employedLocalCount++;
                    }
                }
                
                // Count as aligned if job is directly related
                if ($isEmployed && (strpos($jobRelated, 'yes') !== false || strpos($jobRelated, 'directly related') !== false)) {
                    $alignedCount++;
                }
            }

            $aligned = $alignedCount;

            echo json_encode(["success" => true, "data" => [
                "survey_id" => $selectedSurveyId,
                "total_graduates" => (int)$totalResponses,
                "total_employed" => (int)$employedCount,
                "total_unemployed" => (int)$unemployedCount,
                "total_employment_known" => (int)($employedCount + $unemployedCount),
                "total_employed_local" => (int)$employedLocalCount,
                "total_employed_abroad" => (int)$employedAbroadCount,
                "total_aligned" => (int)$aligned,
                "total_survey_responses" => (int)$totalResponses,
                "employment_rate" => ($employedCount + $unemployedCount) > 0 ? round(($employedCount / ($employedCount + $unemployedCount)) * 100, 1) : 0,
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
            $questionMap = getQuestionMap($db, $selectedSurveyId);
            
            $surveyResponses = getSurveyResponses($db, $selectedSurveyId);
            
            $programData = [];
            
            foreach ($surveyResponses as $response) {
                $rowProgramCode = strtoupper((string)($response['program_code'] ?? ''));
                if ($filterDepartment !== null && $rowProgramCode !== $filterDepartment) {
                    continue;
                }
                if (is_array($allowedProgramCodes) && ($rowProgramCode === '' || !in_array($rowProgramCode, $allowedProgramCodes, true))) {
                    continue;
                }

                $data = json_decode($response['responses'], true);
                if (!is_array($data)) continue;
                
                $degreeProgram = trim((string)($response['program_name'] ?? ''));
                $yearGraduated = isset($response['year_graduated']) && $response['year_graduated'] !== null
                    ? (string)$response['year_graduated']
                    : '';
                $isEmployed = false;
                $jobRelated = '';
                
                foreach ($data as $questionId => $answer) {
                    $questionText = isset($questionMap[$questionId]) ? $questionMap[$questionId] : '';
                    
                    // Find degree program
                    if (strpos($questionText, 'degree program') !== false) {
                        if (is_string($answer) && !empty($answer)) {
                            $candidateProgram = trim($answer);
                            if ($candidateProgram !== '' && !isYearLikeAnswer($candidateProgram)) {
                                $degreeProgram = $candidateProgram;
                            }
                        }
                    }
                    
                    // Find year graduated
                    if (strpos($questionText, 'year graduated') !== false) {
                        if (is_string($answer) && !empty($answer)) {
                            $yearGraduated = $answer;
                        }
                    }
                    
                    // Check employment
                    if (strpos($questionText, 'employment status') !== false || strpos($questionText, 'presently employed') !== false) {
                        $employmentAnswer = parseEmploymentAnswer($answer);
                        if ($employmentAnswer === true) {
                            $isEmployed = true;
                        }
                    }
                    
                    // Check job alignment
                    if (
                        strpos($questionText, 'job related to') !== false
                        || strpos($questionText, 'related to your course') !== false
                        || strpos($questionText, 'reason(s) for staying on the job') !== false
                    ) {
                        $candidateRelated = answerToText($answer);
                        if (!answerIndicatesAlignment($candidateRelated) && strpos($questionText, 'job related to') !== false) {
                            $candidateRelated = getNeighborAnswerText($data, $questionId, -1);
                        }

                        if (answerIndicatesAlignment($candidateRelated)) {
                            $jobRelated = $candidateRelated;
                        }
                    }
                }
                
                // Apply year filter if specified
                if ($filterYear !== null && $yearGraduated !== $filterYear) {
                    continue;
                }
                
                $code = !empty($rowProgramCode) ? $rowProgramCode : (!empty($degreeProgram) ? getProgramCode($degreeProgram) : '');
                if (!empty($code)) {
                    $programName = !empty($degreeProgram) && !isYearLikeAnswer($degreeProgram)
                        ? $degreeProgram
                        : getProgramDisplayNameByCode($code);
                    
                    if (!isset($programData[$code])) {
                        $programData[$code] = [
                            'code' => $code,
                            'name' => $programName,
                            'total_graduates' => 0,
                            'employed' => 0,
                            'aligned' => 0,
                            'partially_aligned' => 0,
                            'not_aligned' => 0,
                            'avg_time_to_employment' => null,
                            'avg_salary' => null
                        ];
                    } elseif (isYearLikeAnswer((string)$programData[$code]['name'])) {
                        $programData[$code]['name'] = $programName;
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
            $questionMap = getQuestionMap($db, $selectedSurveyId);
            
            $surveyResponses = getSurveyResponses($db, $selectedSurveyId);
            
            $yearData = [];
            
            foreach ($surveyResponses as $response) {
                $rowProgramCode = strtoupper((string)($response['program_code'] ?? ''));
                if ($filterDepartment !== null && $rowProgramCode !== $filterDepartment) {
                    continue;
                }
                if (is_array($allowedProgramCodes) && ($rowProgramCode === '' || !in_array($rowProgramCode, $allowedProgramCodes, true))) {
                    continue;
                }

                $data = json_decode($response['responses'], true);
                if (!is_array($data)) continue;
                
                $yearGraduated = isset($response['year_graduated']) && $response['year_graduated'] !== null
                    ? (string)$response['year_graduated']
                    : '';
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
                        $employmentAnswer = parseEmploymentAnswer($answer);
                        if ($employmentAnswer === true) {
                            $isEmployed = true;
                        }
                    }
                    
                    // Check job alignment
                    if (
                        strpos($questionText, 'job related to') !== false
                        || strpos($questionText, 'related to your course') !== false
                        || strpos($questionText, 'reason(s) for staying on the job') !== false
                    ) {
                        $candidateRelated = answerToText($answer);
                        if (!answerIndicatesAlignment($candidateRelated) && strpos($questionText, 'job related to') !== false) {
                            $candidateRelated = getNeighborAnswerText($data, $questionId, -1);
                        }

                        if (answerIndicatesAlignment($candidateRelated)) {
                            $jobRelated = $candidateRelated;
                        }
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
            // Get survey responses and count employment status with location
            $questionMap = getQuestionMap($db, $selectedSurveyId);
            
            $surveyResponses = getSurveyResponses($db, $selectedSurveyId);
            
            $statusCount = [
                'employed_local' => 0,
                'employed_abroad' => 0,
                'unemployed' => 0
            ];
            
            foreach ($surveyResponses as $response) {
                $rowProgramCode = strtoupper((string)($response['program_code'] ?? ''));
                if ($filterDepartment !== null && $rowProgramCode !== $filterDepartment) {
                    continue;
                }
                if (is_array($allowedProgramCodes) && ($rowProgramCode === '' || !in_array($rowProgramCode, $allowedProgramCodes, true))) {
                    continue;
                }

                $data = json_decode($response['responses'], true);
                if (!is_array($data)) continue;
                
                $isEmployed = false;
                $isUnemployed = false;
                $workLocation = '';
                $yearGraduated = isset($response['year_graduated']) && $response['year_graduated'] !== null
                    ? (string)$response['year_graduated']
                    : '';
                
                foreach ($data as $questionId => $answer) {
                    $questionText = isset($questionMap[$questionId]) ? $questionMap[$questionId] : '';
                    
                    // Find year graduated
                    if (strpos($questionText, 'year graduated') !== false) {
                        if (is_string($answer) && !empty($answer)) {
                            $yearGraduated = $answer;
                        }
                    }
                    
                    // Check employment status
                    if (strpos($questionText, 'employment status') !== false || strpos($questionText, 'presently employed') !== false) {
                        $employmentAnswer = parseEmploymentAnswer($answer);
                        if ($employmentAnswer !== null) {
                            if ($employmentAnswer) {
                                $isEmployed = true;
                            } else {
                                $isUnemployed = true;
                            }
                        }
                    }
                    
                    // Check place of work
                    if (strpos($questionText, 'place of work') !== false || strpos($questionText, 'major line of business') !== false) {
                        $candidateLocation = answerToText($answer);
                        if (!answerIndicatesWorkLocation($candidateLocation) && strpos($questionText, 'place of work') !== false) {
                            $candidateLocation = getNeighborAnswerText($data, $questionId, -1);
                        }

                        if (answerIndicatesWorkLocation($candidateLocation)) {
                            $workLocation = $candidateLocation;
                        }
                    }
                }
                
                // Apply year filter if specified
                if ($filterYear !== null && $yearGraduated !== $filterYear) {
                    continue;
                }
                
                // Categorize employed by location
                if ($isEmployed) {
                    if (strpos($workLocation, 'abroad') !== false || strpos($workLocation, 'overseas') !== false) {
                        $statusCount['employed_abroad']++;
                    } else if (strpos($workLocation, 'local') !== false || !empty($workLocation)) {
                        $statusCount['employed_local']++;
                    } else {
                        // Default to local if no location specified
                        $statusCount['employed_local']++;
                    }
                } elseif ($isUnemployed) {
                    $statusCount['unemployed']++;
                }
            }
            
            $data = [
                ['employment_status' => 'Employed (Local)', 'count' => $statusCount['employed_local']],
                ['employment_status' => 'Employed (Abroad)', 'count' => $statusCount['employed_abroad']],
                ['employment_status' => 'Unemployed', 'count' => $statusCount['unemployed']]
            ];
            
            echo json_encode(["success" => true, "data" => $data]);
            break;

        case 'salary_distribution':
            // Get survey responses and parse salary data
            $questionMap = getQuestionMap($db, $selectedSurveyId);
            
            $surveyResponses = getSurveyResponses($db, $selectedSurveyId);
            
            // Initialize salary ranges
            $salaryRanges = [
                'Below ₱5,000' => 0,
                '₱5,000 - ₱10,000' => 0,
                '₱10,000 - ₱15,000' => 0,
                '₱15,000 - ₱20,000' => 0,
                '₱20,000 - ₱25,000' => 0,
                '₱25,000 and above' => 0
            ];
            
            foreach ($surveyResponses as $response) {
                $rowProgramCode = strtoupper((string)($response['program_code'] ?? ''));
                if ($filterDepartment !== null && $rowProgramCode !== $filterDepartment) {
                    continue;
                }
                if (is_array($allowedProgramCodes) && ($rowProgramCode === '' || !in_array($rowProgramCode, $allowedProgramCodes, true))) {
                    continue;
                }

                $data = json_decode($response['responses'], true);
                if (!is_array($data)) continue;
                
                $yearGraduated = isset($response['year_graduated']) && $response['year_graduated'] !== null
                    ? (string)$response['year_graduated']
                    : '';
                $salaryRange = null;
                
                foreach ($data as $questionId => $answer) {
                    $questionText = isset($questionMap[$questionId]) ? $questionMap[$questionId] : '';
                    
                    // Find year graduated
                    if (strpos($questionText, 'year graduated') !== false) {
                        if (is_string($answer) && !empty($answer)) {
                            $yearGraduated = $answer;
                        }
                    }
                    
                    // Check for salary question
                    if (
                        strpos($questionText, 'gross monthly earning') !== false
                        || strpos($questionText, 'initial gross monthly') !== false
                        || strpos($questionText, 'job level position') !== false
                    ) {
                        $candidateRange = mapSalaryAnswerToRange(answerToText($answer));

                        if ($candidateRange === null && strpos($questionText, 'gross monthly earning') !== false) {
                            $candidateRange = mapSalaryAnswerToRange(getNeighborAnswerText($data, $questionId, -1));
                        }

                        if ($candidateRange !== null) {
                            $salaryRange = $candidateRange;
                        }
                    }
                }
                
                // Apply year filter if specified
                if ($filterYear !== null && $yearGraduated !== $filterYear) {
                    continue;
                }
                
                if ($salaryRange !== null && isset($salaryRanges[$salaryRange])) {
                    $salaryRanges[$salaryRange]++;
                }
            }
            
            // Convert to array format
            $data = [];
            foreach ($salaryRanges as $range => $count) {
                $data[] = ['salary_range' => $range, 'count' => $count];
            }
            
            echo json_encode(["success" => true, "data" => $data]);
            break;

        default:
            http_response_code(400);
            echo json_encode(["success" => false, "error" => "Invalid report type"]);
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
