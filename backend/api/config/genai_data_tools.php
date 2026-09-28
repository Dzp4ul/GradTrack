<?php
require_once __DIR__ . '/graduate_auth.php';
require_once __DIR__ . '/alumni_registry.php';
require_once __DIR__ . '/graduation_years.php';
require_once __DIR__ . '/survey_response_analytics.php';

if (!function_exists('gradtrack_genai_data_tool_catalog')) {
    function gradtrack_genai_data_tool_catalog(): array
    {
        return [
            'alumni_verification_summary' => [
                'roles' => ['alumni_president'],
                'feature' => 'Alumni Verification',
                'description' => 'Approved, pending, and rejected Graduate Portal verification accounts.',
                'metrics' => ['summary', 'approved', 'pending', 'rejected'],
            ],
            'alumni_verification_list' => [
                'roles' => ['alumni_president'],
                'feature' => 'Alumni Verification',
                'description' => 'A limited list of alumni verification accounts by pending, approved, or rejected status.',
                'metrics' => ['summary', 'pending', 'approved', 'rejected'],
            ],
            'alumni_registry_summary' => [
                'roles' => ['alumni_president'],
                'feature' => 'Registered Alumni',
                'description' => 'Official alumni totals, survey-completion status, and counts by program.',
                'metrics' => ['summary', 'total', 'answered', 'not_answered', 'by_program', 'program'],
            ],
            'alumni_registry_list' => [
                'roles' => ['alumni_president'],
                'feature' => 'Registered Alumni',
                'description' => 'A limited list of non-archived official alumni registry records, optionally for one program.',
                'metrics' => ['summary', 'verified', 'registered', 'unclaimed', 'inactive'],
            ],
            'survey_participation' => [
                'roles' => ['research_coordinator', 'dean_cs', 'dean_coed', 'dean_hm'],
                'feature' => 'Survey Participation',
                'description' => 'The active survey and its eligible graduate, answered, not-answered, and response-rate totals. Dean results are restricted to assigned programs.',
                'metrics' => ['summary', 'current_survey', 'total', 'answered', 'not_answered', 'response_rate', 'by_program', 'by_year'],
            ],
            'survey_participation_list' => [
                'roles' => ['research_coordinator', 'dean_cs', 'dean_coed', 'dean_hm'],
                'feature' => 'Survey Participation',
                'description' => 'A limited list of graduates covered by the active survey, optionally filtered to answered or not answered. Dean rows are restricted to assigned programs.',
                'metrics' => ['summary', 'answered', 'not_answered'],
            ],
            'report_analytics' => [
                'roles' => ['research_coordinator', 'dean_cs', 'dean_coed', 'dean_hm'],
                'feature' => 'Reports & Analytics',
                'description' => 'Submitted tracer-study response analytics, including employment, salary, alignment, program, and graduation-year results.',
                'metrics' => ['summary', 'employed', 'unemployed', 'employment_rate', 'alignment_rate'],
            ],
            'employment_status_list' => [
                'roles' => ['research_coordinator', 'dean_cs', 'dean_coed', 'dean_hm'],
                'feature' => 'Employment Status',
                'description' => 'A paginated list of submitted tracer-study respondents classified as employed or unemployed. Dean rows are restricted to assigned programs.',
                'metrics' => ['employed', 'unemployed'],
            ],
            'graduate_program_counts' => [
                'roles' => ['research_coordinator', 'registrar'],
                'feature' => 'Graduate Records',
                'description' => 'Non-archived graduate-record totals overall or by program.',
                'metrics' => ['total', 'by_program', 'program'],
            ],
            'graduate_record_list' => [
                'roles' => ['registrar'],
                'feature' => 'Manage Graduates',
                'description' => 'A limited list of non-archived graduate records, optionally for one program.',
                'metrics' => ['summary'],
            ],
            'job_approval_summary' => ['roles' => ['alumni_president'], 'feature' => 'Job Approval', 'description' => 'Pending, approved, and declined alumni job-post totals.', 'metrics' => ['summary', 'pending', 'approved', 'declined']],
            'managed_job_summary' => ['roles' => ['research_coordinator', 'alumni_president', 'dean_cs', 'dean_coed', 'dean_hm'], 'feature' => 'Job Postings', 'description' => 'Published and archived job postings created by the authenticated administrator.', 'metrics' => ['summary', 'published', 'archived']],
            'forum_moderation_summary' => ['roles' => ['alumni_president'], 'feature' => 'Forum Moderation', 'description' => 'Pending, resolved, and dismissed forum-report totals.', 'metrics' => ['summary', 'pending', 'resolved', 'dismissed']],
            'announcement_summary' => ['roles' => ['alumni_president'], 'feature' => 'Announcements', 'description' => 'Draft, published, and archived administrator-announcement totals.', 'metrics' => ['summary', 'draft', 'published', 'archived']],
            'system_user_summary' => ['roles' => ['admin'], 'feature' => 'User Management', 'description' => 'Active and inactive administrator-account totals.', 'metrics' => ['summary', 'active', 'inactive']],
            'system_dashboard_statistics' => ['roles' => ['admin'], 'feature' => 'System Statistics', 'description' => 'High-level authorized table totals for the Admin.', 'metrics' => ['summary', 'admin_users', 'graduates', 'alumni_accounts', 'surveys', 'submitted_survey_responses']],
        ];
    }
}

if (!function_exists('gradtrack_genai_data_tool_is_allowed')) {
    function gradtrack_genai_data_tool_is_allowed(string $tool, string $role): bool
    {
        $catalog = gradtrack_genai_data_tool_catalog();
        return isset($catalog[$tool]) && in_array($role, $catalog[$tool]['roles'], true);
    }
}

if (!function_exists('gradtrack_genai_normalize_question')) {
    function gradtrack_genai_normalize_question(string $message): string
    {
        $text = strtolower(trim((string) (preg_replace('/\s+/u', ' ', $message) ?? $message)));
        return str_replace(['’', '‘'], "'", $text);
    }
}

if (!function_exists('gradtrack_genai_detect_language')) {
    function gradtrack_genai_detect_language(string $message): string
    {
        $text = gradtrack_genai_normalize_question($message);
        preg_match_all('/\b(paano|papaano|saan|nasaan|ilan|ano|alin|sino|kailan|bakit|pwede|maaari|gusto|ko|mo|namin|amin|akin|yung|iyong|ang|mga|para|mula|dito|doon|makikita|sagutan|sasagutan|sumagot|hindi|wala|mayroon|meron|nakabinbin|aprubado|tinanggihan|burahin|tanggalin)\b/ui', $text, $filipinoMatches);
        preg_match_all('/\b(how|what|where|which|who|when|why|can|could|please|show|find|view|open|create|edit|delete|survey|graduates?|alumni|responses?|records?|page|button|current|available)\b/i', $text, $englishMatches);
        $filipinoCount = count($filipinoMatches[0] ?? []);
        $englishCount = count($englishMatches[0] ?? []);

        if ($filipinoCount === 0) return 'english';
        return $englishCount > 0 ? 'taglish' : 'filipino';
    }
}

if (!function_exists('gradtrack_genai_question_requests_data')) {
    function gradtrack_genai_question_requests_data(string $message): bool
    {
        $text = gradtrack_genai_normalize_question($message);
        return preg_match('/\b(how\s+many|number\s+of|count|total|summary|statistics?|status|rate|percentage|percent|compare|comparison|versus|vs|most|least|pending|approved|rejected|declined|answered|unanswered|responded|completed|waiting|active|inactive|published|draft|resolved|dismissed)\b/i', $text) === 1
            || preg_match('/\b(ilan|bilang|gaano\s+karami|nakatapos|sumagot|hindi\s+(?:pa\s+)?sumagot|wala\s+pang\s+sagot|nakabinbin|hinihintay|aprubado|tinanggihan|pinakamarami)\b/ui', $text) === 1
            || preg_match('/\b(?:graduates?|alumni)\s+(?:per|by)\s+(?:program|course|batch|year)\b/i', $text) === 1
            || preg_match('/\b(?:what|which|ano|alin)\b.{0,30}\b(?:current|active|kasalukuyan)\b.{0,20}\bsurvey\b/ui', $text) === 1;
    }
}

if (!function_exists('gradtrack_genai_question_requests_list')) {
    function gradtrack_genai_question_requests_list(string $message): bool
    {
        $text = gradtrack_genai_normalize_question($message);
        return preg_match('/\b(list|show(?:\s+me)?|display|give\s+me|which\s+(?:graduates?|alumni)|who\s+(?:has|have|is|are|hasn\'?t|haven\'?t|didn\'?t))\b/i', $text) === 1
            || preg_match('/\b(ilista|ipakita|sino|anu-ano|ano-anong)\b/ui', $text) === 1;
    }
}

