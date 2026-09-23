<?php

/**
 * Stable survey metadata and version helpers.
 *
 * `surveys.id` remains the public version identifier for backward compatibility.
 * A template groups those immutable versions; responses continue to point at the
 * exact survey/version that was shown to the respondent.
 */

function gradtrack_survey_uuid(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);

    return substr($hex, 0, 8) . '-'
        . substr($hex, 8, 4) . '-'
        . substr($hex, 12, 4) . '-'
        . substr($hex, 16, 4) . '-'
        . substr($hex, 20, 12);
}

function gradtrack_survey_normalize_metadata_text($value): string
{
    $text = strtolower(trim((string)($value ?? '')));
    $text = str_replace(['&', '\\'], [' and ', '/'], $text);
    $text = preg_replace('/[^a-z0-9]+/', ' ', $text);
    return trim((string)preg_replace('/\s+/', ' ', (string)$text));
}

/**
 * Exact legacy questionnaire labels used only when seeding metadata for an
 * existing survey or the built-in GradTrack template. Runtime analytics never
 * infer meaning from these labels.
 */
function gradtrack_survey_legacy_analytics_key($questionText): ?string
{
    $map = [
        'last name' => 'last_name',
        'first name' => 'first_name',
        'middle name' => 'middle_name',
        'name extension' => 'name_extension',
        'region' => 'region',
        'province' => 'province',
        'city municipality' => 'city_municipality',
        'barangay' => 'barangay',
        'email address' => 'email_address',
        'mobile number' => 'mobile_number',
        'telephone or contact number' => 'phone_number',
        'civil status' => 'civil_status',
        'sex' => 'sex',
        'birthday' => 'birth_date',
        'degree program and specialization' => 'program',
        'year graduated' => 'graduation_year',
        'honors awards received' => 'honors_awards',
        'honors awards received if any' => 'honors_awards',
        'professional examination s passed if applicable' => 'professional_examinations',
        'name of examination' => 'examination_name',
        'date taken' => 'examination_date',
        'rating' => 'examination_rating',
        'reason s for taking the course pursuing the degree' => 'degree_reasons',
        'title of training' => 'training_title',
        'duration' => 'training_duration',
        'name of training institution' => 'training_institution',
        'name of graduate program' => 'graduate_program',
        'earned units' => 'earned_units',
        'name of college university' => 'graduate_institution',
        'what made you pursue advance studies' => 'advance_studies_reason',
        'are you presently employed' => 'employment_status',
        'are you presently employed?' => 'employment_status',
        'present employment status' => 'employment_classification',
        'if self employed what skills acquired in college were you able to apply in your work' => 'self_employment_skills',
        'present occupation e g grade school teacher engineer self employed' => 'occupation',
        'major line of business of the company you are presently employed in' => 'industry',
        'place of work' => 'work_location',
        'is this your first job after college' => 'first_job',
        'if yes what are your reason s for staying on the job' => 'job_retention_reason',
        'is your first job related to the course you took up in college' => 'job_course_alignment',
        'what were your reason s for changing job' => 'job_change_reason',
        'how long did you stay in your first job' => 'first_job_duration',
        'how did you find your first job' => 'job_search_method',
        'how long did it take to land your first job' => 'first_job_waiting_time',
        'job level position' => 'job_level',
        'what is your initial gross monthly earning in your first job after college' => 'salary_range',
        'was the college curriculum relevant to your first job' => 'curriculum_relevance',
        'if yes what competencies were useful' => 'useful_competencies',
        'reason s why you are not yet employed' => 'reason_unemployed',
    ];

    $normalized = gradtrack_survey_normalize_metadata_text($questionText);
    return $map[$normalized] ?? null;
}

function gradtrack_survey_question_by_analytics_key(array $questions, string $analyticsKey): ?array
{
    foreach ($questions as $question) {
        if (trim((string)($question['analytics_key'] ?? '')) === $analyticsKey) {
            return $question;
        }
    }

    return null;
}

function gradtrack_survey_question_id_by_analytics_key(array $questions, string $analyticsKey): ?string
{
    $question = gradtrack_survey_question_by_analytics_key($questions, $analyticsKey);
    return $question !== null ? (string)$question['id'] : null;
}

