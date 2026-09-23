<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/audit_trail.php';
require_once __DIR__ . '/../config/survey_response_analytics.php';
require_once __DIR__ . '/../config/admin_auth.php';
require_once __DIR__ . '/../config/graduation_years.php';
require_once __DIR__ . '/../config/dean_program_scope.php';

$database = new Database();
$db = $database->getConnection();

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
        if (in_array(strtolower($surveyIdText), ['', 'none', 'all', 'null', 'undefined'], true)) {
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
        WHERE status = 'active' AND archived_at IS NULL
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
        if (in_array(strtolower($normalized), ['', 'all', 'null', 'undefined'], true)) {
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

function getReportGraduationYearCoverage(PDO $db, ?int $surveyId): ?array
{
    if ($surveyId === null) {
        return null;
    }

    $coverage = gradtrack_get_survey_graduation_year_coverage($db, $surveyId);
    if ($coverage['configured']) {
        return $coverage['years'];
    }

    if (($coverage['survey']['status'] ?? '') === 'active' && empty($coverage['survey']['archived_at'])) {
        throw new ReportValidationException(
            'Graduation year coverage has not been configured for the active survey.',
            422
        );
    }

    // Legacy historical surveys without coverage options remain reportable.
    return null;
}

function getOverviewFilters(PDO $db, ?array $allowedProgramCodes, ?int $surveyId = null): array
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
    $coverageYears = getReportGraduationYearCoverage($db, $surveyId);
    if ($graduationYear !== null && is_array($coverageYears) && !in_array((int) $graduationYear, $coverageYears, true)) {
        throw new ReportValidationException('The selected graduation year is not included in this survey.', 422);
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

function getOverviewFilterOptions(
    PDO $db,
    ?int $surveyId,
    ?array $allowedProgramCodes,
    bool $useExistingScopedYears = false
): array
{
    $years = [];
    if ($surveyId !== null) {
        $coverageYears = getReportGraduationYearCoverage($db, $surveyId);
        if ($useExistingScopedYears && is_array($allowedProgramCodes)) {
            $yearOptions = ['program_codes' => $allowedProgramCodes];
            if (is_array($coverageYears)) {
                $yearOptions['allowed_graduation_years'] = $coverageYears;
            }
            $years = array_map(
                static fn (array $row): string => (string)$row['year'],
                gradtrack_analytics_fetch_year_dimensions($db, $yearOptions)
            );
        } elseif (is_array($coverageYears)) {
            $years = array_map('strval', $coverageYears);
        } else {
            $questions = getSurveyQuestions($db, $surveyId);
            $responses = getSurveyResponses($db, $surveyId);
            $yearValues = [];
            foreach ($responses as $response) {
                $rowProgramCode = strtoupper(trim((string)($response['program_code'] ?? '')));
                if (is_array($allowedProgramCodes)
                    && ($rowProgramCode === '' || !in_array($rowProgramCode, $allowedProgramCodes, true))) {
                    continue;
                }

                $details = getReportResponseDetails($response, $questions);
                $yearValues[] = $details['year_graduated'] ?? null;
            }
            $years = array_map('strval', gradtrack_normalize_graduation_years($yearValues));
        }
    }

    $programOptions = [
        'program_codes' => $allowedProgramCodes,
    ];
    $coverageYears = getReportGraduationYearCoverage($db, $surveyId);
    if (is_array($coverageYears)) {
        $programOptions['allowed_graduation_years'] = $coverageYears;
    }
    $programDimensions = gradtrack_analytics_fetch_program_dimensions($db, $programOptions);
    $programs = array_map(static function ($row) {
        return [
            'id' => (int)$row['program_id'],
            'code' => (string)$row['code'],
            'name' => (string)$row['name'],
        ];
    }, $programDimensions);

    return ['years' => $years, 'programs' => $programs];
}

function isYearLikeAnswer(string $value): bool
{
    $trimmed = trim($value);
    return preg_match('/^(19|20)\d{2}$/', $trimmed) === 1;
}

function getSurveyQuestions(PDO $db, ?int $surveyId): array
{
    if ($surveyId === null) {
        return [];
    }

    $stmt = $db->prepare("
        SELECT id, section_id, question_key, analytics_key, section, question_text,
               question_type, options, is_required, sort_order, is_active
        FROM survey_questions
        WHERE survey_id = :survey_id AND is_active = 1
        ORDER BY sort_order ASC, id ASC
    ");
    $stmt->bindValue(':survey_id', $surveyId, PDO::PARAM_INT);
    $stmt->execute();

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function getSurveyResponses(PDO $db, ?int $surveyId, array $overviewFilters = []): array
{
    if ($surveyId === null) {
        return [];
    }

    $options = [
        'program_id' => $overviewFilters['program_id'] ?? null,
        'program_codes' => $overviewFilters['program_codes'] ?? null,
        'graduation_year' => $overviewFilters['graduation_year'] ?? null,
    ];
    $coverageYears = getReportGraduationYearCoverage($db, $surveyId);
    if (is_array($coverageYears)) {
        $options['allowed_graduation_years'] = $coverageYears;
    }
    return gradtrack_analytics_fetch_valid_responses($db, $surveyId, $options);
}

function getReportSurveyItems(PDO $db, ?array $allowedProgramCodes): array
{
    $surveys = $db->query(
        "SELECT id, template_id, version_number, based_on_survey_id, title, description, status, archived_at
         FROM surveys
         ORDER BY created_at DESC, id DESC"
    )->fetchAll(PDO::FETCH_ASSOC);

    return array_map(static function (array $survey) use ($db, $allowedProgramCodes): array {
        $options = [];
        if (is_array($allowedProgramCodes)) {
            $options['program_codes'] = $allowedProgramCodes;
        }
        $coverage = gradtrack_get_survey_graduation_year_coverage($db, (int)$survey['id']);
        if ($coverage['configured']) {
            $options['allowed_graduation_years'] = $coverage['years'];
        }

        $survey['id'] = (int)$survey['id'];
        $survey['response_count'] = count(
            gradtrack_analytics_fetch_valid_responses($db, (int)$survey['id'], $options)
        );
        return $survey;
    }, $surveys);
}

function getReportResponseDetails(array $response, array $questions): array
{
    $rowProgramCode = strtoupper((string)($response['program_code'] ?? ''));
    $degreeProgram = trim((string)($response['program_name'] ?? ''));
    $canonicalYear = gradtrack_normalize_graduation_year($response['year_graduated'] ?? null);
    $yearGraduated = $canonicalYear !== null ? (string)$canonicalYear : '';

    $isEmployed = false;
    $isUnemployed = false;
    $jobRelated = '';
    $workLocation = '';
    $salaryRange = null;

    $answers = gradtrack_survey_response_answer_map($questions, $response);
    $programQuestionId = gradtrack_survey_question_id_by_analytics_key($questions, 'program');
    if ($rowProgramCode === '' && $programQuestionId !== null) {
        $candidateProgram = trim(answerToText($answers[$programQuestionId] ?? null));
        if ($candidateProgram !== '' && !isYearLikeAnswer($candidateProgram)) {
            $degreeProgram = $candidateProgram;
        }
    }
    $yearQuestionId = gradtrack_survey_question_id_by_analytics_key($questions, 'graduation_year');
    if ($canonicalYear === null && $yearQuestionId !== null) {
        $answerYear = gradtrack_normalize_graduation_year($answers[$yearQuestionId] ?? null);
        if ($answerYear !== null) $yearGraduated = (string)$answerYear;
    }
    $salaryQuestionId = gradtrack_survey_question_id_by_analytics_key($questions, 'salary_range');
    if ($salaryQuestionId !== null) {
        $salaryRange = mapSalaryAnswerToRange(answerToText($answers[$salaryQuestionId] ?? null));
    }

    $roles = gradtrack_analytics_question_roles($questions);
    $employmentStatus = gradtrack_analytics_first_classified_answer(
        $answers,
        $roles['employment'] ?? [],
        'gradtrack_analytics_classify_employment'
    );
    $alignmentBucket = $employmentStatus === 'employed'
        ? gradtrack_analytics_first_classified_answer(
            $answers,
            array_slice($roles['alignment'] ?? [], 0, 1),
            'gradtrack_analytics_classify_alignment'
        )
        : null;
    $canonicalWorkLocation = $employmentStatus === 'employed'
        ? gradtrack_analytics_first_classified_answer(
            $answers,
            array_slice($roles['work_location'] ?? [], 0, 1),
            'gradtrack_analytics_classify_work_location'
        )
        : null;
    $isEmployed = $employmentStatus === 'employed';
    $isUnemployed = $employmentStatus === 'unemployed';
    $isAligned = $alignmentBucket === 'aligned';
    $workLocation = $canonicalWorkLocation ?? '';
    $alignmentQuestionId = gradtrack_survey_question_id_by_analytics_key($questions, 'job_course_alignment');
    $jobRelated = $alignmentQuestionId !== null
        ? answerToText($answers[$alignmentQuestionId] ?? null)
        : '';

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
    $graduationYear = $filters['graduation_year'] ?? null;
    if ($graduationYear !== null && (string)($details['year_graduated'] ?? '') !== (string)$graduationYear) {
        return false;
    }

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
    if ($programAlignment === 'not_aligned'
        && !in_array($details['alignment_bucket'] ?? null, ['partially_aligned', 'not_aligned'], true)) {
        return false;
    }

    return true;
}

function getSurveyResponseCount(PDO $db, ?int $surveyId): int
{
    if ($surveyId === null) {
        return 0;
    }

    return count(gradtrack_analytics_fetch_valid_responses($db, $surveyId));
}

if (!defined('GRADTRACK_REPORTS_INDEX_NO_RUN')) {
try {
    $reportRoles = array_merge(['admin'], gradtrack_dean_roles());
    $authUser = gradtrack_require_admin_auth($db, $reportRoles, 'Only authorized report accounts can access reports and analytics');
    $auditUser = gradtrack_admin_audit_context($authUser);
    $reportType = isset($_GET['type']) ? $_GET['type'] : 'overview';
    $filterYear = getOptionalQueryValue(['year']);
    $filterDepartmentParam = getOptionalQueryValue(['department']);
    $filterDepartment = $filterDepartmentParam !== null ? strtoupper(trim($filterDepartmentParam)) : null;
    $selectedSurveyId = getSelectedSurveyId($db);

    $deanScope = gradtrack_dean_program_scope($db, $authUser);
    $allowedProgramCodes = $deanScope['program_codes'] ?? null;

    if ($filterDepartment !== null && is_array($allowedProgramCodes) && !in_array($filterDepartment, $allowedProgramCodes, true)) {
        http_response_code(403);
        echo json_encode(["success" => false, "error" => "Unauthorized department filter"]);
        exit;
    }

    $coverageYears = getReportGraduationYearCoverage($db, $selectedSurveyId);
    if ($filterYear !== null) {
        $normalizedFilterYear = gradtrack_normalize_graduation_year($filterYear);
        if ($normalizedFilterYear === null) {
            throw new ReportValidationException('Invalid year parameter. Use a four-digit year.');
        }
        if (is_array($coverageYears) && !in_array($normalizedFilterYear, $coverageYears, true)) {
            throw new ReportValidationException('The selected graduation year is not included in this survey.', 422);
        }
        $filterYear = (string) $normalizedFilterYear;
    }

    $overviewFilters = getOverviewFilters($db, $allowedProgramCodes, $selectedSurveyId);
    if ($filterYear !== null) {
        if (($overviewFilters['graduation_year'] ?? null) !== null
            && (string)$overviewFilters['graduation_year'] !== (string)$filterYear) {
            throw new ReportValidationException('Conflicting graduation year filters were supplied.');
        }
        $overviewFilters['graduation_year'] = $filterYear;
    }

    if ($reportType === 'report_context') {
        echo json_encode([
            'success' => true,
            'data' => [
                'scope' => $deanScope ?? [
                    'restricted' => false,
                    'display_name' => 'All authorized programs',
                    'program_codes' => null,
                    'programs' => [],
                ],
                'surveys' => getReportSurveyItems($db, $allowedProgramCodes),
                'filter_options' => getOverviewFilterOptions(
                    $db,
                    $selectedSurveyId,
                    $allowedProgramCodes,
                    $deanScope !== null
                ),
            ],
        ]);
        exit;
    }

    if ($reportType === 'overview_filter_options') {
        echo json_encode([
            "success" => true,
            "data" => getOverviewFilterOptions($db, $selectedSurveyId, $allowedProgramCodes, $deanScope !== null),
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
        "{$reportAuditVerbPast} graduate tracer report.",
        $selectedSurveyId,
        null,
        null,
        [
            'report_type' => $reportType,
            'survey_id' => $selectedSurveyId,
            'year' => $filterYear,
            'department' => $filterDepartment,
            'overview_filters' => $overviewFilters,
        ]
    );

    switch ($reportType) {
        case 'overview':
            // Get the selected survey questions to map current and historical responses.
            $questions = getSurveyQuestions($db, $selectedSurveyId);
            
            // Parse survey responses with canonical graduate year/program context
            $surveyResponses = getSurveyResponses($db, $selectedSurveyId, array_merge($overviewFilters, [
                'program_codes' => $filterDepartment !== null ? [$filterDepartment] : $allowedProgramCodes,
            ]));
            $recordFilters = [
                'program_id' => $overviewFilters['program_id'] ?? null,
                'program_codes' => $filterDepartment !== null
                    ? [$filterDepartment]
                    : $allowedProgramCodes,
                'graduation_year' => $overviewFilters['graduation_year'] ?? null,
                'employment_status' => $overviewFilters['employment_status'] ?? null,
                'alignment_status' => $overviewFilters['program_alignment'] ?? null,
            ];
            $records = gradtrack_analytics_filter_records(
                gradtrack_analytics_build_records($surveyResponses, $questions),
                $recordFilters
            );
            $summary = gradtrack_analytics_summarize_records($records);

            echo json_encode(["success" => true, "data" => [
                "survey_id" => $selectedSurveyId,
                "total_graduates" => (int)$summary['response_count'],
                "total_employed" => (int)$summary['employed'],
                "total_unemployed" => (int)$summary['unemployed'],
                "total_employment_known" => (int)$summary['employment_total'],
                "total_employment_unknown" => (int)$summary['employment_unknown'],
                "total_employed_local" => (int)$summary['employed_local'],
                "total_employed_abroad" => (int)$summary['employed_abroad'],
                "total_aligned" => (int)$summary['aligned'],
                "total_partially_aligned" => (int)$summary['partially_aligned'],
                "total_explicit_not_aligned" => (int)$summary['explicit_not_aligned'],
                "total_not_aligned" => (int)$summary['not_aligned'],
                "total_alignment_known" => (int)$summary['alignment_total'],
                "total_survey_responses" => (int)$summary['response_count'],
                "employment_rate" => $summary['employment_rate'],
                "alignment_rate" => $summary['alignment_rate'],
                "field_availability" => [
                    'employment_status' => !empty(gradtrack_analytics_question_roles($questions)['employment']),
                    'job_course_alignment' => !empty(gradtrack_analytics_question_roles($questions)['alignment']),
                    'work_location' => !empty(gradtrack_analytics_question_roles($questions)['work_location']),
                ]
            ]]);
            break;

        case 'by_program':
            $questions = getSurveyQuestions($db, $selectedSurveyId);
            $surveyResponses = getSurveyResponses($db, $selectedSurveyId, array_merge($overviewFilters, [
                'program_codes' => $filterDepartment !== null ? [$filterDepartment] : $allowedProgramCodes,
                'graduation_year' => $filterYear ?? ($overviewFilters['graduation_year'] ?? null),
            ]));
            $records = gradtrack_analytics_filter_records(
                gradtrack_analytics_build_records($surveyResponses, $questions),
                [
                    'program_id' => $overviewFilters['program_id'] ?? null,
                    'program_codes' => $filterDepartment !== null ? [$filterDepartment] : $allowedProgramCodes,
                    'graduation_year' => $filterYear ?? ($overviewFilters['graduation_year'] ?? null),
                    'employment_status' => $overviewFilters['employment_status'] ?? null,
                    'alignment_status' => $overviewFilters['program_alignment'] ?? null,
                ]
            );
            $programData = array_map(static function (array $program): array {
                return [
                    'program_id' => $program['program_id'],
                    'code' => $program['code'],
                    'name' => $program['name'],
                    'total_graduates' => (int)$program['response_count'],
                    'employment_total' => (int)$program['employment_total'],
                    'employed' => (int)$program['employed'],
                    'unemployed' => (int)$program['unemployed'],
                    'employment_rate' => $program['employment_rate'],
                    'aligned' => (int)$program['aligned'],
                    'alignment_total' => (int)$program['alignment_total'],
                    'alignment_rate' => $program['alignment_rate'],
                    'partially_aligned' => (int)$program['partially_aligned'],
                    'not_aligned' => (int)$program['not_aligned'],
                    'explicit_not_aligned' => (int)$program['explicit_not_aligned'],
                    'avg_time_to_employment' => null,
                    'avg_salary' => null,
                ];
            }, gradtrack_analytics_group_by_program($records));

            echo json_encode(["success" => true, "data" => $programData]);
            break;

        case 'by_year':
            $questions = getSurveyQuestions($db, $selectedSurveyId);
            $surveyResponses = getSurveyResponses($db, $selectedSurveyId, array_merge($overviewFilters, [
                'program_codes' => $filterDepartment !== null ? [$filterDepartment] : $allowedProgramCodes,
                'graduation_year' => $filterYear ?? ($overviewFilters['graduation_year'] ?? null),
            ]));
            $records = gradtrack_analytics_filter_records(
                gradtrack_analytics_build_records($surveyResponses, $questions),
                [
                    'program_id' => $overviewFilters['program_id'] ?? null,
                    'program_codes' => $filterDepartment !== null ? [$filterDepartment] : $allowedProgramCodes,
                    'graduation_year' => $filterYear ?? ($overviewFilters['graduation_year'] ?? null),
                    'employment_status' => $overviewFilters['employment_status'] ?? null,
                    'alignment_status' => $overviewFilters['program_alignment'] ?? null,
                ]
            );
            $yearData = array_map(static function (array $year): array {
                return [
                    'year_graduated' => (int)$year['year'],
                    'total_graduates' => (int)$year['response_count'],
                    'employment_total' => (int)$year['employment_total'],
                    'employed' => (int)$year['employed'],
                    'unemployed' => (int)$year['unemployed'],
                    'employment_rate' => $year['employment_rate'],
                    'aligned' => (int)$year['aligned'],
                    'alignment_total' => (int)$year['alignment_total'],
                    'alignment_rate' => $year['alignment_rate'],
                    'not_aligned' => (int)$year['not_aligned'],
                    'avg_salary' => null,
                ];
            }, array_reverse(gradtrack_analytics_group_by_year($records)));

            echo json_encode(["success" => true, "data" => $yearData]);
            break;

        case 'by_batch_trends':
            if ($selectedSurveyId === null) {
                echo json_encode(["success" => true, "data" => []]);
                break;
            }

            $questions = getSurveyQuestions($db, $selectedSurveyId);
            $scopeProgramCodes = $filterDepartment !== null ? [$filterDepartment] : $allowedProgramCodes;
            $selectedGraduationYear = $filterYear ?? ($overviewFilters['graduation_year'] ?? null);
            $queryOptions = [
                'program_id' => $overviewFilters['program_id'] ?? null,
                'program_codes' => $scopeProgramCodes,
                'graduation_year' => $selectedGraduationYear,
            ];
            if (is_array($coverageYears)) {
                $queryOptions['allowed_graduation_years'] = $coverageYears;
            }

            // Keep retrieval participation independent of employment/alignment filters: every
            // valid submitted questionnaire counts toward the selected survey's retrieval rate.
            $baseRecords = gradtrack_analytics_build_records(
                getSurveyResponses($db, $selectedSurveyId, $queryOptions),
                $questions
            );
            $responseCountsByYear = [];
            foreach ($baseRecords as $record) {
                $recordYear = (int)($record['year'] ?? 0);
                if ($recordYear > 0) {
                    $responseCountsByYear[$recordYear] = ($responseCountsByYear[$recordYear] ?? 0) + 1;
                }
            }

            $outcomeRecords = gradtrack_analytics_filter_records($baseRecords, [
                'program_id' => $overviewFilters['program_id'] ?? null,
                'program_codes' => $scopeProgramCodes,
                'graduation_year' => $selectedGraduationYear,
                'employment_status' => $overviewFilters['employment_status'] ?? null,
                'alignment_status' => $overviewFilters['program_alignment'] ?? null,
            ]);
            $yearDimensions = gradtrack_analytics_fetch_year_dimensions($db, $queryOptions);
            $batchTrendData = array_map(static function (array $year) use ($responseCountsByYear): array {
                $yearGraduated = (int)($year['year'] ?? 0);
                $totalGraduates = (int)($year['active_graduate_count'] ?? 0);
                $surveyResponses = (int)($responseCountsByYear[$yearGraduated] ?? 0);

                return [
                    'year_graduated' => $yearGraduated,
                    'total_graduates' => $totalGraduates,
                    'survey_responses' => $surveyResponses,
                    'retrieval_rate' => $totalGraduates > 0
                        ? gradtrack_survey_percentage($surveyResponses, $totalGraduates, 1)
                        : null,
                    'employment_total' => (int)$year['employment_total'],
                    'employed' => (int)$year['employed'],
                    'unemployed' => (int)$year['unemployed'],
                    'employment_rate' => $year['employment_rate'],
                    'alignment_total' => (int)$year['alignment_total'],
                    'aligned' => (int)$year['aligned'],
                    'partially_aligned' => (int)$year['partially_aligned'],
                    // The three stacked series must be mutually exclusive. The canonical
                    // not_aligned bucket also includes partially aligned responses.
                    'not_aligned' => (int)$year['explicit_not_aligned'],
                    'alignment_rate' => $year['alignment_rate'],
                ];
            }, gradtrack_analytics_group_by_year($outcomeRecords, $yearDimensions));

            echo json_encode(["success" => true, "data" => $batchTrendData]);
            break;

        case 'employment_status':
            // Get survey responses and count each employment-status category.
            $questions = getSurveyQuestions($db, $selectedSurveyId);
            
            $surveyResponses = getSurveyResponses($db, $selectedSurveyId, array_merge($overviewFilters, [
                'program_codes' => $filterDepartment !== null ? [$filterDepartment] : $allowedProgramCodes,
                'graduation_year' => $filterYear ?? ($overviewFilters['graduation_year'] ?? null),
            ]));
            
            $statusCount = [
                'employed_local' => 0,
                'employed_abroad' => 0,
                'unemployed' => 0
            ];
            $seenResponses = [];
            
            foreach ($surveyResponses as $response) {
                if (gradtrack_survey_is_duplicate_response($response, $seenResponses)) {
                    continue;
                }

                $rowProgramCode = strtoupper((string)($response['program_code'] ?? ''));
                if ($filterDepartment !== null && $rowProgramCode !== $filterDepartment) {
                    continue;
                }
                if (is_array($allowedProgramCodes) && ($rowProgramCode === '' || !in_array($rowProgramCode, $allowedProgramCodes, true))) {
                    continue;
                }

                $details = getReportResponseDetails($response, $questions);
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
            $questions = getSurveyQuestions($db, $selectedSurveyId);
            
            $surveyResponses = getSurveyResponses($db, $selectedSurveyId, array_merge($overviewFilters, [
                'program_codes' => $filterDepartment !== null ? [$filterDepartment] : $allowedProgramCodes,
                'graduation_year' => $filterYear ?? ($overviewFilters['graduation_year'] ?? null),
            ]));
            $seenResponses = [];
            
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
                if (gradtrack_survey_is_duplicate_response($response, $seenResponses)) {
                    continue;
                }

                $rowProgramCode = strtoupper((string)($response['program_code'] ?? ''));
                if ($filterDepartment !== null && $rowProgramCode !== $filterDepartment) {
                    continue;
                }
                if (is_array($allowedProgramCodes) && ($rowProgramCode === '' || !in_array($rowProgramCode, $allowedProgramCodes, true))) {
                    continue;
                }

                $details = getReportResponseDetails($response, $questions);
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
    echo json_encode(["success" => false, "error" => gradtrack_public_exception_message($e, 'Unable to generate the report right now.', 'Reports API')]);
}
}
