'use strict';

const fs = require('fs');
const path = require('path');

const playwrightRoot = process.env.PLAYWRIGHT_CORE_PATH;
if (!playwrightRoot) throw new Error('PLAYWRIGHT_CORE_PATH is required.');
const { chromium } = require(playwrightRoot);

const baseUrl = process.env.GRADTRACK_MANUAL_BASE_URL || 'http://127.0.0.1:5174';
const password = process.env.GRADTRACK_MANUAL_TEST_PASSWORD;
if (!password) throw new Error('GRADTRACK_MANUAL_TEST_PASSWORD is required.');

const group = process.argv[2] || 'public';
const root = path.resolve(__dirname, '..');
const screenshotsRoot = path.join(
  root,
  'documentation',
  'GradTrack_User_Manual_Update',
  'GradTrack_Updated_Screenshots'
);
const manifestPath = path.join(screenshotsRoot, 'screenshot_manifest.json');

const groupDirectories = {
  public: '01_Public_and_Access',
  graduate: '02_Graduate_Portal',
  research: '03_Research_Coordinator',
  dean: '04_Dean',
  registrar: '05_Registrar',
  alumni: '06_Alumni_President',
  admin: '07_Admin',
  mis: '08_MIS_Staff',
};

if (!groupDirectories[group]) {
  throw new Error(`Unknown capture group: ${group}`);
}

const targetDirectory = path.join(screenshotsRoot, groupDirectories[group]);
fs.mkdirSync(targetDirectory, { recursive: true });

const records = [];
const consoleErrors = [];

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return { generated_at: null, viewport: '1440x900', screenshots: [], console_errors: [] };
  }
}

async function settle(page, delay = 650) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(delay);
  await page.addStyleTag({
    content: `
      *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition: none !important; caret-color: transparent !important; }
      html { scroll-behavior: auto !important; }
    `,
  }).catch(() => undefined);
}

async function visit(page, route, expectedText) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (expectedText) {
    await page.getByText(expectedText, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
  }
  await settle(page);
}

async function capture(page, fileName, description) {
  const filePath = path.join(targetDirectory, fileName);
  await page.screenshot({ path: filePath, fullPage: false, animations: 'disabled' });
  const heading = await page.locator('h1').first().textContent().catch(() => '');
  records.push({
    file: path.relative(screenshotsRoot, filePath).replace(/\\/g, '/'),
    group,
    description,
    url: page.url(),
    page_title: await page.title(),
    heading: String(heading || '').trim(),
  });
}

async function clickVisible(page, locator, timeout = 5000) {
  const item = locator.first();
  if (!(await item.isVisible({ timeout }).catch(() => false))) return false;
  await item.click();
  await settle(page);
  return true;
}

async function loginPersonnel(page, email) {
  await visit(page, '/admin/signin', 'Sign In');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await Promise.all([
    page.waitForURL(/\/admin(?:\/|$)/, { timeout: 20000 }),
    page.getByRole('button', { name: 'Sign In', exact: true }).click(),
  ]);
  await page.getByRole('heading', { name: /^(GradTrack|Dean) Dashboard$/ }).waitFor({ state: 'visible', timeout: 60000 });
  await settle(page, 1000);
}

async function loginGraduate(page) {
  await visit(page, '/graduate/signin', 'Graduate Portal');
  await page.locator('input[type="email"]').fill('doc.graduate@local.test');
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await page.waitForURL(/\/graduate\/portal/, { timeout: 20000 });
  await page.getByRole('button', { name: 'Create Post' }).waitFor({ state: 'visible', timeout: 30000 });
  await settle(page, 1200);
}

async function openAssistant(page) {
  return clickVisible(page, page.getByRole('button', { name: /Ask GradTrack AI Assistant/i }));
}

