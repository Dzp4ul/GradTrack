<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/graduate_auth.php';
require_once __DIR__ . '/../config/graduate_credentials.php';
require_once __DIR__ . '/../config/storage.php';

function gradtrack_credentials_serve_file(array $credential, bool $download): never
{
    $reference = (string) $credential['file_path'];
    $mimeType = (string) $credential['mime_type'];
    $safeName = gradtrack_storage_safe_download_name((string) $credential['original_file_name'], 'credential');

    if (gradtrack_storage_is_s3_key($reference)) {
        $url = gradtrack_storage_presigned_url($reference, $safeName, $mimeType, $download);
        header_remove('Content-Type');
        header('Cache-Control: private, no-store');
        header('Location: ' . $url, true, 302);
        exit;
    }

    if (!gradtrack_storage_is_legacy_path($reference)) {
        throw new RuntimeException('Credential file reference is invalid.');
    }

    $path = gradtrack_storage_local_absolute_path($reference, true);
    header_remove('Content-Type');
    header('Content-Type: ' . $mimeType);
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    header('Content-Disposition: ' . ($download ? 'attachment' : 'inline')
        . '; filename="' . addcslashes($safeName, '"\\') . '"');
    readfile($path);
    exit;
}

$db = (new Database())->getConnection();
$requestMethod = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$effectiveMethod = $requestMethod;
if ($requestMethod === 'POST' && strtoupper(trim((string) ($_POST['_method'] ?? ''))) === 'PUT') {
    $effectiveMethod = 'PUT';
}

$newStorageReference = null;

