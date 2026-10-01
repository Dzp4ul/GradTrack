<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../api/config/env.php';
gradtrack_load_env_file();
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/psgc_address.php';

$arguments = array_slice($argv ?? [], 1);
$apply = in_array('--apply', $arguments, true);
$productionApproved = in_array('--production-approved', $arguments, true);
if (gradtrack_is_production() && $apply && !$productionApproved) {
    fwrite(STDERR, "Production repair requires --production-approved after backup and change approval.\n");
    exit(2);
}

function gradtrack_psgc_repair_question_map(PDO $db, int $surveyId): array
{
    static $maps = [];
    if (isset($maps[$surveyId])) {
        return $maps[$surveyId];
    }

    $stmt = $db->prepare(
        "SELECT id, analytics_key
         FROM survey_questions
         WHERE survey_id = :survey_id
           AND analytics_key IN ('region', 'province', 'city_municipality', 'barangay')
         ORDER BY is_active DESC, sort_order ASC, id ASC"
    );
    $stmt->execute([':survey_id' => $surveyId]);

    $map = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $question) {
        $key = (string) ($question['analytics_key'] ?? '');
        if (!isset($map[$key])) {
            $map[$key] = (int) $question['id'];
        }
    }

    $maps[$surveyId] = $map;
    return $map;
}

function gradtrack_psgc_repair_value(
    $current,
    ?string $canonical,
    string $field,
    array &$changes,
    array &$conflicts
) {
    if (!is_string($current) || $canonical === null || $current === $canonical) {
        return $current;
    }

    if (gradtrack_psgc_mojibake_score($current) === 0) {
        return $current;
    }

    $normalized = gradtrack_psgc_normalize_text($current);
    if ($normalized !== $canonical) {
        $conflicts[] = [
            'field' => $field,
            'current' => $current,
            'normalized' => $normalized,
            'canonical' => $canonical,
        ];
        return $current;
    }

    $changes[] = [
        'field' => $field,
        'before' => $current,
        'after' => $canonical,
    ];
    return $canonical;
}

function gradtrack_psgc_repair_answer_rows(
    PDO $db,
    int $responseId,
    array $questionMap,
    array $canonicalAddress,
    array &$changes,
    array &$conflicts,
    bool $lock
): array {
    if ($questionMap === []) {
        return [];
    }

    $questionIds = array_values($questionMap);
    $placeholders = implode(', ', array_fill(0, count($questionIds), '?'));
    $sql = "SELECT id, survey_question_id, answer_value
            FROM survey_response_answers
            WHERE survey_response_id = ?
              AND survey_question_id IN ({$placeholders})
            ORDER BY id ASC" . ($lock ? ' FOR UPDATE' : '');
    $stmt = $db->prepare($sql);
    $stmt->execute(array_merge([$responseId], $questionIds));

    $levelByQuestion = array_flip($questionMap);
    $updates = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $answerRow) {
        $questionId = (int) $answerRow['survey_question_id'];
        $level = $levelByQuestion[$questionId] ?? null;
        if ($level === null) {
            continue;
        }

        $decoded = json_decode((string) $answerRow['answer_value'], true);
        $canonicalName = $canonicalAddress[$level . '_name'] ?? null;
        $next = gradtrack_psgc_repair_value(
            $decoded,
            is_string($canonicalName) ? $canonicalName : null,
            'survey_response_answers.' . (int) $answerRow['id'],
            $changes,
            $conflicts
        );
        if ($next !== $decoded) {
            $updates[] = [
                'id' => (int) $answerRow['id'],
                'answer_value' => json_encode($next, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
            ];
        }
    }

    return $updates;
}

