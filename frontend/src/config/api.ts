const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost/GradTrack/backend';

export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '');
export const API_ROOT = `${API_BASE_URL}/api`;

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: `${API_ROOT}/auth/login.php`,
    LOGOUT: `${API_ROOT}/auth/logout.php`,
    CHECK: `${API_ROOT}/auth/check.php`,
  },
  GRADUATES: `${API_ROOT}/graduates/index.php`,
  SURVEYS: `${API_ROOT}/surveys/index.php`,
  SURVEY_TEMPLATES: `${API_ROOT}/surveys/templates.php`,
  SURVEY_CLEAR: `${API_ROOT}/surveys/clear.php`,
  SURVEY_RESPONSES: `${API_ROOT}/surveys/responses.php`,
  SURVEY_ANALYTICS: `${API_ROOT}/surveys/analytics.php`,
  DASHBOARD: `${API_ROOT}/dashboard/stats.php`,
  REPORTS: `${API_ROOT}/reports/index.php`,
  ANNOUNCEMENTS: `${API_ROOT}/announcements/index.php`,
  SETTINGS: `${API_ROOT}/settings/index.php`,
  USERS: `${API_ROOT}/users/index.php`,
  DEAN_SURVEY_STATUS: `${API_ROOT}/dean/survey-status.php`,
};
