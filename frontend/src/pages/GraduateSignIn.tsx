import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useGraduateAuth } from '../contexts/GraduateAuthContext';
import MessageBox from '../components/MessageBox';

export default function GraduateSignIn() {
  const navigate = useNavigate();
  const { login } = useGraduateAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msgBox, setMsgBox] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
  }>({
    isOpen: false,
    type: 'info',
    message: '',
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      setMsgBox({
        isOpen: true,
        type: 'warning',
        title: 'Missing Fields',
        message: 'Please enter your email and password.',
      });
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
      setMsgBox({
        isOpen: true,
        type: 'success',
        title: 'Welcome Back',
        message: 'You are now signed in to the Graduate Portal.',
      });
      setTimeout(() => navigate('/graduate/portal'), 900);
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        title: 'Sign In Failed',
        message: error instanceof Error ? error.message : 'Unable to sign in right now.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed relative flex items-center justify-center p-6"
      style={{ backgroundImage: 'url(520382375_1065446909052636_3412465913398569974_n.jpg)' }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/80 to-blue-900/80"></div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-blue-100 relative z-10">
        <div className="flex justify-center mb-5">
          <img src="/GRADTRACK_LOGO1.png" alt="GradTrack Logo" className="h-20 object-contain" />
        </div>

        <h1 className="text-2xl font-bold text-blue-900 text-center">Graduate Portal</h1>
        <p className="text-gray-600 text-center mt-1 mb-6">Sign in to access mentorship and job opportunities.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-2.5 rounded-lg font-semibold transition flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>
            Completed the survey and want to register? You can create an account right after survey submission.
          </p>
          <Link to="/survey" className="inline-block mt-2 text-blue-600 hover:text-blue-700 font-medium">
            Go to Survey
          </Link>
        </div>

        <div className="mt-5 text-center">
          <Link to="/" className="text-sm text-gray-600 hover:text-blue-700">
            ← Back to Home
          </Link>
        </div>
      </div>

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox((prev) => ({ ...prev, isOpen: false }))}
        type={msgBox.type}
        title={msgBox.title}
        message={msgBox.message}
      />
    </div>
  );
}
