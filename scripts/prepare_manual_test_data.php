<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This documentation utility is CLI-only.\n");
    exit(1);
}

$targetDatabase = $argv[1] ?? '';
if (preg_match('/^gradtrack_manual_doc_[0-9]{8}$/', $targetDatabase) !== 1) {
    fwrite(STDERR, "Target must match gradtrack_manual_doc_YYYYMMDD.\n");
    exit(1);
}

$testPassword = (string) getenv('GRADTRACK_MANUAL_TEST_PASSWORD');
if (strlen($testPassword) < 16) {
    fwrite(STDERR, "GRADTRACK_MANUAL_TEST_PASSWORD must contain at least 16 characters.\n");
    exit(1);
}

$databaseName = '`' . str_replace('`', '``', $targetDatabase) . '`';
$db = new PDO(
    "mysql:host=127.0.0.1;port=3306;dbname={$targetDatabase};charset=utf8mb4",
    'root',
    '',
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]
);

$roleProfiles = [
    'admin' => ['doc.admin', 'doc.admin@local.test', 'Documentation Administrator'],
    'mis_staff' => ['doc.mis', 'doc.mis@local.test', 'Documentation MIS Staff'],
    'research_coordinator' => ['doc.research', 'doc.research@local.test', 'Documentation Research Coordinator'],
    'registrar' => ['doc.registrar', 'doc.registrar@local.test', 'Documentation Registrar'],
    'alumni_president' => ['doc.alumni.president', 'doc.alumni.president@local.test', 'Documentation Alumni President'],
    'dean_cs' => ['doc.dean.ccs', 'doc.dean.ccs@local.test', 'Documentation Dean CCS'],
    'dean_coed' => ['doc.dean.coed', 'doc.dean.coed@local.test', 'Documentation Dean COED'],
    'dean_hm' => ['doc.dean.hm', 'doc.dean.hm@local.test', 'Documentation Dean HM'],
];

$passwordHash = password_hash($testPassword, PASSWORD_DEFAULT);

