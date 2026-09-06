<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

define('GRADTRACK_SCHEMA_MIGRATION', true);
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/admin_roles.php';
require_once __DIR__ . '/../api/config/archive.php';
require_once __DIR__ . '/../api/config/admin_profile_image.php';
require_once __DIR__ . '/../api/config/alumni_registry.php';
require_once __DIR__ . '/../api/config/announcements.php';
require_once __DIR__ . '/../api/config/audit_trail.php';
require_once __DIR__ . '/../api/config/engagement_approval.php';
require_once __DIR__ . '/../api/config/forum.php';
require_once __DIR__ . '/../api/config/chat.php';
require_once __DIR__ . '/../api/config/genai_conversations.php';
require_once __DIR__ . '/../api/config/graduate_auth.php';
require_once __DIR__ . '/../api/config/graduate_profile.php';
require_once __DIR__ . '/../api/config/public_content.php';
require_once __DIR__ . '/../api/config/survey_reminders.php';
require_once __DIR__ . '/../api/config/system_settings.php';

function gradtrack_migration_table_exists(PDO $db, string $table): bool
{
    $stmt = $db->prepare('SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table');
    $stmt->execute([':table' => $table]);
    return (int) $stmt->fetchColumn() > 0;
}

function gradtrack_migration_column_exists(PDO $db, string $table, string $column): bool
{
    $stmt = $db->prepare('SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column');
    $stmt->execute([':table' => $table, ':column' => $column]);
    return (int) $stmt->fetchColumn() > 0;
}

function gradtrack_migration_add_column(PDO $db, string $table, string $column, string $definition): void
{
    if (!gradtrack_migration_table_exists($db, $table)) {
        throw new RuntimeException("Required baseline table {$table} is missing. Import gradtrack_erd.sql first.");
    }
    if (!gradtrack_migration_column_exists($db, $table, $column)) {
        $db->exec("ALTER TABLE `{$table}` ADD COLUMN {$definition}");
    }
}

$arguments = array_slice($argv ?? [], 1);
$apply = in_array('--apply', $arguments, true);
$productionApproved = in_array('--production-approved', $arguments, true);
if (gradtrack_is_production() && $apply && !$productionApproved) {
    fwrite(STDERR, "Production migration requires --production-approved after backup and change approval.\n");
    exit(2);
}

$migrationFiles = glob(__DIR__ . '/../../database/migrations/*.php') ?: [];
sort($migrationFiles, SORT_STRING);
$db = (new Database())->getConnection();
$ledgerExists = gradtrack_migration_table_exists($db, 'schema_migrations');
$applied = [];
if ($ledgerExists) {
    foreach ($db->query('SELECT version, checksum FROM schema_migrations')->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $applied[(string) $row['version']] = (string) $row['checksum'];
    }
}

if (!$apply) {
    foreach ($migrationFiles as $file) {
        $version = basename($file, '.php');
        $state = isset($applied[$version]) ? 'applied' : 'pending';
        echo "{$state}: {$version}\n";
    }
    echo "No database changes were made. Use --apply to run pending migrations.\n";
    exit(0);
}

if (!$ledgerExists) {
    $db->exec("CREATE TABLE schema_migrations (
        version VARCHAR(190) NOT NULL PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

$insert = $db->prepare('INSERT INTO schema_migrations (version, checksum) VALUES (:version, :checksum)');
foreach ($migrationFiles as $file) {
    $version = basename($file, '.php');
    $checksum = hash_file('sha256', $file);
    if ($checksum === false) throw new RuntimeException("Unable to checksum migration {$version}.");
    if (isset($applied[$version])) {
        if (!hash_equals($applied[$version], $checksum)) {
            throw new RuntimeException("Applied migration {$version} has been modified.");
        }
        echo "skipped: {$version}\n";
        continue;
    }

    $migration = require $file;
    if (!is_callable($migration)) throw new RuntimeException("Migration {$version} must return a callable.");
    echo "applying: {$version}\n";
    $migration($db);
    $insert->execute([':version' => $version, ':checksum' => $checksum]);
    echo "applied: {$version}\n";
}

echo "Database migrations complete.\n";
