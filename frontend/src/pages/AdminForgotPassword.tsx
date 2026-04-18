import { FormEvent, useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import MessageBox from '../components/MessageBox';
import { API_ENDPOINTS } from '../config/api';

type ForgotPasswordStep = 'request_otp' | 'verify_otp' | 'reset_password';

interface ForgotPasswordForm {
  email: string;
  otp: string;
  newPassword: string;
  confirmPassword: string;
}

const defaultForm: ForgotPasswordForm = {
  email: '',
  otp: '',
  newPassword: '',
  confirmPassword: '',
};

export default function AdminForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<ForgotPasswordStep>('request_otp');
  const [form, setForm] = useState<ForgotPasswordForm>(defaultForm);
  const [resetToken, setResetToken] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

  const handleChange = (field: keyof ForgotPasswordForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const sendOtp = async () => {
    if (!form.email.trim()) {
      setMsgBox({
        isOpen: true,
        type: 'warning',
        title: 'Email Required',
        message: 'Please enter your email address first.',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'send_otp',
          email: form.email.trim(),
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Unable to send OTP right now.');
      }

      setMsgBox({
        isOpen: true,
        type: 'success',
        title: 'OTP Sent',
        message: 'If your email is registered, we sent a 6-digit OTP code.',
      });

      setStep('verify_otp');
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        title: 'Failed to Send OTP',
        message: error instanceof Error ? error.message : 'Unable to send OTP right now.',
      });
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!form.otp.trim()) {
      setMsgBox({
        isOpen: true,
        type: 'warning',
        title: 'OTP Required',
        message: 'Please enter the OTP from your email.',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'verify_otp',
          email: form.email.trim(),
          otp: form.otp.trim(),
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success || !result.data?.reset_token) {
        throw new Error(result.error || 'OTP verification failed.');
      }

      setResetToken(result.data.reset_token as string);
      setStep('reset_password');
      setMsgBox({
        isOpen: true,
        type: 'success',
        title: 'OTP Verified',
        message: 'Verification successful. You can now set your new password.',
      });
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        title: 'Invalid OTP',
        message: error instanceof Error ? error.message : 'OTP verification failed.',
      });
    } finally {
      setLoading(false);
    }
  };

  const submitNewPassword = async () => {
    if (!form.newPassword || !form.confirmPassword) {
      setMsgBox({
        isOpen: true,
        type: 'warning',
        title: 'Missing Password',
        message: 'Please enter and confirm your new password.',
      });
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setMsgBox({
        isOpen: true,
        type: 'warning',
        title: 'Password Mismatch',
        message: 'New password and confirm password do not match.',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'reset_password',
          email: form.email.trim(),
          reset_token: resetToken,
          new_password: form.newPassword,
          confirm_password: form.confirmPassword,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Unable to reset password right now.');
      }

      setMsgBox({
        isOpen: true,
        type: 'success',
        title: 'Password Reset Successful',
        message: 'Your password has been changed. Redirecting to Admin Sign In...',
      });

      setTimeout(() => {
        navigate('/admin/signin');
      }, 1200);
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        title: 'Reset Failed',
        message: error instanceof Error ? error.message : 'Unable to reset password right now.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (step === 'request_otp') {
      await sendOtp();
      return;
    }

    if (step === 'verify_otp') {
      await verifyOtp();
      return;
    }

    await submitNewPassword();
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed relative flex items-center justify-center p-4 sm:p-6"
      style={{ backgroundImage: 'url(/520382375_1065446909052636_3412465913398569974_n.jpg)' }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/80 to-blue-900/80"></div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5 border border-blue-100 relative z-10 sm:p-8">
        <div className="flex justify-center mb-5">
          <img src="/GRADTRACK_LOGO1.png" alt="GradTrack Logo" className="h-20 object-contain" />
        </div>

        <h1 className="text-2xl font-bold text-blue-900 text-center">Admin Forgot Password</h1>
        <p className="text-gray-600 text-center mt-1 mb-6">
          {step === 'request_otp' && 'Enter your admin email to receive a one-time password (OTP).'}
          {step === 'verify_otp' && 'Enter the OTP sent to your email to continue.'}
          {step === 'reset_password' && 'OTP verified. Set your new password below.'}
        </p>

        <div className="mb-5 flex items-center justify-between text-xs text-gray-500">
          <span className={step === 'request_otp' ? 'font-semibold text-blue-700' : ''}>1. Send OTP</span>
          <span className={step === 'verify_otp' ? 'font-semibold text-blue-700' : ''}>2. Verify OTP</span>
          <span className={step === 'reset_password' ? 'font-semibold text-blue-700' : ''}>3. Change Password</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Admin Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
              autoComplete="email"
              disabled={step !== 'request_otp'}
              required
            />
          </div>

          {step === 'verify_otp' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">OTP Code</label>
              <input
                type="text"
                value={form.otp}
                onChange={(e) => handleChange('otp', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter 6-digit OTP"
                maxLength={6}
                inputMode="numeric"
                required
              />
              <button
                type="button"
                onClick={sendOtp}
                disabled={loading}
                className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400"
              >
                Resend OTP
              </button>
            </div>
          )}

          {step === 'reset_password' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={form.newPassword}
                    onChange={(e) => handleChange('newPassword', e.target.value)}
                    className="w-full px-4 py-2.5 pr-11 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter a strong password"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-blue-600 focus:outline-none"
                    aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={form.confirmPassword}
                    onChange={(e) => handleChange('confirmPassword', e.target.value)}
                    className="w-full px-4 py-2.5 pr-11 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Re-enter your new password"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-blue-600 focus:outline-none"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-500">
                Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.
              </p>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-2.5 rounded-lg font-semibold transition flex items-center justify-center gap-2"
          >
            <KeyRound className="w-4 h-4" />
            {step === 'request_otp' && (loading ? 'Sending OTP...' : 'Send OTP')}
            {step === 'verify_otp' && (loading ? 'Verifying OTP...' : 'Verify OTP')}
            {step === 'reset_password' && (loading ? 'Resetting Password...' : 'Reset Password')}
          </button>
        </form>

        <div className="mt-5 text-center">
          <Link to="/admin/signin" className="text-sm text-gray-600 hover:text-blue-700">
            ← Back to Admin Sign In
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
