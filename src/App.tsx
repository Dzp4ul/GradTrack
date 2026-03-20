import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import Survey from './pages/Survey';
import AdminLayout from './pages/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import Graduates from './pages/admin/Graduates';
import Surveys from './pages/admin/Surveys';
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
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/survey" element={<Survey />} />

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
          <Route path="reports" element={<Reports />} />
          <Route path="announcements" element={<Announcements />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
