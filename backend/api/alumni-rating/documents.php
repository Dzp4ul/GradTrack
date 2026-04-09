<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];

function gradtrack_alumni_docs_upload_root(): string
{
    return realpath(__DIR__ . '/../../') . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'alumni-documents';
}

function gradtrack_alumni_docs_relative_path(int $accountId, string $fileName): string
{
    return 'uploads/alumni-documents/' . $accountId . '/' . $fileName;
}

function gradtrack_alumni_docs_create_dir(string $dir): void
{
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
}

function gradtrack_alumni_docs_sanitize_filename(string $name): string
{
    $safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', $name);
    return $safe ?: ('doc_' . time());
}

try {
    $user = gradtrack_require_graduate_auth($db);

    if ($method === 'GET') {
        $stmt = $db->prepare('SELECT id, document_type, title, description, original_file_name, file_path, mime_type, file_size_bytes, is_verified, uploaded_at
                              FROM alumni_supporting_documents
                              WHERE graduate_account_id = :account_id
                                AND is_active = 1
                              ORDER BY uploaded_at DESC, id DESC');
        $stmt->bindParam(':account_id', $user['account_id']);
        $stmt->execute();

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$row) {
            $row['id'] = (int) $row['id'];
            $row['file_size_bytes'] = (int) $row['file_size_bytes'];
            $row['is_verified'] = (int) $row['is_verified'];
        }

        echo json_encode(['success' => true, 'data' => $rows]);
        exit;
    }

    if ($method === 'POST') {
        $documentType = isset($_POST['document_type']) ? trim((string) $_POST['document_type']) : '';
        $title = isset($_POST['title']) ? trim((string) $_POST['title']) : '';
        $description = isset($_POST['description']) ? trim((string) $_POST['description']) : null;

        if ($documentType === '' || $title === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'document_type and title are required']);
            exit;
        }

        $allowedTypes = ['certificate', 'training', 'seminar', 'award', 'other'];
        if (!in_array($documentType, $allowedTypes, true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid document_type']);
            exit;
        }

        if (!isset($_FILES['document'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Document file is required']);
            exit;
        }

        $file = $_FILES['document'];
        if ((int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Upload failed']);
            exit;
        }

        $maxSizeBytes = 5 * 1024 * 1024;
        $fileSize = (int) ($file['size'] ?? 0);
        if ($fileSize <= 0 || $fileSize > $maxSizeBytes) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'File must be between 1 byte and 5 MB']);
            exit;
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $tmpPath = (string) $file['tmp_name'];
        $mimeType = $finfo->file($tmpPath) ?: 'application/octet-stream';

        $allowedMimes = [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];

        if (!in_array($mimeType, $allowedMimes, true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Unsupported file type. Allowed: PDF, JPG, PNG, DOC, DOCX']);
            exit;
        }

        $uploadRoot = gradtrack_alumni_docs_upload_root();
        $accountDir = $uploadRoot . DIRECTORY_SEPARATOR . $user['account_id'];
        gradtrack_alumni_docs_create_dir($accountDir);

        $originalName = (string) ($file['name'] ?? 'document');
        $safeOriginalName = gradtrack_alumni_docs_sanitize_filename($originalName);
        $extension = pathinfo($safeOriginalName, PATHINFO_EXTENSION);
        $storedName = uniqid('alumni_doc_', true) . ($extension ? ('.' . strtolower($extension)) : '');
        $destinationPath = $accountDir . DIRECTORY_SEPARATOR . $storedName;

        if (!move_uploaded_file($tmpPath, $destinationPath)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Failed to save uploaded file']);
            exit;
        }

        $relativePath = gradtrack_alumni_docs_relative_path((int) $user['account_id'], $storedName);

        $insertStmt = $db->prepare('INSERT INTO alumni_supporting_documents
            (graduate_account_id, graduate_id, document_type, title, description, original_file_name, stored_file_name, file_path, mime_type, file_size_bytes)
            VALUES
            (:account_id, :graduate_id, :document_type, :title, :description, :original_file_name, :stored_file_name, :file_path, :mime_type, :file_size_bytes)');

        $insertStmt->bindParam(':account_id', $user['account_id']);
        $insertStmt->bindParam(':graduate_id', $user['graduate_id']);
        $insertStmt->bindParam(':document_type', $documentType);
        $insertStmt->bindParam(':title', $title);
        $insertStmt->bindParam(':description', $description);
        $insertStmt->bindParam(':original_file_name', $originalName);
        $insertStmt->bindParam(':stored_file_name', $storedName);
        $insertStmt->bindParam(':file_path', $relativePath);
        $insertStmt->bindParam(':mime_type', $mimeType);
        $insertStmt->bindParam(':file_size_bytes', $fileSize);
        $insertStmt->execute();

        echo json_encode([
            'success' => true,
            'message' => 'Supporting document uploaded successfully',
            'id' => (int) $db->lastInsertId(),
        ]);
        exit;
    }

    if ($method === 'DELETE') {
        $payload = json_decode(file_get_contents('php://input'), true);
        $id = isset($payload['id']) ? (int) $payload['id'] : 0;

        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'id is required']);
            exit;
        }

        $docStmt = $db->prepare('SELECT id, file_path FROM alumni_supporting_documents WHERE id = :id AND graduate_account_id = :account_id AND is_active = 1 LIMIT 1');
        $docStmt->bindParam(':id', $id);
        $docStmt->bindParam(':account_id', $user['account_id']);
        $docStmt->execute();
        $document = $docStmt->fetch(PDO::FETCH_ASSOC);

        if (!$document) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Document not found']);
            exit;
        }

        $deactivateStmt = $db->prepare('UPDATE alumni_supporting_documents SET is_active = 0 WHERE id = :id');
        $deactivateStmt->bindParam(':id', $id);
        $deactivateStmt->execute();

        $absolutePath = realpath(__DIR__ . '/../../') . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, (string) $document['file_path']);
        if (is_file($absolutePath)) {
            @unlink($absolutePath);
        }

        echo json_encode(['success' => true, 'message' => 'Document removed successfully']);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
