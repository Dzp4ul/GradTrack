import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { KeyRound, Mail, RefreshCw, Save, ShieldCheck, UserCircle } from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';
import { useAuth } from '../../contexts/AuthContext';
import MessageBox from '../../components/MessageBox';

interface ProfileForm {
  full_name: string;
  email: string;
  current_password: string;
  new_password: string;
  confirm_password: string;
}

const emptyForm: ProfileForm = {
  full_name: '',
  email: '',
  current_password: '',
  new_password: '',
  confirm_password: '',
};

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  registrar: 'Registrar',
  dean_cs: 'Dean - CS',
  dean_coed: 'Dean - COED',
  dean_hm: 'Dean - HM',
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getInitials(name?: string, fallback?: string) {
  const source = (name || fallback || 'User').trim();
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

export default function AdminProfile() {
  const { user, checkAuth } = useAuth();
  const [formData, setFormData] = useState<ProfileForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [msgBox, setMsgBox] = useState<{
    isOpen: boolean;
    type: 'success' | 'error';
    message: string;
  }>({ isOpen: false, type: 'success', message: '' });

  const roleLabel = user?.role ? roleLabels[user.role] || user.role : 'User';
  const initials = useMemo(
    () => getInitials(user?.full_name, user?.username || user?.email),
    [user?.email, user?.full_name, user?.username]
  );

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      full_name: user?.full_name || '',
      email: user?.email || '',
      current_password: '',
      new_password: '',
      confirm_password: '',
    }));
  }, [user?.email, user?.full_name, user?.username]);

  const updateField = (field: keyof ProfileForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setFormData({
      full_name: user?.full_name || '',
      email: user?.email || '',
      current_password: '',
      new_password: '',
      confirm_password: '',
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const email = formData.email.trim();
    const fullName = formData.full_name.trim();
    const changingPassword = formData.new_password.trim() !== '' || formData.confirm_password.trim() !== '';

    if (!email) {
      setMsgBox({ isOpen: true, type: 'error', message: 'Email is required.' });
      return;
    }

    if (!emailPattern.test(email)) {
      setMsgBox({ isOpen: true, type: 'error', message: 'Please enter a valid email address.' });
      return;
    }

    if (changingPassword) {
      if (!formData.current_password) {
        setMsgBox({ isOpen: true, type: 'error', message: 'Current password is required to set a new password.' });
        return;
      }

      if (formData.new_password.length < 8) {
        setMsgBox({ isOpen: true, type: 'error', message: 'New password must be at least 8 characters.' });
        return;
      }

      if (formData.new_password !== formData.confirm_password) {
        setMsgBox({ isOpen: true, type: 'error', message: 'New password and confirm password do not match.' });
        return;
      }
    }

    setSaving(true);

    try {
      const response = await fetch(API_ENDPOINTS.AUTH.PROFILE, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          full_name: fullName,
          current_password: formData.current_password,
          new_password: changingPassword ? formData.new_password : '',
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to update profile');
      }

      await checkAuth();
      setFormData((prev) => ({
        ...prev,
        current_password: '',
        new_password: '',
        confirm_password: '',
      }));
      setMsgBox({ isOpen: true, type: 'success', message: 'Profile updated successfully.' });
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to update profile',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1b2a4a]">My Profile</h1>
          <p className="text-sm text-gray-500">Manage your account details and password.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="bg-white rounded-lg border p-5 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-900 text-2xl font-bold text-white">
              {initials}
            </div>
            <h2 className="mt-4 text-xl font-bold text-[#1b2a4a]">{user?.full_name || 'User'}</h2>
            <p className="mt-1 text-sm text-gray-500">{user?.email || 'No email available'}</p>
            <span className="mt-3 rounded bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {roleLabel}
            </span>
          </div>

          <div className="mt-6 space-y-3 text-sm text-gray-600">
            <ProfileFact icon={UserCircle} label="Name" value={user?.full_name || '-'} />
            <ProfileFact icon={ShieldCheck} label="Role" value={roleLabel} />
          </div>
        </aside>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="bg-white rounded-lg border p-5 shadow-sm">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-[#1b2a4a]">Account Details</h2>
              <p className="text-sm text-gray-500">Keep your contact information current.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Full Name"
                value={formData.full_name}
                onChange={(value) => updateField('full_name', value)}
                icon={UserCircle}
              />
              <Input
                label="Email"
                value={formData.email}
                onChange={(value) => updateField('email', value)}
                icon={Mail}
                type="email"
                readOnly
                required
              />
            </div>
          </section>

          <section className="bg-white rounded-lg border p-5 shadow-sm">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-[#1b2a4a]">Password</h2>
              <p className="text-sm text-gray-500">Leave these fields blank to keep your current password.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Current Password"
                value={formData.current_password}
                onChange={(value) => updateField('current_password', value)}
                icon={KeyRound}
                type="password"
              />
              <Input
                label="New Password"
                value={formData.new_password}
                onChange={(value) => updateField('new_password', value)}
                icon={KeyRound}
                type="password"
              />
              <Input
                label="Confirm Password"
                value={formData.confirm_password}
                onChange={(value) => updateField('confirm_password', value)}
                icon={KeyRound}
                type="password"
              />
            </div>
          </section>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              Reset
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1b2a4a] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#263c66] disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox({ ...msgBox, isOpen: false })}
        type={msgBox.type}
        message={msgBox.message}
      />
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  icon: Icon,
  type = 'text',
  required = false,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: typeof UserCircle;
  type?: string;
  required?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          readOnly={readOnly}
          className={`w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            readOnly ? 'bg-gray-50 text-gray-600 cursor-not-allowed' : ''
          }`}
        />
      </div>
    </div>
  );
}

function ProfileFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserCircle;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="truncate font-semibold text-gray-800">{value}</p>
      </div>
    </div>
  );
}
