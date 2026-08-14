import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Edit2,
  FileSpreadsheet,
  Link2,
  Loader2,
  RefreshCcw,
  Search,
  Trash2,
  Unlink2,
  Upload,
  UserCheck,
  UserX,
  ShieldCheck,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import MessageBox from '../../components/MessageBox';
import { API_ENDPOINTS } from '../../config/api';

type RegistryStatus = 'Unclaimed' | 'Registered' | 'Verified' | 'Inactive';
type VerificationStatus = 'pending' | 'approved' | 'rejected';
type AccountReviewFilter = VerificationStatus | 'all';
type SortKey = 'name' | 'course' | 'batch' | 'import_date';
type SortDirection = 'asc' | 'desc';
type MessageType = 'confirm' | 'success' | 'error' | 'warning' | 'info';
type SurveyAnswerStatus = 'all' | 'answered' | 'not_answered';
type SurveyAnswerCountKey = 'total_official_alumni' | 'answered_alumni' | 'not_answered_alumni';
type AccountReviewCountKey = 'pending_verification_accounts' | 'approved_verification_accounts' | 'rejected_verification_accounts';

interface RegisteredAlumni {
  id: number;
  full_name: string;
  normalized_name: string;
  course_id: number | null;
  course_name: string;
  course_code: string;
  batch_year: number;
  registration_status: RegistryStatus;
  linked_user_id: number | null;
  source_file?: string | null;
  import_batch_id?: number | null;
  created_at: string;
  updated_at: string;
  linked_email?: string | null;
  linked_account_status?: string | null;
  linked_verification_status?: VerificationStatus | null;
  linked_verification_reason?: string | null;
  linked_verification_reviewed_at?: string | null;
  linked_first_name?: string | null;
  linked_middle_name?: string | null;
  linked_last_name?: string | null;
}

interface ProgramOption {
  id: number;
  code: string;
  name: string;
}

interface RegistrySummary {
  total_official_alumni: number;
  registered_accounts: number;
  unclaimed_alumni: number;
  verified_alumni: number;
  answered_alumni: number;
  not_answered_alumni: number;
  total_graduate_accounts: number;
  pending_verification_accounts: number;
  approved_verification_accounts: number;
  rejected_verification_accounts: number;
  course_totals: Record<string, number>;
}

interface SummaryResponse {
  summary: RegistrySummary;
  filters: {
    programs: ProgramOption[];
    course_codes: string[];
    batch_years: number[];
    statuses: RegistryStatus[];
  };
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface ImportRow {
  row_number: number;
  name: string;
  course: string;
  batch: string;
}

interface ImportIssue {
  row_number: number;
  name: string;
  course: string;
  batch: string;
  error: string;
  duplicate_type?: string;
  existing_id?: number;
}

interface ImportPreview {
  total_rows: number;
  ignored_rows: number;
  valid_rows: number;
  duplicate_rows: number;
  invalid_rows: number;
  recognized_courses: Record<string, number>;
  unrecognized_courses: Record<string, number>;
  duplicates: ImportIssue[];
  invalid: ImportIssue[];
}

interface ImportResult {
  import_batch_id: number;
  total_rows_processed: number;
  successfully_imported: number;
  duplicates_skipped: number;
  invalid_rows: number;
  updated_records: number;
  errors: ImportIssue[];
}

interface ImportState {
  open: boolean;
  file_name: string;
  workbook: XLSX.WorkBook | null;
  sheets: string[];
  selected_sheet: string;
  detected_rows: ImportRow[];
  preview: ImportPreview | null;
  result: ImportResult | null;
  loading: boolean;
  saving: boolean;
  error: string;
  duplicate_behavior: 'skip' | 'update' | 'cancel';
}

interface LinkCandidate {
  account_id: number;
  graduate_id: number;
  email: string;
  account_status: string;
  full_name: string;
  program_code?: string | null;
  program_name?: string | null;
  batch_year?: number | null;
  match_strength: 'strong' | 'review' | 'weak';
  linked_registry_id?: number | null;
}

interface ReviewAccount {
  account_id: number;
  graduate_id: number;
  email: string;
  account_status: string;
  alumni_verification_status: VerificationStatus;
  alumni_verification_reason?: string | null;
  alumni_verification_submitted_at?: string | null;
  alumni_verification_reviewed_at?: string | null;
  reviewed_by_name?: string | null;
  full_name: string;
  student_id?: string | null;
  phone?: string | null;
  year_graduated?: number | null;
  address?: string | null;
  program_id?: number | null;
  program_name?: string | null;
  program_code?: string | null;
  source_survey_response_id?: number | null;
  survey_submitted_at?: string | null;
  linked_registry_id?: number | null;
  linked_registry_name?: string | null;
  linked_registry_status?: RegistryStatus | null;
  linked_registry_course_code?: string | null;
  linked_registry_batch_year?: number | null;
}

interface EditForm {
  id: number;
  full_name: string;
  course_code: string;
  batch_year: string;
  registration_status: RegistryStatus;
}

type ExportScope = 'filtered' | 'all' | 'course' | 'batch' | 'unclaimed' | 'registered';
type ExportFormat = 'csv' | 'xlsx';

const EMPTY_SUMMARY: RegistrySummary = {
  total_official_alumni: 0,
  registered_accounts: 0,
  unclaimed_alumni: 0,
  verified_alumni: 0,
  answered_alumni: 0,
  not_answered_alumni: 0,
  total_graduate_accounts: 0,
  pending_verification_accounts: 0,
  approved_verification_accounts: 0,
  rejected_verification_accounts: 0,
  course_totals: { BSCS: 0, ACT: 0, BSHM: 0, BSED: 0, BEED: 0 },
};

const DEFAULT_IMPORT_STATE: ImportState = {
  open: false,
  file_name: '',
  workbook: null,
  sheets: [],
  selected_sheet: '',
  detected_rows: [],
  preview: null,
  result: null,
  loading: false,
  saving: false,
  error: '',
  duplicate_behavior: 'skip',
};

const statusOptions: RegistryStatus[] = ['Unclaimed', 'Registered', 'Verified', 'Inactive'];
const courseCodeOrder = ['BSCS', 'ACT', 'BSHM', 'BSED', 'BEED'];
const maxImportSizeBytes = 10 * 1024 * 1024;
const surveyAnswerTabs: Array<{ value: SurveyAnswerStatus; label: string; countKey: SurveyAnswerCountKey }> = [
  { value: 'all', label: 'All Alumni', countKey: 'total_official_alumni' },
  { value: 'answered', label: 'Done Answering', countKey: 'answered_alumni' },
  { value: 'not_answered', label: 'Not Answered', countKey: 'not_answered_alumni' },
];

const accountReviewTabs: Array<{ value: AccountReviewFilter; label: string; countKey: AccountReviewCountKey }> = [
  { value: 'pending', label: 'Pending', countKey: 'pending_verification_accounts' },
  { value: 'approved', label: 'Approved', countKey: 'approved_verification_accounts' },
  { value: 'rejected', label: 'Rejected', countKey: 'rejected_verification_accounts' },
];

const headerAliases = {
  name: ['name', 'alumni name', 'full name', 'fullname', 'graduate name', 'alumni full name'],
  course: ['course', 'program', 'program name', 'course name', 'degree program', 'academic program'],
  batch: ['batch', 'graduation year', 'year graduated', 'year_graduated', 'yeargraduated', 'year'],
};

function normalizeHeader(value: unknown): string {
  return cellToText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return String(value.getFullYear());
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, '');
  }
  return String(value).trim();
}

