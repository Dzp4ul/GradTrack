<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/audit_trail.php';
require_once __DIR__ . '/../config/archive.php';
require_once __DIR__ . '/../config/admin_roles.php';
require_once __DIR__ . '/../config/admin_auth.php';
require_once __DIR__ . '/../config/graduation_years.php';
require_once __DIR__ . '/../config/permanent_delete.php';
require_once __DIR__ . '/../config/survey_versioning.php';

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$authenticatedAdmin = gradtrack_current_admin_user($db);
$auditUser = $authenticatedAdmin !== null
    ? gradtrack_admin_audit_context($authenticatedAdmin)
    : ['user_id' => null, 'user_name' => 'Guest', 'user_role' => 'guest', 'department' => null];

function gradtrack_column_exists(PDO $db, string $table, string $column): bool
{
    $stmt = $db->prepare("SHOW COLUMNS FROM `$table` LIKE :column");
    $stmt->execute([':column' => $column]);
    return $stmt->fetch(PDO::FETCH_ASSOC) !== false;
}

function gradtrack_ensure_survey_audit_columns(PDO $db): bool
{
    if (!gradtrack_runtime_schema_changes_allowed()) return false;
    try {
        if (!gradtrack_column_exists($db, 'surveys', 'created_by')) {
            $db->exec("ALTER TABLE surveys ADD COLUMN created_by VARCHAR(255) NULL AFTER created_at");
        }

        if (!gradtrack_column_exists($db, 'surveys', 'modified_by')) {
            $db->exec("ALTER TABLE surveys ADD COLUMN modified_by VARCHAR(255) NULL AFTER created_by");
        }

        if (!gradtrack_column_exists($db, 'surveys', 'modified_at')) {
            $db->exec("ALTER TABLE surveys ADD COLUMN modified_at TIMESTAMP NULL DEFAULT NULL AFTER modified_by");
        }

        return true;
    } catch (Throwable $ignored) {
        return false;
    }
}

function gradtrack_current_admin_display_name(): string
{
    global $authenticatedAdmin;
    $fullName = trim((string) ($authenticatedAdmin['full_name'] ?? ''));
    if ($fullName !== '') {
        return $fullName;
    }

    $username = trim((string) ($authenticatedAdmin['username'] ?? ''));
    if ($username !== '') {
        return $username;
    }

    $email = trim((string) ($authenticatedAdmin['email'] ?? ''));
    if ($email !== '') {
        return $email;
    }

    return 'System';
}

function gradtrack_backfill_survey_audit(PDO $db, string $fallbackName): void
{
    if (!gradtrack_ensure_survey_audit_columns($db)) {
        return;
    }

    $stmt = $db->prepare(
        "UPDATE surveys
         SET
            created_by = COALESCE(NULLIF(TRIM(created_by), ''), :fallback_name),
            modified_by = COALESCE(NULLIF(TRIM(modified_by), ''), NULLIF(TRIM(created_by), ''), :fallback_name),
            modified_at = COALESCE(modified_at, created_at)
         WHERE
            created_by IS NULL OR TRIM(created_by) = ''
            OR modified_by IS NULL OR TRIM(modified_by) = ''
            OR modified_at IS NULL"
    );

    $stmt->execute([':fallback_name' => $fallbackName]);
}

function gradtrack_survey_staff_viewer(): bool
{
    global $authenticatedAdmin;
    return $authenticatedAdmin !== null
        && in_array((string) $authenticatedAdmin['role'], gradtrack_admin_role_values(), true);
}

function gradtrack_survey_manager(): bool
{
    global $authenticatedAdmin;
    return $authenticatedAdmin !== null
        && in_array((string) $authenticatedAdmin['role'], ['admin'], true);
}

function gradtrack_require_survey_manager(): void
{
    global $authenticatedAdmin;
    if ($authenticatedAdmin === null) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Authentication required']);
        exit;
    }
    if (!gradtrack_survey_manager()) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Only authorized administrators can manage surveys']);
        exit;
    }
}

function gradtrack_survey_response_count(PDO $db, int $surveyId): int
{
    $statement = $db->prepare(
        'SELECT COUNT(*) FROM survey_responses WHERE survey_id = :survey_id AND submitted_at IS NOT NULL'
    );
    $statement->execute([':survey_id' => $surveyId]);
    return (int)$statement->fetchColumn();
}

function gradtrack_survey_create_template(PDO $db, string $title, string $description): int
{
    $statement = $db->prepare(
        'INSERT INTO survey_templates (template_key, title, description)
         VALUES (:template_key, :title, :description)'
    );
    $statement->execute([
        ':template_key' => gradtrack_survey_uuid(),
        ':title' => $title,
        ':description' => $description,
    ]);
    return (int)$db->lastInsertId();
}

