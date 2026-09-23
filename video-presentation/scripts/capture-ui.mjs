import {chromium} from 'playwright-core';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, '..');
const screenshotDir = path.join(projectDir, 'screenshots');
const appUrl = process.env.GRADTRACK_CAPTURE_URL || 'http://127.0.0.1:5173';
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const graduate = {
  account_id: 501,
  graduate_id: 101,
  email: 'juan.delacruz.demo@example.com',
  account_status: 'active',
  alumni_verification_status: 'approved',
  alumni_verification_submitted_at: '2026-09-01 08:30:00',
  alumni_verification_reviewed_at: '2026-09-02 09:00:00',
  full_name: 'Juan Dela Cruz',
  first_name: 'Juan',
  middle_name: 'Santos',
  last_name: 'Dela Cruz',
  student_id: '2025-0000',
  phone: '+63 900 000 0000',
  year_graduated: 2025,
  address: 'Norzagaray, Bulacan',
  program_id: 1,
  program_name: 'Bachelor of Science in Computer Science',
  program_code: 'BSCS',
  profile_image_path: null,
  cover_image_path: null,
  role: 'graduate',
};

const participants = {
  juan: {graduate_id: 101, full_name: 'Juan Dela Cruz', program_code: 'BSCS', year_graduated: 2025, profile_image_path: null, is_online: true},
  maria: {graduate_id: 102, full_name: 'Maria Santos', program_code: 'BSCS', year_graduated: 2024, profile_image_path: null, is_online: true},
  paolo: {graduate_id: 103, full_name: 'Paolo Reyes', program_code: 'BSIT', year_graduated: 2023, profile_image_path: null, is_online: false, last_active_at: '2026-09-23 00:50:00'},
  ana: {graduate_id: 104, full_name: 'Ana Rivera', program_code: 'BSEd', year_graduated: 2025, profile_image_path: null, is_online: true},
};

const directRoom = {
  id: 201,
  created_by: 101,
  name: null,
  is_group: false,
  created_at: '2026-09-20 10:00:00',
  updated_at: '2026-09-23 01:06:00',
  last_message: "Thank you. I'll check it.",
  last_message_type: 'text',
  last_message_at: '2026-09-23 01:06:00',
  last_message_sender_id: 101,
  unread_count: 0,
  participants: [participants.juan, participants.maria],
  participant_count: 2,
};

const groupRoom = {
  id: 202,
  created_by: 102,
  name: 'BSCS Alumni 2025',
  is_group: true,
  created_at: '2026-09-18 09:00:00',
  updated_at: '2026-09-22 16:00:00',
  last_message: 'See everyone at the career webinar!',
  last_message_type: 'text',
  last_message_at: '2026-09-22 16:00:00',
  last_message_sender_id: 104,
  unread_count: 1,
  participants: [participants.juan, participants.maria, participants.paolo, participants.ana],
  participant_count: 4,
};

const forumPosts = [
  {
    id: 301,
    graduate_id: 102,
    title: 'Tips for preparing for your first job interview',
    content: 'Research the role, prepare concise examples of your skills, and practice explaining how your projects solved real problems.',
    category: 'Career Tips',
    status: 'approved',
    media: [],
    media_count: 0,
    created_at: '2026-09-22 15:20:00',
    updated_at: '2026-09-22 15:20:00',
    author_name: 'Maria Santos',
    author_program_name: 'Bachelor of Science in Computer Science',
    author_program_code: 'BSCS',
    author_year_graduated: 2024,
    author_profile_image_path: null,
    comment_count: 4,
    like_count: 18,
    report_count: 0,
    is_liked: true,
  },
  {
    id: 302,
    graduate_id: 103,
    title: 'Share your career experiences with fellow graduates',
    content: 'What lesson from your first year at work would you share with new Norzagaray College graduates?',
    category: 'Career Stories',
    status: 'approved',
    media: [],
    media_count: 0,
    created_at: '2026-09-21 11:10:00',
    updated_at: '2026-09-21 11:10:00',
    author_name: 'Paolo Reyes',
    author_program_name: 'Bachelor of Science in Information Technology',
    author_program_code: 'BSIT',
    author_year_graduated: 2023,
    author_profile_image_path: null,
    comment_count: 7,
    like_count: 24,
    report_count: 0,
    is_liked: false,
  },
];