if (!function_exists('gradtrack_genai_requested_metric')) {
    function gradtrack_genai_requested_metric(string $message): string
    {
        $text = gradtrack_genai_normalize_question($message);
        if (preg_match('/\b(?:current|active|kasalukuyan)\b.{0,20}\bsurvey\b|\bsurvey\b.{0,20}\b(?:current|active|kasalukuyan)\b/ui', $text) === 1) return 'current_survey';
        if (preg_match('/\b(?:compare|comparison|versus|vs)\b.{0,60}\b(?:batch|batches|years?|cohorts?|(?:19|20)\d{2})\b/i', $text) === 1
            || preg_match_all('/\b(?:19|20)\d{2}\b/', $text) >= 2) return 'by_year';
        if (preg_match('/\b(?:compare|comparison|versus|vs)\b.{0,80}\b(?:programs?|courses?|BSCS|ACT|BSHM|BSHRM|BSED|BEED|BSN)\b/i', $text) === 1
            || count(gradtrack_genai_requested_program_codes($message)) >= 2) return 'by_program';
        if (preg_match('/\b(which|what)\s+program\b|\bprogram\b.{0,30}\b(most|highest|largest)\b|\b(most|highest|largest)\b.{0,30}\bprogram\b|\bpinakamarami\b/ui', $text) === 1) return 'by_program';
        $statusFamilies = 0;
        foreach ([
            '/\b(approved|verified|aprubado)\b/ui',
            '/\b(pending|waiting|unverified|nakabinbin|hinihintay)\b/ui',
            '/\b(rejected|declined|tinanggihan)\b/ui',
        ] as $pattern) {
            if (preg_match($pattern, $text) === 1) $statusFamilies++;
        }
        if ($statusFamilies > 1) return 'summary';
        if (preg_match('/\b(rejected|declined|tinanggihan)\b/ui', $text) === 1) return 'rejected';
        if (preg_match('/\b(pending|waiting|unverified|nakabinbin|hinihintay)\b/ui', $text) === 1) return 'pending';
        if (preg_match('/\b(not\s+answered|unanswered|not\s+responded|no\s+response|haven\'?t\s+answered|have\s+not\s+answered|hindi\s+(?:pa\s+)?sumagot|wala\s+pang\s+sagot)\b/ui', $text) === 1) return 'not_answered';
        if (preg_match('/\b(done\s+answering|answered|responded|completed|finished|nakatapos|sumagot)\b/ui', $text) === 1) return 'answered';
        if (preg_match('/\b(approved|verified|aprubado)\b/ui', $text) === 1) return 'approved';
        if (preg_match('/\b(inactive|deactivated|disabled)\b/i', $text) === 1) return 'inactive';
        if (preg_match('/\b(active|enabled)\b/i', $text) === 1) return 'active';
        if (preg_match('/\b(unclaimed)\b/i', $text) === 1) return 'unclaimed';
        if (preg_match('/\b(registered)\b/i', $text) === 1) return 'registered';
        if (preg_match('/\b(published)\b/i', $text) === 1) return 'published';
        if (preg_match('/\b(draft)\b/i', $text) === 1) return 'draft';
        if (preg_match('/\b(resolved)\b/i', $text) === 1) return 'resolved';
        if (preg_match('/\b(dismissed)\b/i', $text) === 1) return 'dismissed';
        if (preg_match('/\b(per|by)\s+(?:program|course)|\b(?:program|course)\s+(?:counts?|breakdown)|\bpinakamarami\b/ui', $text) === 1) return 'by_program';
        return 'summary';
    }
}

if (!function_exists('gradtrack_genai_requested_program_codes')) {
    function gradtrack_genai_requested_program_codes(string $message): array
    {
        if (preg_match_all('/\b(BSCS|ACT|BSHM|BSHRM|BSED|BEED|BSN)\b/i', $message, $matches) < 1) {
            return [];
        }
        return array_values(array_unique(array_map(static function (string $code): string {
            $normalized = strtoupper($code);
            return $normalized === 'BSHRM' ? 'BSHM' : $normalized;
        }, $matches[1])));
    }
}

if (!function_exists('gradtrack_genai_requested_program_code')) {
    function gradtrack_genai_requested_program_code(string $message): ?string
    {
        return gradtrack_genai_requested_program_codes($message)[0] ?? null;
    }
}

if (!function_exists('gradtrack_genai_requested_graduation_years')) {
    function gradtrack_genai_requested_graduation_years(string $message): array
    {
        if (preg_match_all('/\b((?:19|20)\d{2})\b/', $message, $matches) < 1) {
            return [];
        }
        return array_values(array_unique(array_map('intval', $matches[1])));
    }
}

if (!function_exists('gradtrack_genai_requested_graduation_year')) {
    function gradtrack_genai_requested_graduation_year(string $message): ?int
    {
        return gradtrack_genai_requested_graduation_years($message)[0] ?? null;
    }
}

if (!function_exists('gradtrack_genai_requested_export_formats')) {
    function gradtrack_genai_requested_export_formats(string $message): array
    {
        $formats = [];
        if (preg_match('/\b(?:pdf|portable\s+document)\b/i', $message) === 1) $formats[] = 'pdf';
        if (preg_match('/\b(?:excel|xlsx|spreadsheet)\b/i', $message) === 1) $formats[] = 'xlsx';
        if (preg_match('/\bcsv\b/i', $message) === 1) $formats[] = 'csv';
        return array_values(array_unique($formats));
    }
}

