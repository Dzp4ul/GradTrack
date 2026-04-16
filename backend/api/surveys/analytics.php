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
    $stmt = $db->prepare("
        SELECT sr.responses, sr.graduate_id, g.year_graduated, p.code AS program_code, p.name AS program_name
        FROM survey_responses sr
        LEFT JOIN graduates g ON g.id = sr.graduate_id
        LEFT JOIN programs p ON p.id = g.program_id
        WHERE sr.survey_id = :id
    ");
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
        if (isDisplayOnlyQuestion($question)) {
            continue;
        }

        $questionId = (string)$question['id'];
        $questionAnalytics = [
            'question_id' => $question['id'],
            'question_text' => $question['question_text'],
            'question_type' => $question['question_type'],
            'section' => $question['section'] ?? '',
            'options' => decodeQuestionOptions($question['options'] ?? null),
            'total_answers' => 0,
            'skipped_answers' => 0,
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
                    if (hasAnswerValue($responseData[$responseKey])) {
                        $answers[] = $responseData[$responseKey];
                    }
                    break;
                }
            }
        }

        $questionAnalytics['total_answers'] = count($answers);
        $questionAnalytics['skipped_answers'] = max($totalResponses - count($answers), 0);

        // Analyze based on question type
        switch ($question['question_type']) {
            case 'multiple_choice':
            case 'radio':
            case 'rating':
                $questionAnalytics['data'] = analyzeMultipleChoice($answers, $questionAnalytics['options']);
                break;
            case 'checkbox':
                $questionAnalytics['data'] = analyzeCheckbox($answers, $questionAnalytics['options']);
                break;
            case 'text':
            case 'date':
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

    $programFilter = getSelectedProgramFilter();
    $analytics['selected_program'] = $programFilter;
    $analytics['report_tables'] = buildSurveyReportTables($db, (int)$surveyId, $responses, $questions, $questionResponseKeys, $programFilter);

    echo json_encode(["success" => true, "data" => $analytics]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}

function isDisplayOnlyQuestion($question) {
    $questionType = strtolower((string)($question['question_type'] ?? ''));
    $questionText = strtolower((string)($question['question_text'] ?? ''));

    return $questionType === 'header' || strpos($questionText, 'professional examination(s) passed') === 0;
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

function decodeQuestionOptions($options) {
    if ($options === null || $options === '') {
        return [];
    }

    if (is_string($options)) {
        $decoded = json_decode($options, true);
        $options = is_array($decoded) ? $decoded : [];
    }

    if (!is_array($options)) {
        return [];
    }

    $normalized = [];
    foreach ($options as $option) {
        if (!is_scalar($option)) {
            continue;
        }

        $optionText = trim((string)$option);
        if ($optionText !== '') {
            $normalized[] = $optionText;
        }
    }

    return array_values(array_unique($normalized));
}

function hasAnswerValue($answer) {
    if (is_array($answer)) {
        foreach ($answer as $value) {
            if (hasAnswerValue($value)) {
                return true;
            }
        }

        return false;
    }

    return trim((string)$answer) !== '';
}

function answerLabel($answer) {
    if (is_array($answer)) {
        $parts = [];
        foreach ($answer as $value) {
            if (is_scalar($value)) {
                $valueText = trim((string)$value);
                if ($valueText !== '') {
                    $parts[] = $valueText;
                }
            }
        }

        return implode(', ', $parts);
    }

    return trim((string)$answer);
}

function distributionToRows($distribution, $total) {
    $result = [];
    foreach ($distribution as $option => $count) {
        $result[] = [
            'option' => (string)$option,
            'count' => $count,
            'percentage' => $total > 0 ? round(($count / $total) * 100, 2) : 0
        ];
    }

    return $result;
}

function seedOptionDistribution($options) {
    $distribution = [];
    foreach ($options as $option) {
        $distribution[(string)$option] = 0;
    }

    return $distribution;
}

function analyzeMultipleChoice($answers, $options = []) {
    $distribution = [];
    if (!empty($options)) {
        $distribution = seedOptionDistribution($options);
    }

    $total = count($answers);
    
    foreach ($answers as $answer) {
        $option = answerLabel($answer);
        if ($option === '') {
            continue;
        }

        if (!isset($distribution[$option])) {
            $distribution[$option] = 0;
        }
        $distribution[$option]++;
    }
    
    return distributionToRows($distribution, $total);
}

function analyzeCheckbox($answers, $options = []) {
    $distribution = [];
    if (!empty($options)) {
        $distribution = seedOptionDistribution($options);
    }

    $total = count($answers);
    
    foreach ($answers as $answer) {
        // Checkbox answers can be arrays or comma-separated strings
        $options = is_array($answer) ? $answer : explode(',', $answer);
        foreach ($options as $option) {
            $option = trim($option);
            if ($option === '') {
                continue;
            }

            if (!isset($distribution[$option])) {
                $distribution[$option] = 0;
            }
            $distribution[$option]++;
        }
    }
    
    return distributionToRows($distribution, $total);
}

function analyzeText($answers) {
    // For text responses, return sample responses and word count
    $nonEmpty = array_values(array_filter($answers, function($a) { return hasAnswerValue($a); }));
    $samples = array_map(function($answer) {
        return answerLabel($answer);
    }, array_slice($nonEmpty, 0, 5));
    
    return [
        'total_responses' => count($nonEmpty),
        'sample_responses' => $samples,
        'avg_length' => count($nonEmpty) > 0 ? round(array_sum(array_map(function($answer) {
            return strlen(answerLabel($answer));
        }, $nonEmpty)) / count($nonEmpty), 2) : 0
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

function getSelectedProgramFilter() {
    $value = $_GET['program'] ?? ($_GET['department'] ?? null);
    if (!is_scalar($value)) {
        return null;
    }

    $value = strtoupper(trim((string)$value));
    return $value !== '' && $value !== 'ALL' ? $value : null;
}

function buildSurveyReportTables($db, $surveyId, $responses, $questions, $questionResponseKeys, $programFilter = null) {
    $programs = $programFilter ? [$programFilter] : ['BSCS', 'ACT'];
    $questionIds = [
        'program' => findSurveyQuestionId($questions, ['degree program']),
        'year' => findSurveyQuestionId($questions, ['year graduated']),
        'civil_status' => findSurveyQuestionId($questions, ['civil status']),
        'sex' => findSurveyQuestionId($questions, ['sex']),
        'honors' => findSurveyQuestionId($questions, ['honors']),
        'exam_passed' => findSurveyQuestionId($questions, ['professional examination']),
        'exam_name' => findSurveyQuestionId($questions, ['name of examination']),
        'exam_rating' => findSurveyQuestionId($questions, ['rating']),
        'pursue_degree' => findSurveyQuestionId($questions, ['reason', 'course']),
        'training_title' => findSurveyQuestionId($questions, ['title of training']),
        'training_duration' => findSurveyQuestionId($questions, ['duration']),
        'training_institution' => findSurveyQuestionId($questions, ['name of training institution']),
        'graduate_program' => findSurveyQuestionId($questions, ['name of graduate program']),
        'earned_units' => findSurveyQuestionId($questions, ['earned units']),
        'graduate_college' => findSurveyQuestionId($questions, ['college/university']),
        'advance_reason' => findSurveyQuestionId($questions, ['pursue advance studies']),
        'presently_employed' => findSurveyQuestionId($questions, ['are you presently employed']),
        'employment_status' => findSurveyQuestionId($questions, ['present employment status']),
        'occupation' => findSurveyQuestionId($questions, ['present occupation']),
        'line_business' => findSurveyQuestionId($questions, ['major line of business']),
        'place_work' => findSurveyQuestionId($questions, ['place of work']),
        'first_job' => findSurveyQuestionId($questions, ['first job after college']),
        'staying_reason' => findSurveyQuestionId($questions, ['reason', 'staying']),
        'first_job_related' => findSurveyQuestionId($questions, ['first job related']),
        'changing_reason' => findSurveyQuestionId($questions, ['reason', 'changing']),
        'stay_length' => findSurveyQuestionId($questions, ['stay in your first job']),
        'find_first_job' => findSurveyQuestionId($questions, ['find your first job']),
        'land_first_job' => findSurveyQuestionId($questions, ['land your first job']),
        'job_level' => findSurveyQuestionId($questions, ['job level']),
        'gross_monthly' => findSurveyQuestionId($questions, ['gross monthly']),
        'curriculum_relevant' => findSurveyQuestionId($questions, ['curriculum relevant']),
        'competencies' => findSurveyQuestionId($questions, ['competencies']),
        'unemployment_reason' => findSurveyQuestionId($questions, ['reason', 'not yet employed']),
    ];

    $records = buildSurveyReportRecords($responses, $questions, $questionResponseKeys, $questionIds);
    $programTotals = countRecordsByProgram($records, $programs);
    $graduateTotals = getGraduateTotalsByProgramYear($db, $programs);
    $years = getSurveyReportYears($records, $graduateTotals, $programs);
    $programPhrase = reportProgramPhrase($programs);
    $employedFilter = function ($record) use ($questionIds) {
        return getRecordEmploymentStatus($record, $questionIds) === true;
    };

    $tables = [];
    $tables[] = buildRetrievalTable($records, $programs, $years, $graduateTotals);
    $tables[] = buildDemographicTable($records, $programs, $programTotals, $questionIds);
    $tables[] = buildRankingProgramTable('3', 'Reasons for Pursuing the Degree for ' . $programPhrase . ' Graduates', 'Reasons for Pursuing the Degree', $questionIds['pursue_degree'], getPursueDegreeCategories(), $records, $programs, $programTotals);
    $tables[] = buildProgramDistributionTable('4', 'Honors and Awards Received by ' . $programPhrase . ' Graduates', 'Award', $questionIds['honors'], getQuestionCategories($questions, $questionIds['honors'], getHonorCategories()), $records, $programs, $programTotals);
    $nextTableNumber = 5;
    $singleProgram = count($programs) === 1 ? $programs[0] : null;

    if ($singleProgram && in_array($singleProgram, ['BEED', 'BSED'], true)) {
        $tables[] = buildLicensureTable('4a', $singleProgram, $records, $years, $questionIds);
    }

    if ($singleProgram === 'BSHM') {
        $tables[] = buildTrainingAttendanceTable((string)$nextTableNumber, $singleProgram, $records, $programTotals[$singleProgram] ?? 0, $questionIds);
        $nextTableNumber++;
        $tables[] = buildTrainingDetailsTable((string)$nextTableNumber, $singleProgram, $records, $programTotals[$singleProgram] ?? 0, $questionIds);
        $nextTableNumber++;
    }

    foreach ($programs as $program) {
        $tables[] = buildActualEmploymentTable((string)$nextTableNumber, 'Actual Employment Data of ' . $program . ' Graduates', $program, $records, $years, $questionIds, $nextTableNumber === 5 ? '3.3. Present Employment Data' : '');
        $nextTableNumber++;
    }

    if ($singleProgram && in_array($singleProgram, ['BEED', 'BSED'], true)) {
        $tables[] = buildAdvanceStudiesPursuedTable((string)$nextTableNumber, [$singleProgram], $records, $programTotals, $questionIds, '3.2. Training/Advance Studies Attended After College');
        $nextTableNumber++;
        $tables[] = buildAdvanceStudyReasonsTable((string)$nextTableNumber, [$singleProgram], $records, $programTotals, $questionIds);
        $nextTableNumber++;
    }

    $tables[] = buildEmploymentStatusByYearTable($records, $programs, $years, $questionIds, (string)$nextTableNumber);
    $nextTableNumber++;
    $employedTotals = countRecordsByProgram($records, $programs, $employedFilter);
    $tables[] = buildProgramDistributionTable((string)$nextTableNumber, 'Present Employment Classification of ' . $programPhrase . ' Graduates', 'Present Occupation', $questionIds['occupation'], getOccupationCategories(), $records, $programs, $employedTotals, '', '', $employedFilter);
    $nextTableNumber++;
    $tables[] = buildProgramDistributionTable((string)$nextTableNumber, 'Major Line of Business of the Company the ' . $programPhrase . ' Graduates are Employed', 'Line of Business', $questionIds['line_business'], getLineBusinessCategories(), $records, $programs, $employedTotals, '', '', $employedFilter);
    $nextTableNumber++;
    $tables[] = buildPlaceOfWorkTable($records, $programs, $years, $questionIds, (string)$nextTableNumber);
    $nextTableNumber++;
    $tables[] = buildProgramDistributionTable((string)$nextTableNumber, 'Current Job Level Positions of the ' . $programPhrase . ' Graduates', 'Position', $questionIds['job_level'], getJobLevelCategories(), $records, $programs, $employedTotals, '', '', $employedFilter);
    $nextTableNumber++;
    $tables[] = buildProgramDistributionTable((string)$nextTableNumber, 'Job Details as to First Job', 'First Job?', $questionIds['first_job'], getYesNoCategories(), $records, $programs, $programTotals);
    $nextTableNumber++;
    $tables[] = buildProgramDistributionTable((string)$nextTableNumber, 'Relatedness of the First Job to the Course Taken in College', 'First Job Related to the course taken up in College?', $questionIds['first_job_related'], getYesNoCategories(), $records, $programs, $programTotals);
    $nextTableNumber++;
    if (count($programs) === 1) {
        $tables[] = buildReasonRelationTable((string)$nextTableNumber, 'Reasons for Staying, Accepting, and Changing the First Job of the ' . $programs[0] . ' Graduates', $programs[0], $records, $questionIds);
        $nextTableNumber++;
    } else {
        $tables[] = buildReasonRelationTable('14a', 'Reasons for Staying, Accepting, and Changing the First Job of the BSCS Graduates', 'BSCS', $records, $questionIds);
        $tables[] = buildReasonRelationTable('14b', 'Relatedness of the Staying, Accepting, and Changing the First Job of the ACT Graduates', 'ACT', $records, $questionIds);
        $nextTableNumber = 15;
    }
    $tables[] = buildProgramDistributionTable((string)$nextTableNumber, 'Length of Stay in the First Job', 'Duration with the First Job', $questionIds['stay_length'], getDurationCategories(true), $records, $programs, $programTotals);
    $nextTableNumber++;
    $tables[] = buildProgramDistributionTable((string)$nextTableNumber, 'Means of Finding the First Job of the ' . $programPhrase . ' Graduates', 'Means of Finding the First Job', $questionIds['find_first_job'], getFindJobCategories(), $records, $programs, $programTotals);
    $nextTableNumber++;
    $tables[] = buildProgramDistributionTable((string)$nextTableNumber, 'Time it Takes to Land on the First Job', 'Duration with the First Job', $questionIds['land_first_job'], getDurationCategories(false), $records, $programs, $programTotals);
    $nextTableNumber++;
    $tables[] = buildProgramDistributionTable((string)$nextTableNumber, 'Gross Monthly Earning in the First Job', 'Gross Monthly Earning in the First Job', $questionIds['gross_monthly'], getSalaryCategories(), $records, $programs, $programTotals);
    $nextTableNumber++;
    $tables[] = buildProgramDistributionTable((string)$nextTableNumber, 'Curriculum Relevance to the First Job', 'Curriculum Relevant to the First Job?', $questionIds['curriculum_relevant'], getYesNoCategories(), $records, $programs, $programTotals, '3.5 Curriculum Contribution to their First Job');
    $nextTableNumber++;
    $tables[] = buildProgramDistributionTable((string)$nextTableNumber, 'Competencies Learned in College that was Found Useful in the First Job', 'Competencies', $questionIds['competencies'], getCompetencyCategories(), $records, $programs, $programTotals);

    return $tables;
}

function findSurveyQuestionId($questions, $requiredTerms, $excludedTerms = []) {
    foreach ($questions as $question) {
        $text = normalizeReportText($question['question_text']);
        $matches = true;
        foreach ($requiredTerms as $term) {
            if (strpos($text, normalizeReportText($term)) === false) {
                $matches = false;
                break;
            }
        }
        foreach ($excludedTerms as $term) {
            if ($matches && strpos($text, normalizeReportText($term)) !== false) {
                $matches = false;
                break;
            }
        }
        if ($matches) {
            return (string)$question['id'];
        }
    }

    return null;
}

function buildSurveyReportRecords($responses, $questions, $questionResponseKeys, $questionIds) {
    $records = [];

    foreach ($responses as $response) {
        $data = json_decode((string)$response['responses'], true);
        if (!is_array($data)) {
            continue;
        }

        $answers = [];
        foreach ($questions as $question) {
            $questionId = (string)$question['id'];
            $answers[$questionId] = getAnswerFromKeys($data, $questionResponseKeys[$questionId] ?? [$questionId]);
        }

        $program = strtoupper(trim((string)($response['program_code'] ?? '')));
        if ($program === '' && !empty($questionIds['program'])) {
            $program = normalizeProgramCode($answers[$questionIds['program']] ?? '');
        }

        $year = trim((string)($response['year_graduated'] ?? ''));
        if ($year === '' && !empty($questionIds['year'])) {
            $year = normalizeGraduationYear($answers[$questionIds['year']] ?? '');
        }

        $records[] = [
            'program' => $program,
            'year' => $year,
            'answers' => $answers,
        ];
    }

    return $records;
}

function normalizeProgramCode($value) {
    $text = normalizeReportText(answerLabel($value));
    if (strpos($text, 'computer science') !== false || $text === 'bscs') {
        return 'BSCS';
    }
    if (strpos($text, 'computer technology') !== false || $text === 'act') {
        return 'ACT';
    }
    if (strpos($text, 'secondary education') !== false || $text === 'bsed') {
        return 'BSED';
    }
    if (strpos($text, 'elementary education') !== false || $text === 'beed') {
        return 'BEED';
    }
    if (strpos($text, 'hospitality management') !== false || $text === 'bshm') {
        return 'BSHM';
    }

    return strtoupper(trim(answerLabel($value)));
}

function normalizeGraduationYear($value) {
    $text = answerLabel($value);
    if (preg_match('/\b(19|20)\d{2}\b/', $text, $matches)) {
        return $matches[0];
    }

    return trim($text);
}

function normalizeReportText($value) {
    $text = strtolower(trim((string)$value));
    $text = str_replace(["\r", "\n", "\t", "\xE2\x80\x99", "\xE2\x80\x93", "\xE2\x80\x94", "\xE2\x82\xB1"], [' ', ' ', ' ', "'", '-', '-', 'php'], $text);
    $text = preg_replace('/\s+/', ' ', $text);
    return $text;
}

function answerValues($answer) {
    if (is_array($answer)) {
        $values = [];
        foreach ($answer as $value) {
            if (hasAnswerValue($value)) {
                $values[] = answerLabel($value);
            }
        }
        return $values;
    }

    $text = answerLabel($answer);
    return $text === '' ? [] : [$text];
}

function makeCategory($label, $aliases = []) {
    return ['label' => $label, 'aliases' => array_values(array_unique(array_merge([$label], $aliases)))];
}

function makeCategories($labels) {
    return array_map(function ($label) {
        return makeCategory($label);
    }, $labels);
}

function valueMatchesCategory($value, $category) {
    $valueText = normalizeReportText($value);
    if ($valueText === '') {
        return false;
    }

    foreach ($category['aliases'] as $alias) {
        $aliasText = normalizeReportText($alias);
        if ($aliasText !== '' && ($valueText === $aliasText || strpos($valueText, $aliasText) !== false || strpos($aliasText, $valueText) !== false)) {
            return true;
        }
    }

    return false;
}

function getQuestionCategories($questions, $questionId, $fallback) {
    if ($questionId === null) {
        return $fallback;
    }

    foreach ($questions as $question) {
        if ((string)$question['id'] !== (string)$questionId) {
            continue;
        }

        $options = decodeQuestionOptions($question['options'] ?? null);
        return !empty($options) ? makeCategories($options) : $fallback;
    }

    return $fallback;
}

function countRecordsByProgram($records, $programs, $filter = null) {
    $counts = array_fill_keys($programs, 0);
    foreach ($records as $record) {
        if (!in_array($record['program'], $programs, true)) {
            continue;
        }
        if ($filter && !$filter($record)) {
            continue;
        }
        $counts[$record['program']]++;
    }

    return $counts;
}

function countCategoriesByProgram($records, $programs, $questionId, $categories, $filter = null) {
    $counts = [];
    foreach ($programs as $program) {
        $counts[$program] = [];
        foreach ($categories as $category) {
            $counts[$program][$category['label']] = 0;
        }
    }

    if ($questionId === null) {
        return $counts;
    }

    foreach ($records as $record) {
        $program = $record['program'];
        if (!in_array($program, $programs, true)) {
            continue;
        }
        if ($filter && !$filter($record)) {
            continue;
        }

        $values = answerValues($record['answers'][$questionId] ?? null);
        foreach ($categories as $category) {
            foreach ($values as $value) {
                if (valueMatchesCategory($value, $category)) {
                    $counts[$program][$category['label']]++;
                    break;
                }
            }
        }
    }

    return $counts;
}

function countCategoriesForProgram($records, $program, $questionId, $categories, $filter = null) {
    $counts = countCategoriesByProgram($records, [$program], $questionId, $categories, $filter);
    return $counts[$program];
}

function getRecordEmploymentStatus($record, $questionIds) {
    $answer = !empty($questionIds['presently_employed']) ? ($record['answers'][$questionIds['presently_employed']] ?? null) : null;
    $status = parseEmploymentAnswer($answer);
    if ($status !== null) {
        return $status;
    }

    return !empty($questionIds['employment_status'])
        ? parseEmploymentAnswer($record['answers'][$questionIds['employment_status']] ?? null)
        : null;
}

function getRecordYesNo($record, $questionId) {
    if ($questionId === null) {
        return null;
    }

    $text = normalizeReportText(answerLabel($record['answers'][$questionId] ?? null));
    if ($text === '') {
        return null;
    }
    if (strpos($text, 'yes') !== false) {
        return true;
    }
    if (strpos($text, 'no') !== false || strpos($text, 'not') !== false) {
        return false;
    }

    return null;
}

function getGraduateTotalsByProgramYear($db, $programs) {
    $totals = [];
    foreach ($programs as $program) {
        $totals[$program] = [];
    }

    $placeholders = implode(',', array_fill(0, count($programs), '?'));
    $stmt = $db->prepare("
        SELECT p.code, g.year_graduated, COUNT(*) AS total
        FROM graduates g
        LEFT JOIN programs p ON p.id = g.program_id
        WHERE p.code IN ($placeholders) AND g.status = 'active'
        GROUP BY p.code, g.year_graduated
        ORDER BY g.year_graduated
    ");
    $stmt->execute($programs);

    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $program = strtoupper((string)$row['code']);
        $year = (string)$row['year_graduated'];
        if (isset($totals[$program])) {
            $totals[$program][$year] = (int)$row['total'];
        }
    }

    return $totals;
}

function getSurveyReportYears($records, $graduateTotals, $programs) {
    $years = [];
    foreach ($graduateTotals as $programTotals) {
        foreach (array_keys($programTotals) as $year) {
            if ($year !== '') {
                $years[$year] = $year;
            }
        }
    }
    foreach ($records as $record) {
        if (in_array($record['program'], $programs, true) && $record['year'] !== '') {
            $years[$record['year']] = $record['year'];
        }
    }

    ksort($years, SORT_NUMERIC);
    return array_values($years);
}

function reportProgramPhrase($programs) {
    $programs = array_values($programs);
    if (count($programs) === 0) {
        return 'Program';
    }
    if (count($programs) === 1) {
        return $programs[0];
    }
    if (count($programs) === 2) {
        return $programs[0] . ' and ' . $programs[1];
    }

    $last = array_pop($programs);
    return implode(', ', $programs) . ', and ' . $last;
}

function reportCell($label, $colspan = 1, $rowspan = 1, $align = 'center') {
    return ['label' => (string)$label, 'colspan' => $colspan, 'rowspan' => $rowspan, 'align' => $align];
}

function reportRow($cells, $isTotal = false, $isGroup = false) {
    return ['cells' => array_map('strval', $cells), 'is_total' => $isTotal, 'is_group' => $isGroup];
}

function reportTable($number, $title, $headers, $rows, $sectionTitle = '', $note = '') {
    return [
        'number' => $number,
        'title' => $title,
        'section_title' => $sectionTitle,
        'headers' => $headers,
        'rows' => $rows,
        'note' => $note,
    ];
}

function programHeaderLabel($program, $count) {
    return $program . ' (N=' . (int)$count . ')';
}

function formatReportCount($count, $dashZero = true) {
    $count = (int)$count;
    return ($dashZero && $count === 0) ? '-' : (string)$count;
}

function formatReportPercent($count, $denominator, $dashZero = true) {
    $count = (int)$count;
    $denominator = (int)$denominator;
    if ($denominator <= 0 || ($dashZero && $count === 0)) {
        return '-';
    }

    $percentage = ($count / $denominator) * 100;
    return ($percentage > 0 && $percentage < 1) ? '<1' : (string)round($percentage);
}

function buildRetrievalTable($records, $programs, $years, $graduateTotals) {
    $retrieved = [];
    foreach ($programs as $program) {
        $retrieved[$program] = [];
    }
    foreach ($records as $record) {
        if (!in_array($record['program'], $programs, true) || $record['year'] === '') {
            continue;
        }
        $retrieved[$record['program']][$record['year']] = ($retrieved[$record['program']][$record['year']] ?? 0) + 1;
    }

    $headers = [
        [
            reportCell('Year Graduated', 1, 2),
            reportCell('Number of Graduates', count($programs)),
            reportCell('Retrieved No. of Questionnaires', count($programs)),
            reportCell('Retrieval Rate Percentage (%)', count($programs)),
        ],
        [],
    ];
    foreach (['graduates', 'retrieved', 'rate'] as $_group) {
        foreach ($programs as $program) {
            $headers[1][] = reportCell($program);
        }
    }
    $rows = [];
    $totalGraduates = array_fill_keys($programs, 0);
    $totalRetrieved = array_fill_keys($programs, 0);

    foreach ($years as $year) {
        $cells = [$year];
        foreach ($programs as $program) {
            $count = $graduateTotals[$program][$year] ?? 0;
            $totalGraduates[$program] += $count;
            $cells[] = formatReportCount($count);
        }
        foreach ($programs as $program) {
            $count = $retrieved[$program][$year] ?? 0;
            $totalRetrieved[$program] += $count;
            $cells[] = formatReportCount($count);
        }
        foreach ($programs as $program) {
            $cells[] = formatReportPercent($retrieved[$program][$year] ?? 0, $graduateTotals[$program][$year] ?? 0);
        }
        $rows[] = reportRow($cells);
    }

    $totalCells = ['TOTAL/AVE'];
    foreach ($programs as $program) {
        $totalCells[] = formatReportCount($totalGraduates[$program], false);
    }
    foreach ($programs as $program) {
        $totalCells[] = formatReportCount($totalRetrieved[$program], false);
    }
    foreach ($programs as $program) {
        $totalCells[] = formatReportPercent($totalRetrieved[$program], $totalGraduates[$program], false);
    }
    $rows[] = reportRow($totalCells, true);

    return reportTable('1', 'Distribution of Graduates and Retrieval Rate of the Tracer Study for ' . reportProgramPhrase($programs) . ' Graduates', $headers, $rows);
}

function buildDemographicTable($records, $programs, $programTotals, $questionIds) {
    $headers = [[reportCell('Profile/ Program', 1, 2, 'left')], []];
    foreach ($programs as $program) {
        $headers[0][] = reportCell(programHeaderLabel($program, $programTotals[$program] ?? 0), 2);
        $headers[1][] = reportCell('f');
        $headers[1][] = reportCell('%');
    }
    $rows = [];
    $sections = [
        ['Civil Status', $questionIds['civil_status'], [makeCategory('Single'), makeCategory('Married'), makeCategory('Widowed'), makeCategory('Separated'), makeCategory('Divorced')]],
        ['Gender', $questionIds['sex'], [makeCategory('Male'), makeCategory('Female'), makeCategory('Prefer not to say')]],
    ];

    foreach ($sections as $section) {
        [$sectionLabel, $questionId, $categories] = $section;
        $rows[] = reportRow(array_merge([$sectionLabel], array_fill(0, count($programs) * 2, '')), false, true);
        $counts = countCategoriesByProgram($records, $programs, $questionId, $categories);
        foreach ($categories as $category) {
            $hasData = false;
            foreach ($programs as $program) {
                $hasData = $hasData || (($counts[$program][$category['label']] ?? 0) > 0);
            }
            if (!$hasData && $category['label'] === 'Prefer not to say') {
                continue;
            }
            $cells = ['  ' . $category['label']];
            foreach ($programs as $program) {
                $count = $counts[$program][$category['label']] ?? 0;
                $cells[] = formatReportCount($count);
                $cells[] = formatReportPercent($count, $programTotals[$program]);
            }
            $rows[] = reportRow($cells);
        }
    }

    return reportTable('2', 'Demographic Profile of ' . reportProgramPhrase($programs) . ' Graduates', $headers, $rows);
}

function buildLicensureTable($number, $program, $records, $years, $questionIds) {
    $programRecords = array_values(array_filter($records, function ($record) use ($program) {
        return $record['program'] === $program;
    }));
    $totalRespondents = count($programRecords);
    $headers = [
        [
            reportCell('Year Graduated', 1, 2),
            reportCell('Respondents n = ' . $totalRespondents, 1, 2),
            reportCell('Number of BLEPT Takers', 2),
            reportCell('Number of Graduates who plan not to take the exam yet', 2),
            reportCell('Number of BLEPT Passers', 2),
        ],
        [reportCell('f'), reportCell('%'), reportCell('f'), reportCell('%'), reportCell('f'), reportCell('%')],
    ];

    $rows = [];
    $totals = ['respondents' => 0, 'takers' => 0, 'not_taking' => 0, 'passers' => 0];
    foreach ($years as $year) {
        $yearRecords = array_values(array_filter($programRecords, function ($record) use ($year) {
            return $record['year'] === (string)$year;
        }));
        $respondents = count($yearRecords);
        $takers = 0;
        $passers = 0;

        foreach ($yearRecords as $record) {
            if (isBleptTaker($record, $questionIds)) {
                $takers++;
            }
            if (isBleptPasser($record, $questionIds)) {
                $passers++;
            }
        }

        $notTaking = max($respondents - $takers, 0);
        $totals['respondents'] += $respondents;
        $totals['takers'] += $takers;
        $totals['not_taking'] += $notTaking;
        $totals['passers'] += $passers;

        $rows[] = reportRow([
            $year,
            formatReportCount($respondents, false),
            formatReportCount($takers),
            formatReportPercent($takers, $respondents),
            formatReportCount($notTaking),
            formatReportPercent($notTaking, $respondents),
            formatReportCount($passers),
            formatReportPercent($passers, $respondents),
        ]);
    }

    $rows[] = reportRow([
        'TOTAL',
        formatReportCount($totals['respondents'], false),
        formatReportCount($totals['takers'], false),
        formatReportPercent($totals['takers'], $totals['respondents'], false),
        formatReportCount($totals['not_taking'], false),
        formatReportPercent($totals['not_taking'], $totals['respondents'], false),
        formatReportCount($totals['passers'], false),
        formatReportPercent($totals['passers'], $totals['respondents'], false),
    ], true);

    return reportTable($number, 'Number of Licensed ' . $program . ' Graduates', $headers, $rows, '', 'n = total number of respondents');
}

function buildTrainingAttendanceTable($number, $program, $records, $programTotal, $questionIds) {
    $headers = [[
        reportCell('Number of Trainings Attended', 1, 1, 'left'),
        reportCell('Frequency'),
        reportCell('Percentage (%)'),
    ]];
    $bands = [
        ['label' => '1 - 2', 'min' => 1, 'max' => 2],
        ['label' => '3 - 4', 'min' => 3, 'max' => 4],
        ['label' => '5 and above', 'min' => 5, 'max' => PHP_INT_MAX],
    ];
    $counts = array_fill_keys(array_column($bands, 'label'), 0);
    $totalWithTraining = 0;

    foreach ($records as $record) {
        if ($record['program'] !== $program) {
            continue;
        }

        $trainingCount = countTrainingItemsForRecord($record, $questionIds);
        if ($trainingCount <= 0) {
            continue;
        }

        $totalWithTraining++;
        foreach ($bands as $band) {
            if ($trainingCount >= $band['min'] && $trainingCount <= $band['max']) {
                $counts[$band['label']]++;
                break;
            }
        }
    }

    $rows = [];
    foreach ($bands as $band) {
        if ($band['label'] === '5 and above' && $counts[$band['label']] === 0) {
            continue;
        }

        $rows[] = reportRow([
            $band['label'],
            formatReportCount($counts[$band['label']]),
            formatReportPercent($counts[$band['label']], $programTotal),
        ]);
    }

    $rows[] = reportRow([
        'TOTAL',
        formatReportCount($totalWithTraining, false),
        formatReportPercent($totalWithTraining, $programTotal, false),
    ], true);

    return reportTable($number, 'Trainings Attended of the ' . $program . ' Graduates after Graduation', $headers, $rows);
}

function buildTrainingDetailsTable($number, $program, $records, $programTotal, $questionIds) {
    $headers = [[
        reportCell('Title of Training or Advance Study', 1, 1, 'left'),
        reportCell('Name of Training Institution/ College/ University', 1, 1, 'left'),
        reportCell('Frequency'),
        reportCell('Percentage (%)'),
    ]];
    $details = collectTrainingDetailCounts($records, $program, $questionIds);
    $rows = [];
    $total = 0;

    foreach ($details as $detail) {
        $total += $detail['count'];
        $rows[] = reportRow([
            $detail['title'],
            $detail['institution'],
            formatReportCount($detail['count'], false),
            formatReportPercent($detail['count'], $programTotal, false),
        ]);
    }

    if (empty($rows)) {
        $rows[] = reportRow(['No training or advance study responses', '-', '-', '-']);
    }

    $rows[] = reportRow([
        'TOTAL',
        '',
        formatReportCount($total, false),
        formatReportPercent($total, $programTotal, false),
    ], true);

    return reportTable($number, 'Details of the Trainings and Advance Studies Attended After College by the ' . $program . ' Graduates', $headers, $rows, '', 'N.D. = Not disclosed');
}

function buildAdvanceStudiesPursuedTable($number, $programs, $records, $programTotals, $questionIds, $sectionTitle = '') {
    $headers = [[reportCell('Training(s)/ Advance Studies after College', 1, 2, 'left')], []];
    foreach ($programs as $program) {
        $headers[0][] = reportCell($program . ' n=' . (int)($programTotals[$program] ?? 0), 2);
        $headers[1][] = reportCell('Frequency');
        $headers[1][] = reportCell('Percentage (%)');
    }

    $pursued = [];
    foreach ($programs as $program) {
        $pursued[$program] = count(array_filter($records, function ($record) use ($program, $questionIds) {
            return $record['program'] === $program && hasTrainingOrAdvanceStudy($record, $questionIds);
        }));
    }

    $rows = [];
    $summaryRows = [
        ['Number Students who pursued advance studies after college', true],
        ['Number of Students who did not pursue advance studies', false],
    ];

    foreach ($summaryRows as $summaryRow) {
        [$label, $isPursuedRow] = $summaryRow;
        $cells = [$label];
        foreach ($programs as $program) {
            $denominator = $programTotals[$program] ?? 0;
            $count = $isPursuedRow ? $pursued[$program] : max($denominator - $pursued[$program], 0);
            $cells[] = formatReportCount($count, false);
            $cells[] = formatReportPercent($count, $denominator, false);
        }
        $rows[] = reportRow($cells);
    }

    return reportTable($number, 'Number of Graduates who Pursued Trainings and Advance Studies after College', $headers, $rows, $sectionTitle, 'n = total number of respondents');
}

function buildAdvanceStudyReasonsTable($number, $programs, $records, $programTotals, $questionIds) {
    $headers = [[reportCell('Reasons', 1, 2, 'left')], []];
    foreach ($programs as $program) {
        $headers[0][] = reportCell($program . ' n=' . (int)($programTotals[$program] ?? 0), 2);
        $headers[1][] = reportCell('Frequency');
        $headers[1][] = reportCell('Percentage (%)');
    }

    $categories = getAdvanceStudyReasonCategories();
    $counts = countCategoriesByProgram($records, $programs, $questionIds['advance_reason'], $categories, function ($record) use ($questionIds) {
        return hasTrainingOrAdvanceStudy($record, $questionIds);
    });
    $totals = array_fill_keys($programs, 0);
    foreach ($programs as $program) {
        foreach ($categories as $category) {
            $totals[$program] += $counts[$program][$category['label']] ?? 0;
        }
    }

    $rows = [];
    foreach ($categories as $category) {
        $cells = [$category['label']];
        foreach ($programs as $program) {
            $count = $counts[$program][$category['label']] ?? 0;
            $cells[] = formatReportCount($count);
            $cells[] = formatReportPercent($count, $totals[$program] ?? 0);
        }
        $rows[] = reportRow($cells);
    }

    $totalCells = ['TOTAL'];
    foreach ($programs as $program) {
        $totalCells[] = formatReportCount($totals[$program], false);
        $totalCells[] = formatReportPercent($totals[$program], $totals[$program], false);
    }
    $rows[] = reportRow($totalCells, true);

    return reportTable($number, 'Reasons of the Graduates in Pursuing Trainings and Advance Studies after College', $headers, $rows, '', 'n = total number of respondents');
}

function buildProgramDistributionTable($number, $title, $firstColumn, $questionId, $categories, $records, $programs, $denominators, $sectionTitle = '', $note = '', $filter = null) {
    $headers = [[reportCell($firstColumn, 1, 2, 'left')], []];
    foreach ($programs as $program) {
        $headers[0][] = reportCell(programHeaderLabel($program, $denominators[$program] ?? 0), 2);
        $headers[1][] = reportCell('f');
        $headers[1][] = reportCell('%');
    }
    $counts = countCategoriesByProgram($records, $programs, $questionId, $categories, $filter);
    $rows = [];
    $totals = array_fill_keys($programs, 0);

    foreach ($categories as $category) {
        $cells = [$category['label']];
        foreach ($programs as $program) {
            $count = $counts[$program][$category['label']] ?? 0;
            $totals[$program] += $count;
            $cells[] = formatReportCount($count);
            $cells[] = formatReportPercent($count, $denominators[$program] ?? 0);
        }
        $rows[] = reportRow($cells);
    }

    $totalCells = ['TOTAL'];
    foreach ($programs as $program) {
        $totalCells[] = formatReportCount($totals[$program], false);
        $totalCells[] = formatReportPercent($totals[$program], $denominators[$program] ?? 0, false);
    }
    $rows[] = reportRow($totalCells, true);

    return reportTable($number, $title, $headers, $rows, $sectionTitle, $note);
}

function buildRankingProgramTable($number, $title, $firstColumn, $questionId, $categories, $records, $programs, $denominators) {
    $headers = [[reportCell($firstColumn, 1, 2, 'left')], []];
    foreach ($programs as $program) {
        $headers[0][] = reportCell($program, 3);
        $headers[1][] = reportCell('f');
        $headers[1][] = reportCell('%');
        $headers[1][] = reportCell('R');
    }
    $counts = countCategoriesByProgram($records, $programs, $questionId, $categories);
    $ranks = [];

    foreach ($programs as $program) {
        $sorted = $counts[$program];
        arsort($sorted);
        $rank = 1;
        $ranks[$program] = [];
        foreach ($sorted as $label => $count) {
            $ranks[$program][$label] = $count > 0 ? (string)$rank : '';
            $rank++;
        }
    }

    $rows = [];
    foreach ($categories as $category) {
        $cells = [$category['label']];
        foreach ($programs as $program) {
            $count = $counts[$program][$category['label']] ?? 0;
            $cells[] = formatReportCount($count);
            $cells[] = formatReportPercent($count, $denominators[$program] ?? 0);
            $cells[] = $ranks[$program][$category['label']] ?? '';
        }
        $rows[] = reportRow($cells);
    }

    return reportTable($number, $title, $headers, $rows, '', '*R = ranking');
}

function buildActualEmploymentTable($number, $title, $program, $records, $years, $questionIds, $sectionTitle = '') {
    $headers = [
        [reportCell('Year of Graduation', 1, 2), reportCell('Employed', 2), reportCell('Not Employed', 2)],
        [reportCell('Frequency'), reportCell('%'), reportCell('Frequency'), reportCell('%')],
    ];
    $rows = [];
    $totals = ['employed' => 0, 'not' => 0, 'year_total' => 0];

    foreach ($years as $year) {
        $yearRecords = array_values(array_filter($records, function ($record) use ($program, $year) {
            return $record['program'] === $program && $record['year'] === (string)$year;
        }));
        $yearTotal = count($yearRecords);
        $employed = 0;
        $not = 0;

        foreach ($yearRecords as $record) {
            $employmentStatus = getRecordEmploymentStatus($record, $questionIds);
            if ($employmentStatus === true) {
                $employed++;
            } elseif ($employmentStatus === false) {
                $not++;
            }
        }

        $totals['employed'] += $employed;
        $totals['not'] += $not;
        $totals['year_total'] += $yearTotal;

        $rows[] = reportRow([
            $year,
            formatReportCount($employed),
            formatReportPercent($employed, $yearTotal),
            formatReportCount($not),
            formatReportPercent($not, $yearTotal),
        ]);
    }

    $rows[] = reportRow([
        'TOTALS',
        formatReportCount($totals['employed'], false),
        formatReportPercent($totals['employed'], $totals['year_total'], false),
        formatReportCount($totals['not'], false),
        formatReportPercent($totals['not'], $totals['year_total'], false),
    ], true);

    return reportTable($number, $title, $headers, $rows, $sectionTitle);
}

function buildEmploymentStatusByYearTable($records, $programs, $years, $questionIds, $number = '7') {
    $categories = getEmploymentStatusCategories();
    $headers = [[reportCell('Present Employment Status', 1, 3, 'left'), reportCell('Year of Graduation', count($years) * count($programs)), reportCell('Total', count($programs))]];
    $yearHeader = [];
    foreach ($years as $year) {
        $yearHeader[] = reportCell($year, count($programs));
    }
    foreach ($programs as $program) {
        $yearHeader[] = reportCell($program);
    }
    $headers[] = $yearHeader;
    $programHeader = [];
    foreach ($years as $_year) {
        foreach ($programs as $program) {
            $programHeader[] = reportCell($program);
        }
    }
    foreach ($programs as $program) {
        $programHeader[] = reportCell($program);
    }
    $headers[] = $programHeader;

    $rows = [];
    $programTotals = countRecordsByProgram($records, $programs);
    foreach ($categories as $category) {
        $cells = [$category['label']];
        $totalByProgram = array_fill_keys($programs, 0);
        foreach ($years as $year) {
            foreach ($programs as $program) {
                $count = countRecordsForStatus($records, $program, $year, $questionIds['employment_status'], $category);
                $totalByProgram[$program] += $count;
                $cells[] = formatReportCount($count);
            }
        }
        foreach ($programs as $program) {
            $count = $totalByProgram[$program];
            $cells[] = $count > 0 ? ($count . ' (' . formatReportPercent($count, $programTotals[$program] ?? 0, false) . '%)') : '-';
        }
        $rows[] = reportRow($cells);
    }

    $totalCells = ['TOTAL'];
    foreach ($years as $year) {
        foreach ($programs as $program) {
            $count = count(array_filter($records, function ($record) use ($program, $year) {
                return $record['program'] === $program && $record['year'] === (string)$year;
            }));
            $totalCells[] = formatReportCount($count, false);
        }
    }
    foreach ($programs as $program) {
        $totalCells[] = formatReportCount($programTotals[$program] ?? 0, false) . ' (100%)';
    }
    $rows[] = reportRow($totalCells, true);

    return reportTable($number, 'Present Employment Status of ' . reportProgramPhrase($programs) . ' Graduates', $headers, $rows);
}

function countRecordsForStatus($records, $program, $year, $questionId, $category) {
    if ($questionId === null) {
        return 0;
    }

    $count = 0;
    foreach ($records as $record) {
        if ($record['program'] !== $program || $record['year'] !== (string)$year) {
            continue;
        }

        foreach (answerValues($record['answers'][$questionId] ?? null) as $value) {
            if (valueMatchesCategory($value, $category)) {
                $count++;
                break;
            }
        }
    }

    return $count;
}

function buildPlaceOfWorkTable($records, $programs, $years, $questionIds, $number = '10') {
    $headers = [
        [reportCell('Year Graduated', 1, 3), reportCell('Place of Work', count($programs) * 4)],
        [reportCell('Local', count($programs) * 2), reportCell('Abroad', count($programs) * 2)],
        [],
    ];
    foreach (['Local', 'Abroad'] as $_place) {
        foreach ($programs as $program) {
            $headers[2][] = reportCell($program . ' Frequency');
            $headers[2][] = reportCell('Percentage (%)');
        }
    }
    $rows = [];
    $totals = ['Local' => array_fill_keys($programs, 0), 'Abroad' => array_fill_keys($programs, 0)];
    $programTotals = countRecordsByProgram($records, $programs);

    foreach ($years as $year) {
        $cells = [$year];
        foreach (['Local', 'Abroad'] as $place) {
            foreach ($programs as $program) {
                $count = countPlaceOfWork($records, $program, $year, $questionIds['place_work'], $place);
                $totals[$place][$program] += $count;
                $yearProgramTotal = count(array_filter($records, function ($record) use ($program, $year) {
                    return $record['program'] === $program && $record['year'] === (string)$year;
                }));
                $cells[] = formatReportCount($count);
                $cells[] = formatReportPercent($count, $yearProgramTotal);
            }
        }
        $rows[] = reportRow($cells);
    }

    $totalCells = ['TOTALS'];
    foreach (['Local', 'Abroad'] as $place) {
        foreach ($programs as $program) {
            $count = $totals[$place][$program];
            $totalCells[] = formatReportCount($count, false);
            $totalCells[] = formatReportPercent($count, $programTotals[$program] ?? 0, false);
        }
    }
    $rows[] = reportRow($totalCells, true);

    return reportTable($number, 'Place of Work of the ' . reportProgramPhrase($programs) . ' Graduates', $headers, $rows);
}

function countPlaceOfWork($records, $program, $year, $questionId, $place) {
    if ($questionId === null) {
        return 0;
    }

    $count = 0;
    foreach ($records as $record) {
        if ($record['program'] !== $program || $record['year'] !== (string)$year) {
            continue;
        }

        $text = normalizeReportText(answerLabel($record['answers'][$questionId] ?? null));
        if ($place === 'Local' && strpos($text, 'local') !== false) {
            $count++;
        }
        if ($place === 'Abroad' && (strpos($text, 'abroad') !== false || strpos($text, 'overseas') !== false)) {
            $count++;
        }
    }

    return $count;
}

function buildReasonRelationTable($number, $title, $program, $records, $questionIds) {
    $categories = getReasonRelationCategories();
    $headers = [[reportCell('Reasons', 1, 1, 'left'), reportCell('Staying*'), reportCell('Accepting**'), reportCell('Changing*')]];
    $programRecords = array_values(array_filter($records, function ($record) use ($program) {
        return $record['program'] === $program;
    }));
    $employedRecords = array_values(array_filter($programRecords, function ($record) use ($questionIds) {
        return getRecordEmploymentStatus($record, $questionIds) === true;
    }));
    $stayingCounts = countCategoriesForProgram($records, $program, $questionIds['staying_reason'], $categories);
    $acceptingCounts = countCategoriesForProgram($records, $program, null, $categories);
    $changingCounts = countCategoriesForProgram($records, $program, $questionIds['changing_reason'], $categories);

    $rows = [];
    foreach ($categories as $category) {
        $label = $category['label'];
        $rows[] = reportRow([
            $label,
            formatCountWithPercent($stayingCounts[$label] ?? 0, count($employedRecords)),
            formatCountWithPercent($acceptingCounts[$label] ?? 0, count($programRecords)),
            formatCountWithPercent($changingCounts[$label] ?? 0, count($employedRecords)),
        ]);
    }

    return reportTable($number, $title, $headers, $rows, '', '*Based on the total number of presently employed graduates. **Based on the total number of graduate respondents.');
}

function formatCountWithPercent($count, $denominator) {
    $count = (int)$count;
    return $count === 0 ? '-' : $count . ' (' . formatReportPercent($count, $denominator, false) . '%)';
}

function reportMeaningfulValues($answer) {
    $values = [];
    foreach (answerValues($answer) as $value) {
        $text = trim((string)$value);
        if ($text !== '' && !isReportNoAnswerText($text)) {
            $values[] = $text;
        }
    }

    return $values;
}

function hasMeaningfulReportAnswer($answer) {
    return count(reportMeaningfulValues($answer)) > 0;
}

function isReportNoAnswerText($value) {
    $text = normalizeReportText($value);
    $text = trim($text, ". \t\n\r\0\x0B");

    return in_array($text, [
        '',
        '-',
        '0',
        'na',
        'n/a',
        'n.a',
        'n.d',
        'nd',
        'none',
        'no',
        'n/a.',
        'not applicable',
        'not disclosed',
        'no training',
        'no trainings',
        'no advance study',
        'no graduate study',
    ], true);
}

function firstMeaningfulReportText($record, $questionId, $fallback = '') {
    if ($questionId === null) {
        return $fallback;
    }

    $values = reportMeaningfulValues($record['answers'][$questionId] ?? null);
    return !empty($values) ? $values[0] : $fallback;
}

function hasMeaningfulRecordAnswer($record, $questionId) {
    return $questionId !== null && hasMeaningfulReportAnswer($record['answers'][$questionId] ?? null);
}

function countSeparatedReportItems($value) {
    $count = 0;
    foreach (reportMeaningfulValues($value) as $text) {
        $parts = preg_split('/[\r\n;]+/', $text);
        $validParts = 0;
        foreach ($parts as $part) {
            if (!isReportNoAnswerText($part)) {
                $validParts++;
            }
        }
        $count += max($validParts, 1);
    }

    return $count;
}

function countTrainingItemsForRecord($record, $questionIds) {
    $titleQuestionId = $questionIds['training_title'] ?? null;
    $count = $titleQuestionId !== null
        ? countSeparatedReportItems($record['answers'][$titleQuestionId] ?? null)
        : 0;

    if ($count > 0) {
        return $count;
    }

    return hasMeaningfulRecordAnswer($record, $questionIds['training_duration'] ?? null)
        || hasMeaningfulRecordAnswer($record, $questionIds['training_institution'] ?? null)
        ? 1
        : 0;
}

function hasTrainingOrAdvanceStudy($record, $questionIds) {
    if (countTrainingItemsForRecord($record, $questionIds) > 0) {
        return true;
    }

    foreach (['graduate_program', 'earned_units', 'graduate_college', 'advance_reason'] as $key) {
        if (hasMeaningfulRecordAnswer($record, $questionIds[$key] ?? null)) {
            return true;
        }
    }

    return false;
}

function collectTrainingDetailCounts($records, $program, $questionIds) {
    $details = [];

    foreach ($records as $record) {
        if ($record['program'] !== $program) {
            continue;
        }

        $institution = firstMeaningfulReportText($record, $questionIds['training_institution'] ?? null, 'N.D.');
        foreach (reportMeaningfulValues($record['answers'][$questionIds['training_title'] ?? ''] ?? null) as $title) {
            $parts = preg_split('/[\r\n;]+/', $title);
            foreach ($parts as $part) {
                addTrainingDetailCount($details, $part, $institution);
            }
        }

        $graduateProgram = firstMeaningfulReportText($record, $questionIds['graduate_program'] ?? null);
        if ($graduateProgram !== '') {
            $college = firstMeaningfulReportText($record, $questionIds['graduate_college'] ?? null, 'N.D.');
            addTrainingDetailCount($details, $graduateProgram, $college);
        }
    }

    uasort($details, function ($a, $b) {
        if ($a['count'] === $b['count']) {
            return strcasecmp($a['title'], $b['title']);
        }

        return $b['count'] <=> $a['count'];
    });

    return array_values($details);
}

function addTrainingDetailCount(&$details, $title, $institution) {
    $title = trim((string)$title);
    $institution = trim((string)$institution);
    if (isReportNoAnswerText($title)) {
        return;
    }
    if (isReportNoAnswerText($institution)) {
        $institution = 'N.D.';
    }

    $key = normalizeReportText($title) . '|' . normalizeReportText($institution);
    if (!isset($details[$key])) {
        $details[$key] = [
            'title' => $title,
            'institution' => $institution,
            'count' => 0,
        ];
    }

    $details[$key]['count']++;
}

function reportAnswerContainsAny($answer, $needles) {
    foreach (reportMeaningfulValues($answer) as $value) {
        $text = normalizeReportText($value);
        foreach ($needles as $needle) {
            $needleText = normalizeReportText($needle);
            if ($needleText !== '' && strpos($text, $needleText) !== false) {
                return true;
            }
        }
    }

    return false;
}

function isBleptTaker($record, $questionIds) {
    $needles = ['Licensure Examination for Teachers', 'BLEPT', 'LET'];
    return reportAnswerContainsAny($record['answers'][$questionIds['exam_name'] ?? ''] ?? null, $needles)
        || reportAnswerContainsAny($record['answers'][$questionIds['exam_passed'] ?? ''] ?? null, $needles);
}

function isBleptPasser($record, $questionIds) {
    $needles = ['Licensure Examination for Teachers', 'BLEPT', 'LET'];
    if (reportAnswerContainsAny($record['answers'][$questionIds['exam_passed'] ?? ''] ?? null, $needles)) {
        return true;
    }

    return isBleptTaker($record, $questionIds) && getNumericRating($record['answers'][$questionIds['exam_rating'] ?? ''] ?? null) >= 75;
}

function getNumericRating($answer) {
    foreach (reportMeaningfulValues($answer) as $value) {
        if (preg_match('/\d+(?:\.\d+)?/', $value, $matches)) {
            return (float)$matches[0];
        }
    }

    return 0;
}

function countAdvanceStudyReasonSelections($records, $program, $questionIds) {
    $questionId = $questionIds['advance_reason'] ?? null;
    if ($questionId === null) {
        return 0;
    }

    $categories = getAdvanceStudyReasonCategories();
    $total = 0;
    foreach ($records as $record) {
        if ($record['program'] !== $program || !hasTrainingOrAdvanceStudy($record, $questionIds)) {
            continue;
        }

        foreach (answerValues($record['answers'][$questionId] ?? null) as $value) {
            foreach ($categories as $category) {
                if (valueMatchesCategory($value, $category)) {
                    $total++;
                    break;
                }
            }
        }
    }

    return $total;
}

function getYesNoCategories() {
    return [
        makeCategory('YES', ['yes', 'yes, directly related']),
        makeCategory('NO', ['no', 'not related', 'no (proceed to question 35)', 'no (please proceed to question 27 and 28)']),
    ];
}

function getPursueDegreeCategories() {
    return [
        makeCategory('Prospect of Career Advancement', ['career advancement', 'prospect for career advancement']),
        makeCategory('Influence of Parents or Relatives', ['influence of parents', 'parents/relatives']),
        makeCategory('Affordable for the Family', ['affordable for family', 'affordable for the family']),
        makeCategory('Availability of Course Offering in NC', ['availability of the course', 'availability of course']),
        makeCategory('Prospect of Immediate Employment', ['prospect for immediate employment']),
        makeCategory('Good grades in High School', ['good grades in high school']),
        makeCategory('Opportunity of Employment Abroad', ['opportunity for employment abroad']),
        makeCategory('High Grades in the course or subject related to the course', ['high grades in the course', 'high grades in the course/subject']),
        makeCategory('Passion for the Profession', ['passion for the profession', 'strong passion for the field', 'strong passion for the profession']),
        makeCategory('Status or Prestige of the Profession', ['status/prestige', 'status or prestige']),
        makeCategory('Prospect of Attractive Compensation', ['attractive compensation']),
        makeCategory('No other choice or no better idea', ['no particular choice', 'no better idea']),
        makeCategory('Peer Influence', ['peer influence']),
        makeCategory('Inspired by a Role Model', ['inspired by a role model']),
    ];
}

function getHonorCategories() {
    return makeCategories(['Academic Excellence', 'Outstanding Student', "Dean's Lister", 'Best in OJT', 'Best in Thesis', 'Other Awards']);
}

function getEmploymentStatusCategories() {
    return [
        makeCategory('Contractual', ['contractual']),
        makeCategory('Regular or Permanent', ['regular/permanent', 'regular', 'permanent']),
        makeCategory('Temporary', ['temporary']),
        makeCategory('Casual', ['casual']),
        makeCategory('Self-employed', ['self-employed', 'self employed']),
    ];
}

function getOccupationCategories() {
    return [
        makeCategory('Government Service', ['government service']),
        makeCategory('Technical & Associate Professional', ['technical', 'associate professional', 'software developer', 'web developer', 'teacher']),
        makeCategory('Service Workers', ['service worker', 'front desk', 'hotel']),
        makeCategory('Special Occupation', ['special occupation']),
        makeCategory('Clerks', ['clerk', 'clerical']),
        makeCategory('Trade and Related Works', ['trade']),
        makeCategory('Laborers and Unskilled Workers', ['laborer', 'unskilled']),
        makeCategory('Plant Machine Operators', ['machine operator']),
        makeCategory('Self-Employed', ['self-employed', 'self employed']),
        makeCategory('Others', ['other', 'others', 'n/a']),
    ];
}

function getLineBusinessCategories() {
    return [
        makeCategory('Education', ['education']),
        makeCategory('Financial Intermediation', ['financial intermediation', 'finance']),
        makeCategory('Transport and Storage', ['transport', 'storage']),
        makeCategory('Wholesale and Retail', ['wholesale', 'retail']),
        makeCategory('Other Community-related Works', ['other community']),
        makeCategory('Health and Social Works', ['health', 'social work']),
        makeCategory('Real Estate', ['real estate']),
        makeCategory('Construction', ['construction']),
        makeCategory('Manufacturing', ['manufacturing']),
        makeCategory('IT', ['information technology', 'it/technology']),
        makeCategory('Public Administration', ['public administration']),
        makeCategory('BPO', ['bpo']),
        makeCategory('Hotel and Restaurant', ['hotel', 'restaurant', 'hospitality']),
        makeCategory('Agriculture', ['agriculture']),
        makeCategory('Utilities (Electricity and Water Supply)', ['electricity', 'water supply', 'utilities']),
        makeCategory('Others', ['others', 'other', 'n/a']),
    ];
}

function getJobLevelCategories() {
    return [
        makeCategory('Professional, Technical, or Supervisory', ['professional', 'technical', 'supervisory']),
        makeCategory('Managerial/Executive', ['managerial', 'executive']),
        makeCategory('Rank and Clerical', ['rank and file', 'rank or clerical', 'clerical']),
        makeCategory('Self-Employed', ['self-employed', 'self employed']),
    ];
}

function getReasonRelationCategories() {
    return [
        makeCategory('Salaries and Benefits', ['salary', 'salaries and benefits']),
        makeCategory('Career Challenge', ['career challenge', 'career advancement', 'career growth']),
        makeCategory('Related to Special Skill', ['related to special skill', 'related to special skills']),
        makeCategory('Related to Course/Program of Study', ['related to course', 'course/program']),
        makeCategory('Proximity to residence', ['proximity to residence']),
        makeCategory('Family Influence', ['family influence']),
    ];
}

function getAdvanceStudyReasonCategories() {
    return [
        makeCategory('For Professional Development', ['for professional development', 'professional development', 'professional growth']),
        makeCategory('For Promotion', ['for promotion', 'promotion', 'career advancement']),
    ];
}

function getDurationCategories($includeMoreThanFourYears) {
    $categories = [
        makeCategory('Less than a month', ['less than a month', 'less than 1 month']),
        makeCategory('1 - 6 months', ['1-6 months', '1 to 6 months', '1 - 6 months']),
        makeCategory('7 - 11 months', ['7-11 months', '7 - 11 months']),
        makeCategory('1 - less than 2 years', ['1 year to less than 2 years', '1 - less than 2 years']),
        makeCategory('2 - less than 3 years', ['2 years to less than 3 years', '2 - less than 3 years']),
    ];
    if ($includeMoreThanFourYears) {
        $categories[] = makeCategory('3 - less than 4 years', ['3 - less than 4 years']);
        $categories[] = makeCategory('More than 4 years', ['more than 4 years', 'more than 3 years']);
    } else {
        $categories[] = makeCategory('More than 3 years', ['more than 3 years', 'more than 4 years']);
    }

    return $categories;
}

function getFindJobCategories() {
    return [
        makeCategory('As walk-in Applicant', ['walk-in applicant']),
        makeCategory('Information from a friend', ['information from friends', 'information from a friend']),
        makeCategory('Recommended by someone', ['recommended by someone']),
        makeCategory('Response to an Advertisement', ['response to job advertisement', 'response to an advertisement']),
        makeCategory('(School) PESO/Placement Office', ['placement officer', 'peso']),
        makeCategory('Family Business', ['family business']),
        makeCategory('Job Fair', ['job fair']),
    ];
}

function getSalaryCategories() {
    return [
        makeCategory('Below Php 5,000', ['below php5,000', 'below php 5,000', 'below']),
        makeCategory('Php 5,000 - less than Php 10,000', ['5,000.00 to less than', '5,000 - php10,000', '5,000 - 10,000']),
        makeCategory('Php 10,000 - less than Php 15,000', ['10,000.00 to less than', '10,000 - php15,000', '10,000 - 15,000']),
        makeCategory('Php 15,000 - less than Php 20,000', ['15,000.00 to less than', '15,000 - php20,000', '15,000 - 20,000']),
        makeCategory('Php 20,000 - less than Php 25,000', ['20,000.00 to less than', '20,000 - php25,000', '20,000 - 25,000']),
        makeCategory('Php 25,000 and above', ['25,000 and above']),
    ];
}

function getCompetencyCategories() {
    return [
        makeCategory('Communication Skills', ['communication skills']),
        makeCategory('Human Relation Skills', ['human relation', 'human relations']),
        makeCategory('Problem-Solving Skills', ['problem-solving', 'problem solving']),
        makeCategory('Critical Thinking Skills', ['critical thinking']),
        makeCategory('Entrepreneurial Skills', ['entrepreneurial']),
        makeCategory('Information Technology Skills', ['information technology']),
    ];
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
