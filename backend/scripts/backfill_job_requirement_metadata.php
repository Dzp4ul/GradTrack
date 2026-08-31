<?php

declare(strict_types=1);

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/storage.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

function gradtrack_job_backfill_has_flag(string $name): bool
{
    return in_array('--' . $name, $GLOBALS['argv'] ?? [], true);
}

function gradtrack_job_backfill_argument(string $name): ?string
{
    foreach ($GLOBALS['argv'] ?? [] as $argument) {
        if (strpos($argument, '--' . $name . '=') === 0) {
            return substr($argument, strlen($name) + 3);
        }
    }
    return null;
}

function gradtrack_job_backfill_columns_exist(PDO $db): bool
{
    $required = [
        'requirements_file_path',
        'requirements_file_name',
        'requirements_mime_type',
        'requirements_file_size_bytes',
        'requirements_uploaded_at',
    ];
    $stmt = $db->prepare("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                          WHERE TABLE_SCHEMA = DATABASE()
                            AND TABLE_NAME = 'job_posts'
                            AND COLUMN_NAME = :column_name");
    foreach ($required as $column) {
        $stmt->execute([':column_name' => $column]);
        if ((int) $stmt->fetchColumn() === 0) {
            return false;
        }
    }
    return true;
}

function gradtrack_job_backfill_environment(): string
{
    gradtrack_load_env_file();
    return strtolower(trim((string) gradtrack_env('APP_ENV', 'development')));
}

function gradtrack_job_backfill_safe_metadata(int $jobId, string $metadataPath): array
{
    $decoded = json_decode((string) file_get_contents($metadataPath), true);
    if (!is_array($decoded)) {
        throw new RuntimeException('The metadata JSON is invalid.');
    }

    $reference = ltrim(str_replace('\\', '/', trim((string) ($decoded['relative_path'] ?? ''))), '/');
    if (!preg_match('#^uploads/job-requirements/' . $jobId . '/[a-zA-Z0-9._-]+$#', $reference)) {
        throw new RuntimeException('The metadata contains an invalid local path.');
    }

    $absolute = gradtrack_storage_local_absolute_path($reference, true);
    $size = filesize($absolute);
    $checksum = hash_file('sha256', $absolute);
    if ($size === false || $size <= 0 || $checksum === false) {
        throw new RuntimeException('The referenced local file is empty or unreadable.');
    }

    $mime = mime_content_type($absolute) ?: 'application/octet-stream';
    $allowedMimes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
    ];
    if (!in_array($mime, $allowedMimes, true)) {
        throw new RuntimeException('The legacy file type is not approved for automatic backfill.');
    }

    $uploadedAt = filemtime($absolute);
    return [
        'reference' => $reference,
        'original_name' => gradtrack_storage_safe_download_name(
            (string) ($decoded['file_name'] ?? basename($reference)),
            basename($reference)
        ),
        'mime_type' => $mime,
        'file_size_bytes' => (int) $size,
        'uploaded_at' => gmdate('Y-m-d H:i:s', $uploadedAt === false ? time() : $uploadedAt),
        'sha256' => $checksum,
    ];
}

$apply = gradtrack_job_backfill_has_flag('apply');
$rollbackPath = gradtrack_job_backfill_argument('rollback');
$environment = gradtrack_job_backfill_environment();
$isProduction = in_array($environment, ['prod', 'production'], true);

if (($apply || $rollbackPath !== null) && $isProduction && !gradtrack_job_backfill_has_flag('production-approved')) {
    fwrite(STDERR, "Production database changes are blocked without --production-approved.\n");
    exit(1);
}
if ($apply && !$isProduction && !gradtrack_job_backfill_has_flag('confirmed-synthetic-data-only')) {
    fwrite(STDERR, "Development apply is blocked unless the records contain synthetic data only. Use --confirmed-synthetic-data-only after verification.\n");
    exit(1);
}

$db = (new Database())->getConnection();
if (!gradtrack_job_backfill_columns_exist($db)) {
    fwrite(STDERR, "Required columns are missing. Review and run database/add_s3_storage_metadata.sql first.\n");
    exit(1);
}

