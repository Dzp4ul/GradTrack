<?php
require_once __DIR__ . '/archive.php';

if (!function_exists('gradtrack_alumni_registry_admin_roles')) {
    function gradtrack_alumni_registry_admin_roles(): array
    {
        return ['alumni_admin'];
    }
}

if (!function_exists('gradtrack_alumni_registry_statuses')) {
    function gradtrack_alumni_registry_statuses(): array
    {
        return ['Unclaimed', 'Registered', 'Verified', 'Inactive'];
    }
}

if (!function_exists('gradtrack_alumni_registry_canonical_courses')) {
    function gradtrack_alumni_registry_canonical_courses(): array
    {
        return [
            'BSCS' => [
                'name' => 'Bachelor of Science in Computer Science',
                'aliases' => [
                    'BSCS',
                    'B.S.C.S.',
                    'BS Computer Science',
                    'Bachelor Science Computer Science',
                    'Bachelor of Science in Computer Science',
                ],
            ],
            'ACT' => [
                'name' => 'Associate in Computer Technology',
                'aliases' => [
                    'ACT',
                    'A.C.T.',
                    'Associate Computer Technology',
                    'Associate in Computer Technology',
                ],
            ],
            'BSHM' => [
                'name' => 'Bachelor of Science in Hotel and Restaurant Management',
                'aliases' => [
                    'BSHM',
                    'BSHRM',
                    'B.S.H.M.',
                    'Bachelor of Science in Hotel and Restaurant Management',
                    'Bachelor of Science in Hospitality Management',
                    'Hotel and Restaurant Management',
                    'Hospitality Management',
                ],
            ],
            'BSED' => [
                'name' => 'Bachelor of Secondary Education',
                'aliases' => [
                    'BSED',
                    'B.S.Ed.',
                    'Bachelor of Secondary Education',
                    'Bachelor Secondary Education',
                    'Secondary Education',
                ],
            ],
            'BEED' => [
                'name' => 'Bachelor of Elementary Education',
                'aliases' => [
                    'BEED',
                    'B.E.Ed.',
                    'Bachelor of Elementary Education',
                    'Bachelor Elementary Education',
                    'Elementary Education',
                ],
            ],
            'BSN' => [
                'name' => 'Bachelor of Science in Nursing',
                'aliases' => [
                    'BSN',
                    'B.S.N.',
                    'BS Nursing',
                    'Bachelor Science Nursing',
                    'Bachelor of Science in Nursing',
                    'Nursing',
                ],
            ],
        ];
    }
}

if (!function_exists('gradtrack_alumni_registry_clean_text')) {
    function gradtrack_alumni_registry_clean_text($value, int $maxLength = 255): string
    {
        $text = preg_replace('/\s+/', ' ', trim((string) ($value ?? ''))) ?: '';
        if ($text === '') {
            return '';
        }

        if (function_exists('mb_substr')) {
            return mb_substr($text, 0, $maxLength, 'UTF-8');
        }

        return substr($text, 0, $maxLength);
    }
}

if (!function_exists('gradtrack_alumni_registry_lower')) {
    function gradtrack_alumni_registry_lower(string $value): string
    {
        if (function_exists('mb_strtolower')) {
            return mb_strtolower($value, 'UTF-8');
        }

        return strtolower($value);
    }
}

if (!function_exists('gradtrack_alumni_registry_normalize_name')) {
    function gradtrack_alumni_registry_normalize_name($value): string
    {
        $text = gradtrack_alumni_registry_clean_text($value, 180);
        if ($text === '') {
            return '';
        }

        $text = gradtrack_alumni_registry_lower($text);

        if (strpos($text, ',') !== false) {
            $parts = array_map('trim', explode(',', $text, 2));
            $last = $parts[0] ?? '';
            $given = $parts[1] ?? '';
            $text = trim($given . ' ' . $last);
        }

        $text = preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $text);
        if ($text === null) {
            $text = preg_replace('/[^a-z0-9\s]/', ' ', $value);
        }

        return preg_replace('/\s+/', ' ', trim((string) $text)) ?: '';
    }
}

