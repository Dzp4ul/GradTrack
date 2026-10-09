<?php
declare(strict_types=1);

return static function (PDO $db): void {
    if (!gradtrack_migration_table_exists($db, 'admin_users')) {
        throw new RuntimeException('Required baseline table admin_users is missing.');
    }

    if (!gradtrack_migration_table_exists($db, 'alumni_membership_versions')) {
        $db->exec(
            "CREATE TABLE alumni_membership_versions (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
                association_name VARCHAR(180) NOT NULL,
                main_heading VARCHAR(220) NOT NULL,
                intro_text TEXT NOT NULL,
                registered_heading VARCHAR(220) NOT NULL,
                registered_intro_text TEXT NOT NULL,
                registration_instructions TEXT NOT NULL,
                registered_instructions TEXT NOT NULL,
                contact_information TEXT NULL,
                footer_text VARCHAR(500) NULL,
                college_logo_path VARCHAR(1000) NULL,
                alumni_logo_path VARCHAR(1000) NULL,
                id_card_front_path VARCHAR(1000) NULL,
                id_card_back_path VARCHAR(1000) NULL,
                total_fee_enabled TINYINT(1) NOT NULL DEFAULT 1,
                created_by INT NULL,
                updated_by INT NULL,
                published_by INT NULL,
                published_at DATETIME NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_alumni_membership_versions_status (status, published_at),
                KEY idx_alumni_membership_versions_updated_by (updated_by),
                CONSTRAINT fk_alumni_membership_versions_created_by FOREIGN KEY (created_by) REFERENCES admin_users (id) ON DELETE SET NULL,
                CONSTRAINT fk_alumni_membership_versions_updated_by FOREIGN KEY (updated_by) REFERENCES admin_users (id) ON DELETE SET NULL,
                CONSTRAINT fk_alumni_membership_versions_published_by FOREIGN KEY (published_by) REFERENCES admin_users (id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    }

    if (!gradtrack_migration_table_exists($db, 'alumni_membership_benefits')) {
        $db->exec(
            "CREATE TABLE alumni_membership_benefits (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                version_id BIGINT UNSIGNED NOT NULL,
                title VARCHAR(180) NOT NULL,
                description TEXT NOT NULL,
                display_order INT UNSIGNED NOT NULL DEFAULT 0,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_alumni_membership_benefits_version (version_id, is_active, display_order),
                CONSTRAINT fk_alumni_membership_benefits_version FOREIGN KEY (version_id) REFERENCES alumni_membership_versions (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    }

    if (!gradtrack_migration_table_exists($db, 'alumni_membership_fees')) {
        $db->exec(
            "CREATE TABLE alumni_membership_fees (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                version_id BIGINT UNSIGNED NOT NULL,
                name VARCHAR(180) NOT NULL,
                description TEXT NULL,
                amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
                display_order INT UNSIGNED NOT NULL DEFAULT 0,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_alumni_membership_fees_version (version_id, is_active, display_order),
                CONSTRAINT fk_alumni_membership_fees_version FOREIGN KEY (version_id) REFERENCES alumni_membership_versions (id) ON DELETE CASCADE,
                CONSTRAINT chk_alumni_membership_fee_nonnegative CHECK (amount >= 0)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    }

    if (!gradtrack_migration_table_exists($db, 'alumni_membership_information')) {
        $db->exec(
            "CREATE TABLE alumni_membership_information (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                version_id BIGINT UNSIGNED NOT NULL,
                audience ENUM('both','registration','registered') NOT NULL DEFAULT 'both',
                title VARCHAR(180) NOT NULL,
                content TEXT NOT NULL,
                display_order INT UNSIGNED NOT NULL DEFAULT 0,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_alumni_membership_information_version (version_id, is_active, display_order),
                CONSTRAINT fk_alumni_membership_information_version FOREIGN KEY (version_id) REFERENCES alumni_membership_versions (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    }

    if (!gradtrack_migration_table_exists($db, 'alumni_membership_section_settings')) {
        $db->exec(
            "CREATE TABLE alumni_membership_section_settings (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                version_id BIGINT UNSIGNED NOT NULL,
                section_key VARCHAR(40) NOT NULL,
                section_title VARCHAR(180) NOT NULL,
                display_order INT UNSIGNED NOT NULL DEFAULT 0,
                is_visible TINYINT(1) NOT NULL DEFAULT 1,
                PRIMARY KEY (id),
                UNIQUE KEY uq_alumni_membership_section (version_id, section_key),
                KEY idx_alumni_membership_sections_order (version_id, is_visible, display_order),
                CONSTRAINT fk_alumni_membership_sections_version FOREIGN KEY (version_id) REFERENCES alumni_membership_versions (id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    }

    $existing = (int) $db->query('SELECT COUNT(*) FROM alumni_membership_versions')->fetchColumn();
    if ($existing > 0) {
        return;
    }

    $insertVersion = $db->prepare(
        "INSERT INTO alumni_membership_versions
            (status, association_name, main_heading, intro_text, registered_heading, registered_intro_text,
             registration_instructions, registered_instructions, contact_information, footer_text,
             college_logo_path, alumni_logo_path, id_card_front_path, id_card_back_path,
             total_fee_enabled, published_at)
         VALUES
            (:status, :association_name, :main_heading, :intro_text, :registered_heading, :registered_intro_text,
             :registration_instructions, :registered_instructions, :contact_information, :footer_text,
             :college_logo_path, :alumni_logo_path, :id_card_front_path, :id_card_back_path,
             1, :published_at)"
    );
    $seed = [
        ':association_name' => 'Norzagaray College Alumni Association',
        ':main_heading' => 'Become a Registered Norzagaray College Alumni',
        ':intro_text' => 'Join the official Norzagaray College Alumni Association, strengthen your lifelong connection with the college, and stay informed about alumni programs and activities.',
        ':registered_heading' => "You're Part of the Alumni Community",
        ':registered_intro_text' => 'Stay connected with fellow graduates, discover alumni opportunities, and keep your Norzagaray College connection active.',
        ':registration_instructions' => 'To proceed with alumni association registration, contact the Alumni President using the details on this page. The Alumni President will confirm eligibility, current fees, payment instructions, and the requirements for claiming an Alumni Identification Card. GradTrack does not collect alumni membership payments on this page.',
        ':registered_instructions' => 'If you already have an approved GradTrack graduate account, use Graduate Portal Sign In. If your association membership is not yet reflected in GradTrack, contact the Alumni President for verification. Choosing “Already Registered” does not automatically approve, link, or change any account or membership record.',
        ':contact_information' => 'For membership verification and registration assistance, contact the Norzagaray College Alumni Association through its official office or published contact channels.',
        ':footer_text' => 'Norzagaray College Alumni Association — honoring the past, connecting the present, and building the future.',
        ':college_logo_path' => '/alumni/norzagaray-college-logo.png',
        ':alumni_logo_path' => '/alumni/alumni-association-logo.png',
        ':id_card_front_path' => '/alumni/alumni-id-front.png',
        ':id_card_back_path' => '/alumni/alumni-id-back.png',
    ];

    $insertChildren = static function (PDO $db, int $versionId): void {
        $benefits = [
            ['Lifetime Membership', 'Lifetime membership and registration in the official Norzagaray College Alumni Association database.'],
            ['Official Graduate Registry', 'Recognition in the official list of graduates maintained by the Norzagaray College Alumni Association.'],
            ['Registered Alumni Status', 'The right to vote and be nominated as a member of the Norzagaray College Alumni Association, subject to association rules.'],
            ['Recognized Alumni ID', 'An Alumni Identification Card recognized by Norzagaray College for eligible alumni services and activities.'],
            ['Partner Opportunities', 'Access to applicable alumni discounts and opportunities offered by participating companies and organizations.'],
            ['Events and Activities', 'Eligibility to join alumni events, seminars, and activities organized by the association.'],
            ['Support Your Alumni Community', 'Formal recognition as an alumnus or alumna while supporting association programs and fellow graduates.'],
        ];
        $benefitStmt = $db->prepare(
            'INSERT INTO alumni_membership_benefits (version_id, title, description, display_order, is_active)
             VALUES (:version_id, :title, :description, :display_order, 1)'
        );
        foreach ($benefits as $index => [$title, $description]) {
            $benefitStmt->execute([
                ':version_id' => $versionId,
                ':title' => $title,
                ':description' => $description,
                ':display_order' => $index + 1,
            ]);
        }

        $fees = [
            ['Alumni Association Registration', 'Registration in the official association membership database.', '100.00'],
            ['Alumni Identification Card', 'Production of the official alumni identification card.', '100.00'],
            ['Official Graduate Registry', 'Registration in the association’s official graduate list.', '100.00'],
        ];
        $feeStmt = $db->prepare(
            'INSERT INTO alumni_membership_fees (version_id, name, description, amount, display_order, is_active)
             VALUES (:version_id, :name, :description, :amount, :display_order, 1)'
        );
        foreach ($fees as $index => [$name, $description, $amount]) {
            $feeStmt->execute([
                ':version_id' => $versionId,
                ':name' => $name,
                ':description' => $description,
                ':amount' => $amount,
                ':display_order' => $index + 1,
            ]);
        }

        $information = [
            ['both', 'Eligibility', 'Membership is intended for qualified Norzagaray College graduates. The Alumni President confirms eligibility against the official alumni registry.'],
            ['registration', 'Registration and payment', 'Current requirements and accepted payment arrangements must be confirmed directly with the Alumni President. No payment is processed through this information page.'],
            ['registered', 'Existing member verification', 'Already-registered members may be asked to provide their alumni ID or other association details before a GradTrack account or registry record can be verified.'],
            ['both', 'Alumni identification', 'The Alumni Identification Card is issued only through the association’s approved process and remains subject to its terms and conditions.'],
        ];
        $infoStmt = $db->prepare(
            'INSERT INTO alumni_membership_information (version_id, audience, title, content, display_order, is_active)
             VALUES (:version_id, :audience, :title, :content, :display_order, 1)'
        );
        foreach ($information as $index => [$audience, $title, $content]) {
            $infoStmt->execute([
                ':version_id' => $versionId,
                ':audience' => $audience,
                ':title' => $title,
                ':content' => $content,
                ':display_order' => $index + 1,
            ]);
        }

        $sections = [
            ['benefits', 'Alumni Membership Benefits'],
            ['fees', 'Membership Fee Breakdown'],
            ['id_cards', 'Alumni Identification Card'],
            ['registration', 'How to Proceed'],
            ['additional', 'Important Membership Information'],
            ['contact', 'Need Assistance?'],
        ];
        $sectionStmt = $db->prepare(
            'INSERT INTO alumni_membership_section_settings (version_id, section_key, section_title, display_order, is_visible)
             VALUES (:version_id, :section_key, :section_title, :display_order, 1)'
        );
        foreach ($sections as $index => [$key, $title]) {
            $sectionStmt->execute([
                ':version_id' => $versionId,
                ':section_key' => $key,
                ':section_title' => $title,
                ':display_order' => $index + 1,
            ]);
        }
    };

    $db->beginTransaction();
    try {
        foreach (['published', 'draft'] as $status) {
            $insertVersion->execute($seed + [
                ':status' => $status,
                ':published_at' => $status === 'published' ? date('Y-m-d H:i:s') : null,
            ]);
            $insertChildren($db, (int) $db->lastInsertId());
        }
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }
};
