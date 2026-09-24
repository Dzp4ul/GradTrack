<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config/forum.php';

$failures = 0;
$assert = static function (bool $condition, string $message) use (&$failures): void {
    if (!$condition) {
        $failures++;
        echo "FAIL: {$message}" . PHP_EOL;
        return;
    }
    echo "PASS: {$message}" . PHP_EOL;
};

$assert(gradtrack_forum_report_viewer_relation(10, 20, 10) === 'reporter', 'the reporter can view the report they submitted');
$assert(gradtrack_forum_report_viewer_relation(10, 20, 20) === 'reported_user', 'the reported content owner can view the report');
$assert(gradtrack_forum_report_viewer_relation(10, 20, 30) === null, 'an unrelated graduate is denied report access');

if ($failures > 0) {
    echo PHP_EOL . "{$failures} forum report access test(s) failed." . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All forum report access tests passed.' . PHP_EOL;
