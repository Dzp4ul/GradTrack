<?php
declare(strict_types=1);

require_once __DIR__ . '/storage.php';

if (!function_exists('gradtrack_credentials_error')) {
    function gradtrack_credentials_error(int $status, string $message, array $errors = []): never
    {
        http_response_code($status);
        $payload = ['success' => false, 'error' => $message];
        if ($errors !== []) {
            $payload['errors'] = $errors;
        }
        echo json_encode($payload);
        exit;
    }
}

if (!function_exists('gradtrack_credentials_clean_text')) {
    function gradtrack_credentials_clean_text($value, int $maxLength): string
    {
        $clean = preg_replace('/[\x00-\x1F\x7F]/u', '', trim((string) $value)) ?? '';
        $clean = preg_replace('/\s+/u', ' ', $clean) ?? '';
        return function_exists('mb_substr') ? mb_substr($clean, 0, $maxLength) : substr($clean, 0, $maxLength);
    }
}

if (!function_exists('gradtrack_credentials_valid_date')) {
    function gradtrack_credentials_valid_date(string $value): bool
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return false;
        }
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        return $date !== false && $date->format('Y-m-d') === $value;
    }
}

if (!function_exists('gradtrack_credentials_validate_details')) {
    function gradtrack_credentials_validate_details(array $input): array
    {
        $values = [
            'credential_name' => gradtrack_credentials_clean_text($input['credential_name'] ?? '', 255),
            'issuing_organization' => gradtrack_credentials_clean_text($input['issuing_organization'] ?? '', 255),
            'issue_date' => trim((string) ($input['issue_date'] ?? '')),
            'expiration_date' => trim((string) ($input['expiration_date'] ?? '')),
            'credential_id' => gradtrack_credentials_clean_text($input['credential_id'] ?? '', 191),
            'verification_url' => trim((string) ($input['verification_url'] ?? '')),
        ];
        $errors = [];

        if ($values['credential_name'] === '') {
            $errors['credential_name'] = 'Credential name is required.';
        }
        if ($values['issuing_organization'] === '') {
            $errors['issuing_organization'] = 'Issuing organization is required.';
        }
        if ($values['issue_date'] !== '' && !gradtrack_credentials_valid_date($values['issue_date'])) {
            $errors['issue_date'] = 'Enter a valid issue date.';
        }
        if ($values['expiration_date'] !== '' && !gradtrack_credentials_valid_date($values['expiration_date'])) {
            $errors['expiration_date'] = 'Enter a valid expiration date.';
        }
        if (
            !isset($errors['issue_date'])
            && !isset($errors['expiration_date'])
            && $values['issue_date'] !== ''
            && $values['expiration_date'] !== ''
            && $values['expiration_date'] < $values['issue_date']
        ) {
            $errors['expiration_date'] = 'Expiration date cannot be earlier than the issue date.';
        }
        if ($values['verification_url'] !== '') {
            if (strlen($values['verification_url']) > 2048) {
                $errors['verification_url'] = 'Verification link is too long.';
            } else {
                $url = filter_var($values['verification_url'], FILTER_VALIDATE_URL);
                $scheme = strtolower((string) parse_url($values['verification_url'], PHP_URL_SCHEME));
                if ($url === false || !in_array($scheme, ['http', 'https'], true)) {
                    $errors['verification_url'] = 'Enter a valid http:// or https:// URL.';
                }
            }
        }

        $values['issue_date'] = $values['issue_date'] !== '' ? $values['issue_date'] : null;
        $values['expiration_date'] = $values['expiration_date'] !== '' ? $values['expiration_date'] : null;
        $values['credential_id'] = $values['credential_id'] !== '' ? $values['credential_id'] : null;
        $values['verification_url'] = $values['verification_url'] !== '' ? $values['verification_url'] : null;

        return ['values' => $values, 'errors' => $errors];
    }
}

