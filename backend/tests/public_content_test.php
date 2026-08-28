<?php
require_once __DIR__ . '/../api/config/database.php';
require_once __DIR__ . '/../api/config/public_content.php';

function assert_public_content(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$db = (new Database())->getConnection();
gradtrack_public_content_ensure_schema($db);
$adminId = (int) $db->query("SELECT id FROM admin_users WHERE role = 'super_admin' ORDER BY is_active DESC, id LIMIT 1")->fetchColumn();
assert_public_content($adminId > 0, 'A Super Admin account is required for this test.');

$about = gradtrack_public_content_about($db, true);
$db->beginTransaction();
try {
    gradtrack_public_content_sync_about($db, $about, $adminId);
    assert_public_content(count(gradtrack_public_content_about($db, true)) === count($about), 'About sync changed the section count.');
    $db->rollBack();
} catch (Throwable $error) {
    if ($db->inTransaction()) $db->rollBack();
    throw $error;
}

$faq = gradtrack_public_content_faq($db, true);
$categoryCount = count($faq);
$db->beginTransaction();
try {
    $reordered = $faq;
    if (count($reordered) > 1) [$reordered[0], $reordered[1]] = [$reordered[1], $reordered[0]];
    if (!empty($reordered[0]['items'])) $reordered[0]['items'][0]['is_active'] = 0;
    $reordered[] = [
        'name' => 'Temporary Test Category', 'is_active' => 1,
        'items' => [['question' => 'Temporary question?', 'answer' => 'Temporary answer.', 'is_active' => 1]],
    ];
    gradtrack_public_content_sync_faq($db, $reordered);
    $savedFaq = gradtrack_public_content_faq($db, true);
    assert_public_content(count($savedFaq) === $categoryCount + 1, 'FAQ create failed.');
    assert_public_content($savedFaq[0]['name'] === $reordered[0]['name'], 'FAQ reorder failed.');
    assert_public_content((int) $savedFaq[0]['items'][0]['is_active'] === 0, 'FAQ visibility toggle failed.');
    $db->rollBack();
} catch (Throwable $error) {
    if ($db->inTransaction()) $db->rollBack();
    throw $error;
}

$db->beginTransaction();
try {
    $reduced = array_slice($faq, 0, -1);
    gradtrack_public_content_sync_faq($db, $reduced);
    assert_public_content(count(gradtrack_public_content_faq($db, true)) === $categoryCount - 1, 'FAQ delete failed.');
    $db->rollBack();
} catch (Throwable $error) {
    if ($db->inTransaction()) $db->rollBack();
    throw $error;
}

$privacy = gradtrack_public_content_privacy($db, true);
$db->beginTransaction();
try {
    $sections = $privacy['sections'];
    $sections[] = ['heading' => 'Temporary Section', 'content_html' => '<p onclick="bad()">Safe text</p><script>alert(1)</script>', 'is_active' => 1];
    gradtrack_public_content_sync_privacy($db, $privacy['meta'], $sections, $adminId);
    $savedPrivacy = gradtrack_public_content_privacy($db, true);
    $last = end($savedPrivacy['sections']);
    assert_public_content(strpos($last['content_html'], 'script') === false, 'Privacy script sanitization failed.');
    assert_public_content(strpos($last['content_html'], 'onclick') === false, 'Privacy attribute sanitization failed.');
    $db->rollBack();
} catch (Throwable $error) {
    if ($db->inTransaction()) $db->rollBack();
    throw $error;
}

echo "Public content database tests passed.\n";
