import { useState, useRef } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLightOnlyTheme } from '../contexts/theme';
import { useSystemSettings } from '../contexts/SystemSettingsContext';

function SignIn() {
  useLightOnlyTheme();

  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const { getSetting, resolveAssetUrl, primaryColor } = useSystemSettings();
  const navigate = useNavigate();
  const loginBackground = resolveAssetUrl(getSetting('login_background_image_path'), '/520382375_1065446909052636_3412465913398569974_n.jpg');
  const loginLogo = resolveAssetUrl(getSetting('login_logo_path'), '/GRADTRACK_LOGO1.png');
  const systemLogo = resolveAssetUrl(getSetting('system_logo_path'), '/logo.png');
  const institutionName = getSetting('institution_name', 'Norzagaray College');

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/admin" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const password = passwordRef.current?.value ?? '';

    try {
      const user = await login(email, password);
      if (user.role === 'registrar') {
        navigate('/admin/graduates');
      } else if (user.role === 'alumni_admin') {
        navigate('/admin/forum-moderation');
      } else if (['mis_staff', 'research_coordinator'].includes(user.role)) {
        navigate('/admin');
      } else if (['dean_cs', 'dean_coed', 'dean_hm'].includes(user.role)) {
        navigate('/admin/survey-status');
      } else {
        navigate('/admin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen overflow-x-hidden">
      {/* Left Side - Fixed Branding */}
      <div className="hidden md:flex md:w-1/2 bg-cover bg-center fixed top-0 left-0 h-screen items-center justify-center" style={{ backgroundImage: `url(${loginBackground})` }}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/85 via-blue-800/85 to-blue-900/85"></div>
        <div className="text-center px-12 relative z-10">
          <img
            src={systemLogo}
            alt={institutionName}
            className="h-32 w-32 object-contain mx-auto mb-8"
          />
          <h2 className="text-3xl font-bold text-white mb-4">{institutionName}</h2>
          <p className="text-blue-200 text-lg">{getSetting('login_subtitle', 'Graduate Tracer System')}</p>
          {getSetting('additional_login_text') && (
            <p className="mt-4 text-sm leading-6 text-blue-100">{getSetting('additional_login_text')}</p>
          )}
        </div>
      </div>

      {/* Right Side - Sign In Form */}
      <div className="w-full md:w-1/2 md:ml-[50%] min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-lg">
          <div className="md:hidden mb-8 text-center">
            <img
              src={systemLogo}
              alt={institutionName}
              className="h-16 w-16 object-contain mx-auto"
            />
          </div>

          <div className="flex justify-center mb-6">
            <img
              src={loginLogo}
              alt={`${getSetting('system_short_name', 'GradTrack')} Logo`}
              className="h-20 object-contain"
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-blue-900 text-center mb-2">{getSetting('login_page_title', 'Sign In')}</h1>
          <p className="text-gray-500 text-center mb-8">{getSetting('login_welcome_message', 'Welcome back.')}</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <div className="text-right mt-2">
                <Link to="/admin/forgot-password" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                  Forgot Password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-3 rounded-lg font-semibold transition shadow-md hover:shadow-lg disabled:cursor-not-allowed"
              style={isLoading ? undefined : { backgroundColor: primaryColor }}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}

export default SignIn;
