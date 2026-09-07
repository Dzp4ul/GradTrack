<?php
declare(strict_types=1);

function otp_throttle_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
    echo 'PASS: ' . $message . PHP_EOL;
}

function otp_throttle_json_request(CurlHandle $handle, string $url, string $method, ?array $payload = null, array $headers = []): array
{
    curl_setopt_array($handle, [
        CURLOPT_URL => $url,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => false,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => $payload === null ? null : json_encode($payload, JSON_THROW_ON_ERROR),
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 20,
    ]);
    $raw = curl_exec($handle);
    if ($raw === false) {
        throw new RuntimeException('HTTP request failed: ' . curl_error($handle));
    }
    $decoded = json_decode((string) $raw, true);
    return [
        'status' => (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE),
        'body' => is_array($decoded) ? $decoded : [],
    ];
}

if (!function_exists('curl_init')) {
    fwrite(STDERR, "FAIL: PHP cURL support is required for the OTP throttle test.\n");
    exit(1);
}

$baseUrl = rtrim((string) (getenv('GRADTRACK_API_BASE_URL') ?: 'http://localhost/GradTrack/backend'), '/');
$handle = curl_init();
if ($handle === false) {
    fwrite(STDERR, "FAIL: Unable to initialize cURL.\n");
    exit(1);
}
curl_setopt($handle, CURLOPT_COOKIEFILE, '');

try {
    $csrf = otp_throttle_json_request($handle, $baseUrl . '/api/csrf.php', 'GET', null, ['Accept: application/json']);
    $csrfToken = (string) ($csrf['body']['csrf_token'] ?? '');
    otp_throttle_assert($csrf['status'] === 200 && $csrfToken !== '', 'a CSRF token is established for the password-reset session');

    $email = 'otp-throttle-' . bin2hex(random_bytes(8)) . '@example.invalid';
    $headers = ['Content-Type: application/json', 'X-CSRF-Token: ' . $csrfToken];
    $first = otp_throttle_json_request($handle, $baseUrl . '/api/graduate-auth/forgot-password.php', 'POST', [
        'action' => 'send_otp',
        'email' => $email,
    ], $headers);
    otp_throttle_assert($first['status'] === 200 && ($first['body']['success'] ?? false) === true, 'the first OTP request is accepted without revealing whether the account exists');
    otp_throttle_assert((int) ($first['body']['data']['retry_after_seconds'] ?? 0) === 60, 'the server returns the authoritative 60-second resend interval');

    $second = otp_throttle_json_request($handle, $baseUrl . '/api/graduate-auth/forgot-password.php', 'POST', [
        'action' => 'send_otp',
        'email' => $email,
    ], $headers);
    $retryAfter = (int) ($second['body']['data']['retry_after_seconds'] ?? 0);
    otp_throttle_assert($second['status'] === 429 && ($second['body']['success'] ?? true) === false, 'a direct repeated OTP request is rejected by the backend');
    otp_throttle_assert($retryAfter > 0 && $retryAfter <= 60, 'the throttled response returns a usable remaining countdown');
    otp_throttle_assert(
        (int) ($second['body']['data']['resend_available_at'] ?? 0) > (int) ($second['body']['data']['server_time'] ?? 0),
        'the throttled response includes server-authoritative resend timestamps'
    );

    echo PHP_EOL . 'Forgot-password OTP throttle HTTP integration test passed.' . PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, 'FAIL: ' . $error->getMessage() . PHP_EOL);
    $exitCode = 1;
} finally {
    curl_close($handle);
}

exit($exitCode ?? 0);
