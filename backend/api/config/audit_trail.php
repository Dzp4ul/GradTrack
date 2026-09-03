<?php
require_once __DIR__ . '/env.php';

if (!function_exists('gradtrack_audit_load_env_file')) {
    function gradtrack_audit_load_env_file(): void
    {
        gradtrack_load_env_file();
    }
}

if (!function_exists('gradtrack_audit_get_connection')) {
    function gradtrack_audit_get_connection(): ?PDO
    {
        global $db, $conn;

        if ($db instanceof PDO) {
            return $db;
        }

        if ($conn instanceof PDO) {
            return $conn;
        }

        gradtrack_audit_load_env_file();

        $host = gradtrack_env('DB_HOST', '');
        $database = gradtrack_env('DB_NAME', gradtrack_env('DB_DATABASE', ''));
        $username = gradtrack_env('DB_USER', gradtrack_env('DB_USERNAME', ''));
        $password = gradtrack_env('DB_PASSWORD', '');
        $port = gradtrack_env('DB_PORT', '3306');

        try {
            $pdo = new PDO(
                "mysql:host={$host};port={$port};dbname={$database};charset=utf8mb4",
                $username,
                $password,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]
            );
            $pdo->exec('SET NAMES utf8mb4');
            return $pdo;
        } catch (Throwable $e) {
            error_log('Audit Trail database connection failed: ' . $e->getMessage());
            return null;
        }
    }
}

if (!function_exists('gradtrack_audit_allowed_role_map')) {
    function gradtrack_audit_allowed_role_map(): array
    {
        return [
            'super_admin' => ['category' => 'system_administrator', 'label' => 'System Administrator'],
            'admin' => ['category' => 'admin', 'label' => 'Admin'],
            'alumni_admin' => ['category' => 'alumni_administrator', 'label' => 'Alumni Administrator'],
            'registrar' => ['category' => 'registrar', 'label' => 'Registrar'],
            'dean_cs' => ['category' => 'dean', 'label' => 'Dean'],
            'dean_coed' => ['category' => 'dean', 'label' => 'Dean'],
            'dean_hm' => ['category' => 'dean', 'label' => 'Dean'],
        ];
    }
}

if (!function_exists('gradtrack_audit_allowed_role_categories')) {
    function gradtrack_audit_allowed_role_categories(): array
    {
        return [
            'system_administrator' => 'System Administrator',
            'admin' => 'Admin',
            'alumni_administrator' => 'Alumni Administrator',
            'dean' => 'Dean',
            'registrar' => 'Registrar',
        ];
    }
}

if (!function_exists('gradtrack_audit_allowed_roles')) {
    function gradtrack_audit_allowed_roles(): array
    {
        return array_keys(gradtrack_audit_allowed_role_map());
    }
}

if (!function_exists('gradtrack_audit_role_is_allowed')) {
    function gradtrack_audit_role_is_allowed($role): bool
    {
        return array_key_exists((string) $role, gradtrack_audit_allowed_role_map());
    }
}

if (!function_exists('gradtrack_audit_viewer_role_is_allowed')) {
    function gradtrack_audit_viewer_role_is_allowed($role): bool
    {
        return (string) $role === 'super_admin';
    }
}

if (!function_exists('gradtrack_audit_role_label')) {
    function gradtrack_audit_role_label($role): string
    {
        $roleText = (string) ($role ?? '');
        $map = gradtrack_audit_allowed_role_map();
        return $map[$roleText]['label'] ?? ($roleText !== '' ? $roleText : '-');
    }
}

if (!function_exists('gradtrack_audit_role_filter_roles')) {
    function gradtrack_audit_role_filter_roles($value): array
    {
        $filter = strtolower(trim((string) ($value ?? '')));
        if ($filter === '') {
            return [];
        }

        $normalized = preg_replace('/[^a-z0-9]+/', '_', $filter);
        $normalized = trim((string) $normalized, '_');
        $aliases = [
            'system_admin' => 'system_administrator',
            'super_administrator' => 'system_administrator',
            'super_admin' => 'super_admin',
            'alumni_admin' => 'alumni_admin',
            'alumni_administrator' => 'alumni_administrator',
        ];
        $normalized = $aliases[$normalized] ?? $normalized;

        $map = gradtrack_audit_allowed_role_map();
        if (isset($map[$normalized])) {
            return [$normalized];
        }

        $categories = gradtrack_audit_allowed_role_categories();
        if (!isset($categories[$normalized])) {
            return [];
        }

        $roles = [];
        foreach ($map as $role => $details) {
            if (($details['category'] ?? '') === $normalized) {
                $roles[] = $role;
            }
        }

        return $roles;
    }
}