function gradtrack_survey_insert_question(
    PDO $db,
    int $surveyId,
    array $question,
    int $sortOrder,
    ?int $sectionId,
    bool $seedLegacyAnalytics = false,
    ?int $sourceQuestionId = null
): int {
    $questionKey = trim((string)($question['question_key'] ?? '')) ?: gradtrack_survey_uuid();
    $analyticsKey = trim((string)($question['analytics_key'] ?? ''));
    if ($analyticsKey === '' && $seedLegacyAnalytics) {
        $analyticsKey = gradtrack_survey_legacy_analytics_key($question['question_text'] ?? '') ?? '';
    }

    $statement = $db->prepare(
        'INSERT INTO survey_questions
         (survey_id, section_id, question_key, analytics_key, section, question_text,
          question_type, options, is_required, sort_order, is_active, introduced_at)
         VALUES
         (:survey_id, :section_id, :question_key, :analytics_key, :section, :question_text,
          :question_type, :options, :is_required, :sort_order, 1, NOW())'
    );
    $options = gradtrack_survey_decode_options($question['options'] ?? null);
    $statement->execute([
        ':survey_id' => $surveyId,
        ':section_id' => $sectionId,
        ':question_key' => $questionKey,
        ':analytics_key' => $analyticsKey !== '' ? $analyticsKey : null,
        ':section' => trim((string)($question['section'] ?? '')) ?: null,
        ':question_text' => trim((string)($question['question_text'] ?? '')),
        ':question_type' => $question['question_type'] ?? 'text',
        ':options' => $options !== [] ? json_encode($options, JSON_UNESCAPED_UNICODE) : null,
        ':is_required' => (int)($question['is_required'] ?? 0),
        ':sort_order' => $sortOrder,
    ]);
    $questionId = (int)$db->lastInsertId();
    gradtrack_survey_sync_question_options($db, $questionId, $questionKey, $options, $sourceQuestionId);
    return $questionId;
}

function gradtrack_survey_clone_version(PDO $db, int $sourceSurveyId, string $actorName): array
{
    $sourceStatement = $db->prepare(
        'SELECT * FROM surveys WHERE id = :id AND archived_at IS NULL LIMIT 1 FOR UPDATE'
    );
    $sourceStatement->execute([':id' => $sourceSurveyId]);
    $source = $sourceStatement->fetch(PDO::FETCH_ASSOC);
    if (!$source) {
        throw new RuntimeException('The source survey version is unavailable.');
    }

    $templateId = (int)($source['template_id'] ?? 0);
    if ($templateId <= 0) {
        $templateId = gradtrack_survey_create_template(
            $db,
            (string)$source['title'],
            (string)($source['description'] ?? '')
        );
        $link = $db->prepare('UPDATE surveys SET template_id = :template_id, version_number = 1 WHERE id = :id');
        $link->execute([':template_id' => $templateId, ':id' => $sourceSurveyId]);
    }

    $existingDraft = $db->prepare(
        "SELECT id, version_number FROM surveys
         WHERE template_id = :template_id AND based_on_survey_id = :source_id
           AND status = 'draft' AND archived_at IS NULL
         ORDER BY version_number DESC LIMIT 1"
    );
    $existingDraft->execute([':template_id' => $templateId, ':source_id' => $sourceSurveyId]);
    $draft = $existingDraft->fetch(PDO::FETCH_ASSOC);
    if ($draft && gradtrack_survey_response_count($db, (int)$draft['id']) === 0) {
        return [
            'id' => (int)$draft['id'],
            'version_number' => (int)$draft['version_number'],
            'reused' => true,
        ];
    }

    $versionStatement = $db->prepare(
        'SELECT COALESCE(MAX(version_number), 0) + 1 FROM surveys WHERE template_id = :template_id FOR UPDATE'
    );
    $versionStatement->execute([':template_id' => $templateId]);
    $versionNumber = (int)$versionStatement->fetchColumn();
    $insertSurvey = $db->prepare(
        'INSERT INTO surveys
         (template_id, version_number, based_on_survey_id, title, description, status,
          created_by, modified_by, modified_at)
         VALUES
         (:template_id, :version_number, :based_on_survey_id, :title, :description, \'draft\',
          :created_by, :modified_by, NOW())'
    );
    $insertSurvey->execute([
        ':template_id' => $templateId,
        ':version_number' => $versionNumber,
        ':based_on_survey_id' => $sourceSurveyId,
        ':title' => $source['title'],
        ':description' => $source['description'],
        ':created_by' => $actorName,
        ':modified_by' => $actorName,
    ]);
    $newSurveyId = (int)$db->lastInsertId();

    $questionStatement = $db->prepare(
        'SELECT * FROM survey_questions
         WHERE survey_id = :survey_id AND is_active = 1 ORDER BY sort_order, id'
    );
    $questionStatement->execute([':survey_id' => $sourceSurveyId]);
    $questions = $questionStatement->fetchAll(PDO::FETCH_ASSOC);
    $sectionIds = [];
    $sourceSections = $db->prepare(
        'SELECT section_key, title, display_order FROM survey_sections
         WHERE survey_id = :survey_id ORDER BY display_order, id'
    );
    $sourceSections->execute([':survey_id' => $sourceSurveyId]);
    $insertSection = $db->prepare(
        'INSERT INTO survey_sections (survey_id, section_key, title, display_order)
         VALUES (:survey_id, :section_key, :title, :display_order)'
    );
    foreach ($sourceSections->fetchAll(PDO::FETCH_ASSOC) as $section) {
        $insertSection->execute([
            ':survey_id' => $newSurveyId,
            ':section_key' => $section['section_key'],
            ':title' => $section['title'],
            ':display_order' => (int)$section['display_order'],
        ]);
        $sectionIds[gradtrack_survey_normalize_metadata_text($section['title'])] = (int)$db->lastInsertId();
    }
    if ($sectionIds === []) {
        $sectionIds = gradtrack_survey_sync_sections($db, $newSurveyId, $questions);
    }
    foreach ($questions as $index => $question) {
        $sectionName = gradtrack_survey_normalize_metadata_text($question['section'] ?? '');
        gradtrack_survey_insert_question(
            $db,
            $newSurveyId,
            $question,
            $index + 1,
            $sectionName !== '' ? ($sectionIds[$sectionName] ?? null) : null,
            false,
            (int)$question['id']
        );
    }

    return ['id' => $newSurveyId, 'version_number' => $versionNumber, 'reused' => false];
}