try {
    $user = gradtrack_require_graduate_auth($db);
    $accountId = (int) $user['account_id'];
    $viewerGraduateId = (int) $user['graduate_id'];
    $credentialId = isset($_GET['id']) ? (int) $_GET['id'] : (int) ($_POST['id'] ?? 0);

    if ($effectiveMethod === 'GET') {
        $hasTargetGraduate = array_key_exists('graduate_id', $_GET);
        $targetGraduateId = $hasTargetGraduate ? (int) $_GET['graduate_id'] : $viewerGraduateId;
        if ($targetGraduateId <= 0) {
            gradtrack_credentials_error(400, 'A valid graduate id is required.');
        }
        $readAccountId = $targetGraduateId === $viewerGraduateId
            ? $accountId
            : gradtrack_credentials_visible_account_id($db, $targetGraduateId);
        if ($readAccountId === null) {
            gradtrack_credentials_error(404, 'Graduate profile not found.');
        }

        if ($credentialId > 0) {
            $credential = gradtrack_credentials_find_owned($db, $credentialId, $readAccountId);
            if (!$credential) {
                gradtrack_credentials_error(404, 'Credential not found.');
            }
            if (isset($_GET['file']) || isset($_GET['download'])) {
                gradtrack_credentials_serve_file($credential, isset($_GET['download']) && (string) $_GET['download'] === '1');
            }
            echo json_encode(['success' => true, 'data' => gradtrack_credentials_format($credential)]);
            exit;
        }

        $stmt = $db->prepare('SELECT * FROM graduate_credentials
                              WHERE graduate_account_id = :account_id
                              ORDER BY issue_date IS NULL ASC, issue_date DESC, created_at DESC, id DESC');
        $stmt->execute([':account_id' => $readAccountId]);
        $credentials = array_map('gradtrack_credentials_format', $stmt->fetchAll(PDO::FETCH_ASSOC));
        echo json_encode(['success' => true, 'data' => $credentials]);
        exit;
    }

    if ($effectiveMethod === 'POST' || $effectiveMethod === 'PUT') {
        $validation = gradtrack_credentials_validate_details($_POST);
        if ($validation['errors'] !== []) {
            gradtrack_credentials_error(422, 'Please correct the highlighted credential details.', $validation['errors']);
        }
        $values = $validation['values'];

        $existing = null;
        if ($effectiveMethod === 'PUT') {
            if ($credentialId <= 0) {
                gradtrack_credentials_error(400, 'Credential id is required.');
            }
            $existing = gradtrack_credentials_find_owned($db, $credentialId, $accountId);
            if (!$existing) {
                gradtrack_credentials_error(404, 'Credential not found.');
            }
        }

        $hasNewFile = isset($_FILES['certificate'])
            && (int) ($_FILES['certificate']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;
        if ($effectiveMethod === 'POST' && !$hasNewFile) {
            gradtrack_credentials_error(422, 'Please select a certificate file.', ['certificate' => 'Certificate file is required.']);
        }

        $upload = null;
        if ($hasNewFile) {
            try {
                $upload = gradtrack_credentials_validate_upload((array) $_FILES['certificate']);
            } catch (InvalidArgumentException $error) {
                gradtrack_credentials_error(422, $error->getMessage(), ['certificate' => $error->getMessage()]);
            }

            $storedName = gradtrack_storage_uuid_filename($upload['extension']);
            $storageResult = gradtrack_storage_put_file(
                $upload['tmp_path'],
                'private/graduate-credentials/' . $accountId . '/' . $storedName,
                'uploads/graduate-credentials/' . $accountId . '/' . $storedName,
                $upload['mime_type'],
                ['category' => 'graduate-credential']
            );
            $newStorageReference = (string) $storageResult['reference'];
            $upload['stored_name'] = $storedName;
            $upload['reference'] = $newStorageReference;
        }

        $db->beginTransaction();
        if ($effectiveMethod === 'POST') {
            $stmt = $db->prepare('INSERT INTO graduate_credentials
                (graduate_account_id, credential_name, issuing_organization, issue_date, expiration_date,
                 credential_id, verification_url, file_path, original_file_name, stored_file_name,
                 mime_type, file_size_bytes, status)
                VALUES
                (:account_id, :credential_name, :issuing_organization, :issue_date, :expiration_date,
                 :credential_id, :verification_url, :file_path, :original_file_name, :stored_file_name,
                 :mime_type, :file_size_bytes, \'uploaded\')');
            $stmt->execute([
                ':account_id' => $accountId,
                ':credential_name' => $values['credential_name'],
                ':issuing_organization' => $values['issuing_organization'],
                ':issue_date' => $values['issue_date'],
                ':expiration_date' => $values['expiration_date'],
                ':credential_id' => $values['credential_id'],
                ':verification_url' => $values['verification_url'],
                ':file_path' => $upload['reference'],
                ':original_file_name' => $upload['original_name'],
                ':stored_file_name' => $upload['stored_name'],
                ':mime_type' => $upload['mime_type'],
                ':file_size_bytes' => $upload['file_size'],
            ]);
            $credentialId = (int) $db->lastInsertId();
        } else {
            $fileSql = '';
            $params = [
                ':id' => $credentialId,
                ':account_id' => $accountId,
                ':credential_name' => $values['credential_name'],
                ':issuing_organization' => $values['issuing_organization'],
                ':issue_date' => $values['issue_date'],
                ':expiration_date' => $values['expiration_date'],
                ':credential_id' => $values['credential_id'],
                ':verification_url' => $values['verification_url'],
            ];
            if ($upload !== null) {
                $fileSql = ', file_path = :file_path, original_file_name = :original_file_name,
                              stored_file_name = :stored_file_name, mime_type = :mime_type,
                              file_size_bytes = :file_size_bytes';
                $params += [
                    ':file_path' => $upload['reference'],
                    ':original_file_name' => $upload['original_name'],
                    ':stored_file_name' => $upload['stored_name'],
                    ':mime_type' => $upload['mime_type'],
                    ':file_size_bytes' => $upload['file_size'],
                ];
            }
            $stmt = $db->prepare('UPDATE graduate_credentials
                                  SET credential_name = :credential_name,
                                      issuing_organization = :issuing_organization,
                                      issue_date = :issue_date,
                                      expiration_date = :expiration_date,
                                      credential_id = :credential_id,
                                      verification_url = :verification_url' . $fileSql . '
                                  WHERE id = :id AND graduate_account_id = :account_id');
            $stmt->execute($params);
        }
        $db->commit();

        if ($upload !== null && $existing && $existing['file_path'] !== $upload['reference']) {
            gradtrack_storage_delete_quietly((string) $existing['file_path']);
        }
        $newStorageReference = null;
        $saved = gradtrack_credentials_find_owned($db, $credentialId, $accountId);
        if (!$saved) {
            throw new RuntimeException('Saved credential could not be loaded.');
        }
        echo json_encode([
            'success' => true,
            'message' => $effectiveMethod === 'POST'
                ? 'Credential added successfully.'
                : 'Credential updated successfully.',
            'data' => gradtrack_credentials_format($saved),
        ]);
        exit;
    }

    if ($effectiveMethod === 'DELETE') {
        $payload = json_decode((string) file_get_contents('php://input'), true);
        $credentialId = is_array($payload) ? (int) ($payload['id'] ?? 0) : 0;
        if ($credentialId <= 0) {
            gradtrack_credentials_error(400, 'Credential id is required.');
        }

        $db->beginTransaction();
        $credential = gradtrack_credentials_find_owned($db, $credentialId, $accountId, true);
        if (!$credential) {
            $db->rollBack();
            gradtrack_credentials_error(404, 'Credential not found.');
        }
        $stmt = $db->prepare('DELETE FROM graduate_credentials WHERE id = :id AND graduate_account_id = :account_id');
        $stmt->execute([':id' => $credentialId, ':account_id' => $accountId]);
        $db->commit();
        gradtrack_storage_delete_quietly((string) $credential['file_path']);

        echo json_encode(['success' => true, 'message' => 'Credential deleted successfully.']);
        exit;
    }

    gradtrack_credentials_error(405, 'Method not allowed.');
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    if ($newStorageReference !== null) {
        gradtrack_storage_delete_quietly($newStorageReference);
    }
    gradtrack_credentials_error(
        $error instanceof InvalidArgumentException ? 400 : 500,
        gradtrack_public_exception_message($error, 'Unable to process credentials right now.', 'Graduate credentials API')
    );
}