if (!function_exists('gradtrack_audit_dean_program_scopes')) {
    function gradtrack_audit_dean_program_scopes(): array
    {
        return [
            'dean_cs' => ['CCS', 'BSCS', 'ACT'],
            'dean_coed' => ['COED', 'BSED', 'BEED'],
            'dean_hm' => ['HM', 'BSHM'],
        ];
    }
}

if (!function_exists('gradtrack_audit_role_department')) {
    function gradtrack_audit_role_department(string $role): ?string
    {
        $departments = [
            'dean_cs' => 'CCS',
            'dean_coed' => 'COED',
            'dean_hm' => 'HM',
        ];

        return $departments[$role] ?? null;
    }
}

if (!function_exists('gradtrack_audit_registrar_modules')) {
    function gradtrack_audit_registrar_modules(): array
    {
        return ['Graduate Records', 'Survey Responses', 'Reports'];
    }
}

if (!function_exists('gradtrack_audit_alumni_admin_modules')) {
    function gradtrack_audit_alumni_admin_modules(): array
    {
        return ['Community Forum', 'Job Posting', 'Alumni Registered List'];
    }
}

if (!function_exists('gradtrack_audit_existing_columns')) {
    function gradtrack_audit_existing_columns(PDO $pdo, string $table): array
    {
        try {
            $driver = (string) $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
            if ($driver === 'sqlite') {
                $stmt = $pdo->query("PRAGMA table_info({$table})");
                $columns = [];
                foreach ($stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [] as $row) {
                    $columns[] = strtolower((string) ($row['name'] ?? ''));
                }
                return $columns;
            }

            $stmt = $pdo->query("SHOW COLUMNS FROM {$table}");
            $columns = [];
            foreach ($stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [] as $row) {
                $columns[] = strtolower((string) ($row['Field'] ?? ''));
            }
            return $columns;
        } catch (Throwable $e) {
            error_log('Audit Trail column check failed: ' . $e->getMessage());
            return [];
        }
    }
}

