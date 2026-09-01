<?php

require_once __DIR__ . '/env.php';

/**
 * Central file-storage adapter for GradTrack.
 *
 * Database records keep either a legacy uploads/... path or an S3 object key.
 * The active driver is selected by STORAGE_DRIVER/APP_STORAGE_DRIVER.
 */

if (!function_exists('gradtrack_storage_sanitize_log_value')) {
    function gradtrack_storage_sanitize_log_value($value): string
    {
        if (is_bool($value)) {
            return $value ? 'yes' : 'no';
        }
        if ($value === null) {
            return 'none';
        }

        $sanitized = (string) $value;
        foreach (['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'] as $credentialName) {
            $credential = (string) gradtrack_env($credentialName, '');
            if ($credential !== '') {
                $sanitized = str_replace($credential, '[redacted]', $sanitized);
            }
        }
        $sanitized = preg_replace(
            '/(X-Amz-(?:Credential|Signature|Security-Token)=)[^&\s]+/i',
            '$1[redacted]',
            $sanitized
        ) ?: '';
        $sanitized = str_replace(["\r", "\n"], ' ', $sanitized);

        return substr($sanitized, 0, 1200);
    }
}

if (!function_exists('gradtrack_storage_log')) {
    function gradtrack_storage_log(string $level, string $event, array $context = []): void
    {
        $parts = [];
        foreach ($context as $name => $value) {
            $safeName = preg_replace('/[^a-zA-Z0-9_.-]/', '_', (string) $name) ?: 'context';
            $parts[] = $safeName . '=' . gradtrack_storage_sanitize_log_value($value);
        }

        $suffix = count($parts) > 0 ? ' | ' . implode(' | ', $parts) : '';
        error_log('[S3' . ($level !== '' ? ' ' . strtoupper($level) : '') . '] '
            . gradtrack_storage_sanitize_log_value($event) . $suffix);
    }
}

if (!function_exists('gradtrack_storage_exception_context')) {
    function gradtrack_storage_exception_context(Throwable $error): array
    {
        $context = [
            'exception' => get_class($error),
            'message' => $error->getMessage(),
        ];
        $rootError = $error;
        while ($rootError->getPrevious() instanceof Throwable) {
            $rootError = $rootError->getPrevious();
        }
        if ($rootError !== $error) {
            $context['root_exception'] = get_class($rootError);
            $context['root_message'] = $rootError->getMessage();
        }
        if (method_exists($rootError, 'getAwsErrorCode')) {
            $context['aws_error_code'] = $rootError->getAwsErrorCode() ?: 'none';
        }
        if (method_exists($rootError, 'getStatusCode')) {
            $context['http_status'] = $rootError->getStatusCode() ?: 'none';
        }
        if (method_exists($rootError, 'getAwsRequestId')) {
            $context['aws_request_id'] = $rootError->getAwsRequestId() ?: 'none';
        }
        return $context;
    }
}

