<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["success" => false, "error" => "Method not allowed"]);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(["success" => false, "error" => "Authentication required"]);
    exit;
}

$role = $_SESSION['role'] ?? '';
$roleProgramScopes = [
    'dean_cs' => ['BSCS', 'ACT'],
    'dean_coed' => ['BSED', 'BEED'],
    'dean_hm' => ['BSHM'],
];

if (!isset($roleProgramScopes[$role])) {
    http_response_code(403);
    echo json_encode(["success" => false, "error" => "Only dean accounts can access this endpoint"]);
    exit;
}

$programCodes = $roleProgramScopes[$role];
$database = new Database();
$db = $database->getConnection();

try {
    $requestedSurveyId = isset($_GET['survey_id']) && (int) $_GET['survey_id'] > 0
        ? (int) $_GET['survey_id']
        : null;

    if ($requestedSurveyId !== null) {
        $surveyStmt = $db->prepare("SELECT id, title, status FROM surveys WHERE id = :id LIMIT 1");
        $surveyStmt->execute([':id' => $requestedSurveyId]);
        $selectedSurvey = $surveyStmt->fetch(PDO::FETCH_ASSOC);

        if (!$selectedSurvey) {
            http_response_code(404);
            echo json_encode(["success" => false, "error" => "Survey not found"]);
            exit;
        }
    } else {
        $surveyStmt = $db->query("
            SELECT id, title, status
            FROM surveys
            ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, created_at DESC, id DESC
            LIMIT 1
        ");
        $selectedSurvey = $surveyStmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    $selectedSurveyId = $selectedSurvey ? (int) $selectedSurvey['id'] : null;

    $whereParts = [];
    $params = [];

    if ($selectedSurveyId !== null) {
        $params[':survey_id'] = $selectedSurveyId;
    }

    $programPlaceholders = [];
    foreach ($programCodes as $index => $code) {
        $placeholder = ':program_code_' . $index;
        $programPlaceholders[] = $placeholder;
        $params[$placeholder] = $code;
    }

    $whereParts[] = 'p.code IN (' . implode(', ', $programPlaceholders) . ')';

    $search = isset($_GET['search']) ? trim((string) $_GET['search']) : '';
    if ($search !== '') {
        $searchTerm = '%' . $search . '%';
        $whereParts[] = '(g.first_name LIKE :search_1 OR g.middle_name LIKE :search_2 OR g.last_name LIKE :search_3 OR g.student_id LIKE :search_4 OR g.email LIKE :search_5)';
        $params[':search_1'] = $searchTerm;
        $params[':search_2'] = $searchTerm;
        $params[':search_3'] = $searchTerm;
        $params[':search_4'] = $searchTerm;
        $params[':search_5'] = $searchTerm;
    }

    if (isset($_GET['year_graduated']) && (int) $_GET['year_graduated'] > 0) {
        $whereParts[] = 'g.year_graduated = :year_graduated';
        $params[':year_graduated'] = (int) $_GET['year_graduated'];
    }

    $status = isset($_GET['status']) ? trim((string) $_GET['status']) : '';
    $havingClause = '';
    if ($status === 'answered') {
        $havingClause = 'HAVING COUNT(sr.id) > 0';
    } elseif ($status === 'not_answered') {
        $havingClause = 'HAVING COUNT(sr.id) = 0';
    }

    $whereClause = count($whereParts) > 0 ? 'WHERE ' . implode(' AND ', $whereParts) : '';

    $page = isset($_GET['page']) ? max(1, (int) $_GET['page']) : 1;
    $limit = isset($_GET['limit']) ? min(5000, max(1, (int) $_GET['limit'])) : 20;
    $offset = ($page - 1) * $limit;

    $responseJoin = $selectedSurveyId !== null
        ? 'LEFT JOIN survey_responses sr ON sr.graduate_id = g.id AND sr.survey_id = :survey_id'
        : 'LEFT JOIN survey_responses sr ON sr.graduate_id = g.id';

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
            COUNT(sr.id) AS response_count,
            CASE WHEN COUNT(sr.id) > 0 THEN 1 ELSE 0 END AS has_answered,
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

    $summarySql = "
        SELECT
            COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN summary_rows.response_count > 0 THEN 1 ELSE 0 END), 0) AS answered,
            COALESCE(SUM(CASE WHEN summary_rows.response_count = 0 THEN 1 ELSE 0 END), 0) AS not_answered
        FROM (
            SELECT
                g.id,
                COUNT(sr.id) AS response_count
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
        "program_scope" => $programCodes,
        "selected_survey" => $selectedSurvey,
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
        "data" => array_map(function ($row) {
            $row['response_count'] = (int) $row['response_count'];
            $row['has_answered'] = (int) $row['has_answered'] === 1;
            $row['has_email'] = trim((string) ($row['email'] ?? '')) !== '';
            return $row;
        }, $rows),
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
