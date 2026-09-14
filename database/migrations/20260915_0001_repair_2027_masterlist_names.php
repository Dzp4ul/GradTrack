<?php
declare(strict_types=1);

return static function (PDO $db): void {
    if (!gradtrack_migration_table_exists($db, 'graduates')) {
        throw new RuntimeException('Required graduates table is missing.');
    }

    // These rows came from the supplied 2027 Registrar master list. The old
    // importer stored the first given-name token as first_name and moved the
    // remaining given names into middle_name. One missing comma also shifted
    // every component left. Restrict the repair to the exact student numbers
    // and only to the two recognizable legacy shapes so the migration remains
    // idempotent and never overwrites a later manual correction.
    $repairs = [
        '2020-0224' => ['John Lloyd', 'H.', 'Jordan'],
        '2023-0014' => ['Jhercie Amiel', 'G.', 'Begosa'],
        '2023-0017' => ['Christian Leo', 'A.', 'Pagulayan'],
        '2023-0018' => ['John Kenneth', 'S.', 'Benaojan'],
        '2023-0024' => ['Joseph Ian', 'DG.', 'Bernabe'],
        '2023-0035' => ['Rhom Moises', 'M.', 'Rodriguez'],
        '2023-0047' => ['Rose Marie', 'P.', 'Buen'],
        '2023-0065' => ['John Louie', 'G.', 'Bometivo'],
        '2023-0068' => ['Rasheed Ronian', 'P.', 'Cruz'],
        '2023-0079' => ['Joycell Ann', 'A.', 'Dragon'],
        '2023-0085' => ['Kelvin Lee', 'P.', 'Clemente'],
        '2023-0101' => ['Ferdinand Bryan', 'V.', 'Derpo'],
        '2023-0108' => ['John Paul', 'U.', 'Manansala'],
        '2023-0125' => ['Mark Manuel', 'T.', 'Lupangco'],
        '2023-0129' => ['Kyla Mae', 'J.', 'Medico'],
        '2023-0137' => ['Russel Jay', 'G.', 'Gonzales'],
        '2023-0151' => ['John Kennedy', 'B.', 'Lorenzana'],
        '2023-0162' => ['Kien Jayzel', 'G.', 'Loreto'],
    ];

    $repairStmt = $db->prepare(
        "UPDATE graduates
         SET first_name = :first_name,
             middle_name = :middle_name,
             last_name = :last_name
         WHERE student_id = :student_id
           AND (
               middle_name REGEXP '^.+[[:space:]][[:alpha:]]{1,3}\\.$'
               OR last_name REGEXP '^[[:alpha:]]{1,3}\\.$'
           )"
    );

    foreach ($repairs as $studentId => [$firstName, $middleName, $lastName]) {
        $repairStmt->execute([
            ':student_id' => $studentId,
            ':first_name' => $firstName,
            ':middle_name' => $middleName,
            ':last_name' => $lastName,
        ]);
    }
};
