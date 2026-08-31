<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This integration test is CLI-only.\n");
    exit(1);
}

if (!in_array('--run', $argv, true)) {
    fwrite(STDERR, "Usage: php tests/s3_http_feature_integration.php --run\n");
    exit(1);
}

require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/graduate_auth.php';
require_once __DIR__ . '/../api/config/forum.php';
require_once __DIR__ . '/../api/config/chat.php';
require_once __DIR__ . '/../api/config/storage.php';

$storageConfig = gradtrack_storage_config();
if (($storageConfig['environment'] ?? 'production') === 'production') {
    fwrite(STDERR, "Refusing to run the destructive integration fixture in production.\n");
    exit(1);
}
if (!gradtrack_storage_uses_s3()) {
    fwrite(STDERR, "This integration test requires FILE_STORAGE_DRIVER=s3.\n");
    exit(1);
}

function gradtrack_s3_http_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function gradtrack_s3_http_test_output(string $message): void
{
    fwrite(STDOUT, $message . PHP_EOL);
}

function gradtrack_s3_http_test_request(
    string $url,
    string $sessionId,
    string $method = 'GET',
    $body = null,
    bool $jsonBody = false
): array {
    $handle = curl_init($url);
    if ($handle === false) {
        throw new RuntimeException('Unable to initialize cURL.');
    }

    $headers = ['Accept: application/json'];
    curl_setopt_array($handle, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_COOKIE => session_name() . '=' . $sessionId,
        CURLOPT_CUSTOMREQUEST => $method,
    ]);

    if ($body !== null) {
        if ($jsonBody) {
            $encoded = json_encode($body, JSON_UNESCAPED_SLASHES);
            if ($encoded === false) {
                curl_close($handle);
                throw new RuntimeException('Unable to encode the HTTP test request.');
            }
            $headers[] = 'Content-Type: application/json';
            curl_setopt($handle, CURLOPT_POSTFIELDS, $encoded);
        } else {
            curl_setopt($handle, CURLOPT_POSTFIELDS, $body);
        }
    }
    curl_setopt($handle, CURLOPT_HTTPHEADER, $headers);

    $raw = curl_exec($handle);
    if ($raw === false) {
        $message = curl_error($handle);
        curl_close($handle);
        throw new RuntimeException('HTTP test request failed: ' . $message);
    }

    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    $headerSize = (int) curl_getinfo($handle, CURLINFO_HEADER_SIZE);
    curl_close($handle);

    $headerText = substr((string) $raw, 0, $headerSize);
    $responseBody = substr((string) $raw, $headerSize);
    $decoded = json_decode($responseBody, true);

    return [
        'status' => $status,
        'headers' => $headerText,
        'body' => $responseBody,
        'json' => is_array($decoded) ? $decoded : null,
    ];
}

function gradtrack_s3_http_test_expect_json(array $response, int $status, string $context): array
{
    $safeBody = trim((string) ($response['body'] ?? ''));
    if (strlen($safeBody) > 500) {
        $safeBody = substr($safeBody, 0, 500) . '...';
    }
    gradtrack_s3_http_test_assert(
        (int) ($response['status'] ?? 0) === $status,
        $context . ' returned HTTP ' . (int) ($response['status'] ?? 0) . ': ' . $safeBody
    );
    gradtrack_s3_http_test_assert(is_array($response['json']), $context . ' did not return JSON.');
    gradtrack_s3_http_test_assert(
        !empty($response['json']['success']),
        $context . ' returned an unsuccessful response: ' . $safeBody
    );

    return $response['json'];
}

function gradtrack_s3_http_test_fetch_url(string $url): string
{
    gradtrack_s3_http_test_assert(
        parse_url($url, PHP_URL_SCHEME) === 'https',
        'Expected a private HTTPS presigned URL.'
    );
    $handle = curl_init($url);
    if ($handle === false) {
        throw new RuntimeException('Unable to initialize the presigned URL request.');
    }
    curl_setopt_array($handle, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 60,
    ]);
    $body = curl_exec($handle);
    if ($body === false) {
        $message = curl_error($handle);
        curl_close($handle);
        throw new RuntimeException('Presigned URL request failed: ' . $message);
    }
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);
    gradtrack_s3_http_test_assert($status === 200, 'Presigned URL returned HTTP ' . $status . '.');

    return (string) $body;
}

