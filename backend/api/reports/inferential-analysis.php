<?php

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/admin_auth.php';
require_once __DIR__ . '/../config/audit_trail.php';
require_once __DIR__ . '/../config/dean_program_scope.php';
require_once __DIR__ . '/../config/graduation_years.php';
require_once __DIR__ . '/../config/survey_response_analytics.php';
require_once __DIR__ . '/../config/inferential_analysis.php';

class InferentialAnalysisValidationException extends Exception
{
    private int $statusCode;

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

function gradtrack_inferential_survey(PDO $db, int $surveyId): array
{
    $statement = $db->prepare(
        'SELECT id, title, status, archived_at FROM surveys WHERE id = :survey_id LIMIT 1'
    );
    $statement->execute([':survey_id' => $surveyId]);
    $survey = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$survey) {
        throw new InferentialAnalysisValidationException('The selected survey is unavailable.', 404);
    }
    return $survey;
}

function gradtrack_inferential_survey_id($value): int
{
    if (!is_scalar($value) || !ctype_digit(trim((string)$value)) || (int)$value <= 0) {
        throw new InferentialAnalysisValidationException('A valid surveyId is required.');
    }
    return (int)$value;
}

function gradtrack_inferential_context(PDO $db, array $survey, ?array $deanScope): array
{
    $surveyId = (int)$survey['id'];
    $coverage = gradtrack_get_survey_graduation_year_coverage($db, $surveyId);
    if (!$coverage['configured'] && ($survey['status'] ?? '') === 'active' && empty($survey['archived_at'])) {
        throw new InferentialAnalysisValidationException(
            'Graduation year coverage has not been configured for the active survey.',
            422
        );
    }

    $baseOptions = [];
    if ($coverage['configured']) {
        $baseOptions['allowed_graduation_years'] = $coverage['years'];
    }
    if ($deanScope !== null) {
        $baseOptions['program_codes'] = $deanScope['program_codes'];
    }

    $questions = gradtrack_analytics_fetch_questions($db, $surveyId);
    $roles = gradtrack_analytics_question_roles($questions);
    $availability = [
        'employment_status' => !empty($roles['employment']),
        'job_course_alignment' => !empty($roles['alignment']),
        'work_location' => !empty($roles['work_location']),
    ];
    $programs = array_map(static fn (array $program): array => [
        'id' => (int)$program['program_id'],
        'code' => (string)$program['code'],
        'name' => (string)$program['name'],
    ], gradtrack_analytics_fetch_program_dimensions($db, $baseOptions));
    $years = $coverage['configured']
        ? array_map('strval', $coverage['years'])
        : array_map(
            static fn (array $year): string => (string)$year['year'],
            gradtrack_analytics_fetch_year_dimensions($db, $baseOptions)
        );

    return [
        'surveyId' => $surveyId,
        'surveyTitle' => (string)$survey['title'],
        'variables' => gradtrack_inferential_available_variables($availability),
        'filterOptions' => [
            'years' => $years,
            'programs' => $programs,
        ],
        'fieldAvailability' => $availability,
        'baseOptions' => $baseOptions,
        'questions' => $questions,
    ];
}

function gradtrack_inferential_public_context(array $context): array
{
    unset($context['baseOptions'], $context['questions']);
    return $context;
}

