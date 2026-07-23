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
  MessageSquareMore,
  Menu,
  X,
  LogOut,
  ChevronDown,
  DatabaseBackup,
  User,
  History,
  Mail,
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
  { to: '/admin/auto-reminders', icon: Mail, label: 'Auto Email Reminders' },
  { to: '/admin/audit-trail', icon: History, label: 'Audit Trail' },
  { to: '/admin/backup-database', icon: DatabaseBackup, label: 'Backup Database' },
];

const registrarNavItems: NavItem[] = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/graduates', icon: GraduationCap, label: 'Manage Graduates' },
  { to: '/admin/audit-trail', icon: History, label: 'Audit Trail' },
];

const alumniAdminNavItems: NavItem[] = [
  { to: '/admin/forum-moderation', icon: MessageSquareMore, label: 'Forum Moderation', end: true },
  { to: '/admin/job-approvals', icon: Briefcase, label: 'Job Approval' },
  { to: '/admin/audit-trail', icon: History, label: 'Audit Trail' },
];

const staffNavItems: NavItem[] = [
  { to: '/admin/audit-trail', icon: History, label: 'Audit Trail' },
];

const deanNavItems: NavItem[] = [
  { to: '/admin/survey-status', icon: ClipboardCheck, label: 'Survey Participation' },
  { to: '/admin/audit-trail', icon: History, label: 'Audit Trail' },
];

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  mis_staff: 'MIS Staff',
  research_coordinator: 'Research Coordinator',
  registrar: 'Registrar',
  alumni_admin: 'Alumni Admin',
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
      : user?.role === 'alumni_admin'
      ? alumniAdminNavItems
      : ['mis_staff', 'research_coordinator'].includes(user?.role || '')
        ? staffNavItems
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
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <img src="/Gradtrack_small.png" alt="GradTrack" className="h-9 w-9 object-contain" />
            <div className="hidden sm:block">
              <h1 className="text-base font-bold leading-tight text-gray-900">GradTrack</h1>
              <p className="text-[11px] leading-tight text-gray-500">Admin Panel</p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden items-center gap-0.5 lg:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-700 text-white shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Right Section */}
          <div className="flex items-center gap-3">
            <NotificationBell audience="admin" colorScheme="light" />

            {/* Profile dropdown */}
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2 py-1.5 shadow-sm transition hover:border-gray-300"
                aria-haspopup="menu"
                aria-expanded={profileOpen}
              >
                <div className="h-8 w-8 overflow-hidden rounded-full bg-blue-900 flex items-center justify-center">
                  {profileImageUrl ? (
                    <img src={profileImageUrl} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-white text-xs font-semibold">{userInitials}</span>
                  )}
                </div>
                <div className="hidden min-w-0 flex-1 text-left md:block">
                  <p className="truncate text-sm font-semibold text-gray-800">{user?.full_name || 'User'}</p>
                  <p className="truncate text-xs text-gray-500">{userRoleLabel}</p>
                </div>
                <ChevronDown className={`hidden h-4 w-4 text-gray-500 transition md:block ${profileOpen ? 'rotate-180' : ''}`} />
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border py-2 z-50 sm:w-80">
                  <button
                    type="button"
                    onClick={openProfile}
                    className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-gray-50"
                  >
                    <div className="h-10 w-10 overflow-hidden rounded-full bg-blue-900 flex items-center justify-center">
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
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <User className="w-4 h-4" />
                    My Profile
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Menu Toggle */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 lg:hidden"
              aria-label="Toggle mobile navigation"
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {mobileNavOpen && (
          <div className="border-t border-gray-200 lg:hidden">
            <div className="grid gap-1 px-4 py-3">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileNavOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                      isActive ? 'bg-blue-700 text-white' : 'text-gray-700 hover:bg-gray-100'
                    }`
                  }
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </header>

      <div className="mx-auto max-w-screen-2xl px-4 pt-4 sm:px-6 sm:pt-6">
        {/* Mobile Tab Scroller */}
        <div className="mb-5 flex gap-2 overflow-x-auto rounded-3xl border border-gray-200 bg-white p-2 lg:hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `shrink-0 rounded-2xl px-4 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-700'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>

        {/* Main content */}
        <main className="pb-8">
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
