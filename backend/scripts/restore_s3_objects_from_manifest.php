<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/storage.php';

function gradtrack_restore_argument(string $name): ?string
{
    foreach ($GLOBALS['argv'] ?? [] as $argument) {
        $prefix = '--' . $name . '=';
        if (strpos($argument, $prefix) === 0) {
            return substr($argument, strlen($prefix));
        }
    }
    return null;
}

function gradtrack_restore_has_flag(string $name): bool
{
    return in_array('--' . $name, $GLOBALS['argv'] ?? [], true);
}

$manifestPath = gradtrack_restore_argument('manifest');
if ($manifestPath === null || !is_file($manifestPath) || !is_readable($manifestPath)) {
    fwrite(STDERR, "Provide a readable migration manifest with --manifest=/absolute/path.json.\n");
    exit(1);
}

$apply = gradtrack_restore_has_flag('apply');
if ($apply && gradtrack_is_production() && !gradtrack_restore_has_flag('production-approved')) {
    fwrite(STDERR, "Production restore requires --production-approved after reviewing the dry run.\n");
    exit(1);
}
if (!gradtrack_storage_uses_s3()) {
    fwrite(STDERR, "S3 restore requires STORAGE_DRIVER=s3.\n");
    exit(1);
}

$manifest = json_decode((string) file_get_contents($manifestPath), true);
if (!is_array($manifest) || !is_array($manifest['entries'] ?? null)) {
    fwrite(STDERR, "The migration manifest is invalid.\n");
    exit(1);
}

$allowedTargets = array_fill_keys([
    'admin_profile_images.file_path.id',
    'graduate_profile_images.file_path.id',
    'graduate_cover_images.file_path.id',
    'forum_post_media.file_path.id',
    'forum_posts.image_path.id',
    'announcements.cover_image_path.id',
    'announcement_images.file_path.id',
    'alumni_supporting_documents.file_path.id',
    'mentors.proof_file_path.id',
    'job_posts.requirements_file_path.id',
    'website_content.image_path.id',
    'system_settings.setting_value.id',
    'forum_chat_message_attachments.storage_path.id',
], true);

$db = (new Database())->getConnection();
$counts = ['verified-existing' => 0, 'would-upload' => 0, 'uploaded' => 0];
$processedReferences = [];

foreach ($manifest['entries'] as $entry) {
    if (($entry['status'] ?? '') !== 'updated') {
        continue;
    }

    $table = (string) ($entry['table'] ?? '');
    $column = (string) ($entry['path_column'] ?? '');
    $primaryKey = (string) ($entry['primary_key'] ?? '');
    $signature = $table . '.' . $column . '.' . $primaryKey;
    if (!isset($allowedTargets[$signature])) {
        throw new RuntimeException('Manifest contains an unsupported database target.');
    }

    $oldReference = (string) ($entry['old_reference'] ?? '');
    $newReference = (string) ($entry['new_reference'] ?? '');
    $expectedChecksum = strtolower((string) ($entry['sha256'] ?? ''));
    if (!gradtrack_storage_is_legacy_path($oldReference)
        || !gradtrack_storage_is_s3_key($newReference)
        || preg_match('/^[a-f0-9]{64}$/', $expectedChecksum) !== 1) {
        throw new RuntimeException('Manifest contains an invalid storage reference or checksum.');
    }

    $statement = $db->prepare("SELECT `{$column}` FROM `{$table}` WHERE `{$primaryKey}` = :record_id LIMIT 1");
    $statement->execute([':record_id' => $entry['record_id'] ?? null]);
    if ((string) ($statement->fetchColumn() ?: '') !== $newReference) {
        throw new RuntimeException('Database reference no longer matches the manifest.');
    }

    $localPath = gradtrack_storage_local_absolute_path($oldReference, true);
    $localChecksum = strtolower((string) hash_file('sha256', $localPath));
    if (!hash_equals($expectedChecksum, $localChecksum)) {
        throw new RuntimeException('Retained local file checksum does not match the manifest.');
    }

    if (isset($processedReferences[$newReference])) {
        continue;
    }
    $processedReferences[$newReference] = true;

    $existing = gradtrack_storage_head($newReference);
    if (!empty($existing['exists'])) {
        if (!hash_equals($expectedChecksum, strtolower((string) ($existing['metadata']['gradtrack-sha256'] ?? '')))) {
            throw new RuntimeException('Refusing to overwrite an existing object with different checksum metadata.');
        }
        $counts['verified-existing']++;
        continue;
    }

    if (!$apply) {
        $counts['would-upload']++;
        continue;
    }

    $contentType = mime_content_type($localPath) ?: 'application/octet-stream';
    gradtrack_storage_put_file($localPath, $newReference, $oldReference, $contentType, [
        'category' => 'manifest-restore',
        'legacy-sha256' => $expectedChecksum,
    ]);

    $uploaded = gradtrack_storage_head($newReference);
    if (empty($uploaded['exists'])
        || !hash_equals($expectedChecksum, strtolower((string) ($uploaded['metadata']['gradtrack-sha256'] ?? '')))) {
        throw new RuntimeException('Uploaded object metadata verification failed.');
    }
    $downloaded = gradtrack_storage_s3_client()->getObject([
        'Bucket' => gradtrack_storage_config()['bucket'],
        'Key' => $newReference,
    ]);
    if (!hash_equals($expectedChecksum, hash('sha256', (string) $downloaded['Body']))) {
        throw new RuntimeException('Downloaded object checksum verification failed.');
    }
    $counts['uploaded']++;
}

echo ($apply ? 'Restore' : 'Dry run') . " complete. Database rows and local files were unchanged.\n";
echo 'Source manifest bucket: ' . (string) ($manifest['bucket'] ?? 'unknown') . "\n";
echo 'Target bucket: ' . gradtrack_storage_config()['bucket'] . "\n";
foreach ($counts as $status => $count) {
    echo "{$status}: {$count}\n";
}
