import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSystemSettings } from '../contexts/SystemSettingsContext';
import MaintenancePage from '../pages/MaintenancePage';
import { ROLES } from '../config/roles';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { isMaintenanceMode, isLoading: settingsLoading } = useSystemSettings();

  if (isLoading || settingsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/signin" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    const fallbackPath =
      user.role === ROLES.REGISTRAR
        ? '/admin/graduates'
        : user.role === ROLES.ALUMNI_PRESIDENT
          ? '/admin/alumni-registered-list'
        : [ROLES.MIS_STAFF, ROLES.RESEARCH_COORDINATOR].includes(user.role as typeof ROLES.MIS_STAFF | typeof ROLES.RESEARCH_COORDINATOR)
          ? '/admin'
        : ['dean_cs', 'dean_coed', 'dean_hm'].includes(user.role)
          ? '/admin/survey-status'
          : '/admin';
    return <Navigate to={fallbackPath} replace />;
  }

  if (isMaintenanceMode && user?.role !== ROLES.ADMIN) {
    return <MaintenancePage />;
  }

  return <>{children}</>;
}