if (!function_exists('gradtrack_ensure_audit_trail_table')) {
    function gradtrack_ensure_audit_trail_table(PDO $pdo): void
    {
        $driver = 'mysql';
        try {
            $driver = (string) $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        } catch (Throwable $ignored) {
            $driver = 'mysql';
        }

        if ($driver === 'sqlite') {
            $pdo->exec("CREATE TABLE IF NOT EXISTS audit_trail (
                audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NULL,
                user_name TEXT,
                user_role TEXT,
                department TEXT NULL,
                action TEXT,
                module TEXT,
                description TEXT,
                record_id TEXT NULL,
                previous_values TEXT NULL,
                new_values TEXT NULL,
                metadata TEXT NULL,
                ip_address TEXT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )");

            $columns = gradtrack_audit_existing_columns($pdo, 'audit_trail');
            $addColumns = [
                'record_id' => 'ALTER TABLE audit_trail ADD COLUMN record_id TEXT NULL',
                'previous_values' => 'ALTER TABLE audit_trail ADD COLUMN previous_values TEXT NULL',
                'new_values' => 'ALTER TABLE audit_trail ADD COLUMN new_values TEXT NULL',
                'metadata' => 'ALTER TABLE audit_trail ADD COLUMN metadata TEXT NULL',
            ];

            foreach ($addColumns as $column => $sql) {
                if (!in_array($column, $columns, true)) {
                    $pdo->exec($sql);
                }
            }
            return;
        }

        $pdo->exec("CREATE TABLE IF NOT EXISTS audit_trail (
            audit_id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NULL,
            user_name VARCHAR(150),
            user_role VARCHAR(100),
            department VARCHAR(150) NULL,
            action VARCHAR(100),
            module VARCHAR(100),
            description TEXT,
            record_id VARCHAR(64) NULL,
            previous_values LONGTEXT NULL,
            new_values LONGTEXT NULL,
            metadata LONGTEXT NULL,
            ip_address VARCHAR(100) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_audit_created_at (created_at),
            INDEX idx_audit_user_role (user_role),
            INDEX idx_audit_department (department),
            INDEX idx_audit_action (action),
            INDEX idx_audit_module (module)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $columns = gradtrack_audit_existing_columns($pdo, 'audit_trail');
        $addColumns = [
            'record_id' => 'ALTER TABLE audit_trail ADD COLUMN record_id VARCHAR(64) NULL AFTER description',
            'previous_values' => 'ALTER TABLE audit_trail ADD COLUMN previous_values LONGTEXT NULL AFTER record_id',
            'new_values' => 'ALTER TABLE audit_trail ADD COLUMN new_values LONGTEXT NULL AFTER previous_values',
            'metadata' => 'ALTER TABLE audit_trail ADD COLUMN metadata LONGTEXT NULL AFTER new_values',
        ];

        foreach ($addColumns as $column => $sql) {
            if (!in_array($column, $columns, true)) {
                $pdo->exec($sql);
            }
        }
    }
}

if (!function_exists('gradtrack_audit_clean_text')) {
    function gradtrack_audit_clean_text($value, int $maxLength): string
    {
        $text = trim((string) ($value ?? ''));
        if ($text === '') {
            return '';
        }

        if (function_exists('mb_substr')) {
            return mb_substr($text, 0, $maxLength, 'UTF-8');
        }

        return substr($text, 0, $maxLength);
    }
}

if (!function_exists('gradtrack_audit_sensitive_key')) {
    function gradtrack_audit_sensitive_key($key): bool
    {
        $keyText = strtolower((string) $key);
        return preg_match(
            '/password|token|secret|authorization|cookie|session|csrf|otp|passcode|reset|verification|email|phone|mobile|contact|address|birth|student[_\s-]*(id|no|number)|national|ssn|first_name|middle_name|last_name|full_name/i',
            $keyText
        ) === 1;
    }
}

if (!function_exists('gradtrack_audit_sanitize_description')) {
    function gradtrack_audit_sanitize_description($value, int $maxLength = 1000): string
    {
        $text = trim((string) ($value ?? ''));
        if ($text === '') {
            return '';
        }

        $text = preg_replace('/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i', '[redacted email]', $text);
        $text = preg_replace(
            '/\b(password|passcode|token|access_token|refresh_token|secret|authorization|cookie|session|csrf|otp|verification_code|reset_code)\b\s*[:=]\s*[^\s,;]+/i',
            '$1=[redacted]',
            $text
        );
        $text = preg_replace('/\s+/', ' ', $text);

        return gradtrack_audit_clean_text($text, $maxLength);
    }
}

if (!function_exists('gradtrack_audit_sanitize_payload')) {
    function gradtrack_audit_sanitize_payload($value)
    {
        if ($value === null) {
            return null;
        }

        if (is_object($value)) {
            $value = get_object_vars($value);
        }

        if (is_array($value)) {
            $sanitized = [];
            foreach ($value as $key => $item) {
                if (gradtrack_audit_sensitive_key($key)) {
                    $sanitized[$key] = '[redacted]';
                    continue;
                }

                $sanitized[$key] = gradtrack_audit_sanitize_payload($item);
            }
            return $sanitized;
        }

        if (is_string($value)) {
            return gradtrack_audit_sanitize_description($value, 300);
        }

        if (is_bool($value) || is_numeric($value)) {
            return $value;
        }

        return gradtrack_audit_sanitize_description((string) $value, 300);
    }
}

if (!function_exists('gradtrack_audit_payload_to_json')) {
    function gradtrack_audit_payload_to_json($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        $sanitized = gradtrack_audit_sanitize_payload($value);
        if ($sanitized === null || $sanitized === [] || $sanitized === '') {
            return null;
        }

        $encoded = json_encode($sanitized, JSON_UNESCAPED_SLASHES);
        return $encoded !== false ? $encoded : null;
    }
}

if (!function_exists('gradtrack_audit_payload_for_output')) {
    function gradtrack_audit_payload_for_output($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                return gradtrack_audit_payload_to_json($decoded);
            }
        }

        return gradtrack_audit_payload_to_json($value);
    }
}

