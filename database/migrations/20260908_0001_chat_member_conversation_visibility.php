<?php
declare(strict_types=1);

return static function (PDO $db): void {
    gradtrack_migration_add_column(
        $db,
        'forum_chat_members',
        'hidden_at',
        'hidden_at DATETIME NULL AFTER last_read_message_id'
    );
    gradtrack_migration_add_column(
        $db,
        'forum_chat_members',
        'hidden_before_message_id',
        'hidden_before_message_id INT NULL AFTER hidden_at'
    );

    if (!gradtrack_chat_index_exists(
        $db,
        'forum_chat_members',
        'idx_forum_chat_members_visibility',
        ['graduate_id', 'hidden_at', 'room_id'],
        false
    )) {
        $db->exec('ALTER TABLE forum_chat_members ADD INDEX idx_forum_chat_members_visibility (graduate_id, hidden_at, room_id)');
    }
};