const myPosts = [{
  ...forumPosts[0],
  id: 303,
  graduate_id: 101,
  title: 'Building a simple portfolio for entry-level roles',
  content: 'Start with one polished project and describe the problem, your contribution, and the result.',
  author_name: 'Juan Dela Cruz',
  author_program_code: 'BSCS',
  author_year_graduated: 2025,
  comment_count: 2,
  like_count: 11,
  is_liked: false,
}];

const jobs = [
  {
    id: 401,
    posted_by_account_id: 502,
    title: 'Junior Software Developer',
    company: 'Sample Technology Solutions',
    location: 'Bulacan',
    salary_range: 'Competitive entry-level package',
    job_type: 'full_time',
    industry: 'Information Technology',
    description: 'Support the development and testing of web applications for sample client projects.',
    qualifications: 'Open to recent graduates with foundational web development knowledge.',
    required_skills: 'JavaScript, SQL, teamwork, and clear communication',
    course_program_fit: 'BSCS, BSIT, or a related program',
    application_deadline: '2026-10-30',
    contact_email: 'careers@sampletech.example.com',
    application_link: 'https://example.com/sample-job',
    application_method: 'Review the sample requirements and apply through the demonstration link.',
    poster_account_id: 502,
    poster_graduate_id: 102,
    poster_full_name: 'Maria Santos',
    poster_program_code: 'BSCS',
    poster_email: 'maria.santos.demo@example.com',
    poster_profile_image_path: null,
    approval_status: 'approved',
    is_active: 1,
    created_at: '2026-09-22 09:00:00',
    updated_at: '2026-09-22 09:00:00',
  },
  {
    id: 402,
    posted_by_account_id: 503,
    title: 'IT Support Associate',
    company: 'Demo Digital Services',
    location: 'Bulacan',
    salary_range: 'Entry-level',
    job_type: 'full_time',
    industry: 'Technology Services',
    description: 'Assist users, document support requests, and help maintain workplace devices.',
    qualifications: 'Recent graduates who enjoy troubleshooting and customer support.',
    required_skills: 'Technical support, documentation, and communication',
    course_program_fit: 'BSCS and BSIT graduates',
    application_deadline: '2026-11-15',
    contact_email: 'jobs@demodigital.example.com',
    application_link: 'https://example.com/demo-opportunity',
    application_method: 'Use the demonstration application page.',
    poster_account_id: 503,
    poster_graduate_id: 103,
    poster_full_name: 'Paolo Reyes',
    poster_program_code: 'BSIT',
    poster_email: 'paolo.reyes.demo@example.com',
    poster_profile_image_path: null,
    approval_status: 'approved',
    is_active: 1,
    created_at: '2026-09-20 13:30:00',
    updated_at: '2026-09-20 13:30:00',
  },
];

const announcements = [
  {
    id: 601,
    title: 'Graduate Career Development Webinar',
    summary: 'Join a sample webinar on resumes, interviews, professional profiles, and early-career planning.',
    content: 'This demonstration announcement highlights career development support for graduates.',
    category: 'career',
    event_date: '2026-10-15',
    cover_image_path: null,
    status: 'published',
    published_at: '2026-09-22 08:00:00',
    created_at: '2026-09-22 08:00:00',
    updated_at: '2026-09-22 08:00:00',
    author_name: 'Norzagaray College',
    author_type: 'admin',
    images: [],
  },
  {
    id: 602,
    title: 'Alumni Networking Activity',
    summary: 'A presentation-safe activity for graduates to exchange career insights and reconnect with peers.',
    content: 'This is sample content created only for the GradTrack presentation.',
    category: 'alumni_event',
    event_date: '2026-10-24',
    cover_image_path: null,
    status: 'published',
    published_at: '2026-09-21 10:00:00',
    created_at: '2026-09-21 10:00:00',
    updated_at: '2026-09-21 10:00:00',
    author_name: 'Norzagaray College',
    author_type: 'admin',
    images: [],
  },
  {
    id: 603,
    title: 'College Alumni Program Update',
    summary: 'Review a sample update about upcoming alumni support and engagement activities.',
    content: 'This sample does not reproduce any live institutional announcement.',
    category: 'general',
    event_date: null,
    cover_image_path: null,
    status: 'published',
    published_at: '2026-09-19 09:30:00',
    created_at: '2026-09-19 09:30:00',
    updated_at: '2026-09-19 09:30:00',
    author_name: 'Norzagaray College',
    author_type: 'admin',
    images: [],
  },
];

