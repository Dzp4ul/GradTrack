import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileText, RefreshCw, RotateCcw, Search, ShieldAlert, X } from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';
import { useAuth } from '../../contexts/AuthContext';

const PAGE_SIZE = 10;

const ROLE_LABELS = {
  admin: 'Admin',
  research_coordinator: 'Research Coordinator',
  registrar: 'Registrar',
  alumni_president: 'Alumni President',
  dean_cs: 'Dean',
  dean_coed: 'Dean',
  dean_hm: 'Dean',
};

const ALLOWED_ROLES = ['admin'];

const ROLE_OPTIONS = [
  ['admin', 'Admin'],
  ['research_coordinator', 'Research Coordinator'],
  ['alumni_president', 'Alumni President'],
  ['dean', 'Dean'],
  ['registrar', 'Registrar'],
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

const ACTION_OPTIONS = [
  'Login',
  'Logout',
  'Create',
  'Update',
  'Delete',
  'Approve',
  'Reject',
  'Import',
  'Export',
  'Generate',
  'Print',
  'Activate',
  'Suspend',
  'Link',
  'Unlink',
];

const MODULE_OPTIONS = [
  'Authentication',
  'User Management',
  'Survey Management',
  'Survey Responses',
  'Graduate Records',
  'Reports',
  'Audit Trail',
  'Job Posting',
  'Community Forum',
  'Alumni Registered List',
  'Announcements',
];

const SENSITIVE_KEY_PATTERN = /password|token|secret|authorization|cookie|session|csrf|otp|passcode|reset|verification|email|phone|mobile|contact|address|birth|student[_\s-]*(id|no|number)|national|ssn|first_name|middle_name|last_name|full_name/i;
const IDENTIFIER_KEY_PATTERN = /(^id$|_id$|^id_|record[_\s-]*id|user[_\s-]*id)/i;

const FIELD_LABELS = {
  account_status: 'Account Status',
  alumni_verification_status: 'Verification Status',
  archived: 'Archived',
  batch_year: 'Batch Year',
  course_code: 'Course',
  is_active: 'Account Status',
  password_changed: 'Password Changed',
  portal_status_changed: 'Portal Status Changed',
  registration_status: 'Registration Status',
  rejection_reason: 'Rejection Reason',
  role: 'Role',
  status: 'Status',
};

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
  if (normalized === 'delete' || normalized === 'reject' || normalized === 'suspend') {
    return 'bg-red-50 text-red-700 border-red-100';
  }
  if (normalized === 'update') return 'bg-amber-50 text-amber-700 border-amber-100';
  if (normalized === 'create' || normalized === 'approve' || normalized === 'activate' || normalized === 'import') {
    return 'bg-green-50 text-green-700 border-green-100';
  }
  if (normalized === 'login' || normalized === 'logout' || normalized === 'export' || normalized === 'generate' || normalized === 'print') {
    return 'bg-blue-50 text-blue-700 border-blue-100';
  }
  return 'bg-gray-50 text-gray-700 border-gray-100';
}

function parsePayload(value) {
  if (!value) return null;
  if (typeof value === 'object') return sanitizePayload(value);

  try {
    return sanitizePayload(JSON.parse(value));
  } catch {
    return sanitizePayload(String(value));
  }
}

function sanitizePayload(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((item) => sanitizePayload(item));
  if (typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, item]) => {
      acc[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : sanitizePayload(item);
      return acc;
    }, {});
  }
  if (typeof value === 'string') {
    return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted email]');
  }
  return value;
}

function hasPayload(value) {
  if (!value) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return String(value).trim() !== '';
}

function humanizeFieldName(value) {
  const key = String(value || '');
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];

  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatReadableValue(value) {
  if (value === null || value === undefined || value === '') return 'Not set';
  if (value === '[redacted]') return 'Hidden for privacy';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((item) => formatReadableValue(item)).join(', ') : 'None';
  }
  if (typeof value === 'object') {
    return Object.values(value).map((item) => formatReadableValue(item)).join(', ');
  }

  const text = String(value);
  if (ROLE_LABELS[text]) return ROLE_LABELS[text];
  if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(text)) {
    return text
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }
  return text;
}

function flattenPayload(payload, prefix = '') {
  if (!hasPayload(payload)) return [];
  if (Array.isArray(payload) || typeof payload !== 'object') {
    return prefix ? [[prefix, payload]] : [];
  }

  return Object.entries(payload).flatMap(([key, value]) => {
    if (IDENTIFIER_KEY_PATTERN.test(key)) return [];

    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return flattenPayload(value, path);
    }
    return [[path, value]];
  });
}

