<?php

/**
 * Canonical Dean-to-program authorization scope.
 *
 * GradTrack currently assigns a Dean's department through the authenticated
 * admin account role. Keep that legacy account model in one place so every
 * Dean endpoint applies the same server-owned scope.
 */
if (!function_exists('gradtrack_dean_scope_definitions')) {
    function gradtrack_dean_scope_definitions(): array
    {
        return [
            'dean_cs' => [
                'department_code' => 'CCS',
                'department_name' => 'College of Computing Studies',
                'program_codes' => ['BSCS', 'ACT'],
            ],
            'dean_coed' => [
                'department_code' => 'COED',
                'department_name' => 'College of Education',
                'program_codes' => ['BSED', 'BEED'],
            ],
            'dean_hm' => [
                'department_code' => 'HM',
                'department_name' => 'College of Hotel and Restaurant Management',
                'program_codes' => ['BSHM'],
            ],
        ];
    }
}

if (!function_exists('gradtrack_dean_roles')) {
    function gradtrack_dean_roles(): array
    {
        return array_keys(gradtrack_dean_scope_definitions());
    }
}

if (!function_exists('gradtrack_is_dean_role')) {
    function gradtrack_is_dean_role(string $role): bool
    {
        return array_key_exists($role, gradtrack_dean_scope_definitions());
    }
}

if (!function_exists('gradtrack_dean_program_codes')) {
    function gradtrack_dean_program_codes(string $role): ?array
    {
        $definition = gradtrack_dean_scope_definitions()[$role] ?? null;
        return is_array($definition) ? array_values($definition['program_codes']) : null;
    }
}

if (!function_exists('gradtrack_dean_program_scope')) {
    function gradtrack_dean_program_scope(PDO $db, array $authenticatedUser): ?array
    {
        $role = (string)($authenticatedUser['role'] ?? '');
        $definition = gradtrack_dean_scope_definitions()[$role] ?? null;
        if (!is_array($definition)) {
            return null;
        }

        $programCodes = array_values($definition['program_codes']);
        $placeholders = implode(', ', array_fill(0, count($programCodes), '?'));
        $stmt = $db->prepare(
            "SELECT id, code, name
             FROM programs
             WHERE code IN ({$placeholders})
             ORDER BY FIELD(code, {$placeholders})"
        );
        $stmt->execute(array_merge($programCodes, $programCodes));
        $programs = array_map(static function (array $program): array {
            return [
                'id' => (int)$program['id'],
                'code' => (string)$program['code'],
                'name' => (string)$program['name'],
            ];
        }, $stmt->fetchAll(PDO::FETCH_ASSOC));

        if (count($programs) === 1) {
            $displayName = $programs[0]['name'] . ' (' . $programs[0]['code'] . ')';
        } else {
            $displayName = $definition['department_name'] . ' (' . implode(', ', $programCodes) . ')';
        }

        return [
            'restricted' => true,
            'source' => 'authenticated_dean_account_role',
            'role' => $role,
            'department_code' => (string)$definition['department_code'],
            'department_name' => (string)$definition['department_name'],
            'display_name' => $displayName,
            'program_codes' => $programCodes,
            'program_ids' => array_column($programs, 'id'),
            'programs' => $programs,
        ];
    }
}
