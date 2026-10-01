<?php
declare(strict_types=1);

return static function (PDO $db): void {
    // Degree Program & Specialization options on survey_questions are the
    // authoritative scope. Remove the short-lived duplicate relationship table
    // if the earlier migration reached an environment before this correction.
    $db->exec('DROP TABLE IF EXISTS survey_programs');
};

