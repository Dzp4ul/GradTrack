import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

function SignIn() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('admin@norzagaray.edu.ph');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      navigate('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Side - Fixed Branding */}
      <div className="hidden md:flex md:w-1/2 bg-cover bg-center fixed top-0 left-0 h-screen items-center justify-center" style={{ backgroundImage: 'url(520382375_1065446909052636_3412465913398569974_n.jpg)' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/85 via-blue-800/85 to-blue-900/85"></div>
        <div className="text-center px-12 relative z-10">
          <img
            src="/logo.png"
            alt="Norzagaray College"
            className="h-32 w-32 object-contain mx-auto mb-8"
          />
          <h2 className="text-3xl font-bold text-white mb-4">Norzagaray College</h2>
          <p className="text-blue-200 text-lg mb-8">GradTrack Alumni Tracking System</p>
          <Link
            to="/"
            className="inline-block bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white px-8 py-3 rounded-lg font-medium transition border-2 border-white/30"
          >
            Back to Home
          </Link>
        </div>
      </div>

      {/* Right Side - Sign In Form */}
      <div className="w-full md:w-1/2 md:ml-[50%] min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <div className="w-full max-w-lg">
          {/* Mobile back link */}
          <div className="md:hidden mb-8 text-center">
            <img
              src="/logo.png"
              alt="Norzagaray College"
              className="h-16 w-16 object-contain mx-auto mb-4"
            />
            <Link to="/" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
              ← Back to Home
            </Link>
          </div>

          <div className="flex justify-center mb-6">
            <img
              src="Gemini_Generated_Image_pakq4ppakq4ppakq (1).png"
              alt="GradTrack Logo"
              className="h-20 object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-blue-900 text-center mb-2">Sign In</h1>
          <p className="text-gray-500 text-center mb-8">Welcome back.</p>

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
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                <a href="#" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                  Forgot Password?
                </a>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-3 rounded-lg font-semibold transition shadow-md hover:shadow-lg disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-gray-600 mt-6">
            Don't have an account?{' '}
            <Link to="/signup" className="text-blue-600 hover:text-blue-800 font-semibold">
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default SignIn;