if (!function_exists('gradtrack_audit_current_admin_context')) {
    function gradtrack_audit_current_admin_context(?array $user = null): array
    {
        if ($user === null) {
            return [
                'user_id' => null,
                'user_name' => 'Guest',
                'user_role' => 'guest',
                'department' => null,
            ];
        }

        $role = (string) ($user['role'] ?? 'guest');
        $name = trim((string) ($user['full_name'] ?? ''));

        if ($name === '') {
            $name = trim((string) ($user['username'] ?? ''));
        }

        if ($name === '') {
            $name = trim((string) ($user['email'] ?? ''));
        }

        return [
            'user_id' => isset($user['id']) ? (int) $user['id'] : null,
            'user_name' => $name !== '' ? $name : 'Guest',
            'user_role' => $role,
            'department' => gradtrack_audit_role_department($role),
        ];
    }
}

if (!function_exists('gradtrack_audit_graduate_name')) {
    function gradtrack_audit_graduate_name(array $graduate): string
    {
        $name = trim((string) ($graduate['full_name'] ?? ''));
        if ($name !== '') {
            return $name;
        }

        $name = trim((string) ($graduate['first_name'] ?? '') . ' ' . (string) ($graduate['last_name'] ?? ''));
        if ($name !== '') {
            return $name;
        }

        return trim((string) ($graduate['email'] ?? 'Graduate')) ?: 'Graduate';
    }
}

if (!function_exists('gradtrack_audit_add_in_clause')) {
    function gradtrack_audit_add_in_clause(string $column, array $values, array &$params, string $prefix): string
    {
        $placeholders = [];
        foreach (array_values($values) as $index => $value) {
            $placeholder = ':' . $prefix . '_' . $index;
            $placeholders[] = $placeholder;
            $params[$placeholder] = $value;
        }

        if (empty($placeholders)) {
            return '1 = 0';
        }

        return $column . ' IN (' . implode(', ', $placeholders) . ')';
    }
}

if (!function_exists('gradtrack_audit_role_label_case_sql')) {
    function gradtrack_audit_role_label_case_sql(): string
    {
        return "CASE
            WHEN user_role = 'super_admin' THEN 'System Administrator'
            WHEN user_role = 'admin' THEN 'Admin'
            WHEN user_role = 'alumni_admin' THEN 'Alumni Administrator'
            WHEN user_role = 'registrar' THEN 'Registrar'
            WHEN user_role IN ('dean_cs', 'dean_coed', 'dean_hm') THEN 'Dean'
            ELSE user_role
        END";
    }
}