function gradtrack_survey_question_ids_by_analytics_keys(array $questions, array $analyticsKeys): array
{
    $ids = [];
    foreach ($analyticsKeys as $analyticsKey) {
        $questionId = gradtrack_survey_question_id_by_analytics_key($questions, (string)$analyticsKey);
        if ($questionId !== null) {
            $ids[] = $questionId;
        }
    }
    return $ids;
}

function gradtrack_survey_decode_options($options): array
{
    if (is_string($options)) {
        $decoded = json_decode($options, true);
        $options = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($options)) {
        return [];
    }

    return array_values(array_filter(array_map(static function ($option): string {
        if (is_array($option)) {
            return trim((string)($option['label'] ?? $option['value'] ?? ''));
        }
        return is_scalar($option) ? trim((string)$option) : '';
    }, $options), static fn (string $option): bool => $option !== ''));
}

function gradtrack_survey_sync_sections(PDO $db, int $surveyId, array $questions): array
{
    $existingStatement = $db->prepare(
        'SELECT id, section_key, title FROM survey_sections WHERE survey_id = :survey_id ORDER BY display_order, id'
    );
    $existingStatement->execute([':survey_id' => $surveyId]);
    $existingByTitle = [];
    $existingById = [];
    foreach ($existingStatement->fetchAll(PDO::FETCH_ASSOC) as $section) {
        $existingByTitle[gradtrack_survey_normalize_metadata_text($section['title'])] = $section;
        $existingById[(int)$section['id']] = $section;
    }

    $insert = $db->prepare(
        'INSERT INTO survey_sections (survey_id, section_key, title, display_order)
         VALUES (:survey_id, :section_key, :title, :display_order)'
    );
    $update = $db->prepare(
        'UPDATE survey_sections SET title = :title, display_order = :display_order WHERE id = :id AND survey_id = :survey_id'
    );

    // Move current order values out of the target range so section reordering
    // cannot collide with the per-version unique display-order constraint.
    if ($existingById !== []) {
        $db->prepare(
            'UPDATE survey_sections SET display_order = display_order + 100000 WHERE survey_id = :survey_id'
        )->execute([':survey_id' => $surveyId]);
    }

    $result = [];
    $usedSectionIds = [];
    $displayOrder = 0;
    foreach ($questions as $question) {
        $title = trim((string)($question['section'] ?? ''));
        if ($title === '') {
            continue;
        }
        $normalized = gradtrack_survey_normalize_metadata_text($title);
        if (isset($result[$normalized])) {
            continue;
        }
        $displayOrder++;
        $requestedSectionId = (int)($question['section_id'] ?? 0);
        $section = $requestedSectionId > 0
            && isset($existingById[$requestedSectionId])
            && !isset($usedSectionIds[$requestedSectionId])
                ? $existingById[$requestedSectionId]
                : ($existingByTitle[$normalized] ?? null);
        if ($section !== null && !isset($usedSectionIds[(int)$section['id']])) {
            $update->execute([
                ':title' => $title,
                ':display_order' => $displayOrder,
                ':id' => (int)$section['id'],
                ':survey_id' => $surveyId,
            ]);
            $result[$normalized] = (int)$section['id'];
            $usedSectionIds[(int)$section['id']] = true;
            continue;
        }

        $insert->execute([
            ':survey_id' => $surveyId,
            ':section_key' => gradtrack_survey_uuid(),
            ':title' => $title,
            ':display_order' => $displayOrder,
        ]);
        $result[$normalized] = (int)$db->lastInsertId();
        $usedSectionIds[$result[$normalized]] = true;
    }

    return $result;
}