async function seedDocumentationSurveyDraft(page) {
  return page.evaluate(async () => {
    const apiRoot = 'http://127.0.0.1:8000/api';
    const listResponse = await fetch(`${apiRoot}/surveys/index.php`);
    const listPayload = await listResponse.json();
    const active = (listPayload.data || []).find((survey) => survey.status === 'active');
    if (!active) throw new Error('No active survey is available for documentation capture.');

    const detailResponse = await fetch(`${apiRoot}/surveys/index.php?id=${active.id}`);
    const detailPayload = await detailResponse.json();
    const survey = detailPayload.data;
    const graduateId = Number(localStorage.getItem('graduate_id') || sessionStorage.getItem('graduate_id'));
    if (!survey?.questions?.length || !graduateId) throw new Error('Survey details or graduate session are unavailable.');

    const optionValues = (question) => {
      if (Array.isArray(question.option_definitions) && question.option_definitions.length > 0) {
        return question.option_definitions
          .map((option) => option.value || option.option_value || option.label)
          .filter(Boolean);
      }
      let options = question.options || [];
      if (typeof options === 'string') {
        try { options = JSON.parse(options); } catch { options = []; }
      }
      return Array.isArray(options) ? options.map(String) : [];
    };

    const preferredChoices = {
      program: 'Bachelor of Science in Computer Science',
      graduation_year: '2027',
      employment_status: 'Yes',
      employment_classification: 'Regular/Permanent',
      work_location: 'Local',
      first_job: 'Yes',
      job_course_alignment: 'Yes',
      curriculum_relevance: 'Yes',
    };
    const textValues = {
      last_name: 'SURVEY',
      first_name: 'DOCUMENTATION',
      middle_name: 'D',
      region: 'Region III (Central Luzon)',
      province: 'Bulacan',
      city_municipality: 'Norzagaray',
      barangay: 'Bangkal',
      email_address: 'doc.survey@local.test',
      mobile_number: '09171234567',
      phone_number: '09171234567',
      examination_rating: '85',
      training_title: 'Professional Development Seminar',
      training_duration: 'Two days',
      training_institution: 'Norzagaray College',
      earned_units: '18',
      graduate_institution: 'Norzagaray College',
      occupation: 'Software Engineer',
      self_employment_skills: 'Communication and information technology skills',
    };

    const responses = {};
    for (const question of survey.questions) {
      if (!question.id || question.question_type === 'header') continue;
      const key = String(question.analytics_key || '');
      const options = optionValues(question).filter((option) => !/^others?:?$/i.test(String(option).trim()));
      if (question.question_type === 'multiple_choice' || question.question_type === 'radio') {
        responses[question.id] = preferredChoices[key] && options.includes(preferredChoices[key])
          ? preferredChoices[key]
          : (options[0] || 'Yes');
      } else if (question.question_type === 'checkbox') {
        responses[question.id] = [options[0] || 'Professional development'];
      } else if (question.question_type === 'date') {
        responses[question.id] = key === 'birth_date' ? '2000-01-01' : '2025-01-15';
      } else if (question.question_type === 'rating') {
        responses[question.id] = 4;
      } else {
        responses[question.id] = textValues[key] || 'Professional development response';
      }
    }

    const sectionCount = new Set(survey.questions.map((question) => question.section || 'General')).size;
    const draftKey = `survey_draft_${survey.id}_g${graduateId}`;
    localStorage.setItem(draftKey, JSON.stringify({
      responses,
      psgcAddress: {
        region_code: '0300000000',
        region_name: 'Region III (Central Luzon)',
        province_code: '0301400000',
        province_name: 'Bulacan',
        city_municipality_code: '0301413000',
        city_municipality_name: 'Norzagaray',
        barangay_code: '0301413003',
        barangay_name: 'Bangkal',
      },
      section: Math.max(sectionCount - 1, 0),
      timestamp: new Date().toISOString(),
    }));
    return { surveyId: survey.id, questionCount: survey.questions.length };
  });
}

