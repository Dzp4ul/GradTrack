<?php
header('Content-Type: application/json');

require_once __DIR__ . '/../config/database.php';

$database = new Database();
$db = $database->getConnection();

function gradtrack_address_migration_column_exists(PDO $db, string $column): bool
{
    $stmt = $db->prepare('SHOW COLUMNS FROM survey_responses LIKE :column');
    $stmt->execute([':column' => $column]);
    return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
}

function gradtrack_address_migration_index_exists(PDO $db, string $index): bool
{
    $stmt = $db->prepare('SHOW INDEX FROM survey_responses WHERE Key_name = :index_name');
    $stmt->execute([':index_name' => $index]);
    return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
}

function gradtrack_address_migration_add_column(PDO $db, string $column, string $definition): bool
{
    if (gradtrack_address_migration_column_exists($db, $column)) {
        return false;
    }

    $db->exec("ALTER TABLE survey_responses ADD COLUMN {$column} {$definition}");
    return true;
}

function gradtrack_address_migration_add_index(PDO $db, string $index, string $columns): bool
{
    if (gradtrack_address_migration_index_exists($db, $index)) {
        return false;
    }

    $db->exec("CREATE INDEX {$index} ON survey_responses ({$columns})");
    return true;
}

try {
    $addedColumns = [];
    $updatedColumns = [];
    $addedIndexes = [];

    $columns = [
        'region_code' => 'VARCHAR(10) NULL',
        'region_name' => 'VARCHAR(120) NULL',
        'province_code' => 'VARCHAR(10) NULL',
        'province_name' => 'VARCHAR(120) NULL',
        'city_municipality_code' => 'VARCHAR(10) NULL',
        'city_municipality_name' => 'VARCHAR(160) NULL',
        'barangay_code' => 'VARCHAR(10) NULL',
        'barangay_name' => 'VARCHAR(160) NULL',
    ];

    foreach ($columns as $column => $definition) {
        if (gradtrack_address_migration_add_column($db, $column, $definition)) {
            $addedColumns[] = $column;
        }
    }

    if (gradtrack_address_migration_column_exists($db, 'barangay_code')) {
        $db->exec('ALTER TABLE survey_responses MODIFY COLUMN barangay_code VARCHAR(10) NULL');
        $updatedColumns[] = 'barangay_code nullable';
        $db->exec("UPDATE survey_responses SET barangay_code = NULL WHERE barangay_code IS NOT NULL AND TRIM(barangay_code) = ''");
        $db->exec("UPDATE survey_responses SET barangay_code = TRIM(barangay_code) WHERE barangay_code IS NOT NULL AND barangay_code <> TRIM(barangay_code)");
    }

    if (gradtrack_address_migration_column_exists($db, 'barangay_name')) {
        $db->exec('ALTER TABLE survey_responses MODIFY COLUMN barangay_name VARCHAR(160) NULL');
        $updatedColumns[] = 'barangay_name nullable';
        $db->exec("UPDATE survey_responses SET barangay_name = NULL WHERE barangay_name IS NOT NULL AND TRIM(barangay_name) = ''");
        $db->exec("UPDATE survey_responses SET barangay_name = TRIM(barangay_name) WHERE barangay_name IS NOT NULL AND barangay_name <> TRIM(barangay_name)");
    }

    $indexDefinitions = [
        'idx_sr_survey_submitted' => 'survey_id, submitted_at',
        'idx_sr_survey_graduate' => 'survey_id, graduate_id',
        'idx_sr_survey_region' => 'survey_id, region_code',
        'idx_sr_survey_province' => 'survey_id, province_code',
        'idx_sr_survey_city' => 'survey_id, city_municipality_code',
        'idx_sr_survey_barangay' => 'survey_id, barangay_code',
    ];

    foreach ($indexDefinitions as $index => $columnsSql) {
        if (gradtrack_address_migration_add_index($db, $index, $columnsSql)) {
            $addedIndexes[] = $index;
        }
    }

    echo json_encode([
        'success' => true,
        'message' => 'Survey address analytics migration completed safely.',
        'added_columns' => $addedColumns,
        'updated_columns' => $updatedColumns,
        'added_indexes' => $addedIndexes,
        'data_policy' => 'No Barangay was assigned or guessed for historical records.',
    ], JSON_PRETTY_PRINT);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
    ], JSON_PRETTY_PRINT);
}

