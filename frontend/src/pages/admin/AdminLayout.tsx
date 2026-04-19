import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  GraduationCap,
  Briefcase,
  ClipboardCheck,
  ClipboardList,
  BarChart3,
  Users,
  Menu,
  X,
  LogOut,
  ChevronDown,
  DatabaseBackup,
  User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL } from '../../config/api';
import MessageBox from '../../components/MessageBox';
import NotificationBell from '../../components/NotificationBell';

type NavItem = {
  to: string;
  icon: LucideIcon;
  label: string;
  end?: boolean;
};

const adminNavItems: NavItem[] = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/graduates', icon: GraduationCap, label: 'Graduates' },
  { to: '/admin/surveys', icon: ClipboardList, label: 'Survey Management' },
  { to: '/admin/reports', icon: BarChart3, label: 'Reports & Analytics' },
];

const superAdminNavItems: NavItem[] = [
  { to: '/admin/user-management', icon: Users, label: 'User Management' },
  { to: '/admin/backup-database', icon: DatabaseBackup, label: 'Backup Database' },
];

const registrarNavItems: NavItem[] = [
  { to: '/admin/graduates', icon: GraduationCap, label: 'Manage Graduates' },
];

const deanNavItems: NavItem[] = [
  { to: '/admin/survey-status', icon: ClipboardCheck, label: 'Survey Participation' },
  { to: '/admin/mentor-approvals', icon: Users, label: 'Mentor Approval' },
  { to: '/admin/job-approvals', icon: Briefcase, label: 'Job Approval' },
];

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  registrar: 'Registrar',
  dean_cs: 'Dean-CCS',
  dean_coed: 'Dean - COED',
  dean_hm: 'Dean - HM',
};

function getInitials(name?: string, fallback?: string) {
  const source = (name || fallback || 'User').trim();
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= 1024
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [msgBox, setMsgBox] = useState<{
    isOpen: boolean;
    type: 'confirm';
    title?: string;
    message: string;
    confirmText?: string;
    onConfirm?: () => void;
  }>({ isOpen: false, type: 'confirm', message: '' });
  const navItems =
    user?.role === 'super_admin'
      ? superAdminNavItems
      : user?.role === 'registrar'
      ? registrarNavItems
      : ['dean_cs', 'dean_coed', 'dean_hm'].includes(user?.role || '')
        ? deanNavItems
        : adminNavItems;
  const userInitials = useMemo(
    () => getInitials(user?.full_name, user?.username || user?.email),
    [user?.email, user?.full_name, user?.username]
  );
  const userRoleLabel = user?.role ? roleLabels[user.role] || user.role : 'User';
  const profileImageUrl = useMemo(() => {
    const path = user?.profile_image_path;
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;
  }, [user?.profile_image_path]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Logout Confirmation',
      message: 'Are you sure you want to do logout?',
      confirmText: 'Logout',
      onConfirm: async () => {
        await logout();
        navigate('/signin');
      }
    });
  };

  const openProfile = () => {
    setProfileOpen(false);
    navigate('/admin/profile');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex overflow-x-hidden">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 bg-blue-900 text-white transition-all duration-300 flex w-72 max-w-[calc(100vw-2rem)] flex-col lg:max-w-none ${
          sidebarOpen ? 'translate-x-0 lg:w-64' : '-translate-x-full lg:translate-x-0 lg:w-20'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 px-4 py-3 border-b border-white/10">
          {sidebarOpen ? (
            <img src="/Gradtrack_Logo2.png" alt="Logo" className="object-contain flex-shrink-0" />
          ) : (
            <img src="/Gradtrack_small.png" alt="Logo" className="h-12 w-12 object-contain flex-shrink-0" />
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-yellow-500 text-blue-900 font-semibold'
                    : 'text-blue-100 hover:bg-blue-800'
                }`
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span className="text-sm">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-4 border-t border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label="Close sidebar"
        />
      )}

      {/* Main content */}
      <div className={`flex-1 min-w-0 transition-all duration-300 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}`}>
        {/* Top bar */}
        <header className="bg-white shadow-sm sticky top-0 z-20 border-b-4 border-yellow-500">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-gray-100 lg:hidden"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex-1" />

            <div className="flex items-center gap-4">
              <NotificationBell audience="admin" colorScheme="light" />

              {/* Profile dropdown */}
              <div className="relative" ref={profileMenuRef}>
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 rounded-lg p-2 text-left hover:bg-gray-100 transition-colors sm:min-w-[210px]"
                  aria-haspopup="menu"
                  aria-expanded={profileOpen}
                >
                  <div className="w-8 h-8 overflow-hidden rounded-full bg-blue-900 flex items-center justify-center">
                    {profileImageUrl ? (
                      <img src={profileImageUrl} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-white text-sm font-semibold">{userInitials}</span>
                    )}
                  </div>
                  <div className="hidden min-w-0 flex-1 leading-tight sm:block">
                    <p className="truncate text-sm font-semibold text-gray-800">{user?.full_name || 'User'}</p>
                    <p className="truncate text-xs text-gray-500">{userRoleLabel}</p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
                </button>

                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-lg border py-2 z-50 sm:w-80">
                    <button
                      type="button"
                      onClick={openProfile}
                      className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-gray-50"
                    >
                      <div className="w-10 h-10 overflow-hidden rounded-full bg-blue-900 flex items-center justify-center">
                        {profileImageUrl ? (
                          <img src={profileImageUrl} alt="Profile" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-white text-sm font-semibold">{userInitials}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-800">{user?.full_name || 'User'}</p>
                        <p className="truncate text-xs text-gray-500">{user?.email || 'No email available'}</p>
                        <p className="text-xs text-gray-500">{userRoleLabel}</p>
                      </div>
                    </button>
                    <button
                      onClick={openProfile}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <User className="w-4 h-4" />
                      My Profile
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox({ ...msgBox, isOpen: false })}
        onConfirm={msgBox.onConfirm}
        type={msgBox.type}
        title={msgBox.title}
        message={msgBox.message}
        confirmText={msgBox.confirmText}
      />
    </div>
  );
}
