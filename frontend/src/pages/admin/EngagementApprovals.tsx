import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Briefcase,
  CheckCircle2,
  Clock3,
  Eye,
  Loader2,
  Search,
  XCircle,
} from 'lucide-react';
import MessageBox from '../../components/MessageBox';
import { API_ENDPOINTS } from '../../config/api';

type ApprovalStatus = 'pending' | 'approved' | 'declined';
type MessageType = 'confirm' | 'success' | 'error' | 'info' | 'warning';

interface ApprovalSummary {
  pending: number;
  approved: number;
  declined: number;
}

interface JobApproval {
  id: number;
  title: string;
  company: string;
  location?: string | null;
  salary_range?: string | null;
  job_type?: string | null;
  industry?: string | null;
  description?: string | null;
  required_skills?: string | null;
  course_program_fit?: string | null;
  application_deadline?: string | null;
  contact_email?: string | null;
  application_link?: string | null;
  application_method?: string | null;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  poster_email?: string | null;
  poster_program_code?: string | null;
  poster_program_name?: string | null;
  year_graduated?: number | null;
  is_active: number;
  created_at?: string | null;
  approval_status: ApprovalStatus;
  approval_reviewed_at?: string | null;
  approval_reviewed_by_name?: string | null;
  approval_notes?: string | null;
}

interface ApprovalResponse {
  program_scope: string[];
  can_review_all: boolean;
  summary: {
    jobs: ApprovalSummary;
  };
  data: {
    jobs: JobApproval[];
  };
}

type ViewedApproval =
  | { type: 'job'; item: JobApproval }
  | null;

const statusOptions: Array<{ value: ApprovalStatus | 'all'; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'all', label: 'All' },
];

const statusStyles: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  declined: 'bg-red-50 text-red-700 border-red-200',
};

const statusIcons = {
  pending: Clock3,
  approved: CheckCircle2,
  declined: XCircle,
};