if (!function_exists('gradtrack_genai_resolve_data_tool')) {
    /**
     * Selects one whitelisted aggregate tool. Page and conversation context are
     * hints only; the authenticated role is always checked against the catalog.
     */
    function gradtrack_genai_resolve_data_tool(
        string $message,
        string $role,
        ?string $lastDataTool = null,
        array $pageContext = [],
        array $previousResolution = []
    ): ?array
    {
        $text = gradtrack_genai_normalize_question($message);
        $metric = gradtrack_genai_requested_metric($message);
        $programCodes = gradtrack_genai_requested_program_codes($message);
        $graduationYears = gradtrack_genai_requested_graduation_years($message);
        $programCode = count($programCodes) === 1 ? $programCodes[0] : null;
        $graduationYear = count($graduationYears) === 1 ? $graduationYears[0] : null;
        $requestsData = gradtrack_genai_question_requests_data($message);
        $requestsList = gradtrack_genai_question_requests_list($message);
        $requestedExportFormats = gradtrack_genai_requested_export_formats($message);
        $tool = null;
        $isPaginationFollowUp = preg_match('/^(?:please\s+)?(?:show\s+)?(?:me\s+)?(?:more|next(?:\s+10)?|next\s+page)(?:\s+(?:records?|results?|graduates?|alumni))?[.!?]*$/ui', $text) === 1;
        $isFilterFollowUp = preg_match('/^(?:(?:show|give)\s+(?:me\s+)?)?(?:only\s+)?(?:(?:the\s+)?(?:BSCS|ACT|BSHM|BSHRM|BSED|BEED|BSN)(?:\s+(?:ones?|graduates?|alumni))?|(?:batch|class\s+of|year)?\s*(?:19|20)\d{2})(?:\s+only)?[.!?]*$/ui', $text) === 1;
        $isCountFollowUp = preg_match('/^(?:and\s+)?(?:how\s+many|ilan)(?:\s+(?:are\s+there|ang\s+(?:mga\s+)?(?:ito|iyon)|lahat))?[.!?]*$/ui', $text) === 1;
        $isExportFollowUp = !empty($requestedExportFormats)
            && str_word_count($text) <= 12
            && preg_match('/\b(?:export|download|generate|create|make|convert|file|format|pdf|excel|xlsx|csv|spreadsheet)\b/i', $text) === 1;

        if (($isPaginationFollowUp || $isFilterFollowUp || $isCountFollowUp || $isExportFollowUp) && $lastDataTool !== null) {
            $tool = $lastDataTool;
            if (is_string($previousResolution['metric'] ?? null)) {
                $metric = (string)$previousResolution['metric'];
            }
            if (empty($programCodes) && is_array($previousResolution['program_codes'] ?? null)) {
                $programCodes = array_values(array_filter(array_map('strtoupper', $previousResolution['program_codes']), 'is_string'));
            }
            if ($programCode === null && is_string($previousResolution['program_code'] ?? null)) {
                $programCode = (string)$previousResolution['program_code'];
            }
            if (empty($graduationYears) && is_array($previousResolution['graduation_years'] ?? null)) {
                $graduationYears = array_values(array_filter(array_map('intval', $previousResolution['graduation_years']), static fn (int $year): bool => $year >= 1900 && $year <= 2100));
            }
            if ($graduationYear === null && isset($previousResolution['graduation_year'])) {
                $graduationYear = (int)$previousResolution['graduation_year'];
            }
        }

        $mentionsProgram = $programCode !== null
            || preg_match('/\b(program|course|department)\b/i', $text) === 1;
        $mentionsVerification = preg_match('/\b(alumni\s+verification|verification(?:\s+(?:request|account|status))?|verify|approved\s+alumni|pending\s+alumni|rejected\s+alumni)\b/i', $text) === 1
            || preg_match('/\balumni\b.{0,40}\b(approved|pending|rejected|waiting|verified)\b/i', $text) === 1;
        $mentionsRegistry = preg_match('/\b(registered\s+alumni|alumni\s+registry|all\s+alumni|official\s+alumni)\b/i', $text) === 1;
        $mentionsSurvey = preg_match('/\b(survey|tracer|responses?|respondents?|answer(?:ed|ing)?|unanswered|nakatapos|sumagot)\b/ui', $text) === 1;
        $mentionsJobs = preg_match('/\b(job\s+(?:approval|post|posting|submission)|approve\s+(?:a\s+)?job)\b/i', $text) === 1;
        $mentionsForum = preg_match('/\b(forum|reported\s+(?:post|comment)|moderation\s+report)\b/i', $text) === 1;
        $mentionsAnnouncements = preg_match('/\b(announcement|announcements)\b/i', $text) === 1;
        $mentionsUsers = preg_match('/\b(system\s+users?|admin(?:istrator)?\s+accounts?|user\s+accounts?|users?\s+by\s+role)\b/i', $text) === 1;
        $mentionsSystem = preg_match('/\b(overall\s+system|system\s+(?:summary|statistics|status)|dashboard\s+statistics)\b/i', $text) === 1;
        $mentionsGraduates = preg_match('/\b(graduates?|graduate\s+records?|alumni\s+records?)\b/i', $text) === 1;
        $mentionsEmploymentAnalytics = preg_match('/\b(employed|unemployed|employment(?:\s+rate|\s+status)?|salary|income|job[-\s]?align(?:ed|ment)|alignment\s+rate)\b/i', $text) === 1;
        $mentionsEmploymentPeople = $mentionsGraduates
            || preg_match('/\b(respondents?|people|persons?|alumni)\b/i', $text) === 1;
        $route = strtolower(trim((string) ($pageContext['route'] ?? '')));
        $onParticipationPage = strpos($route, '/admin/survey-status') === 0
            || ($role === 'research_coordinator' && strpos($route, '/admin/graduates') === 0);

        if ($metric === 'current_survey') {
            $tool = in_array($role, ['research_coordinator', 'dean_cs', 'dean_coed', 'dean_hm'], true)
                ? 'survey_participation'
                : null;
        } elseif ($requestsList && $mentionsEmploymentAnalytics && $mentionsEmploymentPeople
            && in_array($role, ['research_coordinator', 'dean_cs', 'dean_coed', 'dean_hm'], true)) {
            $tool = 'employment_status_list';
            $metric = preg_match('/\bunemployed\b|\bnot\s+employed\b/i', $text) === 1 ? 'unemployed' : 'employed';
        } elseif ($requestsList && in_array($role, ['research_coordinator', 'dean_cs', 'dean_coed', 'dean_hm'], true)
            && !$mentionsEmploymentAnalytics
            && ($mentionsSurvey || $mentionsGraduates || $mentionsProgram)) {
            $tool = 'survey_participation_list';
        } elseif ($requestsList && $role === 'registrar'
            && !$mentionsSurvey
            && !$mentionsEmploymentAnalytics
            && ($mentionsGraduates || $mentionsProgram)) {
            $tool = 'graduate_record_list';
            $metric = 'summary';
        } elseif ($requestsList && $role === 'alumni_president' && !$mentionsEmploymentAnalytics && $mentionsVerification) {
            $tool = 'alumni_verification_list';
        } elseif ($requestsList && $role === 'alumni_president' && !$mentionsEmploymentAnalytics
            && ($mentionsRegistry || preg_match('/\balumni\b/i', $text) === 1)) {
            $tool = 'alumni_registry_list';
        } elseif ($requestsData && $mentionsEmploymentAnalytics) {
            $tool = in_array($role, ['research_coordinator', 'dean_cs', 'dean_coed', 'dean_hm'], true)
                ? 'report_analytics'
                : null;
        } elseif ($requestsData && $onParticipationPage && ($mentionsSurvey || $mentionsGraduates || $mentionsProgram)) {
            $tool = 'survey_participation';
            if ($metric === 'summary' && ($mentionsGraduates || $mentionsProgram) && !$mentionsSurvey) $metric = 'total';
        } elseif ($requestsData && ($mentionsVerification
            || ($role === 'alumni_president' && $mentionsRegistry && in_array($metric, ['approved', 'pending', 'rejected'], true)))) {
            $tool = 'alumni_verification_summary';
        } elseif ($requestsData && $mentionsRegistry) {
            $tool = 'alumni_registry_summary';
        } elseif ($requestsData && $mentionsSurvey) {
            $tool = $role === 'alumni_president' ? 'alumni_registry_summary' : 'survey_participation';
        } elseif ($requestsData && $mentionsJobs) {
            if ($role === 'alumni_president' && strpos($route, '/admin/job-approvals') === 0) {
                $tool = 'job_approval_summary';
            } elseif (in_array($role, ['research_coordinator', 'alumni_president', 'dean_cs', 'dean_coed', 'dean_hm'], true)) {
                $tool = 'managed_job_summary';
                if (preg_match('/\b(archived|inactive)\b/i', $text) === 1) $metric = 'archived';
                elseif (preg_match('/\b(published|active)\b/i', $text) === 1) $metric = 'published';
            }
        } elseif ($requestsData && $mentionsForum) {
            $tool = 'forum_moderation_summary';
        } elseif ($requestsData && $mentionsAnnouncements) {
            $tool = 'announcement_summary';
        } elseif ($requestsData && $mentionsUsers) {
            $tool = 'system_user_summary';
        } elseif ($requestsData && $mentionsSystem) {
            $tool = 'system_dashboard_statistics';
        } elseif ($requestsData && $role === 'admin'
            && preg_match('/\b(graduates?|alumni\s+accounts?|surveys?|survey\s+responses?)\b/i', $text) === 1) {
            $tool = 'system_dashboard_statistics';
        } elseif ($requestsData && $mentionsProgram) {
            if ($role === 'alumni_president') {
                $tool = 'alumni_registry_summary';
                $metric = $programCode !== null ? 'program' : 'by_program';
            } elseif (str_starts_with($role, 'dean_')) {
                $tool = 'survey_participation';
                $metric = 'total';
            } else {
                $tool = 'graduate_program_counts';
                $metric = $programCode !== null ? 'program' : 'by_program';
            }
        } elseif ($requestsData && $mentionsGraduates && in_array($role, ['research_coordinator', 'registrar'], true)) {
            $tool = 'graduate_program_counts';
            $metric = 'total';
        } elseif ($requestsData && $mentionsGraduates && str_starts_with($role, 'dean_')) {
            $tool = 'survey_participation';
            $metric = 'total';
        }

        $isShortFollowUp = preg_match('/^(?:and\s+|what\s+about\s+|how\s+about\s+|also\s+|at\s+|paano\s+naman\s+|ilan\s+(?:ang\s+|yung\s+|naman\s+)?)?(?:the\s+)?(?:approved|pending|rejected|declined|answered|unanswered|not\s+answered|active|inactive|published|draft|resolved|dismissed)(?:\s+(?:ones?|accounts?|requests?|alumni|users?|posts?))?\??$/ui', $text) === 1;
        if ($tool === null && $lastDataTool !== null && $requestsData && ($isShortFollowUp || $isCountFollowUp)) {
            $tool = $lastDataTool;
        }

        if ($tool === null && $requestsData) {
            if ($role === 'alumni_president' && strpos($route, '/admin/alumni-registered-list') === 0) {
                $tool = in_array($metric, ['answered', 'not_answered'], true)
                    ? 'alumni_registry_summary'
                    : 'alumni_verification_summary';
            } elseif ($role === 'alumni_president' && strpos($route, '/admin/job-approvals') === 0) {
                $tool = 'job_approval_summary';
            } elseif ($role === 'alumni_president' && strpos($route, '/admin/forum-moderation') === 0) {
                $tool = 'forum_moderation_summary';
            } elseif ($role === 'alumni_president' && strpos($route, '/admin/announcements') === 0) {
                $tool = 'announcement_summary';
            } elseif (in_array($role, ['research_coordinator', 'dean_cs', 'dean_coed', 'dean_hm'], true)
                && (strpos($route, '/admin/survey-status') === 0 || strpos($route, '/admin/graduates') === 0)) {
                $tool = 'survey_participation';
            }
        }

        if ($tool === null || !gradtrack_genai_data_tool_is_allowed($tool, $role)) {
            return null;
        }

        if ($tool === 'job_approval_summary' && $metric === 'rejected') {
            $metric = 'declined';
        }
        if ($tool === 'managed_job_summary' && in_array($metric, ['approved', 'active'], true)) $metric = 'published';
        if ($tool === 'managed_job_summary' && $metric === 'inactive') $metric = 'archived';
        if ($tool === 'alumni_registry_list' && $metric === 'approved') $metric = 'verified';
        if ($tool === 'alumni_registry_list' && !in_array($metric, ['summary', 'verified', 'registered', 'unclaimed', 'inactive'], true)) $metric = 'summary';
        if ($tool === 'alumni_registry_summary' && $mentionsRegistry && !$mentionsSurvey && $metric === 'summary') {
            $metric = 'total';
        }
        if ($tool === 'system_dashboard_statistics' && $metric === 'summary') {
            if (preg_match('/\bsurvey\s+responses?\b/i', $text) === 1) $metric = 'submitted_survey_responses';
            elseif (preg_match('/\balumni\s+accounts?\b/i', $text) === 1) $metric = 'alumni_accounts';
            elseif (preg_match('/\bgraduates?\b/i', $text) === 1) $metric = 'graduates';
            elseif (preg_match('/\bsurveys?\b/i', $text) === 1) $metric = 'surveys';
            elseif (preg_match('/\badmin(?:istrator)?\s+(?:users?|accounts?)\b/i', $text) === 1) $metric = 'admin_users';
        }

        $roleScopes = [
            'dean_cs' => ['BSCS', 'ACT'],
            'dean_coed' => ['BSED', 'BEED'],
            'dean_hm' => ['BSHM'],
        ];
        if (isset($roleScopes[$role]) && !empty(array_diff($programCodes, $roleScopes[$role]))) {
            return null;
        }

        $offset = 0;
        if ($isPaginationFollowUp && str_ends_with($tool, '_list')) {
            $offset = max(0, (int)($previousResolution['offset'] ?? 0) + 10);
        }

        return [
            'tool' => $tool,
            'metric' => $metric,
            'program_code' => $programCode,
            'program_codes' => $programCodes,
            'graduation_year' => $graduationYear,
            'graduation_years' => $graduationYears,
            'offset' => $offset,
            'feature' => gradtrack_genai_data_tool_catalog()[$tool]['feature'],
            'language' => gradtrack_genai_detect_language($message),
        ];
    }
}