const surveyQuestions = [
  {id: 1, question_text: 'Last Name', question_type: 'text', options: null, is_required: 1, sort_order: 1, section: 'Personal Information'},
  {id: 2, question_text: 'First Name', question_type: 'text', options: null, is_required: 1, sort_order: 2, section: 'Personal Information'},
  {id: 3, question_text: 'Middle Name', question_type: 'text', options: null, is_required: 0, sort_order: 3, section: 'Personal Information'},
  {id: 4, question_text: 'Email Address', question_type: 'text', options: null, is_required: 1, sort_order: 4, section: 'Personal Information'},
  {id: 5, question_text: 'Mobile Number', question_type: 'text', options: null, is_required: 1, sort_order: 5, section: 'Personal Information'},
  {id: 6, question_text: 'Telephone / Contact Number', question_type: 'text', options: null, is_required: 0, sort_order: 6, section: 'Personal Information'},
  {id: 7, question_text: 'Current Address', question_type: 'text', options: null, is_required: 1, sort_order: 7, section: 'Personal Information'},
  {id: 8, question_text: 'Degree Program', question_type: 'text', options: null, is_required: 1, sort_order: 8, section: 'Educational Background'},
  {id: 9, question_text: 'Year Graduated', question_type: 'text', options: null, is_required: 1, sort_order: 9, section: 'Educational Background'},
  {id: 10, question_text: 'Recent Training or Professional Development', question_type: 'text', options: null, is_required: 0, sort_order: 10, section: 'Educational Background'},
  {id: 11, question_text: 'Employment Status', question_type: 'radio', options: ['Employed', 'Self-employed', 'Seeking employment'], is_required: 1, sort_order: 11, section: 'Employment Data'},
  {id: 12, question_text: 'Current Job Title', question_type: 'text', options: null, is_required: 1, sort_order: 12, section: 'Employment Data'},
  {id: 13, question_text: 'Company Name', question_type: 'text', options: null, is_required: 1, sort_order: 13, section: 'Employment Data'},
  {id: 14, question_text: 'Employment Location', question_type: 'text', options: null, is_required: 1, sort_order: 14, section: 'Employment Data'},
  {id: 15, question_text: 'Is your current job related to your degree?', question_type: 'radio', options: ['Yes', 'Partly', 'No'], is_required: 1, sort_order: 15, section: 'Career & Experience'},
  {id: 16, question_text: 'Skills used in your current work', question_type: 'text', options: null, is_required: 1, sort_order: 16, section: 'Career & Experience'},
  {id: 17, question_text: 'Share a brief career experience', question_type: 'textarea', options: null, is_required: 0, sort_order: 17, section: 'Career & Experience'},
];

const survey = {
  id: 7,
  title: 'Graduate Tracer Study Survey',
  description: 'Help Norzagaray College understand graduate employment and career outcomes.',
  status: 'active',
  graduation_year_coverage: {configured: true, years: [2025]},
  questions: surveyQuestions,
};

const surveyResponses = {
  1: 'Dela Cruz',
  2: 'Juan',
  3: 'Santos',
  4: 'juan.delacruz.demo@example.com',
  5: '+639000000000',
  6: '044-000-0000',
  7: 'Norzagaray, Bulacan',
  8: 'Bachelor of Science in Computer Science',
  9: '2025',
  10: 'Career Readiness and Portfolio Building Workshop',
  11: 'Employed',
  12: 'Junior Software Developer',
  13: 'Sample Technology Solutions',
  14: 'Bulacan',
  15: 'Yes',
  16: 'Web development, database design, teamwork',
  17: 'I continue learning through small projects and collaboration with fellow graduates.',
};