if (!function_exists('gradtrack_storage_config')) {
    function gradtrack_storage_config(): array
    {
        static $config = null;
        if (is_array($config)) {
            return $config;
        }

        gradtrack_load_env_file();

        $driver = strtolower(trim((string) gradtrack_env(
            'STORAGE_DRIVER',
            gradtrack_env('APP_STORAGE_DRIVER', 'local')
        )));
        if (!in_array($driver, ['local', 's3'], true)) {
            throw new RuntimeException('STORAGE_DRIVER must be either local or s3.');
        }

        $ttl = (int) gradtrack_env('S3_PRESIGNED_URL_TTL_SECONDS', 600);
        $ttl = max(60, min($ttl, 3600));

        $config = [
            'driver' => $driver,
            'environment' => strtolower(trim((string) gradtrack_env('APP_ENV', 'development'))),
            'region' => trim((string) gradtrack_env(
                'AWS_REGION',
                gradtrack_env('AWS_DEFAULT_REGION', 'ap-southeast-1')
            )),
            'bucket' => trim((string) gradtrack_env(
                'S3_BUCKET',
                gradtrack_env('AWS_S3_BUCKET', gradtrack_env('AWS_BUCKET', ''))
            )),
            'presigned_ttl' => $ttl,
            'kms_key_id' => trim((string) gradtrack_env('S3_KMS_KEY_ID', '')),
            'endpoint' => trim((string) gradtrack_env('S3_ENDPOINT', '')),
            'path_style' => filter_var(
                gradtrack_env('S3_USE_PATH_STYLE_ENDPOINT', false),
                FILTER_VALIDATE_BOOLEAN
            ),
            'profile' => trim((string) gradtrack_env('AWS_PROFILE', '')),
        ];

        if ($driver === 's3') {
            if (PHP_VERSION_ID < 80100) {
                gradtrack_storage_log('ERROR', 'Runtime compatibility check failed', [
                    'php_runtime' => PHP_VERSION,
                    'required_php' => '>=8.1',
                    'sapi' => PHP_SAPI,
                ]);
                throw new RuntimeException('S3 storage requires PHP 8.1 or newer for the installed AWS SDK.');
            }
            if ($config['region'] === '') {
                throw new RuntimeException('AWS_REGION is required when STORAGE_DRIVER=s3.');
            }
            if ($config['bucket'] === '') {
                throw new RuntimeException('S3_BUCKET is required when STORAGE_DRIVER=s3.');
            }
            if ($config['profile'] !== ''
                && preg_match('/^(?:your[_-]|change[_-]?me|example)/i', $config['profile']) === 1) {
                throw new RuntimeException('AWS_PROFILE still contains an example placeholder. Configure a real profile or leave it empty.');
            }
            $hasAccessKey = trim((string) gradtrack_env('AWS_ACCESS_KEY_ID', '')) !== '';
            $hasSecretKey = trim((string) gradtrack_env('AWS_SECRET_ACCESS_KEY', '')) !== '';
            if ($hasAccessKey !== $hasSecretKey) {
                throw new RuntimeException('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be configured together.');
            }
            $isProduction = in_array($config['environment'], ['prod', 'production'], true);
            if ($isProduction && $config['bucket'] !== 'nc-gradtrack-prod') {
                throw new RuntimeException('Production must use the nc-gradtrack-prod S3 bucket.');
            }
            if (!$isProduction && $config['bucket'] !== 'nc-gradtrack-dev-113420226807-ap-southeast-1-an') {
                throw new RuntimeException('Non-production must use the approved GradTrack development S3 bucket.');
            }

            gradtrack_storage_log('INFO', 'Configuration loaded', [
                'php_runtime' => PHP_VERSION,
                'sapi' => PHP_SAPI,
                'region' => $config['region'],
                'bucket_configured' => $config['bucket'] !== '',
                'credential_source' => $hasAccessKey ? 'environment' : ($config['profile'] !== '' ? 'profile' : 'default-chain'),
            ]);
        }

        return $config;
    }
}

if (!function_exists('gradtrack_storage_driver')) {
    function gradtrack_storage_driver(): string
    {
        return (string) gradtrack_storage_config()['driver'];
    }
}

if (!function_exists('gradtrack_storage_uses_s3')) {
    function gradtrack_storage_uses_s3(): bool
    {
        return gradtrack_storage_driver() === 's3';
    }
}

if (!function_exists('gradtrack_storage_backend_root')) {
    function gradtrack_storage_backend_root(): string
    {
        $root = realpath(__DIR__ . '/../../');
        if ($root === false) {
            throw new RuntimeException('Unable to resolve the GradTrack backend directory.');
        }
        return $root;
    }
}

if (!function_exists('gradtrack_storage_s3_client')) {
    function gradtrack_storage_s3_client(): \Aws\S3\S3Client
    {
        static $client = null;
        if ($client instanceof \Aws\S3\S3Client) {
            return $client;
        }

        $autoload = gradtrack_storage_backend_root() . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';
        if (!is_file($autoload)) {
            throw new RuntimeException('The AWS SDK for PHP is not installed. Run Composer install in backend/.');
        }
        require_once $autoload;

        if (!class_exists(\Aws\S3\S3Client::class)) {
            throw new RuntimeException('The installed Composer dependencies do not provide the AWS S3 client.');
        }

        $config = gradtrack_storage_config();
        $clientConfig = [
            'version' => 'latest',
            'region' => $config['region'],
        ];

        if ($config['endpoint'] !== '') {
            $clientConfig['endpoint'] = $config['endpoint'];
            $clientConfig['use_path_style_endpoint'] = (bool) $config['path_style'];
        }

        try {
            $client = new \Aws\S3\S3Client($clientConfig);
        } catch (Throwable $error) {
            gradtrack_storage_log('ERROR', 'S3 client initialization failed', gradtrack_storage_exception_context($error));
            throw $error;
        }

        $sdkVersion = class_exists(\Composer\InstalledVersions::class)
            ? (\Composer\InstalledVersions::getPrettyVersion('aws/aws-sdk-php') ?: 'unknown')
            : 'unknown';
        gradtrack_storage_log('INFO', 'S3 client initialized', [
            'sdk_version' => $sdkVersion,
            'php_runtime' => PHP_VERSION,
            'region' => $config['region'],
        ]);
        return $client;
    }
}