try {
    gradtrack_ensure_archive_schema($db, 'surveys', true);

    switch ($method) {
        case 'GET':
            $staffViewer = gradtrack_survey_staff_viewer();
            $manager = gradtrack_survey_manager();
            if ($staffViewer) {
                gradtrack_backfill_survey_audit($db, gradtrack_current_admin_display_name());
            }

            if (isset($_GET['id'])) {
                $archiveScope = isset($_GET['archive']) && $_GET['archive'] === 'archived' ? 'archived' : 'active';
                if ($archiveScope === 'archived' && !$manager) {
                    http_response_code(403);
                    echo json_encode(['success' => false, 'error' => 'Not authorized to view archived surveys']);
                    break;
                }
                $visibility = $archiveScope === 'archived'
                    ? 's.archived_at IS NOT NULL'
                    : ($staffViewer ? 's.archived_at IS NULL' : "s.archived_at IS NULL AND s.status = 'active'");
                $stmt = $db->prepare("SELECT s.*,
                                             archiver.full_name AS archived_by_name,
                                             restorer.full_name AS restored_by_name
                                      FROM surveys s
                                      LEFT JOIN admin_users archiver ON archiver.id = s.archived_by
                                      LEFT JOIN admin_users restorer ON restorer.id = s.restored_by
                                      WHERE s.id = :id AND {$visibility}");
                $stmt->bindParam(':id', $_GET['id']);
                $stmt->execute();
                $survey = $stmt->fetch(PDO::FETCH_ASSOC);

                if ($survey) {
                    // Get questions
                    $qStmt = $db->prepare("SELECT * FROM survey_questions WHERE survey_id = :id AND is_active = 1 ORDER BY sort_order ASC");
                    $qStmt->bindParam(':id', $_GET['id']);
                    $qStmt->execute();
                    $survey['questions'] = $qStmt->fetchAll(PDO::FETCH_ASSOC);

                    // Get response count
                    $rStmt = $db->prepare("SELECT COUNT(DISTINCT id) as count FROM survey_responses WHERE survey_id = :id AND submitted_at IS NOT NULL");
                    $rStmt->bindParam(':id', $_GET['id']);
                    $rStmt->execute();
                    $survey['response_count'] = (int)$rStmt->fetch(PDO::FETCH_ASSOC)['count'];

                    $survey['created_by'] = trim((string)($survey['created_by'] ?? '')) ?: gradtrack_current_admin_display_name();
                    $survey['modified_by'] = trim((string)($survey['modified_by'] ?? '')) ?: $survey['created_by'];
                    $coverage = gradtrack_get_survey_graduation_year_coverage($db, (int) $survey['id']);
                    $survey['graduation_year_coverage'] = [
                        'configured' => (bool) $coverage['configured'],
                        'years' => $coverage['years'],
                        'question_id' => $coverage['question_id'],
                        'error' => $coverage['error'],
                    ];

                    echo json_encode(["success" => true, "data" => $survey]);
                } else {
                    http_response_code(404);
                    echo json_encode(["success" => false, "error" => "Survey not found"]);
                }
            } else {
                $archiveScope = isset($_GET['archive']) && $_GET['archive'] === 'archived' ? 'archived' : 'active';
                if ($archiveScope === 'archived' && !$manager) {
                    http_response_code(403);
                    echo json_encode(['success' => false, 'error' => 'Not authorized to view archived surveys']);
                    break;
                }
                $page = max(1, (int)($_GET['page'] ?? 1));
                $limit = min(100, max(1, (int)($_GET['limit'] ?? 50)));
                $offset = ($page - 1) * $limit;
                $where = [$archiveScope === 'archived' ? 's.archived_at IS NOT NULL' : 's.archived_at IS NULL'];
                $params = [];
                if (!$staffViewer) {
                    $where[] = "s.status = 'active'";
                }
                $search = trim((string)($_GET['search'] ?? ''));
                if ($search !== '') {
                    $where[] = '(s.title LIKE :search OR s.description LIKE :search_description)';
                    $params[':search'] = '%' . substr($search, 0, 120) . '%';
                    $params[':search_description'] = $params[':search'];
                }
                $whereClause = 'WHERE ' . implode(' AND ', $where);
                $countStmt = $db->prepare("SELECT COUNT(*) AS total FROM surveys s {$whereClause}");
                $countStmt->execute($params);
                $total = (int)($countStmt->fetch(PDO::FETCH_ASSOC)['total'] ?? 0);

                $stmt = $db->prepare("
                    SELECT s.*, 
                        (SELECT COUNT(*) FROM survey_questions WHERE survey_id = s.id AND is_active = 1 AND question_type <> 'header') as question_count,
                        (SELECT COUNT(DISTINCT id) FROM survey_responses WHERE survey_id = s.id AND submitted_at IS NOT NULL) as response_count,
                        archiver.full_name AS archived_by_name,
                        restorer.full_name AS restored_by_name
                    FROM surveys s
                    LEFT JOIN admin_users archiver ON archiver.id = s.archived_by
                    LEFT JOIN admin_users restorer ON restorer.id = s.restored_by
                    {$whereClause}
                    ORDER BY s.created_at DESC
                    LIMIT {$limit} OFFSET {$offset}
                ");
                $stmt->execute($params);
                $surveys = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $counts = ['active' => $total, 'archived' => 0];
                if ($staffViewer) {
                    $countRows = $db->query("SELECT
                                                SUM(CASE WHEN archived_at IS NULL THEN 1 ELSE 0 END) AS active,
                                                SUM(CASE WHEN archived_at IS NOT NULL THEN 1 ELSE 0 END) AS archived
                                             FROM surveys")->fetch(PDO::FETCH_ASSOC) ?: [];
                    $counts = [
                        'active' => (int)($countRows['active'] ?? 0),
                        'archived' => (int)($countRows['archived'] ?? 0),
                    ];
                }
                $activeCoverage = gradtrack_get_active_survey_graduation_year_coverage($db);
                echo json_encode([
                    "success" => true,
                    "data" => $surveys,
                    'graduation_year_options' => $activeCoverage['configured'] ? $activeCoverage['years'] : [],
                    'active_survey_coverage' => [
                        'survey_id' => $activeCoverage['survey'] !== null ? (int) $activeCoverage['survey']['id'] : null,
                        'configured' => (bool) $activeCoverage['configured'],
                        'years' => $activeCoverage['years'],
                        'error' => $activeCoverage['error'],
                    ],
                    'archive_counts' => $counts,
                    'pagination' => [
                        'total' => $total,
                        'page' => $page,
                        'limit' => $limit,
                        'pages' => max(1, (int)ceil($total / $limit)),
                    ],
                ]);
            }
            break;

        case 'POST':
            gradtrack_require_survey_manager();
            $data = json_decode(file_get_contents("php://input"), true);
            $auditColumnsReady = gradtrack_ensure_survey_audit_columns($db);
            $actorName = gradtrack_current_admin_display_name();

            if (($data['action'] ?? '') === 'clone_version') {
                http_response_code(409);
                echo json_encode([
                    'success' => false,
                    'code' => 'SURVEY_VERSIONING_DISABLED',
                    'error' => 'Survey versioning is disabled. Edit the existing survey directly instead.',
                ]);
                break;
            }

            $title = trim((string)($data['title'] ?? ''));
            if ($title === '' || strlen($title) > 255) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Survey title is required and must not exceed 255 characters']);
                break;
            }

            $activeStmt = $db->query("SELECT id, title FROM surveys WHERE status = 'active' AND archived_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1");
            $activeSurvey = $activeStmt->fetch(PDO::FETCH_ASSOC);
            if ($activeSurvey) {
                http_response_code(409);
                echo json_encode([
                    "success" => false,
                    "error" => "An active survey already exists. Please set it to inactive before creating a new survey.",
                    "active_survey" => $activeSurvey
                ]);
                break;
            }

            $status = $data['status'] ?? 'draft';
            if (!in_array($status, ['draft', 'active', 'inactive'], true)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Invalid survey status']);
                break;
            }

            $questions = isset($data['questions']) && is_array($data['questions']) ? $data['questions'] : [];
            $questionValidation = gradtrack_prepare_survey_questions($questions, $status === 'active');
            if ($questionValidation['errors'] !== []) {
                http_response_code(422);
                echo json_encode([
                    'success' => false,
                    'error' => implode("\n", $questionValidation['errors']),
                    'code' => 'INVALID_GRADUATION_YEAR_COVERAGE',
                ]);
                break;
            }
            $data['questions'] = $questionValidation['questions'];

            $db->beginTransaction();

            $templateId = gradtrack_survey_create_template($db, $title, (string)($data['description'] ?? ''));

            if ($auditColumnsReady) {
                $stmt = $db->prepare("INSERT INTO surveys (template_id, version_number, title, description, status, published_at, locked_at, created_by, modified_by, modified_at) VALUES (:template_id, 1, :title, :desc, :status, CASE WHEN :publish_status = 'draft' THEN NULL ELSE NOW() END, CASE WHEN :lock_status = 'draft' THEN NULL ELSE NOW() END, :created_by, :modified_by, NOW())");
                $stmt->execute([
                    ':template_id' => $templateId,
                    ':title' => $title,
                    ':desc' => $data['description'] ?? '',
                    ':status' => $status,
                    ':publish_status' => $status,
                    ':lock_status' => $status,
                    ':created_by' => $actorName,
                    ':modified_by' => $actorName,
                ]);
            } else {
                $stmt = $db->prepare("INSERT INTO surveys (template_id, version_number, title, description, status, published_at, locked_at) VALUES (:template_id, 1, :title, :desc, :status, CASE WHEN :publish_status = 'draft' THEN NULL ELSE NOW() END, CASE WHEN :lock_status = 'draft' THEN NULL ELSE NOW() END)");
                $stmt->execute([
                    ':template_id' => $templateId,
                    ':title' => $title,
                    ':desc' => $data['description'] ?? '',
                    ':status' => $status,
                    ':publish_status' => $status,
                    ':lock_status' => $status,
                ]);
            }
            $surveyId = (int)$db->lastInsertId();

            if (isset($data['questions']) && is_array($data['questions'])) {
                $sectionIds = gradtrack_survey_sync_sections($db, $surveyId, $data['questions']);
                foreach ($data['questions'] as $i => $q) {
                    $sectionName = gradtrack_survey_normalize_metadata_text($q['section'] ?? '');
                    gradtrack_survey_insert_question(
                        $db,
                        $surveyId,
                        $q,
                        $i + 1,
                        $sectionName !== '' ? ($sectionIds[$sectionName] ?? null) : null,
                        true
                    );
                }
            }

            if ($status !== 'draft') {
                $current = $db->prepare('UPDATE survey_templates SET current_version_id = :survey_id WHERE id = :template_id');
                $current->execute([':survey_id' => $surveyId, ':template_id' => $templateId]);
            }

            $db->commit();
            // Audit Trail: call logAuditTrail() after a survey is successfully created and committed.
            logAuditTrail(
                $auditUser['user_id'],
                $auditUser['user_name'],
                $auditUser['user_role'],
                $auditUser['department'],
                'Create',
                'Survey Management',
                "Created survey with record ID {$surveyId}.",
                $surveyId,
                null,
                [
                    'status' => $status,
                    'question_count' => isset($data['questions']) && is_array($data['questions']) ? count($data['questions']) : 0,
                ]
            );
            echo json_encode(["success" => true, "message" => "Survey created", "id" => $surveyId]);
            break;

        case 'PUT':
            gradtrack_require_survey_manager();
            $data = json_decode(file_get_contents("php://input"), true);
            $auditColumnsReady = gradtrack_ensure_survey_audit_columns($db);
            $actorName = gradtrack_current_admin_display_name();
            if (!isset($data['id'])) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "ID is required"]);
                break;
            }

            $surveyId = (int)$data['id'];
            if (($data['action'] ?? '') === 'restore') {
                $surveyStmt = $db->prepare('SELECT id, title, status_before_archive FROM surveys WHERE id = :id AND archived_at IS NOT NULL LIMIT 1');
                $surveyStmt->execute([':id' => $surveyId]);
                $archivedSurvey = $surveyStmt->fetch(PDO::FETCH_ASSOC);
                if (!$archivedSurvey) {
                    http_response_code(409);
                    echo json_encode(['success' => false, 'error' => 'Survey is already active or does not exist']);
                    break;
                }

                $restoreStatus = in_array($archivedSurvey['status_before_archive'] ?? '', ['draft', 'active', 'inactive'], true)
                    ? $archivedSurvey['status_before_archive']
                    : 'inactive';
                if ($restoreStatus === 'active') {
                    $otherActiveStmt = $db->prepare("SELECT id FROM surveys WHERE status = 'active' AND archived_at IS NULL AND id <> :id LIMIT 1");
                    $otherActiveStmt->execute([':id' => $surveyId]);
                    if ($otherActiveStmt->fetch(PDO::FETCH_ASSOC)) {
                        $restoreStatus = 'inactive';
                    }
                }

                $restoreStmt = $db->prepare("UPDATE surveys
                                             SET archived_at = NULL,
                                                 archived_by = NULL,
                                                 restored_at = NOW(),
                                                 restored_by = :restored_by,
                                                 status = :status,
                                                 status_before_archive = NULL
                                             WHERE id = :id AND archived_at IS NOT NULL");
                $restoreStmt->execute([
                    ':restored_by' => $auditUser['user_id'],
                    ':status' => $restoreStatus,
                    ':id' => $surveyId,
                ]);
                logAuditTrail(
                    $auditUser['user_id'],
                    $auditUser['user_name'],
                    $auditUser['user_role'],
                    $auditUser['department'],
                    'Restore',
                    'Survey Management',
                    "Restored survey with record ID {$surveyId}.",
                    $surveyId,
                    null,
                    ['status' => $restoreStatus]
                );
                echo json_encode([
                    'success' => true,
                    'message' => $restoreStatus === 'inactive'
                        ? 'Survey restored as inactive. Its questions and responses remain intact.'
                        : 'Survey restored successfully with all questions and responses intact.',
                ]);
                break;
            }

            $title = trim((string)($data['title'] ?? ''));
            if ($title === '' || strlen($title) > 255) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Survey title is required and must not exceed 255 characters']);
                break;
            }

            $editableStmt = $db->prepare('SELECT * FROM surveys WHERE id = :id AND archived_at IS NULL LIMIT 1');
            $editableStmt->execute([':id' => $surveyId]);
            $editableSurvey = $editableStmt->fetch(PDO::FETCH_ASSOC);
            if (!$editableSurvey) {
                http_response_code(409);
                echo json_encode(['success' => false, 'error' => 'Restore this survey before editing it']);
                break;
            }

            $responseCount = gradtrack_survey_response_count($db, $surveyId);
            $protectExistingQuestionDefinitions = $responseCount > 0 || ($editableSurvey['status'] ?? '') === 'active';
            if (isset($data['questions']) && is_array($data['questions']) && $protectExistingQuestionDefinitions) {
                $definitionStmt = $db->prepare(
                    'SELECT id, survey_id, section_id, question_key, analytics_key, section,
                            question_text, question_type, options, is_required, sort_order, is_active
                     FROM survey_questions
                     WHERE survey_id = :survey_id AND is_active = 1'
                );
                $definitionStmt->execute([':survey_id' => $surveyId]);
                $storedDefinitions = [];
                foreach ($definitionStmt->fetchAll(PDO::FETCH_ASSOC) as $storedQuestion) {
                    $storedDefinitions[(int)$storedQuestion['id']] = $storedQuestion;
                }

                $safeQuestions = [];
                foreach (array_values($data['questions']) as $index => $submittedQuestion) {
                    $submittedQuestionId = (int)($submittedQuestion['id'] ?? 0);
                    if ($submittedQuestionId <= 0) {
                        $safeQuestions[] = $submittedQuestion;
                        continue;
                    }
                    if (!isset($storedDefinitions[$submittedQuestionId])) {
                        http_response_code(422);
                        echo json_encode([
                            'success' => false,
                            'code' => 'INVALID_SURVEY_QUESTION',
                            'error' => 'A submitted question does not belong to the editable survey.',
                        ]);
                        break 2;
                    }

                    // Historical answers keep their original meaning. Existing
                    // definitions may only be reordered or retired after publishing.
                    $storedQuestion = $storedDefinitions[$submittedQuestionId];
                    $storedQuestion['sort_order'] = $index + 1;
                    $safeQuestions[] = $storedQuestion;
                }
                $data['questions'] = $safeQuestions;
            }

            $db->beginTransaction();

            $status = $data['status'] ?? 'draft';
            if (!in_array($status, ['draft', 'active', 'inactive'], true)) {
                $db->rollBack();
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Invalid survey status']);
                break;
            }
            if ($status === 'active') {
                $activeStmt = $db->prepare("SELECT id, title, template_id FROM surveys WHERE status = 'active' AND archived_at IS NULL AND id <> :id LIMIT 1 FOR UPDATE");
                $activeStmt->execute([':id' => $data['id']]);
                $activeSurvey = $activeStmt->fetch(PDO::FETCH_ASSOC);
                if ($activeSurvey && (int)($activeSurvey['template_id'] ?? 0) !== (int)($editableSurvey['template_id'] ?? 0)) {
                    $db->rollBack();
                    http_response_code(409);
                    echo json_encode([
                        "success" => false,
                        "error" => "Another active survey already exists. Please set it to inactive before activating this survey.",
                        "active_survey" => $activeSurvey
                    ]);
                    break;
                }
                if ($activeSurvey) {
                    $deactivate = $db->prepare(
                        "UPDATE surveys SET status = 'inactive', modified_by = :modified_by, modified_at = NOW()
                         WHERE id = :id AND status = 'active'"
                    );
                    $deactivate->execute([':modified_by' => $actorName, ':id' => (int)$activeSurvey['id']]);
                }
            }

            if (isset($data['questions']) && is_array($data['questions'])) {
                $questionsForValidation = $data['questions'];
            } else {
                $questionsForValidationStmt = $db->prepare(
                    'SELECT id, section, question_text, question_type, options, is_required, sort_order
                     FROM survey_questions WHERE survey_id = :survey_id AND is_active = 1 ORDER BY sort_order ASC, id ASC'
                );
                $questionsForValidationStmt->execute([':survey_id' => $surveyId]);
                $questionsForValidation = $questionsForValidationStmt->fetchAll(PDO::FETCH_ASSOC);
            }
            $questionValidation = gradtrack_prepare_survey_questions($questionsForValidation, $status === 'active');
            if ($questionValidation['errors'] !== []) {
                $db->rollBack();
                http_response_code(422);
                echo json_encode([
                    'success' => false,
                    'error' => implode("\n", $questionValidation['errors']),
                    'code' => 'INVALID_GRADUATION_YEAR_COVERAGE',
                ]);
                break;
            }
            if (isset($data['questions']) && is_array($data['questions'])) {
                $data['questions'] = $questionValidation['questions'];
            }

            if ($auditColumnsReady) {
                $stmt = $db->prepare("UPDATE surveys SET title = :title, description = :desc, status = :status, published_at = CASE WHEN :publish_status = 'draft' THEN published_at ELSE COALESCE(published_at, NOW()) END, locked_at = CASE WHEN :lock_status = 'draft' THEN locked_at ELSE COALESCE(locked_at, NOW()) END, modified_by = :modified_by, modified_at = NOW() WHERE id = :id AND archived_at IS NULL");
                $stmt->execute([
                    ':id' => $data['id'],
                    ':title' => $title,
                    ':desc' => $data['description'] ?? '',
                    ':status' => $status,
                    ':publish_status' => $status,
                    ':lock_status' => $status,
                    ':modified_by' => $actorName,
                ]);
            } else {
                $stmt = $db->prepare("UPDATE surveys SET title = :title, description = :desc, status = :status, published_at = CASE WHEN :publish_status = 'draft' THEN published_at ELSE COALESCE(published_at, NOW()) END, locked_at = CASE WHEN :lock_status = 'draft' THEN locked_at ELSE COALESCE(locked_at, NOW()) END WHERE id = :id AND archived_at IS NULL");
                $stmt->execute([
                    ':id' => $data['id'],
                    ':title' => $title,
                    ':desc' => $data['description'] ?? '',
                    ':status' => $status,
                    ':publish_status' => $status,
                    ':lock_status' => $status,
                ]);
            }

            if (isset($data['questions']) && is_array($data['questions'])) {
                $existingStmt = $db->prepare("SELECT id, question_key, analytics_key, is_active FROM survey_questions WHERE survey_id = :id");
                $existingStmt->execute([':id' => $data['id']]);
                $existingIds = [];
                foreach ($existingStmt->fetchAll(PDO::FETCH_ASSOC) as $existingQuestion) {
                    $existingIds[(int)$existingQuestion['id']] = $existingQuestion;
                }

                $submittedExistingIds = [];
                foreach ($data['questions'] as $submittedQuestion) {
                    $submittedQuestionId = (int)($submittedQuestion['id'] ?? 0);
                    if ($submittedQuestionId > 0 && isset($existingIds[$submittedQuestionId])) {
                        $submittedExistingIds[] = $submittedQuestionId;
                    }
                }
                $activeExistingIds = array_map(
                    'intval',
                    array_keys(array_filter(
                        $existingIds,
                        static fn (array $question): bool => (int)$question['is_active'] === 1
                    ))
                );
                $idsToRetire = array_values(array_diff($activeExistingIds, $submittedExistingIds));
                if ($idsToRetire !== []) {
                    $placeholders = implode(',', array_fill(0, count($idsToRetire), '?'));
                    $retireQuestionStmt = $db->prepare(
                        "UPDATE survey_questions
                         SET is_active = 0, retired_at = COALESCE(retired_at, NOW())
                         WHERE survey_id = ? AND id IN ($placeholders)"
                    );
                    $retireQuestionStmt->execute(array_merge([$surveyId], $idsToRetire));
                }

                $sectionIds = gradtrack_survey_sync_sections($db, $surveyId, $data['questions']);
                $db->prepare('UPDATE survey_questions SET sort_order = sort_order + 100000 WHERE survey_id = :survey_id')
                    ->execute([':survey_id' => $surveyId]);

                $updateQuestionStmt = $db->prepare("
                    UPDATE survey_questions
                    SET section_id = :section_id,
                        section = :section,
                        question_text = :text,
                        question_type = :type,
                        options = :options,
                        is_required = :required,
                        sort_order = :sort,
                        is_active = 1,
                        retired_at = NULL
                    WHERE id = :id AND survey_id = :survey_id
                ");

                foreach ($data['questions'] as $i => $q) {
                    $questionId = isset($q['id']) ? (int)$q['id'] : 0;
                    $sectionName = gradtrack_survey_normalize_metadata_text($q['section'] ?? '');
                    $questionData = [
                        ':survey_id' => $data['id'],
                        ':section_id' => $sectionName !== '' ? ($sectionIds[$sectionName] ?? null) : null,
                        ':section' => $q['section'] ?? null,
                        ':text' => $q['question_text'],
                        ':type' => $q['question_type'] ?? 'text',
                        ':options' => ($decodedOptions = gradtrack_survey_decode_options($q['options'] ?? null)) !== []
                            ? json_encode($decodedOptions, JSON_UNESCAPED_UNICODE)
                            : null,
                        ':required' => $q['is_required'] ?? 1,
                        ':sort' => $i + 1
                    ];

                    if ($questionId > 0 && isset($existingIds[$questionId])) {
                        $updateQuestionStmt->execute($questionData + [':id' => $questionId]);
                        gradtrack_survey_sync_question_options(
                            $db,
                            $questionId,
                            (string)$existingIds[$questionId]['question_key'],
                            $decodedOptions
                        );
                    } else {
                        gradtrack_survey_insert_question(
                            $db,
                            $surveyId,
                            $q,
                            $i + 1,
                            $questionData[':section_id'],
                            true
                        );
                    }
                }

                // Keep retired questions after the live form. Their rows, stable
                // keys, options, and historical answer relationships remain intact.
                $inactiveQuestionStmt = $db->prepare(
                    'SELECT id FROM survey_questions
                     WHERE survey_id = :survey_id AND is_active = 0
                     ORDER BY sort_order ASC, id ASC'
                );
                $inactiveQuestionStmt->execute([':survey_id' => $surveyId]);
                $normalizeInactiveOrder = $db->prepare(
                    'UPDATE survey_questions SET sort_order = :sort_order
                     WHERE id = :id AND survey_id = :survey_id AND is_active = 0'
                );
                $inactiveSortOrder = count($data['questions']) + 1;
                foreach ($inactiveQuestionStmt->fetchAll(PDO::FETCH_COLUMN) as $inactiveQuestionId) {
                    $normalizeInactiveOrder->execute([
                        ':sort_order' => $inactiveSortOrder++,
                        ':id' => (int)$inactiveQuestionId,
                        ':survey_id' => $surveyId,
                    ]);
                }

                $deleteEmptySections = $db->prepare(
                    'DELETE section_row FROM survey_sections section_row
                     LEFT JOIN survey_questions question_row ON question_row.section_id = section_row.id
                     WHERE section_row.survey_id = :survey_id AND question_row.id IS NULL'
                );
                $deleteEmptySections->execute([':survey_id' => $surveyId]);
            }

            if ($status !== 'draft' && (int)($editableSurvey['template_id'] ?? 0) > 0) {
                $current = $db->prepare('UPDATE survey_templates SET current_version_id = :survey_id, title = :title, description = :description WHERE id = :template_id');
                $current->execute([
                    ':survey_id' => $surveyId,
                    ':title' => $title,
                    ':description' => $data['description'] ?? '',
                    ':template_id' => (int)$editableSurvey['template_id'],
                ]);
            }

            $db->commit();
            // Audit Trail: call logAuditTrail() after a survey is successfully updated and committed.
            logAuditTrail(
                $auditUser['user_id'],
                $auditUser['user_name'],
                $auditUser['user_role'],
                $auditUser['department'],
                'Update',
                'Survey Management',
                "Updated survey with record ID {$data['id']}.",
                $data['id'],
                null,
                [
                    'status' => $status,
                    'question_count' => isset($data['questions']) && is_array($data['questions']) ? count($data['questions']) : 0,
                ]
            );
            echo json_encode(["success" => true, "message" => "Survey updated"]);
            break;

        case 'DELETE':
            gradtrack_require_survey_manager();
            $data = json_decode(file_get_contents("php://input"), true);
            if (!isset($data['id'])) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "ID is required"]);
                break;
            }

            if (($data['action'] ?? '') === 'permanent_delete') {
                $surveyId = (int) $data['id'];
                $result = gradtrack_permanently_delete_survey($db, $surveyId);
                $survey = $result['record'];
                logAuditTrail(
                    $auditUser['user_id'],
                    $auditUser['user_name'],
                    $auditUser['user_role'],
                    $auditUser['department'],
                    'Permanently Delete',
                    'Survey Management',
                    "Permanently deleted archived survey with record ID {$surveyId}.",
                    $surveyId,
                    ['title' => $survey['title'] ?? null, 'archived' => true],
                    null
                );
                echo json_encode(['success' => true, 'message' => 'Survey permanently deleted successfully.']);
                break;
            }

            $surveyStmt = $db->prepare("SELECT title, status FROM surveys WHERE id = :id AND archived_at IS NULL LIMIT 1");
            $surveyStmt->execute([':id' => $data['id']]);
            $surveyToArchive = $surveyStmt->fetch(PDO::FETCH_ASSOC);
            if (!$surveyToArchive) {
                http_response_code(409);
                echo json_encode(['success' => false, 'error' => 'Survey is already archived or does not exist']);
                break;
            }

            $stmt = $db->prepare("UPDATE surveys
                                  SET status_before_archive = status,
                                      status = 'inactive',
                                      archived_at = NOW(),
                                      archived_by = :archived_by,
                                      restored_at = NULL,
                                      restored_by = NULL
                                  WHERE id = :id AND archived_at IS NULL");
            $stmt->execute([':archived_by' => $auditUser['user_id'], ':id' => $data['id']]);
            logAuditTrail(
                $auditUser['user_id'],
                $auditUser['user_name'],
                $auditUser['user_role'],
                $auditUser['department'],
                'Archive',
                'Survey Management',
                'Archived survey with record ID ' . $data['id'] . ' while preserving questions and responses.',
                $data['id'],
                ['status' => $surveyToArchive['status']],
                ['status' => 'inactive', 'archived' => true]
            );
            echo json_encode(["success" => true, "message" => "Survey archived; all questions and responses were preserved"]);
            break;

        default:
            http_response_code(405);
            echo json_encode(["success" => false, "error" => "Method not allowed"]);
    }
} catch (GradtrackPermanentDeleteException $e) {
    if ($db->inTransaction()) $db->rollBack();
    http_response_code($e->getStatusCode());
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
} catch (Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    error_log('Surveys API error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Unable to process surveys right now"]);
}