const profilePayload = {
  user: graduate,
  profile: {
    id: 801,
    graduate_account_id: 501,
    first_name: 'Juan',
    middle_name: 'Santos',
    last_name: 'Dela Cruz',
    phone_number: '+63 900 000 0000',
    birthday: '2003-06-12',
    civil_status: 'Single',
    sex_gender: 'Male',
    program_course: 'Bachelor of Science in Computer Science',
    graduation_year: 2025,
    current_location: 'Norzagaray, Bulacan',
    job_title: 'Junior Software Developer',
    company_name: 'Sample Technology Solutions',
    employment_location: 'Bulacan',
    professional_status: 'Employed',
    start_date: '2026-07-01',
    initialized_from_survey_response_id: 901,
    created_at: '2026-09-02 09:00:00',
    updated_at: '2026-09-20 08:00:00',
  },
  survey_profile: {
    response: {id: 901, survey_id: 7, survey_title: survey.title, submitted_at: '2026-09-01 08:00:00'},
    personal: {fields: [
      {key: 'birthday', label: 'Birthday', value: '2003-06-12'},
      {key: 'civil_status', label: 'Civil Status', value: 'Single'},
      {key: 'sex', label: 'Sex / Gender', value: 'Male'},
      {key: 'address', label: 'Current Address', value: 'Norzagaray, Bulacan'},
    ]},
    work: {
      is_employed: true,
      summary: {employment_status: 'Employed', current_job_title: 'Junior Software Developer', company: 'Sample Technology Solutions', location: 'Bulacan', start_date: '2026-07-01', job_related_to_program: 'Yes', skills_used: 'Web development, database design, teamwork'},
      fields: [
        {key: 'employment_status', label: 'Employment Status', value: 'Employed'},
        {key: 'current_job_title', label: 'Current Job Title', value: 'Junior Software Developer'},
        {key: 'company', label: 'Company Name', value: 'Sample Technology Solutions'},
      ],
    },
    education: {
      fields: [
        {key: 'degree_program', label: 'Degree / Program', value: 'Bachelor of Science in Computer Science'},
        {key: 'institution', label: 'Institution', value: 'Norzagaray College'},
        {key: 'year_graduated', label: 'Year Graduated', value: '2025'},
      ],
      graduate_studies: [],
    },
    trainings: [{id: 1, title: 'Career Readiness and Portfolio Building Workshop', organizer: 'Norzagaray College', date: '2025', duration: 'One day', location: 'Norzagaray, Bulacan'}],
  },
  is_self: true,
  viewer_graduate_id: 101,
};

const notifications = {
  notifications: [
    {key: 'job-401', type: 'job_opportunity', title: 'New sample job opportunity', message: 'Junior Software Developer was added to Browse Jobs.', created_at: '2026-09-23 00:40:00', link: '/graduate/portal?tab=jobs', priority: 'normal', read: false, category: 'browse_jobs'},
    {key: 'forum-301', type: 'forum_comment', title: 'New forum comment', message: 'Maria Santos commented on your sample community post.', created_at: '2026-09-22 21:00:00', link: '/graduate/portal?tab=community_forum', priority: 'normal', read: false, category: 'general'},
    {key: 'announcement-601', type: 'announcement', title: 'Career webinar announced', message: 'A new sample graduate career activity is available.', created_at: '2026-09-22 08:00:00', link: '/graduate/announcements/601', priority: 'normal', read: true, category: 'general'},
  ],
  unread_count: 2,
  unread_by_category: {browse_jobs: 1, job_posting: 0, general: 1},
};

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });
}