if (!function_exists('gradtrack_alumni_registry_normalize_course_key')) {
    function gradtrack_alumni_registry_normalize_course_key($value): string
    {
        $text = gradtrack_alumni_registry_lower(gradtrack_alumni_registry_clean_text($value, 180));
        $text = str_replace('&', ' and ', $text);
        $text = preg_replace('/[^a-z0-9]+/', ' ', $text) ?: '';
        $text = preg_replace('/\s+/', ' ', trim($text)) ?: '';

        return $text;
    }
}

if (!function_exists('gradtrack_alumni_registry_canonical_course_from_text')) {
    function gradtrack_alumni_registry_canonical_course_from_text($value): ?array
    {
        $key = gradtrack_alumni_registry_normalize_course_key($value);
        if ($key === '') {
            return null;
        }

        foreach (gradtrack_alumni_registry_canonical_courses() as $code => $course) {
            $aliases = array_merge([$code, $course['name']], $course['aliases']);
            foreach ($aliases as $alias) {
                if ($key === gradtrack_alumni_registry_normalize_course_key($alias)) {
                    return [
                        'code' => $code,
                        'name' => $course['name'],
                    ];
                }
            }
        }

        return null;
    }
}

if (!function_exists('gradtrack_alumni_registry_normalize_batch_year')) {
    function gradtrack_alumni_registry_normalize_batch_year($value): ?int
    {
        $text = gradtrack_alumni_registry_clean_text($value, 20);
        if ($text === '') {
            return null;
        }

        if (preg_match('/^\d{4}$/', $text) !== 1) {
            return null;
        }

        $year = (int) $text;
        $currentYear = (int) date('Y');
        if ($year < 1950 || $year > $currentYear) {
            return null;
        }

        return $year;
    }
}

if (!function_exists('gradtrack_alumni_registry_is_placeholder_name')) {
    function gradtrack_alumni_registry_is_placeholder_name(string $value): bool
    {
        $key = gradtrack_alumni_registry_normalize_course_key($value);
        if ($key === '') {
            return false;
        }

        $exact = [
            'name',
            'alumni name',
            'full name',
            'registered alumni',
            'graduate name',
            'course',
            'batch',
            'total',
            'grand total',
            'members',
            'member count',
            'summary',
        ];

        if (in_array($key, $exact, true)) {
            return true;
        }

        return preg_match('/\b(total|summary|members?|count)\b/i', $value) === 1;
    }
}

if (!function_exists('gradtrack_alumni_registry_row_is_ignorable')) {
    function gradtrack_alumni_registry_row_is_ignorable(string $name, string $course, string $batch): bool
    {
        if ($name === '' && $course === '' && $batch === '') {
            return true;
        }

        $nameKey = gradtrack_alumni_registry_normalize_course_key($name);
        $courseKey = gradtrack_alumni_registry_normalize_course_key($course);
        $batchKey = gradtrack_alumni_registry_normalize_course_key($batch);
        $joined = trim($nameKey . ' ' . $courseKey . ' ' . $batchKey);

        if ($nameKey === 'name' && $courseKey === 'course' && $batchKey === 'batch') {
            return true;
        }

        if (in_array($joined, ['registered alumni', 'alumni registered list'], true)) {
            return true;
        }

        return preg_match('/\b(total|grand total|summary|members?|member count|course member)\b/i', $joined) === 1;
    }
}

if (!function_exists('gradtrack_alumni_registry_programs_by_code')) {
    function gradtrack_alumni_registry_programs_by_code(PDO $db): array
    {
        $stmt = $db->query('SELECT id, code, name FROM programs ORDER BY id ASC');
        $programs = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $code = strtoupper(trim((string) ($row['code'] ?? '')));
            if ($code !== '') {
                $programs[$code] = [
                    'id' => (int) $row['id'],
                    'code' => $code,
                    'name' => (string) ($row['name'] ?? ''),
                ];
            }
        }

        return $programs;
    }
}

if (!function_exists('gradtrack_alumni_registry_ensure_programs')) {
    function gradtrack_alumni_registry_ensure_programs(PDO $db): void
    {
        $existing = gradtrack_alumni_registry_programs_by_code($db);
        $insert = $db->prepare('INSERT INTO programs (name, code, description) VALUES (:name, :code, :description)');

        foreach (gradtrack_alumni_registry_canonical_courses() as $code => $course) {
            if (isset($existing[$code])) {
                continue;
            }

            $description = 'Official alumni registry course mapping';
            $insert->execute([
                ':name' => $course['name'],
                ':code' => $code,
                ':description' => $description,
            ]);
        }
    }
}