if (!function_exists('gradtrack_audit_build_conditions')) {
    function gradtrack_audit_build_conditions(array $input, string $viewerRole, ?int $viewerUserId = null): array
    {
        $where = [];
        $params = [];

        if (!gradtrack_audit_role_is_allowed($viewerRole)) {
            return [
                'where_clause' => 'WHERE 1 = 0',
                'params' => [],
                'scope' => 'none',
            ];
        }

        $where[] = gradtrack_audit_add_in_clause('user_role', gradtrack_audit_allowed_roles(), $params, 'audit_allowed_role');

        $deanScopes = gradtrack_audit_dean_program_scopes();
        if (isset($deanScopes[$viewerRole])) {
            $scopeParts = [
                gradtrack_audit_add_in_clause('department', $deanScopes[$viewerRole], $params, 'audit_dean_department'),
            ];
            if ($viewerUserId !== null) {
                $scopeParts[] = '(user_id = :audit_viewer_user_id AND module IN (:audit_scope_auth_module, :audit_scope_export_module))';
                $params[':audit_viewer_user_id'] = $viewerUserId;
                $params[':audit_scope_auth_module'] = 'Authentication';
                $params[':audit_scope_export_module'] = 'Audit Trail';
            }
            $where[] = '(' . implode(' OR ', $scopeParts) . ')';
            $scope = 'department';
        } elseif ($viewerRole === 'registrar') {
            $scopeParts = [
                gradtrack_audit_add_in_clause('module', gradtrack_audit_registrar_modules(), $params, 'audit_registrar_module'),
            ];
            if ($viewerUserId !== null) {
                $scopeParts[] = '(user_id = :audit_viewer_user_id AND module IN (:audit_scope_auth_module, :audit_scope_export_module))';
                $params[':audit_viewer_user_id'] = $viewerUserId;
                $params[':audit_scope_auth_module'] = 'Authentication';
                $params[':audit_scope_export_module'] = 'Audit Trail';
            }
            $where[] = '(' . implode(' OR ', $scopeParts) . ')';
            $scope = 'registrar_modules';
        } elseif ($viewerRole === 'alumni_admin') {
            $scopeParts = [
                gradtrack_audit_add_in_clause('module', gradtrack_audit_alumni_admin_modules(), $params, 'audit_alumni_module'),
            ];
            if ($viewerUserId !== null) {
                $scopeParts[] = '(user_id = :audit_viewer_user_id AND module IN (:audit_scope_auth_module, :audit_scope_export_module))';
                $params[':audit_viewer_user_id'] = $viewerUserId;
                $params[':audit_scope_auth_module'] = 'Authentication';
                $params[':audit_scope_export_module'] = 'Audit Trail';
            }
            $where[] = '(' . implode(' OR ', $scopeParts) . ')';
            $scope = 'alumni_portal_modules';
        } else {
            $scope = 'all';
        }

        $search = trim((string) ($input['search'] ?? ''));
        if ($search !== '') {
            $where[] = "(
                user_name LIKE :audit_search
                OR user_role LIKE :audit_search
                OR " . gradtrack_audit_role_label_case_sql() . " LIKE :audit_search
                OR action LIKE :audit_search
                OR module LIKE :audit_search
                OR department LIKE :audit_search
                OR description LIKE :audit_search
                OR record_id LIKE :audit_search
                OR created_at LIKE :audit_search
            )";
            $params[':audit_search'] = '%' . $search . '%';
        }

        $roleFilter = trim((string) ($input['user_role'] ?? ($input['role'] ?? '')));
        if ($roleFilter !== '') {
            $roleFilterRoles = gradtrack_audit_role_filter_roles($roleFilter);
            $where[] = gradtrack_audit_add_in_clause('user_role', $roleFilterRoles, $params, 'audit_role_filter');
        }

        $departmentFilter = trim((string) ($input['department'] ?? ''));
        if ($departmentFilter !== '') {
            $where[] = 'department = :audit_department';
            $params[':audit_department'] = $departmentFilter;
        }

        $actionFilter = trim((string) ($input['action'] ?? ''));
        if ($actionFilter !== '') {
            $where[] = 'action = :audit_action';
            $params[':audit_action'] = $actionFilter;
        }

        $moduleFilter = trim((string) ($input['module'] ?? ''));
        if ($moduleFilter !== '') {
            $where[] = 'module = :audit_module';
            $params[':audit_module'] = $moduleFilter;
        }

        $startDate = trim((string) ($input['start_date'] ?? ''));
        $endDate = trim((string) ($input['end_date'] ?? ''));
        $legacyDate = trim((string) ($input['date'] ?? ''));
        if ($legacyDate !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $legacyDate) === 1) {
            $startDate = $startDate !== '' ? $startDate : $legacyDate;
            $endDate = $endDate !== '' ? $endDate : $legacyDate;
        }

        if ($startDate !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate) === 1) {
            $where[] = 'created_at >= :audit_start_date';
            $params[':audit_start_date'] = $startDate . ' 00:00:00';
        }

        if ($endDate !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate) === 1) {
            $where[] = 'created_at <= :audit_end_date';
            $params[':audit_end_date'] = $endDate . ' 23:59:59';
        }

        return [
            'where_clause' => count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '',
            'params' => $params,
            'scope' => $scope,
        ];
    }
}

if (!function_exists('gradtrack_audit_action_past_tense')) {
    function gradtrack_audit_action_past_tense($action): string
    {
        $normalized = strtolower(trim((string) ($action ?? '')));
        $labels = [
            'login' => 'Logged in',
            'logout' => 'Logged out',
            'create' => 'Created',
            'update' => 'Updated',
            'delete' => 'Deleted',
            'approve' => 'Approved',
            'reject' => 'Rejected',
            'import' => 'Imported',
            'export' => 'Exported',
            'generate' => 'Generated',
            'print' => 'Printed',
            'activate' => 'Activated',
            'suspend' => 'Suspended',
            'link' => 'Linked',
            'unlink' => 'Unlinked',
            'submit' => 'Submitted',
        ];

        return $labels[$normalized] ?? gradtrack_audit_clean_text($action, 80);
    }
}

