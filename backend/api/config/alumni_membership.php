<?php
declare(strict_types=1);

require_once __DIR__ . '/storage.php';

function gradtrack_alumni_membership_assert_schema(PDO $db): void
{
    $required = [
        'alumni_membership_versions',
        'alumni_membership_benefits',
        'alumni_membership_fees',
        'alumni_membership_information',
        'alumni_membership_section_settings',
    ];
    $stmt = $db->prepare(
        'SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name'
    );
    foreach ($required as $table) {
        $stmt->execute([':table_name' => $table]);
        if ((int) $stmt->fetchColumn() === 0) {
            throw new RuntimeException('Alumni membership content has not been migrated yet.');
        }
    }

    $requiredVersionColumns = [
        'membership_subtitle',
        'registration_button_text',
        'registration_url',
        'registration_button_enabled',
    ];
    $columnStmt = $db->prepare(
        'SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name AND COLUMN_NAME = :column_name'
    );
    foreach ($requiredVersionColumns as $column) {
        $columnStmt->execute([
            ':table_name' => 'alumni_membership_versions',
            ':column_name' => $column,
        ]);
        if ((int) $columnStmt->fetchColumn() === 0) {
            throw new RuntimeException('Alumni membership content has not been migrated yet.');
        }
    }
}

function gradtrack_alumni_membership_section_defaults(): array
{
    return [
        'benefits' => 'Alumni Membership Benefits',
        'fees' => 'Membership Fee Breakdown',
        'id_cards' => 'Alumni Identification Card',
        'registration' => 'How to Proceed',
        'additional' => 'Important Membership Information',
        'contact' => 'Need Assistance?',
    ];
}

function gradtrack_alumni_membership_asset_columns(): array
{
    return [
        'college_logo' => 'college_logo_path',
        'alumni_logo' => 'alumni_logo_path',
        'id_card_front' => 'id_card_front_path',
        'id_card_back' => 'id_card_back_path',
    ];
}

