# GradTrack System Flow and Questionnaire Alignment

## Scope reviewed

The review used the implemented React routes and role navigation, the visible page controls, and the PHP endpoint authorization and actions. Questionnaire statements were limited to functions supported by both the user interface and the corresponding backend flow.

The six supplied questionnaires represent the Research Coordinator, Dean, Registrar, Super Admin, Alumni/Graduate, and Alumni President. The system also contains an `admin` survey-management role and an `mis_staff` role, but no new questionnaire was created for either role because neither was included in the supplied documents.

## Implemented end-to-end flow

1. **Registrar record preparation** — The Registrar manually adds individual graduates or imports XLSX/CSV lists, searches and filters official records, archives active records, and restores or permanently deletes records from the Registrar Archive.
2. **Survey preparation** — The separate `admin` role creates and manages surveys, questions, graduation-year coverage, responses, analytics, and reports. These functions were not assigned to the Research Coordinator or Super Admin questionnaires.
3. **Participation monitoring** — A Dean sees participation only for the program codes assigned to the Dean role, searches and filters graduate records, opens submitted answers read-only, selects nonrespondents with an email recorded, and sends reminder emails. The page uses the active survey automatically; its survey selector is disabled.
4. **Graduate survey flow** — A graduate verifies against the official record using student number or email together with last name and program. GradTrack checks the active survey and graduation-year coverage, issues survey access, shows consent, prefills matching registrar data, validates required answers, autosaves an unfinished browser draft, and accepts one submitted response.
5. **Portal account request** — After survey submission, the graduate may create a Graduate Portal account from the prefilled identity using a policy-compliant password. The request remains pending until Alumni Admin review.
6. **Alumni verification and registry** — The Alumni President, represented in code by the `alumni_admin` role, reviews account requests, checks registry linkage, approves or rejects requests, imports/exports and edits the alumni registry, and manages its archive lifecycle.
7. **Graduate Portal services** — An approved graduate account can use announcements, dashboard rating information, the community forum, direct and group messaging, approved job browsing, conditional job posting, profiles, photos, password settings, and notifications. Job-post creation requires the graduate to be marked employed, and submitted job posts require Alumni Admin approval before appearing to other graduates.
8. **Research use** — The Research Coordinator has a read-only GradTrack Dashboard containing employment, employability-by-program, alignment, graduation-year trend, survey coverage, and selected-survey snapshot information. The role is not given survey editing, graduate record management, response export, or report-generation routes.
9. **System administration** — The Super Admin manages staff accounts, reminders and reminder configuration, audit-log review/export, SQL backup download, system settings, maintenance mode, and public About/FAQ/Privacy content. The Super Admin is not automatically granted the separate survey-manager, Registrar, Dean, or Alumni Admin modules.

## Important questionnaire corrections

- **Research Coordinator:** Replaced the earlier “existing procedure” items that implied graduate-record editing, survey distribution, reminders, and report preparation. The revised 40 function statements now cover only the implemented read-only dashboard and common account controls.
- **Dean:** Removed claims that the Dean can choose or filter by survey. The interface automatically displays the active survey and disables the selector. The replacement statements cover the implemented name/email/student-ID search, response-status and graduation-year filters, read-only answer viewer, selection rules, editable reminder message, and reminder results.
- **Registrar:** Reworded the statements around the actual add/import/search/archive workflow. No edit or export function was claimed because the current Registrar screen does not expose either action for active graduate records.
- **Super Admin:** Removed broad wording that could imply access to every operational module. The revision names the actual Super Admin routes and distinguishes reminder interval configuration from the external scheduler that executes automatic reminders. Database restore was not claimed because the screen provides backup download, not an in-app restore action.
- **Alumni/Graduate:** Added the implemented identity verification, eligibility, consent, prefilling, required-field validation, browser draft, survey submission, and post-survey portal-account request. Portal statements now include the actual conditions on job posting and optional feature switches.
- **Alumni President:** Matched the respondent title to the system's `alumni_admin` role and made registry, announcement, forum-report moderation, and job-approval statements correspond to visible actions and recorded statuses.
- **Admin profile detail:** The questionnaire does not claim that an administrative user can update their own email. Although the profile form displays an editable email field, the current profile endpoint persists the full name, password, and profile image but not the submitted email value.

## Document-format validation

- Original US Letter page size and margins retained.
- Original Arial typography, heading hierarchy, bilingual English/Tagalog presentation, table widths, 4-point agreement scale, and role-specific footer retained.
- Each document contains 40 implemented role-function statements and 20 selected ISO/IEC 25010:2023 quality statements.
- Table header rows repeat after a page break, and questionnaire rows are marked to stay together.
- Microsoft Word opened and repaginated every output without a repair prompt. No questionnaire row split across two pages.

| Questionnaire | Word pages | Role-function items | Quality items | Split table rows |
|---|---:|---:|---:|---:|
| Research Coordinator | 5 | 40 | 20 | 0 |
| Dean | 4 | 40 | 20 | 0 |
| Registrar | 4 | 40 | 20 | 0 |
| Super Admin | 5 | 40 | 20 | 0 |
| Alumni/Graduate | 5 | 40 | 20 | 0 |
| Alumni President (Alumni Admin) | 5 | 40 | 20 | 0 |

## Primary code evidence

- Role routes and route guards: `frontend/src/App.tsx`
- Role navigation: `frontend/src/pages/admin/AdminLayout.tsx`
- Research dashboard and metrics: `frontend/src/pages/admin/Dashboard.tsx`, `backend/api/dashboard/stats.php`
- Dean monitoring and reminders: `frontend/src/pages/admin/DeanSurveyStatus.tsx`, `backend/api/dean/survey-status.php`, `backend/api/graduates/notify.php`
- Registrar record management: `frontend/src/pages/admin/Graduates.tsx`, `backend/api/graduates/index.php`
- Super Admin modules: `frontend/src/pages/admin/UserManagement.tsx`, `AutoReminders.tsx`, `AuditTrail.jsx`, `BackupDatabase.tsx`, `Settings.tsx`, and `PublicWebsiteContentSettings.tsx`
- Graduate survey and account request: `frontend/src/pages/SurveyVerification.tsx`, `frontend/src/pages/Survey.tsx`, `backend/api/surveys/verify.php`, `backend/api/surveys/responses.php`, `backend/api/graduate-auth/register-from-survey.php`
- Graduate Portal: `frontend/src/pages/GraduatePortal.tsx` and the forum, chat, job, profile, notification, and rating endpoints under `backend/api/`
- Alumni Admin modules: `frontend/src/pages/admin/AlumniRegisteredList.tsx`, `Announcements.tsx`, `ForumModeration.tsx`, and `EngagementApprovals.tsx`