if (!function_exists('gradtrack_audit_public_description')) {
    function gradtrack_audit_public_description(array $row): string
    {
        $module = (string) ($row['module'] ?? '');
        $recordId = trim((string) ($row['record_id'] ?? ''));
        $entities = [
            'Community Forum' => 'forum post',
            'Job Posting' => 'job posting',
            'Survey Management' => 'survey',
            'Announcements' => 'announcement',
            'Announcement Management' => 'announcement',
            'Graduate Records' => 'graduate record',
            'Alumni Registered List' => 'alumni record',
        ];

        if ($recordId !== '' && isset($entities[$module])) {
            return gradtrack_audit_action_past_tense($row['action'] ?? '') . ' ' . $entities[$module] . ' with record ID ' . $recordId . '.';
        }

        return gradtrack_audit_sanitize_description($row['description'] ?? '');
    }
}

if (!function_exists('gradtrack_audit_public_row')) {
    function gradtrack_audit_public_row(array $row): array
    {
        unset($row['ip_address']);

        $row['role_label'] = gradtrack_audit_role_label($row['user_role'] ?? '');
        $row['description'] = gradtrack_audit_public_description($row);
        $row['previous_values'] = gradtrack_audit_payload_for_output($row['previous_values'] ?? null);
        $row['new_values'] = gradtrack_audit_payload_for_output($row['new_values'] ?? null);
        $row['metadata'] = gradtrack_audit_payload_for_output($row['metadata'] ?? null);

        return $row;
    }
}

if (!function_exists('logAuditTrail')) {
    /**
     * Insert one audit trail record after an important administrative action succeeds.
     *
     * Only allowed administrative roles are recorded. Graduate and alumni-user actions
     * are intentionally ignored here so callers cannot accidentally create visible
     * graduate audit records.
     */
    function logAuditTrail(
        $user_id,
        $user_name,
        $user_role,
        $department,
        $action,
        $module,
        $description,
        $record_id = null,
        $previous_values = null,
        $new_values = null,
        $metadata = null
    ): bool {
        if (!gradtrack_audit_role_is_allowed($user_role)) {
            return false;
        }

        try {
            $pdo = gradtrack_audit_get_connection();
            if (!$pdo) {
                return false;
            }

            gradtrack_ensure_audit_trail_table($pdo);

            $stmt = $pdo->prepare("INSERT INTO audit_trail
                (user_id, user_name, user_role, department, action, module, description, record_id, previous_values, new_values, metadata)
                VALUES
                (:user_id, :user_name, :user_role, :department, :action, :module, :description, :record_id, :previous_values, :new_values, :metadata)");

            $cleanUserName = gradtrack_audit_clean_text($user_name, 150);
            if (filter_var($cleanUserName, FILTER_VALIDATE_EMAIL) && $user_id !== null && $user_id !== '') {
                $cleanUserName = gradtrack_audit_role_label($user_role) . ' #' . (int) $user_id;
            }

            $stmt->execute([
                ':user_id' => $user_id !== null && $user_id !== '' ? (int) $user_id : null,
                ':user_name' => $cleanUserName,
                ':user_role' => gradtrack_audit_clean_text($user_role, 100),
                ':department' => $department !== null && trim((string) $department) !== ''
                    ? gradtrack_audit_clean_text($department, 150)
                    : null,
                ':action' => gradtrack_audit_clean_text($action, 100),
                ':module' => gradtrack_audit_clean_text($module, 100),
                ':description' => gradtrack_audit_sanitize_description($description),
                ':record_id' => $record_id !== null && trim((string) $record_id) !== ''
                    ? gradtrack_audit_clean_text($record_id, 64)
                    : null,
                ':previous_values' => gradtrack_audit_payload_to_json($previous_values),
                ':new_values' => gradtrack_audit_payload_to_json($new_values),
                ':metadata' => gradtrack_audit_payload_to_json($metadata),
            ]);

            return true;
        } catch (Throwable $e) {
            error_log('Audit Trail logging failed: ' . $e->getMessage());
            return false;
        }
    }
}
