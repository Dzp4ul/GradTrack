<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}

$targetDatabase = $argv[1] ?? '';
if (preg_match('/^gradtrack_manual_doc_[0-9]{8}$/', $targetDatabase) !== 1) {
    fwrite(STDERR, "Invalid documentation database name.\n");
    exit(1);
}

$password = (string) getenv('GRADTRACK_MANUAL_DB_PASSWORD');
if (strlen($password) < 16) {
    fwrite(STDERR, "GRADTRACK_MANUAL_DB_PASSWORD must contain at least 16 characters.\n");
    exit(1);
}

$db = new PDO(
    'mysql:host=127.0.0.1;port=3306;charset=utf8mb4',
    'root',
    '',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

$quotedPassword = $db->quote($password);
$db->exec("CREATE USER IF NOT EXISTS 'gradtrack_manual'@'127.0.0.1' IDENTIFIED BY {$quotedPassword}");
$db->exec("ALTER USER 'gradtrack_manual'@'127.0.0.1' IDENTIFIED BY {$quotedPassword}");
$quotedDatabase = '`' . str_replace('`', '``', $targetDatabase) . '`';
$db->exec("GRANT ALL PRIVILEGES ON {$quotedDatabase}.* TO 'gradtrack_manual'@'127.0.0.1'");
$db->exec('FLUSH PRIVILEGES');

echo "MANUAL_DATABASE_USER_READY|{$targetDatabase}\n";
