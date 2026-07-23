<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/audit_trail.php';

$database = new Database();
$db = $database->getConnection();
$auditUser = gradtrack_audit_current_admin_context();

class ReportValidationException extends Exception
{
    private $statusCode;

    public function __construct(string $message, int $statusCode = 400)
    {
        parent::__construct($message);
        $this->statusCode = $statusCode;
    }

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }
}

function getSelectedSurveyId(PDO $db): ?int
{
    $surveyId = null;
    if (array_key_exists('survey_id', $_GET)) {
        $surveyId = $_GET['survey_id'];
    } elseif (array_key_exists('surveyId', $_GET)) {
        $surveyId = $_GET['surveyId'];
    }

    if ($surveyId !== null) {
        if (!is_scalar($surveyId)) {
            throw new ReportValidationException('Invalid surveyId parameter.');
        }

        $surveyIdText = trim((string)$surveyId);
        if ($surveyIdText === '' || strtolower($surveyIdText) === 'none' || strtolower($surveyIdText) === 'all') {
            return null;
        }

        if (!ctype_digit($surveyIdText) || (int)$surveyIdText <= 0) {
            throw new ReportValidationException('Invalid surveyId parameter.');
        }

        return (int)$surveyIdText;
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

function getOptionalQueryValue(array $names): ?string
{
    foreach ($names as $name) {
        if (!array_key_exists($name, $_GET)) {
            continue;
        }

        $value = $_GET[$name];
        if (!is_scalar($value)) {
            throw new ReportValidationException("Invalid {$name} parameter.");
        }

        $normalized = trim((string)$value);
        if ($normalized === '' || strtolower($normalized) === 'all') {
            return null;
        }

        return $normalized;
    }

    return null;
}

function getProgramById(PDO $db, int $programId): ?array
{
    $stmt = $db->prepare("SELECT id, code, name FROM programs WHERE id = :id LIMIT 1");
    $stmt->bindValue(':id', $programId, PDO::PARAM_INT);
    $stmt->execute();
    $program = $stmt->fetch(PDO::FETCH_ASSOC);

    return $program ?: null;
}

function getOverviewFilters(PDO $db, ?array $allowedProgramCodes): array
{
    $employmentStatus = getOptionalQueryValue(['employmentStatus', 'employment_status']);
    if ($employmentStatus !== null) {
        $employmentStatus = strtolower(str_replace([' ', '-'], '_', $employmentStatus));
        if (!in_array($employmentStatus, ['employed', 'unemployed'], true)) {
            throw new ReportValidationException('Invalid employmentStatus parameter. Use employed or unemployed.');
        }
    }

    $programAlignment = getOptionalQueryValue(['programAlignment', 'program_alignment']);
    if ($programAlignment !== null) {
        $programAlignment = strtolower(str_replace([' ', '-'], '_', $programAlignment));
        if ($programAlignment === 'notaligned') {
            $programAlignment = 'not_aligned';
        }
        if (!in_array($programAlignment, ['aligned', 'not_aligned'], true)) {
            throw new ReportValidationException('Invalid programAlignment parameter. Use aligned or not_aligned.');
        }
    }

    $graduationYear = getOptionalQueryValue(['graduationYear', 'graduation_year']);
    if ($graduationYear !== null && preg_match('/^(19|20)\d{2}$/', $graduationYear) !== 1) {
        throw new ReportValidationException('Invalid graduationYear parameter. Use a four-digit year.');
    }

    $programIdText = getOptionalQueryValue(['programId', 'program_id', 'courseId', 'course_id']);
    $programId = null;
    $program = null;
    if ($programIdText !== null) {
        if (!ctype_digit($programIdText) || (int)$programIdText <= 0) {
            throw new ReportValidationException('Invalid programId parameter.');
        }

        $programId = (int)$programIdText;
        $program = getProgramById($db, $programId);
        if ($program === null) {
            throw new ReportValidationException('Selected program does not exist.');
        }

        $programCode = strtoupper((string)($program['code'] ?? ''));
        if (is_array($allowedProgramCodes) && !in_array($programCode, $allowedProgramCodes, true)) {
            throw new ReportValidationException('Unauthorized program filter.', 403);
        }
    }

    return [
        'employment_status' => $employmentStatus,
        'program_alignment' => $programAlignment,
        'graduation_year' => $graduationYear,
        'program_id' => $programId,
        'program' => $program,
    ];
}

function overviewFiltersHaveValues(array $filters): bool
{
    return ($filters['employment_status'] ?? null) !== null
        || ($filters['program_alignment'] ?? null) !== null
        || ($filters['graduation_year'] ?? null) !== null
        || ($filters['program_id'] ?? null) !== null;
}

function appendAllowedProgramCodeFilter(array &$whereParts, array &$bindings, ?array $allowedProgramCodes, string $alias = 'p'): void
{
    if (!is_array($allowedProgramCodes) || empty($allowedProgramCodes)) {
        return;
    }

    $placeholders = [];
    foreach ($allowedProgramCodes as $index => $code) {
        $placeholder = ":allowed_program_{$index}";
        $placeholders[] = $placeholder;
        $bindings[$placeholder] = ['value' => $code, 'type' => PDO::PARAM_STR];
    }

    $whereParts[] = "{$alias}.code IN (" . implode(', ', $placeholders) . ")";
}

function getOverviewFilterOptions(PDO $db, ?int $surveyId, ?array $allowedProgramCodes): array
{
    $years = [];
    if ($surveyId !== null) {
        $baseWhere = ['sr.survey_id = :survey_id'];
        $baseBindings = [
            ':survey_id' => ['value' => $surveyId, 'type' => PDO::PARAM_INT],
        ];
        appendAllowedProgramCodeFilter($baseWhere, $baseBindings, $allowedProgramCodes);

        $yearWhere = $baseWhere;
        $yearWhere[] = 'g.year_graduated IS NOT NULL';
        $yearSql = "
            SELECT DISTINCT g.year_graduated
            FROM survey_responses sr
            LEFT JOIN graduates g ON g.id = sr.graduate_id
            LEFT JOIN programs p ON p.id = g.program_id
            WHERE " . implode(' AND ', $yearWhere) . "
            ORDER BY g.year_graduated DESC
        ";
        $yearStmt = $db->prepare($yearSql);
        foreach ($baseBindings as $placeholder => $binding) {
            $yearStmt->bindValue($placeholder, $binding['value'], $binding['type']);
        }
        $yearStmt->execute();
        $years = array_map(static function ($row) {
            return (string)$row['year_graduated'];
        }, $yearStmt->fetchAll(PDO::FETCH_ASSOC));
    }

    $programWhere = ['p.id IS NOT NULL'];
    $programBindings = [];
    appendAllowedProgramCodeFilter($programWhere, $programBindings, $allowedProgramCodes);
    $programSql = "
        SELECT p.id, p.code, p.name
        FROM programs p
        WHERE " . implode(' AND ', $programWhere) . "
        ORDER BY p.code ASC
    ";
    $programStmt = $db->prepare($programSql);
    foreach ($programBindings as $placeholder => $binding) {
        $programStmt->bindValue($placeholder, $binding['value'], $binding['type']);
    }
    $programStmt->execute();
    $programs = array_map(static function ($row) {
        return [
            'id' => (int)$row['id'],
            'code' => (string)$row['code'],
            'name' => (string)$row['name'],
        ];
    }, $programStmt->fetchAll(PDO::FETCH_ASSOC));

    return ['years' => $years, 'programs' => $programs];
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

function getSurveyResponses(PDO $db, ?int $surveyId, array $overviewFilters = []): array
{
    if ($surveyId === null) {
        return [];
    }

    $whereParts = ['sr.survey_id = :survey_id'];
    $bindings = [
        ':survey_id' => ['value' => $surveyId, 'type' => PDO::PARAM_INT],
    ];

    if (($overviewFilters['graduation_year'] ?? null) !== null) {
        $whereParts[] = 'g.year_graduated = :graduation_year';
        $bindings[':graduation_year'] = ['value' => $overviewFilters['graduation_year'], 'type' => PDO::PARAM_STR];
    }

    if (($overviewFilters['program_id'] ?? null) !== null) {
        $whereParts[] = 'g.program_id = :program_id';
        $bindings[':program_id'] = ['value' => (int)$overviewFilters['program_id'], 'type' => PDO::PARAM_INT];
    }

    $stmt = $db->prepare("
        SELECT
            sr.id AS response_id,
            sr.responses,
            g.year_graduated,
            g.program_id,
            p.code AS program_code,
            p.name AS program_name
        FROM survey_responses sr
        LEFT JOIN graduates g ON g.id = sr.graduate_id
        LEFT JOIN programs p ON p.id = g.program_id
        WHERE " . implode(' AND ', $whereParts) . "
    ");
    foreach ($bindings as $placeholder => $binding) {
        $stmt->bindValue($placeholder, $binding['value'], $binding['type']);
    }
    $stmt->execute();

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function getReportResponseDetails(array $response, array $questionMap): array
{
    $rowProgramCode = strtoupper((string)($response['program_code'] ?? ''));
    $degreeProgram = trim((string)($response['program_name'] ?? ''));
    $yearGraduated = isset($response['year_graduated']) && $response['year_graduated'] !== null
        ? (string)$response['year_graduated']
        : '';

    $isEmployed = false;
    $isUnemployed = false;
    $jobRelated = '';
    $workLocation = '';
    $salaryRange = null;

    $data = json_decode((string)($response['responses'] ?? ''), true);
    if (is_array($data)) {
        foreach ($data as $questionId => $answer) {
            $questionText = isset($questionMap[$questionId]) ? $questionMap[$questionId] : '';

            if (strpos($questionText, 'degree program') !== false) {
                if (is_string($answer) && !empty($answer)) {
                    $candidateProgram = trim($answer);
                    if ($candidateProgram !== '' && !isYearLikeAnswer($candidateProgram)) {
                        $degreeProgram = $candidateProgram;
                    }
                }
            }

            if (strpos($questionText, 'year graduated') !== false) {
                if (is_string($answer) && !empty($answer)) {
                    $yearGraduated = $answer;
                }
            }

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

            if (strpos($questionText, 'place of work') !== false || strpos($questionText, 'major line of business') !== false) {
                $candidateLocation = answerToText($answer);
                if (!answerIndicatesWorkLocation($candidateLocation) && strpos($questionText, 'place of work') !== false) {
                    $candidateLocation = getNeighborAnswerText($data, $questionId, -1);
                }

                if (answerIndicatesWorkLocation($candidateLocation)) {
                    $workLocation = $candidateLocation;
                }
            }

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
    }

    $isAligned = $isEmployed && (strpos($jobRelated, 'yes') !== false || strpos($jobRelated, 'directly related') !== false);
    $alignmentBucket = null;
    if ($isEmployed) {
        if ($isAligned) {
            $alignmentBucket = 'aligned';
        } elseif (strpos($jobRelated, 'partially') !== false) {
            $alignmentBucket = 'partially_aligned';
        } elseif ($jobRelated !== '') {
            $alignmentBucket = 'not_aligned';
        }
    }

    return [
        'row_program_code' => $rowProgramCode,
        'program_id' => isset($response['program_id']) && $response['program_id'] !== null ? (int)$response['program_id'] : null,
        'degree_program' => $degreeProgram,
        'year_graduated' => $yearGraduated,
        'is_employed' => $isEmployed,
        'is_unemployed' => $isUnemployed,
        'work_location' => $workLocation,
        'job_related' => $jobRelated,
        'is_aligned' => $isAligned,
        'alignment_bucket' => $alignmentBucket,
        'salary_range' => $salaryRange,
    ];
}

function responseMatchesOverviewFilters(array $details, array $filters): bool
{
    $employmentStatus = $filters['employment_status'] ?? null;
    if ($employmentStatus === 'employed' && empty($details['is_employed'])) {
        return false;
    }
    if ($employmentStatus === 'unemployed' && empty($details['is_unemployed'])) {
        return false;
    }

    $programAlignment = $filters['program_alignment'] ?? null;
    if ($programAlignment === 'aligned' && empty($details['is_aligned'])) {
        return false;
    }
    if ($programAlignment === 'not_aligned' && (empty($details['is_employed']) || !empty($details['is_aligned']))) {
        return false;
    }

    return true;
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

    $overviewFilters = getOverviewFilters($db, $allowedProgramCodes);

    if ($reportType === 'overview_filter_options') {
        echo json_encode([
            "success" => true,
            "data" => getOverviewFilterOptions($db, $selectedSurveyId, $allowedProgramCodes),
        ]);
        exit;
    }

    $auditAction = strtolower(trim((string)($_GET['audit_action'] ?? 'generate')));
    $reportAuditAction = strpos($auditAction, 'export') !== false ? 'Export' : 'Generate';
    $reportAuditVerbPast = $reportAuditAction === 'Export' ? 'Exported' : 'Generated';
    $auditDepartment = $filterDepartment ?? $auditUser['department'];
    $overviewFilterAuditText = overviewFiltersHaveValues($overviewFilters)
        ? " with overview filters: employability=" . ($overviewFilters['employment_status'] ?? 'all') .
            ", alignment=" . ($overviewFilters['program_alignment'] ?? 'all') .
            ", graduation_year=" . ($overviewFilters['graduation_year'] ?? 'all') .
            ", program_id=" . ($overviewFilters['program_id'] ?? 'all')
        : '';

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
            $overviewFilterAuditText .
            '.'
    );

    switch ($reportType) {
        case 'overview':
            // Get the selected survey questions to map responses
            $questionMap = getQuestionMap($db, $selectedSurveyId);
            
            // Parse survey responses with canonical graduate year/program context
            $surveyResponses = getSurveyResponses($db, $selectedSurveyId, $overviewFilters);
            
            $totalResponses = 0;
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

                $details = getReportResponseDetails($response, $questionMap);
                if (!responseMatchesOverviewFilters($details, $overviewFilters)) {
                    continue;
                }

                $totalResponses++;
                $isEmployed = (bool)$details['is_employed'];
                $isUnemployed = (bool)$details['is_unemployed'];
                $workLocation = (string)$details['work_location'];

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
                if (!empty($details['is_aligned'])) {
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
            $questionMap = getQuestionMap($db, $selectedSurveyId);
            
            $surveyResponses = getSurveyResponses($db, $selectedSurveyId, $overviewFilters);
            
            $programData = [];
            
            foreach ($surveyResponses as $response) {
                $rowProgramCode = strtoupper((string)($response['program_code'] ?? ''));
                if ($filterDepartment !== null && $rowProgramCode !== $filterDepartment) {
                    continue;
                }
                if (is_array($allowedProgramCodes) && ($rowProgramCode === '' || !in_array($rowProgramCode, $allowedProgramCodes, true))) {
                    continue;
                }

                $details = getReportResponseDetails($response, $questionMap);
                if (!responseMatchesOverviewFilters($details, $overviewFilters)) {
                    continue;
                }

                $degreeProgram = (string)$details['degree_program'];
                $yearGraduated = (string)$details['year_graduated'];
                $isEmployed = (bool)$details['is_employed'];
                $jobRelated = (string)$details['job_related'];
                
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
            
            $surveyResponses = getSurveyResponses($db, $selectedSurveyId, $overviewFilters);
            
            $yearData = [];
            
            foreach ($surveyResponses as $response) {
                $rowProgramCode = strtoupper((string)($response['program_code'] ?? ''));
                if ($filterDepartment !== null && $rowProgramCode !== $filterDepartment) {
                    continue;
                }
                if (is_array($allowedProgramCodes) && ($rowProgramCode === '' || !in_array($rowProgramCode, $allowedProgramCodes, true))) {
                    continue;
                }

                $details = getReportResponseDetails($response, $questionMap);
                if (!responseMatchesOverviewFilters($details, $overviewFilters)) {
                    continue;
                }

                $yearGraduated = (string)$details['year_graduated'];
                $isEmployed = (bool)$details['is_employed'];
                $jobRelated = (string)$details['job_related'];
                
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
            
            $surveyResponses = getSurveyResponses($db, $selectedSurveyId, $overviewFilters);
            
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

                $details = getReportResponseDetails($response, $questionMap);
                if (!responseMatchesOverviewFilters($details, $overviewFilters)) {
                    continue;
                }

                $isEmployed = (bool)$details['is_employed'];
                $isUnemployed = (bool)$details['is_unemployed'];
                $workLocation = (string)$details['work_location'];
                $yearGraduated = (string)$details['year_graduated'];
                
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
            
            $surveyResponses = getSurveyResponses($db, $selectedSurveyId, $overviewFilters);
            
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

                $details = getReportResponseDetails($response, $questionMap);
                if (!responseMatchesOverviewFilters($details, $overviewFilters)) {
                    continue;
                }

                $yearGraduated = (string)$details['year_graduated'];
                $salaryRange = $details['salary_range'];
                
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
} catch (ReportValidationException $e) {
    http_response_code($e->getStatusCode());
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
