<?php

if (!function_exists('gradtrack_realtime_base64url_encode')) {
    function gradtrack_realtime_base64url_encode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}

if (!function_exists('gradtrack_realtime_auth_secret')) {
    function gradtrack_realtime_auth_secret(): string
    {
        $secret = getenv('REALTIME_AUTH_SECRET') ?: getenv('APP_KEY') ?: '';
        if (trim($secret) !== '') {
            return $secret;
        }

        $fallbackParts = [
            getenv('DB_HOST') ?: 'localhost',
            getenv('DB_NAME') ?: 'gradtrackdb',
            getenv('DB_USER') ?: 'root',
            getenv('DB_PASSWORD') ?: '',
        ];

        return hash('sha256', 'gradtrack-realtime-auth|' . implode('|', $fallbackParts));
    }
}

if (!function_exists('gradtrack_create_realtime_token')) {
    function gradtrack_create_realtime_token(array $user, int $ttlSeconds = 300): array
    {
        $now = time();
        $ttl = max(60, min($ttlSeconds, 3600));
        $expiresAt = $now + $ttl;

        $payload = [
            'account_id' => (int) ($user['account_id'] ?? 0),
            'graduate_id' => (int) ($user['graduate_id'] ?? 0),
            'full_name' => trim((string) ($user['full_name'] ?? 'Graduate')) ?: 'Graduate',
            'iat' => $now,
            'exp' => $expiresAt,
            'nonce' => bin2hex(random_bytes(12)),
        ];

        $payloadSegment = gradtrack_realtime_base64url_encode(json_encode($payload, JSON_UNESCAPED_SLASHES));
        $signatureSegment = gradtrack_realtime_base64url_encode(hash_hmac('sha256', $payloadSegment, gradtrack_realtime_auth_secret(), true));

        return [
            'token' => $payloadSegment . '.' . $signatureSegment,
            'expires_at' => date('c', $expiresAt),
        ];
    }
}
