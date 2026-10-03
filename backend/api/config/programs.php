<?php
declare(strict_types=1);

if (!function_exists('gradtrack_program_clean_text')) {
    function gradtrack_program_clean_text($value): string
    {
        return preg_replace('/\s+/u', ' ', trim((string) ($value ?? ''))) ?: '';
    }
}

if (!function_exists('gradtrack_program_normalize_code')) {
    function gradtrack_program_normalize_code($value): string
    {
        $code = strtoupper(gradtrack_program_clean_text($value));
        return preg_replace('/\s+/u', '', $code) ?: '';
    }
}

if (!function_exists('gradtrack_program_normalize_name')) {
    function gradtrack_program_normalize_name($value): string
    {
        $name = html_entity_decode(gradtrack_program_clean_text($value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $name = strtolower($name);
        $name = preg_replace('/[^a-z0-9]+/', ' ', $name) ?? $name;
        return trim(preg_replace('/\s+/', ' ', $name) ?? $name);
    }
}

if (!function_exists('gradtrack_program_code_is_valid')) {
    function gradtrack_program_code_is_valid($value): bool
    {
        $code = gradtrack_program_normalize_code($value);
        return preg_match('/^[A-Z][A-Z0-9.-]{1,19}$/', $code) === 1;
    }
}

if (!function_exists('gradtrack_program_initials')) {
    function gradtrack_program_initials(string $value): string
    {
        $tokens = preg_split('/[^A-Z0-9]+/', strtoupper($value), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $ignored = ['OF' => true, 'IN' => true, 'THE' => true, 'AND' => true, 'WITH' => true];
        $initials = '';
        foreach ($tokens as $token) {
            if (isset($ignored[$token])) continue;
            $initials .= $token[0];
        }
        return $initials;
    }
}

if (!function_exists('gradtrack_program_generate_code')) {
    /**
     * Generate a readable code from an academic program name when the source
     * provides no official code. This uses degree-title grammar, not a list of
     * known programs, and adds a suffix if an unrelated program owns the code.
     */
    function gradtrack_program_generate_code(string $name, array $programs = []): string
    {
        $displayName = gradtrack_program_clean_text($name);
        if ($displayName === '') return '';

        $upperName = strtoupper($displayName);
        $upperName = trim(preg_split('/\b(?:MAJOR|SPECIALIZATION|CONCENTRATION|TRACK)\b/', $upperName, 2)[0] ?? $upperName);
        $baseCode = '';

        if (preg_match('/^BACHELOR\s+OF\s+SCIENCE\s+IN\s+(.+)$/', $upperName, $matches) === 1) {
            $baseCode = 'BS' . gradtrack_program_initials($matches[1]);
        } elseif (preg_match('/^BACHELOR\s+OF\s+ARTS\s+IN\s+(.+)$/', $upperName, $matches) === 1) {
            $baseCode = 'BA' . gradtrack_program_initials($matches[1]);
        } elseif (preg_match('/^BACHELOR\s+OF\s+(.+?)\s+EDUCATION$/', $upperName, $matches) === 1) {
            $baseCode = 'B' . gradtrack_program_initials($matches[1]) . 'ED';
        } elseif (preg_match('/^ASSOCIATE\s+(?:IN|OF)\s+(.+)$/', $upperName, $matches) === 1) {
            $baseCode = 'A' . gradtrack_program_initials($matches[1]);
        } elseif (preg_match('/^MASTER\s+OF\s+SCIENCE\s+IN\s+(.+)$/', $upperName, $matches) === 1) {
            $baseCode = 'MS' . gradtrack_program_initials($matches[1]);
        } elseif (preg_match('/^MASTER\s+OF\s+ARTS\s+IN\s+(.+)$/', $upperName, $matches) === 1) {
            $baseCode = 'MA' . gradtrack_program_initials($matches[1]);
        } else {
            $baseCode = gradtrack_program_initials($upperName);
        }

        $baseCode = substr(preg_replace('/[^A-Z0-9]/', '', $baseCode) ?: '', 0, 16);
        if (strlen($baseCode) < 2) {
            $baseCode = substr(preg_replace('/[^A-Z0-9]/', '', $upperName) ?: '', 0, 16);
        }
        if (!gradtrack_program_code_is_valid($baseCode)) return '';

        return gradtrack_program_available_code($baseCode, $displayName, $programs);
    }
}

if (!function_exists('gradtrack_program_available_code')) {
    /** Select the first non-conflicting official/alternate code, then suffix safely. */
    function gradtrack_program_available_code(
        string $preferredCode,
        string $name,
        array $programs = [],
        array $alternateCodes = []
    ): string {
        $normalizedName = gradtrack_program_normalize_name($name);
        $codes = [];
        foreach ($programs as $program) {
            $existingCode = gradtrack_program_normalize_code($program['code'] ?? '');
            if ($existingCode === '') continue;
            $codes[$existingCode] = gradtrack_program_normalize_name($program['name'] ?? '');
        }

        $candidates = array_values(array_unique(array_filter(array_map(
            'gradtrack_program_normalize_code',
            array_merge([$preferredCode], $alternateCodes)
        ), 'gradtrack_program_code_is_valid')));
        foreach ($candidates as $candidate) {
            if (!isset($codes[$candidate]) || $codes[$candidate] === $normalizedName) return $candidate;
        }

        $baseCode = $candidates[0] ?? '';
        if ($baseCode === '') return '';

        for ($suffix = 2; $suffix < 1000; $suffix++) {
            $suffixText = '-' . $suffix;
            $candidate = substr($baseCode, 0, 20 - strlen($suffixText)) . $suffixText;
            if (!isset($codes[$candidate]) || $codes[$candidate] === $normalizedName) return $candidate;
        }
        return '';
    }
}

if (!function_exists('gradtrack_program_catalog_rows')) {
    function gradtrack_program_catalog_rows(PDO $db): array
    {
        try {
            $rows = $db->query(
                'SELECT normalized_name, official_name, program_code, alternate_codes
                 FROM program_code_catalog ORDER BY id ASC'
            )->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable $ignored) {
            // Deployments remain import-compatible while the additive catalog
            // migration is pending; generated-code fallback still works.
            return [];
        }

        return array_map(static function (array $row): array {
            $alternates = json_decode((string) ($row['alternate_codes'] ?? ''), true);
            return [
                'normalized_name' => (string) $row['normalized_name'],
                'name' => gradtrack_program_clean_text($row['official_name'] ?? ''),
                'code' => gradtrack_program_normalize_code($row['program_code'] ?? ''),
                'alternate_codes' => is_array($alternates) ? array_values($alternates) : [],
            ];
        }, $rows);
    }
}

if (!function_exists('gradtrack_find_program_catalog_entry')) {
    function gradtrack_find_program_catalog_entry(array $catalog, $name): ?array
    {
        $normalizedName = gradtrack_program_normalize_name($name);
        if ($normalizedName === '') return null;
        foreach ($catalog as $entry) {
            if ((string) ($entry['normalized_name'] ?? '') === $normalizedName) return $entry;
        }
        return null;
    }
}

if (!function_exists('gradtrack_program_master_rows')) {
    function gradtrack_program_master_rows(PDO $db): array
    {
        return array_map(static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'code' => gradtrack_program_normalize_code($row['code'] ?? ''),
                'name' => gradtrack_program_clean_text($row['name'] ?? ''),
            ];
        }, $db->query('SELECT id, code, name FROM programs ORDER BY id ASC')->fetchAll(PDO::FETCH_ASSOC));
    }
}

if (!function_exists('gradtrack_find_program')) {
    function gradtrack_find_program(
        array $programs,
        $programId = null,
        $programCode = null,
        $programName = null
    ): ?array {
        $id = is_numeric($programId) ? (int) $programId : 0;
        if ($id > 0) {
            foreach ($programs as $program) {
                if ((int) ($program['id'] ?? 0) === $id) return $program;
            }
        }

        $code = gradtrack_program_normalize_code($programCode);
        if ($code !== '') {
            foreach ($programs as $program) {
                if (gradtrack_program_normalize_code($program['code'] ?? '') === $code) return $program;
            }
        }

        $name = gradtrack_program_normalize_name($programName);
        if ($name !== '') {
            foreach ($programs as $program) {
                if (gradtrack_program_normalize_name($program['name'] ?? '') === $name) return $program;
            }
        }

        return null;
    }
}

if (!function_exists('gradtrack_program_extract_code_and_name')) {
    /** Extract a code/name pair from values such as "BECED - Bachelor ..." or "Bachelor ... (BECED)". */
    function gradtrack_program_extract_code_and_name($value): array
    {
        $text = gradtrack_program_clean_text($value);
        if ($text === '') return ['code' => '', 'name' => ''];

        if (preg_match('/^([A-Za-z][A-Za-z0-9.-]{1,19})\s*[-:|]\s*(.+)$/u', $text, $matches) === 1) {
            return [
                'code' => gradtrack_program_normalize_code($matches[1]),
                'name' => gradtrack_program_clean_text($matches[2]),
            ];
        }

        if (preg_match('/^(.+?)\s*\(([A-Za-z][A-Za-z0-9.-]{1,19})\)\s*$/u', $text, $matches) === 1) {
            return [
                'code' => gradtrack_program_normalize_code($matches[2]),
                'name' => gradtrack_program_clean_text($matches[1]),
            ];
        }

        if (gradtrack_program_code_is_valid($text) && !preg_match('/\s/u', $text)) {
            $code = gradtrack_program_normalize_code($text);
            return ['code' => $code, 'name' => $code];
        }

        return ['code' => '', 'name' => $text];
    }
}

if (!function_exists('gradtrack_register_program')) {
    /** Resolve or create one normalized master program inside the caller's transaction. */
    function gradtrack_register_program(PDO $db, string $code, string $name): array
    {
        $normalizedCode = gradtrack_program_normalize_code($code);
        $displayName = gradtrack_program_clean_text($name);
        if (!gradtrack_program_code_is_valid($normalizedCode)) {
            throw new InvalidArgumentException('Program code must contain 2 to 20 letters, numbers, periods, or hyphens.');
        }
        if ($displayName === '') $displayName = $normalizedCode;
        $nameLength = function_exists('mb_strlen') ? mb_strlen($displayName, 'UTF-8') : strlen($displayName);
        if ($nameLength > 255) {
            throw new InvalidArgumentException('Program name must be 255 characters or fewer.');
        }

        $programs = gradtrack_program_master_rows($db);
        $existing = gradtrack_find_program($programs, null, $normalizedCode, $displayName);
        if ($existing !== null) return $existing;

        try {
            $stmt = $db->prepare('INSERT INTO programs (code, name) VALUES (:code, :name)');
            $stmt->execute([':code' => $normalizedCode, ':name' => $displayName]);
            return ['id' => (int) $db->lastInsertId(), 'code' => $normalizedCode, 'name' => $displayName];
        } catch (PDOException $error) {
            // A concurrent import may have inserted the same normalized code.
            $existing = gradtrack_find_program(gradtrack_program_master_rows($db), null, $normalizedCode, $displayName);
            if ($existing !== null) return $existing;
            throw $error;
        }
    }
}
