# GradTrack Light/Dark Theme Audit — 2026-10-06

## Verification basis

Every active route in `frontend/src/App.tsx`, every role navigation entry in `AdminLayout`, and every tab/conditional page in `GraduatePortal`, `Reports`, and System Settings was inventoried. The page/component source was audited for theme surfaces, text, borders, controls, overlays, tables, charts, and responsive behavior. Shared theme regression assertions, TypeScript, ESLint, a production build, frontend business-rule tests, PHP syntax checks, and backend analytics/statistics tests were run.

`PASS` means the active route or component is covered by explicit theme-aware classes or by the shared semantic compatibility layer, has responsive constraints for narrow screens, and passed the relevant static/build/regression checks. Protected routes still require a final human visual smoke test with real accounts and representative production data because test credentials were not stored in the repository.

## Route and page matrix

| Role | Page / component | Light | Dark | Mobile | Result |
|---|---|---:|---:|---:|---:|
| Public | Home (`/`) | PASS | PASS | PASS | PASS |
| Public | Announcements list and detail (`/announcements`, `/announcements/:id`) | PASS | PASS | PASS | PASS |
| Public | About (`/about`) | PASS | PASS | PASS | PASS |
| Public | FAQ accordions (`/faq`) | PASS | PASS | PASS | PASS |
| Public | Privacy Policy (`/privacy-policy`) | PASS | PASS | PASS | PASS |
| Public | Maintenance (`/maintenance`) | PASS | PASS | PASS | PASS |
| Public | Survey verification (`/survey-verify`) | PASS | PASS | PASS | PASS |
| Public | Survey form, conditional fields, validation, success/error states (`/survey`) | PASS | PASS | PASS | PASS |
| Personnel | Sign in and forgot password (`/admin/signin`, `/admin/forgot-password`) | PASS | PASS | PASS | PASS |
| Graduate | Sign in and forgot password (`/graduate/signin`, `/graduate/forgot-password`) | PASS | PASS | PASS | PASS |
| Research Coordinator | Dashboard | PASS | PASS | PASS | PASS |
| Research Coordinator | Graduate Records / participation, survey answer viewer, filters, reminders | PASS | PASS | PASS | PASS |
| Research Coordinator | Survey Management, active/archive tabs, search, pagination | PASS | PASS | PASS | PASS |
| Research Coordinator | Survey creation/template modal | PASS | PASS | PASS | PASS |
| Research Coordinator | Edit Survey modal, protected-answer warning, question/subheader editors | PASS | PASS | PASS | PASS |
| Research Coordinator | Survey preview and Survey Detail (`/admin/surveys/:id`) | PASS | PASS | PASS | PASS |
| Research Coordinator | View Responses / Response Analytics: Summary, Questions, Individual | PASS | PASS | PASS | PASS |
| Research Coordinator | Response charts, filters, tables, empty/loading states | PASS | PASS | PASS | PASS |
| Research Coordinator | Reports: Overview | PASS | PASS | PASS | PASS |
| Research Coordinator | Reports: By Program | PASS | PASS | PASS | PASS |
| Research Coordinator | Reports: By Year | PASS | PASS | PASS | PASS |
| Research Coordinator | Reports: Employment Status | PASS | PASS | PASS | PASS |
| Research Coordinator | Reports: Salary Distribution | PASS | PASS | PASS | PASS |
| Research Coordinator | Reports: Survey Analytics / descriptive analytics | PASS | PASS | PASS | PASS |
| Research Coordinator | Reports: Inferential Analysis, contingency table, technical details, interpretation | PASS | PASS | PASS | PASS |
| Research Coordinator | Report PDF, Excel and DOCX export presentation pipeline | PASS | PASS | N/A | PASS |
| Research Coordinator | Job Postings: active/archive, create/edit/detail, search/filter | PASS | PASS | PASS | PASS |
| Research Coordinator | Profile, password and avatar | PASS | PASS | PASS | PASS |
| Dean | Scoped dashboard | PASS | PASS | PASS | PASS |
| Dean | Survey Participation, filters, answer viewer and reminders | PASS | PASS | PASS | PASS |
| Dean | Reports: Overview, Program, Year, Employment, Salary and Survey Analytics | PASS | PASS | PASS | PASS |
| Dean | Scoped report filters, charts and exports | PASS | PASS | PASS | PASS |
| Dean | Job Postings | PASS | PASS | PASS | PASS |
| Dean | Profile, notifications and account menu | PASS | PASS | PASS | PASS |
| Registrar | Graduate Records: active/archive, search/filter/pagination | PASS | PASS | PASS | PASS |
| Registrar | Add/edit/details, Excel import progress/results, restore/delete dialogs | PASS | PASS | PASS | PASS |
| Registrar | Profile, notifications and account menu | PASS | PASS | PASS | PASS |
| Admin | Admin dashboard/home | PASS | PASS | PASS | PASS |
| Admin | User Management: search, table/cards, create/edit dialogs | PASS | PASS | PASS | PASS |
| Admin | Automatic email reminders | PASS | PASS | PASS | PASS |
| Admin | Audit Trail: filters, table and pagination | PASS | PASS | PASS | PASS |
| Admin | Database Backup: status cards, included tables and confirmation | PASS | PASS | PASS | PASS |
| Admin | System Settings: General, Features, Email and Public Website Content | PASS | PASS | PASS | PASS |
| Admin | Public content editors for About, FAQ and Privacy | PASS | PASS | PASS | PASS |
| Admin | Profile, notifications and account menu | PASS | PASS | PASS | PASS |
| Alumni President | Alumni Verification / Registered List: active/archive and filters | PASS | PASS | PASS | PASS |
| Alumni President | Alumni import, edit, approval, linked-account and result dialogs | PASS | PASS | PASS | PASS |
| Alumni President | Announcement Manager: filters, cards, create/edit modal | PASS | PASS | PASS | PASS |
| Alumni President | Forum Moderation | PASS | PASS | PASS | PASS |
| Alumni President | Job Postings and Job Approval | PASS | PASS | PASS | PASS |
| Alumni President | Profile, notifications and account menu | PASS | PASS | PASS | PASS |
| Graduate | Community Forum home, composer, posts, comments, media, search/filter | PASS | PASS | PASS | PASS |
| Graduate | Dashboard deep link | PASS | PASS | PASS | PASS |
| Graduate | Announcements list/detail and media viewer | PASS | PASS | PASS | PASS |
| Graduate | Direct/group messages, attachments, participant picker and mini-profile | PASS | PASS | PASS | PASS |
| Graduate | Browse Jobs: search/filter, details, share and save | PASS | PASS | PASS | PASS |
| Graduate | Saved Jobs | PASS | PASS | PASS | PASS |
| Graduate | Job Posting editor and owned postings | PASS | PASS | PASS | PASS |
| Graduate | My Profile and community profile (`/graduate/community/profile/:graduateId`) | PASS | PASS | PASS | PASS |
| Graduate | Settings: personal, employment, education, profile photo, cover photo, security | PASS | PASS | PASS | PASS |
| Graduate | Desktop navigation, mobile bottom navigation and notification surfaces | PASS | PASS | PASS | PASS |
| MIS Staff | Dashboard/home (additional role discovered in the codebase) | PASS | PASS | PASS | PASS |
| MIS Staff | Profile, notifications and account menu | PASS | PASS | PASS | PASS |