if (!function_exists('gradtrack_storage_normalize_key')) {
    function gradtrack_storage_normalize_key(string $key): string
    {
        $key = ltrim(str_replace('\\', '/', trim($key)), '/');
        if ($key === '' || strpos($key, "\0") !== false) {
            throw new InvalidArgumentException('A non-empty storage object key is required.');
        }

        $segments = explode('/', $key);
        foreach ($segments as $segment) {
            if ($segment === '' || $segment === '.' || $segment === '..') {
                throw new InvalidArgumentException('The storage object key contains an invalid path segment.');
            }
        }

        return $key;
    }
}

if (!function_exists('gradtrack_storage_is_legacy_path')) {
    function gradtrack_storage_is_legacy_path(?string $reference): bool
    {
        $reference = ltrim(str_replace('\\', '/', trim((string) $reference)), '/');
        return $reference !== '' && strpos($reference, 'uploads/') === 0;
    }
}

if (!function_exists('gradtrack_storage_is_static_path')) {
    function gradtrack_storage_is_static_path(?string $reference): bool
    {
        $reference = trim((string) $reference);
        return $reference !== '' && $reference[0] === '/' && !gradtrack_storage_is_legacy_path($reference);
    }
}

if (!function_exists('gradtrack_storage_is_absolute_url')) {
    function gradtrack_storage_is_absolute_url(?string $reference): bool
    {
        return preg_match('/^https?:\/\//i', trim((string) $reference)) === 1;
    }
}

if (!function_exists('gradtrack_storage_is_s3_key')) {
    function gradtrack_storage_is_s3_key(?string $reference): bool
    {
        $reference = trim((string) $reference);
        return $reference !== ''
            && !gradtrack_storage_is_legacy_path($reference)
            && !gradtrack_storage_is_static_path($reference)
            && !gradtrack_storage_is_absolute_url($reference);
    }
}

if (!function_exists('gradtrack_storage_uuid')) {
    function gradtrack_storage_uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);

        return substr($hex, 0, 8) . '-'
            . substr($hex, 8, 4) . '-'
            . substr($hex, 12, 4) . '-'
            . substr($hex, 16, 4) . '-'
            . substr($hex, 20, 12);
    }
}

if (!function_exists('gradtrack_storage_uuid_filename')) {
    function gradtrack_storage_uuid_filename(string $extension): string
    {
        $extension = strtolower(trim($extension));
        $extension = preg_replace('/[^a-z0-9]/', '', $extension) ?: '';
        return gradtrack_storage_uuid() . ($extension !== '' ? '.' . $extension : '');
    }
}

if (!function_exists('gradtrack_storage_safe_download_name')) {
    function gradtrack_storage_safe_download_name(?string $filename, string $fallback = 'download'): string
    {
        $filename = trim((string) $filename);
        $filename = str_replace(["\r", "\n", "\0", '/', '\\'], '_', $filename);
        $filename = preg_replace('/[\x00-\x1F\x7F]/u', '_', $filename) ?: '';
        $filename = trim($filename, " .\t");
        if ($filename === '') {
            $filename = $fallback;
        }
        return substr($filename, 0, 180);
    }
}

if (!function_exists('gradtrack_storage_filename_has_dangerous_segment')) {
    function gradtrack_storage_filename_has_dangerous_segment(?string $filename): bool
    {
        $safeName = strtolower(gradtrack_storage_safe_download_name($filename, 'upload'));
        $segments = array_filter(explode('.', $safeName), static function (string $segment): bool {
            return $segment !== '';
        });
        $dangerous = [
            'php', 'php3', 'php4', 'php5', 'php7', 'php8', 'phtml', 'phar',
            'exe', 'com', 'scr', 'msi', 'bat', 'cmd', 'ps1', 'sh', 'bash',
            'js', 'mjs', 'cjs', 'vbs', 'jar', 'html', 'htm', 'svg', 'xhtml',
        ];
        return count(array_intersect($segments, $dangerous)) > 0;
    }
}

