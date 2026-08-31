<?php

declare(strict_types=1);

require_once __DIR__ . '/../api/config/storage.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

echo "GradTrack S3 diagnostic\n";
echo 'PHP runtime: ' . PHP_VERSION . ' (' . PHP_SAPI . ")\n";

$writeTest = in_array('--write-test', $argv ?? [], true);

try {
    $config = gradtrack_storage_config();
} catch (Throwable $error) {
    gradtrack_storage_log('ERROR', 'Diagnostic configuration failed', gradtrack_storage_exception_context($error));
    fwrite(STDERR, 'FAIL: ' . gradtrack_storage_sanitize_log_value($error->getMessage()) . "\n");
    exit(1);
}

echo 'Environment: ' . $config['environment'] . "\n";
echo 'Driver: ' . $config['driver'] . "\n";
echo 'Region: ' . $config['region'] . "\n";
echo 'Bucket configured: ' . ($config['bucket'] !== '' ? 'yes' : 'no') . "\n";
echo 'Credential source: ' . ($config['profile'] !== '' ? 'AWS profile' : 'AWS SDK default provider chain')
    . ' (credential values are never displayed)' . "\n";

if (!gradtrack_storage_uses_s3()) {
    fwrite(STDERR, "FAIL: Set STORAGE_DRIVER=s3 before running this diagnostic.\n");
    exit(1);
}

if ($config['environment'] === 'production' || $config['bucket'] === 'nc-gradtrack-prod') {
    fwrite(STDERR, "FAIL: This diagnostic is intentionally blocked for the production bucket.\n");
    exit(1);
}

try {
    gradtrack_storage_s3_client();
    $sdkVersion = class_exists(\Composer\InstalledVersions::class)
        ? (\Composer\InstalledVersions::getPrettyVersion('aws/aws-sdk-php') ?: 'unknown')
        : 'unknown';
    echo 'PASS: AWS SDK initialized (aws/aws-sdk-php ' . $sdkVersion . ")\n";
} catch (Throwable $error) {
    gradtrack_storage_log('ERROR', 'Diagnostic client initialization failed', gradtrack_storage_exception_context($error));
    fwrite(STDERR, 'FAIL: ' . gradtrack_storage_sanitize_log_value($error->getMessage()) . "\n");
    exit(2);
}

if (!$writeTest) {
    echo "SKIP: Write/read/delete test (run again with --write-test)\n";
    exit(0);
}

$temporaryFile = tempnam(sys_get_temp_dir(), 'gradtrack-s3-');
if ($temporaryFile === false) {
    fwrite(STDERR, "FAIL: Unable to create a local diagnostic file.\n");
    exit(3);
}

$objectKey = 'temporary/diagnostics/' . gradtrack_storage_uuid_filename('txt');
$storedReference = null;
$payload = 'GradTrack S3 diagnostic ' . gmdate(DATE_ATOM);

try {
    file_put_contents($temporaryFile, $payload);
    $stored = gradtrack_storage_put_file(
        $temporaryFile,
        $objectKey,
        'uploads/diagnostics/' . basename($objectKey),
        'text/plain',
        ['category' => 'diagnostic']
    );
    $storedReference = $stored['reference'];
    echo "PASS: PutObject\n";

    $metadata = gradtrack_storage_head($storedReference);
    if (empty($metadata['exists']) || (int) ($metadata['size'] ?? 0) <= 0) {
        throw new RuntimeException('Uploaded diagnostic object could not be verified.');
    }
    echo "PASS: HeadObject and checksum metadata\n";

    $downloaded = gradtrack_storage_s3_client()->getObject([
        'Bucket' => $config['bucket'],
        'Key' => $storedReference,
    ]);
    if ((string) ($downloaded['Body'] ?? '') !== $payload) {
        throw new RuntimeException('Downloaded diagnostic object did not match the uploaded content.');
    }
    echo "PASS: GetObject content verification\n";

    gradtrack_storage_presigned_url($storedReference, 'gradtrack-diagnostic.txt', 'text/plain', true, 60);
    echo "PASS: Presigned GetObject URL generation (URL not displayed)\n";

    if (!gradtrack_storage_delete($storedReference)) {
        throw new RuntimeException('Diagnostic object deletion was not confirmed.');
    }
    echo "PASS: DeleteObject\n";

    $deletedMetadata = gradtrack_storage_head($storedReference);
    if (!empty($deletedMetadata['exists'])) {
        throw new RuntimeException('The diagnostic object still exists after DeleteObject.');
    }
    $storedReference = null;
    echo "PASS: deletion confirmed with HeadObject\n";
    echo "SUCCESS: Development S3 permissions are working.\n";
} catch (Throwable $error) {
    gradtrack_storage_log('ERROR', 'Development write/read/delete diagnostic failed', gradtrack_storage_exception_context($error));
    $details = gradtrack_storage_exception_context($error);
    fwrite(STDERR, 'FAIL: ' . gradtrack_storage_sanitize_log_value(
        $details['root_message'] ?? $details['message'] ?? $error->getMessage()
    ) . "\n");
    if (!empty($details['aws_error_code']) && $details['aws_error_code'] !== 'none') {
        fwrite(STDERR, 'AWS error code: ' . gradtrack_storage_sanitize_log_value($details['aws_error_code']) . "\n");
    }
    if (!empty($details['http_status']) && $details['http_status'] !== 'none') {
        fwrite(STDERR, 'HTTP status: ' . gradtrack_storage_sanitize_log_value($details['http_status']) . "\n");
    }
    exit(4);
} finally {
    if ($storedReference !== null) gradtrack_storage_delete_quietly($storedReference);
    if (is_file($temporaryFile)) @unlink($temporaryFile);
}
