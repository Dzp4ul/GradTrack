<?php

require_once __DIR__ . '/../api/config/chat.php';

$failures = 0;

function messaging_test_assert(bool $condition, string $message): void
{
    global $failures;
    if (!$condition) {
        $failures++;
        echo "FAIL: {$message}" . PHP_EOL;
        return;
    }

    echo "PASS: {$message}" . PHP_EOL;
}

putenv('CHAT_IMAGE_MAX_MB=10');
putenv('CHAT_DOCUMENT_MAX_MB=25');

$safeName = gradtrack_chat_sanitize_filename('../unsafe folder/report.php');
messaging_test_assert($safeName === 'report.php', 'filename sanitization strips directory traversal');

$blankName = gradtrack_chat_sanitize_filename('../../');
messaging_test_assert($blankName === 'attachment', 'blank or directory-only filenames fall back safely');

$config = gradtrack_chat_attachment_config();
messaging_test_assert(isset($config['image/jpeg']), 'JPEG attachments are allowed');
messaging_test_assert(isset($config['application/pdf']), 'PDF attachments are allowed');
messaging_test_assert(!isset($config['application/x-msdownload']), 'executables are not allowed by MIME config');
messaging_test_assert((int) $config['image/jpeg']['max_size'] === 10 * 1024 * 1024, 'image upload max size is configurable and defaults to 10 MB');
messaging_test_assert((int) $config['application/pdf']['max_size'] === 25 * 1024 * 1024, 'document upload max size is configurable and defaults to 25 MB');

messaging_test_assert(gradtrack_chat_message_preview('  Hello there  ', 'text') === 'Hello there', 'text messages use the trimmed message as preview');
messaging_test_assert(gradtrack_chat_message_preview('', 'image') === 'Photo', 'image-only messages get a photo preview');
messaging_test_assert(gradtrack_chat_message_preview('', 'file') === 'Attachment', 'file-only messages get an attachment preview');
messaging_test_assert(gradtrack_chat_normalize_message("  Hello\r\nworld\x00  ") === "Hello\nworld", 'message normalization removes unsafe control bytes and normalizes line endings');

$message = gradtrack_chat_format_message([
    'id' => 12,
    'room_id' => 3,
    'graduate_id' => 9,
    'message' => 'Saved safely',
    'message_type' => 'text',
    'client_message_id' => 'client-1',
    'delivered_at' => '2026-08-01 10:00:00',
    'read_at' => null,
    'created_at' => '2026-08-01 09:59:00',
    'updated_at' => '2026-08-01 09:59:00',
    'first_name' => 'Ada',
    'last_name' => 'Lovelace',
    'sender_program_code' => 'BSCS',
    'sender_profile_image_path' => null,
], 9, []);

messaging_test_assert($message['is_mine'] === true, 'formatted messages mark current user ownership');
messaging_test_assert($message['status'] === 'delivered', 'formatted messages expose delivered status for sent messages');
messaging_test_assert($message['sender_name'] === 'Ada Lovelace', 'formatted messages include sender display name');

if ($failures > 0) {
    echo PHP_EOL . "{$failures} messaging rule test(s) failed." . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All messaging rule tests passed.' . PHP_EOL;
