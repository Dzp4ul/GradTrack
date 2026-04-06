<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config/database.php';

$type = $_GET['type'] ?? 'overview';
$year = $_GET['year'] ?? 'all';
$format = $_GET['format'] ?? 'csv';

try {
    $db = new Database();
    $conn = $db->connect();
    
    $filename = "gradtrack_report_" . $type . "_" . date('Y-m-d') . "." . $format;
    
    if ($format === 'csv') {
        header('Content-Type: text/csv');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        $output = fopen('php://output', 'w');
        
        switch ($type) {
            case 'overview':
                $sql = "SELECT 
                    COUNT(DISTINCT g.id) as total_graduates,
                    COUNT(DISTINCT CASE WHEN sr.employment_status IN ('Employed (Local)', 'Employed (Abroad)') THEN g.id END) as total_employed,
                    COUNT(DISTINCT CASE WHEN sr.employment_status = 'Employed (Local)' THEN g.id END) as total_employed_local,
                    COUNT(DISTINCT CASE WHEN sr.employment_status = 'Employed (Abroad)' THEN g.id END) as total_employed_abroad,
                    COUNT(DISTINCT CASE WHEN sr.job_alignment IN ('Aligned', 'Partially Aligned') THEN g.id END) as total_aligned,
                    COUNT(DISTINCT sr.id) as total_survey_responses
                FROM graduates g
                LEFT JOIN survey_responses sr ON g.id = sr.graduate_id";
                
                $stmt = $conn->query($sql);
                $data = $stmt->fetch(PDO::FETCH_ASSOC);
                
                $data['employment_rate'] = $data['total_graduates'] > 0 
                    ? round(($data['total_employed'] / $data['total_graduates']) * 100, 2) 
                    : 0;
                $data['alignment_rate'] = $data['total_employed'] > 0 
                    ? round(($data['total_aligned'] / $data['total_employed']) * 100, 2) 
                    : 0;
                
                fputcsv($output, ['Metric', 'Value']);
                fputcsv($output, ['Total Graduates', $data['total_graduates']]);
                fputcsv($output, ['Total Employed', $data['total_employed']]);
                fputcsv($output, ['Employed (Local)', $data['total_employed_local']]);
                fputcsv($output, ['Employed (Abroad)', $data['total_employed_abroad']]);
                fputcsv($output, ['Total Aligned', $data['total_aligned']]);
                fputcsv($output, ['Survey Responses', $data['total_survey_responses']]);
                fputcsv($output, ['Employment Rate (%)', $data['employment_rate']]);
                fputcsv($output, ['Alignment Rate (%)', $data['alignment_rate']]);
                break;
                
            case 'by_program':
                $sql = "SELECT 
                    p.code,
                    p.name,
                    COUNT(DISTINCT g.id) as total_graduates,
                    COUNT(DISTINCT CASE WHEN sr.employment_status IN ('Employed (Local)', 'Employed (Abroad)') THEN g.id END) as employed,
                    COUNT(DISTINCT CASE WHEN sr.job_alignment = 'Aligned' THEN g.id END) as aligned,
                    COUNT(DISTINCT CASE WHEN sr.job_alignment = 'Partially Aligned' THEN g.id END) as partially_aligned,
                    COUNT(DISTINCT CASE WHEN sr.job_alignment = 'Not Aligned' THEN g.id END) as not_aligned,
                    AVG(sr.time_to_employment) as avg_time_to_employment,
                    AVG(sr.current_salary) as avg_salary
                FROM programs p
                LEFT JOIN graduates g ON p.id = g.program_id
                LEFT JOIN survey_responses sr ON g.id = sr.graduate_id";
                
                if ($year !== 'all') {
                    $sql .= " WHERE g.year_graduated = :year";
                }
                
                $sql .= " GROUP BY p.id, p.code, p.name ORDER BY p.code";
                
                $stmt = $conn->prepare($sql);
                if ($year !== 'all') {
                    $stmt->bindParam(':year', $year);
                }
                $stmt->execute();
                
                fputcsv($output, ['Program Code', 'Program Name', 'Total Graduates', 'Employed', 'Aligned', 'Partially Aligned', 'Not Aligned', 'Avg Time to Employment (months)', 'Avg Salary']);
                
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    fputcsv($output, [
                        $row['code'],
                        $row['name'],
                        $row['total_graduates'],
                        $row['employed'],
                        $row['aligned'],
                        $row['partially_aligned'],
                        $row['not_aligned'],
                        $row['avg_time_to_employment'] ? round($row['avg_time_to_employment'], 1) : '',
                        $row['avg_salary'] ? round($row['avg_salary'], 2) : ''
                    ]);
                }
                break;
                
            case 'by_year':
                $sql = "SELECT 
                    g.year_graduated,
                    COUNT(DISTINCT g.id) as total_graduates,
                    COUNT(DISTINCT CASE WHEN sr.employment_status IN ('Employed (Local)', 'Employed (Abroad)') THEN g.id END) as employed,
                    COUNT(DISTINCT CASE WHEN sr.job_alignment IN ('Aligned', 'Partially Aligned') THEN g.id END) as aligned,
                    AVG(sr.current_salary) as avg_salary
                FROM graduates g
                LEFT JOIN survey_responses sr ON g.id = sr.graduate_id
                GROUP BY g.year_graduated
                ORDER BY g.year_graduated DESC";
                
                $stmt = $conn->query($sql);
                
                fputcsv($output, ['Year Graduated', 'Total Graduates', 'Employed', 'Aligned', 'Avg Salary']);
                
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    fputcsv($output, [
                        $row['year_graduated'],
                        $row['total_graduates'],
                        $row['employed'],
                        $row['aligned'],
                        $row['avg_salary'] ? round($row['avg_salary'], 2) : ''
                    ]);
                }
                break;
                
            case 'employment_status':
                $sql = "SELECT 
                    COALESCE(sr.employment_status, 'No Response') as employment_status,
                    COUNT(DISTINCT g.id) as count
                FROM graduates g
                LEFT JOIN survey_responses sr ON g.id = sr.graduate_id";
                
                if ($year !== 'all') {
                    $sql .= " WHERE g.year_graduated = :year";
                }
                
                $sql .= " GROUP BY sr.employment_status ORDER BY count DESC";
                
                $stmt = $conn->prepare($sql);
                if ($year !== 'all') {
                    $stmt->bindParam(':year', $year);
                }
                $stmt->execute();
                
                fputcsv($output, ['Employment Status', 'Count']);
                
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    fputcsv($output, [$row['employment_status'], $row['count']]);
                }
                break;
                
            case 'salary_distribution':
                $sql = "SELECT 
                    CASE 
                        WHEN sr.current_salary < 10000 THEN 'Below ₱10,000'
                        WHEN sr.current_salary BETWEEN 10000 AND 20000 THEN '₱10,000 - ₱20,000'
                        WHEN sr.current_salary BETWEEN 20001 AND 30000 THEN '₱20,001 - ₱30,000'
                        WHEN sr.current_salary BETWEEN 30001 AND 40000 THEN '₱30,001 - ₱40,000'
                        WHEN sr.current_salary > 40000 THEN 'Above ₱40,000'
                        ELSE 'Not Specified'
                    END as salary_range,
                    COUNT(*) as count
                FROM survey_responses sr
                JOIN graduates g ON sr.graduate_id = g.id
                WHERE sr.employment_status IN ('Employed (Local)', 'Employed (Abroad)')";
                
                if ($year !== 'all') {
                    $sql .= " AND g.year_graduated = :year";
                }
                
                $sql .= " GROUP BY salary_range ORDER BY 
                    CASE salary_range
                        WHEN 'Below ₱10,000' THEN 1
                        WHEN '₱10,000 - ₱20,000' THEN 2
                        WHEN '₱20,001 - ₱30,000' THEN 3
                        WHEN '₱30,001 - ₱40,000' THEN 4
                        WHEN 'Above ₱40,000' THEN 5
                        ELSE 6
                    END";
                
                $stmt = $conn->prepare($sql);
                if ($year !== 'all') {
                    $stmt->bindParam(':year', $year);
                }
                $stmt->execute();
                
                fputcsv($output, ['Salary Range', 'Count']);
                
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    fputcsv($output, [$row['salary_range'], $row['count']]);
                }
                break;
        }
        
        fclose($output);
    }
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
