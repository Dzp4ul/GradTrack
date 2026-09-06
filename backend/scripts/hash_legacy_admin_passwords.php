<?php

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('This migration can only run from the command line.');
}

require_once __DIR__ . '/../api/config/database.php';

$arguments = array_slice($argv ?? [], 1);
$mode = in_array('--apply', $arguments, true)
    ? 'apply'
    : (in_array('--verify', $arguments, true) ? 'verify' : 'dry-run');

if (in_array('--apply', $arguments, true) && in_array('--verify', $arguments, true)) {
    fwrite(STDERR, "Choose only one mode: --apply or --verify. Omit both for a dry run.\n");
    exit(2);
}

$db = (new Database())->getConnection();

try {
    if ($mode === 'apply') $db->beginTransaction();
    $sql = 'SELECT id, password FROM admin_users' . ($mode === 'apply' ? ' FOR UPDATE' : '');
    $rows = $db->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    $legacyIds = [];

    foreach ($rows as $row) {
        if (empty(password_get_info((string) ($row['password'] ?? ''))['algo'])) {
            $legacyIds[] = (int) $row['id'];
        }
    }

    $updated = 0;
    if ($mode === 'apply' && $legacyIds !== []) {
        $update = $db->prepare('UPDATE admin_users SET password = :password WHERE id = :id');
        foreach ($rows as $row) {
            if (!in_array((int) $row['id'], $legacyIds, true)) continue;
            $update->execute([
                ':password' => password_hash((string) ($row['password'] ?? ''), PASSWORD_DEFAULT),
                ':id' => (int) $row['id'],
            ]);
            $updated++;
        }
    }
    if ($mode === 'apply') $db->commit();

    echo json_encode([
        'mode' => $mode,
        'accounts_scanned' => count($rows),
        'legacy_passwords_found' => count($legacyIds),
        'passwords_updated' => $updated,
        'verified' => $mode === 'verify' ? $legacyIds === [] : null,
    ], JSON_PRETTY_PRINT) . PHP_EOL;

    if ($mode === 'verify' && $legacyIds !== []) exit(2);
} catch (Throwable $exception) {
    if ($db->inTransaction()) $db->rollBack();
    error_log('Legacy administrator password migration failed: ' . $exception->getMessage());
    fwrite(STDERR, 'Legacy administrator password migration failed. See the server log.\n');
    exit(1);
}
