import { Navigate } from 'react-router-dom';
import { useGraduateAuth } from '../contexts/GraduateAuthContext';
import { useSystemSettings } from '../contexts/SystemSettingsContext';
import MaintenancePage from '../pages/MaintenancePage';

export function GraduateProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useGraduateAuth();
  const { isMaintenanceMode, isLoading: settingsLoading } = useSystemSettings();

  if (isLoading || settingsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-gray-600">Loading your graduate profile...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/graduate/signin" replace />;
  }

  if (isMaintenanceMode) {
    return <MaintenancePage />;
  }

  return <>{children}</>;
}
