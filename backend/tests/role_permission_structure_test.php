<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config/admin_roles.php';
require_once __DIR__ . '/../api/config/audit_trail.php';
require_once __DIR__ . '/../api/config/forum.php';

$failures = 0;
$assert = static function (bool $condition, string $message) use (&$failures): void {
    if (!$condition) {
        $failures++;
        echo "FAIL: {$message}" . PHP_EOL;
        return;
    }
    echo "PASS: {$message}" . PHP_EOL;
};

$roles = gradtrack_admin_role_values();
$expectedRoles = [
    'admin',
    'mis_staff',
    'research_coordinator',
    'registrar',
    'alumni_president',
    'dean_cs',
    'dean_coed',
    'dean_hm',
];
$assert($roles === $expectedRoles, 'personnel role values match the final role structure');
$assert(array_intersect($roles, ['super_admin', 'superadmin', 'alumni_admin']) === [], 'obsolete role values are excluded');
$assert(gradtrack_system_admin_roles() === ['admin'], 'former Super Admin permissions belong only to Admin');
$assert(gradtrack_research_coordinator_roles() === ['research_coordinator'], 'Research Coordinator role helper remains scoped to Research Coordinator');
$assert(
    gradtrack_job_posting_admin_roles() === ['research_coordinator', 'alumni_president', 'dean_cs', 'dean_coed', 'dean_hm'],
    'job posting permissions include Research Coordinator, Alumni President, and all Deans'
);
$assert(!in_array('mis_staff', gradtrack_job_posting_admin_roles(), true), 'MIS Staff does not inherit job-posting or Coordinator permissions');
$assert(gradtrack_job_posting_auto_approval_roles() === ['alumni_president'], 'Research Coordinator and Dean job posts retain the approval workflow');
$assert(gradtrack_audit_viewer_role_is_allowed('admin'), 'Admin can view the audit trail');
$assert(!gradtrack_audit_viewer_role_is_allowed('research_coordinator'), 'Research Coordinator cannot view the audit trail');
$assert(!gradtrack_audit_viewer_role_is_allowed('alumni_president'), 'Alumni President cannot view the Research Coordinator audit trail');
$assert(!gradtrack_audit_viewer_role_is_allowed('dean_cs'), 'Dean cannot view the Research Coordinator audit trail');
$assert(gradtrack_forum_moderator_roles() === ['alumni_president'], 'forum moderation belongs to Alumni President only');

if ($failures > 0) {
    echo PHP_EOL . "{$failures} role/permission structure test(s) failed." . PHP_EOL;
    exit(1);
}

echo PHP_EOL . 'All role/permission structure tests passed.' . PHP_EOL;