export default function EngagementApprovals() {
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [approvingKey, setApprovingKey] = useState('');
  const [viewedApproval, setViewedApproval] = useState<ViewedApproval>(null);
  const [notesByItem, setNotesByItem] = useState<Record<string, string>>({});
  const [approvalData, setApprovalData] = useState<ApprovalResponse>({
    program_scope: [],
    can_review_all: false,
    summary: {
      jobs: { pending: 0, approved: 0, declined: 0 },
    },
    data: {
      jobs: [],
    },
  });
  const [msgBox, setMsgBox] = useState<{
    isOpen: boolean;
    type: MessageType;
    title?: string;
    message: string;
    confirmText?: string;
    onConfirm?: () => void;
  }>({ isOpen: false, type: 'info', message: '' });

  const activeSummary = approvalData.summary.jobs;
  const activeItems = approvalData.data.jobs;
  const pendingTotal = activeSummary.pending;
  const approvedTotal = activeSummary.approved;
  const declinedTotal = activeSummary.declined;
  const pageTitle = 'Job Approval';
  const pendingLabel = 'job post';
  const searchPlaceholder = 'Search by graduate, program, company, skills, or job title';

  const selectedCount = useMemo(() => {
    if (statusFilter === 'all') {
      return activeItems.length;
    }

    return activeItems.filter((item) => item.approval_status === statusFilter).length;
  }, [activeItems, statusFilter]);

  const fetchApprovals = async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams({ status: statusFilter });
      if (search.trim()) params.append('search', search.trim());

      const response = await fetch(`${API_ENDPOINTS.ENGAGEMENT_APPROVALS}?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Failed to load approvals');
      }

      setApprovalData({
        program_scope: data.program_scope || [],
        can_review_all: !!data.can_review_all,
        summary: data.summary || {
          jobs: { pending: 0, approved: 0, declined: 0 },
        },
        data: data.data || { jobs: [] },
      });
    } catch (error) {
      setApprovalData((prev) => ({ ...prev, data: { jobs: [] } }));
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to load approvals',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchApprovals();
  }, [statusFilter, search]);

  const reviewItem = async (id: number, approvalStatus: ApprovalStatus) => {
    const key = `job-${id}`;
    setApprovingKey(`${key}-${approvalStatus}`);

    try {
      const response = await fetch(API_ENDPOINTS.ENGAGEMENT_APPROVALS, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: 'job',
          id,
          approval_status: approvalStatus,
          notes: notesByItem[key] || '',
        }),
      });
      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Unable to update approval');
      }

      setNotesByItem((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await fetchApprovals();
      setMsgBox({
        isOpen: true,
        type: 'success',
        title: 'Approval Updated',
        message: data.message || 'Approval status updated.',
      });
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to update approval',
      });
    } finally {
      setApprovingKey('');
    }
  };

  const confirmReview = (id: number, approvalStatus: ApprovalStatus, label: string) => {
    const action = approvalStatus === 'approved' ? 'Approve' : 'Decline';
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: `${action} Job Post`,
      message: `${action} "${label}"? ${approvalStatus === 'approved' ? 'It will become visible in the graduate portal.' : 'It will remain hidden from graduates.'}`,
      confirmText: action,
      onConfirm: () => {
        void reviewItem(id, approvalStatus);
      },
    });
  };

  const scopeLabel = approvalData.can_review_all
    ? 'All programs'
    : approvalData.program_scope.length > 0
      ? approvalData.program_scope.join(', ')
      : 'No program scope';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1b2a4a]">{pageTitle}</h1>
          <p className="text-sm text-gray-500">Program Scope: {scopeLabel}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {pendingTotal} {pendingLabel}{pendingTotal === 1 ? '' : 's'} waiting for review
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Pending" value={pendingTotal} className="border-amber-200 bg-amber-50 text-amber-800" />
        <SummaryCard label="Approved" value={approvedTotal} className="border-green-200 bg-green-50 text-green-800" />
        <SummaryCard label="Declined" value={declinedTotal} className="border-red-200 bg-red-50 text-red-800" />
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border px-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={searchPlaceholder}
            />
          </div>
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
          Loading approvals...
        </div>
      ) : (
        <div className="space-y-6">
          <ApprovalSection
            title="Job Posts"
            icon={<Briefcase className="h-5 w-5 text-green-700" />}
            emptyText={`No ${statusFilter === 'all' ? '' : statusFilter} job posts found.`}
            count={approvalData.data.jobs.length}
          >
            {approvalData.data.jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                notes={notesByItem[`job-${job.id}`] || ''}
                approvingKey={approvingKey}
                onNotesChange={(value) => setNotesByItem((prev) => ({ ...prev, [`job-${job.id}`]: value }))}
                onView={() => setViewedApproval({ type: 'job', item: job })}
                onReview={(approvalStatus) => confirmReview(job.id, approvalStatus, job.title || 'job post')}
              />
            ))}
          </ApprovalSection>

          {selectedCount === 0 && (
            <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-500">
              No approval items match the current filters.
            </div>
          )}
        </div>
      )}

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox({ ...msgBox, isOpen: false })}
        onConfirm={msgBox.onConfirm}
        type={msgBox.type}
        title={msgBox.title}
        message={msgBox.message}
        confirmText={msgBox.confirmText}
      />

      {viewedApproval && (
        <ApprovalDetailModal
          viewedApproval={viewedApproval}
          onClose={() => setViewedApproval(null)}
        />
      )}
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

function ApprovalSection({
  title,
  icon,
  count,
  emptyText,
  children,
}: {
  title: string;
  icon: ReactNode;
  count: number;
  emptyText: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-lg font-bold text-[#1b2a4a]">{title}</h2>
        </div>
        <span className="text-sm text-gray-500">{count} item{count === 1 ? '' : 's'}</span>
      </div>
      {count === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-center text-sm text-gray-500">{emptyText}</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">{children}</div>
      )}
    </section>
  );
}

function JobCard({
  job,
  notes,
  approvingKey,
  onNotesChange,
  onView,
  onReview,
}: {
  job: JobApproval;
  notes: string;
  approvingKey: string;
  onNotesChange: (value: string) => void;
  onView: () => void;
  onReview: (status: ApprovalStatus) => void;
}) {
  const posterName = `${job.first_name || ''} ${job.last_name || ''}`.trim() || 'Graduate';

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <CardHeader
        title={job.title || 'Untitled Job'}
        subtitle={`${job.company || 'No company'} - Posted by ${posterName}`}
        status={job.approval_status}
        isActive={job.is_active}
      />

      <div className="mt-4 space-y-2 text-sm text-gray-700">
        <InfoRow label="Program" value={job.poster_program_code || job.poster_program_name} />
        <InfoRow label="Poster Email" value={job.poster_email} />
        <InfoRow label="Location" value={job.location} />
        <InfoRow label="Type" value={formatEmploymentType(job.job_type)} />
        <InfoRow label="Salary" value={job.salary_range} />
        <InfoRow label="Program Fit" value={job.course_program_fit} />
        <InfoRow label="Required Skills" value={job.required_skills} />
        <InfoRow label="Deadline" value={formatDate(job.application_deadline)} />
        <InfoRow label="Apply Via" value={job.application_link || job.contact_email || job.application_method} />
        {job.description && <p className="whitespace-pre-line rounded-lg bg-gray-50 p-3 text-gray-600">{job.description}</p>}
        <ReviewMeta item={job} />
      </div>

      <ReviewControls
        itemKey={`job-${job.id}`}
        status={job.approval_status}
        notes={notes}
        approvingKey={approvingKey}
        onNotesChange={onNotesChange}
        onView={onView}
        onReview={onReview}
      />
    </div>
  );
}

function CardHeader({
  title,
  subtitle,
  status,
  isActive,
}: {
  title: string;
  subtitle: string;
  status: ApprovalStatus;
  isActive: number;
}) {
  const StatusIcon = statusIcons[status];

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-lg font-bold text-[#1b2a4a]">{title}</h3>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[status]}`}>
          <StatusIcon className="h-3.5 w-3.5" />
          {capitalize(status)}
        </span>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${isActive ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
          {isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
    </div>
  );
}

function ReviewControls({
  itemKey,
  status,
  notes,
  approvingKey,
  onNotesChange,
  onView,
  onReview,
}: {
  itemKey: string;
  status: ApprovalStatus;
  notes: string;
  approvingKey: string;
  onNotesChange: (value: string) => void;
  onView: () => void;
  onReview: (status: ApprovalStatus) => void;
}) {
  if (status !== 'pending') {
    return (
      <div className="mt-4 border-t pt-4">
        <button
          type="button"
          onClick={onView}
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
        >
          <Eye className="h-4 w-4" />
          View
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <textarea
        value={notes}
        onChange={(event) => onNotesChange(event.target.value)}
        rows={2}
        className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Optional review notes"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onReview('approved')}
          disabled={approvingKey !== ''}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {approvingKey === `${itemKey}-approved` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Approve
        </button>
        <button
          type="button"
          onClick={() => onReview('declined')}
          disabled={approvingKey !== ''}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {approvingKey === `${itemKey}-declined` ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          Decline
        </button>
      </div>
    </div>
  );
}

function ApprovalDetailModal({
  viewedApproval,
  onClose,
}: {
  viewedApproval: Exclude<ViewedApproval, null>;
  onClose: () => void;
}) {
  const item = viewedApproval.item;
  const title = viewedApproval.item.title || 'Job Post';
  const subtitle = `${viewedApproval.item.company || 'No company'} - ${viewedApproval.item.poster_program_code || viewedApproval.item.poster_program_name || 'No program'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-blue-700">
              Job Post Details
            </p>
            <h2 className="mt-1 text-xl font-bold text-[#1b2a4a]">{title}</h2>
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close details"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4 text-sm text-gray-700">
          <CardHeader title={title} subtitle={subtitle} status={item.approval_status} isActive={item.is_active} />

          <InfoRow label="Poster" value={`${viewedApproval.item.first_name || ''} ${viewedApproval.item.last_name || ''}`.trim()} />
          <InfoRow label="Poster Email" value={viewedApproval.item.poster_email} />
          <InfoRow label="Location" value={viewedApproval.item.location} />
          <InfoRow label="Type" value={formatEmploymentType(viewedApproval.item.job_type)} />
          <InfoRow label="Salary" value={viewedApproval.item.salary_range} />
          <InfoRow label="Program Fit" value={viewedApproval.item.course_program_fit} />
          <InfoRow label="Required Skills" value={viewedApproval.item.required_skills} />
          <InfoRow label="Deadline" value={formatDate(viewedApproval.item.application_deadline)} />
          <InfoRow label="Apply Via" value={viewedApproval.item.application_link || viewedApproval.item.contact_email || viewedApproval.item.application_method} />
          {viewedApproval.item.description && (
            <p className="whitespace-pre-line rounded-lg bg-gray-50 p-3 text-gray-600">{viewedApproval.item.description}</p>
          )}

          <ReviewMeta item={item} />
        </div>

        <div className="border-t px-5 py-4 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewMeta({ item }: { item: JobApproval }) {
  if (!item.approval_reviewed_at && !item.approval_notes) {
    return null;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
      {item.approval_reviewed_at && (
        <p>
          Reviewed: {formatDateTime(item.approval_reviewed_at)}
          {item.approval_reviewed_by_name ? ` by ${item.approval_reviewed_by_name}` : ''}
        </p>
      )}
      {item.approval_notes && <p className="mt-1 whitespace-pre-line">Notes: {item.approval_notes}</p>}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  const displayValue = value === null || value === undefined || String(value).trim() === '' ? '-' : String(value);

  return (
    <p>
      <span className="font-semibold text-gray-800">{label}:</span> {displayValue}
    </p>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatEmploymentType(value?: string | null) {
  return (value || 'full_time')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function formatDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
