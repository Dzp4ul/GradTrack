<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/audit_trail.php';
require_once __DIR__ . '/../config/archive.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Authentication required']);
    exit;
}

if (!isset($_SESSION['role']) || !in_array((string)$_SESSION['role'], ['admin', 'super_admin'], true)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Only authorized administrators can archive surveys']);
    exit;
}

$database = new Database();
$db = $database->getConnection();
$auditUser = gradtrack_audit_current_admin_context();

try {
    gradtrack_ensure_archive_schema($db, 'surveys', true);
    $db->beginTransaction();

    $stmt = $db->prepare("UPDATE surveys
                          SET status_before_archive = status,
                              status = 'inactive',
                              archived_at = NOW(),
                              archived_by = :archived_by,
                              restored_at = NULL,
                              restored_by = NULL
                          WHERE archived_at IS NULL");
    $stmt->execute([':archived_by' => $auditUser['user_id']]);
    $archivedCount = $stmt->rowCount();

    $db->commit();

    logAuditTrail(
        $auditUser['user_id'],
        $auditUser['user_name'],
        $auditUser['user_role'],
        $auditUser['department'],
        'Archive',
        'Survey Management',
        "Archived {$archivedCount} surveys while preserving questions, responses, and analytics history.",
        null,
        null,
        null,
        ['archived_count' => $archivedCount]
    );

    echo json_encode([
        'success' => true,
        'message' => "{$archivedCount} survey(s) archived. Questions and responses were preserved.",
        'archived' => $archivedCount,
    ]);
} catch (Throwable $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    error_log('Archive all surveys failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Unable to archive surveys right now']);
}
