const DEFAULT_API_BASE_URL = 'http://localhost/GradTrack/backend';

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;

export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '');
export const API_ROOT = `${API_BASE_URL}/api`;

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: `${API_ROOT}/auth/login.php`,
    LOGOUT: `${API_ROOT}/auth/logout.php`,
    CHECK: `${API_ROOT}/auth/check.php`,
  },
  GRADUATE_AUTH: {
    LOGIN: `${API_ROOT}/graduate-auth/login.php`,
    LOGOUT: `${API_ROOT}/graduate-auth/logout.php`,
    CHECK: `${API_ROOT}/graduate-auth/check.php`,
    REGISTER_FROM_SURVEY: `${API_ROOT}/graduate-auth/register-from-survey.php`,
  },
  GRADUATE_PROFILE: `${API_ROOT}/graduate-profile/index.php`,
  GRADUATES: `${API_ROOT}/graduates/index.php`,
  SURVEYS: `${API_ROOT}/surveys/index.php`,
  SURVEY_PROGRAMS: `${API_ROOT}/surveys/programs.php`,
  SURVEY_TEMPLATES: `${API_ROOT}/surveys/templates.php`,
  SURVEY_CLEAR: `${API_ROOT}/surveys/clear.php`,
  SURVEY_RESPONSES: `${API_ROOT}/surveys/responses.php`,
  SURVEY_ANALYTICS: `${API_ROOT}/surveys/analytics.php`,
  DASHBOARD: `${API_ROOT}/dashboard/stats.php`,
  REPORTS: `${API_ROOT}/reports/index.php`,
  ANNOUNCEMENTS: `${API_ROOT}/announcements/index.php`,
  SETTINGS: `${API_ROOT}/settings/index.php`,
  BACKUP: `${API_ROOT}/backup/index.php`,
  USERS: `${API_ROOT}/users/index.php`,
  GRADUATE_SURVEY_STATUS: `${API_ROOT}/graduates/survey-status.php`,
  GRADUATE_NOTIFY: `${API_ROOT}/graduates/notify.php`,
  DEAN_SURVEY_STATUS: `${API_ROOT}/dean/survey-status.php`,
  MENTORSHIP: {
    MENTORS: `${API_ROOT}/mentorship/mentors.php`,
    REQUESTS: `${API_ROOT}/mentorship/requests.php`,
    MESSAGES: `${API_ROOT}/mentorship/messages.php`,
    FEEDBACK: `${API_ROOT}/mentorship/feedback.php`,
  },
  JOBS: {
    POSTS: `${API_ROOT}/jobs/posts.php`,
    APPLICATIONS: `${API_ROOT}/jobs/applications.php`,
  },
  ALUMNI_RATING: {
    SUMMARY: `${API_ROOT}/alumni-rating/index.php`,
    DOCUMENTS: `${API_ROOT}/alumni-rating/documents.php`,
  },
};