function aliasKeys(values: string[]) {
  return values.map((value) => normalizeHeader(value));
}

const nameHeaderKeys = aliasKeys(headerAliases.name);
const courseHeaderKeys = aliasKeys(headerAliases.course);
const batchHeaderKeys = aliasKeys(headerAliases.batch);

function findHeaderMap(rows: unknown[][]): { rowIndex: number; nameIndex: number; courseIndex: number; batchIndex: number } | null {
  const maxRows = Math.min(rows.length, 30);
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    let nameIndex = -1;
    let courseIndex = -1;
    let batchIndex = -1;

    row.forEach((cell, index) => {
      const key = normalizeHeader(cell);
      if (nameIndex === -1 && nameHeaderKeys.includes(key)) nameIndex = index;
      if (courseIndex === -1 && courseHeaderKeys.includes(key)) courseIndex = index;
      if (batchIndex === -1 && batchHeaderKeys.includes(key)) batchIndex = index;
    });

    if (nameIndex >= 0 && courseIndex >= 0 && batchIndex >= 0) {
      return { rowIndex, nameIndex, courseIndex, batchIndex };
    }
  }

  return null;
}

function extractRowsFromSheet(workbook: XLSX.WorkBook, sheetName: string): { rows: ImportRow[]; error: string } {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { rows: [], error: 'Worksheet not found' };

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
  const headerMap = findHeaderMap(rows);
  if (!headerMap) {
    return { rows: [], error: 'Required columns were not found: Name, Course, and Batch' };
  }

  const detected: ImportRow[] = [];
  for (let index = headerMap.rowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const name = cellToText(row[headerMap.nameIndex]);
    const course = cellToText(row[headerMap.courseIndex]);
    const batch = cellToText(row[headerMap.batchIndex]);
    if (name === '' && course === '' && batch === '') continue;
    detected.push({
      row_number: index + 1,
      name,
      course,
      batch,
    });
  }

  return { rows: detected, error: '' };
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function sanitizeExportValue(value: unknown): string {
  const text = String(value ?? '');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvEscape(value: unknown): string {
  const safe = sanitizeExportValue(value);
  return `"${safe.replace(/"/g, '""')}"`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildErrorReportCsv(rows: ImportIssue[]) {
  const headers = ['Row Number', 'Name', 'Course', 'Batch', 'Error'];
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((row) => {
    lines.push([
      row.row_number,
      row.name,
      row.course,
      row.batch,
      row.error,
    ].map(csvEscape).join(','));
  });
  return lines.join('\r\n');
}

function linkedName(record: RegisteredAlumni) {
  return [record.linked_first_name, record.linked_middle_name, record.linked_last_name]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function AlumniRegisteredList() {
  const [records, setRecords] = useState<RegisteredAlumni[]>([]);
  const [reviewAccounts, setReviewAccounts] = useState<ReviewAccount[]>([]);
  const [summary, setSummary] = useState<RegistrySummary>(EMPTY_SUMMARY);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [batchYears, setBatchYears] = useState<number[]>([]);
  const [courseCodes, setCourseCodes] = useState<string[]>(courseCodeOrder);
  const [loading, setLoading] = useState(true);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [actionKey, setActionKey] = useState('');
  const [reviewFilter, setReviewFilter] = useState<AccountReviewFilter>('pending');
  const [reviewSearch, setReviewSearch] = useState('');
  const [search, setSearch] = useState('');
  const [courseId, setCourseId] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [batchYear, setBatchYear] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [surveyAnswerStatus, setSurveyAnswerStatus] = useState<SurveyAnswerStatus>('all');
  const [sort, setSort] = useState<SortKey>('import_date');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 10, pages: 1 });
  const [viewRecord, setViewRecord] = useState<RegisteredAlumni | null>(null);
  const [viewAccount, setViewAccount] = useState<ReviewAccount | null>(null);
  const [rejectAccount, setRejectAccount] = useState<ReviewAccount | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [linkRecord, setLinkRecord] = useState<RegisteredAlumni | null>(null);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkCandidates, setLinkCandidates] = useState<LinkCandidate[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [importState, setImportState] = useState<ImportState>(DEFAULT_IMPORT_STATE);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>('filtered');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('xlsx');
  const [exportCourse, setExportCourse] = useState('');
  const [exportBatch, setExportBatch] = useState('');
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [msgBox, setMsgBox] = useState<{
    isOpen: boolean;
    type: MessageType;
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  }>({ isOpen: false, type: 'info', message: '' });

  const queryParams = useCallback((targetPage = page, targetLimit = limit) => {
    const params = new URLSearchParams();
    params.set('page', String(targetPage));
    params.set('limit', String(targetLimit));
    params.set('sort', sort);
    params.set('direction', direction);
    if (search.trim()) params.set('search', search.trim());
    if (courseId) params.set('course_id', courseId);
    if (courseCode) params.set('course_code', courseCode);
    if (batchYear) params.set('batch_year', batchYear);
    if (statusFilter) params.set('registration_status', statusFilter);
    if (surveyAnswerStatus !== 'all') params.set('survey_answer_status', surveyAnswerStatus);
    return params;
  }, [batchYear, courseCode, courseId, direction, limit, page, search, sort, statusFilter, surveyAnswerStatus]);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.ALUMNI_REGISTRY}?action=summary`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Unable to load alumni registry summary');
      }

      const payload = data as SummaryResponse & { success: boolean };
      setSummary(payload.summary || EMPTY_SUMMARY);
      setPrograms(Array.isArray(payload.filters?.programs) ? payload.filters.programs : []);
      setBatchYears(Array.isArray(payload.filters?.batch_years) ? payload.filters.batch_years : []);
      setCourseCodes(Array.isArray(payload.filters?.course_codes) && payload.filters.course_codes.length > 0 ? payload.filters.course_codes : courseCodeOrder);
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to load alumni registry summary',
      });
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.ALUMNI_REGISTRY}?${queryParams().toString()}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Unable to load alumni registry records');
      }

      setRecords(Array.isArray(data.data) ? data.data : []);
      setPagination(data.pagination || { total: 0, page, limit, pages: 1 });
    } catch (error) {
      setRecords([]);
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to load alumni registry records',
      });
    } finally {
      setLoading(false);
    }
  }, [limit, page, queryParams]);

  const fetchReviewAccounts = useCallback(async () => {
    setReviewLoading(true);
    try {
      const params = new URLSearchParams({
        action: 'pending_accounts',
        verification_status: reviewFilter,
        limit: '50',
      });
      if (reviewSearch.trim()) params.set('search', reviewSearch.trim());

      const response = await fetch(`${API_ENDPOINTS.ALUMNI_REGISTRY}?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Unable to load alumni account verification queue');
      }

      setReviewAccounts(Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      setReviewAccounts([]);
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to load alumni account verification queue',
      });
    } finally {
      setReviewLoading(false);
    }
  }, [reviewFilter, reviewSearch]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    void fetchReviewAccounts();
  }, [fetchReviewAccounts]);

  const refreshAll = async () => {
    await Promise.all([fetchSummary(), fetchRecords(), fetchReviewAccounts()]);
  };

  const resetFilters = () => {
    setSearch('');
    setCourseId('');
    setCourseCode('');
    setBatchYear('');
    setStatusFilter('');
    setSurveyAnswerStatus('all');
    setSort('import_date');
    setDirection('desc');
    setPage(1);
  };

  const toggleSort = (nextSort: SortKey) => {
    setPage(1);
    if (sort === nextSort) {
      setDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(nextSort);
      setDirection(nextSort === 'import_date' ? 'desc' : 'asc');
    }
  };

  const openEdit = (record: RegisteredAlumni) => {
    setEditForm({
      id: record.id,
      full_name: record.full_name,
      course_code: record.course_code,
      batch_year: String(record.batch_year),
      registration_status: record.registration_status,
    });
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editForm) return;
    setActionKey(`edit-${editForm.id}`);
    try {
      const response = await fetch(`${API_ENDPOINTS.ALUMNI_REGISTRY}?action=update`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Unable to update registry record');
      }

      setEditForm(null);
      await refreshAll();
      setMsgBox({ isOpen: true, type: 'success', message: data.message || 'Registry record updated.' });
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to update registry record',
      });
    } finally {
      setActionKey('');
    }
  };

  const runRecordAction = async (record: RegisteredAlumni, action: 'verify' | 'inactive' | 'unlink') => {
    const actionLabel = action === 'verify' ? 'Verify' : action === 'inactive' ? 'Mark Inactive' : 'Unlink';
    setActionKey(`${action}-${record.id}`);
    try {
      const response = await fetch(`${API_ENDPOINTS.ALUMNI_REGISTRY}?action=${action}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id }),
      });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.error || `Unable to ${actionLabel.toLowerCase()} record`);
      }

      await refreshAll();
      setMsgBox({ isOpen: true, type: 'success', message: data.message || `${actionLabel} completed.` });
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : `Unable to ${actionLabel.toLowerCase()} record`,
      });
    } finally {
      setActionKey('');
    }
  };

  const confirmStatusAction = (record: RegisteredAlumni, action: 'verify' | 'inactive' | 'unlink') => {
    const title = action === 'verify' ? 'Verify Alumni' : action === 'inactive' ? 'Mark Inactive' : 'Unlink Account';
    const message = action === 'verify'
      ? `Verify ${record.full_name}?`
      : action === 'inactive'
        ? `Mark ${record.full_name} as inactive?`
        : `Unlink ${record.full_name} from the connected account?`;

    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title,
      message,
      confirmText: title,
      onConfirm: () => {
        void runRecordAction(record, action);
      },
    });
  };

  const confirmDelete = (record: RegisteredAlumni) => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Registry Record',
      message: `Delete ${record.full_name} from the official alumni registry?`,
      confirmText: 'Delete',
      onConfirm: async () => {
        setActionKey(`delete-${record.id}`);
        try {
          const response = await fetch(API_ENDPOINTS.ALUMNI_REGISTRY, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: record.id }),
          });
          const data = await response.json();
          if (!response.ok || data.success === false) {
            throw new Error(data.error || 'Unable to delete registry record');
          }

          await refreshAll();
          setMsgBox({ isOpen: true, type: 'success', message: data.message || 'Registry record deleted.' });
        } catch (error) {
          setMsgBox({
            isOpen: true,
            type: 'error',
            message: error instanceof Error ? error.message : 'Unable to delete registry record',
          });
        } finally {
          setActionKey('');
        }
      },
    });
  };

  const fetchLinkCandidates = useCallback(async (record: RegisteredAlumni, searchText = '') => {
    setLinkLoading(true);
    try {
      const params = new URLSearchParams({ action: 'accounts', registry_id: String(record.id) });
      if (searchText.trim()) params.set('search', searchText.trim());
      const response = await fetch(`${API_ENDPOINTS.ALUMNI_REGISTRY}?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Unable to load account candidates');
      }
      setLinkCandidates(Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      setLinkCandidates([]);
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to load account candidates',
      });
    } finally {
      setLinkLoading(false);
    }
  }, []);

  const openLink = (record: RegisteredAlumni) => {
    setLinkRecord(record);
    setLinkSearch('');
    setLinkCandidates([]);
    void fetchLinkCandidates(record);
  };

  const linkAccount = async (candidate: LinkCandidate, markVerified: boolean) => {
    if (!linkRecord) return;
    setActionKey(`link-${candidate.account_id}`);
    try {
      const response = await fetch(`${API_ENDPOINTS.ALUMNI_REGISTRY}?action=link`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: linkRecord.id,
          graduate_account_id: candidate.account_id,
          mark_verified: markVerified,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Unable to link account');
      }

      setLinkRecord(null);
      await refreshAll();
      setMsgBox({ isOpen: true, type: 'success', message: data.message || 'Account linked.' });
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to link account',
      });
    } finally {
      setActionKey('');
    }
  };

  const reviewAccountAction = async (account: ReviewAccount, decision: 'approve' | 'reject', reason = '') => {
    setActionKey(`${decision}-account-${account.account_id}`);
    try {
      const response = await fetch(`${API_ENDPOINTS.ALUMNI_REGISTRY}?action=${decision}_account`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          graduate_account_id: account.account_id,
          rejection_reason: reason,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.error || `Unable to ${decision} alumni account`);
      }

      setViewAccount(null);
      setRejectAccount(null);
      setRejectReason('');
      await refreshAll();
      setMsgBox({
        isOpen: true,
        type: 'success',
        message: data.message || (decision === 'approve' ? 'Account approved.' : 'Account rejected.'),
      });
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : `Unable to ${decision} alumni account`,
      });
    } finally {
      setActionKey('');
    }
  };

  const confirmApproveAccount = (account: ReviewAccount) => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Approve Alumni Account',
      message: `Approve ${account.full_name} for Graduate Portal access?`,
      confirmText: 'Approve',
      onConfirm: () => {
        void reviewAccountAction(account, 'approve');
      },
    });
  };

  const openRejectAccount = (account: ReviewAccount) => {
    setRejectAccount(account);
    setRejectReason('');
  };

  const submitRejectAccount = (event: FormEvent) => {
    event.preventDefault();
    if (!rejectAccount) return;
    void reviewAccountAction(rejectAccount, 'reject', rejectReason);
  };

  const previewImport = async (workbook: XLSX.WorkBook, sheetName: string, fileName: string) => {
    const extracted = extractRowsFromSheet(workbook, sheetName);
    if (extracted.error) {
      setImportState((prev) => ({
        ...prev,
        selected_sheet: sheetName,
        detected_rows: [],
        preview: null,
        result: null,
        loading: false,
        error: extracted.error,
      }));
      return;
    }

    setImportState((prev) => ({
      ...prev,
      selected_sheet: sheetName,
      detected_rows: extracted.rows,
      preview: null,
      result: null,
      loading: true,
      error: '',
    }));

    try {
      const response = await fetch(`${API_ENDPOINTS.ALUMNI_REGISTRY}?action=preview`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: fileName,
          worksheet_name: sheetName,
          rows: extracted.rows,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Unable to preview import file');
      }

      setImportState((prev) => ({
        ...prev,
        detected_rows: extracted.rows,
        preview: data.preview,
        loading: false,
        error: '',
      }));
    } catch (error) {
      setImportState((prev) => ({
        ...prev,
        preview: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Unable to preview import file',
      }));
    }
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['xlsx', 'csv'].includes(extension)) {
      setMsgBox({ isOpen: true, type: 'error', message: 'Only .xlsx and .csv files are supported.' });
      return;
    }

    if (file.size > maxImportSizeBytes) {
      setMsgBox({ isOpen: true, type: 'error', message: 'Import file must be 10 MB or smaller.' });
      return;
    }

    try {
      setImportState({
        ...DEFAULT_IMPORT_STATE,
        open: true,
        file_name: file.name,
        loading: true,
      });

      const workbook = extension === 'csv'
        ? XLSX.read(await file.text(), { type: 'string', raw: true })
        : XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true });

      const sheets = workbook.SheetNames || [];
      if (sheets.length === 0) {
        throw new Error('No worksheet was found in this file');
      }

      const defaultSheet = sheets.find((sheet) => sheet.trim().toLowerCase() === 'registered alumni') || sheets[0];
      setImportState((prev) => ({
        ...prev,
        workbook,
        sheets,
        selected_sheet: defaultSheet,
        loading: false,
      }));
      await previewImport(workbook, defaultSheet, file.name);
    } catch (error) {
      setImportState((prev) => ({
        ...prev,
        workbook: null,
        sheets: [],
        loading: false,
        error: error instanceof Error ? error.message : 'Unable to read import file',
      }));
    }
  };

  const chooseImportFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const changeWorksheet = (sheetName: string) => {
    if (!importState.workbook) return;
    void previewImport(importState.workbook, sheetName, importState.file_name);
  };

  const confirmImport = () => {
    const preview = importState.preview;
    if (!preview || !importState.workbook) return;
    const importable = preview.valid_rows + (importState.duplicate_behavior === 'update' ? preview.duplicate_rows : 0);
    if (importable === 0) {
      setMsgBox({ isOpen: true, type: 'warning', message: 'There are no valid rows to import.' });
      return;
    }

    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Confirm Import',
      message: `Import ${preview.valid_rows} valid row${preview.valid_rows === 1 ? '' : 's'} from ${importState.selected_sheet}?`,
      confirmText: 'Import',
      onConfirm: () => {
        void saveImport();
      },
    });
  };

  const saveImport = async () => {
    setImportState((prev) => ({ ...prev, saving: true, result: null, error: '' }));
    try {
      const response = await fetch(`${API_ENDPOINTS.ALUMNI_REGISTRY}?action=import`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: importState.file_name,
          worksheet_name: importState.selected_sheet,
          rows: importState.detected_rows,
          duplicate_behavior: importState.duplicate_behavior,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Unable to import alumni registry file');
      }

      setImportState((prev) => ({
        ...prev,
        saving: false,
        result: data.result,
      }));
      await refreshAll();
    } catch (error) {
      setImportState((prev) => ({
        ...prev,
        saving: false,
        error: error instanceof Error ? error.message : 'Unable to import alumni registry file',
      }));
    }
  };

  const downloadImportErrorReport = (rows: ImportIssue[], fileNamePrefix = 'gradtrack_alumni_import_errors') => {
    const csv = buildErrorReportCsv(rows);
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${fileNamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const exportParams = () => {
    const params = new URLSearchParams({ action: 'export', format: exportFormat === 'csv' ? 'csv' : 'json' });

    if (exportScope === 'filtered') {
      const current = queryParams(1, pagination.total || 50000);
      current.forEach((value, key) => {
        if (!['page', 'limit'].includes(key)) params.set(key, value);
      });
    } else if (exportScope === 'course' && exportCourse) {
      params.set('course_code', exportCourse);
    } else if (exportScope === 'batch' && exportBatch) {
      params.set('batch_year', exportBatch);
    } else if (exportScope === 'unclaimed') {
      params.set('scope', 'unclaimed');
    } else if (exportScope === 'registered') {
      params.set('scope', 'registered');
    }

    return params;
  };

  const runExport = async () => {
    if (exportScope === 'course' && !exportCourse) {
      setMsgBox({ isOpen: true, type: 'warning', message: 'Select a course code for this export.' });
      return;
    }
    if (exportScope === 'batch' && !exportBatch) {
      setMsgBox({ isOpen: true, type: 'warning', message: 'Select a batch year for this export.' });
      return;
    }

    setExporting(true);
    try {
      const params = exportParams();
      const response = await fetch(`${API_ENDPOINTS.ALUMNI_REGISTRY}?${params.toString()}`, {
        credentials: 'include',
      });

      if (exportFormat === 'csv') {
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => null);
          throw new Error(errorPayload?.error || 'Unable to export CSV');
        }
        const blob = await response.blob();
        downloadBlob(blob, `gradtrack_registered_alumni_${new Date().toISOString().slice(0, 10)}.csv`);
      } else {
        const data = await response.json();
        if (!response.ok || data.success === false) {
          throw new Error(data.error || 'Unable to export XLSX');
        }
        const rows = Array.isArray(data.data) ? data.data : [];
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Registered Alumni');
        XLSX.writeFile(workbook, data.filename || `gradtrack_registered_alumni_${new Date().toISOString().slice(0, 10)}.xlsx`);
      }

      setExportOpen(false);
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to export alumni registry records',
      });
    } finally {
      setExporting(false);
    }
  };

  const visibleStart = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const visibleEnd = Math.min(pagination.total, pagination.page * pagination.limit);
  const recognizedPreview = importState.preview ? Object.entries(importState.preview.recognized_courses) : [];
  const unrecognizedPreview = importState.preview ? Object.entries(importState.preview.unrecognized_courses) : [];
  const importErrors = importState.result?.errors || [
    ...(importState.preview?.invalid || []),
    ...(importState.preview?.duplicates || []),
  ];

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.csv"
        className="hidden"
        onChange={handleImportFile}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1b2a4a]">Alumni Registered List</h1>
          <p className="text-sm text-gray-500">{pagination.total} official alumni record{pagination.total === 1 ? '' : 's'}</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={chooseImportFile}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            <Upload className="h-4 w-4" />
            Import Alumni List
          </button>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-200 bg-white px-4 py-2.5 text-sm font-semibold text-green-700 hover:bg-green-50"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1b2a4a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#263c66]"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <AccountReviewPanel
        accounts={reviewAccounts}
        loading={reviewLoading}
        summary={summary}
        summaryLoading={summaryLoading}
        filter={reviewFilter}
        search={reviewSearch}
        actionKey={actionKey}
        onFilterChange={setReviewFilter}
        onSearchChange={setReviewSearch}
        onRefresh={fetchReviewAccounts}
        onView={setViewAccount}
        onApprove={confirmApproveAccount}
        onReject={openRejectAccount}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {courseCodeOrder.map((code) => (
          <div key={code} className="rounded-lg border bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold text-gray-500">{code}</p>
            <p className="mt-1 text-xl font-bold text-[#1b2a4a]">{summary.course_totals?.[code] ?? 0}</p>
          </div>
        ))}
      </div>

      <nav aria-label="Survey answer list navigation" className="flex flex-wrap gap-2">
        {surveyAnswerTabs.map((tab) => {
          const active = surveyAnswerStatus === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setSurveyAnswerStatus(tab.value);
                setStatusFilter('');
                setPage(1);
              }}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                active
                  ? 'border-[#1b2a4a] bg-[#1b2a4a] text-white shadow-sm'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {summaryLoading ? '...' : summary[tab.countKey]}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[1fr_180px_150px_150px_170px_auto] xl:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              className="w-full rounded-lg border px-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search alumni name"
            />
          </div>
          <select
            value={courseId}
            onChange={(event) => { setCourseId(event.target.value); setPage(1); }}
            className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Courses</option>
            {programs.map((program) => (
              <option key={program.id} value={program.id}>{program.code}</option>
            ))}
          </select>
          <select
            value={courseCode}
            onChange={(event) => { setCourseCode(event.target.value); setPage(1); }}
            className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Codes</option>
            {courseCodes.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
          <select
            value={batchYear}
            onChange={(event) => { setBatchYear(event.target.value); setPage(1); }}
            className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Batches</option>
            {batchYears.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setSurveyAnswerStatus('all');
              setPage(1);
            }}
            className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-lg border px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-600">
            Showing {visibleStart}-{visibleEnd} of {pagination.total}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Rows</span>
            <select
              value={limit}
              onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}
              className="rounded-lg border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[10, 25, 50, 100].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="divide-y md:hidden">
          {loading ? (
            <LoadingBlock label="Loading alumni records..." />
          ) : records.length === 0 ? (
            <EmptyBlock label="No official alumni records match the current filters." />
          ) : (
            records.map((record, index) => (
              <button
                key={record.id}
                type="button"
                onClick={() => setViewRecord(record)}
                className="block w-full p-4 text-left transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              >
                <div className="grid gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-400">No. {(pagination.page - 1) * pagination.limit + index + 1}</p>
                    <p className="mt-1 font-semibold text-[#1b2a4a]">{record.full_name}</p>
                  </div>
                  <div className="grid gap-2 text-sm text-gray-600 sm:grid-cols-[1fr_96px]">
                    <p>{record.course_name}</p>
                    <p className="font-medium text-gray-700">Batch {record.batch_year}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-sm">
            <colgroup>
              <col className="w-20" />
              <col className="w-[34%]" />
              <col />
              <col className="w-28" />
            </colgroup>
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">No.</th>
                <SortableTh label="Alumni Name" sortKey="name" currentSort={sort} direction={direction} onSort={toggleSort} />
                <SortableTh label="Course" sortKey="course" currentSort={sort} direction={direction} onSort={toggleSort} />
                <SortableTh label="Batch" sortKey="batch" currentSort={sort} direction={direction} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4}><LoadingBlock label="Loading alumni records..." /></td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={4}><EmptyBlock label="No official alumni records match the current filters." /></td></tr>
              ) : (
                records.map((record, index) => (
                  <tr
                    key={record.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setViewRecord(record)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setViewRecord(record);
                      }
                    }}
                    className="cursor-pointer border-b transition last:border-0 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                  >
                    <td className="px-4 py-3 text-gray-500">{(pagination.page - 1) * pagination.limit + index + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#1b2a4a]">{record.full_name}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{record.course_name}</td>
                    <td className="px-4 py-3 text-gray-700">{record.batch_year}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">Page {pagination.page} of {Math.max(1, pagination.pages)}</p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="rounded-lg p-2 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(Math.max(1, pagination.pages), prev + 1))}
              disabled={page >= Math.max(1, pagination.pages)}
              className="rounded-lg p-2 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {viewRecord && (
        <DetailModal
          record={viewRecord}
          actionKey={actionKey}
          onClose={() => setViewRecord(null)}
          onEdit={(record) => {
            setViewRecord(null);
            openEdit(record);
          }}
          onLink={(record) => {
            setViewRecord(null);
            openLink(record);
          }}
          onConfirmStatus={(record, action) => {
            setViewRecord(null);
            confirmStatusAction(record, action);
          }}
          onDelete={(record) => {
            setViewRecord(null);
            confirmDelete(record);
          }}
        />
      )}

      {viewAccount && (
        <AccountDetailModal
          account={viewAccount}
          actionKey={actionKey}
          onClose={() => setViewAccount(null)}
          onApprove={confirmApproveAccount}
          onReject={openRejectAccount}
        />
      )}

      {rejectAccount && (
        <RejectAccountModal
          account={rejectAccount}
          reason={rejectReason}
          saving={actionKey === `reject-account-${rejectAccount.account_id}`}
          onReasonChange={setRejectReason}
          onClose={() => setRejectAccount(null)}
          onSubmit={submitRejectAccount}
        />
      )}

      {editForm && (
        <EditModal
          form={editForm}
          programs={programs}
          saving={actionKey === `edit-${editForm.id}`}
          onClose={() => setEditForm(null)}
          onChange={setEditForm}
          onSubmit={saveEdit}
        />
      )}

      {linkRecord && (
        <LinkModal
          record={linkRecord}
          search={linkSearch}
          candidates={linkCandidates}
          loading={linkLoading}
          actionKey={actionKey}
          onSearchChange={setLinkSearch}
          onSearch={() => void fetchLinkCandidates(linkRecord, linkSearch)}
          onClose={() => setLinkRecord(null)}
          onLink={linkAccount}
        />
      )}

      {importState.open && (
        <ImportModal
          state={importState}
          recognizedPreview={recognizedPreview}
          unrecognizedPreview={unrecognizedPreview}
          importErrors={importErrors}
          onClose={() => setImportState(DEFAULT_IMPORT_STATE)}
          onWorksheetChange={changeWorksheet}
          onBehaviorChange={(duplicate_behavior) => setImportState((prev) => ({ ...prev, duplicate_behavior }))}
          onConfirmImport={confirmImport}
          onDownloadErrors={() => downloadImportErrorReport(importErrors)}
        />
      )}

      {exportOpen && (
        <ExportModal
          scope={exportScope}
          format={exportFormat}
          course={exportCourse}
          batch={exportBatch}
          courseCodes={courseCodes}
          batchYears={batchYears}
          exporting={exporting}
          onScopeChange={setExportScope}
          onFormatChange={setExportFormat}
          onCourseChange={setExportCourse}
          onBatchChange={setExportBatch}
          onClose={() => setExportOpen(false)}
          onExport={runExport}
        />
      )}

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox((prev) => ({ ...prev, isOpen: false }))}
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