async function main() {
  let graduateAuthenticated = false;
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  const context = await browser.newContext({
    viewport: {width: 1680, height: 860},
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'Asia/Manila',
  });

  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (!pathname.includes('/GradTrack/backend/')) return route.continue();

    if (pathname.endsWith('/api/csrf.php')) return json(route, {csrf_token: 'gradtrack-demo-csrf-token'});

    if (pathname.endsWith('/api/settings/index.php')) {
      return json(route, {success: true, settings: {
        system_name: 'GradTrack',
        system_short_name: 'GradTrack',
        institution_name: 'Norzagaray College',
        system_description: 'A Web-Based Graduate Tracer System with Alumni Job Support System',
        system_logo_path: '/Gradtrack_small.png',
        login_logo_path: '/GRADTRACK_LOGO1.png',
        login_background_image_path: '/520382375_1065446909052636_3412465913398569974_n.jpg',
        login_welcome_message: 'Welcome back. Log in to access the alumni community and job opportunities.',
        primary_theme_color: '#1d4ed8',
        secondary_theme_color: '#f8c331',
        feature_graduate_survey_enabled: 'true',
        feature_alumni_job_support_enabled: 'true',
        feature_community_forum_enabled: 'true',
        feature_notifications_enabled: 'true',
        feature_messaging_enabled: 'true',
        survey_enabled: 'true',
        survey_title: 'Graduate Tracer Survey',
        survey_instructions: 'Please verify your identity to access the active graduate tracer survey.',
        community_forum_enabled: 'true',
        community_guidelines: 'Keep discussions respectful, relevant, and helpful for fellow Norzagaray College alumni.',
        community_default_announcement: 'Welcome to the GradTrack Community Forum.',
        community_allow_media_uploads: 'true',
        maintenance_mode: 'false',
      }});
    }

    if (pathname.endsWith('/api/auth/check.php')) return json(route, {authenticated: false});
    if (pathname.endsWith('/api/graduate-auth/check.php')) {
      return json(route, graduateAuthenticated ? {authenticated: true, user: graduate} : {authenticated: false});
    }
    if (pathname.endsWith('/api/graduate-auth/login.php')) {
      graduateAuthenticated = true;
      return json(route, {success: true, user: graduate});
    }
    if (pathname.endsWith('/api/graduate-auth/logout.php')) return json(route, {success: true});
    if (pathname.endsWith('/api/graduate-auth/register-from-survey.php')) {
      return json(route, {success: true, message: 'Your demo account is pending Alumni Admin verification.'});
    }

    if (pathname.endsWith('/api/surveys/programs.php')) {
      return json(route, {success: true, data: [{id: 1, name: 'Bachelor of Science in Computer Science', code: 'BSCS'}]});
    }
    if (pathname.endsWith('/api/surveys/index.php')) {
      if (url.searchParams.has('id')) return json(route, {success: true, data: survey});
      return json(route, {success: true, data: [survey], active_survey_coverage: {configured: true, years: [2025]}});
    }
    if (pathname.endsWith('/api/surveys/verify.php')) {
      return json(route, {
        success: false,
        message: 'You already completed this survey.',
        data: {
          already_answered: true,
          can_create_account: true,
          account_exists: false,
          graduate_id: 101,
          survey_response_id: 901,
          survey_token: 'demo-survey-token',
          survey_title: survey.title,
          graduate_name: graduate.full_name,
          profile: {
            first_name: graduate.first_name,
            middle_name: graduate.middle_name,
            last_name: graduate.last_name,
            email: graduate.email,
            phone: graduate.phone,
            year_graduated: graduate.year_graduated,
            address: graduate.address,
            program_id: graduate.program_id,
            program_name: graduate.program_name,
          },
        },
      });
    }
    if (pathname.endsWith('/api/surveys/validate-token.php')) {
      return json(route, {success: true, data: {survey_id: 7, graduate_id: 101, graduate_name: graduate.full_name, student_id: graduate.student_id, profile: graduate}});
    }
    if (pathname.endsWith('/api/surveys/responses.php')) {
      return json(route, {success: true, survey_response_id: 901});
    }

    if (pathname.endsWith('/api/notifications/index.php')) return json(route, {success: true, data: notifications});
    if (pathname.endsWith('/api/alumni-rating/index.php')) {
      return json(route, {success: true, data: {rating: {score: 92, badges: [{code: 'verified', name: 'Verified Alumni', description: 'Graduate record verified'}], status_flags: {is_employed: true, is_aligned: true, is_survey_complete: true}, permissions: {can_post_jobs: true}}}});
    }
    if (pathname.endsWith('/api/forum/posts.php')) {
      if (request.method() !== 'GET') return json(route, {success: true, data: myPosts[0]});
      return json(route, {success: true, data: url.searchParams.get('mine') === '1' ? myPosts : forumPosts, categories: ['Career Tips', 'Career Stories', 'Alumni Activities']});
    }
    if (pathname.endsWith('/api/forum/comments.php')) return json(route, {success: true, data: []});
    if (pathname.endsWith('/api/forum/likes.php')) return json(route, {success: true, data: {liked: true, like_count: 19}});
    if (pathname.endsWith('/api/forum/chats.php')) {
      return json(route, {success: true, data: {rooms: [directRoom, groupRoom], directory: [participants.maria, participants.paolo, participants.ana]}});
    }
    if (pathname.endsWith('/api/forum/chat-messages.php')) {
      const roomId = Number(url.searchParams.get('room_id') || 201);
      const room = roomId === 202 ? groupRoom : directRoom;
      const messages = roomId === 202
        ? [
            {id: 710, room_id: 202, graduate_id: 102, message: 'Welcome to BSCS Alumni 2025. Let us share career leads and alumni activities here.', message_type: 'text', created_at: '2026-09-22 15:45:00', sender_name: 'Maria Santos', sender_program_code: 'BSCS', is_mine: false, attachments: []},
            {id: 711, room_id: 202, graduate_id: 101, message: 'Thank you! I will join the career webinar.', message_type: 'text', created_at: '2026-09-22 15:54:00', sender_name: 'Juan Dela Cruz', sender_program_code: 'BSCS', is_mine: true, attachments: [], delivered_at: '2026-09-22 15:54:05', read_at: '2026-09-22 15:55:00'},
            {id: 712, room_id: 202, graduate_id: 104, message: 'See everyone at the career webinar!', message_type: 'text', created_at: '2026-09-22 16:00:00', sender_name: 'Ana Rivera', sender_program_code: 'BSEd', is_mine: false, attachments: []},
          ]
        : [
            {id: 701, room_id: 201, graduate_id: 102, message: 'Hi! You may check the sample job opportunity available in the Jobs section.', message_type: 'text', created_at: '2026-09-23 01:04:00', sender_name: 'Maria Santos', sender_program_code: 'BSCS', is_mine: false, attachments: []},
            {id: 702, room_id: 201, graduate_id: 101, message: "Thank you. I'll check it.", message_type: 'text', created_at: '2026-09-23 01:06:00', sender_name: 'Juan Dela Cruz', sender_program_code: 'BSCS', is_mine: true, attachments: [], delivered_at: '2026-09-23 01:06:05', read_at: '2026-09-23 01:06:15'},
          ];
      return json(route, {success: true, data: {room, messages, pagination: {limit: 30, has_more_older: false, has_more_newer: false, oldest_id: messages[0].id, newest_id: messages[messages.length - 1].id}}});
    }
    if (pathname.endsWith('/api/forum/conversation-info.php')) {
      const room = Number(url.searchParams.get('room_id')) === 202 ? groupRoom : directRoom;
      return json(route, {success: true, data: {room, photos: [], files: [], group_blocked_members: [], block: null, permissions: {can_change_group_photo: true, can_leave_group: true, can_add_members: true}}});
    }

    if (pathname.endsWith('/api/jobs/posts.php')) {
      if (url.searchParams.has('id')) return json(route, {success: true, data: jobs.find((job) => job.id === Number(url.searchParams.get('id'))) || jobs[0]});
      if (url.searchParams.get('mine') === '1') return json(route, {success: true, data: []});
      return json(route, {success: true, data: jobs});
    }
    if (pathname.endsWith('/api/graduate-profile/index.php')) return json(route, {success: true, data: profilePayload});
    if (pathname.endsWith('/api/announcements/index.php')) {
      const id = Number(url.searchParams.get('id') || 0);
      return json(route, {success: true, data: id ? announcements.find((item) => item.id === id) : announcements, category_counts: [{category: 'career', count: 1}, {category: 'alumni_event', count: 1}, {category: 'general', count: 1}], recent: announcements, pagination: {current_page: 1, per_page: 9, total: 3, last_page: 1}});
    }

    return json(route, {success: true, data: []});
  });

  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.dismiss());

  const stabilize = async () => {
    await page.addStyleTag({content: `
      *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; caret-color: transparent !important; }
      html { scroll-behavior: auto !important; }
    `});
    await page.waitForTimeout(350);
  };

  const capture = async (name) => {
    await stabilize();
    await page.screenshot({path: path.join(screenshotDir, `${name}.png`), animations: 'disabled'});
    process.stdout.write(`Captured ${name}.png\n`);
  };

  graduateAuthenticated = false;
  await page.goto(`${appUrl}/survey-verify`, {waitUntil: 'domcontentloaded'});
  await page.getByRole('heading', {name: /Graduate Tracer Survey/i}).waitFor();
  await page.getByPlaceholder('2XXX-XXXX').fill('2025-0000');
  await page.getByPlaceholder(/Enter your last name/i).fill('Dela Cruz');
  await page.locator('select').selectOption('BSCS');
  await capture('01-verification');

  await page.goto(appUrl, {waitUntil: 'domcontentloaded'});
  await page.evaluate(({responses}) => {
    localStorage.setItem('survey_token', 'demo-survey-token');
    localStorage.setItem('graduate_id', '101');
    localStorage.setItem('graduate_name', 'Juan Dela Cruz');
    localStorage.setItem('graduate_profile', JSON.stringify({
      student_id: '2025-0000', first_name: 'Juan', middle_name: 'Santos', last_name: 'Dela Cruz',
      email: 'juan.delacruz.demo@example.com', phone: '+639000000000', year_graduated: 2025,
      address: 'Norzagaray, Bulacan', program_id: 1, program_name: 'Bachelor of Science in Computer Science', program_code: 'BSCS',
    }));
    localStorage.setItem('survey_draft_7_g101', JSON.stringify({responses, section: 0, timestamp: '2026-09-23T00:55:00+08:00'}));
  }, {responses: surveyResponses});
  await page.goto(`${appUrl}/survey?survey_id=7`, {waitUntil: 'domcontentloaded'});
  await page.getByRole('heading', {name: /Data Privacy Notice/i}).waitFor();
  await page.getByLabel(/I have read and understood/i).check();
  await page.getByRole('button', {name: /I Agree & Proceed/i}).click();
  await page.getByRole('heading', {name: /Personal Information/i}).waitFor();
  await capture('02-survey-personal');

  await page.getByRole('button', {name: 'Next'}).click();
  await page.getByRole('heading', {name: /Educational Background/i}).waitFor();
  await capture('03-survey-education');
  await page.getByRole('button', {name: 'Next'}).click();
  await page.getByRole('heading', {name: /Employment Data/i}).waitFor();
  await capture('04-survey-employment');
  await page.getByRole('button', {name: 'Next'}).click();
  await page.getByRole('heading', {name: /Career & Experience/i}).waitFor();
  await capture('05-survey-career');
  await page.getByRole('button', {name: /Review Answers/i}).click();
  await page.getByRole('heading', {name: /Review Your Answers/i}).waitFor();
  await capture('06-survey-review');
  await page.getByRole('button', {name: /Confirm & Submit Survey/i}).click();
  await page.getByRole('heading', {name: /submitted successfully/i}).waitFor();
  await capture('06b-survey-complete');
  await page.getByRole('button', {name: /Create Account Now/i}).click();
  await page.getByPlaceholder(/Min 8 chars/i).fill('DemoOnly1!');
  await page.getByPlaceholder(/Re-enter password/i).fill('DemoOnly1!');
  await capture('07b-account-after-survey');

  graduateAuthenticated = false;
  await page.goto(`${appUrl}/graduate/signin`, {waitUntil: 'domcontentloaded'});
  await page.getByRole('heading', {name: /Graduate Portal/i}).waitFor();
  await page.getByPlaceholder('you@example.com').fill('juan.delacruz.demo@example.com');
  await page.getByPlaceholder(/Enter your password/i).fill('DemoOnly1!');
  await capture('08-login');

  graduateAuthenticated = true;
  await page.goto(`${appUrl}/graduate/portal?tab=community_forum`, {waitUntil: 'domcontentloaded'});
  await page.getByRole('heading', {name: /Community Forum/i}).waitFor();
  await page.getByText('Tips for preparing for your first job interview').waitFor();
  await capture('09-community-forum');
  await page.getByRole('button', {name: /Create Post/i}).click();
  await page.getByRole('heading', {name: /Create post/i}).waitFor();
  await page.getByLabel('Post content').fill('Share your career experiences with fellow Norzagaray College graduates.');
  await capture('10-community-create-post');

  await page.getByRole('button', {name: /Close post composer/i}).click();
  await page.goto(`${appUrl}/graduate/announcements`, {waitUntil: 'domcontentloaded'});
  await page.getByRole('heading', {name: 'Announcements'}).waitFor();
  await page.getByText('Graduate Career Development Webinar').waitFor();
  await capture('11-announcements');

  await page.goto(`${appUrl}/graduate/portal?tab=messages`, {waitUntil: 'domcontentloaded'});
  await page.getByRole('heading', {name: 'Messages'}).waitFor();
  await page.getByText('Hi! You may check the sample job opportunity available in the Jobs section.').waitFor();
  await page.locator('.gradtrack-messaging [role="status"]').evaluateAll((elements) => elements.forEach((element) => element.remove()));
  await capture('12-direct-messages');
  await page.getByText('BSCS Alumni 2025', {exact: true}).first().click();
  await page.getByText('See everyone at the career webinar!').last().waitFor();
  await capture('13-group-chat');

  await page.goto(`${appUrl}/graduate/portal?tab=jobs`, {waitUntil: 'domcontentloaded'});
  await page.getByRole('heading', {name: /Browse Jobs/i}).waitFor();
  await page.getByText('Junior Software Developer').waitFor();
  await capture('14-browse-jobs');
  await page.getByRole('button', {name: /View Details/i}).first().click();
  await page.getByRole('heading', {name: 'How to Apply'}).waitFor();
  await capture('15-job-details');

  await page.getByRole('button', {name: /Close job details/i}).click();
  await page.goto(`${appUrl}/graduate/portal?tab=job_posting`, {waitUntil: 'domcontentloaded'});
  await page.getByRole('heading', {name: 'Job Posting', exact: true}).waitFor();
  await page.getByRole('button', {name: /Create Job Post/i}).click();
  await page.getByRole('heading', {name: /Create Job Post/i}).waitFor();
  const jobPostInputs = page.locator('form input');
  await jobPostInputs.nth(0).fill('Junior Web Developer');
  await jobPostInputs.nth(1).fill('Example Organization');
  await jobPostInputs.nth(2).fill('Bulacan');
  await jobPostInputs.nth(3).fill('Competitive entry-level package');
  await page.locator('form textarea').nth(0).fill('A sample opportunity for recent graduates to support web application projects.');
  await capture('15b-create-job-post');

  await page.goto(`${appUrl}/graduate/portal?tab=my_profile`, {waitUntil: 'domcontentloaded'});
  await page.getByRole('heading', {name: /My Profile/i}).waitFor();
  await page.getByText('Sample Technology Solutions', {exact: true}).waitFor();
  await capture('16-profile');

  await page.goto(`${appUrl}/graduate/portal?tab=settings&section=employment`, {waitUntil: 'domcontentloaded'});
  await page.getByRole('heading', {name: 'Employment', exact: true}).waitFor();
  await capture('17-profile-settings');

  await page.goto(`${appUrl}/graduate/portal?tab=community_forum`, {waitUntil: 'domcontentloaded'});
  await page.getByRole('heading', {name: /Community Forum/i}).waitFor();
  await page.getByRole('button', {name: /Notifications/i}).click();
  await page.getByText('New sample job opportunity').waitFor();
  await capture('18-notifications');

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