$database = new Database();
$db = $database->getConnection();

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (!in_array($method, ['GET', 'POST'], true)) {
        throw new InferentialAnalysisValidationException('Method not allowed.', 405);
    }

    $authorizedRoles = array_merge(['admin'], gradtrack_dean_roles());
    $authUser = gradtrack_require_admin_auth(
        $db,
        $authorizedRoles,
        'Only authorized report accounts can access inferential analysis'
    );
    $deanScope = gradtrack_dean_program_scope($db, $authUser);

    $payload = [];
    if ($method === 'POST') {
        $payload = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($payload)) {
            throw new InferentialAnalysisValidationException('The analysis request body must be valid JSON.');
        }
    }

    $surveyId = gradtrack_inferential_survey_id(
        $method === 'GET' ? ($_GET['survey_id'] ?? $_GET['surveyId'] ?? null) : ($payload['surveyId'] ?? null)
    );
    $survey = gradtrack_inferential_survey($db, $surveyId);
    $context = gradtrack_inferential_context($db, $survey, $deanScope);

    if ($method === 'GET') {
        echo json_encode(['success' => true, 'data' => gradtrack_inferential_public_context($context)]);
        exit;
    }

    $variable1 = is_scalar($payload['variable1'] ?? null) ? trim((string)$payload['variable1']) : '';
    $variable2 = is_scalar($payload['variable2'] ?? null) ? trim((string)$payload['variable2']) : '';
    if ($variable1 === $variable2 && $variable1 !== '') {
        throw new InferentialAnalysisValidationException(
            'Please select two different variables for inferential analysis.',
            422
        );
    }

    $availableVariableKeys = array_column($context['variables'], 'key');
    if (!in_array($variable1, $availableVariableKeys, true) || !in_array($variable2, $availableVariableKeys, true)) {
        throw new InferentialAnalysisValidationException(
            'One or more selected variables are unavailable for this survey.',
            422
        );
    }

    $filters = is_array($payload['filters'] ?? null) ? $payload['filters'] : [];
    $graduationYear = trim((string)($filters['graduationYear'] ?? ''));
    if (in_array(strtolower($graduationYear), ['', 'all', 'null', 'undefined'], true)) {
        $graduationYear = '';
    }
    if ($graduationYear !== '') {
        $normalizedYear = gradtrack_normalize_graduation_year($graduationYear);
        if ($normalizedYear === null || !in_array((string)$normalizedYear, $context['filterOptions']['years'], true)) {
            throw new InferentialAnalysisValidationException('The selected graduation year is unavailable for this survey.', 422);
        }
        $graduationYear = (string)$normalizedYear;
    }

    $programIdText = trim((string)($filters['programId'] ?? ''));
    if (in_array(strtolower($programIdText), ['', 'all', 'null', 'undefined'], true)) {
        $programIdText = '';
    }
    $programId = 0;
    if ($programIdText !== '') {
        if (!ctype_digit($programIdText) || (int)$programIdText <= 0) {
            throw new InferentialAnalysisValidationException('The selected program is invalid.', 422);
        }
        $programId = (int)$programIdText;
        if (!in_array($programId, array_column($context['filterOptions']['programs'], 'id'), true)) {
            throw new InferentialAnalysisValidationException('The selected program is outside the authorized report scope.', 403);
        }
    }

    $appliedYear = in_array('graduation_year', [$variable1, $variable2], true) ? '' : $graduationYear;
    $appliedProgramId = in_array('program', [$variable1, $variable2], true) ? 0 : $programId;
    $queryOptions = $context['baseOptions'];
    if ($appliedYear !== '') $queryOptions['graduation_year'] = (int)$appliedYear;
    if ($appliedProgramId > 0) $queryOptions['program_id'] = $appliedProgramId;

    $responses = gradtrack_analytics_fetch_valid_responses($db, $surveyId, $queryOptions);
    $records = gradtrack_inferential_complete_record_set(
        $responses,
        gradtrack_analytics_build_records($responses, $context['questions'])
    );
    $result = gradtrack_inferential_analyze_records($records, $variable1, $variable2);
    $selectedProgram = null;
    foreach ($context['filterOptions']['programs'] as $program) {
        if ((int)$program['id'] === $appliedProgramId) {
            $selectedProgram = $program;
            break;
        }
    }
    $result['survey'] = ['id' => $surveyId, 'title' => (string)$survey['title']];
    $result['filters'] = [
        'graduationYear' => $appliedYear !== '' ? $appliedYear : null,
        'programId' => $appliedProgramId > 0 ? $appliedProgramId : null,
        'programLabel' => $selectedProgram !== null
            ? $selectedProgram['code'] . ' - ' . $selectedProgram['name']
            : null,
    ];

    $auditUser = gradtrack_admin_audit_context($authUser);
    logAuditTrail(
        $auditUser['user_id'],
        $auditUser['user_name'],
        $auditUser['user_role'],
        $auditUser['department'],
        'Generate',
        'Reports',
        'Generated a Chi-Square inferential analysis.',
        $surveyId,
        null,
        null,
        [
            'report_type' => 'inferential_analysis',
            'survey_id' => $surveyId,
            'variable_1' => $variable1,
            'variable_2' => $variable2,
            'filters' => $result['filters'],
        ]
    );

    echo json_encode([
        'success' => true,
        'data' => $result,
        'meta' => gradtrack_inferential_public_context($context),
    ]);
} catch (InferentialAnalysisValidationException $exception) {
    http_response_code($exception->getStatusCode());
    echo json_encode(['success' => false, 'error' => $exception->getMessage()]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => gradtrack_public_exception_message(
            $exception,
            'Unable to perform inferential analysis right now.',
            'Inferential analysis API'
        ),
    ]);
}
