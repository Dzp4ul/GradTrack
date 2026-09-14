<?php
declare(strict_types=1);

return static function (PDO $db): void {
    if (
        !gradtrack_migration_table_exists($db, 'graduates')
        || !gradtrack_migration_table_exists($db, 'graduate_accounts')
        || !gradtrack_migration_table_exists($db, 'graduate_profiles')
    ) {
        return;
    }

    $affectedStudentIds = [
        '2020-0224', '2023-0014', '2023-0017', '2023-0018', '2023-0024', '2023-0035',
        '2023-0047', '2023-0065', '2023-0068', '2023-0079', '2023-0085', '2023-0101',
        '2023-0108', '2023-0125', '2023-0129', '2023-0137', '2023-0151', '2023-0162',
    ];
    $placeholders = implode(',', array_fill(0, count($affectedStudentIds), '?'));

    $stmt = $db->prepare(
        "UPDATE graduate_profiles gp
         JOIN graduate_accounts ga ON ga.id = gp.graduate_account_id
         JOIN graduates g ON g.id = ga.graduate_id
         SET gp.first_name = g.first_name,
             gp.middle_name = g.middle_name,
             gp.last_name = g.last_name
         WHERE g.student_id IN ({$placeholders})
           AND (
               gp.middle_name REGEXP '^.+[[:space:]][[:alpha:]]{1,3}\\.$'
               OR gp.last_name REGEXP '^[[:alpha:]]{1,3}\\.$'
           )"
    );
    $stmt->execute($affectedStudentIds);
};