if (!function_exists('gradtrack_storage_local_absolute_path')) {
    function gradtrack_storage_local_absolute_path(string $relativePath, bool $mustExist = false): string
    {
        if (!gradtrack_storage_is_legacy_path($relativePath)) {
            throw new InvalidArgumentException('Only legacy uploads paths may be resolved on local storage.');
        }

        $normalized = ltrim(str_replace('\\', '/', $relativePath), '/');
        if (strpos($normalized, '../') !== false || strpos($normalized, '..\\') !== false) {
            throw new InvalidArgumentException('Invalid local storage path.');
        }

        $root = gradtrack_storage_backend_root();
        $path = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $normalized);
        if ($mustExist) {
            $real = realpath($path);
            $uploadsRoot = realpath($root . DIRECTORY_SEPARATOR . 'uploads');
            if ($real === false || $uploadsRoot === false || strpos($real, rtrim($uploadsRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR) !== 0) {
                throw new RuntimeException('The local storage object is unavailable.');
            }
            return $real;
        }

        return $path;
    }
}

if (!function_exists('gradtrack_storage_put_file')) {
    function gradtrack_storage_put_file(
        string $sourcePath,
        string $s3Key,
        string $legacyRelativePath,
        string $contentType,
        array $metadata = []
    ): array {
        if (!is_file($sourcePath) || !is_readable($sourcePath)) {
            throw new InvalidArgumentException('The source upload file is unavailable.');
        }

        $size = filesize($sourcePath);
        if ($size === false || $size <= 0) {
            throw new InvalidArgumentException('The source upload file is empty.');
        }
        $checksum = hash_file('sha256', $sourcePath);
        if ($checksum === false) {
            throw new RuntimeException('Unable to calculate the upload checksum.');
        }

        if (gradtrack_storage_uses_s3()) {
            $key = gradtrack_storage_normalize_key($s3Key);
            $config = gradtrack_storage_config();
            $cleanMetadata = [
                'gradtrack-sha256' => $checksum,
                'gradtrack-storage-version' => '1',
            ];
            foreach ($metadata as $name => $value) {
                $safeName = strtolower(preg_replace('/[^a-zA-Z0-9-]/', '-', (string) $name) ?: 'metadata');
                $safeValue = preg_replace('/[^\x20-\x7E]/', '_', (string) $value) ?: '';
                $cleanMetadata[$safeName] = substr($safeValue, 0, 500);
            }

            $request = [
                'Bucket' => $config['bucket'],
                'Key' => $key,
                'SourceFile' => $sourcePath,
                'ContentType' => $contentType,
                'Metadata' => $cleanMetadata,
                'ChecksumSHA256' => base64_encode(hex2bin($checksum)),
            ];
            if ($config['kms_key_id'] !== '') {
                $request['ServerSideEncryption'] = 'aws:kms';
                $request['SSEKMSKeyId'] = $config['kms_key_id'];
                $request['BucketKeyEnabled'] = true;
            }

            try {
                gradtrack_storage_log('INFO', 'PutObject starting', [
                    'feature' => $metadata['category'] ?? 'unspecified',
                    'region' => $config['region'],
                    'bucket_configured' => $config['bucket'] !== '',
                    'object_key' => $key,
                    'content_type' => $contentType,
                    'bytes' => (int) $size,
                ]);
                $result = gradtrack_storage_s3_client()->putObject($request);
                gradtrack_storage_log('INFO', 'PutObject successful', [
                    'feature' => $metadata['category'] ?? 'unspecified',
                    'object_key' => $key,
                    'http_status' => $result['@metadata']['statusCode'] ?? 'unknown',
                ]);
            } catch (Throwable $error) {
                gradtrack_storage_log('ERROR', 'PutObject failed', array_merge([
                    'feature' => $metadata['category'] ?? 'unspecified',
                    'object_key' => $key,
                    'region' => $config['region'],
                ], gradtrack_storage_exception_context($error)));
                throw new RuntimeException('Unable to store the uploaded file in object storage.', 0, $error);
            }

            return [
                'reference' => $key,
                'driver' => 's3',
                'size' => (int) $size,
                'sha256' => $checksum,
            ];
        }

        $relativePath = ltrim(str_replace('\\', '/', $legacyRelativePath), '/');
        $destination = gradtrack_storage_local_absolute_path($relativePath);
        $directory = dirname($destination);
        if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
            throw new RuntimeException('Unable to create the local upload directory.');
        }

        $stored = is_uploaded_file($sourcePath)
            ? move_uploaded_file($sourcePath, $destination)
            : copy($sourcePath, $destination);
        if (!$stored) {
            throw new RuntimeException('Unable to store the uploaded file.');
        }

        return [
            'reference' => $relativePath,
            'driver' => 'local',
            'size' => (int) $size,
            'sha256' => $checksum,
        ];
    }
}

