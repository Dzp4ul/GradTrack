import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import SignIn from './pages/SignIn';
import Survey from './pages/Survey';
import AdminLayout from './pages/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import Graduates from './pages/admin/Graduates';
import Surveys from './pages/admin/Surveys';
import SurveyResponses from './pages/admin/SurveyResponses';
import SurveyAnalytics from './pages/admin/SurveyAnalytics';
import Reports from './pages/admin/Reports';
import Announcements from './pages/admin/Announcements';
import Settings from './pages/admin/Settings';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './lib/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
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
          <Route index element={<Dashboard />} />
          <Route path="graduates" element={<Graduates />} />
          <Route path="surveys" element={<Surveys />} />
          <Route path="surveys/:surveyId/responses" element={<SurveyResponses />} />
          <Route path="surveys/:surveyId/analytics" element={<SurveyAnalytics />} />
          <Route path="reports" element={<Reports />} />
          <Route path="announcements" element={<Announcements />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
