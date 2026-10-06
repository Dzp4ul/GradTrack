<?php
declare(strict_types=1);

ob_start();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/session.php';
require_once __DIR__ . '/../api/config/storage.php';

$db = (new Database())->getConnection();
$baseUrl = rtrim((string) (getenv('GRADTRACK_HTTP_TEST_URL') ?: 'http://localhost/GradTrack/backend/api'), '/');
$cookieName = gradtrack_session_cookie_name();
$failures = 0;
$graduateIds = [];
$accountIds = [];
$sessionIds = [];
$tempFiles = [];

function credentials_http_assert(bool $condition, string $message): void
{
    global $failures;
    echo ($condition ? 'PASS: ' : 'FAIL: ') . $message . PHP_EOL;
    if (!$condition) $failures++;
}

function credentials_http_request(
    string $path,
    string $sessionId,
    string $csrfToken = '',
    string $method = 'GET',
    $body = null,
    bool $json = false
): array {
    global $baseUrl, $cookieName;
    $handle = curl_init($baseUrl . '/' . ltrim($path, '/'));
    if ($handle === false) throw new RuntimeException('Unable to initialize cURL.');
    $headers = ['Accept: application/json', 'Origin: http://localhost:5173'];
    if ($csrfToken !== '') $headers[] = 'X-CSRF-Token: ' . $csrfToken;
    if ($json) $headers[] = 'Content-Type: application/json';
    curl_setopt_array($handle, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_COOKIE => $cookieName . '=' . rawurlencode($sessionId),
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    if ($body !== null) {
        curl_setopt($handle, CURLOPT_POSTFIELDS, $json ? json_encode($body) : $body);
    }
    $raw = curl_exec($handle);
    if ($raw === false) {
        $message = curl_error($handle);
        curl_close($handle);
        throw new RuntimeException('HTTP request failed: ' . $message);
    }
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    $headerSize = (int) curl_getinfo($handle, CURLINFO_HEADER_SIZE);
    curl_close($handle);
    $headerText = substr((string) $raw, 0, $headerSize);
    $responseBody = substr((string) $raw, $headerSize);
    $decoded = json_decode($responseBody, true);
    return [
        'status' => $status,
        'headers' => $headerText,
        'body' => $responseBody,
        'json' => is_array($decoded) ? $decoded : null,
    ];
}

function credentials_http_identity(PDO $db, string $suffix, string $label): array
{
    $programId = (int) $db->query('SELECT id FROM programs ORDER BY id LIMIT 1')->fetchColumn();
    if ($programId <= 0) throw new RuntimeException('At least one program is required.');
    $email = 'credentials-' . strtolower($label) . '-' . $suffix . '@example.invalid';
    $stmt = $db->prepare("INSERT INTO graduates
        (student_id, first_name, last_name, email, program_id, year_graduated, status)
        VALUES (:student_id, :first_name, 'Credential Test', :email, :program_id, 2025, 'active')");
    $stmt->execute([
        ':student_id' => 'CRED-' . strtoupper($label) . '-' . strtoupper($suffix),
        ':first_name' => $label,
        ':email' => $email,
        ':program_id' => $programId,
    ]);
    $graduateId = (int) $db->lastInsertId();
    $stmt = $db->prepare("INSERT INTO graduate_accounts
        (graduate_id, email, password_hash, status, alumni_verification_status, alumni_verification_submitted_at, alumni_verification_reviewed_at)
        VALUES (:graduate_id, :email, :password, 'active', 'approved', NOW(), NOW())");
    $stmt->execute([
        ':graduate_id' => $graduateId,
        ':email' => $email,
        ':password' => password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT),
    ]);
    return ['graduate_id' => $graduateId, 'account_id' => (int) $db->lastInsertId()];
}

function credentials_http_session(int $accountId): array
{
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    ini_set('session.use_strict_mode', '0');
    $sessionId = 'cred' . bin2hex(random_bytes(16));
    session_id($sessionId);
    if (!session_start()) throw new RuntimeException('Unable to create test session.');
    $csrfToken = bin2hex(random_bytes(32));
    $_SESSION = ['graduate_account_id' => $accountId, 'csrf_token' => $csrfToken];
    session_write_close();
    return ['id' => $sessionId, 'csrf' => $csrfToken];
}

function credentials_http_cleanup(): void
{
    global $db, $graduateIds, $accountIds, $sessionIds, $tempFiles;
    try {
        if ($accountIds !== []) {
            $placeholders = implode(',', array_fill(0, count($accountIds), '?'));
            $stmt = $db->prepare("SELECT file_path FROM graduate_credentials WHERE graduate_account_id IN ({$placeholders})");
            $stmt->execute($accountIds);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $reference) {
                gradtrack_storage_delete_quietly((string) $reference);
            }
        }
        foreach (array_reverse($accountIds) as $accountId) {
            $db->prepare('DELETE FROM graduate_accounts WHERE id = :id')->execute([':id' => $accountId]);
        }
        foreach (array_reverse($graduateIds) as $graduateId) {
            $db->prepare('DELETE FROM graduates WHERE id = :id')->execute([':id' => $graduateId]);
        }
    } catch (Throwable $error) {
        echo 'CLEANUP WARNING: ' . $error->getMessage() . PHP_EOL;
    }
    foreach ($tempFiles as $path) {
        if (is_file($path)) @unlink($path);
    }
    foreach ($sessionIds as $sessionId) {
        if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
        ini_set('session.use_strict_mode', '0');
        session_id($sessionId);
        if (@session_start()) {
            $_SESSION = [];
            @session_destroy();
        }
    }
}

$cleanupFinished = false;
register_shutdown_function(static function () use (&$cleanupFinished): void {
    if (!$cleanupFinished) credentials_http_cleanup();
});

try {
    if (!function_exists('curl_init')) throw new RuntimeException('The cURL extension is required.');
    $health = credentials_http_request('csrf.php', 'unavailable');
    if ($health['status'] !== 200) throw new RuntimeException('Test API is not reachable at ' . $baseUrl);

    $suffix = bin2hex(random_bytes(5));
    $owner = credentials_http_identity($db, $suffix, 'Owner');
    $other = credentials_http_identity($db, $suffix, 'Other');
    $graduateIds = [$owner['graduate_id'], $other['graduate_id']];
    $accountIds = [$owner['account_id'], $other['account_id']];
    $ownerSession = credentials_http_session($owner['account_id']);
    $otherSession = credentials_http_session($other['account_id']);
    $sessionIds = [$ownerSession['id'], $otherSession['id']];

    $pdfPath = tempnam(sys_get_temp_dir(), 'gradtrack-credential-pdf-');
    $pngPath = tempnam(sys_get_temp_dir(), 'gradtrack-credential-png-');
    $invalidPath = tempnam(sys_get_temp_dir(), 'gradtrack-credential-invalid-');
    $oversizedPath = tempnam(sys_get_temp_dir(), 'gradtrack-credential-large-');
    if (!$pdfPath || !$pngPath || !$invalidPath || !$oversizedPath) throw new RuntimeException('Unable to create upload fixtures.');
    $tempFiles = [$pdfPath, $pngPath, $invalidPath, $oversizedPath];
    file_put_contents($pdfPath, "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
    file_put_contents($pngPath, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='));
    file_put_contents($invalidPath, 'not a certificate');
    $largeHandle = fopen($oversizedPath, 'wb');
    if ($largeHandle === false) throw new RuntimeException('Unable to create oversized fixture.');
    fseek($largeHandle, (10 * 1024 * 1024) + 1);
    fwrite($largeHandle, "x");
    fclose($largeHandle);

    $invalidType = credentials_http_request('graduate-credentials/index.php', $ownerSession['id'], $ownerSession['csrf'], 'POST', [
        'credential_name' => 'Invalid Type',
        'issuing_organization' => 'Test Organization',
        'certificate' => new CURLFile($invalidPath, 'text/plain', 'certificate.jpg'),
    ]);
    credentials_http_assert($invalidType['status'] === 422, 'invalid file content is rejected server-side');

    $oversized = credentials_http_request('graduate-credentials/index.php', $ownerSession['id'], $ownerSession['csrf'], 'POST', [
        'credential_name' => 'Oversized File',
        'issuing_organization' => 'Test Organization',
        'certificate' => new CURLFile($oversizedPath, 'application/pdf', 'too-large.pdf'),
    ]);
    credentials_http_assert($oversized['status'] === 422, 'files larger than 10 MB are rejected server-side');

    $badDates = credentials_http_request('graduate-credentials/index.php', $ownerSession['id'], $ownerSession['csrf'], 'POST', [
        'credential_name' => 'Bad Dates',
        'issuing_organization' => 'Test Organization',
        'issue_date' => '2026-05-01',
        'expiration_date' => '2026-04-30',
        'verification_url' => 'javascript:alert(1)',
        'certificate' => new CURLFile($pdfPath, 'application/pdf', 'bad-dates.pdf'),
    ]);
    credentials_http_assert(
        $badDates['status'] === 422
        && isset($badDates['json']['errors']['expiration_date'], $badDates['json']['errors']['verification_url']),
        'date ordering and http/https verification link rules are enforced'
    );

    $create = credentials_http_request('graduate-credentials/index.php', $ownerSession['id'], $ownerSession['csrf'], 'POST', [
        'credential_name' => '  Project Management Professional  ',
        'issuing_organization' => '  Project Management Institute  ',
        'issue_date' => '2025-01-10',
        'expiration_date' => '',
        'credential_id' => "  PMP-12345\x00  ",
        'verification_url' => 'https://www.credential.net/verify/PMP-12345',
        'certificate' => new CURLFile($pdfPath, 'application/pdf', '../pmp-certificate.pdf'),
    ]);
    $credential = $create['json']['data'] ?? [];
    $credentialId = (int) ($credential['id'] ?? 0);
    credentials_http_assert($create['status'] === 200 && $credentialId > 0, 'a credential is created through the authenticated API');
    credentials_http_assert(array_key_exists('expiration_date', $credential) && $credential['expiration_date'] === null, 'a credential can be created without an expiration date');
    credentials_http_assert(($credential['status'] ?? '') === 'uploaded', 'new credentials use the truthful Uploaded status');
    credentials_http_assert(!array_key_exists('file_path', $credential), 'API metadata does not expose an internal storage path');

    $storedStmt = $db->prepare('SELECT * FROM graduate_credentials WHERE id = :id');
    $storedStmt->execute([':id' => $credentialId]);
    $storedBefore = $storedStmt->fetch(PDO::FETCH_ASSOC);
    credentials_http_assert(
        $storedBefore
        && (int) $storedBefore['graduate_account_id'] === $owner['account_id']
        && preg_match('/^[0-9a-f-]{36}\.pdf$/', (string) $storedBefore['stored_file_name']) === 1
        && !str_contains((string) $storedBefore['original_file_name'], '/'),
        'the authenticated account owns the row and storage uses a safe unique filename'
    );

    $refresh = credentials_http_request('graduate-credentials/index.php', $ownerSession['id']);
    $refreshIds = array_map('intval', array_column($refresh['json']['data'] ?? [], 'id'));
    credentials_http_assert($refresh['status'] === 200 && in_array($credentialId, $refreshIds, true), 'credential persists after a fresh list request');

    $otherList = credentials_http_request('graduate-credentials/index.php', $otherSession['id']);
    credentials_http_assert(count($otherList['json']['data'] ?? []) === 0, 'the default credential list remains scoped to the logged-in graduate');
    $publicList = credentials_http_request(
        'graduate-credentials/index.php?graduate_id=' . $owner['graduate_id'],
        $otherSession['id']
    );
    $publicListIds = array_map('intval', array_column($publicList['json']['data'] ?? [], 'id'));
    credentials_http_assert(
        $publicList['status'] === 200 && in_array($credentialId, $publicListIds, true),
        'an authenticated graduate can view credentials on another approved graduate profile'
    );
    $otherRead = credentials_http_request('graduate-credentials/index.php?id=' . $credentialId, $otherSession['id']);
    credentials_http_assert($otherRead['status'] === 404, 'changing only a credential id cannot escape the logged-in graduate scope');
    $publicRead = credentials_http_request(
        'graduate-credentials/index.php?id=' . $credentialId . '&graduate_id=' . $owner['graduate_id'],
        $otherSession['id']
    );
    credentials_http_assert(
        $publicRead['status'] === 200 && (int) ($publicRead['json']['data']['id'] ?? 0) === $credentialId,
        'credential metadata is available through an explicit viewed-profile scope'
    );
    $otherFile = credentials_http_request('graduate-credentials/index.php?id=' . $credentialId . '&file=1', $otherSession['id']);
    credentials_http_assert($otherFile['status'] === 404, 'changing only a file id cannot preview another graduate credential');
    $publicFile = credentials_http_request(
        'graduate-credentials/index.php?id=' . $credentialId . '&graduate_id=' . $owner['graduate_id'] . '&file=1',
        $otherSession['id']
    );
    credentials_http_assert(
        in_array($publicFile['status'], [200, 302], true)
        && (stripos($publicFile['headers'], 'Content-Type: application/pdf') !== false || stripos($publicFile['headers'], 'Location:') !== false),
        'an authenticated profile viewer can preview the shared credential file'
    );
    $publicDownload = credentials_http_request(
        'graduate-credentials/index.php?id=' . $credentialId . '&graduate_id=' . $owner['graduate_id'] . '&download=1',
        $otherSession['id']
    );
    credentials_http_assert(
        in_array($publicDownload['status'], [200, 302], true)
        && (stripos($publicDownload['headers'], 'Content-Disposition: attachment') !== false || stripos($publicDownload['headers'], 'Location:') !== false),
        'an authenticated profile viewer can download the shared credential file'
    );
    $otherUpdate = credentials_http_request('graduate-credentials/index.php', $otherSession['id'], $otherSession['csrf'], 'POST', [
        '_method' => 'PUT',
        'id' => (string) $credentialId,
        'credential_name' => 'Unauthorized Update',
        'issuing_organization' => 'Unauthorized Organization',
    ]);
    credentials_http_assert($otherUpdate['status'] === 404, 'another graduate cannot edit a shared credential');
    $otherDelete = credentials_http_request('graduate-credentials/index.php', $otherSession['id'], $otherSession['csrf'], 'DELETE', ['id' => $credentialId], true);
    credentials_http_assert($otherDelete['status'] === 404, 'another graduate cannot delete the credential');

    $preview = credentials_http_request('graduate-credentials/index.php?id=' . $credentialId . '&file=1', $ownerSession['id']);
    credentials_http_assert(
        in_array($preview['status'], [200, 302], true)
        && (stripos($preview['headers'], 'Content-Type: application/pdf') !== false || stripos($preview['headers'], 'Location:') !== false),
        'View serves or securely redirects to an inline PDF without forcing download'
    );
    $download = credentials_http_request('graduate-credentials/index.php?id=' . $credentialId . '&download=1', $ownerSession['id']);
    credentials_http_assert(
        in_array($download['status'], [200, 302], true)
        && (stripos($download['headers'], 'Content-Disposition: attachment') !== false || stripos($download['headers'], 'Location:') !== false),
        'Download securely serves or redirects to the actual credential file'
    );

    $edit = credentials_http_request('graduate-credentials/index.php', $ownerSession['id'], $ownerSession['csrf'], 'POST', [
        '_method' => 'PUT',
        'id' => (string) $credentialId,
        'credential_name' => 'PMP Updated',
        'issuing_organization' => 'Project Management Institute',
        'issue_date' => '2025-01-10',
        'expiration_date' => '2027-01-10',
        'credential_id' => 'PMP-12345',
        'verification_url' => 'https://www.credential.net/verify/PMP-12345',
    ]);
    credentials_http_assert(
        $edit['status'] === 200
        && ($edit['json']['data']['credential_name'] ?? '') === 'PMP Updated'
        && ($edit['json']['data']['original_file_name'] ?? '') === ($credential['original_file_name'] ?? ''),
        'credential details can be edited while keeping the existing certificate'
    );

    $oldReference = (string) $storedBefore['file_path'];
    $replace = credentials_http_request('graduate-credentials/index.php', $ownerSession['id'], $ownerSession['csrf'], 'POST', [
        '_method' => 'PUT',
        'id' => (string) $credentialId,
        'credential_name' => 'PMP Updated',
        'issuing_organization' => 'Project Management Institute',
        'issue_date' => '2025-01-10',
        'expiration_date' => '2027-01-10',
        'credential_id' => 'PMP-12345',
        'verification_url' => '',
        'certificate' => new CURLFile($pngPath, 'image/png', 'replacement.png'),
    ]);
    $storedStmt->execute([':id' => $credentialId]);
    $storedAfter = $storedStmt->fetch(PDO::FETCH_ASSOC);
    credentials_http_assert(
        $replace['status'] === 200
        && ($replace['json']['data']['mime_type'] ?? '') === 'image/png'
        && $storedAfter
        && $storedAfter['file_path'] !== $oldReference
        && !gradtrack_storage_exists($oldReference),
        'replacing a certificate stores the new image and removes the prior file'
    );

    $newReference = (string) $storedAfter['file_path'];
    $delete = credentials_http_request('graduate-credentials/index.php', $ownerSession['id'], $ownerSession['csrf'], 'DELETE', ['id' => $credentialId], true);
    $storedStmt->execute([':id' => $credentialId]);
    credentials_http_assert(
        $delete['status'] === 200
        && $storedStmt->fetch() === false
        && !gradtrack_storage_exists($newReference),
        'confirmed deletion removes both the credential record and its file'
    );
} catch (Throwable $error) {
    credentials_http_assert(false, 'credential HTTP integration completed without an exception: ' . $error->getMessage());
}

credentials_http_cleanup();
$cleanupFinished = true;
if ($failures > 0) {
    echo PHP_EOL . $failures . ' graduate credential integration test(s) failed.' . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'Graduate credentials HTTP integration test passed.' . PHP_EOL;
