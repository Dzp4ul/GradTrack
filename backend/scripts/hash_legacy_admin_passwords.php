<?php

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('This migration can only run from the command line.');
}

require_once __DIR__ . '/../api/config/database.php';

$db = (new Database())->getConnection();
$db->beginTransaction();

try {
    $rows = $db->query('SELECT id, password FROM admin_users FOR UPDATE')->fetchAll(PDO::FETCH_ASSOC);
    $update = $db->prepare('UPDATE admin_users SET password = :password WHERE id = :id');
    $updated = 0;

    foreach ($rows as $row) {
        $storedPassword = (string) ($row['password'] ?? '');
        if (!empty(password_get_info($storedPassword)['algo'])) {
            continue;
        }

        $update->execute([
            ':password' => password_hash($storedPassword, PASSWORD_DEFAULT),
            ':id' => (int) $row['id'],
        ]);
        $updated++;
    }

    $db->commit();
    echo 'Legacy administrator passwords hashed: ' . $updated . PHP_EOL;
} catch (Throwable $exception) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    fwrite(STDERR, 'Legacy administrator password migration failed.' . PHP_EOL);
    exit(1);
}