async function capturePublic(page) {
  await visit(page, '/', 'Connecting Graduates');
  await capture(page, '01_public_home.png', 'GradTrack public home page and current branding');

  await visit(page, '/announcements', 'Announcements');
  await capture(page, '02_public_announcements.png', 'Public announcements page');

  await visit(page, '/about', 'About');
  await capture(page, '03_about_gradtrack.png', 'About GradTrack public page');

  await visit(page, '/faq', 'Frequently');
  await capture(page, '04_frequently_asked_questions.png', 'Frequently asked questions page');

  await visit(page, '/privacy-policy', 'Privacy');
  await capture(page, '05_privacy_policy.png', 'Public privacy policy page');

  await visit(page, '/alumni/registered-information', 'Alumni');
  await capture(page, '06_alumni_membership_information.png', 'Public alumni membership information page');

  await visit(page, '/alumni/membership-information', 'Alumni');
  await page.getByText('Official registration', { exact: false }).first().scrollIntoViewIfNeeded().catch(() => undefined);
  await settle(page, 700);
  await capture(page, '07_alumni_membership_registration.png', 'Alumni membership registration information and current branding');

  await visit(page, '/admin/signin', 'Sign In');
  await capture(page, '08_personnel_sign_in.png', 'Personnel sign-in page');

  await visit(page, '/graduate/signin', 'Graduate Portal');
  await capture(page, '09_graduate_portal_login.png', 'Graduate Portal login page');

  await visit(page, '/survey-verify', 'Graduate Tracer Survey');
  await page.locator('input[placeholder="2XXX-XXXX"]').fill('20269999');
  await page.locator('input[placeholder="Enter your last name"]').fill('Survey');
  const programSelect = page.locator('select').first();
  await programSelect.selectOption('1');
  await capture(page, '10_graduate_identity_verification.png', 'Graduate identity verification with safe local documentation data');

  await page.getByRole('button', { name: 'Verify & Continue' }).click();
  await page.waitForURL(/\/survey(?:\?|$)/, { timeout: 20000 });
  await page.getByText('Data Privacy Notice & Informed Consent', { exact: false }).first().waitFor({ state: 'visible', timeout: 20000 });
  await settle(page, 1000);
  await capture(page, '11_data_privacy_consent.png', 'Data Privacy Notice and informed-consent screen');

  await page.locator('#agreeCheckbox').check();
  await page.getByRole('button', { name: 'I Agree & Proceed' }).click();
  await settle(page, 1000);
  await capture(page, '12_tracer_survey_first_section.png', 'Graduate Tracer Survey first section after consent');

  await seedDocumentationSurveyDraft(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Data Privacy Notice & Informed Consent', { exact: false }).first().waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#agreeCheckbox').check();
  await page.getByRole('button', { name: 'I Agree & Proceed' }).click();
  await page.getByRole('button', { name: 'Review Answers' }).waitFor({ state: 'visible', timeout: 30000 });
  await settle(page, 1500);
  await page.getByRole('button', { name: 'Review Answers' }).click();
  await page.getByText('Review Your Answers', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  await settle(page, 800);
  await capture(page, '13_survey_review.png', 'Graduate Tracer Survey review screen before final submission');

  await page.getByRole('button', { name: 'Confirm & Submit Survey' }).click();
  await page.getByText('Survey Completed', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  await settle(page, 800);
  await capture(page, '14_survey_submission_success.png', 'Survey completion screen with alumni-membership and GradTrack account choices');

  await page.getByRole('button', { name: 'Create My GradTrack Account' }).click();
  await page.getByRole('heading', { name: 'Create Graduate Portal Account' }).waitFor({ state: 'visible', timeout: 20000 });
  await settle(page, 800);
  await capture(page, '15_graduate_portal_account_registration.png', 'Graduate Portal account registration form after survey completion');
}

async function captureGraduate(page) {
  await loginGraduate(page);
  await capture(page, '01_community_forum.png', 'Graduate Community Forum home');

  if (await clickVisible(page, page.getByRole('button', { name: 'Create Post' }))) {
    await capture(page, '02_community_post_composer.png', 'Community Forum post composer');
    await page.getByRole('button', { name: /Close post composer/i }).click().catch(() => undefined);
  }

  await visit(page, '/graduate/portal?tab=announcements', 'Announcements');
  await capture(page, '03_announcements.png', 'Graduate announcements module');

  await visit(page, '/graduate/portal?tab=messages', 'Messages');
  await capture(page, '04_direct_and_group_messages.png', 'Graduate direct and group messaging workspace');

  await visit(page, '/graduate/portal?tab=jobs', 'Browse Jobs');
  await capture(page, '05_browse_jobs.png', 'Graduate job opportunity browsing and filters');
  if (await clickVisible(page, page.getByRole('button', { name: /View Details/i }))) {
    await capture(page, '06_job_opportunity_details.png', 'Graduate job opportunity details and application guidance');
    await page.getByRole('button', { name: /Close/i }).first().click().catch(() => undefined);
  }

  await visit(page, '/graduate/portal?tab=saved_jobs', 'Saved Jobs');
  await capture(page, '07_saved_jobs.png', 'Graduate saved job opportunities');

  await visit(page, '/graduate/portal?tab=job_posting', 'Job Posting');
  await capture(page, '08_my_job_posts.png', 'Graduate job-posting module');
  if (await clickVisible(page, page.getByRole('button', { name: 'Create Job Post' }))) {
    await capture(page, '09_create_job_post_form.png', 'Graduate Create Job Post form');
  }

  await visit(page, '/graduate/portal?tab=my_profile', 'My Profile');
  await page.getByText('Credentials', { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 });
  await settle(page, 800);
  await capture(page, '10_profile_and_credentials.png', 'Graduate profile, career information, and credentials');
  if (await clickVisible(page, page.getByRole('button', { name: /Add Credential/i }))) {
    await capture(page, '11_add_professional_credential.png', 'Professional credential upload form');
    await page.getByRole('button', { name: /Close/i }).first().click().catch(() => undefined);
  }

  await visit(page, '/graduate/portal?tab=settings&section=basic', 'Settings');
  await page.getByText('Personal details', { exact: false }).first().waitFor({ state: 'visible', timeout: 30000 });
  await settle(page, 800);
  await capture(page, '12_profile_settings.png', 'Graduate profile and account settings');

  if (await clickVisible(page, page.getByRole('button', { name: 'Notifications' }))) {
    await capture(page, '13_notifications_panel.png', 'Graduate notification panel');
  }
}

async function captureResearch(page) {
  await loginPersonnel(page, 'doc.research@local.test');
  await capture(page, '01_dashboard.png', 'Research Coordinator dashboard');

  await visit(page, '/admin/graduates', 'Graduate Records');
  await capture(page, '02_graduate_survey_participation.png', 'Graduate survey participation records and reminders');

  await visit(page, '/admin/surveys', 'Survey Management');
  await capture(page, '03_survey_management.png', 'Survey lifecycle and management page');
  if (await clickVisible(page, page.getByTitle('Edit survey'))) {
    await capture(page, '04_edit_survey.png', 'Edit Survey form and live question controls');
    await page.getByRole('button', { name: /Close/i }).first().click().catch(() => undefined);
  }

  await visit(page, '/admin/surveys', 'Survey Management');
  if (await clickVisible(page, page.getByTitle('View responses'))) {
    await capture(page, '05_response_monitoring.png', 'Survey response monitoring and analytics');
  }

  await visit(page, '/admin/reports', 'Reports & Analytics');
  await capture(page, '06_reports_overview.png', 'Research reports, filters, charts, and exports');
  if (await clickVisible(page, page.getByRole('button', { name: /Survey Analytics/i }))) {
    await capture(page, '07_descriptive_analysis.png', 'Question-level descriptive survey analytics');
  }
  if (await clickVisible(page, page.getByRole('button', { name: /Inferential Analysis/i }))) {
    await capture(page, '08_inferential_analysis.png', 'Inferential analysis controls and results area');
  }

  await visit(page, '/admin/job-postings', 'Job Postings');
  await capture(page, '09_job_postings.png', 'Research Coordinator job-posting management');

  if (await openAssistant(page)) {
    await capture(page, '10_ai_assistant.png', 'Role-scoped GradTrack AI Assistant');
  }
}

async function captureDean(page) {
  await loginPersonnel(page, 'doc.dean.ccs@local.test');
  await capture(page, '01_department_dashboard.png', 'CCS Dean dashboard with department-scoped data');

  await visit(page, '/admin/survey-status', 'Survey Participation');
  await capture(page, '02_survey_participation.png', 'Dean survey participation within assigned programs');

  await visit(page, '/admin/reports', 'Reports & Analytics');
  await capture(page, '03_reports_and_analytics.png', 'Dean reports and analytics with restricted program scope');

  await visit(page, '/admin/job-postings', 'Job Postings');
  await capture(page, '04_job_postings.png', 'Dean authorized job-posting management');

  await visit(page, '/admin/profile', 'My Profile');
  await capture(page, '05_personnel_profile.png', 'Dean personnel profile');

  if (await openAssistant(page)) {
    await capture(page, '06_ai_assistant.png', 'Dean role-scoped GradTrack AI Assistant');
  }
}

async function captureRegistrar(page) {
  await loginPersonnel(page, 'doc.registrar@local.test');
  await page.getByText('Loading...', { exact: true }).waitFor({ state: 'hidden', timeout: 60000 }).catch(() => undefined);
  await settle(page, 700);
  await capture(page, '01_manage_graduates.png', 'Registrar graduate-record management table');

  const programFilter = page.getByLabel('Filter graduates by department');
  if (await programFilter.isVisible().catch(() => false)) {
    const options = await programFilter.locator('option').all();
    if (options.length > 1) await programFilter.selectOption({ index: 1 });
    await settle(page);
    await capture(page, '02_search_and_filters.png', 'Registrar program and graduation-year filters');
  }

  if (await clickVisible(page, page.getByRole('button', { name: 'Add Graduate' }))) {
    await capture(page, '03_add_graduate_form.png', 'Registrar Add Graduate form');
    await page.getByRole('button', { name: /Close graduate form/i }).click().catch(() => undefined);
  }

  await capture(page, '04_import_excel_control.png', 'Registrar Excel import control and read-only graduate record table with no row-level edit actions');

  if (await clickVisible(page, page.getByRole('button', { name: /^Archive\b/ }).first())) {
    await capture(page, '05_archive_records.png', 'Registrar archived graduate records; the current interface does not provide restore or edit actions');
  }

  await visit(page, '/admin/profile', 'My Profile');
  await capture(page, '06_personnel_profile.png', 'Registrar personnel profile');
}

async function captureAlumni(page) {
  await loginPersonnel(page, 'doc.alumni.president@local.test');
  await visit(page, '/admin/alumni-registered-list', 'Alumni Registered List');
  const viewDetailsAction = page.getByTitle('View account details').first();
  await viewDetailsAction.scrollIntoViewIfNeeded().catch(() => undefined);
  await capture(page, '01_alumni_verification_updated_view_details_action.png', 'Alumni account verification table showing the updated View Details eye icon and action');

  if (await clickVisible(page, viewDetailsAction)) {
    await capture(page, '02_account_verification_details.png', 'Graduate account details for Alumni President review');
    await page.getByRole('button', { name: /Close/i }).first().click().catch(() => undefined);
  }

  await visit(page, '/admin/alumni-membership-page', 'Membership');
  await capture(page, '03_membership_management.png', 'Alumni membership information and branding management');

  await visit(page, '/admin/announcements', 'Announcement');
  await capture(page, '04_announcements.png', 'Alumni President Announcement Manager');
  if (await clickVisible(page, page.getByRole('button', { name: 'New Announcement' }))) {
    await capture(page, '05_create_announcement.png', 'Create Announcement form');
    await page.getByRole('button', { name: /Cancel/i }).click().catch(() => undefined);
  }

  await visit(page, '/admin/forum-moderation', 'Forum Moderation');
  await capture(page, '06_forum_moderation.png', 'Reported forum content moderation');

  await visit(page, '/admin/job-postings', 'Job Postings');
  await capture(page, '07_staff_job_postings.png', 'Alumni President staff job-posting management');

  await visit(page, '/admin/job-approvals', 'Job Approval');
  await capture(page, '08_graduate_job_approval.png', 'Graduate-submitted job approval queue');
}

async function captureAdmin(page) {
  await loginPersonnel(page, 'doc.admin@local.test');
  await visit(page, '/admin/user-management', 'User Management');
  await capture(page, '01_user_management.png', 'Admin personnel account and role management');
  if (await clickVisible(page, page.getByRole('button', { name: 'Add User' }))) {
    await capture(page, '02_add_user_form.png', 'Admin Add User form and role selection');
    await page.getByRole('button', { name: /Cancel/i }).click().catch(() => undefined);
  }

  await visit(page, '/admin/auto-reminders', 'Auto Email Reminders');
  await capture(page, '03_auto_email_reminders.png', 'Automated survey-reminder configuration and delivery log');

  await visit(page, '/admin/audit-trail', 'Audit Trail');
  await capture(page, '04_audit_trail.png', 'Audit trail, filters, and event details');

  await visit(page, '/admin/backup-database', 'Database Backup');
  await capture(page, '05_database_backup.png', 'Database backup status and download control');

  await visit(page, '/admin/system-settings', 'System Settings');
  await capture(page, '06_system_settings.png', 'System settings general configuration');
  if (await clickVisible(page, page.getByRole('button', { name: /Branding/i }))) {
    await capture(page, '07_branding_settings.png', 'Current GradTrack logo and branding configuration');
  }

  await visit(page, '/admin/profile', 'My Profile');
  await capture(page, '08_personnel_profile.png', 'Admin personnel profile and password controls');

  if (await openAssistant(page)) {
    await capture(page, '09_ai_assistant.png', 'Admin role-scoped GradTrack AI Assistant');
  }
}

async function captureMis(page) {
  await loginPersonnel(page, 'doc.mis@local.test');
  await capture(page, '01_dashboard.png', 'MIS Staff dashboard');
  await visit(page, '/admin/profile', 'My Profile');
  await capture(page, '02_personnel_profile.png', 'MIS Staff personnel profile');
  await openAssistant(page);
  if (await page.getByRole('dialog', { name: /GradTrack AI Assistant/i }).isVisible().catch(() => false)) {
    await capture(page, '03_ai_assistant.png', 'MIS Staff role-scoped GradTrack AI Assistant');
  }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--disable-features=Translate', '--hide-scrollbars'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'Asia/Singapore',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push({ group, url: page.url(), message: message.text() });
  });
  page.on('pageerror', (error) => consoleErrors.push({ group, url: page.url(), message: error.message }));

  const actions = {
    public: capturePublic,
    graduate: captureGraduate,
    research: captureResearch,
    dean: captureDean,
    registrar: captureRegistrar,
    alumni: captureAlumni,
    admin: captureAdmin,
    mis: captureMis,
  };

  try {
    await actions[group](page);
  } finally {
    await context.close();
    await browser.close();
  }

  const manifest = loadManifest();
  manifest.generated_at = new Date().toISOString();
  manifest.viewport = '1440x900';
  manifest.source = baseUrl;
  manifest.screenshots = [
    ...manifest.screenshots.filter((item) => item.group !== group),
    ...records,
  ];
  manifest.console_errors = [
    ...(manifest.console_errors || []).filter((item) => item.group !== group),
    ...consoleErrors,
  ];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  process.stdout.write(JSON.stringify({ group, screenshots: records.length, console_errors: consoleErrors.length }));
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
