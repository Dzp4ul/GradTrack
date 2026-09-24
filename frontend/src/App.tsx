import { Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import HomePage from './pages/HomePage';
import PublicAnnouncementsPage from './pages/PublicAnnouncementsPage';
import AboutPage from './pages/AboutPage';
import FAQPage from './pages/FAQPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import SignIn from './pages/SignIn';
import AdminForgotPassword from './pages/AdminForgotPassword';
import Survey from './pages/Survey';
import SurveyVerification from './pages/SurveyVerification';
import GraduateSignIn from './pages/GraduateSignIn';
import GraduateForgotPassword from './pages/GraduateForgotPassword';
import GraduatePortal from './pages/GraduatePortal';
import MaintenancePage from './pages/MaintenancePage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminProfile from './pages/admin/AdminProfile';
import Dashboard from './pages/admin/Dashboard';
import Graduates from './pages/admin/Graduates';
import GraduateParticipation from './pages/admin/GraduateParticipation';
import Surveys from './pages/admin/Surveys';
import SurveyDetail from './pages/admin/SurveyDetail';
import SurveyResponses from './pages/admin/SurveyResponses';
import SurveyAnalytics from './pages/admin/SurveyAnalytics';
import Reports from './pages/admin/Reports';
import Settings from './pages/admin/Settings';
import BackupDatabase from './pages/admin/BackupDatabase';
import AutoReminders from './pages/admin/AutoReminders';
import DeanSurveyStatus from './pages/admin/DeanSurveyStatus';
import UserManagement from './pages/admin/UserManagement';
import EngagementApprovals from './pages/admin/EngagementApprovals';
import ForumModeration from './pages/admin/ForumModeration';
import Announcements from './pages/admin/Announcements';
import JobPostings from './pages/admin/JobPostings';
import AlumniRegisteredList from './pages/admin/AlumniRegisteredList';
import AuditTrail from './pages/admin/AuditTrail.jsx';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './lib/ProtectedRoute';
import { GraduateAuthProvider, useGraduateAuth } from './contexts/GraduateAuthContext';
import { GraduateProtectedRoute } from './lib/GraduateProtectedRoute';
import { useSystemSettings } from './contexts/SystemSettingsContext';
import ScrollToTop from './components/ScrollToTop';
import { ADMIN_ROLES, ALUMNI_PRESIDENT_ROLES, DEAN_ROLES, JOB_POSTING_ROLES, RESEARCH_COORDINATOR_ROLES, ROLES } from './config/roles';

function PublicPage({ children }: { children: ReactNode }) {
  const { isMaintenanceMode, isLoading } = useSystemSettings();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (isMaintenanceMode) {
    return <MaintenancePage />;
  }

  return <>{children}</>;
}

function HomeRoute() {
  const { isAuthenticated: isAdminAuthenticated, isLoading: isAdminAuthLoading } = useAuth();
  const { isAuthenticated: isGraduateAuthenticated, isLoading: isGraduateAuthLoading } = useGraduateAuth();

  if (isAdminAuthLoading || isGraduateAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (isGraduateAuthenticated) {
    return <Navigate to="/graduate/portal?tab=community_forum" replace />;
  }

  if (isAdminAuthenticated) {
    return <Navigate to="/admin" replace />;
  }

  return <PublicPage><HomePage /></PublicPage>;
}

function AdminHome() {
  const { user } = useAuth();

  if (user?.role === ROLES.ADMIN) {
    return <Navigate to="/admin/user-management" replace />;
  }

  if (user?.role === ROLES.REGISTRAR) {
    return <Navigate to="/admin/graduates" replace />;
  }

  if (user?.role === ROLES.ALUMNI_PRESIDENT) {
    return <Navigate to="/admin/alumni-registered-list" replace />;
  }

  if (user?.role && (DEAN_ROLES as readonly string[]).includes(user.role)) {
    return <Dashboard />;
  }

  return <Dashboard />;
}

function GraduatesRoute() {
  const { user } = useAuth();

  if (user?.role === ROLES.RESEARCH_COORDINATOR) {
    return <GraduateParticipation />;
  }

  return <Graduates />;
}

function App() {
  return (
    <AuthProvider>
      <GraduateAuthProvider>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/announcements" element={<PublicPage><PublicAnnouncementsPage /></PublicPage>} />
          <Route path="/announcements/:announcementId" element={<PublicPage><PublicAnnouncementsPage /></PublicPage>} />
          <Route path="/about" element={<PublicPage><AboutPage /></PublicPage>} />
          <Route path="/faq" element={<PublicPage><FAQPage /></PublicPage>} />
          <Route path="/privacy-policy" element={<PublicPage><PrivacyPolicyPage /></PublicPage>} />
          <Route path="/maintenance" element={<MaintenancePage />} />
          <Route path="/survey-verify" element={<SurveyVerification />} />
          <Route path="/survey" element={<Survey />} />

          <Route path="/graduate/signin" element={<GraduateSignIn />} />
          <Route path="/graduate/forgot-password" element={<GraduateForgotPassword />} />
          <Route
            path="/graduate/portal"
            element={
              <GraduateProtectedRoute>
                <GraduatePortal />
              </GraduateProtectedRoute>
            }
          />
          <Route
            path="/graduate/announcements"
            element={
              <GraduateProtectedRoute>
                <GraduatePortal />
              </GraduateProtectedRoute>
            }
          />
          <Route
            path="/graduate/announcements/:announcementId"
            element={
              <GraduateProtectedRoute>
                <GraduatePortal />
              </GraduateProtectedRoute>
            }
          />
          <Route
            path="/graduate/community/profile/:graduateId"
            element={
              <GraduateProtectedRoute>
                <GraduatePortal />
              </GraduateProtectedRoute>
            }
          />

          {/* Admin Sign In - Separate route for admin only */}
          <Route path="/admin/signin" element={<SignIn />} />
          <Route path="/admin/forgot-password" element={<AdminForgotPassword />} />

          {/* Admin Routes - Protected */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminHome />} />
            <Route path="profile" element={<AdminProfile />} />
            <Route
              path="graduates"
              element={
                <ProtectedRoute allowedRoles={[ROLES.RESEARCH_COORDINATOR, ROLES.REGISTRAR]}>
                  <GraduatesRoute />
                </ProtectedRoute>
              }
            />
            <Route
              path="survey-status"
              element={
                <ProtectedRoute allowedRoles={DEAN_ROLES}>
                  <DeanSurveyStatus />
                </ProtectedRoute>
              }
            />
            <Route
              path="approvals"
              element={<Navigate to="/admin/forum-moderation" replace />}
            />
            <Route
              path="job-postings"
              element={
                <ProtectedRoute allowedRoles={JOB_POSTING_ROLES}>
                  <JobPostings />
                </ProtectedRoute>
              }
            />
            <Route
              path="job-approvals"
              element={
                <ProtectedRoute allowedRoles={ALUMNI_PRESIDENT_ROLES}>
                  <EngagementApprovals />
                </ProtectedRoute>
              }
            />
            <Route
              path="alumni-registered-list"
              element={
                <ProtectedRoute allowedRoles={ALUMNI_PRESIDENT_ROLES}>
                  <AlumniRegisteredList />
                </ProtectedRoute>
              }
            />
            <Route
              path="forum-moderation"
              element={
                <ProtectedRoute allowedRoles={ALUMNI_PRESIDENT_ROLES}>
                  <ForumModeration />
                </ProtectedRoute>
              }
            />
            <Route
              path="surveys"
              element={
                <ProtectedRoute allowedRoles={RESEARCH_COORDINATOR_ROLES}>
                  <Surveys />
                </ProtectedRoute>
              }
            />
            <Route
              path="surveys/:id"
              element={
                <ProtectedRoute allowedRoles={RESEARCH_COORDINATOR_ROLES}>
                  <SurveyDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="surveys/:surveyId/responses"
              element={
                <ProtectedRoute allowedRoles={RESEARCH_COORDINATOR_ROLES}>
                  <SurveyResponses />
                </ProtectedRoute>
              }
            />
            <Route
              path="surveys/:surveyId/analytics"
              element={
                <ProtectedRoute allowedRoles={RESEARCH_COORDINATOR_ROLES}>
                  <SurveyAnalytics />
                </ProtectedRoute>
              }
            />
            <Route
              path="reports"
              element={
                <ProtectedRoute allowedRoles={[...RESEARCH_COORDINATOR_ROLES, ...DEAN_ROLES]}>
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route
              path="settings"
              element={<Navigate to="/admin/system-settings" replace />}
            />
            <Route
              path="system-settings"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="backup-database"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                  <BackupDatabase />
                </ProtectedRoute>
              }
            />
            <Route
              path="user-management"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                  <UserManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="auto-reminders"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                  <AutoReminders />
                </ProtectedRoute>
              }
            />
            <Route
              path="audit-trail"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                  <AuditTrail />
                </ProtectedRoute>
              }
            />
            <Route
              path="announcements"
              element={
                <ProtectedRoute allowedRoles={ALUMNI_PRESIDENT_ROLES}>
                  <Announcements />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </GraduateAuthProvider>
    </AuthProvider>
  );
}

export default App;
