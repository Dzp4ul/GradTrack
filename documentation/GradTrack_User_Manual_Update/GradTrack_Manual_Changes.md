# GradTrack User Manual Change Report

## Deliverable Summary

- Reconstructed the User Manual from the current GradTrack source code and working local interfaces, using the previous 61-page PDF only as a structural and historical reference.
- Produced an 82-page, US Letter (8.5 × 11 inches), portrait manual in editable Word and finalized PDF formats.
- Captured and documented 69 current screenshots at a consistent 1440 × 900 desktop viewport.
- Updated the Table of Contents, List of Figures, sequential figure numbering, page numbering, cross-references, branding, and role-based procedures.
- Used anonymized documentation accounts and records in an isolated local database clone. No production or deployed records were changed.

## Priority Updates Requested

### Alumni Membership

- Added current screenshots and procedures for the public Alumni Membership information page and membership registration page.
- Documented Alumni President membership management using the current interface.
- Included the screenshots in both the updated manual and `GradTrack_Updated_Screenshots/`.

### Registrar

- Replaced the old Registrar screenshots with the current Manage Graduates and Registrar Archive interfaces.
- Removed outdated procedures for editing an existing graduate, opening View Details, and restoring an archived record.
- Clearly documented that the current graduate table has no row-level Actions column and that existing records have no Edit or View Details action.
- Documented only current Registrar functions: search and filtering, Add Graduate, Excel/CSV import, bulk archive, archive search/filtering, and authorized permanent deletion.

### Alumni President Action Icon

- Replaced the account-verification action screenshot with the current interface.
- Documented the updated blue eye icon and **View** action used to open an applicant's verification details.
- Updated the related account review and approval procedure.

## New or Newly Documented Features

- Public About, Frequently Asked Questions, Privacy Policy, and Alumni Membership pages.
- Graduate identity verification, data-privacy consent, tracer-survey completion, review, submission, and Graduate Portal account registration.
- Graduate Portal announcements, community forum, direct and group messaging, job discovery and application links, saved jobs, graduate-submitted job posts, credentials, profile, notifications, and settings.
- Research Coordinator survey monitoring, reminders, reports, descriptive analysis, inferential analysis, job-post management, and role-scoped AI assistant.
- Dean department dashboard, participation monitoring, graduate information, reports, analytics, job posts, and role-scoped AI assistant.
- Registrar bulk selection and archiving workflow, current archive behavior, and profile management.
- Alumni President account verification, registered alumni management, membership management, announcements, forum moderation, job approval, job-post management, and profile management.
- Administrator user management, automated email-reminder configuration, audit trail, database backup, general settings, branding settings, profile management, and role-scoped AI assistant.
- Separate MIS Staff dashboard and profile documentation.
- Current controlled job-posting lifecycle from submission and review through publication, discovery, saving, and external application.

## Removed or Corrected Procedures

- Removed Registrar editing of existing graduate information because the current interface does not provide that action.
- Removed Registrar View Details instructions and screenshots because the current table has no corresponding control.
- Removed Registrar archive-restoration instructions because the current archive interface does not provide Restore.
- Did not carry forward any action solely because it appeared in the previous manual.
- Corrected the previous treatment of Administrator and MIS Staff as interchangeable: they are separate roles in the current system.
- Removed obsolete interface descriptions, old button labels, outdated menu paths, and superseded screenshots.

## Updated Existing Workflows

