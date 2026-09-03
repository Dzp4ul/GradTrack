<?php
require_once __DIR__ . '/../api/config/psgc_address.php';

$failures = 0;
$testDirectory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'gradtrack-psgc-' . bin2hex(random_bytes(6));
putenv('PSGC_CACHE_DIR=' . $testDirectory);

function psgc_cache_assert(bool $condition, string $message): void
{
    global $failures;
    if (!$condition) {
        $failures++;
        echo "FAIL: {$message}" . PHP_EOL;
        return;
    }

    echo "PASS: {$message}" . PHP_EOL;
}

try {
    $items = [
        ['code' => '0300000000', 'name' => 'Region III (Central Luzon)'],
    ];

    gradtrack_psgc_write_cached_collection('test/regions', $items);
    $cached = gradtrack_psgc_read_cached_collection('test/regions');

    psgc_cache_assert(is_array($cached), 'PSGC collection is written to the persistent cache');
    psgc_cache_assert(($cached['items'] ?? null) === $items, 'cached PSGC names and codes are preserved');
    psgc_cache_assert(($cached['fetched_at'] ?? 0) > 0, 'cache records its fetch time');

    putenv('PSGC_API_BASE_URL=http://127.0.0.1:1');
    $fallback = gradtrack_psgc_fetch_collection('test/regions');
    psgc_cache_assert($fallback === $items, 'a fresh canonical cache avoids an unavailable remote service');

    $stalePath = 'test/stale-regions';
    gradtrack_psgc_write_cached_collection($stalePath, $items);
    $staleFile = gradtrack_psgc_cache_file($stalePath);
    $stalePayload = json_decode((string) file_get_contents($staleFile), true);
    $stalePayload['fetched_at'] = 1;
    file_put_contents($staleFile, json_encode($stalePayload), LOCK_EX);
    putenv('PSGC_CACHE_MAX_AGE=1');

    $staleFallback = gradtrack_psgc_fetch_collection($stalePath);
    psgc_cache_assert($staleFallback === $items, 'a stale last-known-good cache is used when PSGC is unavailable');
} finally {
    foreach (['test/regions', 'test/stale-regions'] as $testPath) {
        $cacheFile = gradtrack_psgc_cache_file($testPath);
        if (is_file($cacheFile)) {
            @unlink($cacheFile);
        }
    }
    if (is_dir($testDirectory)) {
        @rmdir($testDirectory);
    }
    putenv('PSGC_CACHE_DIR');
    putenv('PSGC_CACHE_MAX_AGE');
    putenv('PSGC_API_BASE_URL');
}

if ($failures > 0) {
    exit(1);
}

echo 'All PSGC cache assertions passed.' . PHP_EOL;
