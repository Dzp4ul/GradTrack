<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';

function gradtrack_profile_upload_root(): string
{
    return realpath(__DIR__ . '/../../') . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'profile-images';
}

function gradtrack_profile_upload_relative_path(int $accountId, string $fileName): string
{
    return 'uploads/profile-images/' . $accountId . '/' . $fileName;
}

function gradtrack_cover_upload_root(): string
{
    return realpath(__DIR__ . '/../../') . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'profile-covers';
}

function gradtrack_cover_upload_relative_path(int $accountId, string $fileName): string
{
    return 'uploads/profile-covers/' . $accountId . '/' . $fileName;
}

function gradtrack_profile_create_dir(string $dir): void
{
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
}

function gradtrack_profile_sanitize_filename(string $name): string
{
    $safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', $name);
    return $safe ?: ('profile_' . time());
}

function gradtrack_profile_abs_path_from_rel(string $relativePath): string
{
    return realpath(__DIR__ . '/../../') . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
}

function gradtrack_profile_delete_file(?string $relativePath): void
{
    if (!$relativePath) {
        return;
    }

    $absOld = gradtrack_profile_abs_path_from_rel($relativePath);
    if (is_file($absOld)) {
        @unlink($absOld);
    }
}

function gradtrack_profile_public_graduate_user(PDO $db, int $graduateId): ?array
{
    gradtrack_ensure_graduate_account_verification_schema($db);
    gradtrack_ensure_graduate_profile_image_table($db);
    gradtrack_ensure_graduate_cover_image_table($db);

    $query = "SELECT ga.id AS account_id, ga.email, ga.status, ga.last_login_at,
                     ga.alumni_verification_status, ga.alumni_verification_reason,
                     ga.alumni_verification_reviewed_at, ga.alumni_verification_submitted_at,
                     g.id AS graduate_id, g.student_id, g.first_name, g.middle_name, g.last_name,
                     g.phone, g.year_graduated, g.address,
                     p.id AS program_id, p.name AS program_name, p.code AS program_code,
                     gpi.file_path AS profile_image_path,
                     gci.file_path AS cover_image_path
              FROM graduate_accounts ga
              JOIN graduates g ON ga.graduate_id = g.id
              LEFT JOIN programs p ON g.program_id = p.id
              LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
              LEFT JOIN graduate_cover_images gci ON gci.graduate_account_id = ga.id
              WHERE g.id = :graduate_id
                AND ga.status = 'active'
                AND ga.alumni_verification_status = 'approved'
              ORDER BY ga.id DESC
              LIMIT 1";

    $stmt = $db->prepare($query);
    $stmt->execute([':graduate_id' => $graduateId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        return null;
    }

    return [
        'account_id' => (int) $user['account_id'],
        'graduate_id' => (int) $user['graduate_id'],
        'email' => $user['email'],
        'account_status' => $user['status'],
        'alumni_verification_status' => $user['alumni_verification_status'],
        'alumni_verification_submitted_at' => $user['alumni_verification_submitted_at'],
        'alumni_verification_reviewed_at' => $user['alumni_verification_reviewed_at'],
        'full_name' => trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')),
        'first_name' => $user['first_name'],
        'middle_name' => $user['middle_name'],
        'last_name' => $user['last_name'],
        'student_id' => $user['student_id'],
        'phone' => $user['phone'],
        'year_graduated' => $user['year_graduated'] !== null ? (int) $user['year_graduated'] : null,
        'address' => $user['address'],
        'program_id' => $user['program_id'] !== null ? (int) $user['program_id'] : null,
        'program_name' => $user['program_name'],
        'program_code' => $user['program_code'],
        'profile_image_path' => $user['profile_image_path'] ?? null,
        'cover_image_path' => $user['cover_image_path'] ?? null,
        'role' => 'graduate',
    ];
}

function gradtrack_profile_public_visibility(array $user): array
{
    $publicUser = $user;
    $publicUser['email'] = '';
    $publicUser['phone'] = null;
    $publicUser['address'] = null;
    $publicUser['student_id'] = null;

    return $publicUser;
}

function gradtrack_profile_validate_image_upload(array $file, string $label): array
{
    if ((int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        throw new RuntimeException($label . ' upload failed');
    }

    $maxSizeBytes = 5 * 1024 * 1024;
    $fileSize = (int) ($file['size'] ?? 0);
    if ($fileSize <= 0 || $fileSize > $maxSizeBytes) {
        throw new RuntimeException($label . ' must be between 1 byte and 5 MB');
    }

    $tmpPath = (string) $file['tmp_name'];
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($tmpPath) ?: 'application/octet-stream';
    $allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!in_array($mimeType, $allowedMimes, true)) {
        throw new RuntimeException('Unsupported image type. Allowed: JPG, PNG, WEBP, GIF');
    }

    return [
        'tmp_path' => $tmpPath,
        'mime_type' => $mimeType,
        'file_size' => $fileSize,
        'original_name' => (string) ($file['name'] ?? $label),
    ];
}

function gradtrack_profile_save_image(PDO $db, int $accountId, array $file, string $kind): void
{
    $isCover = $kind === 'cover';
    $label = $isCover ? 'Cover photo' : 'Profile image';
    $validated = gradtrack_profile_validate_image_upload($file, $label);

    $existingSql = $isCover
        ? 'SELECT file_path FROM graduate_cover_images WHERE graduate_account_id = :account_id LIMIT 1'
        : 'SELECT file_path FROM graduate_profile_images WHERE graduate_account_id = :account_id LIMIT 1';
    $existingStmt = $db->prepare($existingSql);
    $existingStmt->bindParam(':account_id', $accountId);
    $existingStmt->execute();
    $existingPath = $existingStmt->fetch(PDO::FETCH_ASSOC)['file_path'] ?? null;

    $uploadRoot = $isCover ? gradtrack_cover_upload_root() : gradtrack_profile_upload_root();
    $accountDir = $uploadRoot . DIRECTORY_SEPARATOR . $accountId;
    gradtrack_profile_create_dir($accountDir);

    $safeOriginalName = gradtrack_profile_sanitize_filename($validated['original_name']);
    $extension = pathinfo($safeOriginalName, PATHINFO_EXTENSION);
    $storedPrefix = $isCover ? 'cover_' : 'profile_';
    $storedName = uniqid($storedPrefix, true) . ($extension ? ('.' . strtolower($extension)) : '');
    $destinationPath = $accountDir . DIRECTORY_SEPARATOR . $storedName;

    if (!move_uploaded_file($validated['tmp_path'], $destinationPath)) {
        throw new RuntimeException('Failed to save uploaded ' . strtolower($label));
    }

    $relativePath = $isCover
        ? gradtrack_cover_upload_relative_path($accountId, $storedName)
        : gradtrack_profile_upload_relative_path($accountId, $storedName);

    $upsertSql = $isCover
        ? "INSERT INTO graduate_cover_images
           (graduate_account_id, file_path, original_file_name, mime_type, file_size_bytes)
           VALUES (:account_id, :file_path, :original_file_name, :mime_type, :file_size_bytes)
           ON DUPLICATE KEY UPDATE
              file_path = VALUES(file_path),
              original_file_name = VALUES(original_file_name),
              mime_type = VALUES(mime_type),
              file_size_bytes = VALUES(file_size_bytes)"
        : "INSERT INTO graduate_profile_images
           (graduate_account_id, file_path, original_file_name, mime_type, file_size_bytes)
           VALUES (:account_id, :file_path, :original_file_name, :mime_type, :file_size_bytes)
           ON DUPLICATE KEY UPDATE
              file_path = VALUES(file_path),
              original_file_name = VALUES(original_file_name),
              mime_type = VALUES(mime_type),
              file_size_bytes = VALUES(file_size_bytes)";

    $upsertStmt = $db->prepare($upsertSql);
    $upsertStmt->execute([
        ':account_id' => $accountId,
        ':file_path' => $relativePath,
        ':original_file_name' => $validated['original_name'],
        ':mime_type' => $validated['mime_type'],
        ':file_size_bytes' => $validated['file_size'],
    ]);

    gradtrack_profile_delete_file($existingPath);
}

function gradtrack_profile_remove_cover_image(PDO $db, int $accountId): void
{
    $existingStmt = $db->prepare('SELECT file_path FROM graduate_cover_images WHERE graduate_account_id = :account_id LIMIT 1');
    $existingStmt->execute([':account_id' => $accountId]);
    $existingPath = $existingStmt->fetch(PDO::FETCH_ASSOC)['file_path'] ?? null;

    $deleteStmt = $db->prepare('DELETE FROM graduate_cover_images WHERE graduate_account_id = :account_id');
    $deleteStmt->execute([':account_id' => $accountId]);

    gradtrack_profile_delete_file($existingPath);
}

function gradtrack_profile_normalize_label($value): string
{
    $text = strtolower(trim((string) ($value ?? '')));
    $text = preg_replace('/[^a-z0-9]+/', ' ', $text);
    return trim((string) $text);
}

function gradtrack_profile_answer_text($value): string
{
    if (is_array($value)) {
        $parts = [];
        foreach ($value as $item) {
            $text = gradtrack_profile_answer_text($item);
            if ($text !== '') {
                $parts[] = $text;
            }
        }
        return trim(implode(', ', $parts));
    }

    return trim((string) ($value ?? ''));
}

function gradtrack_profile_answer_values($value): array
{
    if (is_array($value)) {
        $values = [];
        foreach ($value as $item) {
            foreach (gradtrack_profile_answer_values($item) as $nested) {
                $values[] = $nested;
            }
        }
        return array_values(array_filter($values, static fn($item) => trim((string) $item) !== ''));
    }

    $text = trim((string) ($value ?? ''));
    if ($text === '') {
        return [];
    }

    $lines = preg_split('/\r\n|\r|\n/', $text) ?: [$text];
    return array_values(array_filter(array_map('trim', $lines), static fn($item) => $item !== ''));
}

function gradtrack_profile_is_meaningful_answer($value): bool
{
    $text = gradtrack_profile_normalize_label(gradtrack_profile_answer_text($value));
    if ($text === '') {
        return false;
    }

    return !in_array($text, [
        'n a',
        'na',
        'none',
        'not applicable',
        'no training',
        'no trainings',
        'no seminar',
        'no seminars',
        'no training attended',
        'no trainings attended',
        'not provided',
        'not specified',
        '0000 00 00',
    ], true);
}

function gradtrack_profile_collect_question_keys(array $decodedResponses): array
{
    $keys = [];
    foreach (array_keys($decodedResponses) as $key) {
        $stringKey = (string) $key;
        if ($stringKey !== '' && ctype_digit($stringKey)) {
            $keys[(int) $stringKey] = (int) $stringKey;
        }
    }

    sort($keys, SORT_NUMERIC);
    return array_values($keys);
}

function gradtrack_profile_allows_historical_fallback(array $questions, array $decodedResponses): bool
{
    $questionIdSet = [];
    foreach ($questions as $question) {
        $questionId = (string) ($question['id'] ?? '');
        if ($questionId !== '' && ctype_digit($questionId)) {
            $questionIdSet[$questionId] = true;
        }
    }

    $numericResponseKeys = [];
    $exactQuestionKeyHits = 0;
    foreach (array_keys($decodedResponses) as $responseKey) {
        $responseKeyString = (string) $responseKey;
        if (!ctype_digit($responseKeyString)) {
            continue;
        }

        $numericResponseKeys[$responseKeyString] = true;
        if (isset($questionIdSet[$responseKeyString])) {
            $exactQuestionKeyHits++;
        }
    }

    $numericKeyCount = count($numericResponseKeys);
    if ($numericKeyCount === 0) {
        return false;
    }

    return ($exactQuestionKeyHits / $numericKeyCount) < 0.5;
}

function gradtrack_profile_build_question_key_map(array $questions, array $decodedResponses): array
{
    $map = [];
    foreach ($questions as $question) {
        $questionId = (string) ($question['id'] ?? '');
        if ($questionId !== '' && ctype_digit($questionId)) {
            $map[$questionId] = [$questionId];
        }
    }

    $responseKeys = gradtrack_profile_collect_question_keys($decodedResponses);
    if (empty($map) || empty($responseKeys) || !gradtrack_profile_allows_historical_fallback($questions, $decodedResponses)) {
        return $map;
    }

    usort($questions, static function ($a, $b) {
        return ((int) ($a['sort_order'] ?? 0)) <=> ((int) ($b['sort_order'] ?? 0));
    });

    $firstQuestion = $questions[0] ?? null;
    if ($firstQuestion === null || !isset($firstQuestion['id'])) {
        return $map;
    }

    $firstQuestionId = (int) $firstQuestion['id'];
    $firstSortOrder = (int) ($firstQuestion['sort_order'] ?? 0);
    $firstResponseKey = (int) min($responseKeys);
    $idOffset = $firstQuestionId - $firstResponseKey;

    foreach ($questions as $question) {
        $questionId = (string) ($question['id'] ?? '');
        if ($questionId === '' || !isset($map[$questionId])) {
            continue;
        }

        $historicalKeys = [
            (int) $question['id'] - $idOffset,
            $firstResponseKey + ((int) ($question['sort_order'] ?? 0) - $firstSortOrder),
        ];

        foreach ($historicalKeys as $historicalKey) {
            if ($historicalKey <= 0) {
                continue;
            }

            $historicalKeyString = (string) $historicalKey;
            if (!in_array($historicalKeyString, $map[$questionId], true)) {
                $map[$questionId][] = $historicalKeyString;
            }
        }
    }

    return $map;
}

function gradtrack_profile_answer_for_question(array $decodedResponses, array $questionKeyMap, array $question)
{
    $questionId = (string) ($question['id'] ?? '');
    $keys = $questionKeyMap[$questionId] ?? [$questionId];

    foreach ($keys as $key) {
        if (array_key_exists($key, $decodedResponses)) {
            return $decodedResponses[$key];
        }
    }

    return null;
}

function gradtrack_profile_question_matches(array $question, array $sectionNeedles, array $textNeedles): bool
{
    $section = gradtrack_profile_normalize_label($question['section'] ?? '');
    $text = gradtrack_profile_normalize_label($question['question_text'] ?? '');

    foreach ($sectionNeedles as $needle) {
        $normalized = gradtrack_profile_normalize_label($needle);
        if ($normalized !== '' && strpos($section, $normalized) === false) {
            return false;
        }
    }

    foreach ($textNeedles as $needle) {
        $normalized = gradtrack_profile_normalize_label($needle);
        if ($normalized !== '' && strpos($text, $normalized) === false) {
            return false;
        }
    }

    return true;
}

function gradtrack_profile_find_question(array $questions, array $sectionNeedles, array $textNeedles): ?array
{
    foreach ($questions as $question) {
        if (gradtrack_profile_question_matches($question, $sectionNeedles, $textNeedles)) {
            return $question;
        }
    }

    return null;
}

function gradtrack_profile_field_from_question(
    array $questions,
    array $decodedResponses,
    array $questionKeyMap,
    string $key,
    string $label,
    array $sectionNeedles,
    array $textNeedleGroups
): ?array {
    foreach ($textNeedleGroups as $textNeedles) {
        $question = gradtrack_profile_find_question($questions, $sectionNeedles, $textNeedles);
        if (!$question) {
            continue;
        }

        $answer = gradtrack_profile_answer_for_question($decodedResponses, $questionKeyMap, $question);
        if (!gradtrack_profile_is_meaningful_answer($answer)) {
            continue;
        }

        return [
            'key' => $key,
            'label' => $label,
            'value' => gradtrack_profile_answer_text($answer),
            'question_id' => (int) ($question['id'] ?? 0),
            'question_text' => (string) ($question['question_text'] ?? $label),
        ];
    }

    return null;
}

function gradtrack_profile_make_field(string $key, string $label, $value, ?int $questionId = null, ?string $questionText = null): ?array
{
    if (!gradtrack_profile_is_meaningful_answer($value)) {
        return null;
    }

    $field = [
        'key' => $key,
        'label' => $label,
        'value' => gradtrack_profile_answer_text($value),
    ];

    if ($questionId !== null && $questionId > 0) {
        $field['question_id'] = $questionId;
    }

    if ($questionText !== null && trim($questionText) !== '') {
        $field['question_text'] = $questionText;
    }

    return $field;
}

function gradtrack_profile_compact_fields(array $fields): array
{
    return array_values(array_filter($fields, static fn($field) => is_array($field) && trim((string) ($field['value'] ?? '')) !== ''));
}

function gradtrack_profile_field_value(?array $field): ?string
{
    if (!$field || !gradtrack_profile_is_meaningful_answer($field['value'] ?? null)) {
        return null;
    }

    return trim((string) $field['value']);
}

function gradtrack_profile_is_self_employed_value($value): bool
{
    $text = gradtrack_profile_normalize_label(gradtrack_profile_answer_text($value));
    return strpos($text, 'self employed') !== false || strpos($text, 'freelance') !== false;
}

function gradtrack_profile_is_unemployed_value($value): bool
{
    $text = gradtrack_profile_normalize_label(gradtrack_profile_answer_text($value));
    return $text === 'unemployed'
        || $text === 'not employed'
        || strpos($text, 'not yet employed') !== false;
}

function gradtrack_profile_is_employed_status_value($value): bool
{
    $text = gradtrack_profile_normalize_label(gradtrack_profile_answer_text($value));
    return $text === 'employed'
        || $text === 'currently employed'
        || $text === 'regular permanent'
        || $text === 'temporary'
        || $text === 'contractual'
        || $text === 'casual'
        || gradtrack_profile_is_self_employed_value($value);
}

function gradtrack_profile_is_generic_employment_type($value): bool
{
    $text = gradtrack_profile_normalize_label(gradtrack_profile_answer_text($value));
    return in_array($text, [
        'yes',
        'no',
        'employed',
        'currently employed',
        'unemployed',
        'not employed',
    ], true);
}

function gradtrack_profile_valid_job_title($value): ?string
{
    if (!gradtrack_profile_is_meaningful_answer($value)) {
        return null;
    }

    $text = trim(gradtrack_profile_answer_text($value));
    $normalized = gradtrack_profile_normalize_label($text);
    $invalidTitles = [
        'yes',
        'no',
        'employed',
        'currently employed',
        'unemployed',
        'not employed',
        'regular permanent',
        'temporary',
        'communication problem solving and teamwork skills',
        'communication skills',
        'critical thinking',
        'career growth opportunities',
        'work environment',
        'career advancement',
        'professional growth',
        'family concern',
        'no job opportunity',
        'salaries and benefits',
        'career challenge',
        'better salary',
    ];

    if (in_array($normalized, $invalidTitles, true)) {
        return null;
    }

    if (strpos($normalized, ' skills') !== false || strpos($normalized, 'reason') !== false) {
        return null;
    }

    return $text;
}

function gradtrack_profile_database_employment(PDO $db, int $graduateId): ?array
{
    $stmt = $db->prepare('SELECT company_name, job_title, industry, employment_status, is_aligned, date_hired
                          FROM employment
                          WHERE graduate_id = :graduate_id
                          ORDER BY updated_at DESC, id DESC
                          LIMIT 1');
    $stmt->execute([':graduate_id' => $graduateId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
}

function gradtrack_profile_database_text(?array $row, string $key): ?string
{
    if (!$row || !array_key_exists($key, $row)) {
        return null;
    }

    return gradtrack_profile_is_meaningful_answer($row[$key]) ? trim((string) $row[$key]) : null;
}

function gradtrack_profile_database_date(?array $row, string $key): ?string
{
    $value = gradtrack_profile_database_text($row, $key);
    if ($value === null || $value === '0000-00-00') {
        return null;
    }

    return $value;
}

function gradtrack_profile_alignment_label(?string $value): ?string
{
    $normalized = gradtrack_profile_normalize_label($value);
    if ($normalized === 'aligned') {
        return 'Related to Degree';
    }
    if ($normalized === 'partially aligned') {
        return 'Partially Related to Degree';
    }
    if ($normalized === 'not aligned') {
        return 'Not Related to Degree';
    }

    return null;
}

function gradtrack_profile_is_yes($value): bool
{
    $text = gradtrack_profile_normalize_label(gradtrack_profile_answer_text($value));
    return $text === 'yes' || strpos($text, 'yes ') === 0 || strpos($text, ' yes') !== false;
}

function gradtrack_profile_is_no($value): bool
{
    $text = gradtrack_profile_normalize_label(gradtrack_profile_answer_text($value));
    return $text === 'no' || strpos($text, 'no ') === 0 || strpos($text, ' not ') !== false;
}

function gradtrack_profile_build_training_entries(array $questions, array $decodedResponses, array $questionKeyMap): array
{
    $titleQuestion = gradtrack_profile_find_question($questions, ['Trainings'], ['title']);
    $durationQuestion = gradtrack_profile_find_question($questions, ['Trainings'], ['duration']);
    $institutionQuestion = gradtrack_profile_find_question($questions, ['Trainings'], ['institution']);
    $dateQuestion = gradtrack_profile_find_question($questions, ['Trainings'], ['date']);
    $locationQuestion = gradtrack_profile_find_question($questions, ['Trainings'], ['location']);
    $descriptionQuestion = gradtrack_profile_find_question($questions, ['Trainings'], ['description']);
    $certificateQuestion = gradtrack_profile_find_question($questions, ['Trainings'], ['certificate']);

    $answers = [
        'title' => $titleQuestion ? gradtrack_profile_answer_values(gradtrack_profile_answer_for_question($decodedResponses, $questionKeyMap, $titleQuestion)) : [],
        'duration' => $durationQuestion ? gradtrack_profile_answer_values(gradtrack_profile_answer_for_question($decodedResponses, $questionKeyMap, $durationQuestion)) : [],
        'organizer' => $institutionQuestion ? gradtrack_profile_answer_values(gradtrack_profile_answer_for_question($decodedResponses, $questionKeyMap, $institutionQuestion)) : [],
        'date' => $dateQuestion ? gradtrack_profile_answer_values(gradtrack_profile_answer_for_question($decodedResponses, $questionKeyMap, $dateQuestion)) : [],
        'location' => $locationQuestion ? gradtrack_profile_answer_values(gradtrack_profile_answer_for_question($decodedResponses, $questionKeyMap, $locationQuestion)) : [],
        'description' => $descriptionQuestion ? gradtrack_profile_answer_values(gradtrack_profile_answer_for_question($decodedResponses, $questionKeyMap, $descriptionQuestion)) : [],
        'certificate' => $certificateQuestion ? gradtrack_profile_answer_values(gradtrack_profile_answer_for_question($decodedResponses, $questionKeyMap, $certificateQuestion)) : [],
    ];

    $count = max(array_map('count', $answers) ?: [0]);
    $entries = [];

    for ($index = 0; $index < $count; $index++) {
        $entry = [];
        foreach ($answers as $key => $values) {
            $value = trim((string) ($values[$index] ?? ($index === 0 ? ($values[0] ?? '') : '')));
            if ($value !== '' && gradtrack_profile_is_meaningful_answer($value)) {
                $entry[$key] = $value;
            }
        }

        if (!empty($entry)) {
            $entry['id'] = $index + 1;
            $entries[] = $entry;
        }
    }

    return $entries;
}

function gradtrack_profile_latest_survey(PDO $db, int $graduateId, int $accountId): ?array
{
    $accountStmt = $db->prepare('SELECT source_survey_response_id FROM graduate_accounts WHERE id = :account_id LIMIT 1');
    $accountStmt->execute([':account_id' => $accountId]);
    $sourceResponseId = (int) ($accountStmt->fetch(PDO::FETCH_ASSOC)['source_survey_response_id'] ?? 0);

    if ($sourceResponseId > 0) {
        $sourceStmt = $db->prepare("SELECT sr.*, s.title AS survey_title
                                    FROM survey_responses sr
                                    LEFT JOIN surveys s ON s.id = sr.survey_id
                                    WHERE sr.id = :response_id
                                      AND (sr.graduate_id = :graduate_id OR sr.graduate_account_id = :account_id)
                                      AND sr.submitted_at IS NOT NULL
                                    LIMIT 1");
        $sourceStmt->execute([
            ':response_id' => $sourceResponseId,
            ':graduate_id' => $graduateId,
            ':account_id' => $accountId,
        ]);
        $source = $sourceStmt->fetch(PDO::FETCH_ASSOC);
        if ($source) {
            return $source;
        }
    }

    $stmt = $db->prepare("SELECT sr.*, s.title AS survey_title
                          FROM survey_responses sr
                          LEFT JOIN surveys s ON s.id = sr.survey_id
                          WHERE (sr.graduate_id = :graduate_id OR sr.graduate_account_id = :account_id)
                            AND sr.submitted_at IS NOT NULL
                          ORDER BY sr.submitted_at DESC, sr.id DESC
                          LIMIT 1");
    $stmt->execute([
        ':graduate_id' => $graduateId,
        ':account_id' => $accountId,
    ]);

    $response = $stmt->fetch(PDO::FETCH_ASSOC);
    return $response ?: null;
}

function gradtrack_profile_survey_data(PDO $db, array $user): ?array
{
    $response = gradtrack_profile_latest_survey($db, (int) $user['graduate_id'], (int) $user['account_id']);
    if (!$response) {
        return null;
    }

    $decodedResponses = json_decode((string) ($response['responses'] ?? '{}'), true);
    if (!is_array($decodedResponses)) {
        $decodedResponses = [];
    }

    $questionStmt = $db->prepare('SELECT id, section, question_text, question_type, sort_order
                                  FROM survey_questions
                                  WHERE survey_id = :survey_id
                                  ORDER BY sort_order ASC, id ASC');
    $questionStmt->execute([':survey_id' => (int) $response['survey_id']]);
    $questions = $questionStmt->fetchAll(PDO::FETCH_ASSOC);
    $questionKeyMap = gradtrack_profile_build_question_key_map($questions, $decodedResponses);

    $employmentRow = gradtrack_profile_database_employment($db, (int) $user['graduate_id']);
    $currentlyEmployedField = gradtrack_profile_field_from_question($questions, $decodedResponses, $questionKeyMap, 'currently_employed', 'Currently Employed', ['Employment'], [['presently employed'], ['are you employed']]);
    $employmentTypeField = gradtrack_profile_field_from_question($questions, $decodedResponses, $questionKeyMap, 'employment_type', 'Employment Type', ['Employment'], [['present employment status'], ['employment status']]);
    $occupationField = gradtrack_profile_field_from_question($questions, $decodedResponses, $questionKeyMap, 'current_job_title', 'Current Job Title / Position', ['Employment'], [['present occupation'], ['current position'], ['current job title'], ['position designation']]);
    $companyField = gradtrack_profile_field_from_question($questions, $decodedResponses, $questionKeyMap, 'company', 'Company / Organization', ['Employment'], [['company organization'], ['organization name'], ['company name']]);
    $industryField = gradtrack_profile_field_from_question($questions, $decodedResponses, $questionKeyMap, 'industry', 'Industry / Line of Business', ['Employment'], [['major line of business'], ['industry sector'], ['industry']]);
    $locationField = gradtrack_profile_field_from_question($questions, $decodedResponses, $questionKeyMap, 'company_location', 'Work Location', ['Employment'], [['company address'], ['place of work'], ['work location'], ['location']]);
    $dateStartedField = gradtrack_profile_field_from_question($questions, $decodedResponses, $questionKeyMap, 'date_started', 'Date Started', ['Employment'], [['date started'], ['start date']]);
    $jobRelevanceField = gradtrack_profile_field_from_question($questions, $decodedResponses, $questionKeyMap, 'job_related_to_program', 'Job Relevance', ['Employment'], [['first job related'], ['current job related'], ['job related to your course'], ['related to the course']]);
    $selfEmployedSkillsField = gradtrack_profile_field_from_question($questions, $decodedResponses, $questionKeyMap, 'self_employed_skills', 'Skills Used', ['Employment'], [['self employed'], ['skills acquired']]);
    $competenciesField = gradtrack_profile_field_from_question($questions, $decodedResponses, $questionKeyMap, 'skills_used', 'Skills Used', ['Employment'], [['competencies were useful']]);
    $unemploymentReasonsField = gradtrack_profile_field_from_question($questions, $decodedResponses, $questionKeyMap, 'unemployment_reasons', 'Reason Not Yet Employed', ['Employment'], [['reason', 'not yet employed']]);

    $isEmployed = null;
    $currentlyEmployedValue = gradtrack_profile_field_value($currentlyEmployedField);
    $employmentTypeValue = gradtrack_profile_field_value($employmentTypeField);

    if ($currentlyEmployedValue !== null) {
        if (gradtrack_profile_is_yes($currentlyEmployedValue) || gradtrack_profile_is_employed_status_value($currentlyEmployedValue)) {
            $isEmployed = true;
        } elseif (gradtrack_profile_is_no($currentlyEmployedValue) || gradtrack_profile_is_unemployed_value($currentlyEmployedValue)) {
            $isEmployed = false;
        }
    }

    if ($isEmployed === null && $employmentTypeValue !== null) {
        if (gradtrack_profile_is_unemployed_value($employmentTypeValue)) {
            $isEmployed = false;
        } elseif (gradtrack_profile_is_employed_status_value($employmentTypeValue)) {
            $isEmployed = true;
        }
    }

    $databaseEmploymentStatus = gradtrack_profile_database_text($employmentRow, 'employment_status');
    if ($isEmployed === null && $databaseEmploymentStatus !== null) {
        if (gradtrack_profile_is_unemployed_value($databaseEmploymentStatus)) {
            $isEmployed = false;
        } elseif (gradtrack_profile_is_employed_status_value($databaseEmploymentStatus)) {
            $isEmployed = true;
        }
    }

    $employmentStatusText = null;
    if ($isEmployed === true) {
        $employmentStatusText = 'Currently Employed';
    } elseif ($isEmployed === false) {
        $employmentStatusText = 'Not Employed';
    } elseif ($currentlyEmployedValue !== null) {
        $employmentStatusText = $currentlyEmployedValue;
    }

    if ($employmentTypeValue !== null && gradtrack_profile_is_generic_employment_type($employmentTypeValue)) {
        $employmentTypeValue = null;
    }

    $databaseJobTitle = gradtrack_profile_valid_job_title(gradtrack_profile_database_text($employmentRow, 'job_title'));
    $surveyJobTitle = gradtrack_profile_valid_job_title(gradtrack_profile_field_value($occupationField));
    $currentJobTitle = $isEmployed === false ? null : ($databaseJobTitle ?: $surveyJobTitle);
    $company = $isEmployed === false ? null : (gradtrack_profile_database_text($employmentRow, 'company_name') ?: gradtrack_profile_field_value($companyField));
    $industry = $isEmployed === false ? null : (gradtrack_profile_database_text($employmentRow, 'industry') ?: gradtrack_profile_field_value($industryField));
    $location = $isEmployed === false ? null : gradtrack_profile_field_value($locationField);
    $startDate = $isEmployed === false ? null : (gradtrack_profile_database_date($employmentRow, 'date_hired') ?: gradtrack_profile_field_value($dateStartedField));
    $jobRelevance = $isEmployed === false ? null : (gradtrack_profile_field_value($jobRelevanceField) ?: gradtrack_profile_alignment_label(gradtrack_profile_database_text($employmentRow, 'is_aligned')));
    $skillsUsed = $isEmployed === false ? null : gradtrack_profile_field_value($competenciesField);
    if ($skillsUsed === null && $isEmployed === true && (gradtrack_profile_is_self_employed_value($employmentTypeValue) || gradtrack_profile_is_self_employed_value($currentJobTitle))) {
        $skillsUsed = gradtrack_profile_field_value($selfEmployedSkillsField);
    }

    $workFields = gradtrack_profile_compact_fields([
        gradtrack_profile_make_field('employment_status', 'Employment Status', $employmentStatusText),
        gradtrack_profile_make_field('current_job_title', 'Job Position', $currentJobTitle),
        gradtrack_profile_make_field('company', 'Company / Organization', $company),
        gradtrack_profile_make_field('employment_type', 'Employment Type', $employmentTypeValue),
        gradtrack_profile_make_field('date_started', 'Start Date', $startDate),
        gradtrack_profile_make_field('company_location', 'Location', $location),
        gradtrack_profile_make_field('job_related_to_program', 'Job Relevance', $jobRelevance),
        gradtrack_profile_make_field('industry', 'Industry', $industry),
        gradtrack_profile_make_field('skills_used', 'Skills Used', $skillsUsed),
        $isEmployed === false ? gradtrack_profile_make_field('unemployment_reasons', 'Reason Not Yet Employed', gradtrack_profile_field_value($unemploymentReasonsField)) : null,
    ]);

    $educationFields = gradtrack_profile_compact_fields([
        gradtrack_profile_field_from_question($questions, $decodedResponses, $questionKeyMap, 'degree_program', 'Degree / Program', ['Educational'], [['degree program']]),
        gradtrack_profile_field_from_question($questions, $decodedResponses, $questionKeyMap, 'year_graduated', 'Graduation Year', ['Educational'], [['year graduated']]),
    ]);

    $graduateStudyFields = gradtrack_profile_compact_fields([
        gradtrack_profile_field_from_question($questions, $decodedResponses, $questionKeyMap, 'graduate_program', 'Graduate Program', ['Graduate Studies'], [['name of graduate program'], ['graduate program']]),
        gradtrack_profile_field_from_question($questions, $decodedResponses, $questionKeyMap, 'college_university', 'College / University', ['Graduate Studies'], [['college university'], ['college'], ['university']]),
        gradtrack_profile_field_from_question($questions, $decodedResponses, $questionKeyMap, 'earned_units', 'Earned Units', ['Graduate Studies'], [['earned units']]),
    ]);

    return [
        'response' => [
            'id' => (int) $response['id'],
            'survey_id' => (int) $response['survey_id'],
            'survey_title' => $response['survey_title'] ?? 'Graduate Tracer Survey',
            'submitted_at' => $response['submitted_at'],
        ],
        'work' => [
            'is_employed' => $isEmployed,
            'summary' => [
                'employment_status' => $employmentStatusText,
                'employment_type' => $employmentTypeValue,
                'current_job_title' => $currentJobTitle,
                'company' => $company,
                'industry' => $industry,
                'location' => $location,
                'start_date' => $startDate,
                'job_related_to_program' => $jobRelevance,
                'skills_used' => $skillsUsed,
            ],
            'fields' => $workFields,
        ],
        'education' => [
            'fields' => $educationFields,
            'graduate_studies' => $graduateStudyFields,
        ],
        'trainings' => gradtrack_profile_build_training_entries($questions, $decodedResponses, $questionKeyMap),
    ];
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    $user = gradtrack_require_graduate_auth($db);
    $accountId = (int) $user['account_id'];
    $graduateId = (int) $user['graduate_id'];

    if ($method === 'GET') {
        $currentUser = gradtrack_current_graduate_user($db);
        $targetGraduateId = isset($_GET['graduate_id']) ? (int) $_GET['graduate_id'] : $graduateId;

        if ($targetGraduateId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid graduate_id']);
            exit;
        }

        $isSelf = $targetGraduateId === $graduateId;
        $profileUser = $isSelf ? $currentUser : gradtrack_profile_public_graduate_user($db, $targetGraduateId);

        if (!$profileUser) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Graduate profile not found']);
            exit;
        }

        echo json_encode([
            'success' => true,
            'data' => [
                'user' => $isSelf ? $profileUser : gradtrack_profile_public_visibility($profileUser),
                'survey_profile' => gradtrack_profile_survey_data($db, $profileUser),
                'is_self' => $isSelf,
                'viewer_graduate_id' => $graduateId,
            ],
        ]);
        exit;
    }

    if ($method === 'POST') {
        $firstName = isset($_POST['first_name']) ? trim((string) $_POST['first_name']) : (string) ($user['first_name'] ?? '');
        $middleName = isset($_POST['middle_name']) ? trim((string) $_POST['middle_name']) : (string) ($user['middle_name'] ?? '');
        $lastName = isset($_POST['last_name']) ? trim((string) $_POST['last_name']) : (string) ($user['last_name'] ?? '');
        $email = isset($_POST['email']) ? trim((string) $_POST['email']) : (string) ($user['email'] ?? '');
        $phone = isset($_POST['phone']) ? trim((string) $_POST['phone']) : (string) ($user['phone'] ?? '');
        $address = isset($_POST['address']) ? trim((string) $_POST['address']) : (string) ($user['address'] ?? '');
        $currentPassword = isset($_POST['current_password']) ? (string) $_POST['current_password'] : '';
        $password = isset($_POST['password']) ? (string) $_POST['password'] : '';

        if ($firstName === '' || $lastName === '' || $email === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'first_name, last_name, and email are required']);
            exit;
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid email format']);
            exit;
        }

        $dupStmt = $db->prepare('SELECT id FROM graduate_accounts WHERE email = :email AND id <> :account_id LIMIT 1');
        $dupStmt->bindParam(':email', $email);
        $dupStmt->bindParam(':account_id', $accountId);
        $dupStmt->execute();
        if ($dupStmt->fetch(PDO::FETCH_ASSOC)) {
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => 'Email is already in use by another account']);
            exit;
        }

        if ($password !== '') {
            if ($currentPassword === '') {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Current password is required to set a new password']);
                exit;
            }

            $passwordStmt = $db->prepare('SELECT password_hash FROM graduate_accounts WHERE id = :account_id LIMIT 1');
            $passwordStmt->bindParam(':account_id', $accountId);
            $passwordStmt->execute();
            $storedPassword = (string) ($passwordStmt->fetch(PDO::FETCH_ASSOC)['password_hash'] ?? '');

            if (!password_verify($currentPassword, $storedPassword)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Current password is incorrect']);
                exit;
            }

            if (!preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/', $password)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol']);
                exit;
            }
        }

        $db->beginTransaction();

        $updateGraduate = $db->prepare('UPDATE graduates
                                        SET first_name = :first_name,
                                            middle_name = :middle_name,
                                            last_name = :last_name,
                                            email = :email,
                                            phone = :phone,
                                            address = :address
                                        WHERE id = :graduate_id');
        $updateGraduate->bindParam(':first_name', $firstName);
        $updateGraduate->bindParam(':middle_name', $middleName);
        $updateGraduate->bindParam(':last_name', $lastName);
        $updateGraduate->bindParam(':email', $email);
        $updateGraduate->bindParam(':phone', $phone);
        $updateGraduate->bindParam(':address', $address);
        $updateGraduate->bindParam(':graduate_id', $graduateId);
        $updateGraduate->execute();

        $updateAccount = $db->prepare('UPDATE graduate_accounts SET email = :email WHERE id = :account_id');
        $updateAccount->bindParam(':email', $email);
        $updateAccount->bindParam(':account_id', $accountId);
        $updateAccount->execute();

        if ($password !== '') {
            $hashed = password_hash($password, PASSWORD_DEFAULT);
            $updatePassword = $db->prepare('UPDATE graduate_accounts SET password_hash = :password_hash WHERE id = :account_id');
            $updatePassword->bindParam(':password_hash', $hashed);
            $updatePassword->bindParam(':account_id', $accountId);
            $updatePassword->execute();
        }

        if (isset($_FILES['profile_image']) && (int) ($_FILES['profile_image']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            gradtrack_profile_save_image($db, $accountId, $_FILES['profile_image'], 'profile');
        }

        $removeCover = isset($_POST['remove_cover_image'])
            && in_array(strtolower((string) $_POST['remove_cover_image']), ['1', 'true', 'yes'], true);

        if ($removeCover) {
            gradtrack_profile_remove_cover_image($db, $accountId);
        }

        if (!$removeCover && isset($_FILES['cover_image']) && (int) ($_FILES['cover_image']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            gradtrack_profile_save_image($db, $accountId, $_FILES['cover_image'], 'cover');
        }

        $db->commit();

        $currentUser = gradtrack_current_graduate_user($db);
        echo json_encode([
            'success' => true,
            'message' => 'Profile updated successfully',
            'data' => [
                'user' => $currentUser,
                'survey_profile' => $currentUser ? gradtrack_profile_survey_data($db, $currentUser) : null,
            ],
        ]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
} catch (Throwable $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
