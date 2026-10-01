<?php
declare(strict_types=1);

require_once __DIR__ . '/../../backend/api/config/survey_contact_email.php';

return static function (PDO $db): void {
    if (!gradtrack_migration_table_exists($db, 'graduates')
        || !gradtrack_migration_table_exists($db, 'survey_responses')
        || !gradtrack_migration_table_exists($db, 'survey_response_answers')
        || !gradtrack_migration_table_exists($db, 'survey_questions')) {
        throw new RuntimeException('Required graduate and normalized survey response tables are missing.');
    }

    $ownsTransaction = !$db->inTransaction();
    if ($ownsTransaction) {
        $db->beginTransaction();
    }

    try {
        $rows = $db->query("SELECT sr.graduate_id, sra.answer_value
            FROM survey_responses sr
            JOIN graduates g ON g.id = sr.graduate_id
            JOIN survey_response_answers sra ON sra.survey_response_id = sr.id
            JOIN survey_questions sq ON sq.id = sra.survey_question_id
            WHERE sr.submitted_at IS NOT NULL
              AND (g.email IS NULL OR TRIM(g.email) = '')
              AND sra.is_canonical = 1
              AND sq.analytics_key = 'email_address'
            ORDER BY sr.graduate_id ASC, sr.submitted_at DESC, sr.id DESC, sra.id DESC")
            ->fetchAll(PDO::FETCH_ASSOC);

        $handledGraduates = [];
        foreach ($rows as $row) {
            $graduateId = (int) ($row['graduate_id'] ?? 0);
            if ($graduateId <= 0 || isset($handledGraduates[$graduateId])) {
                continue;
            }

            $email = gradtrack_survey_contact_email_decode($row['answer_value'] ?? null);
            if ($email === null) {
                continue;
            }

            // A valid latest answer is authoritative only for an otherwise blank
            // graduate contact field. Conflicts and existing values are skipped.
            $result = gradtrack_sync_blank_graduate_email($db, $graduateId, $email);
            if (($result['status'] ?? '') === 'sync_failed') {
                throw new RuntimeException('Survey email backfill failed for graduate ID ' . $graduateId . '.');
            }
            $handledGraduates[$graduateId] = true;
        }

        if ($ownsTransaction) {
            $db->commit();
        }
    } catch (Throwable $error) {
        if ($ownsTransaction && $db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }
};