if ($rollbackPath !== null) {
    $manifest = json_decode((string) file_get_contents($rollbackPath), true);
    if (!is_array($manifest) || !is_array($manifest['entries'] ?? null)) {
        throw new RuntimeException('Invalid backfill manifest.');
    }

    $rolledBack = 0;
    $stmt = $db->prepare('UPDATE job_posts
                          SET requirements_file_path = :old_path,
                              requirements_file_name = :old_name,
                              requirements_mime_type = :old_mime,
                              requirements_file_size_bytes = :old_size,
                              requirements_uploaded_at = :old_uploaded_at
                          WHERE id = :job_id AND requirements_file_path = :new_path');
    foreach (array_reverse($manifest['entries']) as $entry) {
        if (($entry['status'] ?? '') !== 'updated') {
            continue;
        }
        $old = is_array($entry['old_values'] ?? null) ? $entry['old_values'] : [];
        $stmt->execute([
            ':old_path' => $old['requirements_file_path'] ?? null,
            ':old_name' => $old['requirements_file_name'] ?? null,
            ':old_mime' => $old['requirements_mime_type'] ?? null,
            ':old_size' => $old['requirements_file_size_bytes'] ?? null,
            ':old_uploaded_at' => $old['requirements_uploaded_at'] ?? null,
            ':job_id' => (int) $entry['job_id'],
            ':new_path' => (string) $entry['new_values']['requirements_file_path'],
        ]);
        $rolledBack += $stmt->rowCount();
    }
    echo "Rolled back {$rolledBack} job requirement metadata records. No files were deleted.\n";
    exit(0);
}

$root = gradtrack_storage_backend_root() . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'job-requirements';
$entries = [];
$directories = is_dir($root) ? new DirectoryIterator($root) : [];
$select = $db->prepare('SELECT id, requirements_file_path, requirements_file_name,
                               requirements_mime_type, requirements_file_size_bytes, requirements_uploaded_at
                        FROM job_posts WHERE id = :job_id LIMIT 1');
$update = $db->prepare('UPDATE job_posts
                        SET requirements_file_path = :file_path,
                            requirements_file_name = :file_name,
                            requirements_mime_type = :mime_type,
                            requirements_file_size_bytes = :file_size,
                            requirements_uploaded_at = :uploaded_at
                        WHERE id = :job_id AND requirements_file_path IS NULL');

foreach ($directories as $directory) {
    if (!$directory->isDir() || $directory->isDot() || !ctype_digit($directory->getFilename())) {
        continue;
    }
    $jobId = (int) $directory->getFilename();
    $metadataPath = $directory->getPathname() . DIRECTORY_SEPARATOR . 'metadata.json';
    if (!is_file($metadataPath)) {
        continue;
    }

    $entry = ['job_id' => $jobId, 'metadata_path' => $metadataPath, 'status' => 'pending'];
    try {
        $select->execute([':job_id' => $jobId]);
        $row = $select->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            $entry['status'] = 'missing-job';
            $entries[] = $entry;
            continue;
        }
        if (!empty($row['requirements_file_path'])) {
            $entry['status'] = 'already-populated';
            $entries[] = $entry;
            continue;
        }

        $metadata = gradtrack_job_backfill_safe_metadata($jobId, $metadataPath);
        $entry['old_values'] = $row;
        $entry['new_values'] = [
            'requirements_file_path' => $metadata['reference'],
            'requirements_file_name' => $metadata['original_name'],
            'requirements_mime_type' => $metadata['mime_type'],
            'requirements_file_size_bytes' => $metadata['file_size_bytes'],
            'requirements_uploaded_at' => $metadata['uploaded_at'],
        ];
        $entry['sha256'] = $metadata['sha256'];

        if ($apply) {
            $update->execute([
                ':file_path' => $metadata['reference'],
                ':file_name' => $metadata['original_name'],
                ':mime_type' => $metadata['mime_type'],
                ':file_size' => $metadata['file_size_bytes'],
                ':uploaded_at' => $metadata['uploaded_at'],
                ':job_id' => $jobId,
            ]);
            if ($update->rowCount() !== 1) {
                throw new RuntimeException('The database record changed before it could be backfilled.');
            }
            $entry['status'] = 'updated';
        } else {
            $entry['status'] = 'would-update';
        }
    } catch (Throwable $error) {
        $entry['status'] = 'failed';
        $entry['error'] = 'Backfill validation failed; review the server log.';
        error_log('GradTrack job requirement metadata backfill failed for job ' . $jobId . ': ' . get_class($error));
    }
    $entries[] = $entry;
}

$manifestPath = gradtrack_job_backfill_argument('manifest')
    ?? (__DIR__ . '/../tmp/job-requirement-backfill-' . gmdate('Ymd-His') . '.json');
$manifestDirectory = dirname($manifestPath);
if (!is_dir($manifestDirectory) && !mkdir($manifestDirectory, 0755, true) && !is_dir($manifestDirectory)) {
    throw new RuntimeException('Unable to create the backfill manifest directory.');
}
$manifest = [
    'version' => 1,
    'created_at' => gmdate(DATE_ATOM),
    'environment' => $environment,
    'mode' => $apply ? 'apply' : 'dry-run',
    'entries' => $entries,
    'local_files_deleted' => false,
];
if (file_put_contents($manifestPath, json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)) === false) {
    throw new RuntimeException('Unable to write the backfill manifest.');
}

$counts = array_count_values(array_column($entries, 'status'));
echo ($apply ? 'Apply' : 'Dry run') . " complete. Manifest: {$manifestPath}\n";
foreach ($counts as $status => $count) {
    echo "{$status}: {$count}\n";
}
echo "No local files were deleted.\n";
