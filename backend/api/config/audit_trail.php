<?php

if (!function_exists('gradtrack_audit_load_env_file')) {
    function gradtrack_audit_load_env_file(): void
    {
        $envFile = __DIR__ . '/../../.env';
        if (!file_exists($envFile)) {
            return;
        }

        $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            return;
        }

        foreach ($lines as $line) {
            $trimmed = trim($line);
            if ($trimmed === '' || strpos($trimmed, '#') === 0 || strpos($trimmed, '=') === false) {
                continue;
            }

            [$key, $value] = explode('=', $trimmed, 2);
            $key = trim($key);
            $value = trim($value);

            if ($key !== '' && getenv($key) === false) {
                putenv($key . '=' . $value);
            }
        }
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

        $host = getenv('DB_HOST') ?: 'localhost';
        $database = getenv('DB_NAME') ?: 'gradtrackdb';
        $username = getenv('DB_USER') ?: 'root';
        $password = getenv('DB_PASSWORD') ?: '';
        $port = getenv('DB_PORT') ?: 3306;

        try {
            $pdo = new PDO(
                "mysql:host={$host};port={$port};dbname={$database}",
                $username,
                $password,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
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

if (!function_exists('gradtrack_ensure_audit_trail_table')) {
    function gradtrack_ensure_audit_trail_table(PDO $pdo): void
    {
        $pdo->exec("CREATE TABLE IF NOT EXISTS audit_trail (
            audit_id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NULL,
            user_name VARCHAR(150),
            user_role VARCHAR(100),
            department VARCHAR(150) NULL,
            action VARCHAR(100),
            module VARCHAR(100),
            description TEXT,
            ip_address VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_audit_created_at (created_at),
            INDEX idx_audit_user_role (user_role),
            INDEX idx_audit_department (department),
            INDEX idx_audit_action (action),
            INDEX idx_audit_module (module)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
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

if (!function_exists('gradtrack_audit_client_ip')) {
    function gradtrack_audit_client_ip(): string
    {
        $candidateHeaders = [
            'HTTP_CLIENT_IP',
            'HTTP_X_FORWARDED_FOR',
            'HTTP_X_REAL_IP',
            'REMOTE_ADDR',
        ];

        foreach ($candidateHeaders as $header) {
            $value = trim((string) ($_SERVER[$header] ?? ''));
            if ($value === '') {
                continue;
            }

            $firstIp = trim(explode(',', $value)[0]);
            if ($firstIp !== '') {
                return gradtrack_audit_clean_text($firstIp, 100);
            }
        }

        return 'Unknown';
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

if (!function_exists('gradtrack_audit_current_admin_context')) {
    function gradtrack_audit_current_admin_context(): array
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        $role = (string) ($_SESSION['role'] ?? 'guest');
        $name = trim((string) ($_SESSION['full_name'] ?? ''));

        if ($name === '') {
            $name = trim((string) ($_SESSION['username'] ?? ''));
        }

        if ($name === '') {
            $name = trim((string) ($_SESSION['email'] ?? ''));
        }

        return [
            'user_id' => isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null,
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

if (!function_exists('logAuditTrail')) {
    /**
     * Insert one audit trail record after an important action succeeds.
     *
     * Call this in existing PHP action handlers after the database change is
     * committed or the login/logout state has been established.
     */
    function logAuditTrail($user_id, $user_name, $user_role, $department, $action, $module, $description): bool
    {
        try {
            $pdo = gradtrack_audit_get_connection();
            if (!$pdo) {
                return false;
            }

            gradtrack_ensure_audit_trail_table($pdo);

            $stmt = $pdo->prepare("INSERT INTO audit_trail
                (user_id, user_name, user_role, department, action, module, description, ip_address)
                VALUES
                (:user_id, :user_name, :user_role, :department, :action, :module, :description, :ip_address)");

            $stmt->execute([
                ':user_id' => $user_id !== null && $user_id !== '' ? (int) $user_id : null,
                ':user_name' => gradtrack_audit_clean_text($user_name, 150),
                ':user_role' => gradtrack_audit_clean_text($user_role, 100),
                ':department' => $department !== null && trim((string) $department) !== ''
                    ? gradtrack_audit_clean_text($department, 150)
                    : null,
                ':action' => gradtrack_audit_clean_text($action, 100),
                ':module' => gradtrack_audit_clean_text($module, 100),
                ':description' => trim((string) ($description ?? '')),
                ':ip_address' => gradtrack_audit_client_ip(),
            ]);

            return true;
        } catch (Throwable $e) {
            error_log('Audit Trail logging failed: ' . $e->getMessage());
            return false;
        }
    }
}