## Shared component matrix

| Component family | Light | Dark | Mobile | Result |
|---|---:|---:|---:|---:|
| Page backgrounds; primary, nested and muted cards | PASS | PASS | PASS | PASS |
| Navbar, sidebar, account menu and mobile bottom navigation | PASS | PASS | PASS | PASS |
| Inputs, textareas, native selects, search bars and placeholders | PASS | PASS | PASS | PASS |
| Disabled, focus, hover and selected states | PASS | PASS | PASS | PASS |
| Tables, headers, alternating rows, totals and responsive wrappers | PASS | PASS | PASS | PASS |
| Tabs, badges, status indicators and pagination | PASS | PASS | PASS | PASS |
| Modals, confirmation dialogs, popovers and scrollable panels | PASS | PASS | PASS | PASS |
| Notification dropdown, badges, unread/read states and timestamps | PASS | PASS | PASS | PASS |
| Accordions and expandable/technical-detail panels | PASS | PASS | PASS | PASS |
| Loading, empty, error, warning and success states | PASS | PASS | PASS | PASS |
| Recharts axes, ticks, grids, legends, labels and tooltips | PASS | PASS | PASS | PASS |
| Export and statistical-result panels | PASS | PASS | PASS | PASS |
| AI descriptive/statistical panels and assistant overlays | PASS | PASS | PASS | PASS |

## Alignment-category audit

The live survey uses `Yes` / `No`. Active response analytics, dashboard data, report charts, legends, descriptive/AI context, statistics, and export presentation now expose only **Aligned** and **Not Aligned**.

The database audit found:

- `employment.is_aligned = 'partially_aligned'`: **0 rows**.
- Raw `survey_responses.responses` containing legacy partial wording: **81 rows**, each stored as the exact scalar answer `"Partially related"`.

No response was deleted or rewritten. Compatibility normalizers retain the original JSON and fold the old wording into **Not Aligned**, so totals and denominators remain stable and no third category is invented. The schema definition is binary, and a defensive migration refuses to narrow the existing enum if a legacy employment row is ever detected.

## Automated verification

- `npm run typecheck`: PASS
- `npm run lint`: PASS with 25 existing warnings and 0 errors
- `npm run build` with the required production API/realtime environment values: PASS
- `npm run test:theme`: PASS, including numeric WCAG AA contrast checks
- `npm run test:descriptive-analytics`: PASS
- `npm run test:report-exports`: PASS
- `npm run test:survey-validation`: PASS
- `npm run test:graduate-import`: PASS
- `npm run test:graduation-archives`: PASS
- `npm run test:active-survey-years`: PASS
- PHP syntax checks for every changed PHP file: PASS
- `backend/tests/analytics_consistency_integration.php`: PASS
- `backend/tests/inferential_analysis_test.php`: PASS
- `backend/tests/statistical_interpretation_test.php`: PASS
- `backend/tests/survey_validation_rules_test.php`: PASS
- `backend/tests/role_permission_structure_test.php`: PASS
- `backend/tests/dean_reports_scope_integration.php`: PASS
- `backend/tests/graduate_portal_access_integration.php`: PASS
- `backend/tests/research_coordinator_authorization_http_integration.php`: PASS

## Deployment note

The new defensive enum migration was not applied to the local database because the migration runner correctly stopped on a checksum mismatch in an older, unrelated applied migration (`20260924_0004_repair_super_admin_account_role`). The application/API presentation is already binary. Reconcile that migration ledger/file mismatch before applying the new schema-narrowing migration; do not bypass the checksum guard.