if (!function_exists('gradtrack_storage_delete')) {
    function gradtrack_storage_delete(?string $reference): bool
    {
        $reference = trim((string) $reference);
        if ($reference === '' || gradtrack_storage_is_static_path($reference) || gradtrack_storage_is_absolute_url($reference)) {
            return false;
        }

        if (gradtrack_storage_is_legacy_path($reference)) {
            try {
                $path = gradtrack_storage_local_absolute_path($reference, true);
            } catch (Throwable $error) {
                return false;
            }
            return is_file($path) ? @unlink($path) : false;
        }

        if (!gradtrack_storage_uses_s3()) {
            error_log('GradTrack skipped deleting an S3 object while STORAGE_DRIVER is not s3.');
            return false;
        }

        $config = gradtrack_storage_config();
        $key = gradtrack_storage_normalize_key($reference);
        try {
            gradtrack_storage_s3_client()->deleteObject([
                'Bucket' => $config['bucket'],
                'Key' => $key,
            ]);
            gradtrack_storage_log('INFO', 'DeleteObject successful', ['object_key' => $key]);
        } catch (Throwable $error) {
            gradtrack_storage_log('ERROR', 'DeleteObject failed', array_merge(
                ['object_key' => $key],
                gradtrack_storage_exception_context($error)
            ));
            throw $error;
        }
        return true;
    }
}

if (!function_exists('gradtrack_storage_copy')) {
    function gradtrack_storage_copy(string $sourceReference, string $destinationKey): string
    {
        $destinationKey = gradtrack_storage_normalize_key($destinationKey);
        if (!gradtrack_storage_uses_s3() || !gradtrack_storage_is_s3_key($sourceReference)) {
            return $sourceReference;
        }

        $config = gradtrack_storage_config();
        $sourceKey = gradtrack_storage_normalize_key($sourceReference);
        try {
            gradtrack_storage_s3_client()->copyObject([
                'Bucket' => $config['bucket'],
                'Key' => $destinationKey,
                'CopySource' => rawurlencode($config['bucket'] . '/' . $sourceKey),
                'MetadataDirective' => 'COPY',
            ]);
            gradtrack_storage_log('INFO', 'CopyObject successful', [
                'source_key' => $sourceKey,
                'destination_key' => $destinationKey,
            ]);
        } catch (Throwable $error) {
            gradtrack_storage_log('ERROR', 'CopyObject failed', array_merge([
                'source_key' => $sourceKey,
                'destination_key' => $destinationKey,
            ], gradtrack_storage_exception_context($error)));
            throw $error;
        }

        return $destinationKey;
    }
}

if (!function_exists('gradtrack_storage_exists')) {
    function gradtrack_storage_exists(string $reference): bool
    {
        try {
            return (bool) (gradtrack_storage_head($reference)['exists'] ?? false);
        } catch (Throwable $error) {
            gradtrack_storage_log('ERROR', 'Object existence check failed', gradtrack_storage_exception_context($error));
            return false;
        }
    }
}

if (!function_exists('gradtrack_storage_delete_quietly')) {
    function gradtrack_storage_delete_quietly(?string $reference): bool
    {
        try {
            return gradtrack_storage_delete($reference);
        } catch (Throwable $error) {
            gradtrack_storage_log('ERROR', 'Storage cleanup failed', gradtrack_storage_exception_context($error));
            return false;
        }
    }
}