- Rewrote public access and Graduate Portal procedures according to the current labels, fields, validation sequence, and account-approval flow.
- Rewrote survey instructions to include consent, review, successful submission, and account-registration stages.
- Updated role navigation, dashboard selection, filters, dialogs, forms, confirmation behavior, and expected results.
- Updated Alumni President account review to match the current blue eye/**View** action.
- Updated current approval and moderation procedures for graduate accounts, forum content, and graduate-submitted job posts.
- Updated Administrator settings and branding procedures to reflect the current tabbed configuration interface.

## Old-to-Current Feature Comparison

| Area | Previous Manual or Assumption | Verified Current Functionality | Documentation Change |
|---|---|---|---|
| Registrar graduate records | Existing-record actions included editing or record details. | The current Manage Graduates table ends with **Year Graduated** and has no row-level Actions column. | Removed Edit and View Details procedures; added a current screenshot that visibly has no Actions column. |
| Registrar archive | Archive procedures implied restoration of a record. | The current Registrar Archive provides search/filtering and authorized permanent deletion, but no Restore action. | Removed restoration instructions and documented the current archive behavior. |
| Alumni President account review | The action graphic was represented by an older control or icon. | Account verification uses the current blue eye icon with a **View** label. | Replaced the action screenshot and revised the procedure. |
| Alumni membership | Membership pages and current management flow were incomplete or absent. | Public membership information/registration and Alumni President membership management are implemented. | Added dedicated screenshots and procedures. |
| Administrator and MIS Staff | Administrative functions could be read as shared or combined. | Administrator and MIS Staff are separate roles; MIS Staff currently has dashboard and profile access without Administrator configuration menus. | Created separate chapters and a role-permission explanation. |
| Public information | Older landing and access documentation did not cover all current public pages. | About, FAQ, Privacy Policy, and Alumni Membership pages are available. | Added current public screenshots and navigation guidance. |
| Graduate survey/account flow | The earlier flow did not fully represent the current review and registration sequence. | Identity verification, consent, survey, review, submission success, and account registration are distinct current stages. | Added and reordered procedures and screenshots to match the working sequence. |
| Graduate job support | Older job instructions did not cover the complete current lifecycle. | Graduates can discover, filter, save, share, and follow external application methods; graduate-submitted posts require review. | Added current job screens, rules, and role responsibilities. |
| Analytics and assistance | Current analytical and assistant interfaces were not fully documented. | Descriptive/inferential analysis and role-scoped AI assistant interfaces are present for authorized roles. | Added verified procedures and screenshots under the correct roles. |
| Branding | Previous manual contained older visual assets. | Current project assets and branding settings contain the latest GradTrack and Norzagaray College branding. | Updated the cover, document branding, and all interface screenshots with actual project assets. |

## Screenshot Replacement and Organization

- Captured 69 verified screenshots from the latest locally running application.
- Organized screenshots by Public and Access, Graduate Portal, Research Coordinator, Dean, Registrar, Alumni President, Administrator, and MIS Staff.
- Replaced outdated interface images rather than reusing screenshots from the previous PDF.
- Included relevant forms, tables, dashboards, dialogs, review screens, success states, action icons, settings, and profiles.
- Used anonymized names, email addresses, identifiers, and survey records in screenshots.
- Verified the capture manifest contains no recorded browser-console errors.

## Branding Changes

- Redesigned the front cover as a unique GradTrack editorial composition inspired by, but not copied from, the supplied user-guide reference.
- Added bold **USER MANUAL** typography, an asymmetric current-system preview, compact edition metadata, and a navy/gold researcher panel.
- Used a real current GradTrack public-interface screenshot instead of a generic device mock-up.
- Used the actual current GradTrack logo from the project assets.
- Used the actual current Norzagaray College logo and available alumni-association asset where applicable.
- Updated the cover, page header, descriptions, and screenshots to reflect current system branding.
- Preserved the researcher names from the previous manual because no newer researcher information was found in the project materials.

## Final Validation

- Verified all 69 figures are sequentially numbered and appear in the List of Figures and document body.
- Verified all 82 PDF pages use US Letter dimensions and portrait orientation.
- Refreshed Word fields before PDF export so the Table of Contents, List of Figures, and page references reflect the finalized layout.
- Visually inspected the rendered PDF from cover through the final appendix.
- Confirmed screenshots remain inside page margins, preserve aspect ratio, and remain paired with their captions.
- Confirmed the manual explicitly includes Alumni Membership, the action-free current Registrar interface, and the Alumni President's updated blue eye/**View** action.
- Confirmed Administrator and MIS Staff permissions are documented separately.

## Verification Boundaries and Safeguards

- The application was run against an isolated local database clone prepared only for documentation.
- The clone used generic documentation accounts and anonymized sample records.
- A survey was enabled only in the isolated clone so the consent, completion, review, submission, and registration states could be documented.
- No production record was edited, approved, archived, deleted, or otherwise changed.
- Real reminder emails and other outbound messages were not sent.
- External job applications and the public alumni-membership form were not submitted to outside services.
- Potentially destructive operations were described but not performed during screenshot capture.
- The original PDF and existing editable Word file, if any, were reference materials only; current source code and working interfaces were treated as authoritative.
