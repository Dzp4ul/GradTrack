<?php
require_once __DIR__ . '/storage.php';

if (!class_exists('GradtrackPermanentDeleteException')) {
    class GradtrackPermanentDeleteException extends RuntimeException
    {
        private int $statusCode;

        public function __construct(string $message, int $statusCode)
        {
            parent::__construct($message);
            $this->statusCode = $statusCode;
        }

        public function getStatusCode(): int
        {
            return $this->statusCode;
        }
    }
}

if (!function_exists('gradtrack_permanent_delete_transaction')) {
    function gradtrack_permanent_delete_transaction(PDO $db, callable $operation): array
    {
        $ownsTransaction = !$db->inTransaction();
        if ($ownsTransaction) {
            $db->beginTransaction();
        }

        try {
            $result = $operation();
            if ($ownsTransaction) {
                $db->commit();
            }
            return $result;
        } catch (Throwable $error) {
            if ($ownsTransaction && $db->inTransaction()) {
                $db->rollBack();
            }
            throw $error;
        }
    }
}

if (!function_exists('gradtrack_delete_storage_references')) {
    function gradtrack_delete_storage_references(array $references): void
    {
        foreach (array_values(array_unique(array_filter(array_map('strval', $references)))) as $reference) {
            gradtrack_storage_delete_quietly($reference);
        }
    }
}

if (!function_exists('gradtrack_graduate_storage_references')) {
    function gradtrack_graduate_storage_references(PDO $db, int $graduateId, array $deletedRoomIds): array
    {
        $roomClause = '';
        $params = [];
        if ($deletedRoomIds !== []) {
            $roomPlaceholders = [];
            foreach ($deletedRoomIds as $index => $roomId) {
                $placeholder = ':deleted_room_' . $index;
                $roomPlaceholders[] = $placeholder;
                $params[$placeholder] = (int) $roomId;
            }
            $roomClause = ' OR attachment.room_id IN (' . implode(', ', $roomPlaceholders) . ')';
        }

        $sql = "
            SELECT profile_image.file_path AS storage_reference
            FROM graduate_profile_images profile_image
            JOIN graduate_accounts account ON account.id = profile_image.graduate_account_id
            WHERE account.graduate_id = :graduate_id_1
            UNION ALL
            SELECT cover_image.file_path
            FROM graduate_cover_images cover_image
            JOIN graduate_accounts account ON account.id = cover_image.graduate_account_id
            WHERE account.graduate_id = :graduate_id_2
            UNION ALL
            SELECT document.file_path
            FROM alumni_supporting_documents document
            WHERE document.graduate_id = :graduate_id_3
            UNION ALL
            SELECT post_media.file_path
            FROM forum_post_media post_media
            JOIN forum_posts post ON post.id = post_media.post_id
            WHERE post.graduate_id = :graduate_id_4
            UNION ALL
            SELECT post.image_path
            FROM forum_posts post
            WHERE post.graduate_id = :graduate_id_5 AND post.image_path IS NOT NULL
            UNION ALL
            SELECT attachment.storage_path
            FROM forum_chat_message_attachments attachment
            LEFT JOIN forum_chat_messages message ON message.id = attachment.message_id
            WHERE attachment.uploaded_by = :graduate_id_6 OR message.graduate_id = :graduate_id_7{$roomClause}
            UNION ALL
            SELECT room.group_image_path
            FROM forum_chat_rooms room
            WHERE room.id IN (" . ($deletedRoomIds === [] ? 'NULL' : implode(', ', array_map('intval', $deletedRoomIds))) . ")
              AND room.group_image_path IS NOT NULL
            UNION ALL
            SELECT job.requirements_file_path
            FROM job_posts job
            JOIN graduate_accounts account ON account.id = job.posted_by_account_id
            WHERE account.graduate_id = :graduate_id_8 AND job.requirements_file_path IS NOT NULL
            UNION ALL
            SELECT mentor.proof_file_path
            FROM mentors mentor
            WHERE mentor.graduate_id = :graduate_id_9 AND mentor.proof_file_path IS NOT NULL
            UNION ALL
            SELECT announcement.cover_image_path
            FROM announcements announcement
            WHERE announcement.graduate_id = :graduate_id_10 AND announcement.cover_image_path IS NOT NULL
            UNION ALL
            SELECT announcement_image.file_path
            FROM announcement_images announcement_image
            JOIN announcements announcement ON announcement.id = announcement_image.announcement_id
            WHERE announcement.graduate_id = :graduate_id_11
        ";
        for ($index = 1; $index <= 11; $index++) {
            $params[':graduate_id_' . $index] = $graduateId;
        }
        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        return array_values(array_filter(array_map(static function (array $row): string {
            return trim((string) ($row['storage_reference'] ?? ''));
        }, $stmt->fetchAll(PDO::FETCH_ASSOC))));
    }
}

