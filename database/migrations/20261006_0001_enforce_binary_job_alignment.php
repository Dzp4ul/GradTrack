<?php
declare(strict_types=1);

return static function (PDO $db): void {
    if (!gradtrack_migration_table_exists($db, 'employment')) {
        throw new RuntimeException('Required baseline table employment is missing.');
    }

    $legacyRowCount = (int) $db->query(
        "SELECT COUNT(*) FROM employment WHERE is_aligned = 'partially_aligned'"
    )->fetchColumn();
    if ($legacyRowCount > 0) {
        throw new RuntimeException(
            "Cannot narrow employment.is_aligned while {$legacyRowCount} legacy partial-alignment record(s) remain. " .
            'No data was changed; review those records manually before retrying.'
        );
    }

    $db->exec(
        "ALTER TABLE employment
         MODIFY is_aligned ENUM('aligned','not_aligned') DEFAULT 'not_aligned'"
    );
};
