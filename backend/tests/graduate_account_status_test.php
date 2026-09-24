<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config/graduate_account_status.php';

$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('CREATE TABLE graduate_accounts (id INTEGER PRIMARY KEY, status TEXT NOT NULL, last_login_at TEXT NULL)');
$insert = $db->prepare('INSERT INTO graduate_accounts (id, status, last_login_at) VALUES (?, ?, ?)');
$insert->execute([1, 'active', '2025-09-24 12:00:00']);
$insert->execute([2, 'active', '2025-09-24 12:00:01']);
$insert->execute([3, 'inactive', '2020-01-01 00:00:00']);
$insert->execute([4, 'active', null]);

$changed = gradtrack_disable_inactive_graduate_accounts($db, new DateTimeImmutable('2026-09-24 12:00:00'));
$rows = $db->query('SELECT id, status FROM graduate_accounts ORDER BY id')->fetchAll(PDO::FETCH_KEY_PAIR);

$failures = 0;
$assert = static function (bool $condition, string $message) use (&$failures): void {
    if (!$condition) {
        $failures++;
        echo "FAIL: {$message}" . PHP_EOL;
        return;
    }
    echo "PASS: {$message}" . PHP_EOL;
};

$assert($changed === 1, 'only active accounts at least one year past last login are disabled');
$assert(($rows[1] ?? null) === 'disabled', 'the exact one-year cutoff is inclusive');
$assert(($rows[2] ?? null) === 'active', 'a login newer than one year remains active');
$assert(($rows[3] ?? null) === 'inactive', 'an existing non-active status is preserved');
$assert(($rows[4] ?? null) === 'active', 'an account without a last-login timestamp is not guessed to be one year inactive');
$assert(str_contains(gradtrack_registry_account_status_sql('ga'), "THEN 'disabled'"), 'registry account status keeps Disabled distinct from Inactive');

if ($failures > 0) {
    echo PHP_EOL . "{$failures} graduate account status test(s) failed." . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All graduate account status tests passed.' . PHP_EOL;