function gradtrack_psgc_repair_plan(PDO $db, array $row, bool $lock = false): array
{
    $responseId = (int) ($row['id'] ?? 0);
    $surveyId = (int) ($row['survey_id'] ?? 0);
    $responses = json_decode((string) ($row['responses'] ?? ''), true);
    if ($responseId <= 0 || $surveyId <= 0 || !is_array($responses)) {
        return ['status' => 'skipped', 'reason' => 'invalid_response_payload', 'id' => $responseId];
    }

    try {
        $canonicalAddress = gradtrack_psgc_validate_address([
            'region_code' => $row['region_code'] ?? null,
            'province_code' => $row['province_code'] ?? null,
            'city_municipality_code' => $row['city_municipality_code'] ?? null,
            'barangay_code' => $row['barangay_code'] ?? null,
        ]);
    } catch (GradTrackPsgcValidationException $exception) {
        return [
            'status' => 'skipped',
            'reason' => 'address_codes_could_not_be_validated',
            'error' => $exception->getMessage(),
            'id' => $responseId,
            'survey_id' => $surveyId,
        ];
    }

    $changes = [];
    $conflicts = [];
    $nextNames = [];
    $questionMap = gradtrack_psgc_repair_question_map($db, $surveyId);
    $levels = ['region', 'province', 'city_municipality', 'barangay'];

    foreach ($levels as $level) {
        $nameField = $level . '_name';
        $codeField = $level . '_code';
        $canonicalName = $canonicalAddress[$nameField] ?? null;
        $canonicalName = is_string($canonicalName) ? $canonicalName : null;

        $nextNames[$nameField] = gradtrack_psgc_repair_value(
            $row[$nameField] ?? null,
            $canonicalName,
            'survey_responses.' . $nameField,
            $changes,
            $conflicts
        );

        if (isset($responses['__psgc_address']) && is_array($responses['__psgc_address'])) {
            $savedCode = trim((string) ($responses['__psgc_address'][$codeField] ?? ''));
            $canonicalCode = trim((string) ($canonicalAddress[$codeField] ?? ''));
            if ($savedCode !== '' && $savedCode !== $canonicalCode) {
                $conflicts[] = [
                    'field' => 'responses.__psgc_address.' . $codeField,
                    'current' => $savedCode,
                    'canonical' => $canonicalCode,
                ];
            }

            $responses['__psgc_address'][$nameField] = gradtrack_psgc_repair_value(
                $responses['__psgc_address'][$nameField] ?? null,
                $canonicalName,
                'responses.__psgc_address.' . $nameField,
                $changes,
                $conflicts
            );
        }

        if (isset($questionMap[$level])) {
            $questionKey = (string) $questionMap[$level];
            if (array_key_exists($questionKey, $responses)) {
                $responses[$questionKey] = gradtrack_psgc_repair_value(
                    $responses[$questionKey],
                    $canonicalName,
                    'responses.' . $questionKey,
                    $changes,
                    $conflicts
                );
            }
        }
    }

    $answerUpdates = gradtrack_psgc_repair_answer_rows(
        $db,
        $responseId,
        $questionMap,
        $canonicalAddress,
        $changes,
        $conflicts,
        $lock
    );

    if ($conflicts !== []) {
        return [
            'status' => 'skipped',
            'reason' => 'canonical_name_conflict',
            'id' => $responseId,
            'survey_id' => $surveyId,
            'conflicts' => $conflicts,
        ];
    }

    if ($changes === []) {
        return ['status' => 'unchanged', 'id' => $responseId, 'survey_id' => $surveyId];
    }

    return [
        'status' => 'ready',
        'id' => $responseId,
        'survey_id' => $surveyId,
        'city_municipality_code' => $canonicalAddress['city_municipality_code'] ?? null,
        'changes' => $changes,
        'names' => $nextNames,
        'responses' => json_encode($responses, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
        'answer_updates' => $answerUpdates,
    ];
}

function gradtrack_psgc_repair_candidate_rows(PDO $db, bool $lock = false): array
{
    $sql = "SELECT sr.id, sr.survey_id, sr.responses,
                   sr.region_code, sr.region_name,
                   sr.province_code, sr.province_name,
                   sr.city_municipality_code, sr.city_municipality_name,
                   sr.barangay_code, sr.barangay_name
            FROM survey_responses sr
            WHERE HEX(CAST(CONCAT_WS('|',
                    sr.region_name,
                    sr.province_name,
                    sr.city_municipality_name,
                    sr.barangay_name,
                    CAST(sr.responses AS CHAR)
                  ) AS CHAR)) REGEXP 'C383|C382|C3A2|C3B0'
               OR EXISTS (
                    SELECT 1
                    FROM survey_response_answers sra
                    WHERE sra.survey_response_id = sr.id
                      AND HEX(CAST(sra.answer_value AS CHAR)) REGEXP 'C383|C382|C3A2|C3B0'
               )
            ORDER BY sr.id ASC" . ($lock ? ' FOR UPDATE' : '');

    return $db->query($sql)->fetchAll(PDO::FETCH_ASSOC);
}

$db = (new Database())->getConnection();
$result = [
    'mode' => $apply ? 'apply' : 'dry-run',
    'data_policy' => $apply
        ? 'Only reversible PSGC mojibake matching the canonical name for the stored PSGC code was updated.'
        : 'Read-only preview. No data was modified. Re-run with --apply after review and backup.',
    'ready' => [],
    'skipped' => [],
];

try {
    if ($apply) {
        $db->beginTransaction();
    }

    $rows = gradtrack_psgc_repair_candidate_rows($db, $apply);
    $updateResponse = $db->prepare(
        'UPDATE survey_responses
         SET region_name = :region_name,
             province_name = :province_name,
             city_municipality_name = :city_municipality_name,
             barangay_name = :barangay_name,
             responses = :responses
         WHERE id = :id'
    );
    $updateAnswer = $db->prepare(
        'UPDATE survey_response_answers SET answer_value = :answer_value WHERE id = :id'
    );

    foreach ($rows as $row) {
        $plan = gradtrack_psgc_repair_plan($db, $row, $apply);
        if (($plan['status'] ?? '') !== 'ready') {
            if (($plan['status'] ?? '') !== 'unchanged') {
                $result['skipped'][] = $plan;
            }
            continue;
        }

        $result['ready'][] = [
            'id' => $plan['id'],
            'survey_id' => $plan['survey_id'],
            'city_municipality_code' => $plan['city_municipality_code'],
            'changes' => $plan['changes'],
        ];

        if (!$apply) {
            continue;
        }

        $updateResponse->execute([
            ':region_name' => $plan['names']['region_name'],
            ':province_name' => $plan['names']['province_name'],
            ':city_municipality_name' => $plan['names']['city_municipality_name'],
            ':barangay_name' => $plan['names']['barangay_name'],
            ':responses' => $plan['responses'],
            ':id' => $plan['id'],
        ]);
        foreach ($plan['answer_updates'] as $answerUpdate) {
            $updateAnswer->execute([
                ':answer_value' => $answerUpdate['answer_value'],
                ':id' => $answerUpdate['id'],
            ]);
        }
    }

    if ($apply) {
        $db->commit();
    }

    $result['candidate_count'] = count($rows);
    $result['ready_count'] = count($result['ready']);
    $result['skipped_count'] = count($result['skipped']);
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), PHP_EOL;
} catch (Throwable $exception) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    fwrite(STDERR, json_encode([
        'success' => false,
        'error' => $exception->getMessage(),
        'data_policy' => 'The transaction was rolled back; no partial repair was retained.',
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL);
    exit(1);
}