if (!function_exists('gradtrack_genai_collect_aggregate_tool_data')) {
    function gradtrack_genai_collect_aggregate_tool_data(PDO $db, array $resolution, string $role, ?array $allowedProgramCodes, ?int $adminUserId = null): array
    {
        $tool = (string) ($resolution['tool'] ?? '');
        if (!gradtrack_genai_data_tool_is_allowed($tool, $role)) {
            throw new RuntimeException('The requested data tool is not authorized for this role.');
        }

        if ($tool === 'survey_participation_list') {
            $limit = max(1, min(10000, (int)($resolution['limit'] ?? 10)));
            $offset = max(0, min(5000, (int)($resolution['offset'] ?? 0)));
            $coverage = gradtrack_get_active_survey_graduation_year_coverage($db);
            if ($coverage['survey'] === null || !$coverage['configured']) {
                return [
                    'feature' => 'survey_participation_list',
                    'available' => false,
                    'reason' => $coverage['survey'] === null
                        ? 'No active survey is available.'
                        : 'Graduation-year coverage is not configured for the active survey.',
                    'records' => [],
                    'total_matching' => 0,
                    'returned' => 0,
                    'source' => 'active Survey Participation row scope',
                ];
            }
            $params = [':list_survey_id' => (int)$coverage['survey']['id']];
            $where = ['g.archived_at IS NULL'];
            gradtrack_append_graduation_year_coverage_filter(
                $where,
                $params,
                'g.year_graduated',
                $coverage['years'],
                'genai_list_year'
            );
            if (is_array($allowedProgramCodes)) {
                $programPlaceholders = [];
                foreach ($allowedProgramCodes as $index => $code) {
                    $placeholder = ':list_allowed_program_' . $index;
                    $programPlaceholders[] = $placeholder;
                    $params[$placeholder] = $code;
                }
                $where[] = empty($programPlaceholders) ? '1 = 0' : 'p.code IN (' . implode(', ', $programPlaceholders) . ')';
            }
            $programCode = strtoupper((string)($resolution['program_code'] ?? ''));
            if ($programCode !== '') {
                $where[] = 'p.code = :list_program_code';
                $params[':list_program_code'] = $programCode;
            }
            $graduationYear = (int)($resolution['graduation_year'] ?? 0);
            if ($graduationYear >= 1900 && $graduationYear <= 2100) {
                $where[] = 'g.year_graduated = :list_graduation_year';
                $params[':list_graduation_year'] = $graduationYear;
            }
            $baseSql = "SELECT g.id, g.first_name, g.middle_name, g.last_name,
                               g.year_graduated, p.code AS program_code,
                               COUNT(DISTINCT sr.id) AS response_count
                        FROM graduates g
                        LEFT JOIN programs p ON p.id = g.program_id
                        LEFT JOIN survey_responses sr
                          ON sr.graduate_id = g.id
                         AND sr.survey_id = :list_survey_id
                         AND sr.submitted_at IS NOT NULL
                        WHERE " . implode(' AND ', $where) . "
                        GROUP BY g.id, g.first_name, g.middle_name, g.last_name, g.year_graduated, p.code";
            $metric = (string)($resolution['metric'] ?? 'summary');
            $rowFilter = $metric === 'answered'
                ? 'response_count > 0'
                : ($metric === 'not_answered' ? 'response_count = 0' : '1 = 1');
            $countStmt = $db->prepare("SELECT COUNT(*) FROM ({$baseSql}) scoped_rows WHERE {$rowFilter}");
            $countStmt->execute($params);
            $total = (int)$countStmt->fetchColumn();
            $summaryStmt = $db->prepare("SELECT COUNT(*) AS total,
                                                SUM(CASE WHEN response_count > 0 THEN 1 ELSE 0 END) AS answered
                                         FROM ({$baseSql}) participation_rows");
            $summaryStmt->execute($params);
            $participationSummary = $summaryStmt->fetch(PDO::FETCH_ASSOC) ?: [];
            $eligibleTotal = (int)($participationSummary['total'] ?? 0);
            $answeredTotal = (int)($participationSummary['answered'] ?? 0);
            $listStmt = $db->prepare("SELECT * FROM ({$baseSql}) scoped_rows
                                      WHERE {$rowFilter}
                                      ORDER BY last_name ASC, first_name ASC
                                      LIMIT {$limit} OFFSET {$offset}");
            $listStmt->execute($params);
            $records = array_map(static function (array $row): array {
                $middle = trim((string)($row['middle_name'] ?? ''));
                $name = trim((string)$row['last_name'] . ', ' . (string)$row['first_name'] . ($middle !== '' ? ' ' . mb_substr($middle, 0, 1) . '.' : ''));
                return [
                    'name' => $name,
                    'program' => (string)($row['program_code'] ?? ''),
                    'year_graduated' => $row['year_graduated'] !== null ? (int)$row['year_graduated'] : null,
                    'status' => (int)$row['response_count'] > 0 ? 'Answered' : 'Not Answered',
                ];
            }, $listStmt->fetchAll(PDO::FETCH_ASSOC));
            return [
                'feature' => 'survey_participation_list',
                'available' => true,
                'selected_survey' => [
                    'id' => (int)$coverage['survey']['id'],
                    'title' => (string)$coverage['survey']['title'],
                    'status' => (string)$coverage['survey']['status'],
                ],
                'filter' => $metric,
                'records' => $records,
                'total_matching' => $total,
                'returned' => count($records),
                'offset' => $offset,
                'limit' => $limit,
                'participation_summary' => [
                    'total' => $eligibleTotal,
                    'answered' => $answeredTotal,
                    'not_answered' => max(0, $eligibleTotal - $answeredTotal),
                    'response_rate' => $eligibleTotal > 0 ? round(($answeredTotal / $eligibleTotal) * 100, 1) : 0.0,
                ],
                'allowed_program_codes' => $allowedProgramCodes,
                'source' => 'active Survey Participation row scope; paginated alphabetically',
            ];
        }

        if ($tool === 'employment_status_list') {
            $limit = max(1, min(10000, (int)($resolution['limit'] ?? 10)));
            $offset = max(0, min(5000, (int)($resolution['offset'] ?? 0)));
            $surveyId = max(0, (int)($resolution['survey_id'] ?? 0));
            $coverage = $surveyId > 0
                ? gradtrack_get_survey_graduation_year_coverage($db, $surveyId)
                : gradtrack_get_active_survey_graduation_year_coverage($db);
            if ($coverage['survey'] === null || !$coverage['configured']) {
                return [
                    'feature' => 'employment_status_list',
                    'available' => false,
                    'reason' => (string)($coverage['error'] ?? 'No survey with configured graduation-year coverage is available.'),
                    'records' => [],
                    'total_matching' => 0,
                    'returned' => 0,
                    'source' => 'submitted tracer-study responses',
                ];
            }

            $surveyId = (int)$coverage['survey']['id'];
            $questionStmt = $db->prepare(
                'SELECT id, section_id, question_key, analytics_key, section, question_text,
                        question_type, options, is_required, sort_order, is_active
                 FROM survey_questions
                 WHERE survey_id = :survey_id AND is_active = 1
                 ORDER BY sort_order ASC, id ASC'
            );
            $questionStmt->execute([':survey_id' => $surveyId]);
            $questions = $questionStmt->fetchAll(PDO::FETCH_ASSOC);
            $roles = gradtrack_analytics_question_roles($questions);
            if (empty($roles['employment'])) {
                return [
                    'feature' => 'employment_status_list',
                    'available' => false,
                    'reason' => 'The selected survey has no configured employment-status question.',
                    'records' => [],
                    'total_matching' => 0,
                    'returned' => 0,
                    'selected_survey' => [
                        'id' => $surveyId,
                        'title' => (string)$coverage['survey']['title'],
                        'status' => (string)$coverage['survey']['status'],
                    ],
                    'source' => 'submitted tracer-study responses',
                ];
            }

            $programCode = strtoupper((string)($resolution['program_code'] ?? ''));
            $scopeProgramCodes = is_array($allowedProgramCodes) ? array_values($allowedProgramCodes) : null;
            if ($programCode !== '') $scopeProgramCodes = [$programCode];
            $options = [
                'program_codes' => $scopeProgramCodes,
                'allowed_graduation_years' => $coverage['years'],
            ];
            $graduationYear = (int)($resolution['graduation_year'] ?? 0);
            if ($graduationYear >= 1900 && $graduationYear <= 2100) {
                $options['graduation_year'] = $graduationYear;
            }
            $responses = gradtrack_analytics_fetch_valid_responses($db, $surveyId, $options);
            $metric = (string)($resolution['metric'] ?? 'employed');
            $metric = $metric === 'unemployed' ? 'unemployed' : 'employed';
            $matching = [];
            foreach ($responses as $response) {
                $answerMap = gradtrack_survey_response_answer_map($questions, $response);
                $employmentStatus = gradtrack_analytics_first_classified_answer(
                    $answerMap,
                    $roles['employment'],
                    'gradtrack_analytics_classify_employment'
                );
                if ($employmentStatus !== $metric) continue;

                $workLocation = $employmentStatus === 'employed'
                    ? gradtrack_analytics_first_classified_answer(
                        $answerMap,
                        array_slice($roles['work_location'] ?? [], 0, 1),
                        'gradtrack_analytics_classify_work_location'
                    )
                    : null;
                $middle = trim((string)($response['middle_name'] ?? ''));
                $matching[] = [
                    'name' => trim((string)($response['last_name'] ?? '') . ', ' . (string)($response['first_name'] ?? '') . ($middle !== '' ? ' ' . mb_substr($middle, 0, 1) . '.' : '')),
                    'program' => (string)($response['program_code'] ?? ''),
                    'year_graduated' => isset($response['year_graduated']) ? (int)$response['year_graduated'] : null,
                    'status' => $employmentStatus === 'employed' ? 'Employed' : 'Unemployed',
                    'work_location' => $workLocation !== null ? ucfirst($workLocation) : '',
                ];
            }
            usort($matching, static fn (array $left, array $right): int => strcasecmp((string)$left['name'], (string)$right['name']));
            $total = count($matching);
            $records = array_slice($matching, $offset, $limit);
            return [
                'feature' => 'employment_status_list',
                'available' => true,
                'selected_survey' => [
                    'id' => $surveyId,
                    'title' => (string)$coverage['survey']['title'],
                    'status' => (string)$coverage['survey']['status'],
                ],
                'filter' => $metric,
                'records' => $records,
                'total_matching' => $total,
                'returned' => count($records),
                'offset' => $offset,
                'limit' => $limit,
                'allowed_program_codes' => $allowedProgramCodes,
                'source' => 'submitted tracer-study responses classified by the selected survey employment-status question; paginated alphabetically',
            ];
        }

        if ($tool === 'graduate_record_list') {
            $limit = max(1, min(10000, (int)($resolution['limit'] ?? 10)));
            $offset = max(0, min(5000, (int)($resolution['offset'] ?? 0)));
            $params = [];
            $where = ['g.archived_at IS NULL'];
            $programCode = strtoupper((string)($resolution['program_code'] ?? ''));
            if ($programCode !== '') {
                $where[] = 'p.code = :graduate_list_program';
                $params[':graduate_list_program'] = $programCode;
            }
            $graduationYear = (int)($resolution['graduation_year'] ?? 0);
            if ($graduationYear >= 1900 && $graduationYear <= 2100) {
                $where[] = 'g.year_graduated = :graduate_list_year';
                $params[':graduate_list_year'] = $graduationYear;
            }
            $whereSql = implode(' AND ', $where);
            $countStmt = $db->prepare("SELECT COUNT(*) FROM graduates g LEFT JOIN programs p ON p.id = g.program_id WHERE {$whereSql}");
            $countStmt->execute($params);
            $total = (int)$countStmt->fetchColumn();
            $stmt = $db->prepare("SELECT g.first_name, g.middle_name, g.last_name, g.year_graduated, p.code AS program_code
                                  FROM graduates g
                                  LEFT JOIN programs p ON p.id = g.program_id
                                  WHERE {$whereSql}
                                  ORDER BY g.last_name ASC, g.first_name ASC
                                  LIMIT {$limit} OFFSET {$offset}");
            $stmt->execute($params);
            $records = array_map(static function (array $row): array {
                $middle = trim((string)($row['middle_name'] ?? ''));
                return [
                    'name' => trim((string)$row['last_name'] . ', ' . (string)$row['first_name'] . ($middle !== '' ? ' ' . mb_substr($middle, 0, 1) . '.' : '')),
                    'program' => (string)($row['program_code'] ?? ''),
                    'year_graduated' => $row['year_graduated'] !== null ? (int)$row['year_graduated'] : null,
                ];
            }, $stmt->fetchAll(PDO::FETCH_ASSOC));
            return [
                'feature' => 'graduate_record_list',
                'records' => $records,
                'total_matching' => $total,
                'returned' => count($records),
                'offset' => $offset,
                'limit' => $limit,
                'source' => 'non-archived Manage Graduates records; paginated alphabetically',
            ];
        }

        if ($tool === 'alumni_verification_list') {
            $limit = max(1, min(10000, (int)($resolution['limit'] ?? 10)));
            $offset = max(0, min(5000, (int)($resolution['offset'] ?? 0)));
            gradtrack_ensure_graduate_account_verification_schema($db);
            $metric = (string)($resolution['metric'] ?? 'summary');
            $statusSql = match ($metric) {
                'pending' => "(ga.status = 'pending_verification' OR ga.alumni_verification_status = 'pending')",
                'approved' => "(ga.status = 'active' AND ga.alumni_verification_status = 'approved')",
                'rejected' => "(ga.status = 'rejected' OR ga.alumni_verification_status = 'rejected')",
                default => '1 = 1',
            };
            $fromSql = "FROM graduate_accounts ga
                        JOIN graduates g ON g.id = ga.graduate_id AND g.archived_at IS NULL
                        LEFT JOIN programs p ON p.id = g.program_id
                        WHERE {$statusSql}";
            $total = (int)$db->query("SELECT COUNT(*) {$fromSql}")->fetchColumn();
            $rows = $db->query("SELECT g.first_name, g.middle_name, g.last_name, p.code AS program_code,
                                       ga.alumni_verification_status, ga.status AS account_status
                                {$fromSql}
                                ORDER BY COALESCE(ga.alumni_verification_submitted_at, ga.created_at) DESC, ga.id DESC
                                LIMIT {$limit} OFFSET {$offset}")->fetchAll(PDO::FETCH_ASSOC);
            $records = array_map(static function (array $row): array {
                $middle = trim((string)($row['middle_name'] ?? ''));
                return [
                    'name' => trim((string)$row['last_name'] . ', ' . (string)$row['first_name'] . ($middle !== '' ? ' ' . mb_substr($middle, 0, 1) . '.' : '')),
                    'program' => (string)($row['program_code'] ?? ''),
                    'verification_status' => (string)($row['alumni_verification_status'] ?? $row['account_status'] ?? ''),
                ];
            }, $rows);
            return [
                'feature' => 'alumni_verification_list',
                'filter' => $metric,
                'records' => $records,
                'total_matching' => $total,
                'returned' => count($records),
                'offset' => $offset,
                'limit' => $limit,
                'source' => 'Alumni Verification account queue; paginated by most recent',
            ];
        }

        if ($tool === 'alumni_registry_list') {
            $limit = max(1, min(10000, (int)($resolution['limit'] ?? 10)));
            $offset = max(0, min(5000, (int)($resolution['offset'] ?? 0)));
            gradtrack_alumni_registry_ensure_schema($db);
            $params = [];
            $where = ['ra.archived_at IS NULL'];
            $programCode = strtoupper((string)($resolution['program_code'] ?? ''));
            if ($programCode !== '') {
                $where[] = 'ra.course_code = :registry_list_program';
                $params[':registry_list_program'] = $programCode;
            }
            $graduationYear = (int)($resolution['graduation_year'] ?? 0);
            if ($graduationYear >= 1900 && $graduationYear <= 2100) {
                $where[] = 'ra.batch_year = :registry_list_year';
                $params[':registry_list_year'] = $graduationYear;
            }
            $metric = (string)($resolution['metric'] ?? 'summary');
            $statusMap = ['verified' => 'Verified', 'registered' => 'Registered', 'unclaimed' => 'Unclaimed', 'inactive' => 'Inactive'];
            if (isset($statusMap[$metric])) {
                $where[] = 'ra.registration_status = :registry_list_status';
                $params[':registry_list_status'] = $statusMap[$metric];
            }
            $whereSql = implode(' AND ', $where);
            $countStmt = $db->prepare("SELECT COUNT(*) FROM registered_alumni ra WHERE {$whereSql}");
            $countStmt->execute($params);
            $total = (int)$countStmt->fetchColumn();
            $stmt = $db->prepare("SELECT ra.full_name, ra.course_code, ra.batch_year, ra.registration_status
                                  FROM registered_alumni ra
                                  WHERE {$whereSql}
                                  ORDER BY ra.full_name ASC
                                  LIMIT {$limit} OFFSET {$offset}");
            $stmt->execute($params);
            $records = array_map(static fn (array $row): array => [
                'name' => (string)$row['full_name'],
                'program' => (string)$row['course_code'],
                'batch_year' => (int)$row['batch_year'],
                'registration_status' => (string)$row['registration_status'],
            ], $stmt->fetchAll(PDO::FETCH_ASSOC));
            return [
                'feature' => 'alumni_registry_list',
                'filter' => $metric,
                'records' => $records,
                'total_matching' => $total,
                'returned' => count($records),
                'offset' => $offset,
                'limit' => $limit,
                'source' => 'non-archived official alumni registry; paginated alphabetically',
            ];
        }

        if (in_array($tool, ['alumni_verification_summary', 'alumni_registry_summary'], true)) {
            gradtrack_ensure_graduate_account_verification_schema($db);
            gradtrack_alumni_registry_ensure_schema($db);
            $summary = gradtrack_alumni_registry_summary_data($db);
            if ($tool === 'alumni_verification_summary') {
                return [
                    'feature' => 'alumni_verification',
                    'approved' => $summary['approved_verification_accounts'],
                    'pending' => $summary['pending_verification_accounts'],
                    'rejected' => $summary['rejected_verification_accounts'],
                    'total_accounts' => $summary['total_graduate_accounts'],
                    'source' => 'shared Alumni Registered List summary service',
                ];
            }
            return [
                'feature' => 'registered_alumni',
                'all_alumni' => $summary['total_official_alumni'],
                'done_answering' => $summary['answered_alumni'],
                'not_answered' => $summary['not_answered_alumni'],
                'registered_accounts' => $summary['registered_accounts'],
                'course_totals' => $summary['course_totals'],
                'source' => 'shared Alumni Registered List summary service',
                'definition' => 'Done Answering and Not Answered use the same registration-status rules as the Alumni Registered List cards.',
            ];
        }

        if ($tool === 'graduate_program_counts') {
            $params = [];
            $scope = '';
            if (is_array($allowedProgramCodes)) {
                $placeholders = [];
                foreach ($allowedProgramCodes as $index => $code) {
                    $key = ':program_' . $index;
                    $placeholders[] = $key;
                    $params[$key] = $code;
                }
                $scope = empty($placeholders) ? ' AND 1 = 0' : ' AND p.code IN (' . implode(', ', $placeholders) . ')';
            }
            $stmt = $db->prepare("SELECT p.code, p.name, COUNT(g.id) AS total
                                  FROM programs p
                                  LEFT JOIN graduates g ON g.program_id = p.id
                                      AND g.archived_at IS NULL
                                  WHERE 1 = 1 {$scope}
                                  GROUP BY p.id, p.code, p.name
                                  ORDER BY total DESC, p.code ASC");
            $stmt->execute($params);
            $rows = array_map(static function (array $row): array {
                return ['code' => (string) $row['code'], 'name' => (string) $row['name'], 'count' => (int) $row['total']];
            }, $stmt->fetchAll(PDO::FETCH_ASSOC));
            return [
                'feature' => 'graduate_counts_by_program',
                'programs' => $rows,
                'total' => array_sum(array_column($rows, 'count')),
                'allowed_program_codes' => $allowedProgramCodes,
                'source' => 'active non-archived graduate records grouped by program',
            ];
        }

        if ($tool === 'job_approval_summary') {
            $counts = ['pending' => 0, 'approved' => 0, 'declined' => 0];
            $stmt = $db->query("SELECT approval_status, COUNT(*) AS total FROM job_posts GROUP BY approval_status");
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $status = strtolower((string) ($row['approval_status'] ?? ''));
                if (array_key_exists($status, $counts)) $counts[$status] = (int) $row['total'];
            }
            return ['feature' => 'job_approval', 'statuses' => $counts, 'total' => array_sum($counts), 'source' => 'job approval status aggregation'];
        }

        if ($tool === 'managed_job_summary') {
            if ($adminUserId === null || $adminUserId <= 0) {
                throw new RuntimeException('The authenticated administrator is required for managed job statistics.');
            }
            $stmt = $db->prepare("SELECT
                    COALESCE(SUM(CASE WHEN archived_at IS NULL AND is_active = 1 THEN 1 ELSE 0 END), 0) AS published,
                    COALESCE(SUM(CASE WHEN archived_at IS NOT NULL OR is_active = 0 THEN 1 ELSE 0 END), 0) AS archived
                FROM job_posts
                WHERE created_by_admin_id = :admin_user_id");
            $stmt->execute([':admin_user_id' => $adminUserId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
            $counts = ['published' => (int)($row['published'] ?? 0), 'archived' => (int)($row['archived'] ?? 0)];
            return ['feature' => 'job_postings', 'statuses' => $counts, 'total' => array_sum($counts), 'source' => 'authenticated administrator job-post aggregation'];
        }

        if ($tool === 'forum_moderation_summary') {
            $counts = ['pending' => 0, 'resolved' => 0, 'dismissed' => 0];
            $stmt = $db->query("SELECT status, COUNT(*) AS total FROM forum_reports GROUP BY status");
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $status = strtolower((string) ($row['status'] ?? ''));
                if (array_key_exists($status, $counts)) $counts[$status] = (int) $row['total'];
            }
            return ['feature' => 'forum_moderation', 'statuses' => $counts, 'total' => array_sum($counts), 'source' => 'forum report status aggregation'];
        }

        if ($tool === 'announcement_summary') {
            $counts = ['draft' => 0, 'published' => 0, 'archived' => 0];
            $stmt = $db->query("SELECT status, COUNT(*) AS total FROM announcements WHERE created_by_admin_id IS NOT NULL GROUP BY status");
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $status = strtolower((string) ($row['status'] ?? ''));
                if (array_key_exists($status, $counts)) $counts[$status] = (int) $row['total'];
            }
            return ['feature' => 'announcements', 'statuses' => $counts, 'total' => array_sum($counts), 'source' => 'administrator announcement status aggregation'];
        }

        if ($tool === 'system_user_summary') {
            $rows = $db->query("SELECT role, is_active, COUNT(*) AS total FROM admin_users GROUP BY role, is_active")
                ->fetchAll(PDO::FETCH_ASSOC);
            $byRole = [];
            $active = 0;
            $inactive = 0;
            foreach ($rows as $row) {
                $count = (int) $row['total'];
                $roleKey = (string) $row['role'];
                $byRole[$roleKey] = ($byRole[$roleKey] ?? 0) + $count;
                if ((int) $row['is_active'] === 1) $active += $count; else $inactive += $count;
            }
            return ['feature' => 'system_users', 'total' => $active + $inactive, 'active' => $active, 'inactive' => $inactive, 'by_role' => $byRole, 'source' => 'administrator account aggregation'];
        }

        if ($tool === 'system_dashboard_statistics') {
            $row = $db->query("SELECT
                    (SELECT COUNT(*) FROM admin_users) AS admin_users,
                    (SELECT COUNT(*) FROM graduates WHERE archived_at IS NULL) AS graduates,
                    (SELECT COUNT(*) FROM graduate_accounts) AS alumni_accounts,
                    (SELECT COUNT(*) FROM surveys WHERE archived_at IS NULL) AS surveys,
                    (SELECT COUNT(*) FROM survey_responses WHERE submitted_at IS NOT NULL) AS submitted_survey_responses")
                ->fetch(PDO::FETCH_ASSOC) ?: [];
            return [
                'feature' => 'system_statistics',
                'admin_users' => (int) ($row['admin_users'] ?? 0),
                'graduates' => (int) ($row['graduates'] ?? 0),
                'alumni_accounts' => (int) ($row['alumni_accounts'] ?? 0),
                'surveys' => (int) ($row['surveys'] ?? 0),
                'submitted_survey_responses' => (int) ($row['submitted_survey_responses'] ?? 0),
                'source' => 'aggregate system table counts',
            ];
        }

        throw new RuntimeException('The requested GradTrack aggregate is unavailable.');
    }
}

if (!function_exists('gradtrack_genai_tool_export_data')) {
    /**
     * Converts an explicitly requested, authorized list result into a
     * file-generation payload. The payload is returned only to the signed-in
     * client and is never sent to the AI provider or persisted in history.
     */
    function gradtrack_genai_tool_export_data(array $resolution, array $data, array $formats): ?array
    {
        $tool = (string)($resolution['tool'] ?? '');
        if (!str_ends_with($tool, '_list') || empty($formats)) return null;

        $titleMap = [
            'survey_participation_list' => (string)($resolution['metric'] ?? '') === 'not_answered'
                ? 'Graduates Without Survey Responses'
                : ((string)($resolution['metric'] ?? '') === 'answered' ? 'Graduates With Survey Responses' : 'Survey Participation Records'),
            'graduate_record_list' => 'Graduate Records',
            'alumni_verification_list' => 'Alumni Verification Records',
            'alumni_registry_list' => 'Registered Alumni Records',
            'employment_status_list' => (string)($resolution['metric'] ?? '') === 'unemployed'
                ? 'Unemployed Graduate Respondents'
                : 'Employed Graduate Respondents',
        ];
        $records = is_array($data['records'] ?? null) ? $data['records'] : [];
        $columns = match ($tool) {
            'alumni_verification_list' => ['Name', 'Program', 'Verification Status'],
            'graduate_record_list' => ['Name', 'Program', 'Batch'],
            'employment_status_list' => ['Name', 'Program', 'Batch', 'Employment Status', 'Work Location'],
            default => ['Name', 'Program', 'Batch', 'Status'],
        };
        $rows = [];
        foreach ($records as $record) {
            if (!is_array($record)) continue;
            $status = (string)($record['status'] ?? $record['verification_status'] ?? $record['registration_status'] ?? '');
            if ($tool === 'alumni_verification_list') {
                $rows[] = [
                    (string)($record['name'] ?? ''),
                    (string)($record['program'] ?? ''),
                    $status,
                ];
                continue;
            }
            if ($tool === 'graduate_record_list') {
                $rows[] = [
                    (string)($record['name'] ?? ''),
                    (string)($record['program'] ?? ''),
                    (string)($record['year_graduated'] ?? ''),
                ];
                continue;
            }
            if ($tool === 'employment_status_list') {
                $rows[] = [
                    (string)($record['name'] ?? ''),
                    (string)($record['program'] ?? ''),
                    (string)($record['year_graduated'] ?? ''),
                    $status,
                    (string)($record['work_location'] ?? ''),
                ];
                continue;
            }
            $rows[] = [
                (string)($record['name'] ?? ''),
                (string)($record['program'] ?? ''),
                (string)($record['year_graduated'] ?? $record['batch_year'] ?? ''),
                $status,
            ];
        }

        $programCode = strtoupper((string)($resolution['program_code'] ?? ''));
        $graduationYear = (int)($resolution['graduation_year'] ?? 0);
        $total = (int)($data['total_matching'] ?? count($rows));
        $returned = count($rows);
        $title = $titleMap[$tool] ?? 'GradTrack Records';
        $fileParts = ['gradtrack', strtolower(preg_replace('/[^a-z0-9]+/i', '_', $title) ?? 'records')];
        if ($programCode !== '') $fileParts[] = strtolower($programCode);
        if ($graduationYear > 0) $fileParts[] = (string)$graduationYear;

        $filters = [];
        if ($programCode !== '') $filters['Program'] = $programCode;
        if ($graduationYear > 0) $filters['Batch'] = (string)$graduationYear;
        if (!empty($data['selected_survey']['title'])) $filters['Survey'] = (string)$data['selected_survey']['title'];
        if (!empty($resolution['metric']) && (string)$resolution['metric'] !== 'summary') {
            $filters['Status'] = ucwords(str_replace('_', ' ', (string)$resolution['metric']));
        }

        return [
            'title' => $title,
            'fileName' => trim(implode('_', array_filter($fileParts)), '_'),
            'formats' => array_values(array_intersect(['pdf', 'xlsx', 'csv'], $formats)),
            'columns' => $columns,
            'rows' => $rows,
            'filters' => $filters,
            'totalMatching' => $total,
            'recordsIncluded' => $returned,
            'truncated' => $returned < $total,
            'generatedAt' => date('c'),
            'footnote' => $returned < $total
                ? 'The export safety limit was reached; refine the filters to export the remaining records.'
                : 'Includes all matching records available to the authenticated role and filters.',
        ];
    }
}

if (!function_exists('gradtrack_genai_tool_fallback_answer')) {
    function gradtrack_genai_tool_fallback_answer(array $resolution, array $data): string
    {
        $tool = (string) ($resolution['tool'] ?? '');
        $metric = (string) ($resolution['metric'] ?? 'summary');
        $language = (string) ($resolution['language'] ?? 'english');
        $filipino = in_array($language, ['filipino', 'taglish'], true);
        if (in_array($tool, ['survey_participation_list', 'employment_status_list', 'graduate_record_list', 'alumni_verification_list', 'alumni_registry_list'], true)) {
            if (array_key_exists('available', $data) && !$data['available']) {
                return $filipino
                    ? 'Hindi available ang listahang iyon: ' . (string)($data['reason'] ?? 'walang available na data')
                    : 'That list is unavailable: ' . (string)($data['reason'] ?? 'no data is available');
            }
            $records = is_array($data['records'] ?? null) ? $data['records'] : [];
            $total = (int)($data['total_matching'] ?? 0);
            if (empty($records)) {
                return $filipino
                    ? 'Walang matching records sa GradTrack data na available sa role mo.'
                    : 'No matching records were found in the GradTrack data available to your role.';
            }
            $items = [];
            foreach ($records as $index => $record) {
                $status = (string)($record['status'] ?? $record['verification_status'] ?? $record['registration_status'] ?? '');
                if ($filipino) {
                    $status = match (strtolower($status)) {
                        'answered' => 'Sumagot',
                        'not answered' => 'Hindi Pa Sumagot',
                        'approved' => 'Aprubado',
                        'rejected' => 'Tinanggihan',
                        default => $status,
                    };
                }
                $details = array_values(array_filter([
                    (string)($record['program'] ?? ''),
                    isset($record['year_graduated']) ? ($filipino ? 'Taong ' : 'Class of ') . $record['year_graduated'] : '',
                    isset($record['batch_year']) ? 'Batch ' . $record['batch_year'] : '',
                    $status,
                ], static fn (string $value): bool => $value !== ''));
                $items[] = ($index + 1) . '. ' . (string)($record['name'] ?? 'Unnamed record')
                    . (!empty($details) ? ' - ' . implode(', ', $details) : '');
            }
            $heading = $filipino
                ? 'Ipinapakita ang ' . count($records) . ' sa ' . $total . ' tugmang record:'
                : 'Showing ' . count($records) . ' of ' . $total . ' matching record(s):';
            return $heading . "\n" . implode("\n", $items);
        }
        if ($tool === 'alumni_verification_summary') {
            if ($filipino) {
                if ($metric === 'approved') return 'May ' . $data['approved'] . ' approved alumni accounts sa kasalukuyan.';
                if ($metric === 'pending') return 'May ' . $data['pending'] . ' pending alumni verification requests sa kasalukuyan.';
                if ($metric === 'rejected') return 'May ' . $data['rejected'] . ' rejected alumni verification requests sa kasalukuyan.';
                return 'Sa kasalukuyan, may ' . $data['approved'] . ' approved, ' . $data['pending'] . ' pending, at ' . $data['rejected'] . ' rejected alumni verification requests.';
            }
            if ($metric === 'approved') return 'There are currently ' . $data['approved'] . ' approved alumni accounts.';
            if ($metric === 'pending') return 'There are currently ' . $data['pending'] . ' pending alumni verification requests.';
            if ($metric === 'rejected') return 'There are currently ' . $data['rejected'] . ' rejected alumni verification requests.';
            return 'There are currently ' . $data['approved'] . ' approved, ' . $data['pending'] . ' pending, and ' . $data['rejected'] . ' rejected alumni verification requests.';
        }
        if ($tool === 'alumni_registry_summary') {
            $program = (string) ($resolution['program_code'] ?? '');
            if ($metric === 'program' && $program !== '') {
                $count = (int) ($data['course_totals'][$program] ?? 0);
                if ($filipino) return 'May ' . $count . ' registered ' . $program . ' alumni records sa kasalukuyan.';
                return 'There are currently ' . $count . ' registered ' . $program . ' alumni records.';
            }
            if ($metric === 'by_program') {
                $parts = [];
                foreach ($data['course_totals'] as $code => $count) $parts[] = $code . ': ' . $count;
                $highest = !empty($data['course_totals']) ? max($data['course_totals']) : 0;
                $leaders = [];
                foreach ($data['course_totals'] as $code => $count) if ($count === $highest) $leaders[] = $code;
                if ($filipino) return implode(' at ', $leaders) . ' ang may pinakamaraming registered alumni sa kasalukuyan: ' . $highest . '. Breakdown: ' . implode(', ', $parts) . '.';
                return implode(' and ', $leaders) . ' currently ' . (count($leaders) === 1 ? 'has' : 'have') . ' the most registered alumni with ' . $highest . '. Breakdown: ' . implode(', ', $parts) . '.';
            }
            if ($filipino) {
                if ($metric === 'total') return 'May ' . $data['all_alumni'] . ' registered alumni records sa kasalukuyan.';
                if ($metric === 'answered') return $data['done_answering'] . ' alumni ang nakatapos ng survey mula sa ' . $data['all_alumni'] . ' registered alumni.';
                if ($metric === 'not_answered') return $data['not_answered'] . ' alumni ang hindi pa sumasagot mula sa ' . $data['all_alumni'] . ' registered alumni.';
                return $data['done_answering'] . ' alumni ang nakatapos ng survey at ' . $data['not_answered'] . ' ang hindi pa sumasagot, mula sa ' . $data['all_alumni'] . ' registered alumni.';
            }
            if ($metric === 'total') return 'There are currently ' . $data['all_alumni'] . ' registered alumni records.';
            if ($metric === 'answered') return $data['done_answering'] . ' alumni have completed the survey out of ' . $data['all_alumni'] . ' registered alumni.';
            if ($metric === 'not_answered') return $data['not_answered'] . ' alumni have not answered yet out of ' . $data['all_alumni'] . ' registered alumni.';
            return $data['done_answering'] . ' alumni have completed the survey, while ' . $data['not_answered'] . ' have not answered yet, out of ' . $data['all_alumni'] . ' registered alumni.';
        }
        if ($tool === 'graduate_program_counts') {
            $program = (string) ($resolution['program_code'] ?? '');
            if ($program !== '') {
                foreach ($data['programs'] as $row) if ($row['code'] === $program) return $filipino
                    ? 'May ' . $row['count'] . ' non-archived ' . $program . ' graduate records sa saklaw ng account mo.'
                    : 'There are ' . $row['count'] . ' non-archived ' . $program . ' graduate records in your authorized scope.';
                return $filipino
                    ? 'Hindi ko makita ang ' . $program . ' sa graduate data na available sa account mo.'
                    : 'I could not find ' . $program . ' in the graduate data available to your account.';
            }
            if ($metric === 'total') return $filipino
                ? 'May ' . $data['total'] . ' non-archived graduate records sa saklaw ng account mo.'
                : 'There are ' . $data['total'] . ' non-archived graduate records in your authorized scope.';
            $parts = [];
            foreach ($data['programs'] as $row) $parts[] = $row['code'] . ': ' . $row['count'];
            if ($filipino) return 'Mga non-archived graduate ayon sa program sa saklaw mo: ' . implode(', ', $parts) . '.';
            return 'Active graduates by program in your authorized scope: ' . implode(', ', $parts) . '.';
        }
        if (in_array($tool, ['job_approval_summary', 'managed_job_summary', 'forum_moderation_summary', 'announcement_summary'], true)) {
            $statuses = $data['statuses'];
            if ($filipino && isset($statuses[$metric])) return 'May ' . $statuses[$metric] . ' ' . $metric . ' ' . strtolower(str_replace('_', ' ', $data['feature'])) . ' record(s) sa kasalukuyan.';
            if (isset($statuses[$metric])) return 'There are currently ' . $statuses[$metric] . ' ' . $metric . ' ' . strtolower(str_replace('_', ' ', $data['feature'])) . ' record(s).';
            $parts = [];
            foreach ($statuses as $status => $count) $parts[] = $status . ': ' . $count;
            if ($filipino) return 'Status ng ' . strtolower(str_replace('_', ' ', $data['feature'])) . ': ' . implode(', ', $parts) . '.';
            return ucfirst(str_replace('_', ' ', $data['feature'])) . ' status: ' . implode(', ', $parts) . '.';
        }
        if ($tool === 'system_user_summary') {
            if ($metric === 'active') return 'There are ' . $data['active'] . ' active administrator accounts.';
            if ($metric === 'inactive') return 'There are ' . $data['inactive'] . ' inactive administrator accounts.';
            return 'There are ' . $data['total'] . ' administrator accounts: ' . $data['active'] . ' active and ' . $data['inactive'] . ' inactive.';
        }
        if ($tool === 'system_dashboard_statistics') {
            if (isset($data[$metric]) && is_int($data[$metric])) {
                $label = str_replace('_', ' ', $metric);
                return 'There are currently ' . $data[$metric] . ' ' . $label . ' in GradTrack.';
            }
            return 'GradTrack currently has ' . $data['admin_users'] . ' administrator accounts, ' . $data['graduates'] . ' graduate records, ' . $data['alumni_accounts'] . ' alumni accounts, ' . $data['surveys'] . ' surveys, and ' . $data['submitted_survey_responses'] . ' submitted survey responses.';
        }
        return $filipino
            ? 'Hindi ko makita ang impormasyong iyon sa GradTrack data na available sa account mo.'
            : "I couldn't find that information in the GradTrack data available to your account.";
    }
}

if (!function_exists('gradtrack_genai_tool_source_metrics')) {
    function gradtrack_genai_tool_source_metrics(array $resolution, array $data): array
    {
        $tool = (string) $resolution['tool'];
        if (in_array($tool, ['survey_participation_list', 'employment_status_list', 'graduate_record_list', 'alumni_verification_list', 'alumni_registry_list'], true)) return [
            ['label' => 'Matching records', 'value' => (string)($data['total_matching'] ?? 0)],
            ['label' => 'Records shown', 'value' => (string)($data['returned'] ?? 0)],
        ];
        if ($tool === 'alumni_verification_summary') return [
            ['label' => 'Approved', 'value' => (string) $data['approved']],
            ['label' => 'Pending', 'value' => (string) $data['pending']],
            ['label' => 'Rejected', 'value' => (string) $data['rejected']],
        ];
        if ($tool === 'alumni_registry_summary') return [
            ['label' => 'All Alumni', 'value' => (string) $data['all_alumni']],
            ['label' => 'Done Answering', 'value' => (string) $data['done_answering']],
            ['label' => 'Not Answered', 'value' => (string) $data['not_answered']],
        ];
        if (isset($data['statuses']) && is_array($data['statuses'])) {
            return array_map(static function ($status, $count): array {
                return ['label' => ucwords(str_replace('_', ' ', (string) $status)), 'value' => (string) $count];
            }, array_keys($data['statuses']), array_values($data['statuses']));
        }
        if ($tool === 'system_user_summary') return [
            ['label' => 'All Accounts', 'value' => (string) $data['total']],
            ['label' => 'Active', 'value' => (string) $data['active']],
            ['label' => 'Inactive', 'value' => (string) $data['inactive']],
        ];
        if ($tool === 'graduate_program_counts') {
            return array_map(static function (array $row): array {
                return ['label' => (string) $row['code'], 'value' => (string) $row['count']];
            }, $data['programs']);
        }
        if ($tool === 'system_dashboard_statistics') return [
            ['label' => 'Administrator Accounts', 'value' => (string) $data['admin_users']],
            ['label' => 'Graduate Records', 'value' => (string) $data['graduates']],
            ['label' => 'Alumni Accounts', 'value' => (string) $data['alumni_accounts']],
            ['label' => 'Surveys', 'value' => (string) $data['surveys']],
            ['label' => 'Submitted Responses', 'value' => (string) $data['submitted_survey_responses']],
        ];
        return [];
    }
}

if (!function_exists('gradtrack_genai_tool_presentation')) {
    /**
     * Builds a UI-safe response description from server-owned tool output.
     * Record names and values in this payload never come from model-generated text.
     */
    function gradtrack_genai_tool_presentation(array $resolution, array $data): array
    {
        $tool = (string)($resolution['tool'] ?? '');
        $metric = (string)($resolution['metric'] ?? 'summary');
        $programCode = strtoupper((string)($resolution['program_code'] ?? ''));
        $graduationYear = (int)($resolution['graduation_year'] ?? 0);
        $stats = [];
        $actions = [];
        $presentation = [
            'kind' => 'statistics',
            'title' => (string)($resolution['feature'] ?? 'GradTrack data'),
            'summary' => '',
            'stats' => [],
            'records' => [],
            'comparison' => [],
            'actions' => [],
            'footnote' => 'Based on the current authorized GradTrack data.',
        ];

        if (str_ends_with($tool, '_list')) {
            $titleMap = [
                'survey_participation_list' => $metric === 'answered' ? 'Answered Survey' : ($metric === 'not_answered' ? 'No Survey Response' : 'Survey Participation'),
                'employment_status_list' => $metric === 'unemployed' ? 'Unemployed Graduate Respondents' : 'Employed Graduate Respondents',
                'graduate_record_list' => 'Graduate Records',
                'alumni_verification_list' => 'Alumni Verification',
                'alumni_registry_list' => 'Registered Alumni',
            ];
            $surveyParticipationRoute = str_starts_with((string)($resolution['authenticated_role'] ?? ''), 'dean_')
                ? '/admin/survey-status'
                : '/admin/graduates';
            $routeMap = [
                'survey_participation_list' => $surveyParticipationRoute,
                'employment_status_list' => '/admin/reports?tab=employment',
                'graduate_record_list' => '/admin/graduates',
                'alumni_verification_list' => '/admin/alumni-registered-list',
                'alumni_registry_list' => '/admin/alumni-registered-list',
            ];
            $records = [];
            foreach (($data['records'] ?? []) as $record) {
                if (!is_array($record)) continue;
                $status = (string)($record['status'] ?? $record['verification_status'] ?? $record['registration_status'] ?? '');
                $details = [];
                if (!empty($record['program'])) $details[] = ['label' => 'Program', 'value' => (string)$record['program']];
                if (!empty($record['year_graduated'])) $details[] = ['label' => 'Batch', 'value' => (string)$record['year_graduated']];
                if (!empty($record['batch_year'])) $details[] = ['label' => 'Batch', 'value' => (string)$record['batch_year']];
                if (!empty($record['work_location'])) $details[] = ['label' => 'Work Location', 'value' => (string)$record['work_location']];
                $records[] = [
                    'title' => (string)($record['name'] ?? 'Unnamed record'),
                    'details' => $details,
                    'status' => $status,
                    'tone' => in_array(strtolower($status), ['answered', 'approved', 'verified', 'active', 'employed'], true) ? 'positive'
                        : (in_array(strtolower($status), ['not answered', 'pending', 'inactive', 'unemployed'], true) ? 'warning' : 'neutral'),
                ];
            }
            $offset = max(0, (int)($data['offset'] ?? 0));
            $returned = count($records);
            $total = (int)($data['total_matching'] ?? 0);
            $from = $returned > 0 ? $offset + 1 : 0;
            $to = $offset + $returned;
            $query = [];
            if ($metric !== 'summary') $query['status'] = $metric;
            if ($programCode !== '') $query['program'] = $programCode;
            if ($graduationYear > 0) $query['year_graduated'] = (string)$graduationYear;
            if (!empty($data['selected_survey']['id'])) $query['survey_id'] = (string)$data['selected_survey']['id'];
            $route = $routeMap[$tool] ?? '/admin';
            if (!empty($query)) $route .= '?' . http_build_query($query);

            $presentation['kind'] = empty($records) ? 'empty' : 'list';
            $presentation['title'] = $titleMap[$tool] ?? 'Matching Records';
            $presentation['summary'] = $total === 1 ? '1 matching record' : $total . ' matching records';
            $presentation['records'] = $records;
            $presentation['pagination'] = [
                'from' => $from,
                'to' => $to,
                'total' => $total,
                'hasMore' => $to < $total,
                'nextPrompt' => 'Show next 10',
            ];
            $presentation['actions'] = [[
                'label' => $tool === 'survey_participation_list'
                    ? (str_starts_with((string)($resolution['authenticated_role'] ?? ''), 'dean_') ? 'Open Survey Participation' : 'View in Graduate Records')
                    : 'Open ' . ($titleMap[$tool] ?? 'records'),
                'route' => $route,
                'variant' => 'primary',
            ]];
            if ($tool === 'survey_participation_list' && is_array($data['participation_summary'] ?? null)) {
                $summary = $data['participation_summary'];
                $presentation['stats'] = [
                    ['label' => 'Not Answered', 'value' => (string)($summary['not_answered'] ?? 0), 'tone' => 'danger'],
                    ['label' => 'Answered', 'value' => (string)($summary['answered'] ?? 0), 'tone' => 'positive'],
                    ['label' => 'Total', 'value' => (string)($summary['total'] ?? 0), 'tone' => 'primary'],
                ];
                $presentation['progress'] = [
                    'value' => (float)($summary['response_rate'] ?? 0),
                    'label' => 'Response rate',
                ];
                $presentation['footnote'] = 'Based on the selected active survey and authorized program/year filters.';
            }
            return $presentation;
        }

        if ($tool === 'alumni_verification_summary') {
            $stats = [
                ['label' => 'Approved', 'value' => (string)$data['approved'], 'tone' => 'positive'],
                ['label' => 'Pending', 'value' => (string)$data['pending'], 'tone' => 'warning'],
                ['label' => 'Rejected', 'value' => (string)$data['rejected'], 'tone' => 'danger'],
            ];
            $presentation['title'] = 'Alumni Verification';
            $actions[] = ['label' => 'Open Alumni Verification', 'route' => '/admin/alumni-registered-list', 'variant' => 'primary'];
        } elseif ($tool === 'alumni_registry_summary') {
            $stats = [
                ['label' => 'All Alumni', 'value' => (string)$data['all_alumni'], 'tone' => 'primary'],
                ['label' => 'Answered', 'value' => (string)$data['done_answering'], 'tone' => 'positive'],
                ['label' => 'Not Answered', 'value' => (string)$data['not_answered'], 'tone' => 'danger'],
            ];
            $presentation['title'] = 'Registered Alumni';
            $actions[] = ['label' => 'Open Registered Alumni', 'route' => '/admin/alumni-registered-list', 'variant' => 'primary'];
            if ($metric === 'by_program' && is_array($data['course_totals'] ?? null)) {
                $presentation['kind'] = 'comparison';
                foreach ($data['course_totals'] as $code => $count) {
                    $presentation['comparison'][] = ['label' => (string)$code, 'value' => (float)$count, 'displayValue' => (string)$count];
                }
            }
        } elseif ($tool === 'graduate_program_counts') {
            $presentation['title'] = 'Graduates by Program';
            $presentation['kind'] = 'comparison';
            foreach (($data['programs'] ?? []) as $row) {
                $presentation['comparison'][] = [
                    'label' => (string)($row['code'] ?? ''),
                    'value' => (float)($row['count'] ?? 0),
                    'displayValue' => (string)($row['count'] ?? 0),
                ];
            }
            $actions[] = ['label' => 'Open Graduate Records', 'route' => '/admin/graduates', 'variant' => 'primary'];
        } elseif (isset($data['statuses']) && is_array($data['statuses'])) {
            foreach ($data['statuses'] as $status => $count) {
                $tone = in_array($status, ['approved', 'published', 'resolved'], true) ? 'positive'
                    : (in_array($status, ['pending', 'draft'], true) ? 'warning' : 'neutral');
                $stats[] = ['label' => ucwords(str_replace('_', ' ', (string)$status)), 'value' => (string)$count, 'tone' => $tone];
            }
            $presentation['title'] = ucwords(str_replace('_', ' ', (string)($data['feature'] ?? 'Status Summary')));
            $route = match ($tool) {
                'job_approval_summary' => '/admin/job-approvals',
                'managed_job_summary' => '/admin/job-postings',
                'forum_moderation_summary' => '/admin/forum-moderation',
                'announcement_summary' => '/admin/announcements',
                default => '/admin',
            };
            $actions[] = ['label' => 'Open ' . $presentation['title'], 'route' => $route, 'variant' => 'primary'];
        } elseif ($tool === 'system_user_summary') {
            $presentation['title'] = 'Administrator Accounts';
            $stats = [
                ['label' => 'All Accounts', 'value' => (string)$data['total'], 'tone' => 'primary'],
                ['label' => 'Active', 'value' => (string)$data['active'], 'tone' => 'positive'],
                ['label' => 'Inactive', 'value' => (string)$data['inactive'], 'tone' => 'warning'],
            ];
            $actions[] = ['label' => 'Open User Management', 'route' => '/admin/user-management', 'variant' => 'primary'];
        } elseif ($tool === 'system_dashboard_statistics') {
            $presentation['title'] = 'GradTrack System Summary';
            foreach (['admin_users' => 'Admin Users', 'graduates' => 'Graduates', 'alumni_accounts' => 'Alumni Accounts', 'surveys' => 'Surveys', 'submitted_survey_responses' => 'Submitted Responses'] as $key => $label) {
                $stats[] = ['label' => $label, 'value' => (string)($data[$key] ?? 0), 'tone' => 'primary'];
            }
            $actions[] = ['label' => 'Open Dashboard', 'route' => '/admin', 'variant' => 'primary'];
        }

        $presentation['stats'] = $stats;
        $presentation['actions'] = $actions;
        return $presentation;
    }
}
