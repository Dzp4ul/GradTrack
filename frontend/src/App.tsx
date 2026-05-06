import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
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
import DeanSurveyStatus from './pages/admin/DeanSurveyStatus';
import UserManagement from './pages/admin/UserManagement';
import EngagementApprovals from './pages/admin/EngagementApprovals';
import ForumModeration from './pages/admin/ForumModeration';
import AuditTrail from './pages/admin/AuditTrail.jsx';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './lib/ProtectedRoute';
import { GraduateAuthProvider } from './contexts/GraduateAuthContext';
import { GraduateProtectedRoute } from './lib/GraduateProtectedRoute';

const SUPER_ADMIN_ROLES = ['super_admin'];
const ADMIN_ROLES = ['admin'];
const FORUM_MODERATOR_ROLES = ['super_admin', 'admin', 'mis_staff', 'research_coordinator'];
const DEAN_ROLES = ['dean_cs', 'dean_coed', 'dean_hm'];

function AdminHome() {
  const { user } = useAuth();

  if (user?.role === 'super_admin') {
    return <Navigate to="/admin/user-management" replace />;
  }

  if (user?.role === 'registrar') {
    return <Navigate to="/admin/graduates" replace />;
  }

  if (user?.role && DEAN_ROLES.includes(user.role)) {
    return <Navigate to="/admin/survey-status" replace />;
  }

  if (user?.role && ['mis_staff', 'research_coordinator'].includes(user.role)) {
    return <Navigate to="/admin/forum-moderation" replace />;
  }

  return <Dashboard />;
}

function GraduatesRoute() {
  const { user } = useAuth();

  if (user?.role === 'admin') {
    return <GraduateParticipation />;
  }

  return <Graduates />;
}

function App() {
  return (
    <AuthProvider>
      <GraduateAuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/faq" element={<FAQPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
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
                <ProtectedRoute allowedRoles={['admin', 'registrar']}>
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
              path="job-approvals"
              element={
                <ProtectedRoute allowedRoles={DEAN_ROLES}>
                  <EngagementApprovals mode="job" />
                </ProtectedRoute>
              }
            />
            <Route
              path="forum-moderation"
              element={
                <ProtectedRoute allowedRoles={FORUM_MODERATOR_ROLES}>
                  <ForumModeration />
                </ProtectedRoute>
              }
            />
            <Route
              path="surveys"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                  <Surveys />
                </ProtectedRoute>
              }
            />
            <Route
              path="surveys/:id"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                  <SurveyDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="surveys/:surveyId/responses"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                  <SurveyResponses />
                </ProtectedRoute>
              }
            />
            <Route
              path="surveys/:surveyId/analytics"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                  <SurveyAnalytics />
                </ProtectedRoute>
              }
            />
            <Route
              path="reports"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route
              path="settings"
              element={
                <ProtectedRoute allowedRoles={SUPER_ADMIN_ROLES}>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="backup-database"
              element={
                <ProtectedRoute allowedRoles={SUPER_ADMIN_ROLES}>
                  <BackupDatabase />
                </ProtectedRoute>
              }
            />
            <Route
              path="user-management"
              element={
                <ProtectedRoute allowedRoles={SUPER_ADMIN_ROLES}>
                  <UserManagement />
                </ProtectedRoute>
              }
            />
            <Route path="audit-trail" element={<AuditTrail />} />
          </Route>
        </Routes>
      </GraduateAuthProvider>
    </AuthProvider>
  );
}

export default App;
