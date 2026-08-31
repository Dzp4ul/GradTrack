<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/storage.php';

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
            $row['file_path'] = gradtrack_storage_access_reference(
                $row['file_path'] ?? null,
                $row['original_file_name'] ?? null,
                $row['mime_type'] ?? null,
                true
            );
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

        $tmpPath = (string) ($file['tmp_name'] ?? '');
        if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid uploaded document']);
            exit;
        }
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($tmpPath) ?: 'application/octet-stream';

        $allowedMimes = [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];

        if (!in_array($mimeType, $allowedMimes, true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Unsupported file type. Allowed: PDF, JPG, PNG, DOCX']);
            exit;
        }

        $originalName = gradtrack_storage_safe_download_name((string) ($file['name'] ?? 'document'));
        if (gradtrack_storage_filename_has_dangerous_segment($originalName)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Document filename is not allowed']);
            exit;
        }
        $extensionByMime = [
            'application/pdf' => 'pdf',
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        ];
        $submittedExtension = strtolower((string) pathinfo($originalName, PATHINFO_EXTENSION));
        $expectedExtensions = $mimeType === 'image/jpeg' ? ['jpg', 'jpeg'] : [$extensionByMime[$mimeType]];
        if (!in_array($submittedExtension, $expectedExtensions, true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Document extension does not match its content']);
            exit;
        }
        if (strpos($mimeType, 'image/') === 0) {
            $imageInfo = @getimagesize($tmpPath);
            if ($imageInfo === false || (int) $imageInfo[0] < 1 || (int) $imageInfo[1] < 1
                || (int) $imageInfo[0] > 8192 || (int) $imageInfo[1] > 8192) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Document image is malformed or has unsafe dimensions']);
                exit;
            }
        }
        if ($mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            if (!class_exists('ZipArchive')) {
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'DOCX validation is unavailable on this server']);
                exit;
            }
            $archive = new ZipArchive();
            if ($archive->open($tmpPath) !== true) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'The DOCX document is malformed']);
                exit;
            }
            $hasMacro = $archive->locateName('word/vbaProject.bin', ZipArchive::FL_NOCASE) !== false;
            $archive->close();
            if ($hasMacro) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Macro-enabled Office documents are not allowed']);
                exit;
            }
        }
        $storedName = gradtrack_storage_uuid_filename($extensionByMime[$mimeType]);
        $storageResult = gradtrack_storage_put_file(
            $tmpPath,
            'private/graduate-documents/' . (int) $user['account_id'] . '/' . $documentType . '/' . $storedName,
            gradtrack_alumni_docs_relative_path((int) $user['account_id'], $storedName),
            $mimeType,
            ['category' => 'graduate-document-' . $documentType]
        );
        $relativePath = (string) $storageResult['reference'];

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
        try {
            $insertStmt->execute();
        } catch (Throwable $insertError) {
            gradtrack_storage_delete_quietly($relativePath);
            throw $insertError;
        }

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

        gradtrack_storage_delete_quietly((string) $document['file_path']);

        echo json_encode(['success' => true, 'message' => 'Document removed successfully']);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
