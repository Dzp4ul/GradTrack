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
    $canonicalName = "Do\xC3\xB1a Remedios Trinidad";
    $mojibakeName = "Do\xC3\x83\xC2\xB1a Remedios Trinidad";
    $canonicalUppercase = "\xC3\x91";
    $mojibakeUppercase = "\xC3\x83\xE2\x80\x98";
    $canonicalAccents = "\xC3\xA1\xC3\xA9\xC3\xAD\xC3\xB3\xC3\xBA";
    $mojibakeAccents = "\xC3\x83\xC2\xA1\xC3\x83\xC2\xA9\xC3\x83\xC2\xAD\xC3\x83\xC2\xB3\xC3\x83\xC2\xBA";

    psgc_cache_assert(
        gradtrack_psgc_normalize_text($mojibakeName) === $canonicalName,
        'reversible PSGC mojibake is normalized to canonical UTF-8'
    );
    psgc_cache_assert(
        gradtrack_psgc_normalize_text($canonicalName) === $canonicalName,
        'valid UTF-8 PSGC text is preserved exactly'
    );
    psgc_cache_assert(
        gradtrack_psgc_normalize_text($mojibakeUppercase) === $canonicalUppercase,
        'uppercase Unicode mojibake is normalized'
    );
    psgc_cache_assert(
        gradtrack_psgc_normalize_text($mojibakeAccents) === $canonicalAccents,
        'accented Unicode mojibake is normalized globally'
    );
    psgc_cache_assert(
        gradtrack_psgc_is_allowed_collection_path('provinces/0301400000/cities-municipalities')
        && !gradtrack_psgc_is_allowed_collection_path('../surveys/responses.php'),
        'the public PSGC endpoint accepts only supported collection paths'
    );

    $items = [
        ['code' => '0300000000', 'name' => 'Region III (Central Luzon)'],
        ['code' => '0301424000', 'name' => $mojibakeName],
    ];
    $expectedItems = [
        ['code' => '0300000000', 'name' => 'Region III (Central Luzon)'],
        ['code' => '0301424000', 'name' => $canonicalName],
    ];

    gradtrack_psgc_write_cached_collection('test/regions', $items);
    $cached = gradtrack_psgc_read_cached_collection('test/regions');
    $cacheContents = (string) file_get_contents(gradtrack_psgc_cache_file('test/regions'));

    psgc_cache_assert(is_array($cached), 'PSGC collection is written to the persistent cache');
    psgc_cache_assert(($cached['items'] ?? null) === $expectedItems, 'cached PSGC names and codes use canonical UTF-8');
    psgc_cache_assert(($cached['fetched_at'] ?? 0) > 0, 'cache records its fetch time');
    psgc_cache_assert(
        strpos($cacheContents, $canonicalName) !== false && strpos($cacheContents, $mojibakeName) === false,
        'cache JSON writes unescaped canonical UTF-8 without double encoding'
    );

    $legacyPath = 'test/legacy-regions';
    $legacyFile = $testDirectory . DIRECTORY_SEPARATOR . hash('sha256', $legacyPath) . '.json';
    file_put_contents($legacyFile, json_encode([
        'path' => $legacyPath,
        'fetched_at' => time(),
        'items' => [['code' => '0301424000', 'name' => $mojibakeName]],
    ]), LOCK_EX);
    psgc_cache_assert(
        gradtrack_psgc_cache_file($legacyPath) !== $legacyFile
        && gradtrack_psgc_read_cached_collection($legacyPath) === null,
        'legacy PSGC cache filenames are safely invalidated by cache versioning'
    );

    putenv('PSGC_API_BASE_URL=http://127.0.0.1:1');
    $fallback = gradtrack_psgc_fetch_collection('test/regions');
    psgc_cache_assert($fallback === $expectedItems, 'a fresh canonical cache avoids an unavailable remote service');

    $stalePath = 'test/stale-regions';
    gradtrack_psgc_write_cached_collection($stalePath, $items);
    $staleFile = gradtrack_psgc_cache_file($stalePath);
    $stalePayload = json_decode((string) file_get_contents($staleFile), true);
    $stalePayload['fetched_at'] = 1;
    file_put_contents($staleFile, json_encode($stalePayload), LOCK_EX);
    putenv('PSGC_CACHE_MAX_AGE=1');

    $staleFallback = gradtrack_psgc_fetch_collection($stalePath);
    psgc_cache_assert($staleFallback === $expectedItems, 'a stale last-known-good cache is used when PSGC is unavailable');
} finally {
    foreach (['test/regions', 'test/stale-regions', 'test/legacy-regions'] as $testPath) {
        $cacheFile = gradtrack_psgc_cache_file($testPath);
        if (is_file($cacheFile)) {
            @unlink($cacheFile);
        }
    }
    if (isset($legacyFile) && is_file($legacyFile)) {
        @unlink($legacyFile);
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
