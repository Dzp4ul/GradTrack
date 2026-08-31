<?php

// Rule tests are intentionally isolated from the developer's active S3 driver.
putenv('STORAGE_DRIVER=local');
$_ENV['STORAGE_DRIVER'] = 'local';
$_SERVER['STORAGE_DRIVER'] = 'local';

require_once __DIR__ . '/../api/config/storage.php';

$failures = 0;

function storage_test_assert(bool $condition, string $message): void
{
    global $failures;
    if (!$condition) {
        $failures++;
        echo "FAIL: {$message}\n";
        return;
    }
    echo "PASS: {$message}\n";
}

$uuid = gradtrack_storage_uuid();
storage_test_assert(preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/', $uuid) === 1, 'UUID v4 object names are generated');
storage_test_assert(str_ends_with(gradtrack_storage_uuid_filename('.JpG'), '.jpg'), 'object file extensions are normalized');
storage_test_assert(gradtrack_storage_safe_download_name("../report\r\n.pdf") === '_report__.pdf', 'download filenames cannot inject headers or paths');
storage_test_assert(gradtrack_storage_filename_has_dangerous_segment('photo.php.jpg'), 'dangerous double extensions are rejected');
storage_test_assert(!gradtrack_storage_filename_has_dangerous_segment('graduate-certificate.final.pdf'), 'safe multi-part filenames are allowed');
storage_test_assert(gradtrack_storage_is_legacy_path('/uploads/profile-images/1/photo.jpg'), 'legacy upload paths are recognized');
storage_test_assert(gradtrack_storage_is_s3_key('media/profiles/graduates/1/profile/file.jpg'), 'S3 object keys are recognized');
storage_test_assert(!gradtrack_storage_is_s3_key('https://example.test/file.jpg'), 'absolute URLs are never treated as S3 keys');

$invalidKeyRejected = false;
try {
    gradtrack_storage_normalize_key('private/chat/../secret.txt');
} catch (InvalidArgumentException $error) {
    $invalidKeyRejected = true;
}
storage_test_assert($invalidKeyRejected, 'object key traversal is rejected');

if (gradtrack_storage_driver() === 'local') {
    $source = tempnam(sys_get_temp_dir(), 'gradtrack-storage-test-');
    $reference = null;
    $testDirectory = null;
    try {
        file_put_contents($source, 'GradTrack storage test');
        $name = gradtrack_storage_uuid_filename('txt');
        $stored = gradtrack_storage_put_file(
            $source,
            'temporary/tests/' . $name,
            'uploads/test-storage/' . $name,
            'text/plain',
            ['category' => 'test']
        );
        $reference = $stored['reference'];
        $testDirectory = dirname(gradtrack_storage_local_absolute_path($reference));
        storage_test_assert(gradtrack_storage_is_legacy_path($reference), 'local driver preserves legacy reference format');
        storage_test_assert(gradtrack_storage_exists($reference), 'stored local object can be verified');
        storage_test_assert(gradtrack_storage_delete($reference), 'stored local object can be deleted');
        $reference = null;
    } finally {
        if ($reference !== null) gradtrack_storage_delete_quietly($reference);
        if (is_file($source)) @unlink($source);
        if ($testDirectory !== null && is_dir($testDirectory)
            && count(array_diff(scandir($testDirectory) ?: [], ['.', '..'])) === 0) {
            @rmdir($testDirectory);
        }
    }
} else {
    echo "SKIP: local put/read/delete test because STORAGE_DRIVER is not local\n";
}

if ($failures > 0) {
    echo "\n{$failures} storage rule test(s) failed.\n";
    exit(1);
}

echo "\nAll storage rule tests passed.\n";