function gradtrack_s3_http_test_location(array $response): string
{
    $matches = [];
    preg_match_all('/^Location:\s*(.+)$/mi', (string) ($response['headers'] ?? ''), $matches);
    $locations = $matches[1] ?? [];
    return count($locations) > 0 ? trim((string) end($locations)) : '';
}

function gradtrack_s3_http_test_create_identity(PDO $db, string $suffix, string $label): array
{
    $studentId = 'S3' . strtoupper(substr(hash('sha256', $suffix . ':' . $label), 0, 18));
    $email = 'gradtrack-s3-' . strtolower($label) . '-' . strtolower($suffix) . '@example.invalid';

    $graduateStmt = $db->prepare("INSERT INTO graduates
        (student_id, first_name, middle_name, last_name, email, phone, program_id, year_graduated, address, status)
        VALUES (:student_id, :first_name, NULL, :last_name, :email, NULL, NULL, :year_graduated, NULL, 'active')");
    $graduateStmt->execute([
        ':student_id' => $studentId,
        ':first_name' => 'S3' . $label,
        ':last_name' => 'IntegrationTest',
        ':email' => $email,
        ':year_graduated' => (int) date('Y'),
    ]);
    $graduateId = (int) $db->lastInsertId();

    $accountStmt = $db->prepare("INSERT INTO graduate_accounts
        (graduate_id, email, password_hash, status, alumni_verification_status, alumni_verification_submitted_at)
        VALUES (:graduate_id, :email, :password_hash, 'active', 'approved', NOW())");
    $accountStmt->execute([
        ':graduate_id' => $graduateId,
        ':email' => $email,
        ':password_hash' => password_hash(bin2hex(random_bytes(24)), PASSWORD_DEFAULT),
    ]);

    return [
        'graduate_id' => $graduateId,
        'account_id' => (int) $db->lastInsertId(),
    ];
}

function gradtrack_s3_http_test_create_session(int $accountId): string
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    $sessionId = 'gts3' . bin2hex(random_bytes(16));
    session_id($sessionId);
    if (!session_start()) {
        throw new RuntimeException('Unable to create the integration test session.');
    }
    $_SESSION = ['graduate_account_id' => $accountId];
    session_write_close();
    return $sessionId;
}

function gradtrack_s3_http_test_destroy_session(string $sessionId): void
{
    if ($sessionId === '') {
        return;
    }
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    session_id($sessionId);
    if (@session_start()) {
        $_SESSION = [];
        @session_destroy();
    }
}

function gradtrack_s3_http_test_create_room(PDO $db, int $senderId, int $recipientId, string $type, string $name): int
{
    $stmt = $db->prepare('INSERT INTO forum_chat_rooms (name, is_group, created_by) VALUES (:name, :is_group, :created_by)');
    $stmt->execute([':name' => $name, ':is_group' => $type === 'group' ? 1 : 0, ':created_by' => $senderId]);
    $roomId = (int) $db->lastInsertId();

    $memberStmt = $db->prepare('INSERT INTO forum_chat_members (room_id, graduate_id) VALUES (:room_id, :graduate_id)');
    $memberStmt->execute([':room_id' => $roomId, ':graduate_id' => $senderId]);
    $memberStmt->execute([':room_id' => $roomId, ':graduate_id' => $recipientId]);
    return $roomId;
}

function gradtrack_s3_http_test_chat_flow(
    PDO $db,
    string $baseUrl,
    string $senderSession,
    string $recipientSession,
    int $roomId,
    string $imagePath,
    string $label
): string {
    $uploadResponse = gradtrack_s3_http_test_request(
        $baseUrl . '/forum/chat-attachments.php',
        $senderSession,
        'POST',
        [
            'room_id' => (string) $roomId,
            'attachment' => new CURLFile($imagePath, 'image/png', $label . '.png'),
        ]
    );
    $uploadJson = gradtrack_s3_http_test_expect_json($uploadResponse, 200, $label . ' attachment upload');
    $attachmentId = (int) ($uploadJson['data']['attachment']['id'] ?? 0);
    gradtrack_s3_http_test_assert($attachmentId > 0, $label . ' did not return an attachment ID.');

    $attachmentStmt = $db->prepare('SELECT storage_path, message_id FROM forum_chat_message_attachments WHERE id = :id');
    $attachmentStmt->execute([':id' => $attachmentId]);
    $staged = $attachmentStmt->fetch(PDO::FETCH_ASSOC);
    $stagedKey = (string) ($staged['storage_path'] ?? '');
    gradtrack_s3_http_test_assert(
        str_starts_with($stagedKey, 'staging/chat/rooms/' . $roomId . '/'),
        $label . ' was not staged under the expected S3 prefix.'
    );
    gradtrack_s3_http_test_assert(gradtrack_storage_exists($stagedKey), $label . ' staged object does not exist in S3.');
    gradtrack_s3_http_test_assert($staged['message_id'] === null, $label . ' attachment was prematurely assigned to a message.');

    $sendResponse = gradtrack_s3_http_test_request(
        $baseUrl . '/forum/chat-messages.php',
        $senderSession,
        'POST',
        [
            'room_id' => $roomId,
            'message' => '',
            'client_message_id' => 's3-' . $label . '-' . bin2hex(random_bytes(6)),
            'attachment_ids' => [$attachmentId],
        ],
        true
    );
    gradtrack_s3_http_test_expect_json($sendResponse, 200, $label . ' message send');

    $attachmentStmt->execute([':id' => $attachmentId]);
    $promoted = $attachmentStmt->fetch(PDO::FETCH_ASSOC);
    $privateKey = (string) ($promoted['storage_path'] ?? '');
    gradtrack_s3_http_test_assert(
        str_starts_with($privateKey, 'private/chat/rooms/' . $roomId . '/attachments/'),
        $label . ' was not promoted to the private chat prefix.'
    );
    gradtrack_s3_http_test_assert((int) ($promoted['message_id'] ?? 0) > 0, $label . ' metadata was not linked to a message.');
    gradtrack_s3_http_test_assert(gradtrack_storage_exists($privateKey), $label . ' promoted object does not exist in S3.');
    gradtrack_s3_http_test_assert(!gradtrack_storage_exists($stagedKey), $label . ' staging object was not removed after commit.');

    $recipientResponse = gradtrack_s3_http_test_request(
        $baseUrl . '/forum/chat-messages.php?room_id=' . $roomId,
        $recipientSession
    );
    $recipientJson = gradtrack_s3_http_test_expect_json($recipientResponse, 200, $label . ' recipient refresh');
    $messages = (array) ($recipientJson['data']['messages'] ?? []);
    $recipientSawAttachment = false;
    foreach ($messages as $message) {
        foreach ((array) ($message['attachments'] ?? []) as $attachment) {
            if ((int) ($attachment['id'] ?? 0) === $attachmentId) {
                $recipientSawAttachment = true;
            }
        }
    }
    gradtrack_s3_http_test_assert($recipientSawAttachment, $label . ' recipient did not receive the attachment metadata.');

    $redirectResponse = gradtrack_s3_http_test_request(
        $baseUrl . '/forum/chat-attachments.php?id=' . $attachmentId,
        $recipientSession
    );
    gradtrack_s3_http_test_assert((int) $redirectResponse['status'] === 302, $label . ' access endpoint did not redirect to S3.');
    $presignedUrl = gradtrack_s3_http_test_location($redirectResponse);
    $downloaded = gradtrack_s3_http_test_fetch_url($presignedUrl);
    gradtrack_s3_http_test_assert($downloaded === file_get_contents($imagePath), $label . ' downloaded attachment content did not match.');

    gradtrack_s3_http_test_output('PASS: ' . $label . ' attachment upload, DB metadata, promotion, recipient refresh, and private access');
    return $privateKey;
}

function gradtrack_s3_http_test_delete_where_in(PDO $db, string $table, string $column, array $ids): void
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (count($ids) === 0) {
        return;
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $db->prepare("DELETE FROM {$table} WHERE {$column} IN ({$placeholders})");
    $stmt->execute($ids);
}

$db = (new Database())->getConnection();
$baseUrl = 'http://127.0.0.1/GradTrack/backend/api';
$suffix = date('ymdHis') . bin2hex(random_bytes(3));
$sender = ['graduate_id' => 0, 'account_id' => 0];
$recipient = ['graduate_id' => 0, 'account_id' => 0];
$senderSession = '';
$recipientSession = '';
$roomIds = [];
$postIds = [];
$s3Keys = [];
$temporaryFiles = [];
$exitCode = 1;

try {
    gradtrack_ensure_graduate_account_verification_schema($db);
    gradtrack_ensure_graduate_profile_image_table($db);
    gradtrack_ensure_graduate_cover_image_table($db);
    gradtrack_forum_ensure_schema($db);
    gradtrack_chat_prepare_schema($db);

    $sender = gradtrack_s3_http_test_create_identity($db, $suffix . 'a', 'Sender');
    $recipient = gradtrack_s3_http_test_create_identity($db, $suffix . 'b', 'Recipient');
    $senderSession = gradtrack_s3_http_test_create_session($sender['account_id']);
    $recipientSession = gradtrack_s3_http_test_create_session($recipient['account_id']);

    $imagePath = tempnam(sys_get_temp_dir(), 'gradtrack-s3-image-');
    gradtrack_s3_http_test_assert($imagePath !== false, 'Unable to create the temporary image path.');
    $temporaryFiles[] = $imagePath;
    $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', true);
    gradtrack_s3_http_test_assert(is_string($png) && file_put_contents($imagePath, $png) !== false, 'Unable to create the PNG fixture.');
    gradtrack_s3_http_test_assert(@getimagesize($imagePath) !== false, 'The PNG fixture is invalid.');

    gradtrack_s3_http_test_output('TEST 4 - Graduate profile image');
    $profileResponse = gradtrack_s3_http_test_request(
        $baseUrl . '/graduate-profile/index.php',
        $senderSession,
        'POST',
        ['profile_image' => new CURLFile($imagePath, 'image/png', 'profile.png')]
    );
    $profileJson = gradtrack_s3_http_test_expect_json($profileResponse, 200, 'Profile image upload');
    $profileStmt = $db->prepare('SELECT file_path FROM graduate_profile_images WHERE graduate_account_id = :account_id');
    $profileStmt->execute([':account_id' => $sender['account_id']]);
    $profileKey = (string) ($profileStmt->fetchColumn() ?: '');
    $s3Keys[] = $profileKey;
    gradtrack_s3_http_test_assert(
        str_starts_with($profileKey, 'media/profiles/graduates/' . $sender['account_id'] . '/profile/'),
        'Profile image DB value is not an S3 key.'
    );
    gradtrack_s3_http_test_assert(gradtrack_storage_exists($profileKey), 'Profile image does not exist in S3.');
    $profileUrl = (string) ($profileJson['data']['user']['profile_image_path'] ?? '');
    gradtrack_s3_http_test_assert(gradtrack_s3_http_test_fetch_url($profileUrl) === $png, 'Profile image display content did not match.');
    $profileRefresh = gradtrack_s3_http_test_request($baseUrl . '/graduate-profile/index.php', $senderSession);
    $profileRefreshJson = gradtrack_s3_http_test_expect_json($profileRefresh, 200, 'Profile refresh');
    gradtrack_s3_http_test_assert(
        gradtrack_s3_http_test_fetch_url((string) ($profileRefreshJson['data']['user']['profile_image_path'] ?? '')) === $png,
        'Profile image did not persist after refresh.'
    );
    gradtrack_s3_http_test_output('PASS: profile S3 object, raw DB key, presigned display, and refresh');

    gradtrack_s3_http_test_output('TEST 5 - Graduate cover image');
    $coverResponse = gradtrack_s3_http_test_request(
        $baseUrl . '/graduate-profile/index.php',
        $senderSession,
        'POST',
        ['cover_image' => new CURLFile($imagePath, 'image/png', 'cover.png')]
    );
    $coverJson = gradtrack_s3_http_test_expect_json($coverResponse, 200, 'Cover image upload');
    $coverStmt = $db->prepare('SELECT file_path FROM graduate_cover_images WHERE graduate_account_id = :account_id');
    $coverStmt->execute([':account_id' => $sender['account_id']]);
    $coverKey = (string) ($coverStmt->fetchColumn() ?: '');
    $s3Keys[] = $coverKey;
    gradtrack_s3_http_test_assert(
        str_starts_with($coverKey, 'media/profiles/graduates/' . $sender['account_id'] . '/cover/'),
        'Cover image DB value is not an S3 key.'
    );
    gradtrack_s3_http_test_assert(gradtrack_storage_exists($coverKey), 'Cover image does not exist in S3.');
    gradtrack_s3_http_test_assert(
        gradtrack_s3_http_test_fetch_url((string) ($coverJson['data']['user']['cover_image_path'] ?? '')) === $png,
        'Cover image display content did not match.'
    );
    $coverRefresh = gradtrack_s3_http_test_request($baseUrl . '/graduate-profile/index.php', $senderSession);
    $coverRefreshJson = gradtrack_s3_http_test_expect_json($coverRefresh, 200, 'Cover refresh');
    gradtrack_s3_http_test_assert(
        gradtrack_s3_http_test_fetch_url((string) ($coverRefreshJson['data']['user']['cover_image_path'] ?? '')) === $png,
        'Cover image did not persist after refresh.'
    );
    gradtrack_s3_http_test_output('PASS: cover S3 object, raw DB key, presigned display, and refresh');

    $roomIds[] = gradtrack_s3_http_test_create_room(
        $db,
        $sender['graduate_id'],
        $recipient['graduate_id'],
        'group',
        'S3 Community Chat ' . $suffix
    );
    gradtrack_s3_http_test_output('TEST 6 - Community Forum chat image');
    $s3Keys[] = gradtrack_s3_http_test_chat_flow(
        $db,
        $baseUrl,
        $senderSession,
        $recipientSession,
        $roomIds[count($roomIds) - 1],
        $imagePath,
        'community-chat'
    );

    $roomIds[] = gradtrack_s3_http_test_create_room(
        $db,
        $sender['graduate_id'],
        $recipient['graduate_id'],
        'direct',
        'S3 Direct Message ' . $suffix
    );
    gradtrack_s3_http_test_output('TEST 7 - Direct Messages attachment');
    $s3Keys[] = gradtrack_s3_http_test_chat_flow(
        $db,
        $baseUrl,
        $senderSession,
        $recipientSession,
        $roomIds[count($roomIds) - 1],
        $imagePath,
        'direct-message'
    );

    $roomIds[] = gradtrack_s3_http_test_create_room(
        $db,
        $sender['graduate_id'],
        $recipient['graduate_id'],
        'group',
        'S3 Group Chat ' . $suffix
    );
    gradtrack_s3_http_test_output('TEST 8 - Group chat attachment');
    $s3Keys[] = gradtrack_s3_http_test_chat_flow(
        $db,
        $baseUrl,
        $senderSession,
        $recipientSession,
        $roomIds[count($roomIds) - 1],
        $imagePath,
        'group-chat'
    );

    gradtrack_s3_http_test_output('TEST 9 - Community post image');
    $forumCreate = gradtrack_s3_http_test_request(
        $baseUrl . '/forum/posts.php',
        $senderSession,
        'POST',
        [
            'title' => 'S3 integration test ' . $suffix,
            'content' => 'Temporary GradTrack S3 integration verification.',
            'category' => 'General Discussion',
            'media[]' => new CURLFile($imagePath, 'image/png', 'community.png'),
        ]
    );
    $forumJson = gradtrack_s3_http_test_expect_json($forumCreate, 200, 'Community post image upload');
    $postId = (int) ($forumJson['id'] ?? 0);
    gradtrack_s3_http_test_assert($postId > 0, 'Community post did not return an ID.');
    $postIds[] = $postId;
    $forumMediaStmt = $db->prepare('SELECT file_path FROM forum_post_media WHERE post_id = :post_id ORDER BY id LIMIT 1');
    $forumMediaStmt->execute([':post_id' => $postId]);
    $forumKey = (string) ($forumMediaStmt->fetchColumn() ?: '');
    $s3Keys[] = $forumKey;
    gradtrack_s3_http_test_assert(
        str_starts_with($forumKey, 'media/community-forum/posts/' . $postId . '/images/'),
        'Community post DB value is not an S3 key.'
    );
    gradtrack_s3_http_test_assert(gradtrack_storage_exists($forumKey), 'Community post image does not exist in S3.');
    $forumRefresh = gradtrack_s3_http_test_request($baseUrl . '/forum/posts.php?id=' . $postId, $recipientSession);
    $forumRefreshJson = gradtrack_s3_http_test_expect_json($forumRefresh, 200, 'Community post recipient refresh');
    $forumUrl = (string) ($forumRefreshJson['data']['media'][0]['file_path'] ?? '');
    gradtrack_s3_http_test_assert(gradtrack_s3_http_test_fetch_url($forumUrl) === $png, 'Community post display content did not match.');
    $forumDelete = gradtrack_s3_http_test_request(
        $baseUrl . '/forum/posts.php?id=' . $postId,
        $senderSession,
        'DELETE'
    );
    gradtrack_s3_http_test_expect_json($forumDelete, 200, 'Community post cleanup');
    gradtrack_s3_http_test_assert(!gradtrack_storage_exists($forumKey), 'Community post DeleteObject cleanup failed.');
    $postIds = array_values(array_diff($postIds, [$postId]));
    $s3Keys = array_values(array_diff($s3Keys, [$forumKey]));
    gradtrack_s3_http_test_output('PASS: community post multipart upload, raw DB key, recipient display, refresh, and deletion');

    gradtrack_s3_http_test_output('TEST 10 - Remaining S3-enabled prefixes');
    $prefixTests = [
        'media/announcements/integration/' => 'announcement',
        'media/public-content/about/integration/' => 'public-content',
        'private/graduate-documents/integration/' => 'graduate-document',
        'private/job-support/integration/' => 'job-requirement',
        'private/mentorship/proofs/integration/' => 'mentor-proof',
        'system/branding/integration/' => 'branding',
    ];
    foreach ($prefixTests as $prefix => $category) {
        $key = $prefix . gradtrack_storage_uuid_filename('png');
        $stored = gradtrack_storage_put_file(
            $imagePath,
            $key,
            'uploads/integration/' . basename($key),
            'image/png',
            ['category' => 'integration-' . $category]
        );
        $reference = (string) $stored['reference'];
        gradtrack_s3_http_test_assert(gradtrack_storage_exists($reference), $category . ' prefix object is missing.');
        gradtrack_s3_http_test_assert(gradtrack_storage_delete($reference), $category . ' prefix DeleteObject failed.');
        gradtrack_s3_http_test_assert(!gradtrack_storage_exists($reference), $category . ' prefix deletion was not confirmed.');
        gradtrack_s3_http_test_output('PASS: ' . $prefix . ' Put/Head/Delete');
    }

    $exitCode = 0;
    gradtrack_s3_http_test_output('SUCCESS: all S3 HTTP feature integration tests passed.');
} catch (Throwable $error) {
    fwrite(STDERR, 'FAIL: ' . get_class($error) . ': ' . $error->getMessage() . PHP_EOL);
} finally {
    foreach (array_unique(array_filter($s3Keys)) as $key) {
        gradtrack_storage_delete_quietly((string) $key);
    }

    try {
        if (count($postIds) > 0) {
            gradtrack_s3_http_test_delete_where_in($db, 'forum_post_media', 'post_id', $postIds);
            gradtrack_s3_http_test_delete_where_in($db, 'forum_posts', 'id', $postIds);
        }
        if (count($roomIds) > 0) {
            gradtrack_s3_http_test_delete_where_in($db, 'forum_chat_message_attachments', 'room_id', $roomIds);
            gradtrack_s3_http_test_delete_where_in($db, 'forum_chat_messages', 'room_id', $roomIds);
            gradtrack_s3_http_test_delete_where_in($db, 'forum_chat_members', 'room_id', $roomIds);
            gradtrack_s3_http_test_delete_where_in($db, 'forum_chat_rooms', 'id', $roomIds);
        }
        $accountIds = [$sender['account_id'], $recipient['account_id']];
        $graduateIds = [$sender['graduate_id'], $recipient['graduate_id']];
        gradtrack_s3_http_test_delete_where_in($db, 'graduate_profile_images', 'graduate_account_id', $accountIds);
        gradtrack_s3_http_test_delete_where_in($db, 'graduate_cover_images', 'graduate_account_id', $accountIds);
        gradtrack_s3_http_test_delete_where_in($db, 'graduate_accounts', 'id', $accountIds);
        gradtrack_s3_http_test_delete_where_in($db, 'audit_trail', 'user_id', $graduateIds);
        gradtrack_s3_http_test_delete_where_in($db, 'graduates', 'id', $graduateIds);
    } catch (Throwable $cleanupError) {
        fwrite(STDERR, 'CLEANUP WARNING: ' . $cleanupError->getMessage() . PHP_EOL);
        $exitCode = 1;
    }

    gradtrack_s3_http_test_destroy_session($senderSession);
    gradtrack_s3_http_test_destroy_session($recipientSession);
    foreach ($temporaryFiles as $temporaryFile) {
        if (is_string($temporaryFile) && is_file($temporaryFile)) {
            @unlink($temporaryFile);
        }
    }
}

exit($exitCode);