function buildChangeRows(previousValues, newValues) {
  const previousEntries = new Map(flattenPayload(previousValues));
  const newEntries = new Map(flattenPayload(newValues));
  const keys = [...new Set([...previousEntries.keys(), ...newEntries.keys()])];

  return keys.flatMap((key) => {
    const previousValue = previousEntries.get(key);
    const newValue = newEntries.get(key);
    const previousHidden = previousValue === '[redacted]';
    const newHidden = newValue === '[redacted]';
    const bothEmpty = (previousValue === null || previousValue === undefined || previousValue === '')
      && (newValue === null || newValue === undefined || newValue === '');

    if ((previousHidden || previousValue === undefined) && (newHidden || newValue === undefined)) return [];
    if (bothEmpty) return [];

    return [{
      key,
      label: key.split('.').map(humanizeFieldName).join(' / '),
      previousValue: formatReadableValue(previousValue),
      newValue: formatReadableValue(newValue),
    }];
  });
}

function formatAuditDescription(log) {
  const description = String(log?.description || '').trim();
  const recordId = String(log?.record_id || '').trim();
  if (!description || !recordId) return description || '-';

  const escapedRecordId = recordId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return description
    .replace(new RegExp(`\\s+with\\s+(?:record\\s+)?ID\\s*#?${escapedRecordId}\\b`, 'gi'), '')
    .replace(new RegExp(`\\b(record|account|post|posting|survey|announcement|response|report)\\s+(?:ID\\s*)?#?${escapedRecordId}\\b`, 'gi'), '$1')
    .replace(/\s+([.,])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function filenameFromResponse(response) {
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] || `audit_trail_${new Date().toISOString().slice(0, 10)}.csv`;
}

function DetailField({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-gray-800">{value || '-'}</dd>
    </div>
  );
}

function ChangeSummary({ previousValues, newValues }) {
  const changes = buildChangeRows(previousValues, newValues);
  if (changes.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="border-b bg-gray-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-[#1b2a4a]">Changes Made</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="border-b bg-white text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Information</th>
              <th className="px-4 py-2.5 font-semibold">Before</th>
              <th className="px-4 py-2.5 font-semibold">After</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((change) => (
              <tr key={change.key} className="border-b last:border-0">
                <th className="px-4 py-3 text-left font-medium text-gray-700">{change.label}</th>
                <td className="px-4 py-3 text-gray-600">{change.previousValue}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{change.newValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AuditTrail() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: PAGE_SIZE,
    total: 0,
    total_pages: 1,
  });
  const [filters, setFilters] = useState({
    user_role: '',
    department: '',
    action: '',
    module: '',
    start_date: '',
    end_date: '',
  });
  const deferredSearch = useDeferredValue(search);
  const canAccess = user?.role && ALLOWED_ROLES.includes(user.role);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('per_page', String(PAGE_SIZE));
    if (deferredSearch.trim()) params.set('search', deferredSearch.trim());
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [deferredSearch, filters, page]);

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
      const nextPagination = data.pagination || {};
      setPagination({
        page: Number(nextPagination.page) || 1,
        per_page: Number(nextPagination.per_page) || PAGE_SIZE,
        total: Number(nextPagination.total) || 0,
        total_pages: Number(nextPagination.total_pages) || 1,
      });

      if (Number(nextPagination.page) && Number(nextPagination.page) !== page) {
        setPage(Number(nextPagination.page));
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Failed to load audit trail records');
        setLogs([]);
        setPagination({ page: 1, per_page: PAGE_SIZE, total: 0, total_pages: 1 });
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
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearFilters = () => {
    setPage(1);
    setSearch('');
    setFilters({ user_role: '', department: '', action: '', module: '', start_date: '', end_date: '' });
  };

  const handleSearchChange = (value) => {
    setPage(1);
    setSearch(value);
  };

  const handleExport = async () => {
    if (!canAccess) return;
    setExporting(true);
    setError('');

    try {
      const params = new URLSearchParams(queryString);
      params.delete('page');
      params.delete('per_page');
      params.set('export', 'csv');

      const response = await fetch(`${API_ENDPOINTS.AUDIT_TRAIL}?${params.toString()}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to export audit trail records');
        }
        throw new Error('Failed to export audit trail records');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filenameFromResponse(response);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export audit trail records');
    } finally {
      setExporting(false);
    }
  };

  const currentPage = pagination.page || page;
  const totalPages = Math.max(1, pagination.total_pages || 1);
  const totalRecords = pagination.total || 0;
  const firstRecord = totalRecords === 0 ? 0 : ((currentPage - 1) * PAGE_SIZE) + 1;
  const lastRecord = totalRecords === 0 ? 0 : Math.min(totalRecords, firstRecord + logs.length - 1);

  const selectedPreviousValues = parsePayload(selectedLog?.previous_values);
  const selectedNewValues = parsePayload(selectedLog?.new_values);

  if (!canAccess) {
    return (
      <div className="rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold text-[#1b2a4a]">Unauthorized Access</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-gray-600">
          You do not have permission to view audit trail records.
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
            Read-only administrative activity logs filtered according to your account role.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleExport}
            disabled={loading || exporting}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white px-4 py-2.5 text-sm font-medium text-blue-900 transition-colors hover:bg-blue-50 disabled:opacity-50 sm:w-auto"
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting...' : 'Export'}
          </button>
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
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[minmax(230px,1.4fr)_repeat(6,minmax(130px,1fr))_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search audit logs..."
              className="w-full rounded-lg border px-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={filters.user_role}
            onChange={(event) => updateFilter('user_role', event.target.value)}
            className="rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Role"
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
            aria-label="Department"
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
            aria-label="Action"
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
            aria-label="Module"
          >
            <option value="">All Modules</option>
            {MODULE_OPTIONS.map((module) => (
              <option key={module} value={module}>{module}</option>
            ))}
          </select>

          <input
            type="date"
            value={filters.start_date}
            onChange={(event) => updateFilter('start_date', event.target.value)}
            className="rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Start Date"
            title="Start Date"
          />

          <input
            type="date"
            value={filters.end_date}
            onChange={(event) => updateFilter('end_date', event.target.value)}
            className="rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="End Date"
            title="End Date"
          />

          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <RotateCcw className="h-4 w-4" />
            Clear Filters
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
            {totalRecords} record{totalRecords === 1 ? '' : 's'}
          </div>
          {loading && <span className="text-xs text-gray-500">Loading latest logs...</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="border-b bg-white">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Date and Time</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Actor</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Role</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Department</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Action</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Module</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Description</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Details</th>
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
                    <td className="px-4 py-3">{log.role_label || ROLE_LABELS[log.user_role] || log.user_role || '-'}</td>
                    <td className="px-4 py-3">{log.department || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(log.action)}`}>
                        {log.action || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">{log.module || '-'}</td>
                    <td className="max-w-md px-4 py-3 text-gray-700">{formatAuditDescription(log)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedLog(log)}
                        className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold text-blue-900 transition-colors hover:bg-blue-50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">
            Showing {firstRecord}-{lastRecord} of {totalRecords}
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={loading || currentPage <= 1}
              className="rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="min-w-[6rem] text-center text-sm font-semibold text-[#1b2a4a]">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={loading || currentPage >= totalPages}
              className="rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="absolute inset-0" onClick={() => setSelectedLog(null)} />
          <section className="relative w-full max-w-3xl overflow-hidden rounded-xl border bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b bg-gray-50 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-[#1b2a4a]">Audit Details</h2>
                <p className="text-xs text-gray-500">Administrative activity information</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100"
                aria-label="Close audit details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[78vh] space-y-5 overflow-y-auto p-5">
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <DetailField label="Actor Name" value={selectedLog.user_name || '-'} />
                <DetailField label="Role" value={selectedLog.role_label || ROLE_LABELS[selectedLog.user_role] || selectedLog.user_role || '-'} />
                <DetailField label="Department" value={selectedLog.department || '-'} />
                <DetailField label="Date and Time" value={formatDateTime(selectedLog.created_at)} />
                <DetailField label="Action" value={selectedLog.action || '-'} />
                <DetailField label="Module" value={selectedLog.module || '-'} />
              </dl>

              <div className="rounded-lg border bg-white p-3">
                <h3 className="text-sm font-semibold text-[#1b2a4a]">Description</h3>
                <p className="mt-2 text-sm text-gray-700">{formatAuditDescription(selectedLog)}</p>
              </div>

              <ChangeSummary
                previousValues={selectedPreviousValues}
                newValues={selectedNewValues}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
