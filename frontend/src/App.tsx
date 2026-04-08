import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';
import FAQPage from './pages/FAQPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import SignIn from './pages/SignIn';
import Survey from './pages/Survey';
import SurveyVerification from './pages/SurveyVerification';
import AdminLayout from './pages/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import Graduates from './pages/admin/Graduates';
import Surveys from './pages/admin/Surveys';
import SurveyDetail from './pages/admin/SurveyDetail';
import SurveyResponses from './pages/admin/SurveyResponses';
import SurveyAnalytics from './pages/admin/SurveyAnalytics';
import Reports from './pages/admin/Reports';
import Settings from './pages/admin/Settings';
import DeanSurveyStatus from './pages/admin/DeanSurveyStatus';
import UserManagement from './pages/admin/UserManagement';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './lib/ProtectedRoute';

const SUPER_ADMIN_ROLES = ['super_admin'];
const ADMIN_ROLES = ['admin'];
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

  return <Dashboard />;
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/survey-verify" element={<SurveyVerification />} />
        <Route path="/survey" element={<Survey />} />
        
        {/* Admin Sign In - Separate route for admin only */}
        <Route path="/admin/signin" element={<SignIn />} />

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
          <Route
            path="graduates"
            element={
              <ProtectedRoute allowedRoles={['registrar']}>
                <Graduates />
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
            path="user-management"
            element={
              <ProtectedRoute allowedRoles={SUPER_ADMIN_ROLES}>
                <UserManagement />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
