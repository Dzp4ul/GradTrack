<?php

if (!function_exists('gradtrack_normalize_graduation_year')) {
    function gradtrack_normalize_graduation_year($value): ?int
    {
        if (!is_scalar($value)) {
            return null;
        }

        $text = trim((string) $value);
        if (preg_match('/^(19|20)\d{2}$/', $text) !== 1) {
            return null;
        }

        return (int) $text;
    }
}

if (!function_exists('gradtrack_normalize_graduation_years')) {
    function gradtrack_normalize_graduation_years(iterable $values): array
    {
        $years = [];
        foreach ($values as $value) {
            if (is_array($value)) {
                $value = $value['year_graduated'] ?? $value['graduation_year'] ?? $value['batch_year'] ?? null;
            }

            $year = gradtrack_normalize_graduation_year($value);
            if ($year !== null) {
                $years[$year] = $year;
            }
        }

        krsort($years, SORT_NUMERIC);
        return array_values($years);
    }
}

if (!function_exists('gradtrack_fetch_graduate_years')) {
    function gradtrack_fetch_graduate_years(
        PDO $db,
        string $archiveScope = 'active',
        ?int $programId = null,
        ?array $programCodes = null
    ): array {
        $where = [$archiveScope === 'archived' ? 'g.archived_at IS NOT NULL' : 'g.archived_at IS NULL'];
        $params = [];
        $join = '';

        if ($programId !== null && $programId > 0) {
            $where[] = 'g.program_id = :year_program_id';
            $params[':year_program_id'] = $programId;
        }

        if (is_array($programCodes)) {
            $cleanCodes = array_values(array_unique(array_filter(array_map(static function ($code): string {
                return strtoupper(trim((string) $code));
            }, $programCodes))));
            if ($cleanCodes === []) {
                return [];
            }

            $join = ' JOIN programs year_program ON year_program.id = g.program_id';
            $placeholders = [];
            foreach ($cleanCodes as $index => $code) {
                $placeholder = ':year_program_code_' . $index;
                $placeholders[] = $placeholder;
                $params[$placeholder] = $code;
            }
            $where[] = 'year_program.code IN (' . implode(', ', $placeholders) . ')';
        }

        $stmt = $db->prepare(
            'SELECT DISTINCT g.year_graduated FROM graduates g' . $join .
            ' WHERE ' . implode(' AND ', $where) .
            ' ORDER BY g.year_graduated DESC'
        );
        $stmt->execute($params);

        return gradtrack_normalize_graduation_years($stmt->fetchAll(PDO::FETCH_ASSOC));
    }
}