if (!function_exists('gradtrack_credentials_validate_upload')) {
    function gradtrack_credentials_validate_upload(array $file): array
    {
        $uploadError = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($uploadError !== UPLOAD_ERR_OK) {
            $message = in_array($uploadError, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)
                ? 'Certificate file exceeds the server upload limit.'
                : ($uploadError === UPLOAD_ERR_PARTIAL
                    ? 'Certificate upload was interrupted. Please choose the file again.'
                    : 'Certificate file is required.');
            throw new InvalidArgumentException($message);
        }

        $size = (int) ($file['size'] ?? 0);
        if ($size <= 0) {
            throw new InvalidArgumentException('Certificate file cannot be empty.');
        }
        if ($size > 10 * 1024 * 1024) {
            throw new InvalidArgumentException('Certificate file must be 10 MB or smaller.');
        }

        $tmpPath = (string) ($file['tmp_name'] ?? '');
        if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
            throw new InvalidArgumentException('The uploaded certificate is invalid.');
        }

        $originalName = gradtrack_storage_safe_download_name((string) ($file['name'] ?? 'certificate'), 'certificate');
        if (gradtrack_storage_filename_has_dangerous_segment($originalName)) {
            throw new InvalidArgumentException('Certificate filename is not allowed.');
        }

        $mimeType = (new finfo(FILEINFO_MIME_TYPE))->file($tmpPath) ?: 'application/octet-stream';
        $extensionByMime = [
            'application/pdf' => 'pdf',
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
        ];
        if (!isset($extensionByMime[$mimeType])) {
            throw new InvalidArgumentException('Unsupported certificate type. Allowed: PDF, JPG, JPEG, PNG.');
        }

        $submittedExtension = strtolower((string) pathinfo($originalName, PATHINFO_EXTENSION));
        $expectedExtensions = $mimeType === 'image/jpeg' ? ['jpg', 'jpeg'] : [$extensionByMime[$mimeType]];
        if (!in_array($submittedExtension, $expectedExtensions, true)) {
            throw new InvalidArgumentException('Certificate extension does not match its file content.');
        }

        if (str_starts_with($mimeType, 'image/')) {
            $imageInfo = @getimagesize($tmpPath);
            if (
                $imageInfo === false
                || (int) $imageInfo[0] < 1
                || (int) $imageInfo[1] < 1
                || (int) $imageInfo[0] > 8192
                || (int) $imageInfo[1] > 8192
            ) {
                throw new InvalidArgumentException('Certificate image is malformed or has unsafe dimensions.');
            }
        } else {
            $header = file_get_contents($tmpPath, false, null, 0, 5);
            if ($header !== '%PDF-') {
                throw new InvalidArgumentException('The PDF certificate is malformed.');
            }
        }

        return [
            'tmp_path' => $tmpPath,
            'original_name' => $originalName,
            'mime_type' => $mimeType,
            'extension' => $extensionByMime[$mimeType],
            'file_size' => $size,
        ];
    }
}

if (!function_exists('gradtrack_credentials_format')) {
    function gradtrack_credentials_format(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'credential_name' => (string) $row['credential_name'],
            'issuing_organization' => (string) $row['issuing_organization'],
            'issue_date' => $row['issue_date'] ?: null,
            'expiration_date' => $row['expiration_date'] ?: null,
            'credential_id' => $row['credential_id'] ?: null,
            'verification_url' => $row['verification_url'] ?: null,
            'original_file_name' => (string) $row['original_file_name'],
            'mime_type' => (string) $row['mime_type'],
            'file_size_bytes' => (int) $row['file_size_bytes'],
            'status' => in_array($row['status'] ?? '', ['uploaded', 'pending', 'verified'], true)
                ? (string) $row['status']
                : 'uploaded',
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
        ];
    }
}

if (!function_exists('gradtrack_credentials_find_owned')) {
    function gradtrack_credentials_find_owned(PDO $db, int $credentialId, int $accountId, bool $lock = false): ?array
    {
        $stmt = $db->prepare('SELECT * FROM graduate_credentials
                              WHERE id = :id AND graduate_account_id = :account_id
                              LIMIT 1' . ($lock ? ' FOR UPDATE' : ''));
        $stmt->execute([':id' => $credentialId, ':account_id' => $accountId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
}
