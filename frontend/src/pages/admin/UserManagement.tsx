import { useEffect, useState } from 'react';
import { Plus, Search, Edit2, UserCheck, UserX, X } from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';
import { useAuth } from '../../contexts/AuthContext';
import MessageBox from '../../components/MessageBox';

interface UserAccount {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: number;
  created_at: string;
}

interface UserForm {
  id?: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  password: string;
  is_active: 0 | 1;
}

const emptyForm: UserForm = {
  username: '',
  email: '',
  full_name: '',
  role: 'admin',
  password: '',
  is_active: 1,
};

const roleOptions = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'registrar', label: 'Registrar' },
  { value: 'dean_cs', label: 'Dean - CS' },
  { value: 'dean_coed', label: 'Dean - COED' },
  { value: 'dean_hm', label: 'Dean - HM' },
];

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  registrar: 'Registrar',
  dean_cs: 'Dean - CS',
  dean_coed: 'Dean - COED',
  dean_hm: 'Dean - HM',
};

export default function UserManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [msgBox, setMsgBox] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'confirm';
    message: string;
    onConfirm?: () => void;
  }>({ isOpen: false, type: 'success', message: '' });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      if (roleFilter) params.append('role', roleFilter);
      if (statusFilter) params.append('is_active', statusFilter);

      const response = await fetch(`${API_ENDPOINTS.USERS}?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load users');
      }

      setUsers(data.data || []);
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to load users',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [search, roleFilter, statusFilter]);

  const openAddModal = () => {
    setFormData(emptyForm);
    setIsEditing(false);
    setShowModal(true);
  };

  const openEditModal = (target: UserAccount) => {
    setFormData({
      id: target.id,
      username: target.username,
      email: target.email,
      full_name: target.full_name || '',
      role: target.role,
      password: '',
      is_active: target.is_active === 1 ? 1 : 0,
    });
    setIsEditing(true);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload: Record<string, unknown> = {
        username: formData.username,
        email: formData.email,
        full_name: formData.full_name,
        role: formData.role,
        is_active: formData.is_active,
      };

      if (!isEditing || formData.password.trim() !== '') {
        payload.password = formData.password;
      }

      const response = await fetch(API_ENDPOINTS.USERS, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(isEditing ? { ...payload, id: formData.id } : payload),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save user');
      }

      setShowModal(false);
      await fetchUsers();
      setMsgBox({
        isOpen: true,
        type: 'success',
        message: isEditing ? 'User updated successfully.' : 'User created successfully.',
      });
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to save user',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = (target: UserAccount) => {
    const nextStatus = target.is_active === 1 ? 0 : 1;
    const isSelfSuperAdmin = user?.id === target.id && user?.role === 'super_admin';

    if (isSelfSuperAdmin && nextStatus === 0) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: 'Your logged-in super admin account cannot be deactivated.',
      });
      return;
    }

    setMsgBox({
      isOpen: true,
      type: 'confirm',
      message: `Are you sure you want to ${nextStatus === 1 ? 'activate' : 'deactivate'} this user?`,
      onConfirm: async () => {
        try {
          const response = await fetch(API_ENDPOINTS.USERS, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id: target.id, is_active: nextStatus }),
          });
          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to update user status');
          }

          await fetchUsers();
          setMsgBox({
            isOpen: true,
            type: 'success',
            message: `User ${nextStatus === 1 ? 'activated' : 'deactivated'} successfully.`,
          });
        } catch (error) {
          setMsgBox({
            isOpen: true,
            type: 'error',
            message: error instanceof Error ? error.message : 'Failed to update user status',
          });
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1b2a4a]">User Management</h1>
          <p className="text-sm text-gray-500">Manage Admin, Super Admin, Dean, and Registrar accounts</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex w-full items-center justify-center gap-2 bg-[#1b2a4a] text-white px-4 py-2.5 rounded-lg hover:bg-[#263c66] transition-colors text-sm font-medium sm:w-auto"
        >
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full min-w-0 flex-1 sm:min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, or username..."
            className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-auto"
        >
          <option value="">All Roles</option>
          {roleOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-auto"
        >
          <option value="">All Status</option>
          <option value="1">Active</option>
          <option value="0">Inactive</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="divide-y md:hidden">
          {loading ? (
            <div className="py-10 text-center text-gray-400">Loading...</div>
          ) : users.length === 0 ? (
            <div className="py-10 text-center text-gray-400">No users found</div>
          ) : (
            users.map((account) => {
              const isSelfSuperAdmin = user?.id === account.id && user?.role === 'super_admin';
              const canDeactivate = !(isSelfSuperAdmin && account.is_active === 1);

              return (
                <div key={account.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#1b2a4a]">{account.full_name || '-'}</p>
                      <p className="mt-1 truncate text-sm text-gray-600">{account.email}</p>
                      <p className="mt-1 font-mono text-xs text-gray-500">{account.username}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => openEditModal(account)}
                        className="p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                        title="Edit User"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(account)}
                        disabled={account.is_active === 1 && !canDeactivate}
                        className={`p-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          account.is_active === 1
                            ? 'hover:bg-red-50 text-red-600'
                            : 'hover:bg-green-50 text-green-600'
                        }`}
                        title={account.is_active === 1 ? 'Deactivate User' : 'Activate User'}
                      >
                        {account.is_active === 1 ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded font-medium">
                      {roleLabels[account.role] || account.role}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded font-medium ${account.is_active === 1 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {account.is_active === 1 ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Username</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Role</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">Loading...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">No users found</td></tr>
              ) : (
                users.map((account) => {
                  const isSelfSuperAdmin = user?.id === account.id && user?.role === 'super_admin';
                  const canDeactivate = !(isSelfSuperAdmin && account.is_active === 1);

                  return (
                    <tr key={account.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-[#1b2a4a]">{account.full_name || '-'}</td>
                      <td className="px-4 py-3">{account.email}</td>
                      <td className="px-4 py-3 font-mono text-xs">{account.username}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded font-medium">
                          {roleLabels[account.role] || account.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded font-medium ${account.is_active === 1 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {account.is_active === 1 ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEditModal(account)}
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                            title="Edit User"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(account)}
                            disabled={account.is_active === 1 && !canDeactivate}
                            className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                              account.is_active === 1
                                ? 'hover:bg-red-50 text-red-600'
                                : 'hover:bg-green-50 text-green-600'
                            }`}
                            title={account.is_active === 1 ? 'Deactivate User' : 'Activate User'}
                          >
                            {account.is_active === 1 ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold text-[#1b2a4a]">
                {isEditing ? 'Edit User Account' : 'Add User Account'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4 sm:p-5">
              <Input label="Full Name" value={formData.full_name} onChange={(value) => setFormData({ ...formData, full_name: value })} />
              <Input label="Username" value={formData.username} onChange={(value) => setFormData({ ...formData, username: value })} required />
              <Input label="Email" value={formData.email} onChange={(value) => setFormData({ ...formData, email: value })} type="email" required />

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <Input
                label={isEditing ? 'Password (leave blank to keep current)' : 'Password'}
                value={formData.password}
                onChange={(value) => setFormData({ ...formData, password: value })}
                type="password"
                required={!isEditing}
              />

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  value={String(formData.is_active)}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.value === '1' ? 1 : 0 })}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="1">Active</option>
                  <option value="0">Inactive</option>
                </select>
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 border rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 bg-[#1b2a4a] text-white rounded-lg text-sm font-medium hover:bg-[#263c66] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : isEditing ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox({ ...msgBox, isOpen: false })}
        onConfirm={msgBox.onConfirm}
        type={msgBox.type}
        message={msgBox.message}
      />
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', required = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
