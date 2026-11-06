"""Build the thesis-ready GradTrack user manual from verified current screenshots."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "documentation" / "GradTrack_User_Manual_Update"
SHOTS = OUTPUT / "GradTrack_Updated_Screenshots"
DOCX = OUTPUT / "GradTrack_Updated_User_Manual.docx"
GRADTRACK_LOGO = ROOT / "frontend" / "public" / "GRADTRACK_LOGO1.png"
COLLEGE_LOGO = ROOT / "frontend" / "public" / "alumni" / "norzagaray-college-logo.png"
ALUMNI_LOGO = ROOT / "frontend" / "public" / "alumni" / "alumni-association-logo.png"

BLUE = "163B78"
NAVY = "0B1748"
GOLD = "F2B705"
LIGHT_BLUE = "EAF2FF"
LIGHT_GRAY = "F3F4F6"
MID_GRAY = "64748B"


@dataclass(frozen=True)
class Feature:
    title: str
    purpose: str
    steps: tuple[str, ...]
    result: str
    image: str
    caption: str
    description: str
    note: str = ""


def F(title: str, purpose: str, steps: Iterable[str], result: str, image: str,
      caption: str, description: str, note: str = "") -> Feature:
    return Feature(title, purpose, tuple(steps), result, image, caption, description, note)


PUBLIC = [
    F("Public Home Page", "Introduce GradTrack and provide entry points to the survey, Graduate Portal, public information, and personnel system.",
      ["Open the GradTrack web address in a supported browser.", "Use the top navigation to open Home, About, FAQ, Alumni Membership, or Privacy.", "Select Take Survey, Graduate Portal, or System for the required task."],
      "The selected public page or access portal opens.", "01_Public_and_Access/01_public_home.png", "GradTrack Public Home Page", "The current public landing page displays the latest GradTrack branding and navigation."),
    F("Public Announcements", "Allow visitors to read published college and alumni announcements without signing in.",
      ["From the public site, open Announcements when it is presented from the home page or portal.", "Review the announcement cards.", "Select Read More to open the complete announcement."],
      "The chosen published announcement is displayed.", "01_Public_and_Access/02_public_announcements.png", "Public Announcements Page", "Published announcements appear as image cards with their dates, categories, and summaries."),
    F("About GradTrack", "Explain the system mission and the graduate-tracing problem addressed by GradTrack.",
      ["Select About on the public navigation bar.", "Read the mission and system overview.", "Scroll to review the remaining informational sections."],
      "The About page presents the current system description.", "01_Public_and_Access/03_about_gradtrack.png", "About GradTrack Page", "The About page describes GradTrack's purpose using current system branding."),
    F("Frequently Asked Questions", "Provide quick answers about surveys, access, accounts, and common system concerns.",
      ["Select FAQ on the public navigation bar.", "Locate the relevant category.", "Select a question to expand its answer."],
      "The selected answer expands on the same page.", "01_Public_and_Access/04_frequently_asked_questions.png", "Frequently Asked Questions", "The FAQ page organizes common questions into expandable items."),
    F("Privacy Policy", "Inform users how GradTrack collects, uses, and protects personal information.",
      ["Select Privacy on the public navigation bar.", "Read the policy before supplying personal or survey information.", "Scroll to review the information categories and user responsibilities."],
      "The current privacy policy is displayed.", "01_Public_and_Access/05_privacy_policy.png", "GradTrack Privacy Policy", "The public privacy page presents the current notice and categories of collected information."),
    F("Alumni Membership Information", "Present the current Norzagaray College Alumni Association benefits, fees, and identification-card information.",
      ["Select Alumni Membership on the public navigation bar.", "Review the membership benefits and fee breakdown.", "Review the sample alumni identification card and important membership information."],
      "The visitor can review the published membership information before proceeding.", "01_Public_and_Access/06_alumni_membership_information.png", "Alumni Membership Information", "The membership page shows the current college and Alumni Association logos, benefits, fees, and ID-card preview."),
    F("Proceed to Alumni Registration", "Direct qualified graduates to the official Alumni Association registration process.",
      ["Open Alumni Membership from the public site.", "Scroll to Official Registration — How to Proceed.", "Read the eligibility and payment notes.", "Select Proceed to Alumni Registration; the official form opens in a new browser tab when enabled."],
      "The official Alumni Association registration page opens separately from GradTrack.", "01_Public_and_Access/07_alumni_membership_registration.png", "Alumni Membership Registration Link", "The registration call-to-action explains that GradTrack displays information only and does not collect membership payments."),
    F("Personnel Sign In", "Authenticate authorized college personnel according to their assigned role.",
      ["From the public site, select System, or open the personnel sign-in page.", "Enter the authorized email address and password.", "Select Sign In."],
      "GradTrack opens the modules allowed for the authenticated personnel role.", "01_Public_and_Access/08_personnel_sign_in.png", "Personnel Sign In Page", "The personnel sign-in page uses the current GradTrack and Norzagaray College branding."),
    F("Graduate Portal Login", "Allow approved graduates to access community, job, profile, and messaging features.",
      ["Open Graduate Portal from the public navigation.", "Enter the registered email address and password.", "Select Log In."],
      "An approved and active account opens the Graduate Community portal.", "01_Public_and_Access/09_graduate_portal_login.png", "Graduate Portal Login", "The Graduate Portal login page includes links for password recovery and survey access."),
    F("Graduate Identity Verification", "Match a graduate to the official registrar record before survey access or account creation.",
      ["Select Take Survey or Go to Survey.", "Choose Student Number or Email as the verification method.", "Enter the requested identifier, last name, and program exactly as recorded.", "Select Verify & Continue."],
      "A verified graduate proceeds to the assigned survey or eligible account-creation flow.", "01_Public_and_Access/10_graduate_identity_verification.png", "Graduate Identity Verification", "The verification form validates identity against the registrar's graduate records."),
    F("Data Privacy Consent", "Obtain informed consent before collecting tracer-survey responses.",
      ["Read the complete Data Privacy Notice & Informed Consent.", "Select the acknowledgement checkbox when you agree.", "Select I Agree & Proceed; select Decline & Go Back if you do not consent."],
      "Consent opens the survey; declining returns the user without submitting responses.", "01_Public_and_Access/11_data_privacy_consent.png", "Data Privacy Notice and Informed Consent", "The consent screen must be acknowledged before the survey form becomes available."),
    F("Complete the Graduate Tracer Survey", "Collect the graduate's personal, educational, training, further-study, and employment information.",
      ["Complete every field marked with an asterisk.", "Use the address selectors and choose answers that accurately describe the graduate.", "Select Next to continue through each section; use Previous to revise an earlier section.", "Observe the Draft saved indicator before leaving the page."],
      "Valid answers are saved as a draft and the next survey section opens.", "01_Public_and_Access/12_tracer_survey_first_section.png", "Graduate Tracer Survey Form", "The multi-section tracer survey shows progress, required fields, and draft status."),
    F("Review Survey Answers", "Let the graduate verify all answers before final submission.",
      ["On the last survey section, select Review Answers.", "Review each answer by section.", "Select Edit this section when a correction is required.", "Return to Review and select Confirm & Submit Survey only when the information is accurate."],
      "The survey is ready for a single final submission.", "01_Public_and_Access/13_survey_review.png", "Survey Review Screen", "The review screen groups all answers and provides an edit link for each section."),
    F("Survey Submission Result", "Confirm successful submission and present the graduate's next available actions.",
      ["After reviewing the answers, select Confirm & Submit Survey.", "Wait for the Survey Completed confirmation.", "Choose Register as Alumni Member for association information, or Create My GradTrack Account for portal registration."],
      "The final response is recorded and the post-survey choices are displayed.", "01_Public_and_Access/14_survey_submission_success.png", "Survey Completion and Next Actions", "The completion screen separates Alumni Association membership from Graduate Portal account creation."),
    F("Create a Graduate Portal Account", "Create a portal account after a qualifying survey response has been submitted.",
      ["From the completion screen, select Create My GradTrack Account.", "Review the verified name, program, graduation year, and contact number.", "Enter a valid email address.", "Create and confirm a password containing uppercase, lowercase, number, and symbol characters.", "Select Create Account."],
      "The account is submitted for Alumni President verification; access begins only after approval and activation.", "01_Public_and_Access/15_graduate_portal_account_registration.png", "Graduate Portal Account Registration", "The account form uses verified survey details and explains the pending Alumni President approval step."),
]


GRADUATE = [
    F("Community Forum", "Enable approved graduates to share updates and interact with the alumni community.",
      ["Sign in to the Graduate Portal.", "Select the Home or Community Forum icon.", "Use search and category, program, or year filters to locate posts.", "Use Like, Comment, Report, or Message only as appropriate."],
      "The forum displays posts allowed for the signed-in graduate.", "02_Graduate_Portal/01_community_forum.png", "Graduate Community Forum", "The forum combines posts, filters, and recent-message shortcuts."),
    F("Create a Community Post", "Publish a text or media update to the graduate community.",
      ["On Community Forum, select Create Post.", "Enter the post text.", "Optionally select Add Media and choose a supported file.", "Select Post."],
      "The post is submitted and appears according to the forum's current moderation rules.", "02_Graduate_Portal/02_community_post_composer.png", "Community Post Composer", "The composer accepts post text and optional supported media."),
    F("Graduate Announcements", "Show published college and alumni notices inside the Graduate Portal.",
      ["Select the Announcements icon.", "Browse the published announcement cards.", "Select Read More to view a complete notice."],
      "The graduate can read the current published notice.", "02_Graduate_Portal/03_announcements.png", "Graduate Announcements", "Portal announcements display current images, categories, summaries, and dates."),
    F("Direct and Group Messaging", "Support private and group communication among authorized graduates.",
      ["Select Messages.", "Choose an existing conversation or select New Message.", "Select a recipient or eligible group.", "Enter the message and send it."],
      "The message appears in the selected conversation.", "02_Graduate_Portal/04_direct_and_group_messages.png", "Direct and Group Messaging", "The messaging workspace lists conversations and the selected chat thread."),
    F("Browse Job Opportunities", "Help graduates find approved job opportunities relevant to their program and interests.",
      ["Select Browse Jobs.", "Use keyword, location, job-type, and program-fit filters.", "Use the sort list when needed.", "Select View Details on a job card."],
      "The selected job opportunity opens with its full details.", "02_Graduate_Portal/05_browse_jobs.png", "Browse Jobs", "The job browser presents filters, program fit, save, share, and View Details controls."),
    F("View and Apply for a Job", "Display the complete opportunity and direct the graduate to the employer's application method.",
      ["Open a job using View Details.", "Review the description, location, type, deadline, and program fit.", "Select Save or Share when needed.", "Follow Apply Now or the displayed employer instructions; external applications open outside GradTrack."],
      "The graduate is directed to the configured application channel.", "02_Graduate_Portal/06_job_opportunity_details.png", "Job Opportunity Details", "The detail view separates the opportunity description, application guidance, and job metadata."),
    F("Saved Jobs", "Keep selected active opportunities for later review.",
      ["Select Saved on a job card or detail page.", "Open Saved Jobs from the job navigation.", "Select View Details to revisit an opportunity, or select Saved again to remove it."],
      "The saved-jobs list reflects the graduate's current bookmarks.", "02_Graduate_Portal/07_saved_jobs.png", "Saved Job Opportunities", "The Saved Jobs page lists bookmarked active opportunities."),
    F("Manage Graduate Job Posts", "Allow graduates to review job opportunities they submitted for approval.",
      ["Select Job Posting.", "Review each post and its status.", "Use Edit or Delete only on posts for which the buttons are available.", "Select Create Job Post to submit another opportunity."],
      "The page shows the graduate's current job submissions and approval status.", "02_Graduate_Portal/08_my_job_posts.png", "Graduate Job Posts", "My Job Posts separates graduate submissions from the community forum."),
    F("Create a Graduate Job Post", "Submit an employment opportunity for Alumni President review.",
      ["On Job Posting, select Create Job Post.", "Enter the job title, company, location, salary range, employment type, description, and required skills.", "Select the appropriate course or program fit.", "Submit the form for review."],
      "The opportunity enters the job-approval workflow and is not public until approved.", "02_Graduate_Portal/09_create_job_post_form.png", "Create Job Post Form", "The form records employer details, job information, skills, and program fit."),
    F("Graduate Profile and Credentials", "Maintain the graduate's portal profile and professional credential records.",
      ["Open the profile menu and select My Profile.", "Review personal, education, employment, and credential information.", "Use the available profile controls to update portal information or add a credential."],
      "The profile displays the latest portal information and credential list.", "02_Graduate_Portal/10_profile_and_credentials.png", "Graduate Profile and Credentials", "The current profile combines a cover, identity summary, career details, and professional credentials."),
    F("Add a Professional Credential", "Store a professional certificate with issuing and verification details.",
      ["In My Profile, select Add Credential.", "Upload a supported certificate file.", "Enter the credential name, issuing organization, dates, ID, and verification link when applicable.", "Select Save Credential."],
      "The credential is added to the graduate profile.", "02_Graduate_Portal/11_add_professional_credential.png", "Add Professional Credential", "The credential dialog accepts a certificate file and structured professional details."),
    F("Graduate Profile Settings", "Update portal profile information, employment, education, photos, and password.",
      ["From My Profile, open Settings.", "Choose the relevant settings category.", "Update only the fields that have changed.", "Save the changes."],
      "The Graduate Portal profile is updated; the submitted tracer-survey response remains unchanged.", "02_Graduate_Portal/12_profile_settings.png", "Graduate Profile Settings", "Settings explicitly separate portal profile edits from the submitted survey record."),
    F("Graduate Notifications", "Show job, announcement, message, and account activity alerts.",
      ["Select the notification bell.", "Review unread and recent notifications.", "Select a notification to open its related module when available.", "Use Mark read or Mark all read as needed."],
      "Notification status is updated and the related content opens when selected.", "02_Graduate_Portal/13_notifications_panel.png", "Graduate Notifications Panel", "The notification panel groups current portal alerts and their module labels."),
]


RESEARCH = [
    F("Research Coordinator Dashboard", "Present institution-wide employment, alignment, survey-coverage, and trend indicators.",
      ["Sign in as Research Coordinator.", "Open Dashboard.", "Choose a survey from the Survey list.", "Review the summary cards and charts; use the program breakdown controls where provided."],
      "The dashboard displays analytics for the selected survey and permitted scope.", "03_Research_Coordinator/01_dashboard.png", "Research Coordinator Dashboard", "The dashboard shows employment rate, alignment, active survey, coverage, and program trends."),
    F("Graduate Records and Participation", "Monitor survey participation and prepare reminders for graduates who have not answered.",
      ["Open Graduate Records.", "Choose the survey and use status, program, year, and search filters.", "Select eligible non-respondents when a reminder is required.", "Review the message and select Notify Selected only after confirming the recipients."],
      "The filtered participation list is displayed; approved reminder actions are logged.", "03_Research_Coordinator/02_graduate_survey_participation.png", "Graduate Survey Participation", "The page shows answered and unanswered totals, filters, selection controls, and reminder text."),
    F("Survey Management", "Create, review, activate, complete, and archive tracer surveys according to authorized workflow.",
      ["Open Survey Management.", "Review active and saved survey cards and response counts.", "Use the card icons to view details, analytics, edit, or archive when the action is available.", "Do not create another survey while the interface indicates that an active survey must first be completed or archived."],
      "The survey list reflects the current lifecycle status and authorized actions.", "03_Research_Coordinator/03_survey_management.png", "Survey Management", "Survey cards show status, questions, responses, dates, preview, and current actions."),
    F("Edit Survey Information", "Update the permitted survey information and respondent targets before use.",
      ["On Survey Management, select the Edit icon for an editable survey.", "Review the title, description, status, dates, and respondent targets.", "Make only authorized changes.", "Save the survey."],
      "The survey information is updated and retained in Survey Management.", "03_Research_Coordinator/04_edit_survey.png", "Edit Survey", "The current edit dialog includes survey information, status, schedule, and respondent targets."),
    F("Response Monitoring", "Review summarized, question-level, and individual survey responses.",
      ["Open Survey Management and select the response or details control for a survey.", "Use program, batch, employment-status, and date filters.", "Review Summary, Questions, or Individual tabs.", "Use the search controls to locate a specific response when authorized."],
      "The selected response view displays the filtered survey data.", "03_Research_Coordinator/05_response_monitoring.png", "Survey Response Monitoring", "The response page presents totals, response rate, filters, and multiple analysis tabs."),
    F("Reports Overview", "Review and export aggregate graduate-tracer indicators.",
      ["Open Reports & Analytics.", "Choose the survey and set report filters.", "Select Apply Filters.", "Review the overview cards and charts; use Export PDF, Export Word, or Export Excel when an official output is required."],
      "The report updates to the selected filters or downloads in the chosen format.", "03_Research_Coordinator/06_reports_overview.png", "Reports and Analytics Overview", "The overview combines report filters, totals, and employment, location, and alignment charts."),
    F("Descriptive Survey Analytics", "View detailed tabular and graphical distributions of tracer-survey answers.",
      ["In Reports & Analytics, select Survey Analytics.", "Choose the survey.", "Choose the required table from the Table list.", "Select Show Graph when a chart is needed, or use the export controls."],
      "The selected descriptive table and available visualization are displayed.", "03_Research_Coordinator/07_descriptive_analysis.png", "Descriptive Survey Analytics", "Survey Analytics provides thesis-ready demographic and response tables."),
    F("Inferential Analysis", "Test the statistical association between two supported tracer variables.",
      ["In Reports & Analytics, select Inferential Analysis.", "Choose Variable 1 and Variable 2.", "Set year and program filters when available.", "Select Run Analysis and review the chi-square output and interpretation."],
      "GradTrack displays the computed association results for the chosen variables and filters.", "03_Research_Coordinator/08_inferential_analysis.png", "Inferential Analysis", "The inferential panel configures variables and filters before running a chi-square analysis."),
    F("Research Coordinator Job Postings", "Create and manage staff-originated opportunities for the Graduate Portal.",
      ["Open Job Postings.", "Use search to locate an existing managed post.", "Select Create Job to add an opportunity, or use Edit, Archive, or Delete only when appropriate.", "Confirm publication status before expecting the post to appear to graduates."],
      "The managed job list reflects the completed action.", "03_Research_Coordinator/09_job_postings.png", "Research Coordinator Job Postings", "The job manager displays current staff posts and their publication status."),
    F("Research Coordinator AI Assistant", "Provide role-scoped assistance using GradTrack data and permitted modules.",
      ["Select Ask GradTrack AI Assistant.", "Open a previous conversation or select New conversation.", "Enter a clear question related to authorized GradTrack data.", "Verify important results against the corresponding module or report before use."],
      "The assistant returns a role-scoped response and retains the conversation when supported.", "03_Research_Coordinator/10_ai_assistant.png", "Research Coordinator AI Assistant", "The assistant panel shows conversation history and responses limited to the signed-in role."),
]


DEAN = [
    F("Department-Scoped Dean Dashboard", "Show graduate outcomes only for the dean's assigned department and programs.",
      ["Sign in as Dean.", "Open Dashboard.", "Choose the relevant survey.", "Review department employment, alignment, coverage, and trend indicators."],
      "The dashboard displays only the dean's authorized academic scope.", "04_Dean/01_department_dashboard.png", "Dean Department Dashboard", "The Dean Dashboard identifies the assigned college and restricts metrics to its programs."),
    F("Dean Survey Participation", "Monitor survey completion for graduates in the dean's assigned programs.",
      ["Open Survey Participation.", "Choose the survey and apply search, status, and year filters.", "Review answered and unanswered totals.", "Use reminder controls only for eligible selected graduates."],
      "The scoped participation list and totals are displayed.", "04_Dean/02_survey_participation.png", "Dean Survey Participation", "The participation page identifies the dean's program scope and response status."),
    F("Dean Reports and Analytics", "Analyze department-specific graduate outcomes and export authorized reports.",
      ["Open Reports & Analytics.", "Choose a survey and batch or year.", "Apply the available employment and program-alignment filters.", "Review the charts or select an export format."],
      "The report displays or exports data within the dean's department scope.", "04_Dean/03_reports_and_analytics.png", "Dean Reports and Analytics", "The Dean report displays the restricted program scope above the analytic tabs."),
    F("Dean Job Postings", "Create and manage job opportunities for Graduate Portal publication.",
      ["Open Job Postings.", "Select Create Job to add an opportunity.", "Complete the current job form and publish or save it as allowed.", "Use search and available management actions for existing posts."],
      "The opportunity appears in the dean's managed job list with its current status.", "04_Dean/04_job_postings.png", "Dean Job Postings", "The Dean job page provides a scoped managed-post list and Create Job action."),
    F("Dean Profile", "Maintain the dean's personnel name, profile image, and password.",
      ["Open the account menu and select My Profile.", "Select Edit Profile when a profile change is required.", "Update permitted account details or password fields.", "Select Save Changes."],
      "The personnel profile is updated.", "04_Dean/05_personnel_profile.png", "Dean Personnel Profile", "The profile page separates account details from password changes."),
    F("Dean AI Assistant", "Answer questions using only data and functions available to the signed-in dean.",
      ["Select Ask GradTrack AI Assistant.", "Start or reopen a conversation.", "Ask a question about the assigned department, survey participation, reports, or permitted job data.", "Confirm critical results using the corresponding GradTrack page."],
      "The assistant responds within the dean's role and department scope.", "04_Dean/06_ai_assistant.png", "Dean AI Assistant", "The Dean assistant panel shows role-scoped conversation history."),
]


REGISTRAR = [
    F("Manage Graduate Records", "View, select, add, import, filter, and archive registrar graduate records.",
      ["Sign in as Registrar.", "Review the Manage Graduates table.", "Use the checkboxes only when a bulk archive operation is required.", "Use Add Graduate or Import Excel for authorized new records."],
      "The current graduate list is displayed without row-level Edit or View Details actions.", "05_Registrar/01_manage_graduates.png", "Registrar Manage Graduates", "The current table ends at Year Graduated and intentionally has no Actions column.",
      "Current-version rule: Registrar users cannot edit existing graduate information from this page. The former row-level Edit and View Details actions were removed."),
    F("Search and Filter Graduate Records", "Locate graduate records by identifier, name, email, department, and graduation year.",
      ["Open Manage Graduates.", "Enter a name, student ID, or email in Search graduates.", "Choose a Department.", "Choose a Year Graduated when required."],
      "The table updates to matching records; it remains a read-only row display.", "05_Registrar/02_search_and_filters.png", "Registrar Search and Filters", "Department and graduation-year filters narrow the read-only graduate table."),
    F("Add a Graduate Record", "Create a new official graduate record for later identity verification and survey assignment.",
      ["Select Add Graduate.", "Enter the student number, first name, optional middle name, last name, and name extension.", "Enter optional email and contact number when available.", "Select the program and enter the year graduated.", "Select Add Graduate."],
      "A valid new graduate record is added to Manage Graduates.", "05_Registrar/03_add_graduate_form.png", "Registrar Add Graduate Form", "The add form contains identity, contact, program, and graduation-year fields."),
    F("Import Graduate Records from Excel", "Add multiple graduate records using the current spreadsheet-import workflow.",
      ["Prepare the spreadsheet using the expected registrar columns.", "Select Import Excel.", "Choose the authorized Excel or CSV file.", "Review validation results and correct invalid or duplicate rows before confirming the import.", "Return to Manage Graduates and verify the imported records."],
      "Valid rows are added and the table refreshes; invalid rows are reported for correction.", "05_Registrar/04_import_excel_control.png", "Registrar Excel Import Control", "The Import Excel control is available above the current read-only record table."),
    F("Archive Graduate Records", "Move selected active records out of Manage Graduates while preserving related historical data, or permanently remove archived records when explicitly authorized.",
      ["On Manage Graduates, select records and choose Archive Selected, or select a department and year before Archive By Year.", "Confirm the archive operation after reviewing its scope.", "Select Archive to review archived records.", "Use permanent-delete controls only when explicitly authorized and after confirming that the action cannot be undone."],
      "Archived records appear in Registrar Archive; the current interface does not provide Edit, View Details, or Restore actions.", "05_Registrar/05_archive_records.png", "Registrar Archive", "Registrar Archive provides selection and permanent-deletion controls but no row-level actions or restore command.",
      "There is no Restore procedure in the current Registrar interface. Do not follow restore steps from an older manual."),
    F("Registrar Profile", "Maintain the Registrar's personnel profile and password.",
      ["Open the account menu and select My Profile.", "Select Edit Profile when required.", "Update permitted details or password fields.", "Select Save Changes."],
      "The Registrar personnel profile is updated; graduate records are unaffected.", "05_Registrar/06_personnel_profile.png", "Registrar Personnel Profile", "The Registrar profile page is separate from graduate-record management."),
]


ALUMNI = [
    F("Review Graduate Portal Account Requests", "Approve or reject Graduate Portal accounts after reviewing the submitted graduate information.",
      ["Sign in as Alumni President and open Alumni Verification.", "Use Pending, Approved, or Rejected to select the review queue.", "Select the blue eye View button in the Actions column.", "After review, select Approve or Reject; provide a reason when rejecting."],
      "The verification status changes and controls the graduate's portal eligibility.", "06_Alumni_President/01_alumni_verification_updated_view_details_action.png", "Alumni Verification with Updated View Details Action", "The current Actions column uses the updated blue eye icon with the View label beside Approve and Reject.",
      "This figure documents the latest View Details icon requested for the updated manual."),
    F("View Graduate Account Details", "Inspect verified survey and account information before deciding an account request.",
      ["Select View on a graduate request.", "Review verification status, portal status, email, student ID, program, year, phone, address, and submission timestamps.", "Select Approve or Reject from the dialog when ready, or select Close without changing status."],
      "The selected approval action is recorded, or the dialog closes without a change.", "06_Alumni_President/02_account_verification_details.png", "Alumni Account Details", "The details dialog presents the information required for Alumni President account review."),
    F("Manage Alumni Membership Information", "Maintain the public membership branding, page copy, benefits, fees, ID previews, instructions, and publication state.",
      ["Open Membership Management.", "Review the branding and page-copy fields.", "Update only confirmed Alumni Association information and assets.", "Use Preview draft before Save draft or Publish.", "Select Publish only after the content has been verified."],
      "The draft is saved or the approved membership content becomes public.", "06_Alumni_President/03_membership_management.png", "Alumni Membership Management", "The management page controls the two public membership views and their current branding."),
    F("Manage Announcements", "Create and maintain notices shown on public and Graduate Portal announcement pages.",
      ["Open Announcements.", "Use All, Published, Draft, or Archived to filter the list.", "Select Edit or Delete only for the intended announcement.", "Select New Announcement to create a notice."],
      "The announcement list reflects the completed action and current status.", "06_Alumni_President/04_announcements.png", "Alumni President Announcement Manager", "The Announcement Manager lists published content and available management actions."),
    F("Create an Announcement", "Publish or save an official notice with complete content and optional media.",
      ["Select New Announcement.", "Enter the title, category, event date when applicable, status, short description, and full content.", "Add supported media using the available controls.", "Select Create Announcement."],
      "The announcement is created with the selected publication status.", "06_Alumni_President/05_create_announcement.png", "Create Announcement Form", "The current form includes title, category, event date, status, summary, and full content."),
    F("Moderate Reported Forum Content", "Review and resolve graduate reports without altering unrelated community content.",
      ["Open Forum Moderation.", "Use report type, reason, status, and search filters.", "Select View Content before deciding.", "Choose Hide Content, Resolve Report, or Dismiss Report according to the verified case."],
      "The report and content status update according to the selected moderation decision.", "06_Alumni_President/06_forum_moderation.png", "Forum Moderation", "The moderation queue displays report counts, filters, content preview, and resolution controls."),
    F("Alumni President Job Postings", "Create and manage staff-originated opportunities displayed to graduates.",
      ["Open Job Postings.", "Select Create Job to add an official opportunity.", "Use search to locate an existing post.", "Use Edit, Archive, or Delete only after confirming the intended job and status."],
      "The staff job list reflects the completed action.", "06_Alumni_President/07_staff_job_postings.png", "Alumni President Job Postings", "The staff job manager shows publication status and authorized management controls."),
    F("Approve Graduate Job Posts", "Review job opportunities submitted by graduates before publication.",
      ["Open Job Approval.", "Use status tabs and search to locate a submission.", "Review the job information and program scope.", "Approve, decline, or archive the submission using the available control and provide a reason when required."],
      "The job submission moves to the selected approval status; only approved active posts appear in Browse Jobs.", "06_Alumni_President/08_graduate_job_approval.png", "Graduate Job Approval Queue", "The approval page summarizes pending, approved, declined, and archived graduate job posts."),
]


ADMIN = [
    F("User Management", "Maintain authorized personnel accounts, roles, and active status.",
      ["Sign in as Administrator and open User Management.", "Use search, role, and status filters.", "Select the edit or account-status action for the intended personnel record.", "Confirm role and status changes before saving."],
      "The personnel account list reflects the authorized update.", "07_Admin/01_user_management.png", "Administrator User Management", "User Management lists distinct Admin, MIS Staff, Research Coordinator, Registrar, Alumni President, and Dean roles."),
    F("Add a Personnel User", "Create a new authorized personnel account with a specific system role.",
      ["In User Management, select Add User.", "Enter the full name, username, email, and temporary password.", "Select the exact role and account status.", "Select Create User and communicate credentials through an approved channel."],
      "The new personnel account appears in User Management.", "07_Admin/02_add_user_form.png", "Add Personnel User", "The Add User form includes identity, login, role, password, and status fields."),
    F("Automated Email Reminders", "Configure and monitor survey reminders for eligible graduates who have not answered.",
      ["Open Auto Email Reminders.", "Review the active survey, eligible graduate count, frequency, and delivery totals.", "Use the Frequency, Send Reminders, or History tabs for the required task.", "Confirm recipients and settings before any manual send."],
      "The reminder configuration or delivery history is displayed and authorized sends are logged.", "07_Admin/03_auto_email_reminders.png", "Automated Email Reminders", "The reminder dashboard summarizes eligible graduates, frequency, totals, and recent run data."),
    F("Audit Trail", "Review read-only records of personnel authentication and administrative actions.",
      ["Open Audit Trail.", "Use search, role, department, action, module, and date filters.", "Select View Details for an event when needed.", "Select Export only when an authorized audit copy is required."],
      "The filtered audit events or selected event details are displayed.", "07_Admin/04_audit_trail.png", "Administrator Audit Trail", "The audit trail records actor, role, department, action, module, description, and time."),
    F("Database Backup", "Download a restorable SQL backup of the current GradTrack database.",
      ["Open Backup Database.", "Review the database name, table count, record count, estimated size, and checklist.", "Select Download Backup.", "Store the downloaded SQL file in a secure, access-controlled location and verify it using the institution's recovery procedure."],
      "A database backup file downloads without changing current records.", "07_Admin/05_database_backup.png", "Database Backup", "The backup page identifies included tables, counts, size, checklist, and restore note."),
    F("General System Settings", "Maintain approved system identity, contact, feature, survey, community, maintenance, and public-content configuration.",
      ["Open System Settings.", "Choose the relevant settings tab.", "Review the current values before editing.", "Select Save Changes only after confirming the full effect; use Cancel to discard unsaved changes."],
      "The approved configuration is saved and applied to its affected interface.", "07_Admin/06_system_settings.png", "General System Settings", "System Settings groups general, branding, login, feature, survey, community, maintenance, and public-content options."),
    F("Branding Settings", "Use the official current logos, favicon, and theme colors throughout GradTrack.",
      ["In System Settings, select Branding.", "Review the current System Logo, Login Logo, Favicon, and theme colors.", "Select Upload only for an approved official asset.", "Preview the interface and select Save Changes."],
      "The approved branding is applied to the configured system surfaces.", "07_Admin/07_branding_settings.png", "GradTrack Branding Settings", "The branding tab displays the current official GradTrack assets and theme colors."),
    F("Administrator Profile", "Maintain the Administrator's own personnel information, profile image, and password.",
      ["Open the account menu and select My Profile.", "Select Edit Profile.", "Update permitted details or password fields.", "Select Save Changes."],
      "The Administrator's personnel profile is updated.", "07_Admin/08_personnel_profile.png", "Administrator Profile", "The profile page separates account details from password changes."),
    F("Administrator AI Assistant", "Provide assistance using data and modules permitted to the Administrator role.",
      ["Select Ask GradTrack AI Assistant.", "Start a new conversation or open an existing one.", "Enter a clear system-related question.", "Verify operational or security-sensitive information using the relevant administrative module."],
      "The assistant returns a role-scoped response without performing unconfirmed destructive actions.", "07_Admin/09_ai_assistant.png", "Administrator AI Assistant", "The Administrator assistant panel is available from personnel pages and maintains conversation history."),
]


MIS = [
    F("MIS Staff Dashboard", "Provide MIS Staff with the current institution-wide graduate-outcome dashboard.",
      ["Sign in as MIS Staff.", "Open Dashboard.", "Choose the relevant survey.", "Review employment, alignment, coverage, and trend indicators."],
      "The selected survey's institution-wide dashboard is displayed.", "08_MIS_Staff/01_dashboard.png", "MIS Staff Dashboard", "The current MIS Staff role has dashboard access without the Administrator's management modules."),
    F("MIS Staff Profile", "Maintain the MIS Staff user's own profile and password.",
      ["Open the account menu and select My Profile.", "Select Edit Profile.", "Update permitted details or password fields.", "Select Save Changes."],
      "The MIS Staff profile is updated.", "08_MIS_Staff/02_personnel_profile.png", "MIS Staff Profile", "MIS Staff is a separate current role with profile access and no Admin configuration menu."),
]


def shade(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=90, start=110, bottom=90, end=110) -> None:
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_no_borders(table) -> None:
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        element = OxmlElement(f"w:{edge}")
        element.set(qn("w:val"), "nil")
        borders.append(element)


def add_field(paragraph, instruction: str, placeholder: str = "") -> None:
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = instruction
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    text = OxmlElement("w:t")
    text.text = placeholder
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    for node in (begin, instr, separate, text, end):
        run._r.append(node)


def add_page_number(section) -> None:
    section.footer.is_linked_to_previous = False
    paragraph = section.footer.paragraphs[0]
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = paragraph.add_run("Page ")
    run.font.name = "Arial"
    run.font.size = Pt(9)
    add_field(paragraph, "PAGE", "1")
    pg_num = OxmlElement("w:pgNumType")
    pg_num.set(qn("w:start"), "1")
    pg_num.set(qn("w:fmt"), "decimal")
    section._sectPr.append(pg_num)


def set_keep(paragraph, keep_next=False, keep_lines=True, page_break_before=False) -> None:
    p_pr = paragraph._p.get_or_add_pPr()
    if keep_next:
        p_pr.append(OxmlElement("w:keepNext"))
    if keep_lines:
        p_pr.append(OxmlElement("w:keepLines"))
    if page_break_before:
        p_pr.append(OxmlElement("w:pageBreakBefore"))


def add_label_paragraph(document: Document, label: str, text: str) -> None:
    p = document.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    r = p.add_run(f"{label}: ")
    r.bold = True
    r.font.color.rgb = RGBColor.from_string(NAVY)
    p.add_run(text)


def add_note(document: Document, text: str) -> None:
    table = document.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    cell = table.cell(0, 0)
    cell.width = Inches(6.35)
    shade(cell, "FFF7D6")
    set_cell_margins(cell, 110, 140, 110, 140)
    p = cell.paragraphs[0]
    r = p.add_run("Important: ")
    r.bold = True
    r.font.color.rgb = RGBColor.from_string("8A4B08")
    p.add_run(text)


def add_figure(document: Document, feature: Feature) -> None:
    image_path = SHOTS / feature.image
    if not image_path.exists():
        raise FileNotFoundError(image_path)
    table = document.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_no_borders(table)
    row = table.rows[0]
    tr_pr = row._tr.get_or_add_trPr()
    tr_pr.append(OxmlElement("w:cantSplit"))
    cell = row.cells[0]
    cell.width = Inches(6.35)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    set_cell_margins(cell, 70, 20, 50, 20)

    picture_p = cell.paragraphs[0]
    picture_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    picture_p.paragraph_format.space_after = Pt(4)
    picture_p.add_run().add_picture(str(image_path), width=Inches(6.25))

    caption_p = cell.add_paragraph(style="Caption")
    caption_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption_p.add_run("Figure ")
    add_field(caption_p, "SEQ Figure \\* ARABIC", "1")
    caption_p.add_run(f". {feature.caption}")
    set_keep(caption_p, keep_next=True)

    description_p = cell.add_paragraph()
    description_p.style = document.styles["Figure Description"]
    description_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    description_p.add_run(f"Figure description: {feature.description}")
    set_keep(description_p)


def add_feature(document: Document, number: str, feature: Feature) -> None:
    h = document.add_heading(f"{number} {feature.title}", level=2)
    set_keep(h, keep_next=True)
    add_label_paragraph(document, "Purpose", feature.purpose)
    p = document.add_paragraph()
    r = p.add_run("Procedure")
    r.bold = True
    r.font.color.rgb = RGBColor.from_string(NAVY)
    set_keep(p, keep_next=True)
    for index, step in enumerate(feature.steps, 1):
        p = document.add_paragraph()
        p.add_run(f"Step {index}. {step}")
        p.paragraph_format.left_indent = Inches(0.18)
        p.paragraph_format.first_line_indent = Inches(-0.18)
        p.paragraph_format.space_after = Pt(3)
    add_label_paragraph(document, "Expected Result", feature.result)
    if feature.note:
        add_note(document, feature.note)
    add_figure(document, feature)


def configure_styles(document: Document) -> None:
    styles = document.styles
    normal = styles["Normal"]
    normal.font.name = "Arial"
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = RGBColor.from_string("1F2937")
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.08

    for name, size, color in (("Title", 24, NAVY), ("Subtitle", 12, MID_GRAY),
                              ("Heading 1", 17, NAVY), ("Heading 2", 13, BLUE),
                              ("Heading 3", 11.5, NAVY)):
        style = styles[name]
        style.font.name = "Arial"
        style.font.size = Pt(size)
        style.font.bold = name != "Subtitle"
        style.font.color.rgb = RGBColor.from_string(color)
    styles["Heading 1"].paragraph_format.space_before = Pt(0)
    styles["Heading 1"].paragraph_format.space_after = Pt(10)
    styles["Heading 2"].paragraph_format.space_before = Pt(12)
    styles["Heading 2"].paragraph_format.space_after = Pt(5)

    caption = styles["Caption"]
    caption.font.name = "Arial"
    caption.font.size = Pt(9)
    caption.font.bold = True
    caption.font.italic = True
    caption.font.color.rgb = RGBColor.from_string(NAVY)

    if "Figure Description" not in [style.name for style in styles]:
        description = styles.add_style("Figure Description", 1)
    else:
        description = styles["Figure Description"]
    description.font.name = "Arial"
    description.font.size = Pt(8.5)
    description.font.italic = True
    description.font.color.rgb = RGBColor.from_string(MID_GRAY)
    description.paragraph_format.space_after = Pt(2)


def setup_section(section) -> None:
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0.75)
    section.bottom_margin = Inches(0.7)
    section.left_margin = Inches(0.8)
    section.right_margin = Inches(0.8)
    section.header_distance = Inches(0.3)
    section.footer_distance = Inches(0.3)


def add_header(section) -> None:
    section.header.is_linked_to_previous = False
    table = section.header.add_table(rows=1, cols=2, width=Inches(6.85))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    set_no_borders(table)
    left, right = table.rows[0].cells
    left.width = Inches(0.55)
    right.width = Inches(6.3)
    p = left.paragraphs[0]
    p.add_run().add_picture(str(GRADTRACK_LOGO), width=Inches(0.42))
    p = right.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r = p.add_run("GradTrack Updated User Manual")
    r.font.name = "Arial"
    r.font.size = Pt(8.5)
    r.font.bold = True
    r.font.color.rgb = RGBColor.from_string(BLUE)


def add_cover(document: Document) -> None:
    section = document.sections[0]
    setup_section(section)
    section.top_margin = Inches(0.48)
    section.bottom_margin = Inches(0.45)
    section.left_margin = Inches(0.55)
    section.right_margin = Inches(0.55)
    section.different_first_page_header_footer = True

    # Compact institutional masthead. The official assets stay separate and
    # undistorted so the cover remains recognizable and thesis-appropriate.
    masthead = document.add_table(rows=1, cols=3)
    masthead.alignment = WD_TABLE_ALIGNMENT.CENTER
    masthead.autofit = False
    set_no_borders(masthead)
    masthead.cell(0, 0).width = Inches(0.72)
    masthead.cell(0, 1).width = Inches(3.65)
    masthead.cell(0, 2).width = Inches(3.03)
    for cell in masthead.rows[0].cells:
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        set_cell_margins(cell, 20, 20, 20, 20)

    p = masthead.cell(0, 0).paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_after = Pt(0)
    p.add_run().add_picture(str(COLLEGE_LOGO), width=Inches(0.58))

    p = masthead.cell(0, 1).paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run("NORZAGARAY COLLEGE")
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(11.5)
    r.font.color.rgb = RGBColor.from_string(NAVY)
    r = p.add_run("\nSYSTEM DOCUMENTATION")
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(7.5)
    r.font.color.rgb = RGBColor.from_string(MID_GRAY)

    p = masthead.cell(0, 2).paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p.paragraph_format.space_after = Pt(0)
    p.add_run().add_picture(str(GRADTRACK_LOGO), width=Inches(1.85))

    accent = document.add_table(rows=1, cols=2)
    accent.alignment = WD_TABLE_ALIGNMENT.CENTER
    accent.autofit = False
    set_no_borders(accent)
    accent.cell(0, 0).width = Inches(1.12)
    accent.cell(0, 1).width = Inches(6.28)
    shade(accent.cell(0, 0), GOLD)
    shade(accent.cell(0, 1), NAVY)
    for cell in accent.rows[0].cells:
        set_cell_margins(cell, 18, 0, 18, 0)
        cell.paragraphs[0].paragraph_format.space_after = Pt(0)

    p = document.add_paragraph()
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run("GRADTRACK  /  2026 EDITION")
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(10)
    r.font.color.rgb = RGBColor.from_string(GOLD)

    p = document.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("USER")
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(38)
    r.font.color.rgb = RGBColor.from_string(NAVY)
    r = p.add_run(" MANUAL")
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(38)
    r.font.color.rgb = RGBColor.from_string(BLUE)

    p = document.add_paragraph()
    p.paragraph_format.space_after = Pt(10)
    r = p.add_run(
        "A Web-Based Graduate Tracer System with Alumni Job Support System "
        "for Norzagaray College"
    )
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(11)
    r.font.color.rgb = RGBColor.from_string(MID_GRAY)

    # A current GradTrack interface replaces the generic phone mock-up used by
    # the inspiration image. The adjoining navy panel gives the cover a unique,
    # asymmetric editorial identity.
    hero = document.add_table(rows=1, cols=2)
    hero.alignment = WD_TABLE_ALIGNMENT.CENTER
    hero.autofit = False
    set_no_borders(hero)
    image_cell = hero.cell(0, 0)
    label_cell = hero.cell(0, 1)
    image_cell.width = Inches(5.55)
    label_cell.width = Inches(1.85)
    set_cell_margins(image_cell, 75, 75, 75, 75)
    set_cell_margins(label_cell, 160, 145, 120, 145)
    shade(image_cell, LIGHT_BLUE)
    shade(label_cell, NAVY)
    image_cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    label_cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

    p = image_cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(0)
    p.add_run().add_picture(
        str(SHOTS / "01_Public_and_Access" / "01_public_home.png"),
        width=Inches(5.20),
    )

    p = label_cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(10)
    r = p.add_run("FROM\nGRADUATE\nDATA TO\nCAREER\nCONNECTION")
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(13)
    r.font.color.rgb = RGBColor.from_string("FFFFFF")
    p = label_cell.add_paragraph()
    p.paragraph_format.space_before = Pt(3)
    p.paragraph_format.space_after = Pt(7)
    r = p.add_run("TRACE  •  CONNECT\nSUPPORT  •  GROW")
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(7.5)
    r.font.color.rgb = RGBColor.from_string(GOLD)
    p = label_cell.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_after = Pt(0)
    p.add_run().add_picture(str(ALUMNI_LOGO), width=Inches(0.56))

    meta = document.add_table(rows=1, cols=2)
    meta.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta.autofit = False
    set_no_borders(meta)
    meta.cell(0, 0).width = Inches(5.55)
    meta.cell(0, 1).width = Inches(1.85)
    for cell in meta.rows[0].cells:
        set_cell_margins(cell, 85, 120, 85, 120)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    shade(meta.cell(0, 0), "F7F9FC")
    shade(meta.cell(0, 1), GOLD)

    p = meta.cell(0, 0).paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run("DOCUMENT\n")
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(7.5)
    r.font.color.rgb = RGBColor.from_string(MID_GRAY)
    r = p.add_run("GRADTRACK UPDATED USER MANUAL")
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor.from_string(NAVY)

    p = meta.cell(0, 1).paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run("EDITION\n")
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(7.5)
    r.font.color.rgb = RGBColor.from_string(NAVY)
    r = p.add_run("2026")
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(16)
    r.font.color.rgb = RGBColor.from_string(NAVY)

    spacer = document.add_paragraph()
    spacer.paragraph_format.space_before = Pt(34)
    spacer.paragraph_format.space_after = Pt(0)

    team = document.add_table(rows=1, cols=2)
    team.alignment = WD_TABLE_ALIGNMENT.CENTER
    team.autofit = False
    set_no_borders(team)
    team.cell(0, 0).width = Inches(1.45)
    team.cell(0, 1).width = Inches(5.95)
    set_cell_margins(team.cell(0, 0), 180, 130, 180, 130)
    set_cell_margins(team.cell(0, 1), 180, 190, 180, 190)
    shade(team.cell(0, 0), GOLD)
    shade(team.cell(0, 1), NAVY)
    for cell in team.rows[0].cells:
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

    p = team.cell(0, 0).paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run("05")
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(24)
    r.font.color.rgb = RGBColor.from_string(NAVY)
    r = p.add_run("\nRESEARCHERS")
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(7.2)
    r.font.color.rgb = RGBColor.from_string(NAVY)

    p = team.cell(0, 1).paragraphs[0]
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("PREPARED BY")
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(7.5)
    r.font.color.rgb = RGBColor.from_string(GOLD)
    p = team.cell(0, 1).add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run(
        "Manansala, John Paul U.   •   Medico, Kyla Mae J.   •   Medina, Gleiza B.\n"
        "Meneses, Edricson I.   •   Rodriguez, Rhom Moises M."
    )
    r.font.name = "Arial"
    r.font.size = Pt(8.4)
    r.font.color.rgb = RGBColor.from_string("FFFFFF")

    p = document.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run("NORZAGARAY COLLEGE  •  BULACAN, PHILIPPINES")
    r.bold = True
    r.font.name = "Arial"
    r.font.size = Pt(6.8)
    r.font.color.rgb = RGBColor.from_string(MID_GRAY)


def add_front_matter(document: Document) -> None:
    section = document.add_section(WD_SECTION.NEW_PAGE)
    setup_section(section)
    add_header(section)
    add_page_number(section)

    h = document.add_heading("Table of Contents", level=1)
    h.paragraph_format.page_break_before = False
    toc = document.add_paragraph()
    add_field(toc, 'TOC \\o "1-3" \\h \\z \\u', "Right-click and update this field in Word.")
    document.add_page_break()

    h = document.add_heading("List of Figures", level=1)
    h.paragraph_format.page_break_before = False
    lof = document.add_paragraph()
    add_field(lof, 'TOC \\h \\z \\c "Figure"', "Right-click and update this field in Word.")
    document.add_page_break()

    h = document.add_heading("How to Use This Manual", level=1)
    h.paragraph_format.page_break_before = False
    document.add_paragraph(
        "This manual is organized by user role. Follow only the procedures assigned to your account. "
        "Button names and navigation labels are written exactly as displayed in the verified November 2026 system build."
    )
    for text in (
        "Screenshots use anonymized documentation data captured from an isolated local copy of the latest source code.",
        "Actions that send notifications, publish content, archive records, or permanently delete data require authorization and careful confirmation.",
        "The Administrator and MIS Staff are separate roles in the current system.",
        "The current Registrar interface has no row-level Edit or View Details actions and no restore command.",
    ):
        document.add_paragraph(text, style="List Bullet")


def add_intro_chapters(document: Document) -> None:
    h = document.add_heading("1 Introduction", level=1)
    set_keep(h, keep_next=True, page_break_before=True)
    document.add_paragraph(
        "GradTrack is a web-based graduate tracer and alumni job-support system for Norzagaray College. "
        "It combines graduate identity verification, tracer surveys, role-based monitoring and analytics, alumni community features, and approved job opportunities."
    )
    document.add_heading("1.1 Purpose of the Manual", level=2)
    document.add_paragraph(
        "This manual provides current, step-by-step instructions for public visitors, graduates, Research Coordinators, Deans, the Registrar, the Alumni President, the Administrator, and MIS Staff."
    )
    document.add_heading("1.2 Source of Truth", level=2)
    document.add_paragraph(
        "The procedures and figures in this edition were verified against the latest application routes, role configuration, source code, and a running local environment. "
        "The previous 61-page manual was used only as a structural and academic-style reference."
    )
    document.add_heading("1.3 Safety and Data Privacy", level=2)
    document.add_paragraph(
        "Use authorized accounts only. Do not share passwords, expose graduate personal data, send reminders without confirming recipients, or perform archive, delete, publish, approval, or backup actions outside institutional policy."
    )

    h = document.add_heading("2 Software Requirements", level=1)
    set_keep(h, keep_next=True, page_break_before=True)
    document.add_heading("2.1 End-User Requirements", level=2)
    for item in (
        "A desktop or laptop computer with a current version of Microsoft Edge, Google Chrome, or Mozilla Firefox.",
        "A stable network connection to the authorized GradTrack environment.",
        "A screen resolution of at least 1366 × 768; 1440 × 900 or higher is recommended.",
        "An authorized personnel account or an approved Graduate Portal account for restricted modules.",
        "A PDF reader and Microsoft Word or a compatible office application for exported reports and this manual.",
    ):
        document.add_paragraph(item, style="List Bullet")
    document.add_heading("2.2 Deployment Components", level=2)
    document.add_paragraph(
        "The current project uses a React/Vite frontend, PHP API, MySQL or MariaDB data storage, and a real-time messaging service. "
        "These components are maintained by authorized technical staff and are not required for ordinary end-user procedures."
    )

    h = document.add_heading("3 User Roles and Access", level=1)
    set_keep(h, keep_next=True, page_break_before=True)
    document.add_paragraph("The current source code defines the following separate roles and access scopes.")
    rows = [
        ("Graduate / Alumni", "Community Forum, announcements, messaging, jobs, job submissions, saved jobs, profile, credentials, settings, notifications"),
        ("Research Coordinator", "Institution dashboard, graduate participation, survey management, responses, reports and analytics, job postings, AI Assistant"),
        ("Dean", "Department-scoped dashboard, survey participation, reports and analytics, job postings, profile, AI Assistant"),
        ("Registrar", "Graduate search and filters, add, Excel/CSV import, bulk archive, Registrar Archive, profile; no row-level edit/view/restore actions"),
        ("Alumni President", "Graduate account approvals, registered alumni, membership content, announcements, forum moderation, job postings and approvals"),
        ("Administrator", "Personnel users, automated reminders, audit trail, database backup, system settings, branding, profile, AI Assistant"),
        ("MIS Staff", "Institution dashboard and own profile only in the current navigation"),
    ]
    table = document.add_table(rows=1, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    table.rows[0].cells[0].text = "Role"
    table.rows[0].cells[1].text = "Verified Current Access"
    for cell in table.rows[0].cells:
        shade(cell, BLUE)
        for run in cell.paragraphs[0].runs:
            run.font.color.rgb = RGBColor(255, 255, 255)
            run.bold = True
    for role, access in rows:
        cells = table.add_row().cells
        cells[0].text = role
        cells[1].text = access
        cells[0].paragraphs[0].runs[0].bold = True


def add_chapter(document: Document, chapter_number: int, title: str, features: list[Feature]) -> None:
    h = document.add_heading(f"{chapter_number} {title}", level=1)
    set_keep(h, keep_next=True, page_break_before=True)
    for index, feature in enumerate(features, 1):
        add_feature(document, f"{chapter_number}.{index}", feature)


def add_job_support(document: Document) -> None:
    h = document.add_heading("12 Job Support Features", level=1)
    set_keep(h, keep_next=True, page_break_before=True)
    document.add_paragraph(
        "GradTrack uses a controlled job-posting lifecycle so graduates see approved opportunities and can follow the employer's configured application method."
    )
    table = document.add_table(rows=1, cols=4)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    headers = ("Stage", "Responsible User", "Current Action", "Related Figures")
    for i, text in enumerate(headers):
        table.rows[0].cells[i].text = text
        shade(table.rows[0].cells[i], BLUE)
        for run in table.rows[0].cells[i].paragraphs[0].runs:
            run.bold = True
            run.font.color.rgb = RGBColor(255, 255, 255)
    lifecycle = [
        ("Create", "Graduate", "Submit a complete job post for review", "Figures 23–24"),
        ("Review", "Alumni President", "Approve, decline, or archive graduate submissions", "Figure 58"),
        ("Publish and maintain", "Research Coordinator, Dean, or Alumni President", "Create and manage authorized staff posts", "Figures 37, 42, and 57"),
        ("Discover", "Graduate", "Filter, open, save, and share active jobs", "Figures 20–22"),
        ("Apply", "Graduate", "Follow Apply Now or the employer's displayed instructions", "Figure 21"),
    ]
    for row in lifecycle:
        cells = table.add_row().cells
        for index, value in enumerate(row):
            cells[index].text = value
    document.add_heading("12.1 Job-Posting Rules", level=2)
    for rule in (
        "Graduate-submitted jobs are not public until approved.",
        "External application links and employer contact methods open or operate outside GradTrack.",
        "Saved Jobs are personal bookmarks and do not constitute an application.",
        "Archive or delete actions must be used only on the intended post and with authorization.",
    ):
        document.add_paragraph(rule, style="List Bullet")


def add_common_guidance(document: Document) -> None:
    h = document.add_heading("13 Common Account, Security, and Troubleshooting Guidance", level=1)
    set_keep(h, keep_next=True, page_break_before=True)
    document.add_heading("13.1 Sign Out", level=2)
    document.add_paragraph("Open the account menu and select Sign Out. Confirm that the sign-in page appears before leaving a shared computer.")
    document.add_heading("13.2 Password Safety", level=2)
    for item in (
        "Use a unique password and never send it through an unsecured channel.",
        "Graduate Portal registration requires uppercase, lowercase, number, and symbol characters.",
        "Use the appropriate Forgot Password link instead of creating a duplicate account.",
    ):
        document.add_paragraph(item, style="List Bullet")
    document.add_heading("13.3 Common Problems", level=2)
    problems = [
        ("A page keeps loading", "Wait for the active request to finish, refresh once, and verify the authorized environment and network connection."),
        ("A menu is missing", "Confirm the signed-in role. Menus are intentionally role-based."),
        ("A graduate cannot verify identity", "Check that student number or email, last name, program, and registrar record match exactly."),
        ("A graduate cannot sign in", "Confirm that the account was created, approved by the Alumni President, and remains active."),
        ("A job is not visible", "Confirm that it is approved, published, active, and not past its availability rules."),
        ("A Registrar edit action is missing", "This is expected in the current version. Existing graduate rows have no Edit or View Details action."),
    ]
    table = document.add_table(rows=1, cols=2)
    table.style = "Table Grid"
    table.rows[0].cells[0].text = "Problem"
    table.rows[0].cells[1].text = "Current Guidance"
    for cell in table.rows[0].cells:
        shade(cell, BLUE)
        for run in cell.paragraphs[0].runs:
            run.bold = True
            run.font.color.rgb = RGBColor(255, 255, 255)
    for problem, guidance in problems:
        cells = table.add_row().cells
        cells[0].text = problem
        cells[1].text = guidance


def add_appendix(document: Document) -> None:
    h = document.add_heading("Appendix A — Verification and Screenshot Notes", level=1)
    set_keep(h, keep_next=True, page_break_before=True)
    for item in (
        "All figures were captured at 1440 × 900 from the latest running application.",
        "The screenshot environment used an isolated local clone and anonymized names, emails, student identifiers, phone numbers, and addresses.",
        "No production record was edited, archived, approved, deleted, or emailed during documentation work.",
        "The local survey was temporarily placed in an active documentation state so consent, completion, review, submission, and account-registration screens could be verified.",
        "The original 61-page PDF and existing editable Word file were references only; current source code and working interfaces were treated as authoritative.",
    ):
        document.add_paragraph(item, style="List Bullet")


def validate_assets() -> None:
    required = [GRADTRACK_LOGO, COLLEGE_LOGO, ALUMNI_LOGO]
    required.extend(SHOTS / feature.image for group in (PUBLIC, GRADUATE, RESEARCH, DEAN, REGISTRAR, ALUMNI, ADMIN, MIS) for feature in group)
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing required manual assets:\n" + "\n".join(missing))


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    validate_assets()
    document = Document()
    configure_styles(document)
    document.core_properties.title = "GradTrack Updated User Manual"
    document.core_properties.subject = "Current user procedures for GradTrack"
    document.core_properties.author = "GradTrack Researchers"
    document.core_properties.keywords = "GradTrack, Norzagaray College, User Manual, Graduate Tracer, Alumni"

    add_cover(document)
    add_front_matter(document)
    add_intro_chapters(document)
    add_chapter(document, 4, "Public Site, Survey, and Account Access", PUBLIC)
    add_chapter(document, 5, "Graduate / Alumni Portal", GRADUATE)
    add_chapter(document, 6, "Research Coordinator User Manual", RESEARCH)
    add_chapter(document, 7, "Dean User Manual", DEAN)
    add_chapter(document, 8, "Registrar User Manual", REGISTRAR)
    add_chapter(document, 9, "Alumni President User Manual", ALUMNI)
    add_chapter(document, 10, "Administrator User Manual", ADMIN)
    add_chapter(document, 11, "MIS Staff User Manual", MIS)
    add_job_support(document)
    add_common_guidance(document)
    add_appendix(document)

    for section in document.sections:
        setup_section(section)

    document.save(DOCX)
    print(f"Created {DOCX}")
    print(f"Figures: {sum(map(len, (PUBLIC, GRADUATE, RESEARCH, DEAN, REGISTRAR, ALUMNI, ADMIN, MIS)))}")


if __name__ == "__main__":
    main()
