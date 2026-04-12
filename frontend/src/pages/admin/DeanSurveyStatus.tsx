import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Users,
  Mail,
  Send,
  Loader2,
} from 'lucide-react';
import MessageBox from '../../components/MessageBox';
import { API_ENDPOINTS } from '../../config/api';

interface SurveyOption {
  id: number;
  title: string;
  status: string;
}

interface DeanGraduateRow {
  id: number;
  student_id: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string | null;
  year_graduated: number | null;
  program_code: string | null;
  program_name: string | null;
  response_count: number;
  has_answered: boolean;
  has_email: boolean;
  last_submitted_at: string | null;
}

interface DeanSummary {
  total: number;
  answered: number;
  not_answered: number;
}

type StatusFilter = 'all' | 'answered' | 'not_answered';
type MessageType = 'confirm' | 'success' | 'error' | 'info' | 'warning';

const YEAR_TAB_OPTIONS = ['2021', '2022', '2023', '2024', '2025'];

const DEFAULT_EMAIL_MESSAGE =
  'Please complete the Graduate Tracer Study Survey. Your response helps Norzagaray College improve its programs and support graduates with better alumni services.';

export default function DeanSurveyStatus() {
  const [rows, setRows] = useState<DeanGraduateRow[]>([]);
  const [summary, setSummary] = useState<DeanSummary>({ total: 0, answered: 0, not_answered: 0 });
  const [surveys, setSurveys] = useState<SurveyOption[]>([]);
  const [surveysLoaded, setSurveysLoaded] = useState(false);
  const [selectedSurveyId, setSelectedSurveyId] = useState('');
  const [programScope, setProgramScope] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectingAll, setSelectingAll] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('not_answered');
  const [yearFilter, setYearFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [emailMessage, setEmailMessage] = useState(DEFAULT_EMAIL_MESSAGE);
  const [error, setError] = useState('');
  const [msgBox, setMsgBox] = useState<{
    isOpen: boolean;
    type: MessageType;
    title?: string;
    message: string;
    confirmText?: string;
    onConfirm?: () => void;
  }>({ isOpen: false, type: 'info', message: '' });

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedSurvey = surveys.find((survey) => String(survey.id) === selectedSurveyId);
  const selectableRows = rows.filter((row) => !row.has_answered && row.has_email);
  const allPageRowsSelected =
    selectableRows.length > 0 && selectableRows.every((row) => selectedIdSet.has(row.id));

  const buildStatusParams = (targetPage: number, limit: number) => {
    const params = new URLSearchParams();
    params.append('page', String(targetPage));
    params.append('limit', String(limit));
    if (selectedSurveyId) params.append('survey_id', selectedSurveyId);
    if (search.trim()) params.append('search', search.trim());
    if (statusFilter !== 'all') params.append('status', statusFilter);
    if (yearFilter) params.append('year_graduated', yearFilter);
    return params;
  };

  const fetchSurveys = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.SURVEYS, {
        credentials: 'include',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load surveys');
      }

      const surveyOptions = (data.data || []) as SurveyOption[];
      setSurveys(surveyOptions);

      const defaultSurvey = surveyOptions.find((survey) => survey.status === 'active') || surveyOptions[0];
      if (defaultSurvey) {
        setSelectedSurveyId(String(defaultSurvey.id));
      }
    } catch (err) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load surveys',
      });
    } finally {
      setSurveysLoaded(true);
    }
  };

  const fetchDeanSurveyStatus = async () => {
    setLoading(true);
    setError('');

    try {
      const params = buildStatusParams(page, 10);
      const response = await fetch(`${API_ENDPOINTS.DEAN_SURVEY_STATUS}?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load survey participation status');
      }

      setRows(data.data || []);
      setSummary(data.summary || { total: 0, answered: 0, not_answered: 0 });
      setProgramScope(data.program_scope || []);
      setTotalPages(data.pagination?.pages || 1);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Failed to load survey participation status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSurveys();
  }, []);

  useEffect(() => {
    if (!surveysLoaded) return;
    void fetchDeanSurveyStatus();
  }, [surveysLoaded, selectedSurveyId, page, search, statusFilter, yearFilter]);

  useEffect(() => {
    setSelectedIds([]);
  }, [selectedSurveyId, search, statusFilter, yearFilter]);

  const toggleRowSelection = (row: DeanGraduateRow) => {
    if (row.has_answered || !row.has_email) return;

    setSelectedIds((prev) =>
      prev.includes(row.id) ? prev.filter((id) => id !== row.id) : [...prev, row.id]
    );
  };

  const togglePageSelection = () => {
    const selectableIds = selectableRows.map((row) => row.id);

    setSelectedIds((prev) => {
      if (allPageRowsSelected) {
        return prev.filter((id) => !selectableIds.includes(id));
      }

      return Array.from(new Set([...prev, ...selectableIds]));
    });
  };

  const handleSelectAllMatching = async () => {
    setSelectingAll(true);

    try {
      const params = buildStatusParams(1, 5000);
      params.set('status', 'not_answered');
      params.set('limit', '5000');

      const response = await fetch(`${API_ENDPOINTS.DEAN_SURVEY_STATUS}?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to select graduates');
      }

      const eligibleRows = ((data.data || []) as DeanGraduateRow[]).filter(
        (row) => !row.has_answered && row.has_email
      );
      setSelectedIds(eligibleRows.map((row) => row.id));
      setMsgBox({
        isOpen: true,
        type: 'info',
        title: 'Graduates Selected',
        message: `${eligibleRows.length} graduate(s) with no survey response and valid email addresses are selected.`,
      });
    } catch (err) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to select graduates',
      });
    } finally {
      setSelectingAll(false);
    }
  };

  const sendReminderEmails = async () => {
    setNotifying(true);

    try {
      const response = await fetch(API_ENDPOINTS.GRADUATE_NOTIFY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          survey_id: selectedSurveyId ? Number(selectedSurveyId) : undefined,
          graduate_ids: selectedIds,
          only_not_answered: true,
          message: emailMessage.trim() || DEFAULT_EMAIL_MESSAGE,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to send reminder emails');
      }

      const counts = data.counts || { sent: 0, failed: 0, skipped: 0, eligible: 0 };
      setSelectedIds([]);
      await fetchDeanSurveyStatus();
      setMsgBox({
        isOpen: true,
        type: data.success ? 'success' : 'warning',
        title: data.success ? 'Emails Sent' : 'Emails Finished With Issues',
        message:
          `Eligible: ${counts.eligible || 0}\n` +
          `Sent: ${counts.sent || 0}\n` +
          `Skipped: ${counts.skipped || 0}\n` +
          `Failed: ${counts.failed || 0}`,
      });
    } catch (err) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to send reminder emails',
      });
    } finally {
      setNotifying(false);
    }
  };

  const handleNotifySelected = () => {
    if (!selectedSurveyId) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: 'Please select a survey before sending reminders.',
      });
      return;
    }

    if (selectedIds.length === 0) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: 'Select at least one graduate with no survey response and a valid email address.',
      });
      return;
    }

    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Send Reminder Emails',
      message: `Send reminder emails to ${selectedIds.length} selected graduate(s) for ${selectedSurvey?.title || 'the selected survey'}?`,
      confirmText: 'Send Emails',
      onConfirm: () => {
        void sendReminderEmails();
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-[#1b2a4a]">Graduate Survey Participation</h1>
          <p className="text-sm text-gray-500">
            Program Scope: {programScope.length > 0 ? programScope.join(', ') : '-'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSelectAllMatching}
            disabled={selectingAll || loading || !selectedSurveyId}
            className="flex items-center gap-2 border border-blue-200 text-blue-700 px-4 py-2.5 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {selectingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Select All No Response
          </button>

          <button
            onClick={handleNotifySelected}
            disabled={notifying || selectedIds.length === 0}
            className="flex items-center gap-2 bg-[#1b2a4a] text-white px-4 py-2.5 rounded-lg hover:bg-[#263c66] transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {notifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {notifying ? 'Sending...' : `Notify Selected (${selectedIds.length})`}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          icon={<Users className="w-5 h-5 text-blue-700" />}
          label="Total Graduates"
          value={summary.total}
          cardClass="bg-blue-50 border-blue-200"
        />
        <SummaryCard
          icon={<CheckCircle2 className="w-5 h-5 text-green-700" />}
          label="Answered Survey"
          value={summary.answered}
          cardClass="bg-green-50 border-green-200"
        />
        <SummaryCard
          icon={<XCircle className="w-5 h-5 text-red-700" />}
          label="No Survey Response"
          value={summary.not_answered}
          cardClass="bg-red-50 border-red-200"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-4 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr_1fr_1fr] gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, or student ID..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={selectedSurveyId}
            onChange={(event) => {
              setSelectedSurveyId(event.target.value);
              setPage(1);
            }}
            className="border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {surveys.length === 0 ? (
              <option value="">No surveys available</option>
            ) : (
              surveys.map((survey) => (
                <option key={survey.id} value={survey.id}>
                  {survey.title} {survey.status === 'active' ? '(Active)' : ''}
                </option>
              ))
            )}
          </select>

          <div className="relative">
            <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StatusFilter);
                setPage(1);
              }}
              className="w-full border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="answered">Answered</option>
              <option value="not_answered">Not Answered</option>
            </select>
          </div>

          <select
            value={yearFilter}
            onChange={(event) => {
              setYearFilter(event.target.value);
              setPage(1);
            }}
            className="border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Years</option>
            {YEAR_TAB_OPTIONS.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>

        <div className="border-t pt-3">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Email Message</label>
          <textarea
            value={emailMessage}
            onChange={(event) => setEmailMessage(event.target.value)}
            rows={3}
            className="w-full border rounded-lg px-3 py-2 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allPageRowsSelected}
                    onChange={togglePageSelection}
                    disabled={selectableRows.length === 0}
                    className="h-4 w-4 rounded border-gray-300 text-blue-700 focus:ring-blue-500 disabled:opacity-40"
                    aria-label="Select all eligible graduates on this page"
                  />
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Student ID</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Program</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Year</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Responses</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Last Submitted</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-400">Loading...</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-red-600">{error}</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-400">No graduates found</td>
                </tr>
              ) : (
                rows.map((row) => {
                  const canSelect = !row.has_answered && row.has_email;
                  return (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIdSet.has(row.id)}
                          onChange={() => toggleRowSelection(row)}
                          disabled={!canSelect}
                          className="h-4 w-4 rounded border-gray-300 text-blue-700 focus:ring-blue-500 disabled:opacity-40"
                          aria-label={`Select ${row.first_name} ${row.last_name}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{row.student_id || '-'}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#1b2a4a]">
                          {row.last_name}, {row.first_name}{row.middle_name ? ` ${row.middle_name.charAt(0)}.` : ''}
                        </p>
                        <p className={`text-xs ${row.has_email ? 'text-gray-400' : 'text-red-500'}`}>
                          {row.email || 'No email address'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="bg-blue-50 text-blue-700 text-xs font-medium px-2 py-1 rounded">
                          {row.program_code || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{row.year_graduated || '-'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium px-2 py-1 rounded ${
                            row.has_answered ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {row.has_answered ? 'Answered' : 'Not Answered'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{row.response_count}</td>
                      <td className="px-4 py-3">
                        {row.last_submitted_at ? new Date(row.last_submitted_at).toLocaleString() : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox({ ...msgBox, isOpen: false })}
        onConfirm={msgBox.onConfirm}
        type={msgBox.type}
        title={msgBox.title}
        message={msgBox.message}
        confirmText={msgBox.confirmText}
      />
    </div>
  );
}

function SummaryCard({ icon, label, value, cardClass }: { icon: ReactNode; label: string; value: number; cardClass: string }) {
  return (
    <div className={`rounded-xl border p-4 ${cardClass}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-600">{label}</p>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-800">{value}</p>
    </div>
  );
}
