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

if (!function_exists('gradtrack_load_env_file')) {
    function gradtrack_load_env_file(bool $overrideExisting = false): void
    {
        $envFile = gradtrack_env_file_path();

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