if (!function_exists('gradtrack_alumni_registry_match_course')) {
    function gradtrack_alumni_registry_match_course(PDO $db, $value): array
    {
        $raw = gradtrack_alumni_registry_clean_text($value, 180);
        if ($raw === '') {
            return ['valid' => false, 'error' => 'Course is required'];
        }

        $programs = gradtrack_alumni_registry_programs_by_code($db);
        $rawCode = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $raw) ?: '');
        if ($rawCode !== '' && isset($programs[$rawCode])) {
            return [
                'valid' => true,
                'course_id' => $programs[$rawCode]['id'],
                'course_name' => $programs[$rawCode]['name'],
                'course_code' => $programs[$rawCode]['code'],
            ];
        }

        $rawKey = gradtrack_alumni_registry_normalize_course_key($raw);
        foreach ($programs as $program) {
            if ($rawKey === gradtrack_alumni_registry_normalize_course_key($program['name'])) {
                return [
                    'valid' => true,
                    'course_id' => $program['id'],
                    'course_name' => $program['name'],
                    'course_code' => $program['code'],
                ];
            }
        }

        $canonical = gradtrack_alumni_registry_canonical_course_from_text($raw);
        if ($canonical === null) {
            return ['valid' => false, 'error' => 'Unrecognized course'];
        }

        $code = $canonical['code'];
        $program = $programs[$code] ?? null;

        return [
            'valid' => true,
            'course_id' => $program['id'] ?? null,
            'course_name' => $program['name'] ?? $canonical['name'],
            'course_code' => $code,
        ];
    }
}

if (!function_exists('gradtrack_alumni_registry_table_exists')) {
    function gradtrack_alumni_registry_table_exists(PDO $db, string $table): bool
    {
        $stmt = $db->prepare("SELECT COUNT(*) AS total
                              FROM INFORMATION_SCHEMA.TABLES
                              WHERE TABLE_SCHEMA = DATABASE()
                                AND TABLE_NAME = :table_name");
        $stmt->execute([':table_name' => $table]);

        return (int) ($stmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0) > 0;
    }
}

if (!function_exists('gradtrack_alumni_registry_ensure_schema')) {
    function gradtrack_alumni_registry_ensure_schema(PDO $db): void
    {
        gradtrack_alumni_registry_ensure_programs($db);

        $db->exec("CREATE TABLE IF NOT EXISTS alumni_import_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            file_name VARCHAR(255) NOT NULL,
            worksheet_name VARCHAR(120) NULL,
            total_rows INT NOT NULL DEFAULT 0,
            successful_rows INT NOT NULL DEFAULT 0,
            duplicate_rows INT NOT NULL DEFAULT 0,
            invalid_rows INT NOT NULL DEFAULT 0,
            updated_rows INT NOT NULL DEFAULT 0,
            imported_by INT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_alumni_import_history_imported_by (imported_by),
            INDEX idx_alumni_import_history_created_at (created_at),
            CONSTRAINT fk_alumni_import_history_admin FOREIGN KEY (imported_by) REFERENCES admin_users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $db->exec("CREATE TABLE IF NOT EXISTS registered_alumni (
            id INT AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(180) NOT NULL,
            normalized_name VARCHAR(180) NOT NULL,
            course_id INT NULL,
            course_name VARCHAR(180) NOT NULL,
            course_code VARCHAR(10) NOT NULL,
            batch_year INT NOT NULL,
            registration_status ENUM('Unclaimed', 'Registered', 'Verified', 'Inactive') NOT NULL DEFAULT 'Unclaimed',
            linked_user_id INT NULL,
            source_file VARCHAR(255) NULL,
            import_batch_id INT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_registered_alumni_identity (normalized_name, course_code, batch_year),
            UNIQUE KEY uq_registered_alumni_linked_user (linked_user_id),
            INDEX idx_registered_alumni_normalized_name (normalized_name),
            INDEX idx_registered_alumni_course_id (course_id),
            INDEX idx_registered_alumni_course_code (course_code),
            INDEX idx_registered_alumni_batch_year (batch_year),
            INDEX idx_registered_alumni_status (registration_status),
            INDEX idx_registered_alumni_linked_user (linked_user_id),
            INDEX idx_registered_alumni_import_batch (import_batch_id),
            CONSTRAINT fk_registered_alumni_course FOREIGN KEY (course_id) REFERENCES programs(id) ON DELETE SET NULL,
            CONSTRAINT fk_registered_alumni_linked_user FOREIGN KEY (linked_user_id) REFERENCES graduate_accounts(id) ON DELETE SET NULL,
            CONSTRAINT fk_registered_alumni_import_batch FOREIGN KEY (import_batch_id) REFERENCES alumni_import_history(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        gradtrack_ensure_archive_schema($db, 'registered_alumni');
        gradtrack_ensure_archive_schema($db, 'graduates');
    }
}

if (!function_exists('gradtrack_alumni_registry_current_admin')) {
    function gradtrack_alumni_registry_current_admin(PDO $db): ?array
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        if (!isset($_SESSION['user_id'])) {
            $sessionEmail = gradtrack_alumni_registry_clean_text($_SESSION['email'] ?? '');
            if ($sessionEmail !== '') {
                $stmt = $db->prepare('SELECT id, role, full_name, email FROM admin_users WHERE email = :email LIMIT 1');
                $stmt->execute([':email' => $sessionEmail]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);

                if ($row) {
                    $_SESSION['user_id'] = (int) $row['id'];
                    $_SESSION['role'] = (string) ($row['role'] ?? '');
                    $_SESSION['full_name'] = (string) ($row['full_name'] ?? '');
                    $_SESSION['email'] = (string) ($row['email'] ?? $sessionEmail);
                }
            }
        }

        if (!isset($_SESSION['user_id'])) {
            return null;
        }

        $role = (string) ($_SESSION['role'] ?? '');
        if (!in_array($role, gradtrack_alumni_registry_admin_roles(), true)) {
            return null;
        }

        return [
            'id' => (int) $_SESSION['user_id'],
            'role' => $role,
            'full_name' => (string) ($_SESSION['full_name'] ?? ''),
            'email' => (string) ($_SESSION['email'] ?? ''),
        ];
    }
}

if (!function_exists('gradtrack_alumni_registry_require_admin')) {
    function gradtrack_alumni_registry_require_admin(PDO $db): array
    {
        $admin = gradtrack_alumni_registry_current_admin($db);
        if ($admin === null) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'Only Alumni Admin accounts can manage the alumni registered list',
            ]);
            exit;
        }

        return $admin;
    }
}

