import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
  Eye,
  X,
} from 'lucide-react';
import MessageBox from '../../components/MessageBox';
import { API_ENDPOINTS } from '../../config/api';

interface SurveyOption {
  id: number;
  title: string;
  status: string;
}

interface GraduateParticipationRow {
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

interface ParticipationSummary {
  total: number;
  answered: number;
  not_answered: number;
}

interface SurveyResponseAnswer {
  question_id: string;
  question_text: string;
  question_type: string | null;
  section: string | null;
  sort_order: number;
  answer: unknown;
}

interface SurveyResponseDetail {
  id: number;
  survey_id: number;
  graduate_id: number | null;
  survey_title?: string;
  student_id?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  program_code?: string | null;
  year_graduated?: number | null;
  submitted_at: string;
  answers: SurveyResponseAnswer[];
}

type StatusFilter = 'all' | 'answered' | 'not_answered';
type MessageType = 'confirm' | 'success' | 'error' | 'info' | 'warning';

const PROGRAM_OPTIONS = [
  { id: 'all', code: 'All Programs' },
  { id: '1', code: 'BSCS' },
  { id: '2', code: 'BSHM' },
  { id: '3', code: 'BSED' },
  { id: '4', code: 'BEED' },
  { id: '5', code: 'ACT' },
];

const YEAR_TAB_OPTIONS = ['2021', '2022', '2023', '2024', '2025'];

const DEFAULT_EMAIL_MESSAGE =
  'Please complete the Graduate Tracer Study Survey. Your response helps Norzagaray College improve its programs and support graduates with better alumni services.';

export default function GraduateParticipation() {
  const location = useLocation();
  const navigate = useNavigate();
  const autoOpenRequestRef = useRef<string>('');
  const [rows, setRows] = useState<GraduateParticipationRow[]>([]);
  const [summary, setSummary] = useState<ParticipationSummary>({ total: 0, answered: 0, not_answered: 0 });
  const [surveys, setSurveys] = useState<SurveyOption[]>([]);
  const [surveysLoaded, setSurveysLoaded] = useState(false);
  const [selectedSurveyId, setSelectedSurveyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectingAll, setSelectingAll] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('not_answered');
  const [programFilter, setProgramFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [emailMessage, setEmailMessage] = useState(DEFAULT_EMAIL_MESSAGE);
  const [answerViewer, setAnswerViewer] = useState<{
    isOpen: boolean;
    loading: boolean;
    row: GraduateParticipationRow | null;
    response: SurveyResponseDetail | null;
    error: string;
  }>({
    isOpen: false,
    loading: false,
    row: null,
    response: null,
    error: '',
  });
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
    if (programFilter !== 'all') params.append('program_id', programFilter);
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

      const surveyIdFromUrl = new URLSearchParams(location.search).get('survey_id');
      const preferredSurvey = surveyIdFromUrl
        ? surveyOptions.find((survey) => String(survey.id) === surveyIdFromUrl)
        : null;
      const defaultSurvey = preferredSurvey || surveyOptions.find((survey) => survey.status === 'active') || surveyOptions[0];
      if (defaultSurvey && !selectedSurveyId) {
        setSelectedSurveyId(String(defaultSurvey.id));
      }
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to load surveys',
      });
    } finally {
      setSurveysLoaded(true);
    }
  };

  const fetchGraduateStatus = async () => {
    setLoading(true);

    try {
      const params = buildStatusParams(page, 10);
      const response = await fetch(`${API_ENDPOINTS.GRADUATE_SURVEY_STATUS}?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load graduate participation');
      }

      setRows(data.data || []);
      setSummary(data.summary || { total: 0, answered: 0, not_answered: 0 });
      setTotalPages(data.pagination?.pages || 1);
    } catch (error) {
      setRows([]);
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to load graduate participation',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSurveys();
  }, []);

  useEffect(() => {
    if (!surveysLoaded) return;
    void fetchGraduateStatus();
  }, [surveysLoaded, selectedSurveyId, page, search, statusFilter, programFilter, yearFilter]);

  useEffect(() => {
    setSelectedIds([]);
  }, [selectedSurveyId, search, statusFilter, programFilter, yearFilter]);

  const toggleRowSelection = (row: GraduateParticipationRow) => {
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

      const response = await fetch(`${API_ENDPOINTS.GRADUATE_SURVEY_STATUS}?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Unable to select graduates');
      }

      const eligibleRows = ((data.data || []) as GraduateParticipationRow[]).filter(
        (row) => !row.has_answered && row.has_email
      );
      setSelectedIds(eligibleRows.map((row) => row.id));
      setMsgBox({
        isOpen: true,
        type: 'info',
        title: 'Graduates Selected',
        message: `${eligibleRows.length} graduate(s) with no survey response and valid email addresses are selected.`,
      });
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to select graduates',
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
      await fetchGraduateStatus();
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
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to send reminder emails',
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

  const openAnswerViewerByIds = useCallback(async (
    surveyId: string,
    graduateId: number,
    rowHint?: GraduateParticipationRow | null,
    responseId?: number | null
  ) => {
    if (!surveyId || !Number.isFinite(graduateId) || graduateId <= 0) return;

    const existingRow = rowHint || rows.find((item) => item.id === graduateId) || null;

    setAnswerViewer({
      isOpen: true,
      loading: true,
      row: existingRow,
      response: null,
      error: '',
    });

    try {
      const fetchFirstResponse = async (params: URLSearchParams): Promise<SurveyResponseDetail | null> => {
        const response = await fetch(`${API_ENDPOINTS.SURVEY_RESPONSES}?${params.toString()}`, {
          credentials: 'include',
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Unable to load survey answers');
        }

        return ((data.data || []) as SurveyResponseDetail[])[0] || null;
      };

      const baseParams = new URLSearchParams({
        survey_id: surveyId,
        graduate_id: String(graduateId),
      });

      let surveyResponse: SurveyResponseDetail | null = null;

      if (responseId && Number.isFinite(responseId) && responseId > 0) {
        const strictParams = new URLSearchParams(baseParams);
        strictParams.append('response_id', String(responseId));
        surveyResponse = await fetchFirstResponse(strictParams);
      }

      // Fallback for stale/mismatched response IDs in deep links.
      if (!surveyResponse) {
        surveyResponse = await fetchFirstResponse(baseParams);
      }

      if (!surveyResponse && responseId && Number.isFinite(responseId) && responseId > 0) {
        const responseOnlyParams = new URLSearchParams({ response_id: String(responseId) });
        surveyResponse = await fetchFirstResponse(responseOnlyParams);
      }

      if (!surveyResponse) {
        throw new Error('No submitted answers were found for this graduate.');
      }

      const modalRow = existingRow || {
        id: graduateId,
        student_id: surveyResponse.student_id ?? null,
        first_name: surveyResponse.first_name ?? 'Graduate',
        middle_name: surveyResponse.middle_name ?? null,
        last_name: surveyResponse.last_name ?? '',
        email: surveyResponse.email ?? null,
        year_graduated: surveyResponse.year_graduated ?? null,
        program_code: surveyResponse.program_code ?? null,
        program_name: null,
        response_count: 1,
        has_answered: true,
        has_email: Boolean(surveyResponse.email),
        last_submitted_at: surveyResponse.submitted_at ?? null,
      } as GraduateParticipationRow;

      setAnswerViewer({
        isOpen: true,
        loading: false,
        row: modalRow,
        response: surveyResponse,
        error: '',
      });
    } catch (error) {
      setAnswerViewer({
        isOpen: true,
        loading: false,
        row: existingRow,
        response: null,
        error: error instanceof Error ? error.message : 'Unable to load survey answers',
      });
    }
  }, [rows]);

  const openAnswerViewer = async (row: GraduateParticipationRow) => {
    if (!row.has_answered || !selectedSurveyId) return;

    const params = new URLSearchParams(location.search);
    params.set('survey_id', selectedSurveyId);
    params.set('graduate_id', String(row.id));
    params.set('open_answers', '1');

    navigate(
      {
        pathname: location.pathname,
        search: `?${params.toString()}`,
      },
      { replace: false }
    );
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openAnswers = params.get('open_answers');
    const surveyIdParam = params.get('survey_id');
    const graduateIdParam = params.get('graduate_id');
    const responseIdParam = params.get('response_id');

    if (!openAnswers || !surveyIdParam || !graduateIdParam) return;

    const graduateId = Number(graduateIdParam);
    if (!Number.isFinite(graduateId) || graduateId <= 0) return;

    const responseId = responseIdParam ? Number(responseIdParam) : null;
    const resolvedResponseId =
      responseId !== null && Number.isFinite(responseId) && responseId > 0 ? responseId : null;

    const requestKey = `${surveyIdParam}:${graduateId}`;
    if (autoOpenRequestRef.current === requestKey) return;
    autoOpenRequestRef.current = requestKey;

    if (selectedSurveyId !== surveyIdParam) {
      setSelectedSurveyId(surveyIdParam);
    }
    if (statusFilter !== 'answered') {
      setStatusFilter('answered');
    }

    void openAnswerViewerByIds(
      surveyIdParam,
      graduateId,
      rows.find((item) => item.id === graduateId) || null,
      resolvedResponseId
    );

    params.delete('open_answers');
    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true }
    );

    // Allow the same graduate answer link to be triggered again later.
    autoOpenRequestRef.current = '';
  }, [location.pathname, location.search, navigate, openAnswerViewerByIds, rows, selectedSurveyId, statusFilter]);

  const closeAnswerViewer = () => {
    setAnswerViewer({
      isOpen: false,
      loading: false,
      row: null,
      response: null,
      error: '',
    });
  };

  const viewedGraduateName = answerViewer.row ? getGraduateDisplayName(answerViewer.row) : 'Graduate';
  const viewedSubmittedAt =
    answerViewer.response?.submitted_at || answerViewer.row?.last_submitted_at || null;
  const viewedAnswers = answerViewer.response?.answers || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-[#1b2a4a]">Graduates</h1>
          <p className="text-sm text-gray-500">
            Track survey participation and notify graduates who still need to answer.
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

        <div className="flex items-center gap-1 overflow-x-auto border-t pt-3">
          {PROGRAM_OPTIONS.map((program) => (
            <button
              key={program.id}
              onClick={() => {
                setProgramFilter(program.id);
                setPage(1);
              }}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                programFilter === program.id
                  ? 'border-[#1b2a4a] text-[#1b2a4a]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {program.code}
            </button>
          ))}
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
          <table className="w-full min-w-[1220px] text-sm">
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
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">No graduates found</td></tr>
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
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => void openAnswerViewer(row)}
                          disabled={!row.has_answered || !selectedSurveyId}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View Answers
                        </button>
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

      {answerViewer.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase text-blue-700">Survey Answers</p>
                <h2 className="mt-1 text-xl font-bold text-[#1b2a4a]">{viewedGraduateName}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {answerViewer.row?.student_id || 'No student ID'} - {answerViewer.row?.program_code || '-'} - Submitted:{' '}
                  {viewedSubmittedAt ? new Date(viewedSubmittedAt).toLocaleString() : '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeAnswerViewer}
                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close survey answers"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4">
              {answerViewer.loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading survey answers...
                </div>
              ) : answerViewer.error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {answerViewer.error}
                </div>
              ) : viewedAnswers.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                  No answers were recorded for this response.
                </div>
              ) : (
                <div className="space-y-4">
                  {viewedAnswers.map((item, index) => {
                    const previousSection = index > 0 ? viewedAnswers[index - 1].section : null;
                    const showSection = (item.section || 'Survey Answers') !== (previousSection || 'Survey Answers');
                    const isStructured = isStructuredAnswer(item.answer);

                    return (
                      <div key={`${item.question_id}-${index}`}>
                        {showSection && (
                          <div className="mb-2 rounded-lg bg-gray-100 px-3 py-2 text-xs font-bold uppercase text-gray-600">
                            {item.section || 'Survey Answers'}
                          </div>
                        )}
                        <div className="rounded-lg border border-gray-200 px-4 py-3">
                          <p className="text-sm font-semibold text-[#1b2a4a]">
                            {item.sort_order}. {item.question_text}
                          </p>
                          {isStructured ? (
                            <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                              {formatAnswerValue(item.answer)}
                            </pre>
                          ) : (
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">
                              {formatAnswerValue(item.answer)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
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

function getGraduateDisplayName(row: GraduateParticipationRow) {
  return `${row.last_name}, ${row.first_name}${row.middle_name ? ` ${row.middle_name.charAt(0)}.` : ''}`;
}

function isStructuredAnswer(value: unknown) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function formatAnswerValue(value: unknown) {
  if (value === null || value === undefined) {
    return '-';
  }

  if (Array.isArray(value)) {
    return value.length > 0
      ? value.map((item) => (isStructuredAnswer(item) ? JSON.stringify(item) : String(item))).join(', ')
      : '-';
  }

  if (isStructuredAnswer(value)) {
    return JSON.stringify(value, null, 2);
  }

  const text = String(value).trim();
  return text || '-';
}
