<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/survey_lifecycle.php';

try {
    $db = (new Database())->getConnection();
    $results = gradtrack_enforce_survey_completion($db);
    $completed = array_values(array_filter(
        $results,
        static fn (array $result): bool => (bool) ($result['transitioned'] ?? false)
    ));

    foreach ($completed as $result) {
        $survey = $result['survey'] ?? [];
        echo sprintf(
            "completed survey_id=%d reason=%s at=%s\n",
            (int) ($survey['id'] ?? 0),
            (string) ($result['reason'] ?? 'unknown'),
            gradtrack_survey_now()->format(DateTimeInterface::ATOM)
        );
    }
    echo sprintf("checked=%d completed=%d\n", count($results), count($completed));
    exit(0);
} catch (Throwable $exception) {
    error_log('GradTrack survey completion job failed: ' . $exception->getMessage());
    fwrite(STDERR, "Survey completion job failed. Review the service journal.\n");
    exit(1);
}