if (!function_exists('gradtrack_alumni_registry_duplicate_lookup')) {
    function gradtrack_alumni_registry_duplicate_lookup(PDO $db, string $normalizedName, string $courseCode, int $batchYear, ?int $excludeId = null): ?array
    {
        $sql = "SELECT id, full_name, course_code, batch_year
                FROM registered_alumni
                WHERE normalized_name = :normalized_name
                  AND course_code = :course_code
                  AND batch_year = :batch_year";
        $params = [
            ':normalized_name' => $normalizedName,
            ':course_code' => $courseCode,
            ':batch_year' => $batchYear,
        ];

        if ($excludeId !== null) {
            $sql .= ' AND id <> :exclude_id';
            $params[':exclude_id'] = $excludeId;
        }

        $sql .= ' LIMIT 1';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }
}

if (!function_exists('gradtrack_alumni_registry_validate_import_rows')) {
    function gradtrack_alumni_registry_validate_import_rows(PDO $db, array $rows): array
    {
        $valid = [];
        $duplicates = [];
        $invalid = [];
        $ignored = 0;
        $seenKeys = [];
        $recognizedCourses = [];
        $unrecognizedCourses = [];
        $detectedRows = 0;

        foreach (array_values($rows) as $index => $row) {
            $row = is_array($row) ? $row : [];
            $rowNumber = isset($row['row_number']) ? (int) $row['row_number'] : $index + 1;
            $name = gradtrack_alumni_registry_clean_text($row['name'] ?? $row['full_name'] ?? '', 180);
            $course = gradtrack_alumni_registry_clean_text($row['course'] ?? $row['course_name'] ?? '', 180);
            $batchRaw = gradtrack_alumni_registry_clean_text($row['batch'] ?? $row['batch_year'] ?? '', 20);

            if (gradtrack_alumni_registry_row_is_ignorable($name, $course, $batchRaw)) {
                $ignored++;
                continue;
            }

            $detectedRows++;
            $errors = [];

            if ($name === '') {
                $errors[] = 'Name is required';
            } elseif (gradtrack_alumni_registry_is_placeholder_name($name)) {
                $errors[] = 'Name appears to be a title, total, or placeholder row';
            }

            $normalizedName = gradtrack_alumni_registry_normalize_name($name);
            if ($normalizedName === '') {
                $errors[] = 'Name could not be normalized';
            }

            $courseMatch = gradtrack_alumni_registry_match_course($db, $course);
            if (!$courseMatch['valid']) {
                $errors[] = $courseMatch['error'];
                if ($course !== '') {
                    $unrecognizedCourses[$course] = ($unrecognizedCourses[$course] ?? 0) + 1;
                }
            } else {
                $recognizedCourses[$courseMatch['course_code']] = ($recognizedCourses[$courseMatch['course_code']] ?? 0) + 1;
            }

            $batchYear = gradtrack_alumni_registry_normalize_batch_year($batchRaw);
            if ($batchYear === null) {
                $errors[] = 'Batch must be a valid four-digit year from 1950 to ' . date('Y');
            }

            if (!empty($errors)) {
                $invalid[] = [
                    'row_number' => $rowNumber,
                    'name' => $name,
                    'course' => $course,
                    'batch' => $batchRaw,
                    'error' => implode('; ', array_unique($errors)),
                ];
                continue;
            }

            $courseCode = (string) $courseMatch['course_code'];
            $key = $normalizedName . '|' . $courseCode . '|' . $batchYear;
            if (isset($seenKeys[$key])) {
                $duplicates[] = [
                    'row_number' => $rowNumber,
                    'name' => $name,
                    'course' => $course,
                    'batch' => (string) $batchYear,
                    'error' => 'Duplicate row in this import file; first seen on row ' . $seenKeys[$key],
                    'duplicate_type' => 'file',
                ];
                continue;
            }
            $seenKeys[$key] = $rowNumber;

            $existing = gradtrack_alumni_registry_duplicate_lookup($db, $normalizedName, $courseCode, (int) $batchYear);
            if ($existing) {
                $duplicates[] = [
                    'row_number' => $rowNumber,
                    'name' => $name,
                    'course' => $course,
                    'batch' => (string) $batchYear,
                    'error' => 'Already exists in the official alumni registry',
                    'duplicate_type' => 'database',
                    'existing_id' => (int) $existing['id'],
                ];
                continue;
            }

            $valid[] = [
                'row_number' => $rowNumber,
                'full_name' => $name,
                'normalized_name' => $normalizedName,
                'course_id' => $courseMatch['course_id'] !== null ? (int) $courseMatch['course_id'] : null,
                'course_name' => (string) $courseMatch['course_name'],
                'course_code' => $courseCode,
                'batch_year' => (int) $batchYear,
            ];
        }

        ksort($recognizedCourses);
        ksort($unrecognizedCourses);

        return [
            'total_rows' => $detectedRows,
            'ignored_rows' => $ignored,
            'valid_rows' => count($valid),
            'duplicate_rows' => count($duplicates),
            'invalid_rows' => count($invalid),
            'valid_records' => $valid,
            'duplicates' => $duplicates,
            'invalid' => $invalid,
            'recognized_courses' => $recognizedCourses,
            'unrecognized_courses' => $unrecognizedCourses,
        ];
    }
}

