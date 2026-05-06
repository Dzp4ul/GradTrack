import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { FileText, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';
import { useAuth } from '../../contexts/AuthContext';

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  mis_staff: 'MIS Staff',
  research_coordinator: 'Research Coordinator',
  registrar: 'Registrar',
  dean_cs: 'Dean-CCS',
  dean_coed: 'Dean - COED',
  dean_hm: 'Dean - HM',
  graduate: 'Graduate',
  guest: 'Guest',
};

const ALLOWED_ROLES = ['super_admin', 'mis_staff', 'research_coordinator', 'registrar', 'dean_cs', 'dean_coed', 'dean_hm'];

const ROLE_OPTIONS = [
  ['super_admin', 'Super Admin'],
  ['mis_staff', 'MIS Staff'],
  ['research_coordinator', 'Research Coordinator'],
  ['registrar', 'Registrar'],
  ['dean_cs', 'Dean-CCS'],
  ['dean_coed', 'Dean - COED'],
  ['dean_hm', 'Dean - HM'],
  ['graduate', 'Graduate'],
];

const DEPARTMENT_OPTIONS = [
  ['CCS', 'CCS'],
  ['COED', 'COED'],
  ['HM', 'HM'],
  ['BSCS', 'BSCS'],
  ['ACT', 'ACT'],
  ['BSED', 'BSED'],
  ['BEED', 'BEED'],
  ['BSHM', 'BSHM'],
];

const ACTION_OPTIONS = ['Login', 'Logout', 'Create', 'Update', 'Delete', 'Submit', 'Generate', 'Export'];

const MODULE_OPTIONS = [
  'Authentication',
  'User Management',
  'Survey Management',
  'Survey Responses',
  'Graduate Records',
  'Reports',
  'Job Posting',
  'Community Forum',
];

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function badgeClass(action) {
  const normalized = String(action || '').toLowerCase();
  if (normalized === 'delete') return 'bg-red-50 text-red-700 border-red-100';
  if (normalized === 'update') return 'bg-amber-50 text-amber-700 border-amber-100';
  if (normalized === 'create' || normalized === 'submit') return 'bg-green-50 text-green-700 border-green-100';
  if (normalized === 'login' || normalized === 'logout') return 'bg-blue-50 text-blue-700 border-blue-100';
  return 'bg-gray-50 text-gray-700 border-gray-100';
}

export default function AuditTrail() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    user_role: '',
    department: '',
    action: '',
    module: '',
    date: '',
  });
  const deferredSearch = useDeferredValue(search);
  const canAccess = user?.role && ALLOWED_ROLES.includes(user.role);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (deferredSearch.trim()) params.set('search', deferredSearch.trim());
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [deferredSearch, filters]);

  const fetchLogs = async (signal) => {
    if (!canAccess) return;

    setLoading(true);
    setError('');

    try {
      const endpoint = queryString
        ? `${API_ENDPOINTS.AUDIT_TRAIL}?${queryString}`
        : API_ENDPOINTS.AUDIT_TRAIL;
      const response = await fetch(endpoint, {
        credentials: 'include',
        signal,
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load audit trail records');
      }

      setLogs(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Failed to load audit trail records');
        setLogs([]);
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchLogs(controller.signal);
    return () => controller.abort();
  }, [canAccess, queryString]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearFilters = () => {
    setSearch('');
    setFilters({ user_role: '', department: '', action: '', module: '', date: '' });
  };

  if (!canAccess) {
    return (
      <div className="rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold text-[#1b2a4a]">Unauthorized Access</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-gray-600">
          You do not have permission to view audit trail records. Graduates and unauthorized roles cannot access this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1b2a4a]">Audit Trail</h1>
          <p className="text-sm text-gray-500">
            Read-only system activity logs filtered according to your account role.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchLogs()}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white px-4 py-2.5 text-sm font-medium text-blue-900 transition-colors hover:bg-blue-50 disabled:opacity-50 sm:w-auto"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_repeat(5,minmax(145px,1fr))_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search audit logs..."
              className="w-full rounded-lg border px-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={filters.user_role}
            onChange={(event) => updateFilter('user_role', event.target.value)}
            className="rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Roles</option>
            {ROLE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <select
            value={filters.department}
            onChange={(event) => updateFilter('department', event.target.value)}
            className="rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Departments</option>
            {DEPARTMENT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <select
            value={filters.action}
            onChange={(event) => updateFilter('action', event.target.value)}
            className="rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Actions</option>
            {ACTION_OPTIONS.map((action) => (
              <option key={action} value={action}>{action}</option>
            ))}
          </select>

          <select
            value={filters.module}
            onChange={(event) => updateFilter('module', event.target.value)}
            className="rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Modules</option>
            {MODULE_OPTIONS.map((module) => (
              <option key={module} value={module}>{module}</option>
            ))}
          </select>

          <input
            type="date"
            value={filters.date}
            onChange={(event) => updateFilter('date', event.target.value)}
            className="rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg border px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1b2a4a]">
            <FileText className="h-4 w-4" />
            {logs.length} record{logs.length === 1 ? '' : 's'}
          </div>
          {loading && <span className="text-xs text-gray-500">Loading latest logs...</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="border-b bg-white">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Date and Time</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">User Name</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Role</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Department</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Action</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Module</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Description</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">IP Address</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    Loading audit trail records...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    No audit trail records found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.audit_id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatDateTime(log.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-[#1b2a4a]">{log.user_name || '-'}</td>
                    <td className="px-4 py-3">{ROLE_LABELS[log.user_role] || log.user_role || '-'}</td>
                    <td className="px-4 py-3">{log.department || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(log.action)}`}>
                        {log.action || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">{log.module || '-'}</td>
                    <td className="max-w-md px-4 py-3 text-gray-700">{log.description || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">{log.ip_address || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