$db->beginTransaction();
try {
    // Replace personal identifiers only in the local documentation clone.
    $db->exec(
        "UPDATE graduates
            SET student_id = CONCAT('DOC-', LPAD(id, 6, '0')),
                first_name = 'Documentation',
                middle_name = NULL,
                last_name = CONCAT('Graduate ', LPAD(id, 4, '0')),
                name_extension = NULL,
                email = CONCAT('doc.graduate.', id, '@local.test'),
                phone = CONCAT('090000', LPAD(MOD(id, 10000), 4, '0')),
                address = 'Norzagaray, Bulacan'
          WHERE student_id <> '2026-9999'"
    );
    $db->exec(
        "UPDATE graduate_accounts ga
          JOIN graduates g ON g.id = ga.graduate_id
            SET ga.email = g.email,
                ga.password_hash = " . $db->quote($passwordHash)
    );
    $db->exec(
        "UPDATE graduate_profiles gp
            SET gp.first_name = 'Documentation',
                gp.middle_name = NULL,
                gp.last_name = CONCAT('Graduate ', LPAD(gp.graduate_account_id, 4, '0')),
                gp.phone_number = CONCAT('090100', LPAD(MOD(gp.graduate_account_id, 10000), 4, '0')),
                gp.current_location = 'Norzagaray, Bulacan'"
    );
    $db->exec(
        "UPDATE registered_alumni
            SET full_name = CONCAT('Documentation Alumni ', LPAD(id, 4, '0')),
                normalized_name = CONCAT('DOCUMENTATION ALUMNI ', LPAD(id, 4, '0'))"
    );
    $db->exec(
        "INSERT INTO graduates
            (student_id, first_name, middle_name, last_name, email, phone, program_id,
             year_graduated, address, status)
         VALUES
            ('2026-9999', 'Alex', 'Documentation', 'Survey',
             'doc.survey@local.test', '09170000002', 1, 2025,
             'Norzagaray, Bulacan', 'active')
         ON DUPLICATE KEY UPDATE
             first_name = VALUES(first_name),
             middle_name = VALUES(middle_name),
             last_name = VALUES(last_name),
             email = VALUES(email),
             phone = VALUES(phone),
             program_id = VALUES(program_id),
             year_graduated = VALUES(year_graduated),
             address = VALUES(address),
             status = VALUES(status),
             archived_at = NULL"
    );

    $selectRole = $db->prepare('SELECT id FROM admin_users WHERE role = :role ORDER BY id LIMIT 1');
    $updateRole = $db->prepare(
        'UPDATE admin_users
            SET username = :username,
                email = :email,
                password = :password,
                full_name = :full_name,
                is_active = 1
          WHERE id = :id'
    );
    $insertRole = $db->prepare(
        'INSERT INTO admin_users (username, email, password, full_name, role, is_active)
         VALUES (:username, :email, :password, :full_name, :role, 1)'
    );

    foreach ($roleProfiles as $role => [$username, $email, $fullName]) {
        $selectRole->execute([':role' => $role]);
        $existingId = $selectRole->fetchColumn();
        $values = [
            ':username' => $username,
            ':email' => $email,
            ':password' => $passwordHash,
            ':full_name' => $fullName,
        ];
        if ($existingId !== false) {
            $updateRole->execute($values + [':id' => (int) $existingId]);
        } else {
            $insertRole->execute($values + [':role' => $role]);
        }
    }

    $graduateAccount = $db->query(
        "SELECT ga.id, ga.graduate_id
           FROM graduate_accounts ga
          WHERE ga.status = 'active'
            AND ga.alumni_verification_status = 'approved'
          ORDER BY ga.id
          LIMIT 1"
    )->fetch(PDO::FETCH_ASSOC);
    if (!$graduateAccount) {
        throw new RuntimeException('The clone has no approved graduate account for documentation.');
    }

    $accountId = (int) $graduateAccount['id'];
    $graduateId = (int) $graduateAccount['graduate_id'];
    $db->prepare(
        "UPDATE graduates
            SET student_id = 'DOC-ALUMNI-001',
                first_name = 'Alex',
                middle_name = 'Documentation',
                last_name = 'Graduate',
                email = 'doc.graduate@local.test',
                phone = '09170000001',
                address = 'Norzagaray, Bulacan'
          WHERE id = :graduate_id"
    )->execute([':graduate_id' => $graduateId]);
    $db->prepare(
        "UPDATE graduate_accounts
            SET email = 'doc.graduate@local.test',
                password_hash = :password,
                status = 'active',
                alumni_verification_status = 'approved',
                alumni_verification_reason = NULL
          WHERE id = :account_id"
    )->execute([':password' => $passwordHash, ':account_id' => $accountId]);

    $profile = $db->prepare('SELECT id FROM graduate_profiles WHERE graduate_account_id = :account_id');
    $profile->execute([':account_id' => $accountId]);
    if ($profile->fetchColumn() === false) {
        $db->prepare(
            "INSERT INTO graduate_profiles
                (graduate_account_id, first_name, middle_name, last_name, phone_number,
                 program_course, graduation_year, current_location, job_title, company_name,
                 employment_location, professional_status)
             SELECT ga.id, 'Alex', 'Documentation', 'Graduate', '09170000001',
                    p.name, g.year_graduated, 'Norzagaray, Bulacan',
                    'Quality Assurance Specialist', 'GradTrack Documentation Office',
                    'Norzagaray, Bulacan', 'Employed'
               FROM graduate_accounts ga
               JOIN graduates g ON g.id = ga.graduate_id
               LEFT JOIN programs p ON p.id = g.program_id
              WHERE ga.id = :account_id"
        )->execute([':account_id' => $accountId]);
    } else {
        $db->prepare(
            "UPDATE graduate_profiles
                SET first_name = 'Alex', middle_name = 'Documentation', last_name = 'Graduate',
                    phone_number = '09170000001', current_location = 'Norzagaray, Bulacan',
                    job_title = 'Quality Assurance Specialist',
                    company_name = 'GradTrack Documentation Office',
                    employment_location = 'Norzagaray, Bulacan',
                    professional_status = 'Employed'
              WHERE graduate_account_id = :account_id"
        )->execute([':account_id' => $accountId]);
    }

    $db->commit();
    echo "MANUAL_DATA_READY|{$targetDatabase}|graduate_account={$accountId}\n";
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    throw $error;
}
