<?php

declare(strict_types=1);

require_once __DIR__ . '/../backend/api/config/database.php';

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This documentation utility is CLI-only.\n");
    exit(1);
}

$targetDatabase = $argv[1] ?? '';
if (preg_match('/^gradtrack_manual_doc_[0-9]{8}$/', $targetDatabase) !== 1) {
    fwrite(STDERR, "Target must match gradtrack_manual_doc_YYYYMMDD.\n");
    exit(1);
}

$source = (new Database())->getConnection();
$local = new PDO(
    'mysql:host=127.0.0.1;port=3306;charset=utf8mb4',
    'root',
    '',
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]
);

$quotedTarget = '`' . str_replace('`', '``', $targetDatabase) . '`';
$local->exec("CREATE DATABASE IF NOT EXISTS {$quotedTarget} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$local->exec("USE {$quotedTarget}");
$local->exec('SET FOREIGN_KEY_CHECKS = 0');

$tableColumn = 'Tables_in_' . (string) $source->query('SELECT DATABASE()')->fetchColumn();
$tableRows = $source->query('SHOW FULL TABLES WHERE Table_type = \'BASE TABLE\'')->fetchAll(PDO::FETCH_ASSOC);
$tables = array_map(static fn (array $row): string => (string) $row[$tableColumn], $tableRows);

foreach ($tables as $table) {
    $quotedTable = '`' . str_replace('`', '``', $table) . '`';
    $createRow = $source->query("SHOW CREATE TABLE {$quotedTable}")->fetch(PDO::FETCH_ASSOC);
    $createSql = (string) ($createRow['Create Table'] ?? '');
    if ($createSql === '') {
        throw new RuntimeException("Unable to read schema for {$table}");
    }
    $createSql = str_replace('utf8mb4_0900_ai_ci', 'utf8mb4_unicode_ci', $createSql);
    $local->exec("DROP TABLE IF EXISTS {$quotedTable}");
    $local->exec($createSql);

    $columns = $source->query("SHOW COLUMNS FROM {$quotedTable}")->fetchAll(PDO::FETCH_COLUMN);
    if ($columns === []) {
        echo "{$table}|0\n";
        continue;
    }
    $quotedColumns = array_map(
        static fn (string $column): string => '`' . str_replace('`', '``', $column) . '`',
        $columns
    );
    $placeholders = array_fill(0, count($columns), '?');
    $insert = $local->prepare(sprintf(
        'INSERT INTO %s (%s) VALUES (%s)',
        $quotedTable,
        implode(',', $quotedColumns),
        implode(',', $placeholders)
    ));

    $select = $source->query("SELECT * FROM {$quotedTable}", PDO::FETCH_NUM);
    $count = 0;
    $local->beginTransaction();
    while (($row = $select->fetch(PDO::FETCH_NUM)) !== false) {
        $insert->execute($row);
        $count++;
        if ($count % 1000 === 0) {
            $local->commit();
            $local->beginTransaction();
        }
    }
    $local->commit();
    echo "{$table}|{$count}\n";
}

$local->exec('SET FOREIGN_KEY_CHECKS = 1');
echo "CLONE_COMPLETE|{$targetDatabase}|" . count($tables) . "\n";
