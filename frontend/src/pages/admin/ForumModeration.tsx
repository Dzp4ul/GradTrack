import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, EyeOff, Loader2, MessageSquareMore, Search, Trash2 } from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';
import MessageBox from '../../components/MessageBox';

type ForumStatus = 'approved' | 'pending' | 'hidden';

interface ModerationComment {
  id: number;
  post_id: number;
  graduate_id: number;
  comment: string;
  created_at: string;
  commenter_name: string;
}

interface ModerationReport {
  id: number;
  target_type: 'post' | 'comment';
  post_id: number;
  comment_id?: number | null;
  reason?: string | null;
  status: string;
  created_at: string;
  reporter_name: string;
}

interface ModerationPost {
  id: number;
  graduate_id: number;
  title: string;
  content: string;
  category: string;
  status: ForumStatus;
  created_at: string;
  updated_at: string;
  author_name: string;
  author_program_code?: string | null;
  comment_count: number;
  report_count: number;
  comments: ModerationComment[];
  reports: ModerationReport[];
}

interface ModerationResponse {
  summary: Record<ForumStatus, number>;
  categories: string[];
  data: ModerationPost[];
}

const statusOptions: Array<{ value: ForumStatus | 'all'; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'all', label: 'All' },
];

export default function ForumModeration() {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ForumStatus | 'all'>('pending');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [actionKey, setActionKey] = useState('');
  const [data, setData] = useState<ModerationResponse>({
    summary: { approved: 0, pending: 0, hidden: 0 },
    categories: [],
    data: [],
  });
  const [msgBox, setMsgBox] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'confirm';
    title?: string;
    message: string;
    confirmText?: string;
    onConfirm?: () => void;
  }>({ isOpen: false, type: 'success', message: '' });

  const fetchModeration = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams();
      params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      if (categoryFilter !== 'all') params.set('category', categoryFilter);

      const response = await fetch(`${API_ENDPOINTS.FORUM.MODERATION}?${params.toString()}`, {
        credentials: 'include',
      });
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || 'Unable to load forum moderation data');
      }

      setData({
        summary: result.summary || { approved: 0, pending: 0, hidden: 0 },
        categories: Array.isArray(result.categories) ? result.categories : [],
        data: Array.isArray(result.data) ? result.data : [],
      });
      setCategories(Array.isArray(result.categories) ? result.categories : []);
    } catch (error) {
      setData({
        summary: { approved: 0, pending: 0, hidden: 0 },
        categories: [],
        data: [],
      });
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to load forum moderation data',
      });
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, search, statusFilter]);

  useEffect(() => {
    void fetchModeration();
  }, [fetchModeration]);

  const visibleCount = useMemo(() => data.data.length, [data.data.length]);

  const updateStatus = async (postId: number, status: ForumStatus) => {
    setActionKey(`status-${postId}-${status}`);

    try {
      const response = await fetch(API_ENDPOINTS.FORUM.MODERATION, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: postId, status }),
      });
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || 'Unable to update forum post status');
      }

      await fetchModeration();
      setMsgBox({
        isOpen: true,
        type: 'success',
        message: result.message || 'Forum post status updated.',
      });
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to update forum post status',
      });
    } finally {
      setActionKey('');
    }
  };

  const confirmDeletePost = (post: ModerationPost) => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Forum Post',
      message: `Delete "${post.title}" and all its comments?`,
      confirmText: 'Delete',
      onConfirm: async () => {
        setActionKey(`delete-post-${post.id}`);

        try {
          const response = await fetch(API_ENDPOINTS.FORUM.MODERATION, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ post_id: post.id }),
          });
          const result = await response.json();

          if (!response.ok || result.success === false) {
            throw new Error(result.error || 'Unable to delete forum post');
          }

          await fetchModeration();
          setMsgBox({
            isOpen: true,
            type: 'success',
            message: result.message || 'Forum post deleted successfully.',
          });
        } catch (error) {
          setMsgBox({
            isOpen: true,
            type: 'error',
            message: error instanceof Error ? error.message : 'Unable to delete forum post',
          });
        } finally {
          setActionKey('');
        }
      },
    });
  };

  const confirmDeleteComment = (comment: ModerationComment) => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Comment',
      message: `Delete this comment from ${comment.commenter_name || 'graduate'}?`,
      confirmText: 'Delete',
      onConfirm: async () => {
        setActionKey(`delete-comment-${comment.id}`);

        try {
          const response = await fetch(API_ENDPOINTS.FORUM.MODERATION, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comment_id: comment.id }),
          });
          const result = await response.json();

          if (!response.ok || result.success === false) {
            throw new Error(result.error || 'Unable to delete comment');
          }

          await fetchModeration();
          setMsgBox({
            isOpen: true,
            type: 'success',
            message: result.message || 'Comment deleted successfully.',
          });
        } catch (error) {
          setMsgBox({
            isOpen: true,
            type: 'error',
            message: error instanceof Error ? error.message : 'Unable to delete comment',
          });
        } finally {
          setActionKey('');
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1b2a4a]">Forum Moderation</h1>
          <p className="text-sm text-gray-500">Review graduate discussions, update post visibility, and remove inappropriate comments.</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {data.summary.pending} forum post{data.summary.pending === 1 ? '' : 's'} waiting for review
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Pending" value={data.summary.pending} className="border-amber-200 bg-amber-50 text-amber-800" />
        <SummaryCard label="Approved" value={data.summary.approved} className="border-green-200 bg-green-50 text-green-800" />
        <SummaryCard label="Hidden" value={data.summary.hidden} className="border-red-200 bg-red-50 text-red-800" />
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px] xl:grid-cols-[1fr_220px_auto] xl:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border px-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search title, content, category, or author"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatusFilter(option.value)}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                  statusFilter === option.value
                    ? 'border-blue-700 bg-blue-700 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:text-blue-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border bg-white p-10 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading forum moderation data...
        </div>
      ) : visibleCount === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-500">
          No forum posts match the current filters.
        </div>
      ) : (
        <div className="space-y-4">
          {data.data.map((post) => (
            <div key={post.id} className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      {post.category}
                    </span>
                    <ForumStatusBadge status={post.status} />
                    {post.report_count > 0 && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        {post.report_count} report{post.report_count === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-3 text-lg font-bold text-[#1b2a4a]">{post.title}</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {post.author_name || 'Graduate'}{post.author_program_code ? ` - ${post.author_program_code}` : ''} - {formatDateTime(post.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => confirmDeletePost(post)}
                  disabled={actionKey !== ''}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionKey === `delete-post-${post.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete Post
                </button>
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="whitespace-pre-line text-sm leading-6 text-slate-700">{post.content}</p>
              </div>

              {post.reports?.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <h3 className="text-sm font-bold text-amber-900">Pending Reports</h3>
                  <div className="mt-3 space-y-2">
                    {post.reports.map((report) => (
                      <div key={report.id} className="rounded-lg border border-amber-100 bg-white p-3 text-sm text-amber-900">
                        <p className="font-semibold">
                          {report.reporter_name || 'Graduate'} reported this {report.target_type}
                          {report.comment_id ? ` comment #${report.comment_id}` : ''}.
                        </p>
                        {report.reason && <p className="mt-1 whitespace-pre-line">{report.reason}</p>}
                        <p className="mt-2 text-xs text-amber-700">{formatDateTime(report.created_at)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void updateStatus(post.id, 'approved')}
                  disabled={actionKey !== ''}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionKey === `status-${post.id}-approved` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => void updateStatus(post.id, 'pending')}
                  disabled={actionKey !== ''}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionKey === `status-${post.id}-pending` ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareMore className="h-4 w-4" />}
                  Mark Pending
                </button>
                <button
                  type="button"
                  onClick={() => void updateStatus(post.id, 'hidden')}
                  disabled={actionKey !== ''}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionKey === `status-${post.id}-hidden` ? <Loader2 className="h-4 w-4 animate-spin" /> : <EyeOff className="h-4 w-4" />}
                  Hide
                </button>
              </div>

              <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900">Comments</h3>
                  <span className="text-xs text-gray-500">{post.comment_count} total</span>
                </div>

                {post.comments.length === 0 ? (
                  <p className="mt-3 text-sm text-gray-500">No comments on this post yet.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {post.comments.map((comment) => (
                      <div key={comment.id} className="rounded-lg border bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-900">{comment.commenter_name || 'Graduate'}</p>
                            <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{comment.comment}</p>
                            <p className="mt-2 text-xs text-gray-500">{formatDateTime(comment.created_at)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => confirmDeleteComment(comment)}
                            disabled={actionKey !== ''}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {actionKey === `delete-comment-${comment.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={msgBox.onConfirm}
        type={msgBox.type}
        title={msgBox.title}
        message={msgBox.message}
        confirmText={msgBox.confirmText}
      />
    </div>
  );
}

function SummaryCard({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={`rounded-xl border p-4 ${className}`}>
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function ForumStatusBadge({ status }: { status: ForumStatus }) {
  const classes = {
    approved: 'border-green-200 bg-green-50 text-green-700',
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    hidden: 'border-red-200 bg-red-50 text-red-700',
  };

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${classes[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Just now';
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
