<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/audit_trail.php';
require_once __DIR__ . '/../config/archive.php';
require_once __DIR__ . '/../config/admin_roles.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$auditUser = gradtrack_audit_current_admin_context();

function gradtrack_column_exists(PDO $db, string $table, string $column): bool
{
    $stmt = $db->prepare("SHOW COLUMNS FROM `$table` LIKE :column");
    $stmt->execute([':column' => $column]);
    return $stmt->fetch(PDO::FETCH_ASSOC) !== false;
}

function gradtrack_ensure_survey_audit_columns(PDO $db): bool
{
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
    $fullName = isset($_SESSION['full_name']) ? trim((string) $_SESSION['full_name']) : '';
    if ($fullName !== '') {
        return $fullName;
    }

    $username = isset($_SESSION['username']) ? trim((string) $_SESSION['username']) : '';
    if ($username !== '') {
        return $username;
    }

    $email = isset($_SESSION['email']) ? trim((string) $_SESSION['email']) : '';
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
    return isset($_SESSION['user_id'], $_SESSION['role'])
        && in_array((string) $_SESSION['role'], gradtrack_admin_role_values(), true);
}

function gradtrack_survey_manager(): bool
{
    return isset($_SESSION['user_id'], $_SESSION['role'])
        && in_array((string) $_SESSION['role'], ['admin', 'super_admin'], true);
}

