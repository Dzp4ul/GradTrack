import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  MessageSquareMore,
  RotateCcw,
  Search,
  XCircle,
} from 'lucide-react';
import { API_BASE_URL, API_ENDPOINTS } from '../../config/api';
import MessageBox from '../../components/MessageBox';

type ReportStatus = 'pending' | 'resolved' | 'dismissed';
type ReportTab = ReportStatus | 'all';
type ReportType = 'post' | 'comment';
type ModerationAction = 'hide' | 'restore' | 'resolve' | 'dismiss';

interface ForumMedia {
  id: number;
  post_id: number;
  media_type: 'image' | 'video';
  file_path: string;
  original_name?: string | null;
  mime_type?: string | null;
}

interface ReportDetail {
  id: number;
  reporter_graduate_id: number;
  reporter_name: string;
  reason?: string | null;
  description?: string | null;
  status: ReportStatus;
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by_name?: string | null;
}

interface ModerationItem {
  report_id: number;
  target_type: ReportType;
  target_id: number;
  post_id: number;
  comment_id?: number | null;
  report_status: ReportStatus;
  report_count: number;
  first_reported_at: string;
  last_reported_at: string;
  reviewed_at?: string | null;
  post_title: string;
  post_content: string;
  post_category: string;
  post_status: 'approved' | 'hidden';
  comment_content?: string | null;
  comment_status?: 'approved' | 'hidden' | null;
  content_status: 'approved' | 'hidden';
  content: string;
  author_name: string;
  author_program_code?: string | null;
  author_program_name?: string | null;
  media?: ForumMedia[];
  reports: ReportDetail[];
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const EMPTY_SUMMARY: Record<ReportTab, number> = {
  pending: 0,
  resolved: 0,
  dismissed: 0,
  all: 0,
};

const tabs: Array<{ value: ReportTab; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];

function resolveAssetUrl(path?: string | null) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusClasses(status: ReportStatus) {
  if (status === 'resolved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'dismissed') return 'border-gray-200 bg-gray-100 text-gray-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

export default function ForumModeration() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [reasons, setReasons] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ReportTab>('pending');
  const [type, setType] = useState<'all' | ReportType>('all');
  const [reason, setReason] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 10, pages: 1 });
  const [expandedKey, setExpandedKey] = useState('');
  const [actionKey, setActionKey] = useState('');
  const [msgBox, setMsgBox] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'confirm';
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  }>({ isOpen: false, type: 'success', message: '' });

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status,
        page: String(page),
        limit: String(limit),
      });
      if (search.trim()) params.set('search', search.trim());
      if (type !== 'all') params.set('type', type);
      if (reason !== 'all') params.set('reason', reason);

      const response = await fetch(`${API_ENDPOINTS.FORUM.MODERATION}?${params.toString()}`, {
        credentials: 'include',
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || 'Unable to load forum reports');
      }

      setItems(Array.isArray(result.data) ? result.data : []);
      setSummary({ ...EMPTY_SUMMARY, ...(result.summary || {}) });
      setReasons(Array.isArray(result.filters?.reasons) ? result.filters.reasons : []);
      setPagination(result.pagination || { total: 0, page, limit, pages: 1 });
    } catch (error) {
      setItems([]);
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to load forum reports',
      });
    } finally {
      setLoading(false);
    }
  }, [limit, page, reason, search, status, type]);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  const performAction = async (item: ModerationItem, action: ModerationAction) => {
    setActionKey(`${action}-${item.report_id}`);
    try {
      const response = await fetch(API_ENDPOINTS.FORUM.MODERATION, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: item.report_id, action }),
      });
      const result = await response.json();
      if (!response.ok || result.success === false) {
        throw new Error(result.error || 'Unable to update this forum report');
      }

      setItems((current) => current.filter((entry) => entry.report_id !== item.report_id));
      await fetchReports();
      setMsgBox({
        isOpen: true,
        type: 'success',
        message: result.message || 'Forum report updated successfully.',
      });
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to update this forum report',
      });
    } finally {
      setActionKey('');
    }
  };

  const confirmAction = (item: ModerationItem, action: ModerationAction) => {
    const contentLabel = item.target_type === 'comment' ? 'comment' : 'post';
    const copy: Record<ModerationAction, { title: string; message: string; confirm: string }> = {
      hide: {
        title: 'Hide Reported Content?',
        message: `This ${contentLabel} will be removed from public view. Its record and related discussion history will be preserved, and pending reports will be resolved.`,
        confirm: 'Hide Content',
      },
      restore: {
        title: 'Restore Content?',
        message: `This ${contentLabel} will return to public view. Existing report history will remain preserved.`,
        confirm: 'Restore Content',
      },
      resolve: {
        title: 'Resolve Report?',
        message: 'The report will be marked resolved. The content visibility will not otherwise change.',
        confirm: 'Resolve',
      },
      dismiss: {
        title: 'Dismiss Report?',
        message: 'The report will be marked dismissed and the content will remain visible.',
        confirm: 'Dismiss',
      },
    };
    const selected = copy[action];
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: selected.title,
      message: selected.message,
      confirmText: selected.confirm,
      cancelText: 'Cancel',
      onConfirm: () => void performAction(item, action),
    });
  };

  const noFilters = !search.trim() && type === 'all' && reason === 'all';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1b2a4a]">Forum Moderation</h1>
          <p className="text-sm text-gray-500">Review reported discussions, comments, and community content.</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {summary.pending} pending report{summary.pending === 1 ? '' : 's'}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Pending Reports" value={summary.pending} tone="border-amber-200 bg-amber-50 text-amber-800" />
        <SummaryCard label="Resolved Reports" value={summary.resolved} tone="border-emerald-200 bg-emerald-50 text-emerald-800" />
        <SummaryCard label="Dismissed Reports" value={summary.dismissed} tone="border-gray-200 bg-gray-100 text-gray-700" />
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_220px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              className="w-full rounded-lg border px-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search content, author, reporter, or reason"
            />
          </div>
          <select
            value={type}
            onChange={(event) => { setType(event.target.value as 'all' | ReportType); setPage(1); }}
            className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Report Types</option>
            <option value="post">Posts</option>
            <option value="comment">Comments</option>
          </select>
          <select
            value={reason}
            onChange={(event) => { setReason(event.target.value); setPage(1); }}
            className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Report Reasons</option>
            {reasons.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>

        <nav aria-label="Forum report status filters" className="mt-4 flex flex-wrap gap-2 border-t pt-4">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => { setStatus(tab.value); setPage(1); }}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                status === tab.value
                  ? 'border-blue-700 bg-blue-700 text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
              <span className={`rounded-full px-2 py-0.5 text-xs ${status === tab.value ? 'bg-white/15' : 'bg-gray-100'}`}>
                {summary[tab.value]}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border bg-white p-10 text-sm text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading forum reports...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center text-sm text-gray-500">
          {status === 'pending' && noFilters
            ? 'No reported forum content requires review.'
            : 'No forum reports match the current filters.'}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const key = `${item.target_type}-${item.target_id}-${item.report_status}`;
            const expanded = expandedKey === key;
            return (
              <article key={key} className="overflow-hidden rounded-xl border bg-white shadow-sm">
                <div className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold capitalize text-blue-700">
                          {item.target_type} report
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusClasses(item.report_status)}`}>
                          {item.report_status}
                        </span>
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          {item.report_count} report{item.report_count === 1 ? '' : 's'}
                        </span>
                        {item.content_status === 'hidden' && (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                            Hidden
                          </span>
                        )}
                      </div>
                      <h2 className="mt-3 truncate text-lg font-bold text-[#1b2a4a]">
                        {item.target_type === 'comment' ? `Comment on “${item.post_title}”` : item.post_title}
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">
                        {item.author_name || 'Graduate'}
                        {item.author_program_code ? ` · ${item.author_program_code}` : ''}
                        {' · '}Last reported {formatDateTime(item.last_reported_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedKey(expanded ? '' : key)}
                        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <Eye className="h-4 w-4" />
                        {expanded ? 'Hide Details' : 'View Content'}
                      </button>
                      {item.content_status === 'hidden' ? (
                        <ActionButton
                          label="Restore Content"
                          icon={<RotateCcw className="h-4 w-4" />}
                          loading={actionKey === `restore-${item.report_id}`}
                          disabled={actionKey !== ''}
                          onClick={() => confirmAction(item, 'restore')}
                          className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        />
                      ) : (
                        <ActionButton
                          label="Hide Content"
                          icon={<EyeOff className="h-4 w-4" />}
                          loading={actionKey === `hide-${item.report_id}`}
                          disabled={actionKey !== ''}
                          onClick={() => confirmAction(item, 'hide')}
                          className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        />
                      )}
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="whitespace-pre-line text-sm leading-6 text-slate-700">
                      {item.content || 'Content is no longer available.'}
                    </p>
                  </div>

                  {expanded && (
                    <div className="mt-4 space-y-4 border-t pt-4">
                      {item.target_type === 'comment' && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Parent Post</p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">{item.post_title}</p>
                          <p className="mt-2 whitespace-pre-line text-sm text-gray-600">{item.post_content}</p>
                        </div>
                      )}

                      {Array.isArray(item.media) && item.media.length > 0 && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {item.media.map((media) => (
                            <div key={media.id || media.file_path} className="overflow-hidden rounded-lg border bg-gray-50">
                              {media.media_type === 'video' || media.mime_type?.startsWith('video/') ? (
                                <video src={resolveAssetUrl(media.file_path)} controls preload="metadata" className="aspect-video w-full bg-black object-contain" />
                              ) : (
                                <img src={resolveAssetUrl(media.file_path)} alt={media.original_name || 'Forum attachment'} className="aspect-video w-full object-contain" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div>
                        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900">
                          <MessageSquareMore className="h-4 w-4" />
                          Report Details
                        </h3>
                        <div className="mt-3 space-y-2">
                          {item.reports.map((report) => (
                            <div key={report.id} className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold text-gray-900">{report.reporter_name || 'Graduate'}</p>
                                <p className="text-xs text-gray-500">{formatDateTime(report.created_at)}</p>
                              </div>
                              <p className="mt-2 font-medium text-amber-800">{report.reason || 'Other'}</p>
                              {report.description && <p className="mt-1 whitespace-pre-line text-gray-700">{report.description}</p>}
                              {report.reviewed_by_name && (
                                <p className="mt-2 text-xs text-gray-500">
                                  Reviewed by {report.reviewed_by_name} · {formatDateTime(report.reviewed_at)}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {item.report_status === 'pending' && (
                  <div className="flex flex-wrap gap-2 border-t bg-gray-50 px-5 py-4">
                    <ActionButton
                      label="Resolve Report"
                      icon={<CheckCircle2 className="h-4 w-4" />}
                      loading={actionKey === `resolve-${item.report_id}`}
                      disabled={actionKey !== ''}
                      onClick={() => confirmAction(item, 'resolve')}
                      className="border-emerald-200 bg-emerald-600 text-white hover:bg-emerald-700"
                    />
                    <ActionButton
                      label="Dismiss Report"
                      icon={<XCircle className="h-4 w-4" />}
                      loading={actionKey === `dismiss-${item.report_id}`}
                      disabled={actionKey !== ''}
                      onClick={() => confirmAction(item, 'dismiss')}
                      className="border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">
          {pagination.total} reported content item{pagination.total === 1 ? '' : 's'} · Page {pagination.page} of {Math.max(1, pagination.pages)}
        </p>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500" htmlFor="forum-report-rows">Rows</label>
          <select
            id="forum-report-rows"
            value={limit}
            onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}
            className="rounded-lg border px-2 py-1.5 text-sm"
          >
            {[10, 25, 50].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
            className="rounded-lg border p-2 hover:bg-gray-50 disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(Math.max(1, pagination.pages), current + 1))}
            disabled={page >= Math.max(1, pagination.pages)}
            className="rounded-lg border p-2 hover:bg-gray-50 disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox((current) => ({ ...current, isOpen: false }))}
        onConfirm={msgBox.onConfirm}
        type={msgBox.type}
        title={msgBox.title}
        message={msgBox.message}
        confirmText={msgBox.confirmText}
        cancelText={msgBox.cancelText}
      />
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  loading,
  disabled,
  onClick,
  className,
}: {
  label: string;
  icon: ReactNode;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}