function gradtrack_alumni_membership_version(PDO $db, string $status): ?array
{
    if (!in_array($status, ['draft', 'published'], true)) {
        throw new InvalidArgumentException('Invalid membership content status.');
    }
    $order = $status === 'published' ? 'published_at DESC, id DESC' : 'updated_at DESC, id DESC';
    $stmt = $db->prepare("SELECT * FROM alumni_membership_versions WHERE status = :status ORDER BY {$order} LIMIT 1");
    $stmt->execute([':status' => $status]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function gradtrack_alumni_membership_child_rows(PDO $db, string $table, int $versionId, bool $admin): array
{
    $allowed = [
        'alumni_membership_benefits',
        'alumni_membership_fees',
        'alumni_membership_information',
        'alumni_membership_section_settings',
    ];
    if (!in_array($table, $allowed, true)) {
        throw new InvalidArgumentException('Invalid membership content collection.');
    }
    $visibility = (!$admin && $table !== 'alumni_membership_section_settings') ? ' AND is_active = 1' : '';
    if (!$admin && $table === 'alumni_membership_section_settings') {
        $visibility = ' AND is_visible = 1';
    }
    $stmt = $db->prepare(
        "SELECT * FROM {$table} WHERE version_id = :version_id{$visibility} ORDER BY display_order ASC, id ASC"
    );
    $stmt->execute([':version_id' => $versionId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function gradtrack_alumni_membership_payload_for_version(PDO $db, array $version, bool $admin): array
{
    $versionId = (int) $version['id'];
    $config = [
        'id' => $versionId,
        'status' => (string) $version['status'],
        'association_name' => (string) $version['association_name'],
        'membership_subtitle' => (string) $version['membership_subtitle'],
        'main_heading' => (string) $version['main_heading'],
        'intro_text' => (string) $version['intro_text'],
        'registered_heading' => (string) $version['registered_heading'],
        'registered_intro_text' => (string) $version['registered_intro_text'],
        'registration_instructions' => (string) $version['registration_instructions'],
        'registration_button_text' => (string) $version['registration_button_text'],
        'registration_url' => (string) $version['registration_url'],
        'registration_button_enabled' => (bool) $version['registration_button_enabled'],
        'registered_instructions' => (string) $version['registered_instructions'],
        'contact_information' => (string) ($version['contact_information'] ?? ''),
        'footer_text' => (string) ($version['footer_text'] ?? ''),
        'total_fee_enabled' => (bool) $version['total_fee_enabled'],
        'published_at' => $version['published_at'] ?: null,
        'updated_at' => $version['updated_at'] ?: null,
    ];
    foreach (gradtrack_alumni_membership_asset_columns() as $assetKey => $column) {
        $path = trim((string) ($version[$column] ?? ''));
        $config[$assetKey . '_path'] = $path !== '' ? $path : null;
        $config[$assetKey . '_url'] = $path !== '' ? gradtrack_storage_access_reference($path) : null;
    }

    $benefits = gradtrack_alumni_membership_child_rows($db, 'alumni_membership_benefits', $versionId, $admin);
    $fees = gradtrack_alumni_membership_child_rows($db, 'alumni_membership_fees', $versionId, $admin);
    $information = gradtrack_alumni_membership_child_rows($db, 'alumni_membership_information', $versionId, $admin);
    $sections = gradtrack_alumni_membership_child_rows($db, 'alumni_membership_section_settings', $versionId, $admin);

    foreach ($benefits as &$benefit) {
        $benefit['id'] = (int) $benefit['id'];
        $benefit['display_order'] = (int) $benefit['display_order'];
        $benefit['is_active'] = (bool) $benefit['is_active'];
        unset($benefit['version_id'], $benefit['created_at'], $benefit['updated_at']);
    }
    unset($benefit);
    foreach ($fees as &$fee) {
        $fee['id'] = (int) $fee['id'];
        $fee['amount'] = number_format((float) $fee['amount'], 2, '.', '');
        $fee['display_order'] = (int) $fee['display_order'];
        $fee['is_active'] = (bool) $fee['is_active'];
        unset($fee['version_id'], $fee['created_at'], $fee['updated_at']);
    }
    unset($fee);
    foreach ($information as &$item) {
        $item['id'] = (int) $item['id'];
        $item['display_order'] = (int) $item['display_order'];
        $item['is_active'] = (bool) $item['is_active'];
        unset($item['version_id'], $item['created_at'], $item['updated_at']);
    }
    unset($item);
    foreach ($sections as &$section) {
        $section['id'] = (int) $section['id'];
        $section['display_order'] = (int) $section['display_order'];
        $section['is_visible'] = (bool) $section['is_visible'];
        unset($section['version_id']);
    }
    unset($section);

    return [
        'config' => $config,
        'benefits' => $benefits,
        'fees' => $fees,
        'information_sections' => $information,
        'section_settings' => $sections,
    ];
}

function gradtrack_alumni_membership_payload(PDO $db, string $status, bool $admin = false): array
{
    gradtrack_alumni_membership_assert_schema($db);
    $version = gradtrack_alumni_membership_version($db, $status);
    if ($version === null) {
        return [
            'success' => true,
            'published' => false,
            'data' => null,
        ];
    }

    return [
        'success' => true,
        'published' => $status === 'published',
        'data' => gradtrack_alumni_membership_payload_for_version($db, $version, $admin),
    ];
}

function gradtrack_alumni_membership_clean_text($value, string $label, int $maxLength, bool $required = true): string
{
    if (!is_string($value) && !is_numeric($value)) {
        throw new InvalidArgumentException("{$label} must be text.");
    }
    $text = trim((string) $value);
    $text = strip_tags($text);
    $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $text) ?? '';
    if ($required && $text === '') {
        throw new InvalidArgumentException("{$label} is required.");
    }
    if (mb_strlen($text) > $maxLength) {
        throw new InvalidArgumentException("{$label} must not exceed {$maxLength} characters.");
    }
    return $text;
}

function gradtrack_alumni_membership_validate_collection($value, string $label, int $limit = 50): array
{
    if (!is_array($value)) {
        throw new InvalidArgumentException("{$label} must be a list.");
    }
    if (count($value) > $limit) {
        throw new InvalidArgumentException("{$label} may contain at most {$limit} entries.");
    }
    foreach ($value as $item) {
        if (!is_array($item)) {
            throw new InvalidArgumentException("Each {$label} entry must be an object.");
        }
    }
    return array_values($value);
}

function gradtrack_alumni_membership_registration_url($value, bool $required): string
{
    $url = gradtrack_alumni_membership_clean_text($value, 'Official registration link', 1000, $required);
    if ($url === '') {
        return '';
    }
    if (filter_var($url, FILTER_VALIDATE_URL) === false || strtolower((string) parse_url($url, PHP_URL_SCHEME)) !== 'https') {
        throw new InvalidArgumentException('Official registration link must be a valid HTTPS URL.');
    }
    return $url;
}

function gradtrack_alumni_membership_save_draft(PDO $db, array $payload, int $adminId): array
{
    $draft = gradtrack_alumni_membership_version($db, 'draft');
    if ($draft === null) {
        throw new RuntimeException('No editable alumni membership draft is available.');
    }
    $config = is_array($payload['config'] ?? null) ? $payload['config'] : [];
    $benefits = gradtrack_alumni_membership_validate_collection($payload['benefits'] ?? [], 'benefits');
    $fees = gradtrack_alumni_membership_validate_collection($payload['fees'] ?? [], 'fees');
    $information = gradtrack_alumni_membership_validate_collection($payload['information_sections'] ?? [], 'information sections');
    $sectionSettings = gradtrack_alumni_membership_validate_collection($payload['section_settings'] ?? [], 'section settings', 12);
    $registrationButtonEnabled = !empty($config['registration_button_enabled']);

    $validatedConfig = [
        ':association_name' => gradtrack_alumni_membership_clean_text($config['association_name'] ?? '', 'Association name', 180),
        ':membership_subtitle' => gradtrack_alumni_membership_clean_text($config['membership_subtitle'] ?? '', 'Membership page subtitle', 220),
        ':main_heading' => gradtrack_alumni_membership_clean_text($config['main_heading'] ?? '', 'Main page heading', 220),
        ':intro_text' => gradtrack_alumni_membership_clean_text($config['intro_text'] ?? '', 'Introductory text', 3000),
        ':registered_heading' => gradtrack_alumni_membership_clean_text($config['registered_heading'] ?? '', 'Registered alumni heading', 220),
        ':registered_intro_text' => gradtrack_alumni_membership_clean_text($config['registered_intro_text'] ?? '', 'Registered alumni introduction', 3000),
        ':registration_instructions' => gradtrack_alumni_membership_clean_text($config['registration_instructions'] ?? '', 'Registration instructions', 5000),
        ':registration_button_text' => gradtrack_alumni_membership_clean_text($config['registration_button_text'] ?? '', 'Registration button text', 120, $registrationButtonEnabled),
        ':registration_url' => gradtrack_alumni_membership_registration_url($config['registration_url'] ?? '', $registrationButtonEnabled),
        ':registration_button_enabled' => $registrationButtonEnabled ? 1 : 0,
        ':registered_instructions' => gradtrack_alumni_membership_clean_text($config['registered_instructions'] ?? '', 'Registered alumni instructions', 5000),
        ':contact_information' => gradtrack_alumni_membership_clean_text($config['contact_information'] ?? '', 'Contact information', 3000, false),
        ':footer_text' => gradtrack_alumni_membership_clean_text($config['footer_text'] ?? '', 'Footer text', 500, false),
        ':total_fee_enabled' => !empty($config['total_fee_enabled']) ? 1 : 0,
        ':updated_by' => $adminId,
        ':id' => (int) $draft['id'],
    ];

    $allowedSections = gradtrack_alumni_membership_section_defaults();
    $validatedSections = [];
    $seenSections = [];
    foreach ($sectionSettings as $index => $section) {
        $key = strtolower(trim((string) ($section['section_key'] ?? '')));
        if (!isset($allowedSections[$key]) || isset($seenSections[$key])) {
            throw new InvalidArgumentException('Section settings contain an invalid or duplicate section.');
        }
        $seenSections[$key] = true;
        $validatedSections[] = [
            'section_key' => $key,
            'section_title' => gradtrack_alumni_membership_clean_text($section['section_title'] ?? '', 'Section title', 180),
            'display_order' => $index + 1,
            'is_visible' => !empty($section['is_visible']) ? 1 : 0,
        ];
    }
    foreach ($allowedSections as $key => $title) {
        if (!isset($seenSections[$key])) {
            $validatedSections[] = [
                'section_key' => $key,
                'section_title' => $title,
                'display_order' => count($validatedSections) + 1,
                'is_visible' => 1,
            ];
        }
    }

    $validatedBenefits = [];
    foreach ($benefits as $index => $benefit) {
        $validatedBenefits[] = [
            'title' => gradtrack_alumni_membership_clean_text($benefit['title'] ?? '', 'Benefit title', 180),
            'description' => gradtrack_alumni_membership_clean_text($benefit['description'] ?? '', 'Benefit description', 3000),
            'display_order' => $index + 1,
            'is_active' => !empty($benefit['is_active']) ? 1 : 0,
        ];
    }

    $validatedFees = [];
    foreach ($fees as $index => $fee) {
        $rawAmount = $fee['amount'] ?? null;
        if (!is_numeric($rawAmount) || (float) $rawAmount < 0 || (float) $rawAmount > 9999999999.99) {
            throw new InvalidArgumentException('Each fee amount must be a valid non-negative value.');
        }
        $validatedFees[] = [
            'name' => gradtrack_alumni_membership_clean_text($fee['name'] ?? '', 'Fee name', 180),
            'description' => gradtrack_alumni_membership_clean_text($fee['description'] ?? '', 'Fee description', 3000, false),
            'amount' => number_format((float) $rawAmount, 2, '.', ''),
            'display_order' => $index + 1,
            'is_active' => !empty($fee['is_active']) ? 1 : 0,
        ];
    }

    $validatedInformation = [];
    foreach ($information as $index => $item) {
        $audience = strtolower(trim((string) ($item['audience'] ?? 'both')));
        if (!in_array($audience, ['both', 'registration', 'registered'], true)) {
            throw new InvalidArgumentException('Information section audience is invalid.');
        }
        $validatedInformation[] = [
            'audience' => $audience,
            'title' => gradtrack_alumni_membership_clean_text($item['title'] ?? '', 'Information section title', 180),
            'content' => gradtrack_alumni_membership_clean_text($item['content'] ?? '', 'Information section content', 5000),
            'display_order' => $index + 1,
            'is_active' => !empty($item['is_active']) ? 1 : 0,
        ];
    }

    $db->beginTransaction();
    try {
        $lock = $db->prepare('SELECT status FROM alumni_membership_versions WHERE id = :id FOR UPDATE');
        $lock->execute([':id' => (int) $draft['id']]);
        if ((string) $lock->fetchColumn() !== 'draft') {
            throw new RuntimeException('The membership draft changed while it was being saved. Reload and try again.');
        }
        $stmt = $db->prepare(
            'UPDATE alumni_membership_versions
                SET association_name = :association_name,
                    membership_subtitle = :membership_subtitle,
                    main_heading = :main_heading,
                    intro_text = :intro_text,
                    registered_heading = :registered_heading,
                    registered_intro_text = :registered_intro_text,
                    registration_instructions = :registration_instructions,
                    registration_button_text = :registration_button_text,
                    registration_url = :registration_url,
                    registration_button_enabled = :registration_button_enabled,
                    registered_instructions = :registered_instructions,
                    contact_information = :contact_information,
                    footer_text = :footer_text,
                    total_fee_enabled = :total_fee_enabled,
                    updated_by = :updated_by,
                    updated_at = CURRENT_TIMESTAMP
              WHERE id = :id AND status = \'draft\''
        );
        $stmt->execute($validatedConfig);

        $versionId = (int) $draft['id'];
        foreach (['alumni_membership_benefits', 'alumni_membership_fees', 'alumni_membership_information', 'alumni_membership_section_settings'] as $table) {
            $delete = $db->prepare("DELETE FROM {$table} WHERE version_id = :version_id");
            $delete->execute([':version_id' => $versionId]);
        }

        $benefitStmt = $db->prepare(
            'INSERT INTO alumni_membership_benefits (version_id, title, description, display_order, is_active)
             VALUES (:version_id, :title, :description, :display_order, :is_active)'
        );
        foreach ($validatedBenefits as $benefit) {
            $benefitStmt->execute([':version_id' => $versionId] + array_combine(
                [':title', ':description', ':display_order', ':is_active'],
                array_values($benefit)
            ));
        }
        $feeStmt = $db->prepare(
            'INSERT INTO alumni_membership_fees (version_id, name, description, amount, display_order, is_active)
             VALUES (:version_id, :name, :description, :amount, :display_order, :is_active)'
        );
        foreach ($validatedFees as $fee) {
            $feeStmt->execute([':version_id' => $versionId] + array_combine(
                [':name', ':description', ':amount', ':display_order', ':is_active'],
                array_values($fee)
            ));
        }
        $infoStmt = $db->prepare(
            'INSERT INTO alumni_membership_information (version_id, audience, title, content, display_order, is_active)
             VALUES (:version_id, :audience, :title, :content, :display_order, :is_active)'
        );
        foreach ($validatedInformation as $item) {
            $infoStmt->execute([':version_id' => $versionId] + array_combine(
                [':audience', ':title', ':content', ':display_order', ':is_active'],
                array_values($item)
            ));
        }
        $sectionStmt = $db->prepare(
            'INSERT INTO alumni_membership_section_settings (version_id, section_key, section_title, display_order, is_visible)
             VALUES (:version_id, :section_key, :section_title, :display_order, :is_visible)'
        );
        foreach ($validatedSections as $section) {
            $sectionStmt->execute([':version_id' => $versionId] + array_combine(
                [':section_key', ':section_title', ':display_order', ':is_visible'],
                array_values($section)
            ));
        }
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }

    return gradtrack_alumni_membership_payload($db, 'draft', true);
}

function gradtrack_alumni_membership_clone_children(PDO $db, int $sourceId, int $destinationId): void
{
    $copies = [
        'alumni_membership_benefits' => 'title, description, display_order, is_active',
        'alumni_membership_fees' => 'name, description, amount, display_order, is_active',
        'alumni_membership_information' => 'audience, title, content, display_order, is_active',
        'alumni_membership_section_settings' => 'section_key, section_title, display_order, is_visible',
    ];
    foreach ($copies as $table => $columns) {
        $stmt = $db->prepare(
            "INSERT INTO {$table} (version_id, {$columns})
             SELECT :destination_id, {$columns} FROM {$table}
              WHERE version_id = :source_id ORDER BY display_order ASC, id ASC"
        );
        $stmt->execute([':destination_id' => $destinationId, ':source_id' => $sourceId]);
    }
}

function gradtrack_alumni_membership_publish(PDO $db, int $adminId): array
{
    $draft = gradtrack_alumni_membership_version($db, 'draft');
    if ($draft === null) {
        throw new RuntimeException('No editable alumni membership draft is available.');
    }
    foreach (['association_name', 'membership_subtitle', 'main_heading', 'intro_text', 'registered_heading', 'registered_intro_text'] as $field) {
        if (trim((string) ($draft[$field] ?? '')) === '') {
            throw new InvalidArgumentException('Complete all required headings and introductory text before publishing.');
        }
    }

    $db->beginTransaction();
    try {
        $db->exec("UPDATE alumni_membership_versions SET status = 'archived' WHERE status = 'published'");
        $publish = $db->prepare(
            "UPDATE alumni_membership_versions
                SET status = 'published', published_by = :admin_id, published_at = CURRENT_TIMESTAMP,
                    updated_by = :updated_by, updated_at = CURRENT_TIMESTAMP
              WHERE id = :id AND status = 'draft'"
        );
        $publish->execute([
            ':admin_id' => $adminId,
            ':updated_by' => $adminId,
            ':id' => (int) $draft['id'],
        ]);
        if ($publish->rowCount() !== 1) {
            throw new RuntimeException('The membership draft changed before it could be published.');
        }

        $clone = $db->prepare(
            "INSERT INTO alumni_membership_versions
                (status, association_name, membership_subtitle, main_heading, intro_text, registered_heading, registered_intro_text,
                 registration_instructions, registration_button_text, registration_url, registration_button_enabled,
                 registered_instructions, contact_information, footer_text,
                 college_logo_path, alumni_logo_path, id_card_front_path, id_card_back_path,
                 total_fee_enabled, created_by, updated_by)
             SELECT 'draft', association_name, membership_subtitle, main_heading, intro_text, registered_heading, registered_intro_text,
                    registration_instructions, registration_button_text, registration_url, registration_button_enabled,
                    registered_instructions, contact_information, footer_text,
                    college_logo_path, alumni_logo_path, id_card_front_path, id_card_back_path,
                    total_fee_enabled, :created_by, :updated_by
               FROM alumni_membership_versions WHERE id = :source_id"
        );
        $clone->execute([
            ':created_by' => $adminId,
            ':updated_by' => $adminId,
            ':source_id' => (int) $draft['id'],
        ]);
        $newDraftId = (int) $db->lastInsertId();
        gradtrack_alumni_membership_clone_children($db, (int) $draft['id'], $newDraftId);
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }

    return gradtrack_alumni_membership_payload($db, 'draft', true) + [
        'message' => 'Alumni membership content published successfully.',
        'published_at' => date('c'),
    ];
}

function gradtrack_alumni_membership_unpublish(PDO $db, int $adminId): array
{
    $stmt = $db->prepare(
        "UPDATE alumni_membership_versions
            SET status = 'archived', updated_by = :admin_id, updated_at = CURRENT_TIMESTAMP
          WHERE status = 'published'"
    );
    $stmt->execute([':admin_id' => $adminId]);
    if ($stmt->rowCount() === 0) {
        throw new InvalidArgumentException('There is no published alumni membership page to unpublish.');
    }
    return gradtrack_alumni_membership_payload($db, 'draft', true) + [
        'message' => 'Alumni membership pages are now unpublished.',
        'published_at' => null,
        'has_published_content' => false,
    ];
}

function gradtrack_alumni_membership_validate_image(array $file): array
{
    $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($error !== UPLOAD_ERR_OK) {
        throw new InvalidArgumentException($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE
            ? 'The image exceeds the server upload limit.'
            : 'A valid image upload is required.');
    }
    $tmp = (string) ($file['tmp_name'] ?? '');
    $size = (int) ($file['size'] ?? 0);
    if ($tmp === '' || !is_uploaded_file($tmp) || $size <= 0) {
        throw new InvalidArgumentException('The uploaded image is invalid.');
    }
    if ($size > 8 * 1024 * 1024) {
        throw new InvalidArgumentException('Images must not exceed 8 MB.');
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = (string) $finfo->file($tmp);
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($extensions[$mime])) {
        throw new InvalidArgumentException('Only valid JPG, PNG, and WebP images are allowed.');
    }
    $dimensions = @getimagesize($tmp);
    if (!is_array($dimensions) || (int) $dimensions[0] < 128 || (int) $dimensions[1] < 128) {
        throw new InvalidArgumentException('Images must be at least 128 by 128 pixels.');
    }
    if ((int) $dimensions[0] > 8000 || (int) $dimensions[1] > 8000) {
        throw new InvalidArgumentException('Image dimensions must not exceed 8000 pixels.');
    }
    return [
        'tmp' => $tmp,
        'mime' => $mime,
        'extension' => $extensions[$mime],
        'original_name' => basename((string) ($file['name'] ?? 'membership-image')),
    ];
}

function gradtrack_alumni_membership_reference_in_use(PDO $db, string $reference): bool
{
    if ($reference === '') {
        return false;
    }
    $stmt = $db->prepare(
        'SELECT COUNT(*) FROM alumni_membership_versions
          WHERE college_logo_path = :a OR alumni_logo_path = :b OR id_card_front_path = :c OR id_card_back_path = :d'
    );
    $stmt->execute([':a' => $reference, ':b' => $reference, ':c' => $reference, ':d' => $reference]);
    return (int) $stmt->fetchColumn() > 0;
}

function gradtrack_alumni_membership_upload_image(PDO $db, array $file, string $assetKey, int $adminId): array
{
    $columns = gradtrack_alumni_membership_asset_columns();
    if (!isset($columns[$assetKey])) {
        throw new InvalidArgumentException('Unknown alumni membership image type.');
    }
    $draft = gradtrack_alumni_membership_version($db, 'draft');
    if ($draft === null) {
        throw new RuntimeException('No editable alumni membership draft is available.');
    }
    $validated = gradtrack_alumni_membership_validate_image($file);
    $storedName = gradtrack_storage_uuid_filename($validated['extension']);
    $result = gradtrack_storage_put_file(
        $validated['tmp'],
        'alumni-membership/' . $assetKey . '/' . $storedName,
        'uploads/alumni-membership/' . $assetKey . '/' . $storedName,
        $validated['mime'],
        ['category' => 'alumni-membership', 'asset' => $assetKey, 'uploaded-by' => (string) $adminId]
    );
    $reference = (string) $result['reference'];
    $column = $columns[$assetKey];
    $oldReference = trim((string) ($draft[$column] ?? ''));
    try {
        $stmt = $db->prepare(
            "UPDATE alumni_membership_versions SET {$column} = :reference, updated_by = :admin_id, updated_at = CURRENT_TIMESTAMP
              WHERE id = :id AND status = 'draft'"
        );
        $stmt->execute([':reference' => $reference, ':admin_id' => $adminId, ':id' => (int) $draft['id']]);
        if ($stmt->rowCount() !== 1) {
            throw new RuntimeException('The membership draft changed before the image could be attached. Reload and try again.');
        }
    } catch (Throwable $error) {
        gradtrack_storage_delete_quietly($reference);
        throw $error;
    }
    if ($oldReference !== '' && !gradtrack_alumni_membership_reference_in_use($db, $oldReference)) {
        gradtrack_storage_delete_quietly($oldReference);
    }
    return [
        'success' => true,
        'asset_key' => $assetKey,
        'path' => $reference,
        'url' => gradtrack_storage_access_reference($reference),
        'message' => 'Image uploaded successfully.',
    ];
}

function gradtrack_alumni_membership_remove_image(PDO $db, string $assetKey, int $adminId): array
{
    $columns = gradtrack_alumni_membership_asset_columns();
    if (!isset($columns[$assetKey])) {
        throw new InvalidArgumentException('Unknown alumni membership image type.');
    }
    $draft = gradtrack_alumni_membership_version($db, 'draft');
    if ($draft === null) {
        throw new RuntimeException('No editable alumni membership draft is available.');
    }
    $column = $columns[$assetKey];
    $oldReference = trim((string) ($draft[$column] ?? ''));
    $stmt = $db->prepare(
        "UPDATE alumni_membership_versions SET {$column} = NULL, updated_by = :admin_id, updated_at = CURRENT_TIMESTAMP
          WHERE id = :id AND status = 'draft'"
    );
    $stmt->execute([':admin_id' => $adminId, ':id' => (int) $draft['id']]);
    if ($stmt->rowCount() !== 1) {
        throw new RuntimeException('The membership draft changed before the image could be removed. Reload and try again.');
    }
    if ($oldReference !== '' && !gradtrack_alumni_membership_reference_in_use($db, $oldReference)) {
        gradtrack_storage_delete_quietly($oldReference);
    }
    return [
        'success' => true,
        'asset_key' => $assetKey,
        'path' => null,
        'url' => null,
        'message' => 'Image removed from the draft.',
    ];
}
