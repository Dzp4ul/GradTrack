import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  ClipboardList,
  HelpCircle,
  Home,
  Info,
  KeyRound,
  LogIn,
  Menu,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';

type PublicNavProps = {
  active?: 'about' | 'faq' | 'privacy';
};

export default function PublicNav({ active }: PublicNavProps) {
  const [open, setOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const navItems = [
    { to: '/', label: 'Home', icon: Home, active: !active },
    { to: '/about', label: 'About', icon: Info, active: active === 'about' },
    { to: '/faq', label: 'FAQ', icon: HelpCircle, active: active === 'faq' },
    { to: '/privacy-policy', label: 'Privacy', icon: ShieldCheck, active: active === 'privacy' },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-3" onClick={() => setOpen(false)}>
          <img
            src="/Gradtrack_small.png"
            alt="Norzagaray College"
            className="h-9 w-9 flex-shrink-0 object-contain"
          />
          <div className="hidden sm:block">
            <h1 className="text-base font-bold leading-tight text-gray-900">GradTrack</h1>
            <p className="text-[11px] leading-tight text-gray-500">Graduate Tracer System</p>
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
          <div className="hidden items-center gap-3 md:flex">
            <Link
              to="/survey"
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
            >
              <ClipboardList className="h-4 w-4" />
              Take Survey
            </Link>

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
                        <span className="block font-semibold text-gray-900">Sign In</span>
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

          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 lg:hidden"
            aria-expanded={open}
            aria-label="Toggle navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-200 lg:hidden">
          <div className="grid gap-1 px-4 py-3">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                  item.active ? 'bg-blue-700 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            ))}
            <Link
              to="/survey"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
            >
              <ClipboardList className="h-5 w-5" />
              Take Survey
            </Link>
            <Link
              to="/graduate/signin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl bg-blue-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-800"
            >
              <Users className="h-5 w-5" />
              Graduate Portal
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