if (!function_exists('gradtrack_storage_head')) {
    function gradtrack_storage_head(string $reference): array
    {
        if (gradtrack_storage_is_legacy_path($reference)) {
            $path = gradtrack_storage_local_absolute_path($reference, true);
            return [
                'exists' => true,
                'driver' => 'local',
                'size' => (int) filesize($path),
                'content_type' => mime_content_type($path) ?: 'application/octet-stream',
            ];
        }
        if (!gradtrack_storage_uses_s3()) {
            return ['exists' => false, 'driver' => 's3'];
        }

        try {
            $config = gradtrack_storage_config();
            $result = gradtrack_storage_s3_client()->headObject([
                'Bucket' => $config['bucket'],
                'Key' => gradtrack_storage_normalize_key($reference),
            ]);
            return [
                'exists' => true,
                'driver' => 's3',
                'size' => (int) ($result['ContentLength'] ?? 0),
                'content_type' => (string) ($result['ContentType'] ?? 'application/octet-stream'),
                'metadata' => (array) ($result['Metadata'] ?? []),
            ];
        } catch (\Aws\S3\Exception\S3Exception $error) {
            if ((int) $error->getStatusCode() === 404) {
                return ['exists' => false, 'driver' => 's3'];
            }
            throw $error;
        }
    }
}

if (!function_exists('gradtrack_storage_presigned_url')) {
    function gradtrack_storage_presigned_url(
        string $reference,
        ?string $originalFilename = null,
        ?string $contentType = null,
        bool $download = false,
        ?int $ttlSeconds = null
    ): string {
        if (gradtrack_storage_is_legacy_path($reference)
            || gradtrack_storage_is_static_path($reference)
            || gradtrack_storage_is_absolute_url($reference)) {
            return $reference;
        }
        if (!gradtrack_storage_uses_s3()) {
            return $reference;
        }

        $config = gradtrack_storage_config();
        $filename = gradtrack_storage_safe_download_name($originalFilename, basename($reference));
        $disposition = $download ? 'attachment' : 'inline';
        $parameters = [
            'Bucket' => $config['bucket'],
            'Key' => gradtrack_storage_normalize_key($reference),
            'ResponseContentDisposition' => $disposition . '; filename="' . addcslashes($filename, '"\\') . '"',
        ];
        if ($contentType !== null && trim($contentType) !== '') {
            $parameters['ResponseContentType'] = trim($contentType);
        }

        $command = gradtrack_storage_s3_client()->getCommand('GetObject', $parameters);
        $ttl = $ttlSeconds ?? (int) $config['presigned_ttl'];
        $ttl = max(60, min($ttl, 3600));
        $request = gradtrack_storage_s3_client()->createPresignedRequest($command, '+' . $ttl . ' seconds');
        return (string) $request->getUri();
    }
}

if (!function_exists('gradtrack_storage_access_reference')) {
    function gradtrack_storage_access_reference(
        ?string $reference,
        ?string $originalFilename = null,
        ?string $contentType = null,
        bool $download = false
    ): ?string {
        $reference = trim((string) $reference);
        if ($reference === '') {
            return null;
        }

        try {
            return gradtrack_storage_presigned_url($reference, $originalFilename, $contentType, $download);
        } catch (Throwable $error) {
            gradtrack_storage_log('ERROR', 'Presigned GetObject URL generation failed', array_merge(
                ['object_key' => $reference],
                gradtrack_storage_exception_context($error)
            ));
            return null;
        }
    }
}

if (!function_exists('gradtrack_storage_media_access_reference')) {
    /**
     * Return a browser-safe media reference that does not expire while it sits
     * in long-lived frontend state. Local/static references remain unchanged;
     * private S3 keys are resolved by the authenticated media endpoint, which
     * creates a fresh short-lived presigned redirect for every browser request.
     */
    function gradtrack_storage_media_access_reference(?string $reference): ?string
    {
        $reference = trim((string) $reference);
        if ($reference === '') {
            return null;
        }

        // API formatters can be composed (for example, forum rows plus media
        // attachment formatting). Keep this resolver idempotent so an already
        // authenticated media route is never encoded as though it were an S3
        // object key a second time.
        if (strpos(ltrim($reference, '/'), 'api/media.php?path=') === 0) {
            return $reference;
        }

        if (!gradtrack_storage_is_s3_key($reference) || !gradtrack_storage_uses_s3()) {
            return $reference;
        }

        return 'api/media.php?path=' . rawurlencode(gradtrack_storage_normalize_key($reference));
    }
}
