<?php

declare(strict_types=1);

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/storage.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

function gradtrack_migration_argument(string $name): ?string
{
    foreach ($GLOBALS['argv'] ?? [] as $argument) {
        if (strpos($argument, '--' . $name . '=') === 0) return substr($argument, strlen($name) + 3);
    }
    return null;
}

function gradtrack_migration_has_flag(string $name): bool
{
    return in_array('--' . $name, $GLOBALS['argv'] ?? [], true);
}

function gradtrack_migration_table_column_exists(PDO $db, string $table, string $column): bool
{
    $stmt = $db->prepare("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column");
    $stmt->execute([':table' => $table, ':column' => $column]);
    return (int) $stmt->fetchColumn() > 0;
}

function gradtrack_migration_specs(): array
{
    return [
        ['kind' => 'admin-profile', 'table' => 'admin_profile_images', 'pk' => 'id', 'path' => 'file_path',
            'query' => 'SELECT id AS record_id, admin_user_id AS owner_id, file_path AS legacy_path FROM admin_profile_images'],
        ['kind' => 'graduate-profile', 'table' => 'graduate_profile_images', 'pk' => 'id', 'path' => 'file_path',
            'query' => 'SELECT id AS record_id, graduate_account_id AS owner_id, file_path AS legacy_path FROM graduate_profile_images'],
        ['kind' => 'graduate-cover', 'table' => 'graduate_cover_images', 'pk' => 'id', 'path' => 'file_path',
            'query' => 'SELECT id AS record_id, graduate_account_id AS owner_id, file_path AS legacy_path FROM graduate_cover_images'],
        ['kind' => 'forum-media', 'table' => 'forum_post_media', 'pk' => 'id', 'path' => 'file_path',
            'query' => 'SELECT id AS record_id, post_id AS owner_id, media_type, file_path AS legacy_path FROM forum_post_media'],
        ['kind' => 'forum-legacy', 'table' => 'forum_posts', 'pk' => 'id', 'path' => 'image_path',
            'query' => 'SELECT id AS record_id, id AS owner_id, image_mime_type AS mime_type, image_path AS legacy_path FROM forum_posts'],
        ['kind' => 'announcement-cover', 'table' => 'announcements', 'pk' => 'id', 'path' => 'cover_image_path',
            'query' => 'SELECT id AS record_id, id AS owner_id, cover_image_path AS legacy_path FROM announcements'],
        ['kind' => 'announcement-gallery', 'table' => 'announcement_images', 'pk' => 'id', 'path' => 'file_path',
            'query' => 'SELECT id AS record_id, announcement_id AS owner_id, file_path AS legacy_path FROM announcement_images'],
        ['kind' => 'graduate-document', 'table' => 'alumni_supporting_documents', 'pk' => 'id', 'path' => 'file_path',
            'query' => 'SELECT id AS record_id, graduate_account_id AS owner_id, document_type, file_path AS legacy_path FROM alumni_supporting_documents'],
        ['kind' => 'mentor-proof', 'table' => 'mentors', 'pk' => 'id', 'path' => 'proof_file_path',
            'query' => 'SELECT id AS record_id, graduate_account_id AS owner_id, proof_file_path AS legacy_path FROM mentors'],
        ['kind' => 'job-requirement', 'table' => 'job_posts', 'pk' => 'id', 'path' => 'requirements_file_path',
            'query' => 'SELECT id AS record_id, id AS owner_id, requirements_file_path AS legacy_path FROM job_posts'],
        ['kind' => 'about-content', 'table' => 'website_content', 'pk' => 'id', 'path' => 'image_path',
            'query' => "SELECT id AS record_id, id AS owner_id, image_path AS legacy_path FROM website_content WHERE page = 'about'"],
        ['kind' => 'system-branding', 'table' => 'system_settings', 'pk' => 'id', 'path' => 'setting_value',
            'query' => "SELECT id AS record_id, setting_key AS owner_id, setting_value AS legacy_path FROM system_settings
                        WHERE setting_key IN ('system_logo_path','login_logo_path','favicon_path','login_background_image_path')"],
        ['kind' => 'chat-attachment', 'table' => 'forum_chat_message_attachments', 'pk' => 'id', 'path' => 'storage_path',
            'query' => 'SELECT id AS record_id, room_id AS owner_id, stored_name, storage_path AS legacy_path FROM forum_chat_message_attachments'],
    ];
}

function gradtrack_migration_object_key(array $spec, array $row, string $extension): string
{
    $owner = preg_replace('/[^a-zA-Z0-9_-]/', '-', (string) ($row['owner_id'] ?? 'unknown')) ?: 'unknown';
    $name = gradtrack_storage_uuid_filename($extension);
    switch ($spec['kind']) {
        case 'admin-profile': return "media/profiles/admins/{$owner}/profile/{$name}";
        case 'graduate-profile': return "media/profiles/graduates/{$owner}/profile/{$name}";
        case 'graduate-cover': return "media/profiles/graduates/{$owner}/cover/{$name}";
        case 'forum-media':
            $folder = ($row['media_type'] ?? 'image') === 'video' ? 'videos' : 'images';
            return "media/community-forum/posts/{$owner}/{$folder}/{$name}";
        case 'forum-legacy':
            $folder = strpos((string) ($row['mime_type'] ?? ''), 'video/') === 0 ? 'videos' : 'images';
            return "media/community-forum/posts/{$owner}/{$folder}/{$name}";
        case 'announcement-cover': return "media/announcements/{$owner}/cover/{$name}";
        case 'announcement-gallery': return "media/announcements/{$owner}/gallery/{$name}";
        case 'graduate-document':
            $type = preg_replace('/[^a-z0-9-]/', '-', strtolower((string) ($row['document_type'] ?? 'other'))) ?: 'other';
            return "private/graduate-documents/{$owner}/{$type}/{$name}";
        case 'mentor-proof': return "private/mentorship/proofs/{$owner}/{$name}";
        case 'job-requirement': return "private/job-support/job-posts/{$owner}/requirements/{$name}";
        case 'about-content': return "media/public-content/about/{$owner}/{$name}";
        case 'chat-attachment': return "private/chat/rooms/{$owner}/attachments/{$name}";
        case 'system-branding':
            $folders = [
                'system_logo_path' => 'system-logo', 'login_logo_path' => 'login-logo',
                'favicon_path' => 'favicon', 'login_background_image_path' => 'login-background',
            ];
            return 'system/branding/' . ($folders[$row['owner_id']] ?? 'other') . '/' . $name;
    }
    throw new RuntimeException('Unsupported migration category.');
}

function gradtrack_migration_update(PDO $db, array $entry, string $from, string $to): bool
{
    $allowed = [];
    foreach (gradtrack_migration_specs() as $spec) $allowed[$spec['table'] . '.' . $spec['path'] . '.' . $spec['pk']] = true;
    $signature = $entry['table'] . '.' . $entry['path_column'] . '.' . $entry['primary_key'];
    if (!isset($allowed[$signature])) throw new RuntimeException('Manifest contains an unsupported database target.');

    $sql = "UPDATE `{$entry['table']}` SET `{$entry['path_column']}` = :to
            WHERE `{$entry['primary_key']}` = :record_id AND `{$entry['path_column']}` = :from";
    $stmt = $db->prepare($sql);
    $stmt->execute([':to' => $to, ':record_id' => $entry['record_id'], ':from' => $from]);
    return $stmt->rowCount() === 1;
}

$apply = gradtrack_migration_has_flag('apply');
$rollbackPath = gradtrack_migration_argument('rollback');
$verifyPath = gradtrack_migration_argument('verify');
$kindFilter = gradtrack_migration_argument('kind');
$config = gradtrack_storage_config();

$selectedModes = (int) $apply + (int) ($rollbackPath !== null) + (int) ($verifyPath !== null);
if ($selectedModes > 1) {
    fwrite(STDERR, "Choose only one migration mode: --apply, --verify, or --rollback.\n");
    exit(1);
}

if ($kindFilter !== null) {
    $supportedKinds = array_column(gradtrack_migration_specs(), 'kind');
    if (!in_array($kindFilter, $supportedKinds, true)) {
        fwrite(STDERR, 'Unsupported migration kind. Allowed: ' . implode(', ', $supportedKinds) . "\n");
        exit(1);
    }
}

if (($apply || $rollbackPath !== null || $verifyPath !== null) && !gradtrack_storage_uses_s3()) {
    fwrite(STDERR, "Apply, verify, and rollback require STORAGE_DRIVER=s3.\n");
    exit(1);
}
if ($apply && $config['environment'] === 'production' && !gradtrack_migration_has_flag('production-approved')) {
    fwrite(STDERR, "Production apply is blocked. Re-run only after approval with --production-approved.\n");
    exit(1);
}
if (
    $apply
    && $config['environment'] !== 'production'
    && !gradtrack_migration_has_flag('confirmed-synthetic-data-only')
    && !gradtrack_migration_has_flag('confirmed-development-data')
) {
    fwrite(STDERR, "Development apply requires an explicit data confirmation. Use --confirmed-development-data after reviewing the dry-run manifest.\n");
    exit(1);
}

$db = (new Database())->getConnection();

if ($verifyPath !== null) {
    $manifest = json_decode((string) file_get_contents($verifyPath), true);
    if (!is_array($manifest) || !is_array($manifest['entries'] ?? null)) {
        throw new RuntimeException('Invalid migration manifest.');
    }

    $allowed = [];
    foreach (gradtrack_migration_specs() as $spec) {
        $allowed[$spec['table'] . '.' . $spec['path'] . '.' . $spec['pk']] = true;
    }

    $verified = 0;
    foreach ($manifest['entries'] as $entry) {
        if (($entry['status'] ?? '') !== 'updated') continue;

        $signature = ($entry['table'] ?? '') . '.' . ($entry['path_column'] ?? '') . '.' . ($entry['primary_key'] ?? '');
        if (!isset($allowed[$signature])) {
            throw new RuntimeException('Manifest contains an unsupported database target.');
        }

        $sql = "SELECT `{$entry['path_column']}` FROM `{$entry['table']}` WHERE `{$entry['primary_key']}` = :record_id LIMIT 1";
        $stmt = $db->prepare($sql);
        $stmt->execute([':record_id' => $entry['record_id']]);
        $databaseReference = (string) ($stmt->fetchColumn() ?: '');
        if ($databaseReference !== (string) ($entry['new_reference'] ?? '')) {
            throw new RuntimeException('Database reference verification failed for ' . $entry['kind'] . ' record ' . $entry['record_id']);
        }

        $localPath = gradtrack_storage_local_absolute_path((string) $entry['old_reference'], true);
        $localChecksum = hash_file('sha256', $localPath);
        if ($localChecksum === false || $localChecksum !== (string) ($entry['sha256'] ?? '')) {
            throw new RuntimeException('Local checksum verification failed for ' . $entry['kind'] . ' record ' . $entry['record_id']);
        }

        $head = gradtrack_storage_head($databaseReference);
        if (empty($head['exists']) || ($head['driver'] ?? '') !== 's3') {
            throw new RuntimeException('S3 HeadObject verification failed for ' . $entry['kind'] . ' record ' . $entry['record_id']);
        }
        if (($head['metadata']['gradtrack-sha256'] ?? '') !== $localChecksum) {
            throw new RuntimeException('S3 metadata checksum verification failed for ' . $entry['kind'] . ' record ' . $entry['record_id']);
        }

        $downloaded = gradtrack_storage_s3_client()->getObject([
            'Bucket' => $config['bucket'],
            'Key' => $databaseReference,
        ]);
        if (hash('sha256', (string) $downloaded['Body']) !== $localChecksum) {
            throw new RuntimeException('Downloaded content verification failed for ' . $entry['kind'] . ' record ' . $entry['record_id']);
        }

        $url = gradtrack_storage_presigned_url(
            $databaseReference,
            basename($localPath),
            (string) ($head['content_type'] ?? 'application/octet-stream')
        );
        if (parse_url($url, PHP_URL_SCHEME) !== 'https') {
            throw new RuntimeException('Private access verification failed for ' . $entry['kind'] . ' record ' . $entry['record_id']);
        }

        echo 'PASS: ' . $entry['kind'] . ' record ' . $entry['record_id'] . "\n";
        $verified++;
    }

    echo "Verified {$verified} database references and S3 objects. Local files were retained.\n";
    exit(0);
}

if ($rollbackPath !== null) {
    $manifest = json_decode((string) file_get_contents($rollbackPath), true);
    if (!is_array($manifest) || !is_array($manifest['entries'] ?? null)) throw new RuntimeException('Invalid migration manifest.');
    $rolledBack = 0;
    foreach (array_reverse($manifest['entries']) as $entry) {
        if (($entry['status'] ?? '') !== 'updated') continue;
        $db->beginTransaction();
        try {
            if (gradtrack_migration_update($db, $entry, (string) $entry['new_reference'], (string) $entry['old_reference'])) $rolledBack++;
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
    }
    echo "Rolled back {$rolledBack} database references. S3 objects and all local files were retained.\n";
    exit(0);
}

$manifestPath = gradtrack_migration_argument('manifest');
if ($manifestPath === null) {
    $manifestPath = __DIR__ . '/../tmp/s3-migration-' . gmdate('Ymd-His') . '.json';
}
$manifestDirectory = dirname($manifestPath);
if (!is_dir($manifestDirectory) && !mkdir($manifestDirectory, 0755, true) && !is_dir($manifestDirectory)) {
    throw new RuntimeException('Unable to create the manifest directory.');
}

$entries = [];
$referencedPaths = [];
$uploadedByLegacyPath = [];

foreach (gradtrack_migration_specs() as $spec) {
    if ($kindFilter !== null && $spec['kind'] !== $kindFilter) continue;
    if (!gradtrack_migration_table_column_exists($db, $spec['table'], $spec['path'])) continue;
    foreach ($db->query($spec['query'])->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $legacyPath = ltrim(str_replace('\\', '/', trim((string) ($row['legacy_path'] ?? ''))), '/');
        if (!gradtrack_storage_is_legacy_path($legacyPath)) continue;
        $referencedPaths[$legacyPath] = true;

        $entry = [
            'kind' => $spec['kind'], 'table' => $spec['table'], 'primary_key' => $spec['pk'],
            'path_column' => $spec['path'], 'record_id' => $row['record_id'], 'old_reference' => $legacyPath,
            'new_reference' => null, 'sha256' => null, 'status' => 'pending',
        ];
        $uploadedNewObject = false;
        try {
            $absolute = gradtrack_storage_local_absolute_path($legacyPath, true);
            $checksum = hash_file('sha256', $absolute);
            if ($checksum === false) throw new RuntimeException('Checksum failed.');
            $extension = strtolower((string) pathinfo($absolute, PATHINFO_EXTENSION));
            $extension = preg_replace('/[^a-z0-9]/', '', $extension) ?: 'bin';
            $entry['sha256'] = $checksum;

            if (isset($uploadedByLegacyPath[$legacyPath])) {
                $entry['new_reference'] = $uploadedByLegacyPath[$legacyPath];
                $entry['status'] = $apply ? 'reused' : 'would-reuse';
            } else {
                $entry['new_reference'] = gradtrack_migration_object_key($spec, $row, $extension);
                if ($apply) {
                    $mime = mime_content_type($absolute) ?: 'application/octet-stream';
                    $stored = gradtrack_storage_put_file($absolute, $entry['new_reference'], $legacyPath, $mime, [
                        'category' => 'legacy-migration', 'legacy-sha256' => $checksum,
                    ]);
                    $head = gradtrack_storage_head($stored['reference']);
                    if (empty($head['exists']) || (($head['metadata']['gradtrack-sha256'] ?? '') !== $checksum)) {
                        gradtrack_storage_delete_quietly($stored['reference']);
                        throw new RuntimeException('S3 verification failed.');
                    }
                    $uploadedByLegacyPath[$legacyPath] = $stored['reference'];
                    $entry['new_reference'] = $stored['reference'];
                    $entry['status'] = 'uploaded';
                    $uploadedNewObject = true;
                } else {
                    $uploadedByLegacyPath[$legacyPath] = $entry['new_reference'];
                    $entry['status'] = 'would-upload';
                }
            }

            if ($apply) {
                $db->beginTransaction();
                try {
                    if (!gradtrack_migration_update($db, $entry, $legacyPath, (string) $entry['new_reference'])) {
                        throw new RuntimeException('Database reference changed before migration update.');
                    }
                    $db->commit();
                    $entry['status'] = 'updated';
                } catch (Throwable $error) {
                    if ($db->inTransaction()) $db->rollBack();
                    throw $error;
                }
            }
        } catch (Throwable $error) {
            if ($uploadedNewObject && !empty($entry['new_reference'])) {
                gradtrack_storage_delete_quietly((string) $entry['new_reference']);
                unset($uploadedByLegacyPath[$legacyPath]);
            }
            $localFileExists = false;
            try {
                gradtrack_storage_local_absolute_path($legacyPath, true);
                $localFileExists = true;
            } catch (Throwable $ignored) {
                $localFileExists = false;
            }
            $entry['status'] = $localFileExists ? 'failed' : 'missing';
            $entry['error'] = $entry['status'] === 'missing' ? 'Local file not found.' : 'Migration step failed; review server logs.';
            error_log('GradTrack legacy migration failed for ' . $spec['kind'] . ' record ' . $row['record_id'] . ': ' . get_class($error));
        }
        $entries[] = $entry;
    }
}

$orphaned = [];
$orphanScanPerformed = $kindFilter === null;
$uploadsRoot = gradtrack_storage_backend_root() . DIRECTORY_SEPARATOR . 'uploads';
if ($orphanScanPerformed && is_dir($uploadsRoot)) {
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($uploadsRoot, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $file) {
        if (!$file->isFile()) continue;
        $relative = 'uploads/' . str_replace('\\', '/', substr($file->getPathname(), strlen($uploadsRoot) + 1));
        if (!isset($referencedPaths[$relative]) && basename($relative) !== 'metadata.json') $orphaned[] = $relative;
    }
}

$manifest = [
    'version' => 1, 'created_at' => gmdate(DATE_ATOM), 'mode' => $apply ? 'apply' : 'dry-run',
    'environment' => $config['environment'], 'bucket' => $config['bucket'], 'kind_filter' => $kindFilter,
    'entries' => $entries, 'orphaned_local_files' => $orphaned,
    'orphan_scan_performed' => $orphanScanPerformed,
    'local_files_deleted' => false, 's3_objects_deleted' => false,
];
file_put_contents($manifestPath, json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

$counts = array_count_values(array_column($entries, 'status'));
echo ($apply ? 'Apply' : 'Dry run') . " complete. Manifest: {$manifestPath}\n";
foreach ($counts as $status => $count) echo "{$status}: {$count}\n";
echo $orphanScanPerformed
    ? 'orphaned-local: ' . count($orphaned) . "\n"
    : "orphaned-local: not evaluated for a scoped migration\n";
echo "No local files were deleted.\n";
