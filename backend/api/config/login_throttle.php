<?php
require_once __DIR__ . '/env.php';

if (!function_exists('gradtrack_login_throttle_mutate')) {
    function gradtrack_login_throttle_mutate(string $scope, string $identifier, callable $callback)
    {
        $configuredDirectory = trim((string) gradtrack_env('LOGIN_THROTTLE_DIR', ''));
        $directory = $configuredDirectory !== ''
            ? $configuredDirectory
            : rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'gradtrack-login-throttle';
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
            throw new RuntimeException('Unable to initialize login throttling');
        }

        $key = hash('sha256', $scope . '|' . strtolower(trim($identifier)));
        $path = $directory . DIRECTORY_SEPARATOR . $key . '.json';
        $handle = fopen($path, 'c+');
        if ($handle === false || !flock($handle, LOCK_EX)) {
            if (is_resource($handle)) fclose($handle);
            throw new RuntimeException('Unable to lock login throttling state');
        }

        try {
            rewind($handle);
            $decoded = json_decode((string) stream_get_contents($handle), true);
            $state = is_array($decoded) ? $decoded : [];
            $result = $callback($state);
            rewind($handle);
            ftruncate($handle, 0);
            fwrite($handle, json_encode($state));
            fflush($handle);
            return $result;
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }
}

if (!function_exists('gradtrack_login_client_ip')) {
    function gradtrack_login_client_ip(): string
    {
        $ip = trim((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
        return filter_var($ip, FILTER_VALIDATE_IP) !== false ? $ip : 'unknown';
    }
}

if (!function_exists('gradtrack_login_throttle_status_for_key')) {
    function gradtrack_login_throttle_status_for_key(string $scope, string $identifier, int $windowSeconds): int
    {
        return gradtrack_login_throttle_mutate($scope, $identifier, static function (array &$state) use ($windowSeconds): int {
            $now = time();
            $attempts = array_values(array_filter(
                is_array($state['attempts'] ?? null) ? $state['attempts'] : [],
                static fn ($attempt): bool => is_int($attempt) && $attempt > $now - $windowSeconds
            ));
            $blockedUntil = (int) ($state['blocked_until'] ?? 0);
            if ($blockedUntil <= $now) $blockedUntil = 0;
            $state = ['attempts' => $attempts, 'blocked_until' => $blockedUntil];
            return max(0, $blockedUntil - $now);
        });
    }
}

if (!function_exists('gradtrack_login_throttle_check')) {
    function gradtrack_login_throttle_check(string $accountIdentifier): array
    {
        $accountRetry = gradtrack_login_throttle_status_for_key('account', $accountIdentifier, 900);
        $ipRetry = gradtrack_login_throttle_status_for_key('ip', gradtrack_login_client_ip(), 900);
        $retryAfter = max($accountRetry, $ipRetry);
        return ['allowed' => $retryAfter === 0, 'retry_after' => $retryAfter];
    }
}

if (!function_exists('gradtrack_login_throttle_record_failure_for_key')) {
    function gradtrack_login_throttle_record_failure_for_key(string $scope, string $identifier, int $limit, int $windowSeconds, int $cooldownSeconds): void
    {
        gradtrack_login_throttle_mutate($scope, $identifier, static function (array &$state) use ($limit, $windowSeconds, $cooldownSeconds): void {
            $now = time();
            $attempts = array_values(array_filter(
                is_array($state['attempts'] ?? null) ? $state['attempts'] : [],
                static fn ($attempt): bool => is_int($attempt) && $attempt > $now - $windowSeconds
            ));
            $attempts[] = $now;
            $state = [
                'attempts' => $attempts,
                'blocked_until' => count($attempts) >= $limit ? $now + $cooldownSeconds : 0,
            ];
        });
    }
}

if (!function_exists('gradtrack_login_throttle_record_failure')) {
    function gradtrack_login_throttle_record_failure(string $accountIdentifier): void
    {
        gradtrack_login_throttle_record_failure_for_key('account', $accountIdentifier, 5, 900, 300);
        gradtrack_login_throttle_record_failure_for_key('ip', gradtrack_login_client_ip(), 25, 900, 120);
    }
}

if (!function_exists('gradtrack_login_throttle_clear_success')) {
    function gradtrack_login_throttle_clear_success(string $accountIdentifier): void
    {
        gradtrack_login_throttle_mutate('account', $accountIdentifier, static function (array &$state): void {
            $state = [];
        });
    }
}

if (!function_exists('gradtrack_login_throttle_reject_if_blocked')) {
    function gradtrack_login_throttle_reject_if_blocked(string $accountIdentifier): void
    {
        $status = gradtrack_login_throttle_check($accountIdentifier);
        if ($status['allowed']) return;
        http_response_code(429);
        header('Retry-After: ' . max(1, (int) $status['retry_after']));
        header('Cache-Control: no-store');
        echo json_encode([
            'success' => false,
            'error' => 'Too many sign-in attempts. Please wait briefly and try again.',
        ]);
        exit;
    }
}
