<?php

require_once __DIR__ . '/../api/config/database.php';

function integrity_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function integrity_columns(PDO $db, string $table): array
{
    $rows = $db->query("SHOW COLUMNS FROM `{$table}`")->fetchAll(PDO::FETCH_ASSOC);
    $columns = [];
    foreach ($rows as $row) {
        $columns[(string)$row['Field']] = $row;
    }
    return $columns;
}

function integrity_related_counts(PDO $db, string $parentTable, int $parentId): array
{
    $stmt = $db->prepare("SELECT TABLE_NAME, COLUMN_NAME
                          FROM information_schema.KEY_COLUMN_USAGE
                          WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
                            AND REFERENCED_TABLE_NAME = :parent_table
                          ORDER BY TABLE_NAME, COLUMN_NAME");
    $stmt->execute([':parent_table' => $parentTable]);

    $counts = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $relation) {
        $table = (string)$relation['TABLE_NAME'];
        $column = (string)$relation['COLUMN_NAME'];
        $countStmt = $db->prepare("SELECT COUNT(*) FROM `{$table}` WHERE `{$column}` = :parent_id");
        $countStmt->execute([':parent_id' => $parentId]);
        $counts[$table . '.' . $column] = (int)$countStmt->fetchColumn();
    }
    return $counts;
}

function integrity_test_archive_round_trip(PDO $db, string $table, bool $hasStatus = false): array
{
    $row = $db->query("SELECT * FROM `{$table}` ORDER BY id ASC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return ['tested' => false, 'reason' => 'No existing row'];
    }

    $id = (int)$row['id'];
    $relatedBefore = integrity_related_counts($db, $table, $id);
    $originalArchivedAt = $row['archived_at'] ?? null;
    $originalStatus = $hasStatus ? ($row['status'] ?? null) : null;

    $db->beginTransaction();
    try {
        if ($hasStatus) {
            $stmt = $db->prepare("UPDATE `{$table}`
                                  SET status_before_archive = status,
                                      status = 'inactive',
                                      archived_at = NOW()
                                  WHERE id = :id");
        } else {
            $stmt = $db->prepare("UPDATE `{$table}` SET archived_at = NOW() WHERE id = :id");
        }
        $stmt->execute([':id' => $id]);

        $sameRow = $db->prepare("SELECT * FROM `{$table}` WHERE id = :id LIMIT 1");
        $sameRow->execute([':id' => $id]);
        $archived = $sameRow->fetch(PDO::FETCH_ASSOC);
        integrity_assert((bool)$archived, "{$table} archive removed the original row");
        integrity_assert(!empty($archived['archived_at']), "{$table} archive timestamp was not set");
        integrity_assert(integrity_related_counts($db, $table, $id) === $relatedBefore, "{$table} relationships changed during archive");

        if ($hasStatus) {
            $restore = $db->prepare("UPDATE `{$table}`
                                     SET archived_at = NULL,
                                         status = :status,
                                         status_before_archive = NULL
                                     WHERE id = :id");
            $restore->execute([':status' => $originalStatus, ':id' => $id]);
        } else {
            $restore = $db->prepare("UPDATE `{$table}` SET archived_at = :archived_at WHERE id = :id");
            $restore->execute([':archived_at' => $originalArchivedAt, ':id' => $id]);
        }

        $sameRow->execute([':id' => $id]);
        $restored = $sameRow->fetch(PDO::FETCH_ASSOC);
        integrity_assert((bool)$restored, "{$table} restore did not retain the original row");
        integrity_assert(integrity_related_counts($db, $table, $id) === $relatedBefore, "{$table} relationships changed during restore");

        $db->rollBack();
        return [
            'tested' => true,
            'id' => $id,
            'related_tables_checked' => count($relatedBefore),
            'related_rows_preserved' => array_sum($relatedBefore),
        ];
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
}

try {
    $db = (new Database())->getConnection();
    $archiveColumns = ['archived_at', 'archived_by', 'restored_at', 'restored_by'];
    foreach (['graduates', 'registered_alumni', 'surveys'] as $table) {
        $columns = integrity_columns($db, $table);
        foreach ($archiveColumns as $column) {
            integrity_assert(isset($columns[$column]), "{$table}.{$column} is missing");
        }
    }
    integrity_assert(isset(integrity_columns($db, 'surveys')['status_before_archive']), 'surveys.status_before_archive is missing');

    $postColumns = integrity_columns($db, 'forum_posts');
    integrity_assert(($postColumns['status']['Default'] ?? null) === 'approved', 'Forum posts do not default to immediate publication');
    $postStatusType = strtolower((string)($postColumns['status']['Type'] ?? ''));
    integrity_assert(strpos($postStatusType, 'pending') === false, 'Forum post approval status still includes pending');
    $pendingPosts = (int)$db->query("SELECT COUNT(*) FROM forum_posts WHERE status = 'pending'")->fetchColumn();
    integrity_assert($pendingPosts === 0, 'Legacy pending forum posts still require review');

    $commentColumns = integrity_columns($db, 'forum_comments');
    integrity_assert(isset($commentColumns['status']), 'Forum comment visibility status is missing');
    $reportColumns = integrity_columns($db, 'forum_reports');
    $reportStatusType = strtolower((string)($reportColumns['status']['Type'] ?? ''));
    integrity_assert(strpos($reportStatusType, 'resolved') !== false, 'Forum report resolved status is missing');
    integrity_assert(strpos($reportStatusType, 'reviewed') === false, 'Legacy reviewed report status is still active');
    integrity_assert(isset($reportColumns['description']), 'Forum report description is missing');

    $sourceChecks = [
        __DIR__ . '/../api/graduates/index.php' => '/DELETE\s+FROM\s+graduates/i',
        __DIR__ . '/../api/alumni-registry/index.php' => '/DELETE\s+FROM\s+registered_alumni/i',
        __DIR__ . '/../api/surveys/index.php' => '/DELETE\s+FROM\s+surveys(?:\s|$)/i',
        __DIR__ . '/../api/surveys/clear.php' => '/DELETE\s+FROM\s+(?:surveys|survey_questions|survey_responses)/i',
        __DIR__ . '/../api/cleanup-data.php' => '/DELETE\s+FROM\s+(?:graduates|employment|programs)/i',
        __DIR__ . '/../api/notifications/index.php' => '/fp\.status\s*=\s*[\'\"]pending[\'\"]/i',
    ];
    foreach ($sourceChecks as $file => $pattern) {
        $source = file_get_contents($file);
        integrity_assert($source !== false && preg_match($pattern, $source) !== 1, $file . ' still contains a forbidden destructive or approval-queue query');
    }

    $results = [
        'forum' => [
            'pending_posts' => $pendingPosts,
            'post_default' => $postColumns['status']['Default'] ?? null,
            'post_status_type' => $postColumns['status']['Type'] ?? null,
            'report_status_type' => $reportColumns['status']['Type'] ?? null,
        ],
        'archive_round_trips' => [
            'graduates' => integrity_test_archive_round_trip($db, 'graduates'),
            'registered_alumni' => integrity_test_archive_round_trip($db, 'registered_alumni'),
            'surveys' => integrity_test_archive_round_trip($db, 'surveys', true),
        ],
    ];

    echo json_encode(['success' => true, 'results' => $results], JSON_PRETTY_PRINT) . PHP_EOL;
} catch (Throwable $e) {
    fwrite(STDERR, 'Archive/forum integrity test failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
