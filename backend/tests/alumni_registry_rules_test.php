<?php
require_once __DIR__ . '/../api/config/alumni_registry.php';

$failures = 0;

function alumni_registry_test_assert(bool $condition, string $message): void
{
    global $failures;
    if (!$condition) {
        $failures++;
        echo "FAIL: {$message}" . PHP_EOL;
        return;
    }

    echo "PASS: {$message}" . PHP_EOL;
}

$nameA = gradtrack_alumni_registry_normalize_name('DELA CRUZ, VIANNE KAY G.');
$nameB = gradtrack_alumni_registry_normalize_name('Dela Cruz, Vianne Kay G.');
$nameC = gradtrack_alumni_registry_normalize_name('Vianne Kay G. Dela Cruz');
$nameD = gradtrack_alumni_registry_normalize_name('DELA  CRUZ,  VIANNE KAY G.');

alumni_registry_test_assert($nameA === $nameB, 'case-insensitive duplicate names match');
alumni_registry_test_assert($nameA === $nameC, 'last-name-comma format matches given-name-first format');
alumni_registry_test_assert($nameA === $nameD, 'repeated spaces do not change duplicate matching');

$courseCases = [
    'Bachelor of Science in Computer Science' => 'BSCS',
    'Associate in Computer Technology' => 'ACT',
    'Bachelor of Science in Hotel and Restaurant Management' => 'BSHM',
    'Bachelor of Science in Hospitality Management' => 'BSHM',
    'Bachelor of Secondary Education' => 'BSED',
    'Bachelor of Elementary Education' => 'BEED',
    'Bachelor of Science in Nursing' => 'BSN',
    'b.s.c.s.' => 'BSCS',
];

foreach ($courseCases as $input => $expectedCode) {
    $match = gradtrack_alumni_registry_canonical_course_from_text($input);
    alumni_registry_test_assert(($match['code'] ?? null) === $expectedCode, "course mapping '{$input}' maps to {$expectedCode}");
}

alumni_registry_test_assert(gradtrack_alumni_registry_canonical_course_from_text('Unknown Course') === null, 'unrecognized courses are not silently accepted');
alumni_registry_test_assert(gradtrack_alumni_registry_normalize_batch_year('2011') === 2011, 'valid batch year is accepted');
alumni_registry_test_assert(gradtrack_alumni_registry_normalize_batch_year('abcd') === null, 'non-numeric batch is rejected');
alumni_registry_test_assert(gradtrack_alumni_registry_normalize_batch_year('0000') === null, 'out-of-range batch is rejected');
alumni_registry_test_assert(gradtrack_alumni_registry_normalize_batch_year('99999') === null, 'five-digit batch is rejected');
alumni_registry_test_assert(gradtrack_alumni_registry_row_is_ignorable('', '', ''), 'blank rows are ignored');
alumni_registry_test_assert(gradtrack_alumni_registry_row_is_ignorable('NAME', 'COURSE', 'BATCH'), 'worksheet headings are ignored');
alumni_registry_test_assert(gradtrack_alumni_registry_row_is_ignorable('TOTAL', '', '154'), 'summary total rows are ignored');
alumni_registry_test_assert(gradtrack_alumni_registry_is_placeholder_name('Member Count'), 'placeholder names are detected');

$duplicateKeyA = gradtrack_alumni_registry_normalize_name('DELA CRUZ, VIANNE KAY G.') . '|BSCS|2023';
$duplicateKeyB = gradtrack_alumni_registry_normalize_name('Dela  Cruz,  Vianne Kay G.') . '|BSCS|2023';
alumni_registry_test_assert($duplicateKeyA === $duplicateKeyB, 'duplicate key uses normalized name, course, and batch');

alumni_registry_test_assert(gradtrack_alumni_registry_safe_export_value('=SUM(A1:A2)') === "'=SUM(A1:A2)", 'CSV formula injection is neutralized for equals prefix');
alumni_registry_test_assert(gradtrack_alumni_registry_safe_export_value('+SUM(A1:A2)') === "'+SUM(A1:A2)", 'CSV formula injection is neutralized for plus prefix');
alumni_registry_test_assert(gradtrack_alumni_registry_safe_export_value('-SUM(A1:A2)') === "'-SUM(A1:A2)", 'CSV formula injection is neutralized for minus prefix');
alumni_registry_test_assert(gradtrack_alumni_registry_safe_export_value('@SUM(A1:A2)') === "'@SUM(A1:A2)", 'CSV formula injection is neutralized for at prefix');

if ($failures > 0) {
    echo PHP_EOL . "{$failures} alumni registry rule test(s) failed." . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All alumni registry rule tests passed.' . PHP_EOL;
