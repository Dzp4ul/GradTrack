<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/archive.php';
require_once __DIR__ . '/../config/admin_auth.php';
require_once __DIR__ . '/../config/graduation_years.php';
require_once __DIR__ . '/../config/survey_contact_email.php';
require_once __DIR__ . '/../config/survey_program_scope.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["success" => false, "error" => "Method not allowed"]);
    exit;
}

$database = new Database();
$db = $database->getConnection();
$authUser = gradtrack_require_admin_auth($db, ['research_coordinator'], 'Only the Research Coordinator can access graduate survey status');
gradtrack_ensure_archive_schema($db, 'graduates');
gradtrack_ensure_archive_schema($db, 'surveys', true);

try {
    $requestedSurveyId = isset($_GET['survey_id']) && (int) $_GET['survey_id'] > 0
        ? (int) $_GET['survey_id']
        : null;

    $coverage = $requestedSurveyId !== null
        ? gradtrack_get_survey_graduation_year_coverage($db, $requestedSurveyId)
        : gradtrack_get_active_survey_graduation_year_coverage($db);
    if ($coverage['survey'] === null) {
        http_response_code($requestedSurveyId !== null ? 404 : 409);
        echo json_encode([
            'success' => false,
            'code' => $requestedSurveyId !== null ? 'SURVEY_NOT_FOUND' : 'NO_ACTIVE_SURVEY',
            'error' => $requestedSurveyId !== null
                ? 'The selected survey was not found.'
                : 'No active survey is available for graduate monitoring.',
        ]);
        exit;
    }
    if (!empty($coverage['survey']['archived_at'])) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'code' => 'SURVEY_ARCHIVED',
            'error' => 'Archived surveys are not available for graduate monitoring.',
        ]);
        exit;
    }

    $selectedSurvey = $coverage['survey'];
    $selectedSurveyId = (int) $selectedSurvey['id'];
    $programScope = gradtrack_get_survey_program_scope($db, $selectedSurveyId);
    if (!$programScope['configured']) {
        echo json_encode([
            'success' => true,
            'selected_survey' => $selectedSurvey,
            'program_options' => [],
            'program_scope' => [
                'configured' => false,
                'error' => $programScope['error'],
            ],
            'year_options' => $coverage['configured'] ? $coverage['years'] : [],
            'summary' => ['total' => 0, 'answered' => 0, 'not_answered' => 0],
            'pagination' => ['total' => 0, 'page' => 1, 'limit' => 20, 'pages' => 1],
            'data' => [],
        ]);
        exit;
    }
    if (!$coverage['configured']) {
        http_response_code(422);
        echo json_encode([
            'success' => false,
            'code' => 'GRADUATION_YEAR_COVERAGE_NOT_CONFIGURED',
            'error' => 'Graduation year coverage has not been configured for the selected survey.',
            'details' => $coverage['error'],
        ]);
        exit;
    }

    $allowedYears = $coverage['years'];

    $whereParts = ['g.archived_at IS NULL'];
    $params = [':survey_id' => $selectedSurveyId];
    $scopePlaceholders = [];
    foreach ($programScope['program_ids'] as $index => $programId) {
        $placeholder = ':survey_program_id_' . $index;
        $scopePlaceholders[] = $placeholder;
        $params[$placeholder] = (int) $programId;
    }
    $whereParts[] = 'g.program_id IN (' . implode(', ', $scopePlaceholders) . ')';
    gradtrack_append_graduation_year_coverage_filter(
        $whereParts,
        $params,
        'g.year_graduated',
        $allowedYears,
        'admin_coverage_year'
    );

    $search = isset($_GET['search']) ? trim((string) $_GET['search']) : '';
    if ($search !== '') {
        $searchTerm = '%' . $search . '%';
        $whereParts[] = '(g.first_name LIKE :search_1 OR g.middle_name LIKE :search_2 OR g.last_name LIKE :search_3 OR g.student_id LIKE :search_4 OR g.email LIKE :search_5
            OR EXISTS (
                SELECT 1
                FROM survey_responses search_sr
                JOIN survey_response_answers search_sra ON search_sra.survey_response_id = search_sr.id
                JOIN survey_questions search_sq ON search_sq.id = search_sra.survey_question_id
                WHERE search_sr.graduate_id = g.id
                  AND search_sr.survey_id = :search_survey_id
                  AND search_sr.submitted_at IS NOT NULL
                  AND search_sra.is_canonical = 1
                  AND search_sq.analytics_key = \'email_address\'
                  AND JSON_UNQUOTE(search_sra.answer_value) LIKE :search_6
            ))';
        $params[':search_1'] = $searchTerm;
        $params[':search_2'] = $searchTerm;
        $params[':search_3'] = $searchTerm;
        $params[':search_4'] = $searchTerm;
        $params[':search_5'] = $searchTerm;
        $params[':search_6'] = $searchTerm;
        $params[':search_survey_id'] = $selectedSurveyId;
    }

    if (isset($_GET['program_id']) && (int) $_GET['program_id'] > 0) {
        $requestedProgramId = (int) $_GET['program_id'];
        if (!in_array($requestedProgramId, $programScope['program_ids'], true)) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'code' => 'PROGRAM_OUTSIDE_SURVEY_SCOPE',
                'error' => 'The selected program is not included in this survey.',
            ]);
            exit;
        }
        $whereParts[] = 'g.program_id = :program_id';
        $params[':program_id'] = $requestedProgramId;
    }

    if (isset($_GET['year_graduated']) && $_GET['year_graduated'] !== '') {
        $requestedYear = gradtrack_normalize_graduation_year($_GET['year_graduated']);
        if ($requestedYear === null) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Graduation year must be a valid four-digit year']);
            exit;
        }
        if (!in_array($requestedYear, $allowedYears, true)) {
            http_response_code(422);
            echo json_encode([
                'success' => false,
                'code' => 'GRADUATION_YEAR_OUTSIDE_ACTIVE_SURVEY',
                'error' => 'The selected graduation year is not included in the selected survey.',
            ]);
            exit;
        }
        $whereParts[] = 'g.year_graduated = :year_graduated';
        $params[':year_graduated'] = $requestedYear;
    }

    $status = isset($_GET['status']) ? trim((string) $_GET['status']) : 'all';
    $havingClause = '';
    if ($status === 'answered') {
        $havingClause = 'HAVING COUNT(DISTINCT sr.id) > 0';
    } elseif ($status === 'not_answered') {
        $havingClause = 'HAVING COUNT(DISTINCT sr.id) = 0';
    }

    $whereClause = count($whereParts) > 0 ? 'WHERE ' . implode(' AND ', $whereParts) : '';

    $page = isset($_GET['page']) ? max(1, (int) $_GET['page']) : 1;
    $limit = isset($_GET['limit']) ? min(5000, max(1, (int) $_GET['limit'])) : 20;
    $offset = ($page - 1) * $limit;

    $responseJoin = 'LEFT JOIN survey_responses sr ON sr.graduate_id = g.id AND sr.survey_id = :survey_id AND sr.submitted_at IS NOT NULL';

    $fromAndJoins = "
        FROM graduates g
        LEFT JOIN programs p ON p.id = g.program_id
        $responseJoin
    ";

    $countSql = "
        SELECT COUNT(*) AS total
        FROM (
            SELECT g.id
            $fromAndJoins
            $whereClause
            GROUP BY g.id
            $havingClause
        ) filtered
    ";
    $countStmt = $db->prepare($countSql);
    $countStmt->execute($params);
    $total = (int) ($countStmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

    $dataSql = "
        SELECT
            g.id,
            g.student_id,
            g.first_name,
            g.middle_name,
            g.last_name,
            g.email,
            g.year_graduated,
            p.code AS program_code,
            p.name AS program_name,
            COUNT(DISTINCT sr.id) AS response_count,
            CASE WHEN COUNT(DISTINCT sr.id) > 0 THEN 1 ELSE 0 END AS has_answered,
            MAX(sr.submitted_at) AS last_submitted_at
        $fromAndJoins
        $whereClause
        GROUP BY g.id
        $havingClause
        ORDER BY g.last_name ASC, g.first_name ASC
        LIMIT $limit OFFSET $offset
    ";
    $dataStmt = $db->prepare($dataSql);
    $dataStmt->execute($params);
    $rows = $dataStmt->fetchAll(PDO::FETCH_ASSOC);
    $surveyEmails = gradtrack_survey_contact_email_map(
        $db,
        $selectedSurveyId,
        array_column($rows, 'id')
    );

    $summarySql = "
        SELECT
            COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN summary_rows.response_count > 0 THEN 1 ELSE 0 END), 0) AS answered,
            COALESCE(SUM(CASE WHEN summary_rows.response_count = 0 THEN 1 ELSE 0 END), 0) AS not_answered
        FROM (
            SELECT
                g.id,
                COUNT(DISTINCT sr.id) AS response_count
            $fromAndJoins
            $whereClause
            GROUP BY g.id
        ) summary_rows
    ";
    $summaryStmt = $db->prepare($summarySql);
    $summaryStmt->execute($params);
    $summaryResult = $summaryStmt->fetch(PDO::FETCH_ASSOC) ?: ['total' => 0, 'answered' => 0, 'not_answered' => 0];

    echo json_encode([
        "success" => true,
        "selected_survey" => $selectedSurvey,
        "program_options" => $programScope['departments'],
        "program_scope" => [
            "configured" => true,
            "error" => null,
        ],
        "year_options" => $allowedYears,
        "summary" => [
            "total" => (int) $summaryResult['total'],
            "answered" => (int) $summaryResult['answered'],
            "not_answered" => (int) $summaryResult['not_answered'],
        ],
        "pagination" => [
            "total" => $total,
            "page" => $page,
            "limit" => $limit,
            "pages" => max(1, (int) ceil($total / $limit)),
        ],
        "data" => array_map(function ($row) use ($surveyEmails) {
            $row['response_count'] = (int) $row['response_count'];
            $row['has_answered'] = (int) $row['has_answered'] === 1;
            $graduateId = (int) $row['id'];
            $officialEmail = trim((string) ($row['email'] ?? ''));
            $surveyEmail = $surveyEmails[$graduateId] ?? null;
            $displayEmail = $officialEmail !== '' ? $officialEmail : $surveyEmail;
            $row['official_email'] = $officialEmail !== '' ? $officialEmail : null;
            $row['survey_email'] = $surveyEmail;
            $row['display_email'] = $displayEmail;
            // Preserve the established API field while making it useful to older clients.
            $row['email'] = $displayEmail;
            $row['has_email'] = $displayEmail !== null;
            return $row;
        }, $rows),
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => gradtrack_public_exception_message($e, 'Unable to load survey status right now.', 'Graduate survey status API')]);
}
