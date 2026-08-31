<?php

require_once __DIR__ . '/storage.php';

if (!function_exists('gradtrack_public_content_ensure_schema')) {
    function gradtrack_public_content_ensure_schema(PDO $db): void
    {
        $db->exec("CREATE TABLE IF NOT EXISTS website_content (
            id INT AUTO_INCREMENT PRIMARY KEY,
            page VARCHAR(40) NOT NULL,
            section_key VARCHAR(80) NOT NULL,
            title VARCHAR(255) NOT NULL,
            subtitle VARCHAR(255) NULL,
            content TEXT NOT NULL,
            image_path VARCHAR(500) NULL,
            default_image_path VARCHAR(500) NULL,
            image_alt VARCHAR(255) NULL,
            display_order INT NOT NULL DEFAULT 0,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            updated_by_admin_user_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_website_content_page_section (page, section_key),
            INDEX idx_website_content_page_order (page, is_active, display_order),
            CONSTRAINT fk_website_content_updated_by FOREIGN KEY (updated_by_admin_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $db->exec("CREATE TABLE IF NOT EXISTS faq_categories (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            display_order INT NOT NULL DEFAULT 0,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_faq_categories_order (is_active, display_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $db->exec("CREATE TABLE IF NOT EXISTS faq_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            category_id INT NOT NULL,
            question VARCHAR(500) NOT NULL,
            answer TEXT NOT NULL,
            display_order INT NOT NULL DEFAULT 0,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_faq_items_category_order (category_id, is_active, display_order),
            CONSTRAINT fk_faq_items_category FOREIGN KEY (category_id) REFERENCES faq_categories(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $db->exec("CREATE TABLE IF NOT EXISTS privacy_policy_meta (
            id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
            introductory_statement TEXT NOT NULL,
            effective_date DATE NOT NULL,
            last_updated_date DATE NOT NULL,
            updated_by_admin_user_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_privacy_policy_meta_updated_by FOREIGN KEY (updated_by_admin_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $db->exec("CREATE TABLE IF NOT EXISTS privacy_sections (
            id INT AUTO_INCREMENT PRIMARY KEY,
            heading VARCHAR(255) NOT NULL,
            content_html MEDIUMTEXT NOT NULL,
            display_order INT NOT NULL DEFAULT 0,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_privacy_sections_order (is_active, display_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        gradtrack_public_content_seed($db);
    }
}

if (!function_exists('gradtrack_public_content_seed')) {
    function gradtrack_public_content_seed(PDO $db): void
    {
        $aboutCount = (int) $db->query("SELECT COUNT(*) FROM website_content WHERE page = 'about'")->fetchColumn();
        if ($aboutCount === 0) {
            $rows = [
                ['mission', 'Our Mission', null, 'To make graduate tracer activities at Norzagaray College more organized, and reliable by providing a platform that supports graduate data management, surveys, analytics, reporting, community discussion, and job opportunities in one accessible system.', '/GradTrack_bw.png', 'GradTrack', 0],
                ['challenge', 'The Challenge:', 'Scattered & Incomplete Data', 'Colleges often rely on manual follow-ups, paper forms, or informal channels to gather graduate information. The results are scattered, hard to analyze, and rarely give a complete picture of graduate outcomes or program impact.', '/CHALLENGE (1).png', 'GradTrack challenge illustration', 1],
                ['solution', 'The Solution:', 'GradTrack', 'GradTrack centralizes the entire graduate tracking process — from structured tracer surveys to automated course-career alignment analysis — giving the college clean, actionable data in one place.', '/GRADTRACK_POV.png', 'GradTrack solution illustration', 2],
                ['impact', 'The Impact:', 'Clear Results That Support Your Work', 'GradTrack gives Norzagaray College a reliable way to track graduate outcomes and share results with faculty, administrators, and accrediting bodies. Collect employment data, review survey results, and use accurate information to support program decisions and meet reporting requirements.', '/download (2).png', 'Graduate celebrating', 3],
                ['cta', 'Ready to get started?', 'Take the Survey', 'If you are a Norzagaray College graduate, take the tracer survey now.', null, null, 4],
            ];
            $stmt = $db->prepare("INSERT INTO website_content (page, section_key, title, subtitle, content, image_path, default_image_path, image_alt, display_order) VALUES ('about', :section_key, :title, :subtitle, :content, :image_path, :default_image_path, :image_alt, :display_order)");
            foreach ($rows as $row) {
                $stmt->execute([
                    ':section_key' => $row[0], ':title' => $row[1], ':subtitle' => $row[2],
                    ':content' => $row[3], ':image_path' => $row[4], ':default_image_path' => $row[4],
                    ':image_alt' => $row[5], ':display_order' => $row[6],
                ]);
            }
        }

        $faqCount = (int) $db->query('SELECT COUNT(*) FROM faq_categories')->fetchColumn();
        if ($faqCount === 0) {
            $categories = [
                ['General', [
                    ['What is GradTrack?', "GradTrack is Norzagaray College's graduate tracer and alumni engagement system. It helps the college collect verified tracer survey responses, organize graduate records, generate outcome reports, and support graduates through a Community Forum and job opportunities.\n\nThe system keeps survey data, graduate profiles, analytics, reports, forum posts, and job posts in one connected platform."],
                    ['Who can use GradTrack?', "Norzagaray College graduates can use GradTrack to answer tracer surveys, create a Graduate Portal account, update their profile, join Community Forum discussions, and browse job opportunities.\n\nAuthorized college personnel use GradTrack to manage surveys, monitor graduate participation, review forum and job submissions, and generate reports for planning and accreditation needs."],
                    ['Do graduates need an account before taking the survey?', 'No. Graduates can start by clicking "Take Survey" and verifying their identity using their student number or email. After submitting the survey, they can create a GradTrack account to access the Graduate Portal.'],
                    ['Is GradTrack the same as a regular survey tool?', 'No. GradTrack is built specifically for graduate tracer activities. It verifies graduates before they answer, connects responses to graduate records, tracks completion, analyzes employment and course-career alignment, and extends the survey into a Graduate Portal for community discussion and job opportunities.'],
                ]],
                ['Surveys', [
                    ['How does a graduate complete a tracer survey?', 'Graduates click "Take Survey" on the homepage, verify their identity, and answer the active tracer survey online. The survey may include profile details, educational background, trainings, employment status, job details, salary range, course relevance, and feedback.'],
                    ['Can a graduate submit the survey more than once?', 'Each active survey is designed to be submitted once per verified graduate. GradTrack checks the graduate record and survey response status to help prevent duplicate submissions.'],
                    ['What happens after the survey is submitted?', 'The response is saved and linked to the verified graduate record. GradTrack then offers the graduate the option to create an account using the information already provided, so they can continue into the Graduate Portal.'],
                    ['Can survey questions be customized?', 'Yes. The survey can include sections and different question types such as text, multiple choice, radio buttons, checkboxes, and date fields. Saved survey responses can also be reviewed through analytics and reports.'],
                ]],
                ['Graduate Portal', [
                    ['What can graduates do in the Graduate Portal?', 'Graduates can update their profile, browse approved forum discussions, create their own Community Forum posts, comment on approved posts, browse approved job opportunities, and manage their own job posts if they meet the requirements.'],
                    ['Why are some portal features locked?', 'GradTrack unlocks some features based on survey information. Job posting is available to graduates marked as employed. The Community Forum is available to authenticated graduates, while posts still go through moderator review before they appear publicly.'],
                    ['How do forum posts and job posts appear in the portal?', 'Graduates can submit Community Forum posts or job posts from the portal. New or updated submissions are reviewed first, and only approved active items appear in the forum feed or Browse Jobs.'],
                    ['Can graduates comment on forum posts?', 'Yes. Graduates can open an approved forum post, read the full discussion, and leave comments that are connected to that post.'],
                ]],
                ['Data & Reports', [
                    ['What reports can GradTrack generate?', 'GradTrack can produce reports for survey participation, response rates, employment status, program and year trends, salary distribution, and course-career alignment. Reports can support academic planning, accreditation, and graduate outcome review.'],
                    ['What is course-career alignment?', "Course-career alignment checks whether a graduate's work is related to the program they completed. This helps the college understand how well academic programs connect to actual career paths."],
                    ['Is graduate data kept private?', 'Yes. Graduate records and survey responses are used for official Norzagaray College tracer, reporting, and alumni engagement purposes. Personal information is not publicly visible, and portal items such as forum posts or job posts appear only after review and approval.'],
                ]],
            ];
            $categoryStmt = $db->prepare('INSERT INTO faq_categories (name, display_order) VALUES (:name, :display_order)');
            $itemStmt = $db->prepare('INSERT INTO faq_items (category_id, question, answer, display_order) VALUES (:category_id, :question, :answer, :display_order)');
            foreach ($categories as $categoryOrder => $category) {
                $categoryStmt->execute([':name' => $category[0], ':display_order' => $categoryOrder]);
                $categoryId = (int) $db->lastInsertId();
                foreach ($category[1] as $itemOrder => $item) {
                    $itemStmt->execute([':category_id' => $categoryId, ':question' => $item[0], ':answer' => $item[1], ':display_order' => $itemOrder]);
                }
            }
        }

        $metaCount = (int) $db->query('SELECT COUNT(*) FROM privacy_policy_meta')->fetchColumn();
        if ($metaCount === 0) {
            $stmt = $db->prepare('INSERT INTO privacy_policy_meta (id, introductory_statement, effective_date, last_updated_date) VALUES (1, :statement, :effective_date, :last_updated_date)');
            $stmt->execute([
                ':statement' => 'Your privacy is important to us. Norzagaray College ("us", "we", or "our") operates the GradTrack graduate tracer system. All information provided by graduates and users of this system will be used solely for the purpose of tracking graduate outcomes, measuring program effectiveness, and supporting institutional reporting. We are committed to respecting your privacy and complying with applicable laws and regulations regarding any personal information we may collect.',
                ':effective_date' => '2026-01-01', ':last_updated_date' => '2026-01-01',
            ]);
        }

        $privacyCount = (int) $db->query('SELECT COUNT(*) FROM privacy_sections')->fetchColumn();
        if ($privacyCount === 0) {
            $sections = [
                ['Information We Collect', '<p>Information we collect includes both information you knowingly and actively provide us when using or participating in any of our services, and any information automatically sent by your devices in the course of accessing our system.</p>'],
                ['Log Data', '<p>When you visit our system, our servers may automatically log the standard data provided by your web browser. It may include your device&#039;s Internet Protocol (IP) address, your browser type and version, the pages you visit, the time and date of your visit, the time spent on each page, and other details about your visit.</p><p>Please be aware that while this information may not be personally identifying by itself, it may be possible to combine it with other data to personally identify individual persons.</p>'],
                ['Personal Information', '<p>We may ask for personal information, which may include one or more of the following:</p><ul><li>Full name</li><li>Email address</li><li>Phone/mobile number</li><li>Home/mailing address</li><li>Date of birth</li><li>Degree program and graduation year</li><li>Employment information (job title, company, industry)</li></ul>'],
                ['Legitimate Reasons for Processing Your Personal Information', '<p>We only collect and use your personal information when we have a legitimate reason for doing so. In which instance, we only collect personal information that is reasonably necessary to provide our services to you — specifically, to conduct graduate tracer studies and generate employment outcome reports for Norzagaray College.</p>'],
                ['Collection and Use of Information', '<p>We may collect personal information from you when you do any of the following on our system:</p><ul><li>Register as a graduate in the GradTrack system</li><li>Complete a tracer survey</li><li>Submit employment or career information</li><li>Use a web browser to access our content</li><li>Contact us via email or any similar technologies</li></ul>'],
                ['Security of Your Personal Information', '<p>When we collect and process personal information, and while we retain this information, we will protect it within commercially acceptable means to prevent loss and theft, as well as unauthorized access, disclosure, copying, use, or modification. Access to graduate data is restricted by role — only authorized administrators, registrars, and deans may view graduate records within their scope.</p>'],
                ['How Long We Keep Your Information', '<p>We keep your personal information only for as long as we need to. This time period may depend on what we are using your information for, in accordance with this privacy policy. If your personal information is no longer required, we will delete it or make it anonymous by removing all details that identify you.</p><p>However, if necessary, we may retain your personal information for our compliance with a legal, accounting, or reporting obligation or for archiving purposes in the public interest, scientific or historical research purposes, or statistical purposes.</p>'],
                ["Children's Privacy", '<p>We do not aim any of our products or services directly at children under the age of 13, and we do not knowingly collect personal information about children under 13. GradTrack is intended for use by college graduates and authorized institutional staff only.</p>'],
                ['Disclosure of Personal Information to Third Parties', '<p>We may disclose personal information to:</p><ul><li>Authorized personnel of Norzagaray College (administrators, registrars, deans)</li><li>Third-party service providers for the purpose of hosting and maintaining the system (e.g., cloud infrastructure providers)</li><li>Government or accrediting bodies as required by law or institutional reporting obligations</li><li>Courts, tribunals, regulatory authorities, and law enforcement officers, as required by law</li></ul>'],
                ['Your Rights and Controlling Your Personal Information', '<p>You always retain the right to withhold personal information from us, with the understanding that your experience of our system may be affected. We will not discriminate against you for exercising any of your rights over your personal information.</p><p>If you believe that any information we hold about you is inaccurate, out of date, incomplete, irrelevant, or misleading, please contact us using the details provided in this privacy policy. We will take reasonable steps to correct any information found to be inaccurate, incomplete, misleading, or out of date.</p>'],
                ['Contact Us', '<p>For any questions or concerns regarding your privacy, you may contact us using the following details:</p><p><strong>Norzagaray College — GradTrack System</strong></p><p>norzagaraycollege2007@gmail.com</p><p>Norzagaray, Bulacan | Mon–Fri: 8:00 AM – 5:00 PM</p>'],
            ];
            $stmt = $db->prepare('INSERT INTO privacy_sections (heading, content_html, display_order) VALUES (:heading, :content_html, :display_order)');
            foreach ($sections as $order => $section) {
                $stmt->execute([':heading' => $section[0], ':content_html' => $section[1], ':display_order' => $order]);
            }
        }
    }
}

if (!function_exists('gradtrack_sanitize_rich_text')) {
    function gradtrack_sanitize_rich_text(string $html): string
    {
        $html = trim($html);
        if ($html === '') return '';

        $document = new DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);
        $document->loadHTML('<?xml encoding="UTF-8"><div id="gt-root">' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        $allowed = ['p', 'strong', 'b', 'ul', 'ol', 'li', 'h2', 'h3', 'br'];
        $root = $document->getElementById('gt-root');
        if (!$root) return '';

        $clean = function (DOMNode $node) use (&$clean, $allowed): void {
            for ($child = $node->firstChild; $child !== null;) {
                $next = $child->nextSibling;
                if ($child instanceof DOMComment) {
                    $node->removeChild($child);
                } elseif ($child instanceof DOMElement) {
                    $tag = strtolower($child->tagName);
                    if (in_array($tag, ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math'], true)) {
                        $node->removeChild($child);
                    } elseif (!in_array($tag, $allowed, true)) {
                        $clean($child);
                        while ($child->firstChild) $node->insertBefore($child->firstChild, $child);
                        $node->removeChild($child);
                    } else {
                        while ($child->attributes && $child->attributes->length > 0) {
                            $child->removeAttributeNode($child->attributes->item(0));
                        }
                        $clean($child);
                    }
                }
                $child = $next;
            }
        };
        $clean($root);

        $result = '';
        foreach ($root->childNodes as $child) $result .= $document->saveHTML($child);
        return trim($result);
    }
}

if (!function_exists('gradtrack_public_content_about')) {
    function gradtrack_public_content_about(PDO $db, bool $admin): array
    {
        $sql = "SELECT id, section_key, title, subtitle, content, image_path, default_image_path, image_alt, display_order, is_active, updated_at FROM website_content WHERE page = 'about'";
        if (!$admin) $sql .= ' AND is_active = 1';
        $sql .= ' ORDER BY display_order, id';
        $rows = $db->query($sql)->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$row) {
            $rawPath = $row['image_path'] ?? null;
            $row['image_storage_path'] = $rawPath;
            $row['image_path'] = gradtrack_storage_access_reference($rawPath);
        }
        unset($row);
        return $rows;
    }
}

if (!function_exists('gradtrack_public_content_faq')) {
    function gradtrack_public_content_faq(PDO $db, bool $admin): array
    {
        $categorySql = 'SELECT id, name, display_order, is_active, updated_at FROM faq_categories';
        if (!$admin) $categorySql .= ' WHERE is_active = 1';
        $categorySql .= ' ORDER BY display_order, id';
        $categories = $db->query($categorySql)->fetchAll(PDO::FETCH_ASSOC);
        $itemSql = 'SELECT id, category_id, question, answer, display_order, is_active, updated_at FROM faq_items';
        if (!$admin) $itemSql .= ' WHERE is_active = 1';
        $itemSql .= ' ORDER BY display_order, id';
        $items = $db->query($itemSql)->fetchAll(PDO::FETCH_ASSOC);
        $byCategory = [];
        foreach ($items as $item) $byCategory[(int) $item['category_id']][] = $item;
        foreach ($categories as &$category) $category['items'] = $byCategory[(int) $category['id']] ?? [];
        unset($category);
        return $categories;
    }
}

if (!function_exists('gradtrack_public_content_privacy')) {
    function gradtrack_public_content_privacy(PDO $db, bool $admin): array
    {
        $meta = $db->query('SELECT introductory_statement, effective_date, last_updated_date, updated_at FROM privacy_policy_meta WHERE id = 1')->fetch(PDO::FETCH_ASSOC) ?: [];
        $sql = 'SELECT id, heading, content_html, display_order, is_active, updated_at FROM privacy_sections';
        if (!$admin) $sql .= ' WHERE is_active = 1';
        $sql .= ' ORDER BY display_order, id';
        $sections = $db->query($sql)->fetchAll(PDO::FETCH_ASSOC);
        foreach ($sections as &$section) $section['content_html'] = gradtrack_sanitize_rich_text((string) $section['content_html']);
        unset($section);
        return ['meta' => $meta, 'sections' => $sections];
    }
}

if (!function_exists('gradtrack_public_content_payload')) {
    function gradtrack_public_content_payload(PDO $db, string $page, bool $admin = false): array
    {
        gradtrack_public_content_ensure_schema($db);
        if ($page === 'about') return ['success' => true, 'page' => 'about', 'sections' => gradtrack_public_content_about($db, $admin)];
        if ($page === 'faq') return ['success' => true, 'page' => 'faq', 'categories' => gradtrack_public_content_faq($db, $admin)];
        if ($page === 'privacy') return ['success' => true, 'page' => 'privacy'] + gradtrack_public_content_privacy($db, $admin);
        throw new InvalidArgumentException('Unsupported public content page.');
    }
}

if (!function_exists('gradtrack_public_content_sync_about')) {
    function gradtrack_public_content_sync_about(PDO $db, array $sections, int $adminId): array
    {
        $existing = [];
        foreach (gradtrack_public_content_about($db, true) as $row) $existing[(int) $row['id']] = $row;
        if (count($sections) !== count($existing)) throw new InvalidArgumentException('All About page sections must be included.');
        $stmt = $db->prepare("UPDATE website_content SET title=:title, subtitle=:subtitle, content=:content, image_path=:image_path, image_alt=:image_alt, display_order=:display_order, is_active=:is_active, updated_by_admin_user_id=:admin_id WHERE id=:id AND page='about'");
        $replacedPaths = [];
        foreach ($sections as $order => $section) {
            $id = (int) ($section['id'] ?? 0);
            if (!isset($existing[$id])) throw new InvalidArgumentException('Invalid About page section.');
            $title = trim((string) ($section['title'] ?? ''));
            $content = trim((string) ($section['content'] ?? ''));
            if ($title === '' || $content === '') throw new InvalidArgumentException('About section titles and descriptions are required.');
            if (($existing[$id]['section_key'] ?? '') === 'cta' && trim((string) ($section['subtitle'] ?? '')) === '') throw new InvalidArgumentException('The About page call-to-action button label is required.');
            if (mb_strlen($title) > 255 || mb_strlen($content) > 10000) throw new InvalidArgumentException('About page content is too long.');
            $imagePath = array_key_exists('image_storage_path', $section)
                ? $section['image_storage_path']
                : ($section['image_path'] ?? null);
            if ($imagePath !== null && $imagePath !== '') {
                $imagePath = (string) $imagePath;
                $isDefault = $imagePath === (string) ($existing[$id]['default_image_path'] ?? '');
                $isLegacyUpload = preg_match('#^uploads/public-content/about/[a-zA-Z0-9._-]+$#', $imagePath) === 1;
                $isS3Upload = preg_match('#^media/public-content/about/' . $id . '/[a-f0-9-]+\.(jpg|png|webp)$#', $imagePath) === 1;
                if (!$isDefault && !$isLegacyUpload && !$isS3Upload) throw new InvalidArgumentException('Invalid About image path.');
            } else $imagePath = null;

            $existingPath = $existing[$id]['image_storage_path'] ?? null;
            $defaultPath = $existing[$id]['default_image_path'] ?? null;
            if ($existingPath && $existingPath !== $imagePath && $existingPath !== $defaultPath) {
                $replacedPaths[] = $existingPath;
            }
            $stmt->execute([
                ':title' => $title, ':subtitle' => trim((string) ($section['subtitle'] ?? '')) ?: null,
                ':content' => $content, ':image_path' => $imagePath,
                ':image_alt' => trim((string) ($section['image_alt'] ?? '')) ?: null,
                ':display_order' => $order, ':is_active' => !empty($section['is_active']) ? 1 : 0,
                ':admin_id' => $adminId, ':id' => $id,
            ]);
        }
        return array_values(array_unique($replacedPaths));
    }
}

if (!function_exists('gradtrack_public_content_sync_faq')) {
    function gradtrack_public_content_sync_faq(PDO $db, array $categories): void
    {
        if (count($categories) > 50) throw new InvalidArgumentException('FAQ supports up to 50 categories.');
        $keptCategories = [];
        $keptItems = [];
        $insertCategory = $db->prepare('INSERT INTO faq_categories (name, display_order, is_active) VALUES (:name, :display_order, :is_active)');
        $updateCategory = $db->prepare('UPDATE faq_categories SET name=:name, display_order=:display_order, is_active=:is_active WHERE id=:id');
        $insertItem = $db->prepare('INSERT INTO faq_items (category_id, question, answer, display_order, is_active) VALUES (:category_id, :question, :answer, :display_order, :is_active)');
        $updateItem = $db->prepare('UPDATE faq_items SET category_id=:category_id, question=:question, answer=:answer, display_order=:display_order, is_active=:is_active WHERE id=:id');
        foreach ($categories as $categoryOrder => $category) {
            $name = trim((string) ($category['name'] ?? ''));
            if ($name === '' || mb_strlen($name) > 150) throw new InvalidArgumentException('Each FAQ category needs a valid name.');
            $params = [':name' => $name, ':display_order' => $categoryOrder, ':is_active' => !empty($category['is_active']) ? 1 : 0];
            $categoryId = (int) ($category['id'] ?? 0);
            if ($categoryId > 0) {
                $params[':id'] = $categoryId;
                $updateCategory->execute($params);
                if ($updateCategory->rowCount() === 0) {
                    $check = $db->prepare('SELECT id FROM faq_categories WHERE id=:id'); $check->execute([':id' => $categoryId]);
                    if (!$check->fetchColumn()) throw new InvalidArgumentException('Invalid FAQ category.');
                }
            } else {
                $insertCategory->execute($params); $categoryId = (int) $db->lastInsertId();
            }
            $keptCategories[] = $categoryId;
            $items = is_array($category['items'] ?? null) ? $category['items'] : [];
            if (count($items) > 100) throw new InvalidArgumentException('Each FAQ category supports up to 100 questions.');
            foreach ($items as $itemOrder => $item) {
                $question = trim((string) ($item['question'] ?? ''));
                $answer = trim((string) ($item['answer'] ?? ''));
                if ($question === '' || $answer === '') throw new InvalidArgumentException('FAQ questions and answers cannot be empty.');
                if (mb_strlen($question) > 500 || mb_strlen($answer) > 20000) throw new InvalidArgumentException('FAQ content is too long.');
                $itemParams = [':category_id' => $categoryId, ':question' => $question, ':answer' => $answer, ':display_order' => $itemOrder, ':is_active' => !empty($item['is_active']) ? 1 : 0];
                $itemId = (int) ($item['id'] ?? 0);
                if ($itemId > 0) {
                    $itemParams[':id'] = $itemId; $updateItem->execute($itemParams);
                    if ($updateItem->rowCount() === 0) {
                        $check = $db->prepare('SELECT id FROM faq_items WHERE id=:id'); $check->execute([':id' => $itemId]);
                        if (!$check->fetchColumn()) throw new InvalidArgumentException('Invalid FAQ item.');
                    }
                } else {
                    $insertItem->execute($itemParams); $itemId = (int) $db->lastInsertId();
                }
                $keptItems[] = $itemId;
            }
        }
        if ($keptItems) {
            $marks = implode(',', array_fill(0, count($keptItems), '?'));
            $db->prepare("DELETE FROM faq_items WHERE id NOT IN ($marks)")->execute($keptItems);
        } else $db->exec('DELETE FROM faq_items');
        if ($keptCategories) {
            $marks = implode(',', array_fill(0, count($keptCategories), '?'));
            $db->prepare("DELETE FROM faq_categories WHERE id NOT IN ($marks)")->execute($keptCategories);
        } else $db->exec('DELETE FROM faq_categories');
    }
}

if (!function_exists('gradtrack_public_content_sync_privacy')) {
    function gradtrack_public_content_sync_privacy(PDO $db, array $meta, array $sections, int $adminId): void
    {
        $statement = trim((string) ($meta['introductory_statement'] ?? ''));
        $effective = trim((string) ($meta['effective_date'] ?? ''));
        $updated = trim((string) ($meta['last_updated_date'] ?? ''));
        if ($statement === '' || mb_strlen($statement) > 20000) throw new InvalidArgumentException('A valid introductory privacy statement is required.');
        foreach ([$effective, $updated] as $date) {
            $parsed = DateTime::createFromFormat('Y-m-d', $date);
            if (!$parsed || $parsed->format('Y-m-d') !== $date) throw new InvalidArgumentException('Privacy policy dates must be valid.');
        }
        if (count($sections) > 100) throw new InvalidArgumentException('Privacy Policy supports up to 100 sections.');
        $metaStmt = $db->prepare('UPDATE privacy_policy_meta SET introductory_statement=:statement, effective_date=:effective, last_updated_date=:updated, updated_by_admin_user_id=:admin_id WHERE id=1');
        $metaStmt->execute([':statement' => $statement, ':effective' => $effective, ':updated' => $updated, ':admin_id' => $adminId]);
        $kept = [];
        $insert = $db->prepare('INSERT INTO privacy_sections (heading, content_html, display_order, is_active) VALUES (:heading, :content, :display_order, :is_active)');
        $updateStmt = $db->prepare('UPDATE privacy_sections SET heading=:heading, content_html=:content, display_order=:display_order, is_active=:is_active WHERE id=:id');
        foreach ($sections as $order => $section) {
            $heading = trim((string) ($section['heading'] ?? ''));
            $content = gradtrack_sanitize_rich_text((string) ($section['content_html'] ?? ''));
            if ($heading === '' || trim(strip_tags($content)) === '') throw new InvalidArgumentException('Privacy section headings and content cannot be empty.');
            if (mb_strlen($heading) > 255 || mb_strlen($content) > 100000) throw new InvalidArgumentException('Privacy section content is too long.');
            $params = [':heading' => $heading, ':content' => $content, ':display_order' => $order, ':is_active' => !empty($section['is_active']) ? 1 : 0];
            $id = (int) ($section['id'] ?? 0);
            if ($id > 0) {
                $params[':id'] = $id; $updateStmt->execute($params);
                if ($updateStmt->rowCount() === 0) {
                    $check = $db->prepare('SELECT id FROM privacy_sections WHERE id=:id'); $check->execute([':id' => $id]);
                    if (!$check->fetchColumn()) throw new InvalidArgumentException('Invalid Privacy Policy section.');
                }
            } else {
                $insert->execute($params); $id = (int) $db->lastInsertId();
            }
            $kept[] = $id;
        }
        if ($kept) {
            $marks = implode(',', array_fill(0, count($kept), '?'));
            $db->prepare("DELETE FROM privacy_sections WHERE id NOT IN ($marks)")->execute($kept);
        } else $db->exec('DELETE FROM privacy_sections');
    }
}

if (!function_exists('gradtrack_public_content_save_about_image')) {
    function gradtrack_public_content_save_about_image(array $file, int $contentId): string
    {
        if ((int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) throw new InvalidArgumentException('The image upload failed.');
        $size = (int) ($file['size'] ?? 0);
        if ($size <= 0 || $size > 4 * 1024 * 1024) throw new InvalidArgumentException('About images must be 4 MB or smaller.');
        $tmp = (string) ($file['tmp_name'] ?? '');
        if ($tmp === '' || !is_uploaded_file($tmp)) throw new InvalidArgumentException('The uploaded About image is invalid.');
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = (string) $finfo->file($tmp);
        $types = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
        $imageInfo = @getimagesize($tmp);
        if (!isset($types[$mime]) || $imageInfo === false
            || (int) $imageInfo[0] < 1 || (int) $imageInfo[1] < 1
            || (int) $imageInfo[0] > 8192 || (int) $imageInfo[1] > 8192) {
            throw new InvalidArgumentException('Use a valid JPG, PNG, or WebP image with safe dimensions.');
        }
        $originalName = gradtrack_storage_safe_download_name((string) ($file['name'] ?? 'about-image'));
        if (gradtrack_storage_filename_has_dangerous_segment($originalName)) {
            throw new InvalidArgumentException('The image filename is not allowed.');
        }
        $submittedExtension = strtolower((string) pathinfo($originalName, PATHINFO_EXTENSION));
        $allowedExtensions = $mime === 'image/jpeg' ? ['jpg', 'jpeg'] : [$types[$mime]];
        if (!in_array($submittedExtension, $allowedExtensions, true)) {
            throw new InvalidArgumentException('The image extension does not match its content.');
        }
        $name = gradtrack_storage_uuid_filename($types[$mime]);
        $storageResult = gradtrack_storage_put_file(
            $tmp,
            'media/public-content/about/' . $contentId . '/' . $name,
            'uploads/public-content/about/' . $name,
            $mime,
            ['category' => 'about-content', 'content-id' => (string) $contentId]
        );
        return (string) $storageResult['reference'];
    }
}
