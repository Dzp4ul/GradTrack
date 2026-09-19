<?php

require_once __DIR__ . '/env.php';

if (!function_exists('gradtrack_realtime_publish_url')) {
    function gradtrack_realtime_publish_url(): string
    {
        $port = (int) gradtrack_env('REALTIME_PORT', 3001);
        $configured = trim((string) gradtrack_env(
            'REALTIME_PUBLISH_URL',
            'http://127.0.0.1:' . ($port > 0 ? $port : 3001) . '/internal/publish'
        ));

        $parts = parse_url($configured);
        $host = strtolower((string) ($parts['host'] ?? ''));
        $allowedHosts = gradtrack_is_production()
            ? ['127.0.0.1', '::1']
            : ['127.0.0.1', '::1', 'localhost'];

        if (($parts['scheme'] ?? '') !== 'http' || !in_array($host, $allowedHosts, true)) {
            throw new RuntimeException('REALTIME_PUBLISH_URL must use the local loopback HTTP service');
        }

        return $configured;
    }
}

if (!function_exists('gradtrack_realtime_publish_secret')) {
    function gradtrack_realtime_publish_secret(): string
    {
        $secret = trim((string) gradtrack_env('REALTIME_PUBLISH_SECRET', ''));
        if ($secret === '' && !gradtrack_is_production()) {
            return 'gradtrack-local-realtime-publish';
        }
        if (
            strlen($secret) < 32
            || (gradtrack_is_production() && preg_match('/(?:replace-with|change-me|gradtrack-local)/i', $secret) === 1)
        ) {
            throw new RuntimeException('REALTIME_PUBLISH_SECRET must contain at least 32 characters');
        }
        return $secret;
    }
}

if (!function_exists('gradtrack_realtime_publish')) {
    /**
     * Notify the loopback realtime service after a database mutation commits.
     * Only identifiers cross this boundary; Socket.IO reloads the authoritative row.
     */
    function gradtrack_realtime_publish(string $entity, string $action, int $entityId, array $context = []): bool
    {
        if ($entityId <= 0) {
            return false;
        }

        try {
            $body = json_encode([
                'event_id' => bin2hex(random_bytes(16)),
                'entity' => $entity,
                'action' => $action,
                'entity_id' => $entityId,
                'context' => $context,
                'occurred_at' => gmdate('c'),
            ], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $timestamp = (string) time();
            $signature = hash_hmac('sha256', $timestamp . '.' . $body, gradtrack_realtime_publish_secret());
            $timeoutMilliseconds = max(250, min(5000, (int) gradtrack_env('REALTIME_PUBLISH_TIMEOUT_MS', 1500)));
            $headers = [
                'Content-Type: application/json',
                'Content-Length: ' . strlen($body),
                'X-GradTrack-Timestamp: ' . $timestamp,
                'X-GradTrack-Signature: ' . $signature,
            ];

            if (function_exists('curl_init')) {
                $handle = curl_init(gradtrack_realtime_publish_url());
                if ($handle === false) {
                    throw new RuntimeException('Unable to initialize realtime publisher');
                }
                curl_setopt_array($handle, [
                    CURLOPT_POST => true,
                    CURLOPT_POSTFIELDS => $body,
                    CURLOPT_HTTPHEADER => $headers,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_CONNECTTIMEOUT_MS => $timeoutMilliseconds,
                    CURLOPT_TIMEOUT_MS => $timeoutMilliseconds,
                ]);
                $response = curl_exec($handle);
                $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
                $error = curl_error($handle);
                curl_close($handle);

                if ($response === false || $status < 200 || $status >= 300) {
                    throw new RuntimeException($error !== '' ? $error : "Realtime publisher returned HTTP {$status}");
                }
                return true;
            }

            $contextOptions = stream_context_create([
                'http' => [
                    'method' => 'POST',
                    'header' => implode("\r\n", $headers),
                    'content' => $body,
                    'timeout' => $timeoutMilliseconds / 1000,
                    'ignore_errors' => true,
                ],
            ]);
            $response = @file_get_contents(gradtrack_realtime_publish_url(), false, $contextOptions);
            $statusLine = $http_response_header[0] ?? '';
            if ($response === false || preg_match('/\s2\d\d\s/', $statusLine) !== 1) {
                throw new RuntimeException('Realtime publisher request failed');
            }
            return true;
        } catch (Throwable $error) {
            // A committed API write remains successful while connected clients fall back
            // to their normal database load/reconnect synchronization path.
            error_log('GradTrack realtime publish failed: ' . $error->getMessage());
            return false;
        }
    }
}