function AccountReviewPanel({
  accounts,
  loading,
  summary,
  summaryLoading,
  filter,
  search,
  actionKey,
  onFilterChange,
  onSearchChange,
  onRefresh,
  onView,
  onApprove,
  onReject,
}: {
  accounts: ReviewAccount[];
  loading: boolean;
  summary: RegistrySummary;
  summaryLoading: boolean;
  filter: AccountReviewFilter;
  search: string;
  actionKey: string;
  onFilterChange: (filter: AccountReviewFilter) => void;
  onSearchChange: (search: string) => void;
  onRefresh: () => void | Promise<void>;
  onView: (account: ReviewAccount) => void;
  onApprove: (account: ReviewAccount) => void;
  onReject: (account: ReviewAccount) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b bg-gray-50 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-700" />
            <h2 className="text-lg font-bold text-[#1b2a4a]">Alumni Verification</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">Review Graduate Portal accounts before alumni access is granted.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="w-full rounded-lg border bg-white px-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-72"
              placeholder="Search pending accounts"
            />
          </div>
          <button
            type="button"
            onClick={() => void onRefresh()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-white"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="border-b px-4 py-3">
        <nav aria-label="Alumni account verification filters" className="flex flex-wrap gap-2">
          {accountReviewTabs.map((tab) => {
            const active = filter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => onFilterChange(tab.value)}
                className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? 'border-blue-700 bg-blue-700 text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.value === 'pending' && <Clock3 className="h-4 w-4" />}
                {tab.value === 'approved' && <CheckCircle2 className="h-4 w-4" />}
                {tab.value === 'rejected' && <AlertTriangle className="h-4 w-4" />}
                <span>{tab.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {summaryLoading ? '...' : summary[tab.countKey]}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Graduate</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Program</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Submitted</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Registry Evidence</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}><LoadingBlock label="Loading alumni account verification queue..." /></td></tr>
            ) : accounts.length === 0 ? (
              <tr><td colSpan={6}><EmptyBlock label="No alumni accounts match this verification filter." /></td></tr>
            ) : (
              accounts.map((account) => (
                <tr key={account.account_id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#1b2a4a]">{account.full_name || '-'}</p>
                    <p className="mt-1 text-xs text-gray-500">{account.email}</p>
                    <p className="mt-1 text-xs text-gray-500">Student ID: {account.student_id || '-'}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <p className="font-medium text-gray-800">{account.program_code || '-'}</p>
                    <p className="mt-1 text-xs text-gray-500">Batch {account.year_graduated || '-'}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDateTime(account.alumni_verification_submitted_at || account.survey_submitted_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {account.linked_registry_id ? (
                      <>
                        <p className="font-medium text-gray-800">{account.linked_registry_name}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {account.linked_registry_course_code || '-'} Batch {account.linked_registry_batch_year || '-'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">Registry: {account.linked_registry_status || '-'}</p>
                      </>
                    ) : (
                      <span className="text-amber-700">No linked registry record</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <VerificationBadge status={account.alumni_verification_status} />
                    {account.alumni_verification_reason && (
                      <p className="mt-2 max-w-[220px] truncate text-xs text-gray-500" title={account.alumni_verification_reason}>
                        {account.alumni_verification_reason}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <IconButton title="View details" onClick={() => onView(account)} disabled={actionKey !== ''} className="text-blue-600 hover:bg-blue-50">
                        <Search className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        title="Approve account"
                        onClick={() => onApprove(account)}
                        disabled={actionKey !== '' || account.alumni_verification_status === 'approved'}
                        className="text-emerald-600 hover:bg-emerald-50"
                      >
                        {actionKey === `approve-account-${account.account_id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                      </IconButton>
                      <IconButton
                        title="Reject account"
                        onClick={() => onReject(account)}
                        disabled={actionKey !== '' || account.alumni_verification_status === 'rejected'}
                        className="text-red-600 hover:bg-red-50"
                      >
                        {actionKey === `reject-account-${account.account_id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AccountDetailModal({
  account,
  actionKey,
  onClose,
  onApprove,
  onReject,
}: {
  account: ReviewAccount;
  actionKey: string;
  onClose: () => void;
  onApprove: (account: ReviewAccount) => void;
  onReject: (account: ReviewAccount) => void;
}) {
  const busy = actionKey !== '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <ModalHeader title="Alumni Account Details" subtitle={account.full_name} onClose={onClose} />
        <div className="grid gap-3 px-5 py-4 text-sm text-gray-700 sm:grid-cols-2">
          <Info label="Verification Status" value={account.alumni_verification_status} />
          <Info label="Portal Account Status" value={account.account_status} />
          <Info label="Email" value={account.email} />
          <Info label="Student ID" value={account.student_id || '-'} />
          <Info label="Program" value={account.program_name || account.program_code || '-'} />
          <Info label="Year Graduated" value={account.year_graduated || '-'} />
          <Info label="Phone" value={account.phone || '-'} />
          <Info label="Address" value={account.address || '-'} />
          <Info label="Survey Submitted" value={formatDateTime(account.survey_submitted_at)} />
          <Info label="Review Submitted" value={formatDateTime(account.alumni_verification_submitted_at)} />
          <Info label="Reviewed By" value={account.reviewed_by_name || '-'} />
          <Info label="Reviewed At" value={formatDateTime(account.alumni_verification_reviewed_at)} />
          <Info label="Linked Registry" value={account.linked_registry_name || '-'} />
          <Info
            label="Registry Match"
            value={account.linked_registry_id ? `${account.linked_registry_course_code || '-'} Batch ${account.linked_registry_batch_year || '-'}` : '-'}
          />
        </div>
        {account.alumni_verification_reason && (
          <div className="mx-5 mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p className="font-semibold">Rejection Reason</p>
            <p className="mt-1 whitespace-pre-line">{account.alumni_verification_reason}</p>
          </div>
        )}
        <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onApprove(account)}
              disabled={busy || account.alumni_verification_status === 'approved'}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {actionKey === `approve-account-${account.account_id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
              Approve
            </button>
            <button
              type="button"
              onClick={() => onReject(account)}
              disabled={busy || account.alumni_verification_status === 'rejected'}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              <UserX className="h-4 w-4" />
              Reject
            </button>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  );
}

function RejectAccountModal({
  account,
  reason,
  saving,
  onReasonChange,
  onClose,
  onSubmit,
}: {
  account: ReviewAccount;
  reason: string;
  saving: boolean;
  onReasonChange: (reason: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <ModalHeader title="Reject Alumni Account" subtitle={account.full_name} onClose={onClose} />
        <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Rejected accounts cannot access the Graduate Portal. The reason will be shown when the graduate tries to sign in.
          </div>
          <Field label="Rejection Reason">
            <textarea
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              rows={5}
              maxLength={1000}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional reason for the graduate"
            />
          </Field>
          <div className="flex justify-end gap-2 border-t pt-4">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
              Reject Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VerificationBadge({ status }: { status?: VerificationStatus | string | null }) {
  const normalized = (status || 'pending') as VerificationStatus;
  const styles: Record<VerificationStatus, string> = {
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rejected: 'border-red-200 bg-red-50 text-red-700',
  };
  const labels: Record<VerificationStatus, string> = {
    pending: 'Pending Verification',
    approved: 'Approved Alumni',
    rejected: 'Rejected',
  };
  const value = ['pending', 'approved', 'rejected'].includes(normalized) ? normalized : 'pending';

  return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${styles[value]}`}>{labels[value]}</span>;
}

function SortableTh({
  label,
  sortKey,
  currentSort,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  direction: SortDirection;
  onSort: (sort: SortKey) => void;
}) {
  const active = currentSort === sortKey;
  return (
    <th className="px-4 py-3 text-left font-semibold text-gray-600">
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 hover:text-blue-700">
        {label}
        <span className="text-[10px]">{active ? (direction === 'asc' ? 'ASC' : 'DESC') : ''}</span>
      </button>
    </th>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label}
    </div>
  );
}

function EmptyBlock({ label }: { label: string }) {
  return <div className="py-12 text-center text-sm text-gray-500">{label}</div>;
}

function ActionButtons({
  record,
  actionKey,
  onEdit,
  onLink,
  onConfirmStatus,
  onDelete,
}: {
  record: RegisteredAlumni;
  actionKey: string;
  onEdit: (record: RegisteredAlumni) => void;
  onLink: (record: RegisteredAlumni) => void;
  onConfirmStatus: (record: RegisteredAlumni, action: 'verify' | 'inactive' | 'unlink') => void;
  onDelete: (record: RegisteredAlumni) => void;
}) {
  const busy = actionKey !== '';
  return (
    <>
      <IconButton title="Edit registry information" onClick={() => onEdit(record)} disabled={busy} className="text-blue-600 hover:bg-blue-50">
        <Edit2 className="h-4 w-4" />
      </IconButton>
      {record.linked_user_id ? (
        <IconButton title="Unlink account" onClick={() => onConfirmStatus(record, 'unlink')} disabled={busy} className="text-amber-600 hover:bg-amber-50">
          {actionKey === `unlink-${record.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink2 className="h-4 w-4" />}
        </IconButton>
      ) : (
        <IconButton title="Link to existing alumni account" onClick={() => onLink(record)} disabled={busy} className="text-green-600 hover:bg-green-50">
          <Link2 className="h-4 w-4" />
        </IconButton>
      )}
      <IconButton title="Verify alumni" onClick={() => onConfirmStatus(record, 'verify')} disabled={busy || record.registration_status === 'Verified'} className="text-emerald-600 hover:bg-emerald-50">
        {actionKey === `verify-${record.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
      </IconButton>
      <IconButton title="Mark inactive" onClick={() => onConfirmStatus(record, 'inactive')} disabled={busy || record.registration_status === 'Inactive'} className="text-gray-600 hover:bg-gray-100">
        {actionKey === `inactive-${record.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
      </IconButton>
      <IconButton title="Delete registry record" onClick={() => onDelete(record)} disabled={busy} className="text-red-600 hover:bg-red-50">
        {actionKey === `delete-${record.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </IconButton>
    </>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  className,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

function DetailModal({
  record,
  actionKey,
  onClose,
  onEdit,
  onLink,
  onConfirmStatus,
  onDelete,
}: {
  record: RegisteredAlumni;
  actionKey: string;
  onClose: () => void;
  onEdit: (record: RegisteredAlumni) => void;
  onLink: (record: RegisteredAlumni) => void;
  onConfirmStatus: (record: RegisteredAlumni, action: 'verify' | 'inactive' | 'unlink') => void;
  onDelete: (record: RegisteredAlumni) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <ModalHeader title="Alumni Details" subtitle={record.full_name} onClose={onClose} />
        <div className="grid gap-3 px-5 py-4 text-sm text-gray-700 sm:grid-cols-2">
          <Info label="Course" value={record.course_name} />
          <Info label="Course Code" value={record.course_code} />
          <Info label="Batch" value={record.batch_year} />
          <Info label="Account Status" value={record.registration_status} />
          <Info label="Date Imported" value={formatDateTime(record.created_at)} />
          <Info label="Source File" value={record.source_file || '-'} />
          <Info label="Linked Account" value={record.linked_email || '-'} />
          <Info label="Portal Status" value={record.linked_account_status || '-'} />
          <Info label="Verification Status" value={record.linked_verification_status || '-'} />
          <Info label="Linked Name" value={linkedName(record) || '-'} />
        </div>
        {record.linked_verification_reason && (
          <div className="mx-5 mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <p className="font-semibold">Account Review Reason</p>
            <p className="mt-1 whitespace-pre-line">{record.linked_verification_reason}</p>
          </div>
        )}
        <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1">
            <ActionButtons
              record={record}
              actionKey={actionKey}
              onEdit={onEdit}
              onLink={onLink}
              onConfirmStatus={onConfirmStatus}
              onDelete={onDelete}
            />
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </div>
  );
}

function EditModal({
  form,
  programs,
  saving,
  onClose,
  onChange,
  onSubmit,
}: {
  form: EditForm;
  programs: ProgramOption[];
  saving: boolean;
  onClose: () => void;
  onChange: (form: EditForm) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <ModalHeader title="Edit Registry Record" subtitle={form.full_name} onClose={onClose} />
        <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
          <Field label="Alumni Name">
            <input
              value={form.full_name}
              onChange={(event) => onChange({ ...form, full_name: event.target.value })}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Course">
              <select
                value={form.course_code}
                onChange={(event) => onChange({ ...form, course_code: event.target.value })}
                required
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {programs.map((program) => (
                  <option key={program.code} value={program.code}>{program.code} - {program.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Batch">
              <input
                value={form.batch_year}
                onChange={(event) => onChange({ ...form, batch_year: event.target.value.replace(/\D/g, '').slice(0, 4) })}
                required
                inputMode="numeric"
                pattern="[0-9]{4}"
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
          </div>
          <Field label="Account Status">
            <select
              value={form.registration_status}
              onChange={(event) => onChange({ ...form, registration_status: event.target.value as RegistryStatus })}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2 border-t pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-[#1b2a4a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#263c66] disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LinkModal({
  record,
  search,
  candidates,
  loading,
  actionKey,
  onSearchChange,
  onSearch,
  onClose,
  onLink,
}: {
  record: RegisteredAlumni;
  search: string;
  candidates: LinkCandidate[];
  loading: boolean;
  actionKey: string;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onClose: () => void;
  onLink: (candidate: LinkCandidate, markVerified: boolean) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <ModalHeader title="Link Alumni Account" subtitle={`${record.full_name} - ${record.course_code} ${record.batch_year}`} onClose={onClose} />
        <div className="border-b px-5 py-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onSearch();
                }}
                className="w-full rounded-lg border px-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search account name or email"
              />
            </div>
            <button type="button" onClick={onSearch} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
              Search
            </button>
          </div>
        </div>
        <div className="space-y-3 overflow-y-auto px-5 py-4">
          {loading ? (
            <LoadingBlock label="Loading account candidates..." />
          ) : candidates.length === 0 ? (
            <EmptyBlock label="No matching alumni accounts found." />
          ) : (
            candidates.map((candidate) => (
              <div key={candidate.account_id} className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[#1b2a4a]">{candidate.full_name}</p>
                      <MatchBadge strength={candidate.match_strength} />
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{candidate.email}</p>
                    <p className="mt-1 text-sm text-gray-600">
                      {candidate.program_code || candidate.program_name || '-'} - Batch {candidate.batch_year || '-'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={actionKey !== ''}
                      onClick={() => onLink(candidate, false)}
                      className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                    >
                      {actionKey === `link-${candidate.account_id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                      Link
                    </button>
                    <button
                      type="button"
                      disabled={actionKey !== ''}
                      onClick={() => onLink(candidate, true)}
                      className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Link & Verify
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ImportModal({
  state,
  recognizedPreview,
  unrecognizedPreview,
  importErrors,
  onClose,
  onWorksheetChange,
  onBehaviorChange,
  onConfirmImport,
  onDownloadErrors,
}: {
  state: ImportState;
  recognizedPreview: Array<[string, number]>;
  unrecognizedPreview: Array<[string, number]>;
  importErrors: ImportIssue[];
  onClose: () => void;
  onWorksheetChange: (sheet: string) => void;
  onBehaviorChange: (behavior: 'skip' | 'update' | 'cancel') => void;
  onConfirmImport: () => void;
  onDownloadErrors: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <ModalHeader title="Import Alumni List" subtitle={state.file_name} onClose={onClose} />
        <div className="grid gap-3 border-b px-5 py-4 lg:grid-cols-[1fr_220px] lg:items-center">
          <Field label="Worksheet">
            <select
              value={state.selected_sheet}
              onChange={(event) => onWorksheetChange(event.target.value)}
              disabled={state.loading || state.saving || state.sheets.length <= 1}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
              {state.sheets.map((sheet) => (
                <option key={sheet} value={sheet}>{sheet}</option>
              ))}
            </select>
          </Field>
          <Field label="Duplicate Handling">
            <select
              value={state.duplicate_behavior}
              onChange={(event) => onBehaviorChange(event.target.value as 'skip' | 'update' | 'cancel')}
              disabled={state.saving}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="skip">Skip duplicates</option>
              <option value="update">Update import reference</option>
              <option value="cancel">Cancel import</option>
            </select>
          </Field>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {state.loading ? (
            <LoadingBlock label="Preparing preview..." />
          ) : state.error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{state.error}</div>
          ) : (
            <div className="space-y-5">
              {state.preview && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <MiniStat label="Detected Rows" value={state.preview.total_rows} />
                    <MiniStat label="Valid Rows" value={state.preview.valid_rows} />
                    <MiniStat label="Duplicate Rows" value={state.preview.duplicate_rows} />
                    <MiniStat label="Invalid Rows" value={state.preview.invalid_rows} />
                    <MiniStat label="Ignored Rows" value={state.preview.ignored_rows} />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <PreviewList title="Recognized Courses" rows={recognizedPreview} emptyLabel="No recognized courses yet." />
                    <PreviewList title="Unrecognized Courses" rows={unrecognizedPreview} emptyLabel="No unrecognized courses." />
                  </div>

                  {state.result && (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                      <p className="font-bold">Import Result</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                        <MiniStat label="Rows Processed" value={state.result.total_rows_processed} />
                        <MiniStat label="Imported" value={state.result.successfully_imported} />
                        <MiniStat label="Duplicates Skipped" value={state.result.duplicates_skipped} />
                        <MiniStat label="Invalid Rows" value={state.result.invalid_rows} />
                        <MiniStat label="Updated" value={state.result.updated_records} />
                      </div>
                    </div>
                  )}

                  {importErrors.length > 0 && (
                    <div className="rounded-lg border">
                      <div className="flex flex-col gap-2 border-b bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-bold text-[#1b2a4a]">Import Error Report</p>
                        <button type="button" onClick={onDownloadErrors} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                          <Download className="h-4 w-4" />
                          Download
                        </button>
                      </div>
                      <div className="max-h-64 overflow-auto">
                        <table className="w-full min-w-[760px] text-sm">
                          <thead className="border-b bg-white">
                            <tr>
                              <th className="px-3 py-2 text-left">Row</th>
                              <th className="px-3 py-2 text-left">Name</th>
                              <th className="px-3 py-2 text-left">Course</th>
                              <th className="px-3 py-2 text-left">Batch</th>
                              <th className="px-3 py-2 text-left">Error</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importErrors.slice(0, 100).map((row, index) => (
                              <tr key={`${row.row_number}-${index}`} className="border-b last:border-0">
                                <td className="px-3 py-2">{row.row_number}</td>
                                <td className="px-3 py-2">{row.name || '-'}</td>
                                <td className="px-3 py-2">{row.course || '-'}</td>
                                <td className="px-3 py-2">{row.batch || '-'}</td>
                                <td className="px-3 py-2 text-red-700">{row.error}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Close</button>
          <button
            type="button"
            onClick={onConfirmImport}
            disabled={!state.preview || state.saving || state.loading || state.duplicate_behavior === 'cancel'}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1b2a4a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#263c66] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Save Import
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportModal({
  scope,
  format,
  course,
  batch,
  courseCodes,
  batchYears,
  exporting,
  onScopeChange,
  onFormatChange,
  onCourseChange,
  onBatchChange,
  onClose,
  onExport,
}: {
  scope: ExportScope;
  format: ExportFormat;
  course: string;
  batch: string;
  courseCodes: string[];
  batchYears: number[];
  exporting: boolean;
  onScopeChange: (scope: ExportScope) => void;
  onFormatChange: (format: ExportFormat) => void;
  onCourseChange: (course: string) => void;
  onBatchChange: (batch: string) => void;
  onClose: () => void;
  onExport: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl">
        <ModalHeader title="Export Alumni Registry" subtitle="Registered Alumni" onClose={onClose} />
        <div className="space-y-4 px-5 py-4">
          <Field label="Export Scope">
            <select value={scope} onChange={(event) => onScopeChange(event.target.value as ExportScope)} className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="filtered">Current filtered results</option>
              <option value="all">All registered alumni</option>
              <option value="course">Alumni by course</option>
              <option value="batch">Alumni by batch</option>
              <option value="unclaimed">Unclaimed alumni only</option>
              <option value="registered">Registered alumni only</option>
            </select>
          </Field>
          {scope === 'course' && (
            <Field label="Course Code">
              <select value={course} onChange={(event) => onCourseChange(event.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select Course</option>
                {courseCodes.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </Field>
          )}
          {scope === 'batch' && (
            <Field label="Batch">
              <select value={batch} onChange={(event) => onBatchChange(event.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select Batch</option>
                {batchYears.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </Field>
          )}
          <Field label="Format">
            <select value={format} onChange={(event) => onFormatChange(event.target.value as ExportFormat)} className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="xlsx">XLSX</option>
              <option value="csv">CSV</option>
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={onExport} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalHeader({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-[#1b2a4a]">{title}</h2>
        {subtitle && <p className="mt-1 truncate text-sm text-gray-500">{subtitle}</p>}
      </div>
      <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
      {children}
    </label>
  );
}

function Info({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="rounded-lg border bg-gray-50 px-3 py-2">
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className="mt-1 break-words font-medium text-gray-800">{value ?? '-'}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white px-3 py-2">
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-[#1b2a4a]">{value}</p>
    </div>
  );
}

function PreviewList({ title, rows, emptyLabel }: { title: string; rows: Array<[string, number]>; emptyLabel: string }) {
  return (
    <div className="rounded-lg border">
      <p className="border-b bg-gray-50 px-4 py-3 text-sm font-bold text-[#1b2a4a]">{title}</p>
      <div className="space-y-2 p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">{emptyLabel}</p>
        ) : (
          rows.map(([label, total]) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">{label}</span>
              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">{total}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MatchBadge({ strength }: { strength: LinkCandidate['match_strength'] }) {
  const classes = {
    strong: 'border-green-200 bg-green-50 text-green-700',
    review: 'border-amber-200 bg-amber-50 text-amber-700',
    weak: 'border-gray-200 bg-gray-50 text-gray-500',
  };
  const labels = {
    strong: 'Strong match',
    review: 'Needs review',
    weak: 'Weak match',
  };

  return <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${classes[strength]}`}>{labels[strength]}</span>;
}