if (!function_exists('gradtrack_permanently_delete_graduate')) {
    function gradtrack_permanently_delete_graduate(PDO $db, int $graduateId): array
    {
        if ($graduateId <= 0) {
            throw new GradtrackPermanentDeleteException('Graduate ID is required', 400);
        }

        return gradtrack_permanent_delete_transaction($db, function () use ($db, $graduateId): array {
            $stmt = $db->prepare("SELECT g.id, g.student_id, g.first_name, g.last_name, g.archived_at,
                                         p.code AS program_code
                                  FROM graduates g
                                  LEFT JOIN programs p ON p.id = g.program_id
                                  WHERE g.id = :id FOR UPDATE");
            $stmt->execute([':id' => $graduateId]);
            $graduate = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$graduate) {
                throw new GradtrackPermanentDeleteException('Graduate not found', 404);
            }
            if (empty($graduate['archived_at'])) {
                throw new GradtrackPermanentDeleteException('Only archived graduate records can be permanently deleted', 409);
            }

            $roomStmt = $db->prepare('SELECT id FROM forum_chat_rooms WHERE created_by = :graduate_id FOR UPDATE');
            $roomStmt->execute([':graduate_id' => $graduateId]);
            $deletedRoomIds = [];
            foreach ($roomStmt->fetchAll(PDO::FETCH_COLUMN) as $roomIdValue) {
                $roomId = (int) $roomIdValue;
                $replacementStmt = $db->prepare('SELECT graduate_id FROM forum_chat_members
                                                  WHERE room_id = :room_id AND graduate_id <> :graduate_id
                                                  ORDER BY joined_at ASC, id ASC LIMIT 1');
                $replacementStmt->execute([':room_id' => $roomId, ':graduate_id' => $graduateId]);
                $replacementId = (int) ($replacementStmt->fetchColumn() ?: 0);
                if ($replacementId > 0) {
                    $reassignStmt = $db->prepare('UPDATE forum_chat_rooms SET created_by = :replacement_id WHERE id = :room_id');
                    $reassignStmt->execute([':replacement_id' => $replacementId, ':room_id' => $roomId]);
                } else {
                    $deletedRoomIds[] = $roomId;
                }
            }

            $storageReferences = gradtrack_graduate_storage_references($db, $graduateId, $deletedRoomIds);

            // Submitted tracer responses are historical reporting records, not account-owned content.
            $detachResponses = $db->prepare('UPDATE survey_responses
                                             SET graduate_id = NULL, graduate_account_id = NULL
                                             WHERE graduate_id = :graduate_id');
            $detachResponses->execute([':graduate_id' => $graduateId]);

            // Older installations may not have foreign keys on reminder logs.
            $deleteReminders = $db->prepare('DELETE FROM survey_reminder_logs WHERE graduate_id = :graduate_id');
            $deleteReminders->execute([':graduate_id' => $graduateId]);

            $deleteStmt = $db->prepare('DELETE FROM graduates WHERE id = :id AND archived_at IS NOT NULL');
            $deleteStmt->execute([':id' => $graduateId]);
            if ($deleteStmt->rowCount() !== 1) {
                throw new GradtrackPermanentDeleteException('Graduate archive state changed; please refresh and try again', 409);
            }

            return [
                'record' => $graduate,
                'storage_references' => $storageReferences,
                'preserved_response_count' => $detachResponses->rowCount(),
                'deleted_room_count' => count($deletedRoomIds),
            ];
        });
    }
}

if (!function_exists('gradtrack_permanently_delete_survey')) {
    function gradtrack_permanently_delete_survey(PDO $db, int $surveyId): array
    {
        if ($surveyId <= 0) {
            throw new GradtrackPermanentDeleteException('Survey ID is required', 400);
        }

        return gradtrack_permanent_delete_transaction($db, function () use ($db, $surveyId): array {
            $stmt = $db->prepare('SELECT id, title, archived_at FROM surveys WHERE id = :id FOR UPDATE');
            $stmt->execute([':id' => $surveyId]);
            $survey = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$survey) {
                throw new GradtrackPermanentDeleteException('Survey not found', 404);
            }
            if (empty($survey['archived_at'])) {
                throw new GradtrackPermanentDeleteException('Only archived surveys can be permanently deleted', 409);
            }

            // This table is present on older databases without a foreign key.
            $deleteReminders = $db->prepare('DELETE FROM survey_reminder_logs WHERE survey_id = :survey_id');
            $deleteReminders->execute([':survey_id' => $surveyId]);

            $deleteStmt = $db->prepare('DELETE FROM surveys WHERE id = :id AND archived_at IS NOT NULL');
            $deleteStmt->execute([':id' => $surveyId]);
            if ($deleteStmt->rowCount() !== 1) {
                throw new GradtrackPermanentDeleteException('Survey archive state changed; please refresh and try again', 409);
            }

            return ['record' => $survey];
        });
    }
}

if (!function_exists('gradtrack_permanently_delete_registered_alumni')) {
    function gradtrack_permanently_delete_registered_alumni(PDO $db, int $recordId): array
    {
        if ($recordId <= 0) {
            throw new GradtrackPermanentDeleteException('Alumni registry record ID is required', 400);
        }

        return gradtrack_permanent_delete_transaction($db, function () use ($db, $recordId): array {
            $stmt = $db->prepare('SELECT id, full_name, course_code, batch_year, archived_at
                                  FROM registered_alumni WHERE id = :id FOR UPDATE');
            $stmt->execute([':id' => $recordId]);
            $record = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$record) {
                throw new GradtrackPermanentDeleteException('Alumni registry record not found', 404);
            }
            if (empty($record['archived_at'])) {
                throw new GradtrackPermanentDeleteException('Only archived alumni records can be permanently deleted', 409);
            }

            $deleteStmt = $db->prepare('DELETE FROM registered_alumni WHERE id = :id AND archived_at IS NOT NULL');
            $deleteStmt->execute([':id' => $recordId]);
            if ($deleteStmt->rowCount() !== 1) {
                throw new GradtrackPermanentDeleteException('Alumni archive state changed; please refresh and try again', 409);
            }

            return ['record' => $record];
        });
    }
}
