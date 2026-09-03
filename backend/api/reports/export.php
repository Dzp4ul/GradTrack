<?php
require_once __DIR__ . '/../config/cors.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$type = isset($_GET['type']) && is_scalar($_GET['type']) ? (string)$_GET['type'] : 'overview';
$format = isset($_GET['format']) && is_scalar($_GET['format']) ? strtolower((string)$_GET['format']) : 'csv';

if ($format !== 'csv') {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Only CSV export is supported by this endpoint.']);
    exit;
}

$_GET['audit_action'] = $_GET['audit_action'] ?? 'export_csv';

ob_start();
require __DIR__ . '/index.php';
$json = ob_get_clean();

$payload = json_decode((string)$json, true);
if (!is_array($payload) || empty($payload['success'])) {
    http_response_code(http_response_code() >= 400 ? http_response_code() : 500);
    header_remove('Content-Type');
    header('Content-Type: application/json');
    echo $json !== '' ? $json : json_encode(['success' => false, 'message' => 'Unable to generate report data.']);
    exit;
}

$data = $payload['data'] ?? [];
$filename = 'gradtrack_report_' . preg_replace('/[^a-z0-9_-]+/i', '_', $type) . '_' . date('Y-m-d') . '.csv';

header_remove('Content-Type');
header('Content-Type: text/csv');
header('Content-Disposition: attachment; filename="' . $filename . '"');

$output = fopen('php://output', 'w');

if ($type === 'overview' && is_array($data)) {
    fputcsv($output, ['Metric', 'Value']);
    $rows = [
        'Total Graduate Responses' => $data['total_graduates'] ?? 0,
        'Total Employed' => $data['total_employed'] ?? 0,
        'Total Unemployed' => $data['total_unemployed'] ?? 0,
        'Employment Known' => $data['total_employment_known'] ?? 0,
        'Employed (Local)' => $data['total_employed_local'] ?? 0,
        'Employed (Abroad)' => $data['total_employed_abroad'] ?? 0,
        'Total Aligned' => $data['total_aligned'] ?? 0,
        'Survey Responses' => $data['total_survey_responses'] ?? 0,
        'Employment Rate (%)' => $data['employment_rate'] ?? 0,
        'Alignment Rate (%)' => $data['alignment_rate'] ?? 0,
    ];

    foreach ($rows as $metric => $value) {
        fputcsv($output, [$metric, $value]);
    }
} elseif (is_array($data) && !empty($data) && is_array($data[0] ?? null)) {
    $headers = array_keys($data[0]);
    fputcsv($output, $headers);
    foreach ($data as $row) {
        fputcsv($output, array_map(static function ($header) use ($row) {
            return $row[$header] ?? '';
        }, $headers));
    }
} else {
    fputcsv($output, ['No data available']);
}

fclose($output);
