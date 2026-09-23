<?php
declare(strict_types=1);

return static function (PDO $db): void {
    $indexExists = static function (string $indexName) use ($db): bool {
        $statement = $db->prepare(
            'SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = \'survey_questions\'
               AND INDEX_NAME = :index_name'
        );
        $statement->execute([':index_name' => $indexName]);
        return (int)$statement->fetchColumn() > 0;
    };

    // A semantic field may be retired and later reintroduced on the same live
    // survey. Both question identities must remain available for historical
    // answers, while current-form loaders select only the active one.
    if ($indexExists('uq_survey_questions_analytics_key')) {
        $db->exec('ALTER TABLE survey_questions DROP INDEX uq_survey_questions_analytics_key');
    }
    if (!$indexExists('idx_survey_questions_analytics_key')) {
        $db->exec(
            'ALTER TABLE survey_questions
             ADD KEY idx_survey_questions_analytics_key (survey_id, analytics_key, is_active)'
        );
    }
};
