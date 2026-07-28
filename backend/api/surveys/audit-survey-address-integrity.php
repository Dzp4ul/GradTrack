<?php
header('Content-Type: application/json');

require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();

function gradtrack_audit_fetch_one(PDO $db, string $sql, array $params = []): array
{
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    return $row ?: [];
}

function gradtrack_audit_fetch_all(PDO $db, string $sql, array $params = []): array
{
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

try {
    $surveyId = null;
    if (isset($_GET['survey_id']) && is_scalar($_GET['survey_id']) && trim((string)$_GET['survey_id']) !== '') {
        $surveyIdText = trim((string)$_GET['survey_id']);
        if (!ctype_digit($surveyIdText) || (int)$surveyIdText <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid survey_id parameter.']);
            exit;
        }

        $surveyId = (int)$surveyIdText;
    }

    $where = $surveyId !== null ? 'WHERE survey_id = :survey_id' : '';
    $submittedWhere = $surveyId !== null ? 'WHERE survey_id = :survey_id AND submitted_at IS NOT NULL' : 'WHERE submitted_at IS NOT NULL';
    $params = $surveyId !== null ? [':survey_id' => $surveyId] : [];

    $summary = gradtrack_audit_fetch_one($db, "
        SELECT
            COUNT(DISTINCT id) AS total_submitted_survey_responses,
            COUNT(DISTINCT CASE
                WHEN graduate_id IS NOT NULL THEN CONCAT('graduate:', graduate_id)
                ELSE CONCAT('response:', id)
            END) AS total_unique_respondents,
            SUM(CASE
                WHEN (barangay_code IS NOT NULL AND TRIM(barangay_code) <> '')
                  OR (barangay_name IS NOT NULL AND TRIM(barangay_name) <> '')
                THEN 1 ELSE 0
            END) AS records_with_barangay,
            SUM(CASE
                WHEN (barangay_code IS NULL OR TRIM(barangay_code) = '')
                 AND (barangay_name IS NULL OR TRIM(barangay_name) = '')
                THEN 1 ELSE 0
            END) AS records_without_barangay,
            SUM(CASE
                WHEN barangay_name IS NOT NULL AND TRIM(barangay_name) <> ''
                 AND (barangay_code IS NULL OR TRIM(barangay_code) = '')
                THEN 1 ELSE 0
            END) AS barangay_names_without_code,
            SUM(CASE
                WHEN barangay_code IS NOT NULL AND TRIM(barangay_code) <> ''
                 AND (barangay_name IS NULL OR TRIM(barangay_name) = '')
                THEN 1 ELSE 0
            END) AS barangay_codes_without_name,
            SUM(CASE
                WHEN (barangay_code IS NOT NULL AND barangay_code <> TRIM(barangay_code))
                  OR (barangay_name IS NOT NULL AND barangay_name <> TRIM(barangay_name))
                  OR (barangay_code IS NOT NULL AND TRIM(barangay_code) = '')
                  OR (barangay_name IS NOT NULL AND TRIM(barangay_name) = '')
                THEN 1 ELSE 0
            END) AS empty_or_whitespace_barangay_values
        FROM survey_responses
        {$submittedWhere}
    ", $params);

    $duplicates = gradtrack_audit_fetch_all($db, "
        SELECT
            survey_id,
            graduate_id,
            COUNT(*) AS duplicate_count,
            GROUP_CONCAT(id ORDER BY id ASC) AS survey_response_ids
        FROM survey_responses
        {$where}
        " . ($where === '' ? 'WHERE' : 'AND') . " graduate_id IS NOT NULL
        GROUP BY survey_id, graduate_id
        HAVING COUNT(*) > 1
        ORDER BY duplicate_count DESC, survey_id ASC, graduate_id ASC
    ", $params);

    $samples = [
        'barangay_name_without_code' => gradtrack_audit_fetch_all($db, "
            SELECT id, survey_id, graduate_id, barangay_code, barangay_name
            FROM survey_responses
            {$where}
            " . ($where === '' ? 'WHERE' : 'AND') . " barangay_name IS NOT NULL
              AND TRIM(barangay_name) <> ''
              AND (barangay_code IS NULL OR TRIM(barangay_code) = '')
            ORDER BY id ASC
            LIMIT 25
        ", $params),
        'barangay_code_without_name' => gradtrack_audit_fetch_all($db, "
            SELECT id, survey_id, graduate_id, barangay_code, barangay_name
            FROM survey_responses
            {$where}
            " . ($where === '' ? 'WHERE' : 'AND') . " barangay_code IS NOT NULL
              AND TRIM(barangay_code) <> ''
              AND (barangay_name IS NULL OR TRIM(barangay_name) = '')
            ORDER BY id ASC
            LIMIT 25
        ", $params),
        'empty_or_whitespace_barangay' => gradtrack_audit_fetch_all($db, "
            SELECT id, survey_id, graduate_id, barangay_code, barangay_name
            FROM survey_responses
            {$where}
            " . ($where === '' ? 'WHERE' : 'AND') . " (
                (barangay_code IS NOT NULL AND barangay_code <> TRIM(barangay_code))
                OR (barangay_name IS NOT NULL AND barangay_name <> TRIM(barangay_name))
                OR (barangay_code IS NOT NULL AND TRIM(barangay_code) = '')
                OR (barangay_name IS NOT NULL AND TRIM(barangay_name) = '')
            )
            ORDER BY id ASC
            LIMIT 25
        ", $params),
    ];

    echo json_encode([
        'success' => true,
        'survey_id' => $surveyId,
        'summary' => array_map(static function ($value) {
            return is_numeric($value) ? (int)$value : $value;
        }, $summary),
        'duplicate_survey_response_records' => $duplicates,
        'samples' => $samples,
        'data_policy' => 'Read-only audit. No data was modified.',
    ], JSON_PRETTY_PRINT);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
    ], JSON_PRETTY_PRINT);
}

