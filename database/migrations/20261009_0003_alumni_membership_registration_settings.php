<?php
declare(strict_types=1);

return static function (PDO $db): void {
    if (!gradtrack_migration_table_exists($db, 'alumni_membership_versions')) {
        throw new RuntimeException('Required table alumni_membership_versions is missing.');
    }

    if (!gradtrack_migration_column_exists($db, 'alumni_membership_versions', 'membership_subtitle')) {
        $db->exec("ALTER TABLE alumni_membership_versions
            ADD COLUMN membership_subtitle VARCHAR(220) NOT NULL DEFAULT 'Official Alumni Association membership information' AFTER association_name");
    }
    if (!gradtrack_migration_column_exists($db, 'alumni_membership_versions', 'registration_button_text')) {
        $db->exec("ALTER TABLE alumni_membership_versions
            ADD COLUMN registration_button_text VARCHAR(120) NOT NULL DEFAULT 'Proceed to Alumni Registration' AFTER registration_instructions");
    }
    if (!gradtrack_migration_column_exists($db, 'alumni_membership_versions', 'registration_url')) {
        $db->exec("ALTER TABLE alumni_membership_versions
            ADD COLUMN registration_url VARCHAR(1000) NOT NULL DEFAULT 'https://forms.gle/UWWfnV8LPDG2hwru8' AFTER registration_button_text");
    }
    if (!gradtrack_migration_column_exists($db, 'alumni_membership_versions', 'registration_button_enabled')) {
        $db->exec("ALTER TABLE alumni_membership_versions
            ADD COLUMN registration_button_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER registration_url");
    }

    $oldInstructions = 'To proceed with alumni association registration, contact the Alumni President using the details on this page. The Alumni President will confirm eligibility, current fees, payment instructions, and the requirements for claiming an Alumni Identification Card. GradTrack does not collect alumni membership payments on this page.';
    $newInstructions = 'Review the published membership information and fees, then open the official Norzagaray College Alumni Association registration form. The form opens in a new browser tab. Submitting it does not automatically create or approve a GradTrack Graduate Portal account, confirm payment, or change membership status inside GradTrack.';
    $updateInstructions = $db->prepare(
        'UPDATE alumni_membership_versions
            SET registration_instructions = :new_instructions
          WHERE registration_instructions = :old_instructions'
    );
    $updateInstructions->execute([
        ':new_instructions' => $newInstructions,
        ':old_instructions' => $oldInstructions,
    ]);

    $feeUpdates = [
        [
            'old_name' => 'Alumni Association Registration',
            'old_description' => 'Registration in the official association membership database.',
            'old_amount' => '100.00',
            'new_name' => 'Registration in Norzagaray College Alumni Association Database',
            'new_description' => 'Lifetime membership and registration in the official association database.',
            'new_amount' => '100.00',
        ],
        [
            'old_name' => 'Alumni Identification Card',
            'old_description' => 'Production of the official alumni identification card.',
            'old_amount' => '100.00',
            'new_name' => 'Alumni Identification Card',
            'new_description' => 'Production of the official Norzagaray College Alumni Association identification card.',
            'new_amount' => '150.00',
        ],
        [
            'old_name' => 'Official Graduate Registry',
            'old_description' => "Registration in the association's official graduate list.",
            'old_amount' => '100.00',
            'new_name' => 'Registration in the Official List of Graduates',
            'new_description' => 'Registration in the official list of graduates of the Norzagaray College Alumni Association.',
            'new_amount' => '100.00',
        ],
    ];
    $updateFee = $db->prepare(
        'UPDATE alumni_membership_fees
            SET name = :new_name, description = :new_description, amount = :new_amount
          WHERE name = :old_name AND amount = :old_amount'
    );
    foreach ($feeUpdates as $fee) {
        $updateFee->execute([
            ':new_name' => $fee['new_name'],
            ':new_description' => $fee['new_description'],
            ':new_amount' => $fee['new_amount'],
            ':old_name' => $fee['old_name'],
            ':old_amount' => $fee['old_amount'],
        ]);
    }

    $benefitUpdates = [
        [
            'title' => 'Recognized Alumni ID',
            'old_description' => 'An Alumni Identification Card recognized by Norzagaray College for eligible alumni services and activities.',
            'new_description' => 'An Alumni Identification Card recognized by Norzagaray College that may be used as supporting identification and for relevant alumni membership benefits.',
        ],
        [
            'title' => 'Partner Opportunities',
            'old_description' => 'Access to applicable alumni discounts and opportunities offered by participating companies and organizations.',
            'new_title' => 'Lifetime Membership Confirmation',
            'new_description' => 'Lifetime inclusion in the association membership confirmation master list, including employment status information where applicable.',
        ],
        [
            'title' => 'Support Your Alumni Community',
            'old_description' => 'Formal recognition as an alumnus or alumna while supporting association programs and fellow graduates.',
            'new_title' => 'Association Access and Support',
            'new_description' => 'Formal access to and support from the association and its official alumni activities.',
        ],
    ];
    foreach ($benefitUpdates as $benefit) {
        $stmt = $db->prepare(
            'UPDATE alumni_membership_benefits
                SET title = :new_title, description = :new_description
              WHERE title = :old_title AND description = :old_description'
        );
        $stmt->execute([
            ':new_title' => $benefit['new_title'] ?? $benefit['title'],
            ':new_description' => $benefit['new_description'],
            ':old_title' => $benefit['title'],
            ':old_description' => $benefit['old_description'],
        ]);
    }
};
