<?php

declare(strict_types=1);

require_once __DIR__ . '/../backend/api/config/database.php';

$database = new Database();
$db = $database->getConnection();

echo "PERSONNEL_ROLES\n";
$personnel = $db->query(
    "SELECT role,
            COUNT(*) AS total,
            SUM(CASE WHEN COALESCE(is_active, 1) = 1 THEN 1 ELSE 0 END) AS active
       FROM admin_users
      GROUP BY role
      ORDER BY role"
)->fetchAll(PDO::FETCH_ASSOC);
foreach ($personnel as $row) {
    echo sprintf("%s|%d|%d\n", $row['role'], $row['total'], $row['active']);
}

echo "GRADUATE_ACCOUNT_STATES\n";
$graduates = $db->query(
    "SELECT status, alumni_verification_status, COUNT(*) AS total
       FROM graduate_accounts
      GROUP BY status, alumni_verification_status
      ORDER BY status, alumni_verification_status"
)->fetchAll(PDO::FETCH_ASSOC);
foreach ($graduates as $row) {
    echo sprintf(
        "%s|%s|%d\n",
        $row['status'],
        $row['alumni_verification_status'],
        $row['total']
    );
}

echo "DOCUMENTATION_TEST_ACCOUNTS\n";
$tests = $db->query(
    "SELECT id, role, email
       FROM admin_users
      WHERE COALESCE(is_active, 1) = 1
        AND (LOWER(email) LIKE '%manual%'
          OR LOWER(username) LIKE '%manual%'
          OR LOWER(full_name) LIKE '%manual%'
          OR LOWER(email) LIKE '%qa%')
      ORDER BY role, id"
)->fetchAll(PDO::FETCH_ASSOC);
foreach ($tests as $row) {
    $email = (string) $row['email'];
    [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');
    $maskedLocal = strlen($local) <= 3
        ? substr($local, 0, 1) . '**'
        : substr($local, 0, 2) . str_repeat('*', max(2, strlen($local) - 4)) . substr($local, -2);
    echo sprintf("%d|%s|%s@%s\n", $row['id'], $row['role'], $maskedLocal, $domain);
}

echo "DOCUMENTATION_GRADUATE_ACCOUNTS\n";
$graduateTests = $db->query(
    "SELECT ga.id, ga.status, ga.alumni_verification_status, ga.email
       FROM graduate_accounts ga
      WHERE LOWER(ga.email) LIKE '%manual%'
         OR LOWER(ga.email) LIKE '%qa%'
      ORDER BY ga.id"
)->fetchAll(PDO::FETCH_ASSOC);
foreach ($graduateTests as $row) {
    $email = (string) $row['email'];
    [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');
    $maskedLocal = strlen($local) <= 3
        ? substr($local, 0, 1) . '**'
        : substr($local, 0, 2) . str_repeat('*', max(2, strlen($local) - 4)) . substr($local, -2);
    echo sprintf(
        "%d|%s|%s|%s@%s\n",
        $row['id'],
        $row['status'],
        $row['alumni_verification_status'],
        $maskedLocal,
        $domain
    );
}
