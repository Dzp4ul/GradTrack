<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config/survey_reminders.php';

function reminder_schedule_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
    echo 'PASS: ' . $message . PHP_EOL;
}

reminder_schedule_assert(
    gradtrack_survey_reminder_normalize_end_date('2028-02-29') === '2028-02-29',
    'a valid leap-day end date is accepted'
);
reminder_schedule_assert(
    !gradtrack_survey_reminder_has_ended('2026-09-29', new DateTimeImmutable('2026-09-29 23:59:59')),
    'automatic reminders remain active throughout the selected end date'
);
reminder_schedule_assert(
    gradtrack_survey_reminder_has_ended('2026-09-29', new DateTimeImmutable('2026-09-30 00:00:00')),
    'automatic reminders stop on the day after the selected end date'
);
reminder_schedule_assert(
    !gradtrack_survey_reminder_has_ended('', new DateTimeImmutable('2030-01-01')),
    'an unset legacy end date does not unexpectedly disable existing schedules'
);

$invalidDateRejected = false;
try {
    gradtrack_survey_reminder_normalize_end_date('2026-02-30');
} catch (InvalidArgumentException $exception) {
    $invalidDateRejected = true;
}
reminder_schedule_assert($invalidDateRejected, 'an invalid calendar date is rejected');

echo 'Survey reminder schedule tests passed.' . PHP_EOL;