if (!function_exists('gradtrack_alumni_registry_safe_export_value')) {
    function gradtrack_alumni_registry_safe_export_value($value): string
    {
        $text = (string) ($value ?? '');
        if ($text !== '' && preg_match('/^[=+\-@]/', $text) === 1) {
            return "'" . $text;
        }

        return $text;
    }
}

if (!function_exists('gradtrack_alumni_registry_account_context')) {
    function gradtrack_alumni_registry_account_context(PDO $db, int $accountId): ?array
    {
        $stmt = $db->prepare("SELECT ga.id AS account_id, ga.email, ga.status AS account_status,
                                     g.id AS graduate_id, g.first_name, g.middle_name, g.last_name,
                                     g.year_graduated, p.id AS program_id, p.name AS program_name, p.code AS program_code
                              FROM graduate_accounts ga
                              JOIN graduates g ON g.id = ga.graduate_id AND g.archived_at IS NULL
                              LEFT JOIN programs p ON p.id = g.program_id
                              WHERE ga.id = :account_id
                              LIMIT 1");
        $stmt->execute([':account_id' => $accountId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return null;
        }

        $middle = gradtrack_alumni_registry_clean_text($row['middle_name'] ?? '', 100);
        $fullName = trim((string) ($row['first_name'] ?? '') . ' ' . ($middle !== '' ? $middle . ' ' : '') . (string) ($row['last_name'] ?? ''));

        return [
            'account_id' => (int) $row['account_id'],
            'graduate_id' => (int) $row['graduate_id'],
            'email' => (string) ($row['email'] ?? ''),
            'account_status' => (string) ($row['account_status'] ?? ''),
            'full_name' => $fullName,
            'normalized_name' => gradtrack_alumni_registry_normalize_name($fullName),
            'program_id' => $row['program_id'] !== null ? (int) $row['program_id'] : null,
            'program_name' => $row['program_name'],
            'program_code' => $row['program_code'],
            'batch_year' => $row['year_graduated'] !== null ? (int) $row['year_graduated'] : null,
        ];
    }
}

if (!function_exists('gradtrack_alumni_registry_match_strength')) {
    function gradtrack_alumni_registry_match_strength(array $registry, array $account): string
    {
        $sameName = (string) ($registry['normalized_name'] ?? '') !== ''
            && (string) ($registry['normalized_name'] ?? '') === (string) ($account['normalized_name'] ?? '');
        $sameCourse = strtoupper((string) ($registry['course_code'] ?? '')) !== ''
            && strtoupper((string) ($registry['course_code'] ?? '')) === strtoupper((string) ($account['program_code'] ?? ''));
        $sameBatch = isset($registry['batch_year'], $account['batch_year'])
            && (int) $registry['batch_year'] === (int) $account['batch_year'];

        if ($sameName && $sameCourse && $sameBatch) {
            return 'strong';
        }

        if ($sameName || ($sameCourse && $sameBatch)) {
            return 'review';
        }

        return 'weak';
    }
}

if (!function_exists('gradtrack_alumni_registry_sync_for_graduate_account')) {
    function gradtrack_alumni_registry_sync_for_graduate_account(PDO $db, int $accountId): array
    {
        if (
            !gradtrack_alumni_registry_table_exists($db, 'registered_alumni')
            || !gradtrack_alumni_registry_table_exists($db, 'alumni_import_history')
        ) {
            gradtrack_alumni_registry_ensure_schema($db);
        }

        $account = gradtrack_alumni_registry_account_context($db, $accountId);
        if (!$account || $account['normalized_name'] === '' || !$account['program_code'] || !$account['batch_year']) {
            return ['linked' => false, 'reason' => 'Missing account match data'];
        }

        $stmt = $db->prepare("SELECT id, linked_user_id, registration_status
                              FROM registered_alumni
                              WHERE normalized_name = :normalized_name
                                AND course_code = :course_code
                                AND batch_year = :batch_year
                                AND registration_status <> 'Inactive'
                                AND archived_at IS NULL");
        $stmt->execute([
            ':normalized_name' => $account['normalized_name'],
            ':course_code' => strtoupper((string) $account['program_code']),
            ':batch_year' => (int) $account['batch_year'],
        ]);
        $matches = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (count($matches) !== 1) {
            return [
                'linked' => false,
                'reason' => count($matches) > 1 ? 'Multiple possible registry matches require admin review' : 'No exact registry match',
            ];
        }

        $match = $matches[0];
        if (!empty($match['linked_user_id']) && (int) $match['linked_user_id'] !== $accountId) {
            return ['linked' => false, 'reason' => 'Registry record is already linked to another account'];
        }

        $nextStatus = ((string) ($match['registration_status'] ?? 'Unclaimed')) === 'Verified' ? 'Verified' : 'Registered';
        $update = $db->prepare("UPDATE registered_alumni
                                SET linked_user_id = :linked_user_id,
                                    registration_status = :registration_status
                                WHERE id = :id");
        $update->execute([
            ':linked_user_id' => $accountId,
            ':registration_status' => $nextStatus,
            ':id' => (int) $match['id'],
        ]);

        return [
            'linked' => true,
            'registry_id' => (int) $match['id'],
            'registration_status' => $nextStatus,
        ];
    }
}
