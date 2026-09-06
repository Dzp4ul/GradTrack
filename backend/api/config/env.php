<?php

if (!function_exists('gradtrack_env_file_path')) {
    function gradtrack_env_file_path(): string
    {
        return __DIR__ . '/../../.env';
    }
}

if (!function_exists('gradtrack_parse_env_value')) {
    function gradtrack_parse_env_value(string $value): string
    {
        $value = trim($value);

        if ($value === '') {
            return '';
        }

        $first = $value[0];
        $last = substr($value, -1);

        if (($first === '"' || $first === "'") && $last === $first) {
            $value = substr($value, 1, -1);
        }

        return trim($value);
    }
}

if (!function_exists('gradtrack_load_env_path')) {
    function gradtrack_load_env_path(string $envFile, bool $overrideExisting = false): void
    {
        if (!file_exists($envFile)) {
            return;
        }

        $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            error_log('GradTrack env file could not be read: ' . $envFile);
            return;
        }

        foreach ($lines as $line) {
            $trimmed = trim($line);
            if ($trimmed === '' || strpos($trimmed, '#') === 0 || strpos($trimmed, '=') === false) {
                continue;
            }

            if (stripos($trimmed, 'export ') === 0) {
                $trimmed = trim(substr($trimmed, 7));
            }

            [$key, $value] = explode('=', $trimmed, 2);
            $key = trim($key);

            if ($key === '' || preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $key) !== 1) {
                continue;
            }

            if (!$overrideExisting && getenv($key) !== false) {
                continue;
            }

            $value = gradtrack_parse_env_value($value);
            putenv($key . '=' . $value);
            $_ENV[$key] = $value;
            $_SERVER[$key] = $value;
        }
    }
}

if (!function_exists('gradtrack_load_env_file')) {
    function gradtrack_load_env_file(bool $overrideExisting = false): void
    {
        gradtrack_load_env_path(gradtrack_env_file_path(), $overrideExisting);
    }
}

if (!function_exists('gradtrack_env')) {
    function gradtrack_env(string $key, $default = null)
    {
        $value = getenv($key);

        if ($value === false && array_key_exists($key, $_ENV)) {
            $value = $_ENV[$key];
        }

        if ($value === false && array_key_exists($key, $_SERVER)) {
            $value = $_SERVER[$key];
        }

        if ($value === false || $value === null || $value === '') {
            return $default;
        }

        return $value;
    }
}

if (!function_exists('gradtrack_env_bool')) {
    function gradtrack_env_bool(string $key, bool $default = false): bool
    {
        $value = gradtrack_env($key);
        if ($value === null) {
            return $default;
        }

        $parsed = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        return $parsed ?? $default;
    }
}

if (!function_exists('gradtrack_app_environment')) {
    function gradtrack_app_environment(): string
    {
        return strtolower(trim((string) gradtrack_env('APP_ENV', 'development')));
    }
}

if (!function_exists('gradtrack_is_production')) {
    function gradtrack_is_production(): bool
    {
        return in_array(gradtrack_app_environment(), ['prod', 'production'], true);
    }
}

if (!function_exists('gradtrack_debug_enabled')) {
    function gradtrack_debug_enabled(): bool
    {
        return !gradtrack_is_production() && gradtrack_env_bool('APP_DEBUG', false);
    }
}

if (!function_exists('gradtrack_frontend_url')) {
    function gradtrack_frontend_url(): string
    {
        $configured = trim((string) gradtrack_env('FRONTEND_URL', gradtrack_env('APP_URL', '')));
        if ($configured === '') {
            if (gradtrack_is_production()) {
                throw new RuntimeException('FRONTEND_URL is required in production.');
            }
            $origin = trim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''));
            return $origin !== '' ? rtrim($origin, '/') : 'http://localhost:5173';
        }

        $configured = rtrim($configured, '/');

        if (filter_var($configured, FILTER_VALIDATE_URL) === false) {
            throw new RuntimeException('FRONTEND_URL must be a valid absolute URL.');
        }
        $parsed = parse_url($configured);
        $host = strtolower((string) ($parsed['host'] ?? ''));
        if (gradtrack_is_production() && (
            strtolower((string) ($parsed['scheme'] ?? '')) !== 'https'
            || $host === ''
            || in_array($host, ['localhost', '127.0.0.1', '::1'], true)
            || isset($parsed['user'])
            || isset($parsed['pass'])
            || isset($parsed['query'])
            || isset($parsed['fragment'])
            || (($parsed['path'] ?? '') !== '')
            || preg_match('/(?:example|change-me|your-)/i', $configured) === 1
        )) {
            throw new RuntimeException('FRONTEND_URL must be a real HTTPS production origin.');
        }

        return rtrim($configured, '/');
    }
}

