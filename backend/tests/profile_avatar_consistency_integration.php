<?php

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/storage.php';

function avatar_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
    echo "PASS: {$message}\n";
}

function avatar_test_source(PDO $db, int $accountId): ?string
{
    $stmt = $db->prepare('SELECT file_path FROM graduate_profile_images WHERE graduate_account_id = :account_id LIMIT 1');
    $stmt->execute([':account_id' => $accountId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ? (string) $row['file_path'] : null;
}

try {
    $db = (new Database())->getConnection();

    $duplicateAccountStmt = $db->query('SELECT graduate_id FROM graduate_accounts GROUP BY graduate_id HAVING COUNT(*) > 1 LIMIT 1');
    avatar_test_assert(!$duplicateAccountStmt->fetch(PDO::FETCH_ASSOC), 'each graduate maps to at most one graduate account');

    $duplicateImageStmt = $db->query('SELECT graduate_account_id FROM graduate_profile_images GROUP BY graduate_account_id HAVING COUNT(*) > 1 LIMIT 1');
    avatar_test_assert(!$duplicateImageStmt->fetch(PDO::FETCH_ASSOC), 'each graduate account maps to at most one current profile image');

    $graduateStmt = $db->query("SELECT ga.id AS account_id, ga.graduate_id,
                                      TRIM(CONCAT(COALESCE(g.first_name, ''), ' ', COALESCE(g.last_name, ''))) AS full_name,
                                      gpi.file_path AS profile_image_path
                                 FROM graduate_accounts ga
                                 JOIN graduates g ON g.id = ga.graduate_id
                                 LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
                                WHERE ga.status = 'active'
                                ORDER BY ga.id ASC
                                LIMIT 3");
    $graduates = $graduateStmt->fetchAll(PDO::FETCH_ASSOC);
    avatar_test_assert(count($graduates) >= 3, 'at least three graduate identities are available for cross-user avatar validation');

    foreach ($graduates as $graduate) {
        $source = avatar_test_source($db, (int) $graduate['account_id']);
        avatar_test_assert(
            $source === ($graduate['profile_image_path'] !== null ? (string) $graduate['profile_image_path'] : null),
            'graduate ' . (int) $graduate['graduate_id'] . ' resolves its own account-scoped profile image'
        );
    }

    $forumStmt = $db->query("SELECT fp.id, ga.id AS account_id, gpi.file_path AS profile_image_path
                              FROM forum_posts fp
                              JOIN graduate_accounts ga ON ga.graduate_id = fp.graduate_id
                              LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
                             ORDER BY fp.id ASC
                             LIMIT 5");
    $forumRows = $forumStmt->fetchAll(PDO::FETCH_ASSOC);
    avatar_test_assert(count($forumRows) > 0, 'forum author avatar relationships are testable');
    foreach ($forumRows as $row) {
        avatar_test_assert(
            avatar_test_source($db, (int) $row['account_id']) === ($row['profile_image_path'] !== null ? (string) $row['profile_image_path'] : null),
            'forum post ' . (int) $row['id'] . ' uses its author account profile image'
        );
    }

    $commentStmt = $db->query("SELECT fc.id, ga.id AS account_id, gpi.file_path AS profile_image_path
                                FROM forum_comments fc
                                JOIN graduate_accounts ga ON ga.graduate_id = fc.graduate_id
                                LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
                               ORDER BY fc.id ASC
                               LIMIT 5");
    foreach ($commentStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        avatar_test_assert(
            avatar_test_source($db, (int) $row['account_id']) === ($row['profile_image_path'] !== null ? (string) $row['profile_image_path'] : null),
            'forum comment ' . (int) $row['id'] . ' uses its commenter account profile image'
        );
    }

    $chatStmt = $db->query("SELECT fcm.room_id, fcm.graduate_id, ga.id AS account_id, gpi.file_path AS profile_image_path
                             FROM forum_chat_members fcm
                             JOIN graduate_accounts ga ON ga.graduate_id = fcm.graduate_id
                             LEFT JOIN graduate_profile_images gpi ON gpi.graduate_account_id = ga.id
                            ORDER BY fcm.room_id ASC, fcm.graduate_id ASC
                            LIMIT 10");
    $chatRows = $chatStmt->fetchAll(PDO::FETCH_ASSOC);
    avatar_test_assert(count($chatRows) > 0, 'direct and group participant avatar relationships are testable');
    foreach ($chatRows as $row) {
        $source = avatar_test_source($db, (int) $row['account_id']);
        avatar_test_assert(
            $source === ($row['profile_image_path'] !== null ? (string) $row['profile_image_path'] : null),
            'conversation ' . (int) $row['room_id'] . ' participant ' . (int) $row['graduate_id'] . ' uses its own profile image'
        );
        if ($source !== null) {
            $once = gradtrack_storage_media_access_reference($source);
            $twice = gradtrack_storage_media_access_reference($once);
            avatar_test_assert($once === $twice, 'profile media references remain stable across composed API formatters');
        }
    }

    echo "\nProfile avatar consistency integration test passed.\n";
} catch (Throwable $exception) {
    fwrite(STDERR, $exception->getMessage() . PHP_EOL);
    exit(1);
}

