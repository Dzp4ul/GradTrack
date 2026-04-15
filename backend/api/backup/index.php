<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(["success" => false, "error" => "Authentication required"]);
    exit;
}

if (!isset($_SESSION['role']) || $_SESSION['role'] !== 'super_admin') {
    http_response_code(403);
    echo json_encode(["success" => false, "error" => "Only super admin can back up the database"]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(["success" => false, "error" => "Method not allowed"]);
    exit;
}

$database = new Database();
$db = $database->getConnection();
$action = isset($_GET['action']) ? trim((string) $_GET['action']) : 'summary';

function quoteIdentifier(string $identifier): string
{
    if ($identifier === '' || strpos($identifier, "\0") !== false) {
        throw new InvalidArgumentException('Invalid database identifier');
    }

    return '`' . str_replace('`', '``', $identifier) . '`';
}

function getDatabaseName(PDO $db): string
{
    $stmt = $db->query('SELECT DATABASE() AS database_name');
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return (string) ($row['database_name'] ?? '');
}

function getTableStats(PDO $db, string $databaseName): array
{
    $stmt = $db->prepare("
        SELECT
            TABLE_NAME AS table_name,
            COALESCE(TABLE_ROWS, 0) AS estimated_rows,
            COALESCE(DATA_LENGTH, 0) AS data_length,
            COALESCE(INDEX_LENGTH, 0) AS index_length
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = :schema
            AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
    ");
    $stmt->execute([':schema' => $databaseName]);
    $tables = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $stats = [];
    foreach ($tables as $table) {
        $tableName = (string) $table['table_name'];
        $countStmt = $db->query('SELECT COUNT(*) AS row_count FROM ' . quoteIdentifier($tableName));
        $countRow = $countStmt->fetch(PDO::FETCH_ASSOC);
        $rowCount = (int) ($countRow['row_count'] ?? 0);
        $sizeBytes = (int) $table['data_length'] + (int) $table['index_length'];

        $stats[] = [
            'table_name' => $tableName,
            'row_count' => $rowCount,
            'size_bytes' => $sizeBytes,
        ];
    }

    return $stats;
}

function writeSqlValue(PDO $db, $value): string
{
    if ($value === null) {
        return 'NULL';
    }

    if (is_bool($value)) {
        return $value ? '1' : '0';
    }

    return $db->quote((string) $value);
}

function writeInsertBatch(string $tableName, array $columns, array $rows): void
{
    if (count($rows) === 0) {
        return;
    }

    $columnSql = implode(', ', array_map('quoteIdentifier', $columns));

    echo 'INSERT INTO ' . quoteIdentifier($tableName) . ' (' . $columnSql . ") VALUES\n";
    echo implode(",\n", $rows);
    echo ";\n\n";
}

function streamDatabaseBackup(PDO $db, string $databaseName, array $tables): void
{
    if (function_exists('set_time_limit')) {
        set_time_limit(0);
    }

    $filename = 'gradtrack_backup_' . date('Ymd_His') . '.sql';

    header_remove('Content-Type');
    header('Content-Type: application/sql; charset=UTF-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Access-Control-Expose-Headers: Content-Disposition');
    header('X-Content-Type-Options: nosniff');

    echo "-- GradTrack database backup\n";
    echo "-- Database: " . $databaseName . "\n";
    echo "-- Generated: " . date('c') . "\n\n";
    echo "SET SQL_MODE = \"NO_AUTO_VALUE_ON_ZERO\";\n";
    echo "SET time_zone = \"+00:00\";\n";
    echo "SET FOREIGN_KEY_CHECKS = 0;\n\n";

    foreach ($tables as $table) {
        $tableName = $table['table_name'];
        $quotedTable = quoteIdentifier($tableName);

        echo "-- --------------------------------------------------------\n";
        echo "-- Table structure for " . $quotedTable . "\n\n";
        echo "DROP TABLE IF EXISTS " . $quotedTable . ";\n";

        $createStmt = $db->query('SHOW CREATE TABLE ' . $quotedTable);
        $createRow = $createStmt->fetch(PDO::FETCH_ASSOC);
        echo $createRow['Create Table'] . ";\n\n";

        echo "-- Data for " . $quotedTable . "\n\n";

        $rowStmt = $db->query('SELECT * FROM ' . $quotedTable);
        $columns = [];
        $batch = [];

        while ($row = $rowStmt->fetch(PDO::FETCH_ASSOC)) {
            if (count($columns) === 0) {
                $columns = array_keys($row);
            }

            $values = [];
            foreach ($columns as $column) {
                $values[] = writeSqlValue($db, $row[$column]);
            }

            $batch[] = '(' . implode(', ', $values) . ')';

            if (count($batch) >= 100) {
                writeInsertBatch($tableName, $columns, $batch);
                $batch = [];
            }
        }

        writeInsertBatch($tableName, $columns, $batch);
    }

    echo "SET FOREIGN_KEY_CHECKS = 1;\n";
}

try {
    $databaseName = getDatabaseName($db);
    $tables = getTableStats($db, $databaseName);

    if ($action === 'download') {
        streamDatabaseBackup($db, $databaseName, $tables);
        exit;
    }

    if ($action !== 'summary') {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Invalid backup action"]);
        exit;
    }

    $totalRows = 0;
    $totalSizeBytes = 0;
    foreach ($tables as $table) {
        $totalRows += (int) $table['row_count'];
        $totalSizeBytes += (int) $table['size_bytes'];
    }

    echo json_encode([
        "success" => true,
        "data" => [
            "database_name" => $databaseName,
            "generated_at" => date('c'),
            "table_count" => count($tables),
            "total_rows" => $totalRows,
            "size_bytes" => $totalSizeBytes,
            "tables" => $tables,
        ],
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