if (!function_exists('gradtrack_runtime_schema_changes_allowed')) {
    function gradtrack_runtime_schema_changes_allowed(): bool
    {
        if (defined('GRADTRACK_SCHEMA_MIGRATION') && GRADTRACK_SCHEMA_MIGRATION === true) {
            return true;
        }
        return !gradtrack_is_production() && gradtrack_env_bool('SCHEMA_AUTO_MIGRATE', true);
    }
}

if (!function_exists('gradtrack_log_exception')) {
    function gradtrack_log_exception(string $context, Throwable $error): void
    {
        $safeContext = preg_replace('/[^A-Za-z0-9_. -]/', '_', $context) ?: 'Application error';
        error_log(sprintf(
            '[GradTrack] %s | %s: %s | %s:%d',
            $safeContext,
            get_class($error),
            str_replace(["\r", "\n"], ' ', $error->getMessage()),
            $error->getFile(),
            $error->getLine()
        ));
    }
}

if (!function_exists('gradtrack_public_exception_message')) {
    function gradtrack_public_exception_message(
        Throwable $error,
        string $productionMessage = 'Unable to complete the request. Please try again.',
        ?string $logContext = null
    ): string {
        if ($logContext !== null) {
            gradtrack_log_exception($logContext, $error);
        }
        return gradtrack_debug_enabled() ? $error->getMessage() : $productionMessage;
    }
}

if (!function_exists('gradtrack_json_exception_response')) {
    function gradtrack_json_exception_response(
        Throwable $error,
        string $context,
        int $statusCode = 500,
        string $productionMessage = 'Unable to complete the request. Please try again.'
    ): void {
        gradtrack_log_exception($context, $error);
        if (!headers_sent()) {
            http_response_code($statusCode);
            header('Content-Type: application/json; charset=UTF-8');
            header('Cache-Control: no-store');
        }
        echo json_encode([
            'success' => false,
            'error' => gradtrack_public_exception_message($error, $productionMessage),
        ]);
    }
}

if (!function_exists('gradtrack_require_development_endpoint')) {
    /**
     * Defense in depth for legacy browser diagnostics. Production Nginx also
     * denies these paths, but the application guard protects alternate servers.
     */
    function gradtrack_require_development_endpoint(): void
    {
        gradtrack_load_env_file();
        if (!gradtrack_is_production()) {
            return;
        }

        if (!headers_sent()) {
            http_response_code(404);
            header('Content-Type: application/json; charset=UTF-8');
            header('Cache-Control: no-store');
        }
        echo json_encode(['success' => false, 'error' => 'Not found']);
        exit;
    }
}

if (!function_exists('gradtrack_require_cli')) {
    function gradtrack_require_cli(): void
    {
        if (PHP_SAPI === 'cli') {
            return;
        }

        if (!headers_sent()) {
            http_response_code(404);
            header('Content-Type: application/json; charset=UTF-8');
            header('Cache-Control: no-store');
        }
        echo json_encode(['success' => false, 'error' => 'Not found']);
        exit;
    }
}

if (!function_exists('gradtrack_register_production_error_handler')) {
    function gradtrack_register_production_error_handler(): void
    {
        static $registered = false;
        if ($registered) {
            return;
        }
        $registered = true;

        if (gradtrack_is_production()) {
            ini_set('display_errors', '0');
            ini_set('log_errors', '1');
        }

        set_exception_handler(static function (Throwable $error): void {
            gradtrack_log_exception('Uncaught request exception', $error);
            if (!headers_sent()) {
                http_response_code(500);
                header('Content-Type: application/json; charset=UTF-8');
                header('Cache-Control: no-store');
            }
            echo json_encode([
                'success' => false,
                'error' => gradtrack_public_exception_message($error),
            ]);
        });
    }
}
