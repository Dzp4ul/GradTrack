<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();

try {
    $reportType = isset($_GET['type']) ? $_GET['type'] : 'overview';

    switch ($reportType) {
        case 'overview':
            // General stats
            $stmt = $db->query("SELECT COUNT(*) as total FROM graduates");
            $totalGrads = $stmt->fetch(PDO::FETCH_ASSOC)['total'];

            $stmt = $db->query("SELECT COUNT(*) as total FROM employment WHERE employment_status IN ('employed','self_employed','freelance')");
            $employed = $stmt->fetch(PDO::FETCH_ASSOC)['total'];

            $stmt = $db->query("SELECT COUNT(*) as total FROM employment WHERE is_aligned = 'aligned'");
            $aligned = $stmt->fetch(PDO::FETCH_ASSOC)['total'];

            $stmt = $db->query("SELECT COUNT(*) as total FROM survey_responses");
            $responses = $stmt->fetch(PDO::FETCH_ASSOC)['total'];

            echo json_encode(["success" => true, "data" => [
                "total_graduates" => (int)$totalGrads,
                "total_employed" => (int)$employed,
                "total_aligned" => (int)$aligned,
                "total_survey_responses" => (int)$responses,
                "employment_rate" => $totalGrads > 0 ? round(($employed / $totalGrads) * 100, 1) : 0,
                "alignment_rate" => $employed > 0 ? round(($aligned / $employed) * 100, 1) : 0
            ]]);
            break;

        case 'by_program':
            $stmt = $db->query("
                SELECT p.code, p.name,
                    COUNT(g.id) as total_graduates,
                    SUM(CASE WHEN e.employment_status IN ('employed','self_employed','freelance') THEN 1 ELSE 0 END) as employed,
                    SUM(CASE WHEN e.is_aligned = 'aligned' THEN 1 ELSE 0 END) as aligned,
                    SUM(CASE WHEN e.is_aligned = 'partially_aligned' THEN 1 ELSE 0 END) as partially_aligned,
                    SUM(CASE WHEN e.is_aligned = 'not_aligned' THEN 1 ELSE 0 END) as not_aligned,
                    ROUND(AVG(CASE WHEN e.time_to_employment > 0 THEN e.time_to_employment END), 1) as avg_time_to_employment,
                    ROUND(AVG(CASE WHEN e.monthly_salary > 0 THEN e.monthly_salary END), 0) as avg_salary
                FROM programs p
                LEFT JOIN graduates g ON g.program_id = p.id
                LEFT JOIN employment e ON e.graduate_id = g.id
                GROUP BY p.id, p.code, p.name
            ");
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(["success" => true, "data" => $data]);
            break;

        case 'by_year':
            $stmt = $db->query("
                SELECT g.year_graduated,
                    COUNT(g.id) as total_graduates,
                    SUM(CASE WHEN e.employment_status IN ('employed','self_employed','freelance') THEN 1 ELSE 0 END) as employed,
                    SUM(CASE WHEN e.is_aligned = 'aligned' THEN 1 ELSE 0 END) as aligned,
                    ROUND(AVG(CASE WHEN e.monthly_salary > 0 THEN e.monthly_salary END), 0) as avg_salary
                FROM graduates g
                LEFT JOIN employment e ON e.graduate_id = g.id
                WHERE g.year_graduated IS NOT NULL
                GROUP BY g.year_graduated
                ORDER BY g.year_graduated DESC
            ");
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(["success" => true, "data" => $data]);
            break;

        case 'employment_status':
            $stmt = $db->query("
                SELECT e.employment_status, COUNT(*) as count
                FROM employment e
                GROUP BY e.employment_status
            ");
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(["success" => true, "data" => $data]);
            break;

        case 'salary_distribution':
            $stmt = $db->query("
                SELECT 
                    CASE 
                        WHEN e.monthly_salary < 15000 THEN 'Below 15K'
                        WHEN e.monthly_salary BETWEEN 15000 AND 20000 THEN '15K-20K'
                        WHEN e.monthly_salary BETWEEN 20001 AND 30000 THEN '20K-30K'
                        WHEN e.monthly_salary BETWEEN 30001 AND 50000 THEN '30K-50K'
                        WHEN e.monthly_salary > 50000 THEN 'Above 50K'
                        ELSE 'N/A'
                    END as salary_range,
                    COUNT(*) as count
                FROM employment e
                WHERE e.monthly_salary IS NOT NULL AND e.monthly_salary > 0
                GROUP BY salary_range
                ORDER BY MIN(e.monthly_salary)
            ");
            $data = $stmt->fetchAll(PDO::FETCH_ASSOC);
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
