<?php
declare(strict_types=1);

require_once __DIR__ . '/../../backend/api/config/programs.php';

return static function (PDO $db): void {
    if (!gradtrack_migration_table_exists($db, 'programs')) {
        throw new RuntimeException('Required baseline table programs is missing.');
    }

    // Some official specialization codes and names exceed the original limits.
    $db->exec('ALTER TABLE programs MODIFY name VARCHAR(255) NOT NULL');
    $db->exec('ALTER TABLE programs MODIFY code VARCHAR(32) NOT NULL');

    $db->exec(
        "CREATE TABLE IF NOT EXISTS program_code_catalog (
            id INT NOT NULL AUTO_INCREMENT,
            normalized_name VARCHAR(255) NOT NULL,
            official_name VARCHAR(255) NOT NULL,
            program_code VARCHAR(32) NOT NULL,
            alternate_codes JSON NULL,
            created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_program_code_catalog_normalized_name (normalized_name),
            KEY idx_program_code_catalog_code (program_code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci"
    );

    $catalog = require __DIR__ . '/../program_code_catalog.php';
    $upsert = $db->prepare(
        'INSERT INTO program_code_catalog
         (normalized_name, official_name, program_code, alternate_codes)
         VALUES (:normalized_name, :official_name, :program_code, :alternate_codes)
         ON DUPLICATE KEY UPDATE
             official_name = VALUES(official_name),
             program_code = VALUES(program_code),
             alternate_codes = VALUES(alternate_codes)'
    );
    foreach ($catalog as $entry) {
        $officialName = gradtrack_program_clean_text($entry[0] ?? '');
        $programCode = gradtrack_program_normalize_code($entry[1] ?? '');
        $alternateCodes = array_values(array_filter(array_map(
            'gradtrack_program_normalize_code',
            is_array($entry[2] ?? null) ? $entry[2] : []
        )));
        if ($officialName === '' || !gradtrack_program_code_is_valid($programCode)) {
            throw new RuntimeException('Invalid program code catalog entry: ' . $officialName);
        }
        $upsert->execute([
            ':normalized_name' => gradtrack_program_normalize_name($officialName),
            ':official_name' => $officialName,
            ':program_code' => $programCode,
            ':alternate_codes' => $alternateCodes !== []
                ? json_encode($alternateCodes, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)
                : null,
        ]);
    }
};
