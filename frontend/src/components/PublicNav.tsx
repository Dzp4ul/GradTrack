import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  ClipboardList,
  HelpCircle,
  Home,
  Info,
  KeyRound,
  LogIn,
  ShieldCheck,
  Users,
} from 'lucide-react';
import MobileBottomNav from './MobileBottomNav';
import ThemeToggle from './ThemeToggle';
import { useSystemSettings } from '../contexts/SystemSettingsContext';

type PublicNavProps = {
  active?: 'about' | 'faq' | 'privacy';
};

export default function PublicNav({ active }: PublicNavProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const location = useLocation();
  const { getSetting, isEnabled, resolveAssetUrl } = useSystemSettings();
  const surveyAvailable = isEnabled('survey_available', true);
  const logo = resolveAssetUrl(getSetting('system_logo_path'), '/Gradtrack_small.png');
  const systemShortName = getSetting('system_short_name', 'GradTrack');

  const navItems = [
    { to: '/', label: 'Home', icon: Home, active: location.pathname === '/' && !active },
    { to: '/about', label: 'About', icon: Info, active: location.pathname === '/about' || active === 'about' },
    { to: '/faq', label: 'FAQ', icon: HelpCircle, active: location.pathname === '/faq' || active === 'faq' },
    { to: '/privacy-policy', label: 'Privacy', icon: ShieldCheck, active: location.pathname === '/privacy-policy' || active === 'privacy' },
  ];
  const mobileNavItems = [
    { key: 'home', to: '/', label: 'Home', icon: Home, active: location.pathname === '/' },
    { key: 'about', to: '/about', label: 'About', icon: Info, active: location.pathname === '/about' },
    { key: 'faq', to: '/faq', label: 'FAQ', icon: HelpCircle, active: location.pathname === '/faq' },
    { key: 'privacy', to: '/privacy-policy', label: 'Privacy', icon: ShieldCheck, active: location.pathname === '/privacy-policy' },
    { key: 'portal', to: '/graduate/signin', label: 'Portal', icon: Users, active: location.pathname.startsWith('/graduate') },
  ];

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-3 px-3 py-2 sm:px-6">
        <Link to="/" className="flex min-w-0 shrink items-center gap-2.5 sm:gap-3">
          <img
            src={logo}
            alt={getSetting('institution_name', 'Norzagaray College')}
            className="h-9 w-9 flex-shrink-0 object-contain"
          />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold leading-tight text-gray-900 sm:text-base">{systemShortName}</h1>
            <p className="hidden truncate text-[11px] leading-tight text-gray-500 sm:block">{getSetting('survey_title', 'Graduate Tracer System')}</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Public navigation">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                item.active
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle compact />

          <div className="hidden items-center gap-3 lg:flex">
            {surveyAvailable && (
              <Link
                to="/survey"
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
              >
                <ClipboardList className="h-4 w-4" />
                Take Survey
              </Link>
            )}

            <div
              className="relative"
              onMouseEnter={() => setDropdownOpen(true)}
              onMouseLeave={() => setDropdownOpen(false)}
            >
              <button
                type="button"
                onClick={() => setDropdownOpen((current) => !current)}
                className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-800"
                aria-haspopup="menu"
                aria-expanded={dropdownOpen}
              >
                <Users className="h-4 w-4" />
                Graduate Portal
                <ChevronDown className={`h-4 w-4 transition ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full z-50 w-72 max-w-[calc(100vw-2rem)] pt-2">
                  <div className="rounded-2xl border border-gray-200 bg-white py-2 shadow-xl">
                    <Link
                      to="/graduate/signin"
                      className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50"
                      onClick={() => setDropdownOpen(false)}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                        <LogIn className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-gray-900">Log In</span>
                        <span className="block truncate text-xs text-gray-500">Access your alumni account</span>
                      </span>
                    </Link>
                    <Link
                      to="/graduate/forgot-password"
                      className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 transition hover:bg-gray-50"
                      onClick={() => setDropdownOpen(false)}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                        <KeyRound className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-gray-900">Forgot Password</span>
                        <span className="block truncate text-xs text-gray-500">Reset your credentials</span>
                      </span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
      <MobileBottomNav items={mobileNavItems} ariaLabel="Public mobile navigation" className="lg:hidden" />
      </header>
      <div className="h-[53px]" aria-hidden="true" />
    </>
  );
}