function gradtrack_survey_sync_question_options(
    PDO $db,
    int $questionId,
    string $questionKey,
    array $options,
    ?int $sourceQuestionId = null
): void {
    $existing = [];
    if ($sourceQuestionId !== null) {
        $source = $db->prepare(
            'SELECT option_key, option_value, label FROM survey_question_options
             WHERE survey_question_id = :question_id ORDER BY sort_order, id'
        );
        $source->execute([':question_id' => $sourceQuestionId]);
        foreach ($source->fetchAll(PDO::FETCH_ASSOC) as $option) {
            $existing[gradtrack_survey_normalize_metadata_text($option['label'])] = $option;
        }
    } else {
        $current = $db->prepare(
            'SELECT option_key, option_value, label FROM survey_question_options
             WHERE survey_question_id = :question_id ORDER BY sort_order, id'
        );
        $current->execute([':question_id' => $questionId]);
        foreach ($current->fetchAll(PDO::FETCH_ASSOC) as $option) {
            $existing[gradtrack_survey_normalize_metadata_text($option['label'])] = $option;
        }
    }

    $delete = $db->prepare('DELETE FROM survey_question_options WHERE survey_question_id = :question_id');
    $delete->execute([':question_id' => $questionId]);
    $insert = $db->prepare(
        'INSERT INTO survey_question_options
         (survey_question_id, option_key, option_value, label, sort_order)
         VALUES (:question_id, :option_key, :option_value, :label, :sort_order)'
    );
    foreach (array_values($options) as $index => $label) {
        $normalized = gradtrack_survey_normalize_metadata_text($label);
        $prior = $existing[$normalized] ?? null;
        $insert->execute([
            ':question_id' => $questionId,
            ':option_key' => $prior['option_key'] ?? gradtrack_survey_uuid(),
            ':option_value' => $prior['option_value'] ?? trim((string)$label),
            ':label' => trim((string)$label),
            ':sort_order' => $index + 1,
        ]);
    }
}

function gradtrack_survey_hydrate_normalized_answers(PDO $db, array $responses): array
{
    if ($responses === []) {
        return $responses;
    }

    $responseIndexes = [];
    $ids = [];
    foreach ($responses as $index => $response) {
        $id = (int)($response['response_id'] ?? $response['id'] ?? 0);
        if ($id > 0) {
            $ids[] = $id;
            $responseIndexes[$id] = $index;
            $responses[$index]['normalized_answers'] = [];
        }
    }
    if ($ids === []) {
        return $responses;
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $statement = $db->prepare(
        "SELECT survey_response_id, survey_question_id, answer_value, is_canonical
         FROM survey_response_answers
         WHERE survey_response_id IN ($placeholders)
         ORDER BY survey_response_id, is_canonical ASC, id ASC"
    );
    $statement->execute($ids);
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $answer) {
        $responseId = (int)$answer['survey_response_id'];
        if (!isset($responseIndexes[$responseId])) {
            continue;
        }
        $decoded = json_decode((string)$answer['answer_value'], true);
        $responses[$responseIndexes[$responseId]]['normalized_answers'][(string)$answer['survey_question_id']] = $decoded;
    }

    return $responses;
}

function gradtrack_survey_response_answer_map(array $questions, array $response): array
{
    if (
        isset($response['normalized_answers'])
        && is_array($response['normalized_answers'])
        && $response['normalized_answers'] !== []
    ) {
        $answers = [];
        foreach ($questions as $question) {
            $questionId = (string)($question['id'] ?? '');
            if ($questionId !== '') {
                $answers[$questionId] = $response['normalized_answers'][$questionId] ?? null;
            }
        }
        return $answers;
    }

    $data = json_decode((string)($response['responses'] ?? ''), true);
    if (!is_array($data)) {
        return [];
    }

    // Backward-compatible JSON fallback is exact-ID only. Historical offset
    // reconciliation belongs exclusively to the one-time data migration.
    $answers = [];
    foreach ($questions as $question) {
        $questionId = (string)($question['id'] ?? '');
        if ($questionId !== '') {
            $answers[$questionId] = $data[$questionId] ?? null;
        }
    }
    return $answers;
}

function gradtrack_survey_insert_normalized_answers(
    PDO $db,
    int $responseId,
    array $questions,
    array $responses
): void {
    $questionsById = [];
    foreach ($questions as $question) {
        $questionsById[(string)$question['id']] = $question;
    }
    $insert = $db->prepare(
        'INSERT INTO survey_response_answers
         (survey_response_id, survey_question_id, question_key, source_question_id, is_canonical, answer_value)
         VALUES (:response_id, :question_id, :question_key, :source_question_id, 1, :answer_value)'
    );
    foreach ($responses as $questionId => $answer) {
        $questionId = (string)$questionId;
        if (!isset($questionsById[$questionId])) {
            continue;
        }
        $question = $questionsById[$questionId];
        $insert->execute([
            ':response_id' => $responseId,
            ':question_id' => (int)$question['id'],
            ':question_key' => (string)$question['question_key'],
            ':source_question_id' => (int)$question['id'],
            ':answer_value' => json_encode($answer, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
    }
}