function gradtrack_require_survey_manager(): void
{
    if (!isset($_SESSION['user_id'])) {
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
                    $qStmt = $db->prepare("SELECT * FROM survey_questions WHERE survey_id = :id ORDER BY sort_order ASC");
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
                        (SELECT COUNT(*) FROM survey_questions WHERE survey_id = s.id AND question_type <> 'header' AND LOWER(question_text) NOT LIKE 'professional examination(s) passed%') as question_count,
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
                echo json_encode([
                    "success" => true,
                    "data" => $surveys,
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

            $db->beginTransaction();

            if ($auditColumnsReady) {
                $stmt = $db->prepare("INSERT INTO surveys (title, description, status, created_by, modified_by, modified_at) VALUES (:title, :desc, :status, :created_by, :modified_by, NOW())");
                $stmt->execute([
                    ':title' => $title,
                    ':desc' => $data['description'] ?? '',
                    ':status' => $status,
                    ':created_by' => $actorName,
                    ':modified_by' => $actorName,
                ]);
            } else {
                $stmt = $db->prepare("INSERT INTO surveys (title, description, status) VALUES (:title, :desc, :status)");
                $stmt->execute([
                    ':title' => $title,
                    ':desc' => $data['description'] ?? '',
                    ':status' => $status
                ]);
            }
            $surveyId = $db->lastInsertId();

            if (isset($data['questions']) && is_array($data['questions'])) {
                $qStmt = $db->prepare("
                    INSERT INTO survey_questions (survey_id, section, question_text, question_type, options, is_required, sort_order)
                    VALUES (:survey_id, :section, :text, :type, :options, :required, :sort)
                ");
                foreach ($data['questions'] as $i => $q) {
                    $qStmt->execute([
                        ':survey_id' => $surveyId,
                        ':section' => $q['section'] ?? null,
                        ':text' => $q['question_text'],
                        ':type' => $q['question_type'] ?? 'text',
                        ':options' => isset($q['options']) ? json_encode($q['options']) : null,
                        ':required' => $q['is_required'] ?? 1,
                        ':sort' => $i + 1
                    ]);
                }
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

            $editableStmt = $db->prepare('SELECT id FROM surveys WHERE id = :id AND archived_at IS NULL LIMIT 1');
            $editableStmt->execute([':id' => $surveyId]);
            if (!$editableStmt->fetch(PDO::FETCH_ASSOC)) {
                http_response_code(409);
                echo json_encode(['success' => false, 'error' => 'Restore this survey before editing it']);
                break;
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
                $activeStmt = $db->prepare("SELECT id, title FROM surveys WHERE status = 'active' AND archived_at IS NULL AND id <> :id LIMIT 1");
                $activeStmt->execute([':id' => $data['id']]);
                $activeSurvey = $activeStmt->fetch(PDO::FETCH_ASSOC);
                if ($activeSurvey) {
                    $db->rollBack();
                    http_response_code(409);
                    echo json_encode([
                        "success" => false,
                        "error" => "Another active survey already exists. Please set it to inactive before activating this survey.",
                        "active_survey" => $activeSurvey
                    ]);
                    break;
                }
            }

            if ($auditColumnsReady) {
                $stmt = $db->prepare("UPDATE surveys SET title = :title, description = :desc, status = :status, modified_by = :modified_by, modified_at = NOW() WHERE id = :id AND archived_at IS NULL");
                $stmt->execute([
                    ':id' => $data['id'],
                    ':title' => $title,
                    ':desc' => $data['description'] ?? '',
                    ':status' => $status,
                    ':modified_by' => $actorName,
                ]);
            } else {
                $stmt = $db->prepare("UPDATE surveys SET title = :title, description = :desc, status = :status WHERE id = :id AND archived_at IS NULL");
                $stmt->execute([
                    ':id' => $data['id'],
                    ':title' => $title,
                    ':desc' => $data['description'] ?? '',
                    ':status' => $status
                ]);
            }

            if (isset($data['questions']) && is_array($data['questions'])) {
                $existingStmt = $db->prepare("SELECT id FROM survey_questions WHERE survey_id = :id");
                $existingStmt->execute([':id' => $data['id']]);
                $existingIds = [];
                foreach ($existingStmt->fetchAll(PDO::FETCH_ASSOC) as $existingQuestion) {
                    $existingIds[(int)$existingQuestion['id']] = true;
                }

                $updateQuestionStmt = $db->prepare("
                    UPDATE survey_questions
                    SET section = :section,
                        question_text = :text,
                        question_type = :type,
                        options = :options,
                        is_required = :required,
                        sort_order = :sort
                    WHERE id = :id AND survey_id = :survey_id
                ");

                $insertQuestionStmt = $db->prepare("
                    INSERT INTO survey_questions (survey_id, section, question_text, question_type, options, is_required, sort_order)
                    VALUES (:survey_id, :section, :text, :type, :options, :required, :sort)
                ");

                $keptIds = [];
                foreach ($data['questions'] as $i => $q) {
                    $questionId = isset($q['id']) ? (int)$q['id'] : 0;
                    $questionData = [
                        ':survey_id' => $data['id'],
                        ':section' => $q['section'] ?? null,
                        ':text' => $q['question_text'],
                        ':type' => $q['question_type'] ?? 'text',
                        ':options' => isset($q['options']) ? json_encode($q['options']) : null,
                        ':required' => $q['is_required'] ?? 1,
                        ':sort' => $i + 1
                    ];

                    if ($questionId > 0 && isset($existingIds[$questionId])) {
                        $updateQuestionStmt->execute($questionData + [':id' => $questionId]);
                        $keptIds[] = $questionId;
                    } else {
                        $insertQuestionStmt->execute($questionData);
                        $keptIds[] = (int)$db->lastInsertId();
                    }
                }

                $idsToDelete = array_values(array_diff(array_keys($existingIds), $keptIds));
                if (!empty($idsToDelete)) {
                    $placeholders = implode(',', array_fill(0, count($idsToDelete), '?'));
                    $deleteQuestionStmt = $db->prepare("DELETE FROM survey_questions WHERE survey_id = ? AND id IN ($placeholders)");
                    $deleteQuestionStmt->execute(array_merge([(int)$data['id']], $idsToDelete));
                }
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
} catch (Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    error_log('Surveys API error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Unable to process surveys right now"]);
}
