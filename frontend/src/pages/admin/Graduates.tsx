import { useEffect, useRef, useState } from 'react';
import {
  Search, Plus, Eye, Edit2, Archive, RotateCcw, Trash2, X, ChevronLeft, ChevronRight, Download,
} from 'lucide-react';
import MessageBox from '../../components/MessageBox';
import { API_ROOT } from '../../config/api';
import { readSpreadsheet, SpreadsheetReadError } from '../../lib/spreadsheets';
import {
  extractGraduateImportRows,
  GRADUATE_IMPORT_REQUIRED_COLUMNS,
  resolveGraduateImportProgramId,
  resolveImportedGraduationYear,
  validateGraduateImportStructure,
} from '../../utils/graduateImport';
import { parseGraduateName, uppercaseGraduateName } from '../../utils/graduateNames';
import { normalizeGraduationYear, normalizeGraduationYears } from '../../utils/graduationYears';

const API_BASE = API_ROOT;

interface Graduate {
  id: number;
  student_id: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  name_extension?: string | null;
  email: string | null;
  phone: string | null;
  program_id: number | null;
  program_code: string | null;
  program_name?: string | null;
  year_graduated: number | null;
  address?: string | null;
  employment_status?: string | null;
  is_aligned?: string | null;
  company_name?: string | null;
  job_title?: string | null;
  industry?: string | null;
  date_hired?: string | null;
  monthly_salary?: string | number | null;
  time_to_employment?: string | number | null;
  archived_at?: string | null;
  archived_by_name?: string | null;
  restored_at?: string | null;
  restored_by_name?: string | null;
}

interface ProgramOption {
  id: string;
  code: string;
  name: string;
}

interface FormData {
  student_id: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  name_extension: string;
  email: string;
  phone: string;
  program_id: string;
  year_graduated: string;
  address: string;
  employment_status: string;
  is_aligned: string;
  company_name: string;
  job_title: string;
  industry: string;
  date_hired: string;
  monthly_salary: string;
  time_to_employment: string;
}

interface ImportFailureRow {
  sheetName: string;
  rowNumber: number;
  studentId: string;
  graduateName: string;
  reason: string;
}

interface ImportResult {
  fileName: string;
  totalRows: number;
  added: number;
  skipped: number;
  sheetCount: number;
  graduationYears: string[];
  failures: ImportFailureRow[];
}

interface ImportProgress {
  fileName: string;
  total: number;
  currentSheet: string;
  phase: 'validating' | 'importing';
}

interface ImportApiErrorPayload {
  success?: boolean;
  errorType?: string;
  message?: string;
  error?: string;
  errors?: string[];
  rowErrors?: ImportFailureRow[];
}

const emptyForm: FormData = {
  student_id: '', first_name: '', middle_name: '', last_name: '', name_extension: '', email: '', phone: '',
  program_id: '', year_graduated: '', address: '', employment_status: 'unemployed',
  is_aligned: 'not_aligned', company_name: '', job_title: '', industry: '',
  date_hired: '', monthly_salary: '', time_to_employment: '',
};

const PROGRAM_DURATION_YEARS: Record<string, number> = {
  BSCS: 4,
  BSHM: 4,
  BSED: 4,
  BEED: 4,
  ACT: 2,
};

const NAME_EXTENSION_OPTIONS = ['', 'JR.', 'SR.', 'II', 'III', 'IV', 'V', 'VI'];

const normalizeText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const normalizeFieldKey = (value: unknown): string => normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, '');

const pickValue = (row: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = normalizeText(row[key]);
      if (value !== '') return value;
    }
  }

  const normalizedKeys = new Set(keys.map(normalizeFieldKey));
  for (const [key, rawValue] of Object.entries(row)) {
    if (!normalizedKeys.has(normalizeFieldKey(key))) continue;
    const value = normalizeText(rawValue);
    if (value !== '') return value;
  }
  return '';
};

const NAME_EXTENSION_ALIASES: Record<string, string> = {
  jr: 'JR.',
  'jr.': 'JR.',
  sr: 'SR.',
  'sr.': 'SR.',
  ii: 'II',
  iii: 'III',
  iv: 'IV',
  v: 'V',
  vi: 'VI',
};

const normalizeNameExtension = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) return '';
  const lower = normalized.toLowerCase();
  return NAME_EXTENSION_ALIASES[lower] ?? normalized.toUpperCase();
};

const formatGraduateDisplayName = (graduate: {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  name_extension?: string | null;
}): string => {
  const middleInitial = graduate.middle_name ? ` ${graduate.middle_name.charAt(0)}.` : '';
  const extension = normalizeText(graduate.name_extension);
  const suffix = extension ? ` ${extension}` : '';
  return `${graduate.last_name}, ${graduate.first_name}${middleInitial}${suffix}`.toUpperCase();
};

const getProgramDurationById = (programId: string, programOptions: ProgramOption[]): number | null => {
  const selectedProgram = programOptions.find((option) => option.id === programId);
  if (!selectedProgram) return null;
  return PROGRAM_DURATION_YEARS[selectedProgram.code] ?? null;
};

const extractStartYearFromStudentId = (studentId: string): number | null => {
  const normalized = normalizeText(studentId);
  if (!normalized) return null;

  const match = normalized.match(/(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/);
  if (!match?.[1]) return null;

  const startYear = Number.parseInt(match[1], 10);
  return Number.isNaN(startYear) ? null : startYear;
};

const inferGraduationYear = (studentId: string, programId: string, programOptions: ProgramOption[]): string => {
  const startYear = extractStartYearFromStudentId(studentId);
  const duration = getProgramDurationById(programId, programOptions);

  if (!startYear || !duration) return '';

  return String(startYear + duration);
};

const formatStudentId = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
};

const formatContactNumber = (value: string): string => value.replace(/\D/g, '').slice(0, 11);

const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const displayOptionalValue = (value: unknown): string => {
  const normalized = normalizeText(value);
  return normalized && !['null', 'undefined', 'n/a'].includes(normalized.toLowerCase()) ? normalized : '—';
};

const graduateToFormData = (graduate: Graduate): FormData => ({
  ...emptyForm,
  student_id: normalizeText(graduate.student_id),
  first_name: normalizeText(graduate.first_name),
  middle_name: normalizeText(graduate.middle_name),
  last_name: normalizeText(graduate.last_name),
  name_extension: normalizeText(graduate.name_extension),
  email: normalizeText(graduate.email),
  phone: normalizeText(graduate.phone),
  program_id: graduate.program_id === null ? '' : String(graduate.program_id),
  year_graduated: normalizeText(graduate.year_graduated),
  address: normalizeText(graduate.address),
  employment_status: normalizeEmploymentStatus(normalizeText(graduate.employment_status)),
  is_aligned: normalizeAlignment(normalizeText(graduate.is_aligned)),
  company_name: normalizeText(graduate.company_name),
  job_title: normalizeText(graduate.job_title),
  industry: normalizeText(graduate.industry),
  date_hired: normalizeText(graduate.date_hired),
  monthly_salary: normalizeText(graduate.monthly_salary),
  time_to_employment: normalizeText(graduate.time_to_employment),
});

const normalizeEmploymentStatus = (value: string): string => {
  const parsed = value.toLowerCase().replace(/\s+/g, '_');
  if (['employed', 'self_employed', 'freelance', 'unemployed'].includes(parsed)) {
    return parsed;
  }
  return 'unemployed';
};

const normalizeAlignment = (value: string): string => {
  const parsed = value.toLowerCase().replace(/\s+/g, '_');
  return parsed === 'aligned' ? 'aligned' : 'not_aligned';
};

const resolveProgramId = (row: Record<string, unknown>, programOptions: ProgramOption[]): string => {
  const programId = pickValue(row, ['Program ID', 'program_id', 'programId']);
  if (programId !== '' && programOptions.some((option) => option.id === programId)) {
    return programId;
  }

  const code = pickValue(row, ['Program Code', 'Course Code', 'Department Code', 'program_code', 'programCode']).toUpperCase();
  if (code !== '') {
    const matchByCode = resolveGraduateImportProgramId(code, programOptions);
    if (matchByCode) return matchByCode;
  }

  const name = pickValue(row, ['Program', 'Program Name', 'Course', 'Course Name', 'Department', 'Department Name', 'Degree Program', 'Academic Program', 'program_name', 'programName']);
  if (name !== '') {
    const matchByName = resolveGraduateImportProgramId(name, programOptions);
    if (matchByName) return matchByName;
  }

  return '';
};

const mapExcelRowToPayload = (
  row: Record<string, unknown>,
  programOptions: ProgramOption[],
  officialListYear = '',
  selectedFilterYear = '',
): FormData => {
  const fullName = pickValue(row, ['Name', 'Full Name', 'Name of Student', 'Name of Students', 'Student Name', 'Graduate Name', 'full_name', 'fullName']);
  const parsedName = parseGraduateName(fullName);

  const firstName = uppercaseGraduateName(pickValue(row, ['First Name', 'first_name', 'firstName']) || parsedName.firstName);
  const middleName = uppercaseGraduateName(pickValue(row, ['Middle Name', 'middle_name', 'middleName']) || parsedName.middleName);
  const lastName = uppercaseGraduateName(pickValue(row, ['Last Name', 'last_name', 'lastName']) || parsedName.lastName);
  const nameExtension = normalizeNameExtension(
    pickValue(row, ['Name Extension', 'Name Ext', 'Suffix', 'name_extension', 'nameExtension', 'suffix']) || parsedName.nameExtension
  );

  const rowYear = pickValue(row, ['Year Graduated', 'Graduation Year', 'year_graduated', 'yearGraduated']);

  return {
    ...emptyForm,
    student_id: pickValue(row, ['Student ID', 'Student Number', 'Student No.', 'Student No', 'ID Number', 'student_id', 'studentId']),
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    name_extension: nameExtension,
    email: pickValue(row, ['Email', 'Email Add', 'Email Address', 'email']),
    phone: pickValue(row, ['Contact No.', 'Contact No', 'Contact Number', 'Phone', 'phone']),
    program_id: resolveProgramId(row, programOptions),
    year_graduated: resolveImportedGraduationYear(officialListYear, rowYear, selectedFilterYear),
    address: pickValue(row, ['Address', 'address']),
    employment_status: normalizeEmploymentStatus(pickValue(row, ['Employment Status', 'employment_status', 'employmentStatus'])),
    is_aligned: normalizeAlignment(pickValue(row, ['Course Alignment', 'is_aligned', 'isAligned'])),
    company_name: pickValue(row, ['Company Name', 'company_name', 'companyName']),
    job_title: pickValue(row, ['Job Title', 'job_title', 'jobTitle']),
    industry: pickValue(row, ['Industry', 'industry']),
    date_hired: pickValue(row, ['Date Hired', 'date_hired', 'dateHired']),
    monthly_salary: pickValue(row, ['Monthly Salary', 'monthly_salary', 'monthlySalary']),
    time_to_employment: pickValue(row, ['Time to Employment (months)', 'time_to_employment', 'timeToEmployment']),
  };
};

type MessageType = 'confirm' | 'success' | 'error' | 'warning' | 'info';

const hasTechnicalDatabaseDetails = (message: string): boolean => {
  const lower = message.toLowerCase();
  return [
    'sqlstate',
    'integrity constraint',
    'duplicate entry',
    'foreign key',
    'pdoexception',
    'mysql',
    ' for key ',
    'graduates.',
  ].some((fragment) => lower.includes(fragment));
};

const getSafeErrorMessage = (error: unknown, fallback: string): string => {
  const message = error instanceof Error ? error.message : normalizeText(error);
  if (!message || hasTechnicalDatabaseDetails(message)) {
    return fallback;
  }

  return message;
};

const importErrorPresentation = (payload: ImportApiErrorPayload | SpreadsheetReadError | Error) => {
  const errorType = payload instanceof SpreadsheetReadError ? payload.errorType : ('errorType' in payload ? payload.errorType : undefined);
  const message = payload instanceof Error
    ? payload.message
    : payload.message || payload.error || 'Excel import failed. Please check the file and try again.';
  const errors = payload instanceof Error ? [] : (payload.errors || []);
  const titles: Record<string, string> = {
    INVALID_FILE_TYPE: 'Invalid File',
    CORRUPTED_FILE: 'Unable to Read File',
    EMPTY_FILE: 'Empty Excel File',
    INVALID_EXCEL_FORMAT: 'Import Failed',
    INVALID_ROW_DATA: 'Import Validation Failed',
    DUPLICATE_DATA: 'Import Validation Failed',
    IMPORT_FAILED: 'Import Failed',
  };
  const details = errors.length > 0 ? `\n\nProblems detected:\n${errors.slice(0, 100).map((item) => `• ${item}`).join('\n')}` : '';
  const expected = errorType === 'INVALID_EXCEL_FORMAT'
    ? `\n\nRequired columns:\n${GRADUATE_IMPORT_REQUIRED_COLUMNS.map((column) => `• ${column}`).join('\n')}`
    : '';
  return {
    title: titles[errorType || ''] || 'Import Failed',
    message: `${message}${details}${expected}`,
  };
};

const escapeCsvCell = (value: unknown): string => {
  const normalized = normalizeText(value);
  const safeValue = /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
  return `"${safeValue.replace(/"/g, '""')}"`;
};

const downloadImportFailures = (result: ImportResult) => {
  const rows = [
    ['Worksheet', 'Excel Row', 'Student ID', 'Graduate', 'Failure Reason'],
    ...result.failures.map((failure) => [
      failure.sheetName,
      String(failure.rowNumber),
      failure.studentId,
      failure.graduateName,
      failure.reason,
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}`;
  const blobUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  const fileBase = result.fileName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9._-]+/gi, '-');
  link.href = blobUrl;
  link.download = `${fileBase || 'graduate-import'}-skipped-rows.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
};

const formatDateTime = (value?: string | null): string => {
  if (!value) return '-';
  const parsed = new Date(value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

export default function Graduates() {
  const [graduates, setGraduates] = useState<Graduate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [programOptions, setProgramOptions] = useState<ProgramOption[]>([]);
  const [departmentFilterOptions, setDepartmentFilterOptions] = useState<ProgramOption[]>([]);
  const [filterYear, setFilterYear] = useState('');
  const [yearTabOptions, setYearTabOptions] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [archiveView, setArchiveView] = useState<'active' | 'archived'>('active');
  const [archiveCounts, setArchiveCounts] = useState({ active: 0, archived: 0 });
  const [showModal, setShowModal] = useState(false);
  const [editingGraduateId, setEditingGraduateId] = useState<number | null>(null);
  const [viewedGraduate, setViewedGraduate] = useState<Graduate | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [loadingGraduateId, setLoadingGraduateId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [selectedGraduateIds, setSelectedGraduateIds] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importLockRef = useRef(false);
  const [msgBox, setMsgBox] = useState<{
    isOpen: boolean;
    type: MessageType;
    title?: string;
    message: string;
    onConfirm?: () => void;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
  }>({ isOpen: false, type: 'success', message: '' });

  const buildQueryParams = (targetPage: number, limit: number) => {
    const params = new URLSearchParams();
    params.append('page', targetPage.toString());
    params.append('limit', limit.toString());
    params.append('archive', archiveView);
    if (search) params.append('search', search);
    if (selectedProgramId) params.append('program_id', selectedProgramId);
    if (filterYear) params.append('year_graduated', filterYear);
    return params;
  };

  const fetchGraduates = async () => {
    setLoading(true);
    try {
      const params = buildQueryParams(page, 10);
      const response = await fetch(`${API_BASE}/graduates/index.php?${params}`, {
        credentials: 'include',
      });
      const res = await response.json();

      if (!response.ok || !res.success) {
        throw new Error(res.error || 'Failed to load graduates');
      }

      const nextProgramOptions: ProgramOption[] = Array.isArray(res.program_options)
        ? res.program_options.map((program: { id?: unknown; code?: unknown; name?: unknown }) => ({
            id: String(program.id ?? ''),
            code: normalizeText(program.code).toUpperCase(),
            name: normalizeText(program.name),
          })).filter((program: ProgramOption) => program.id !== '' && program.code !== '')
        : [];
      setProgramOptions(nextProgramOptions);

      const nextDepartmentFilterOptions: ProgramOption[] = Array.isArray(res.filter_program_options)
        ? res.filter_program_options.map((program: { id?: unknown; code?: unknown; name?: unknown }) => ({
            id: String(program.id ?? ''),
            code: normalizeText(program.code).toUpperCase(),
            name: normalizeText(program.name),
          })).filter((program: ProgramOption) => program.id !== '' && program.code !== '')
        : nextProgramOptions;
      setDepartmentFilterOptions(nextDepartmentFilterOptions);

      if (selectedProgramId && !nextDepartmentFilterOptions.some((program) => program.id === selectedProgramId)) {
        setSelectedProgramId('');
        return;
      }

      const nextTotalPages = Math.max(1, Number(res.pagination?.pages || 1));
      setGraduates(res.data);
      setTotalPages(nextTotalPages);
      setTotal(res.pagination.total);
      setArchiveCounts(res.archive_counts || { active: 0, archived: 0 });
      setSelectedGraduateIds([]);

      const nextYears = normalizeGraduationYears(Array.isArray(res.year_options) ? res.year_options : []);
      setYearTabOptions(nextYears);
      if (filterYear && !nextYears.includes(filterYear)) {
        setFilterYear('');
      }
      if (page > nextTotalPages) {
        setPage(nextTotalPages);
      }
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: getSafeErrorMessage(error, 'Failed to load graduates'),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGraduates();
  }, [page, search, selectedProgramId, filterYear, archiveView]);

  const openAdd = () => {
    setFormData({ ...emptyForm, program_id: selectedProgramId });
    setEditingGraduateId(null);
    setShowModal(true);
  };

  const fetchGraduateRecord = async (graduate: Graduate): Promise<Graduate> => {
    const params = new URLSearchParams({ id: String(graduate.id) });
    if (archiveView === 'archived') params.set('archive', 'archived');

    const response = await fetch(`${API_BASE}/graduates/index.php?${params}`, {
      credentials: 'include',
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Unable to load graduate details');
    }

    return result.data as Graduate;
  };

  const openDetails = async (graduate: Graduate) => {
    setViewedGraduate(graduate);
    setShowDetailsModal(true);
    setLoadingGraduateId(graduate.id);

    try {
      setViewedGraduate(await fetchGraduateRecord(graduate));
    } catch (error) {
      setShowDetailsModal(false);
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: getSafeErrorMessage(error, 'Unable to load graduate details'),
      });
    } finally {
      setLoadingGraduateId(null);
    }
  };

  const openEdit = async (graduate: Graduate) => {
    setLoadingGraduateId(graduate.id);

    try {
      const currentGraduate = await fetchGraduateRecord(graduate);
      setFormData(graduateToFormData(currentGraduate));
      setEditingGraduateId(currentGraduate.id);
      setShowModal(true);
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: getSafeErrorMessage(error, 'Unable to load graduate for editing'),
      });
    } finally {
      setLoadingGraduateId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!/^\d{4}-\d{4}$/.test(formData.student_id)) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: 'Student No. must follow the format 4digits-4digits (e.g., 2XXX-XXXX).',
      });
      return;
    }

    if (formData.email.trim() && !isValidEmail(formData.email.trim())) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: 'Email must be a valid email address.',
      });
      return;
    }

    if (formData.phone.trim() && !/^09\d{9}$/.test(formData.phone.trim())) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: 'Contact No. must be 11 digits and start with 09 (e.g., 09123456789).',
      });
      return;
    }

    if (!normalizeGraduationYear(formData.year_graduated)) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: 'Year Graduated must be a valid four-digit year.',
      });
      return;
    }

    try {
      const isEditing = editingGraduateId !== null;
      const response = await fetch(`${API_BASE}/graduates/index.php`, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(isEditing ? { ...formData, id: editingGraduateId } : formData),
      });
      const res = await response.json();

      if (!response.ok || !res.success) {
        throw new Error(res.error || 'Unable to save graduate');
      }

      setShowModal(false);
      setEditingGraduateId(null);
      await fetchGraduates();
      setMsgBox({
        isOpen: true,
        type: 'success',
        message: isEditing ? 'Graduate updated successfully.' : 'Graduate added successfully.',
      });
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: getSafeErrorMessage(
          error,
          'Unable to save graduate. Please check for duplicate Student No. or email and try again.'
        ),
      });
    }
  };

  const isGraduateSelected = (id: number) => selectedGraduateIds.includes(id);

  const toggleGraduateSelection = (id: number) => {
    setSelectedGraduateIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      return [...prev, id];
    });
  };

  const allVisibleSelected = graduates.length > 0 && graduates.every((g) => selectedGraduateIds.includes(g.id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedGraduateIds([]);
      return;
    }
    setSelectedGraduateIds(graduates.map((g) => g.id));
  };

  const performArchiveRequest = async (payload: Record<string, unknown>) => {
    const response = await fetch(`${API_BASE}/graduates/index.php`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const res = await response.json();
    if (!response.ok || !res.success) {
      throw new Error(res.error || 'Unable to archive graduate records');
    }

    return res;
  };

  const handleArchiveSelected = () => {
    if (selectedGraduateIds.length === 0) return;

    setMsgBox({
      isOpen: true,
      type: 'confirm',
      message: `Archive ${selectedGraduateIds.length} selected graduate record(s)?\n\nThey will leave the active list, but their accounts, survey responses, profiles, forum history, messages, and job records will be preserved.`,
      confirmText: 'Archive',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await performArchiveRequest({ ids: selectedGraduateIds });
          await fetchGraduates();
          setMsgBox({
            isOpen: true,
            type: 'success',
            message: 'Selected graduates archived successfully.',
          });
        } catch (error) {
          setMsgBox({
            isOpen: true,
            type: 'error',
            message: getSafeErrorMessage(error, 'Unable to archive selected graduates'),
          });
        }
      },
    });
  };

  const handleArchiveByYear = () => {
    if (!filterYear) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: 'Select a year first before archiving by year.',
      });
      return;
    }

    if (!selectedProgramId) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: 'Select a department before archiving by year.',
      });
      return;
    }

    setMsgBox({
      isOpen: true,
      type: 'confirm',
      message: `Archive all graduates for year ${filterYear} in ${programOptions.find((p) => p.id === selectedProgramId)?.code || 'the selected program'}?\n\nThe records will be moved to Registrar Archive and all related data will be preserved.`,
      confirmText: 'Archive',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          const result = await performArchiveRequest({
            year_graduated: filterYear,
            program_id: selectedProgramId,
          });

          await fetchGraduates();
          setMsgBox({
            isOpen: true,
            type: 'success',
            message: `${result.archived ?? 0} graduate(s) archived for year ${filterYear}.`,
          });
        } catch (error) {
          setMsgBox({
            isOpen: true,
            type: 'error',
            message: getSafeErrorMessage(error, 'Unable to archive graduates by year'),
          });
        }
      },
    });
  };

  const handleRestore = (graduate: Graduate) => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      message: 'Restore Graduate Record?\n\nThis record will return to the active Registrar list with all existing relationships intact.',
      confirmText: 'Restore',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          const response = await fetch(`${API_BASE}/graduates/index.php`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id: graduate.id, action: 'restore' }),
          });
          const result = await response.json();
          if (!response.ok || !result.success) {
            throw new Error(result.error || 'Unable to restore graduate');
          }

          setGraduates((current) => current.filter((item) => item.id !== graduate.id));
          await fetchGraduates();
          setMsgBox({ isOpen: true, type: 'success', message: 'Graduate restored successfully.' });
        } catch (error) {
          setMsgBox({
            isOpen: true,
            type: 'error',
            message: getSafeErrorMessage(error, 'Unable to restore graduate'),
          });
        }
      },
    });
  };

  const handlePermanentDelete = (graduate: Graduate) => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Permanently Delete Graduate?',
      message: 'This will permanently delete this graduate account and its account-owned data. Historical survey responses will be preserved for reporting. This action cannot be undone.',
      confirmText: 'Permanently Delete',
      cancelText: 'Cancel',
      destructive: true,
      onConfirm: async () => {
        try {
          const response = await fetch(`${API_BASE}/graduates/index.php`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id: graduate.id, action: 'permanent_delete' }),
          });
          const result = await response.json();
          if (!response.ok || !result.success) {
            throw new Error(result.error || 'Unable to permanently delete graduate');
          }

          await fetchGraduates();
          setMsgBox({ isOpen: true, type: 'success', message: result.message || 'Graduate permanently deleted successfully.' });
        } catch (error) {
          setMsgBox({
            isOpen: true,
            type: 'error',
            message: getSafeErrorMessage(error, 'Unable to permanently delete graduate'),
          });
        }
      },
    });
  };

  const handlePermanentDeleteSelected = () => {
    if (selectedGraduateIds.length === 0 || isBulkDeleting) return;

    const selectedCount = selectedGraduateIds.length;
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Permanently Delete Selected Graduates?',
      message: `This will permanently delete ${selectedCount} selected graduate record(s) and their account-owned data. Historical survey responses will be preserved for reporting. This action cannot be undone.`,
      confirmText: 'Permanently Delete',
      cancelText: 'Cancel',
      destructive: true,
      onConfirm: async () => {
        setIsBulkDeleting(true);
        try {
          const response = await fetch(`${API_BASE}/graduates/index.php`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ ids: selectedGraduateIds, action: 'permanent_delete' }),
          });
          const result = await response.json();
          if (!response.ok || !result.success) {
            throw new Error(result.error || 'Unable to permanently delete selected graduates');
          }

          await fetchGraduates();
          setMsgBox({
            isOpen: true,
            type: 'success',
            message: result.message || `${result.deleted ?? selectedCount} selected graduate record(s) permanently deleted.`,
          });
        } catch (error) {
          setMsgBox({
            isOpen: true,
            type: 'error',
            message: getSafeErrorMessage(error, 'Unable to permanently delete selected graduates'),
          });
        } finally {
          setIsBulkDeleting(false);
        }
      },
    });
  };

  const handlePermanentDeleteByYear = () => {
    if (!filterYear || !selectedProgramId || isBulkDeleting) return;

    const programCode = programOptions.find((program) => program.id === selectedProgramId)?.code || 'the selected department';
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Permanently Delete Archived Year?',
      message: `Permanently delete every archived ${programCode} graduate from year ${filterYear} across all pages?\n\nGraduate accounts and account-owned data will be deleted. Historical survey responses will be preserved for reporting. This action cannot be undone.`,
      confirmText: 'Delete Year Permanently',
      cancelText: 'Cancel',
      destructive: true,
      onConfirm: async () => {
        setIsBulkDeleting(true);
        try {
          const response = await fetch(`${API_BASE}/graduates/index.php`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              action: 'permanent_delete',
              year_graduated: filterYear,
              program_id: selectedProgramId,
            }),
          });
          const result = await response.json();
          if (!response.ok || !result.success) {
            throw new Error(result.error || 'Unable to permanently delete the archived graduation year');
          }

          await fetchGraduates();
          setMsgBox({
            isOpen: true,
            type: 'success',
            message: result.message || `${result.deleted ?? 0} archived graduate record(s) permanently deleted for ${filterYear}.`,
          });
        } catch (error) {
          setMsgBox({
            isOpen: true,
            type: 'error',
            message: getSafeErrorMessage(error, 'Unable to permanently delete the archived graduation year'),
          });
        } finally {
          setIsBulkDeleting(false);
        }
      },
    });
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';

    if (!file || isImporting || importLockRef.current) return;
    importLockRef.current = true;

    setImportResult(null);
    setMsgBox((current) => ({ ...current, isOpen: false }));
    setIsImporting(true);
    setImportProgress({
      fileName: file.name,
      total: 0,
      currentSheet: '',
      phase: 'validating',
    });

    try {
      const workbook = await readSpreadsheet(file);
      const structure = validateGraduateImportStructure(workbook, programOptions);
      if (structure.errorType) {
        const presentation = importErrorPresentation({
          errorType: structure.errorType,
          message: structure.errors[0],
          errors: structure.errorType === 'INVALID_EXCEL_FORMAT' ? structure.errors : [],
        });
        setMsgBox({ isOpen: true, type: 'error', ...presentation, confirmText: 'Close' });
        return;
      }

      const extractedImport = extractGraduateImportRows(workbook, programOptions);
      const rowErrors: string[] = [];
      const seenStudentIds = new Map<string, number>();
      const seenEmails = new Map<string, number>();
      for (const importedRow of extractedImport.rows) {
        const payload = mapExcelRowToPayload(
          importedRow.row,
          programOptions,
          importedRow.graduationYear,
          filterYear,
        );
        if (!payload.program_id) {
          payload.program_id = importedRow.inferredProgramId || selectedProgramId;
        }
        const errors: string[] = [];
        if (!payload.student_id) errors.push('Student ID is required');
        else if (payload.student_id.length > 20 || /\s/.test(payload.student_id)) errors.push('Invalid Student ID');
        if (!payload.first_name) errors.push('First name is required');
        if (!payload.last_name) errors.push('Last name is required');
        if (!payload.year_graduated) errors.push('Invalid or missing Year Graduated');
        if (payload.email && !isValidEmail(payload.email)) errors.push('Invalid email address');
        if (payload.phone && !/^09\d{9}$/.test(payload.phone)) errors.push('Contact No. must be 11 digits and start with 09');
        const studentKey = payload.student_id.toLowerCase();
        if (studentKey) {
          const firstRow = seenStudentIds.get(studentKey);
          if (firstRow) errors.push(`Duplicate Student ID in this file (first seen on row ${firstRow})`);
          else seenStudentIds.set(studentKey, importedRow.rowNumber);
        }
        const emailKey = payload.email.toLowerCase();
        if (emailKey) {
          const firstRow = seenEmails.get(emailKey);
          if (firstRow) errors.push(`Duplicate email in this file (first seen on row ${firstRow})`);
          else seenEmails.set(emailKey, importedRow.rowNumber);
        }
        errors.forEach((error) => rowErrors.push(`Row ${importedRow.rowNumber}: ${error}`));
      }

      if (rowErrors.length > 0) {
        const duplicateOnly = rowErrors.every((error) => /: Duplicate (?:Student ID|email)/.test(error));
        const presentation = importErrorPresentation({
          errorType: duplicateOnly ? 'DUPLICATE_DATA' : 'INVALID_ROW_DATA',
          message: duplicateOnly
            ? 'The Excel file contains duplicate graduate records. No records were imported.'
            : 'The Excel format is correct, but some graduate records contain invalid data. No records were imported.',
          errors: rowErrors,
        });
        setMsgBox({ isOpen: true, type: 'error', ...presentation, confirmText: 'Close' });
        return;
      }

      setImportProgress((current) => current ? {
        ...current,
        total: extractedImport.rows.length,
        currentSheet: extractedImport.rows[0]?.sheetName ?? '',
        phase: 'importing',
      } : current);

      const form = new window.FormData();
      form.append('file', file);
      if (selectedProgramId) form.append('selected_program_id', selectedProgramId);
      if (filterYear) form.append('selected_year', filterYear);
      const response = await fetch(`${API_BASE}/graduates/index.php?action=import`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      let data: ImportApiErrorPayload & { result?: {
        fileName: string;
        totalRows: number;
        added: number;
        skipped: number;
        sheetCount: number;
        graduationYears: string[];
        skippedRows: ImportFailureRow[];
      } };
      try {
        data = await response.json();
      } catch {
        data = { success: false, errorType: 'IMPORT_FAILED', message: `Server returned an invalid response (HTTP ${response.status})` };
      }
      if (!response.ok || data.success === false || !data.result) {
        const presentation = importErrorPresentation(data);
        setMsgBox({ isOpen: true, type: 'error', ...presentation, confirmText: 'Close' });
        return;
      }

      await fetchGraduates();
      setImportResult({
        fileName: data.result.fileName,
        totalRows: data.result.totalRows,
        added: data.result.added,
        skipped: data.result.skipped,
        sheetCount: data.result.sheetCount,
        graduationYears: data.result.graduationYears,
        failures: data.result.skippedRows,
      });
    } catch (error) {
      const presentation = importErrorPresentation(
        error instanceof SpreadsheetReadError || error instanceof Error
          ? error
          : new Error('Excel import failed. Please check the file and try again.'),
      );
      setMsgBox({
        isOpen: true,
        type: 'error',
        ...presentation,
        confirmText: 'Close',
      });
    } finally {
      importLockRef.current = false;
      setImportProgress(null);
      setIsImporting(false);
    }
  };

  const updateField = (field: keyof FormData, value: string) => {
    setFormData((prev) => {
      const normalizedValue = field === 'student_id'
        ? formatStudentId(value)
        : field === 'phone'
          ? formatContactNumber(value)
          : ['first_name', 'middle_name', 'last_name', 'name_extension'].includes(field)
            ? uppercaseGraduateName(value)
            : value;
      const next = { ...prev, [field]: normalizedValue };

      if (field === 'student_id' || field === 'program_id') {
        const computedYear = inferGraduationYear(next.student_id, next.program_id, programOptions);
        if (computedYear) {
          next.year_graduated = computedYear;
        }
      }

      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1b2a4a]">{archiveView === 'archived' ? 'Registrar Archive' : 'Manage Graduates'}</h1>
          <p className="text-sm text-gray-500">{total} {archiveView === 'archived' ? 'archived' : 'active'} graduate record{total === 1 ? '' : 's'}</p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={handleImportExcel}
          />

          {archiveView === 'active' && <button
            onClick={handleImportClick}
            disabled={isImporting || loading}
            className="flex w-full items-center justify-center gap-2 border border-blue-200 text-blue-700 px-4 py-2.5 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed sm:w-auto"
          >
            <Download className="w-4 h-4" />
            {isImporting ? 'Importing...' : 'Import Excel'}
          </button>}

          {archiveView === 'active' && <button
            onClick={openAdd}
            className="flex w-full items-center justify-center gap-2 bg-[#1b2a4a] text-white px-4 py-2.5 rounded-lg hover:bg-[#263c66] transition-colors text-sm font-medium sm:w-auto"
          >
            <Plus className="w-4 h-4" /> Add Graduate
          </button>}
        </div>
      </div>

      <nav aria-label="Registrar graduate sections" className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { setArchiveView('active'); setPage(1); }}
          className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold ${archiveView === 'active' ? 'border-blue-700 bg-blue-700 text-white' : 'bg-white text-gray-700'}`}
        >
          Manage Graduates
          <span className={`rounded-full px-2 py-0.5 text-xs ${archiveView === 'active' ? 'bg-white/15' : 'bg-gray-100'}`}>{archiveCounts.active}</span>
        </button>
        <button
          type="button"
          onClick={() => { setArchiveView('archived'); setSelectedGraduateIds([]); setPage(1); }}
          className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold ${archiveView === 'archived' ? 'border-blue-700 bg-blue-700 text-white' : 'bg-white text-gray-700'}`}
        >
          <Archive className="h-4 w-4" />
          Archive
          <span className={`rounded-full px-2 py-0.5 text-xs ${archiveView === 'archived' ? 'bg-white/15' : 'bg-gray-100'}`}>{archiveCounts.archived}</span>
        </button>
      </nav>

      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px] lg:items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Search graduates</span>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, student ID, or email..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Department</span>
              <select
                aria-label="Filter graduates by department"
                value={selectedProgramId}
                onChange={(event) => {
                  setSelectedProgramId(event.target.value);
                  setFilterYear('');
                  setPage(1);
                }}
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Departments</option>
                {departmentFilterOptions.map((program) => (
                  <option key={program.id} value={program.id}>{program.code} — {program.name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Year Graduated</span>
              <select
                aria-label="Filter graduates by graduation year"
                value={filterYear}
                onChange={(event) => { setFilterYear(event.target.value); setPage(1); }}
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Years</option>
                {yearTabOptions.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
          </div>

          {archiveView === 'active' && <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={toggleSelectAllVisible}
              className="px-3 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              type="button"
            >
              {allVisibleSelected ? 'Clear Selection' : 'Select All (This Page)'}
            </button>

            <button
              onClick={handleArchiveSelected}
              disabled={selectedGraduateIds.length === 0}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              type="button"
            >
              Archive Selected ({selectedGraduateIds.length})
            </button>

            <button
              onClick={handleArchiveByYear}
              disabled={!filterYear || !selectedProgramId}
              className="px-3 py-2 rounded-lg text-sm font-medium text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              type="button"
            >
              Archive By Year
            </button>
          </div>}

          {archiveView === 'archived' && <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={toggleSelectAllVisible}
              className="px-3 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              type="button"
            >
              {allVisibleSelected ? 'Clear Selection' : 'Select All (This Page)'}
            </button>

            <button
              onClick={handlePermanentDeleteSelected}
              disabled={selectedGraduateIds.length === 0 || isBulkDeleting}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              type="button"
            >
              {isBulkDeleting ? 'Deleting...' : `Delete Permanently (${selectedGraduateIds.length})`}
            </button>

            <button
              onClick={handlePermanentDeleteByYear}
              disabled={!filterYear || !selectedProgramId || isBulkDeleting}
              className="px-3 py-2 rounded-lg text-sm font-medium text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              type="button"
            >
              Delete Year Permanently
            </button>
          </div>}

        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="divide-y md:hidden">
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading...</div>
          ) : graduates.length === 0 ? (
            <div className="py-12 text-center text-gray-400">{archiveView === 'archived' ? 'No archived registrar records.' : 'No graduates found'}</div>
          ) : (
            graduates.map((g) => (
              <div key={g.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <label className="mb-2 inline-flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={isGraduateSelected(g.id)}
                        onChange={() => toggleGraduateSelection(g.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      Select
                    </label>
                    <p className="font-semibold text-[#1b2a4a]">
                      {formatGraduateDisplayName(g)}
                    </p>
                    <p className="mt-1 font-mono text-xs text-gray-500">{g.student_id}</p>
                  </div>
                  {archiveView === 'archived' && <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => handleRestore(g)} className="p-2 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors" aria-label="Restore graduate">
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button onClick={() => handlePermanentDelete(g)} className="p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors" aria-label="Permanently delete graduate">
                        <Trash2 className="w-4 h-4" />
                      </button>
                  </div>}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-600">
                  <p className="col-span-2 break-all">{displayOptionalValue(g.email)}</p>
                  <p>{displayOptionalValue(g.phone)}</p>
                  <p className="text-right">{displayOptionalValue(g.year_graduated)}</p>
                  <p>
                    <span className="bg-blue-50 text-blue-700 text-xs font-medium px-2 py-1 rounded">
                      {displayOptionalValue(g.program_code)}
                    </span>
                  </p>
                  {archiveView === 'archived' && <p className="col-span-2 text-xs text-gray-500">Archived {formatDateTime(g.archived_at)}{g.archived_by_name ? ` by ${g.archived_by_name}` : ''}</p>}
                </div>
                {archiveView === 'active' && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                    <button
                      type="button"
                      onClick={() => void openDetails(g)}
                      disabled={loadingGraduateId === g.id}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60"
                    >
                      <Eye className="h-4 w-4" /> View Details
                    </button>
                    <button
                      type="button"
                      onClick={() => void openEdit(g)}
                      disabled={loadingGraduateId === g.id}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#1b2a4a] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#263c66] disabled:cursor-wait disabled:opacity-60"
                    >
                      <Edit2 className="h-4 w-4" /> Edit
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className={`w-full text-sm ${archiveView === 'archived' ? 'min-w-[1180px]' : 'min-w-[1120px]'}`}>
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 w-16">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    aria-label="Select all visible graduates"
                  />
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Student ID</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Contact No.</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Program</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Year Graduated</th>
                {archiveView === 'archived' && <th className="text-left px-4 py-3 font-semibold text-gray-600">Date Archived</th>}
                {archiveView === 'archived' && <th className="text-left px-4 py-3 font-semibold text-gray-600">Archived By</th>}
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={archiveView === 'archived' ? 10 : 8} className="text-center py-12 text-gray-400">Loading...</td></tr>
              ) : graduates.length === 0 ? (
                <tr><td colSpan={archiveView === 'archived' ? 10 : 8} className="text-center py-12 text-gray-400">{archiveView === 'archived' ? 'No archived registrar records.' : 'No graduates found'}</td></tr>
              ) : (
                graduates.map((g) => (
                  <tr key={g.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isGraduateSelected(g.id)}
                        onChange={() => toggleGraduateSelection(g.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        aria-label={`Select graduate ${g.student_id}`}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{g.student_id}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#1b2a4a]">
                        {formatGraduateDisplayName(g)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{displayOptionalValue(g.email)}</td>
                    <td className="px-4 py-3 text-gray-600">{displayOptionalValue(g.phone)}</td>
                    <td className="px-4 py-3">
                      <span className="bg-blue-50 text-blue-700 text-xs font-medium px-2 py-1 rounded">
                        {displayOptionalValue(g.program_code)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{displayOptionalValue(g.year_graduated)}</td>
                    {archiveView === 'archived' && <td className="px-4 py-3 text-gray-600">{formatDateTime(g.archived_at)}</td>}
                    {archiveView === 'archived' && <td className="px-4 py-3 text-gray-600">{g.archived_by_name || '-'}</td>}
                    <td className="px-4 py-3">
                      {archiveView === 'active' ? (
                        <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => void openDetails(g)}
                            disabled={loadingGraduateId === g.id}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60"
                          >
                            <Eye className="h-4 w-4" /> View Details
                          </button>
                          <button
                            type="button"
                            onClick={() => void openEdit(g)}
                            disabled={loadingGraduateId === g.id}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60"
                          >
                            <Edit2 className="h-4 w-4" /> Edit
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleRestore(g)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors" aria-label="Restore graduate">
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button onClick={() => handlePermanentDelete(g)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors" aria-label="Permanently delete graduate">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t bg-gray-50">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {showDetailsModal && viewedGraduate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="graduate-details-title">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white p-5">
              <div className="min-w-0">
                <h2 id="graduate-details-title" className="text-lg font-bold text-[#1b2a4a]">Graduate Details</h2>
                <p className="mt-1 break-words text-sm font-medium text-gray-600">{formatGraduateDisplayName(viewedGraduate)}</p>
              </div>
              <button type="button" onClick={() => setShowDetailsModal(false)} className="shrink-0 rounded-lg p-1 text-gray-500 hover:bg-gray-100" aria-label="Close graduate details">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 p-4 sm:p-5">
              {loadingGraduateId === viewedGraduate.id && (
                <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">Loading current graduate information...</p>
              )}

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Registrar Information</h3>
                <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <GraduateDetail label="Student ID" value={viewedGraduate.student_id} />
                  <GraduateDetail label="Name" value={formatGraduateDisplayName(viewedGraduate)} />
                  <GraduateDetail label="Email" value={viewedGraduate.email} breakAll />
                  <GraduateDetail label="Contact No." value={viewedGraduate.phone} />
                  <GraduateDetail label="Program" value={viewedGraduate.program_code || viewedGraduate.program_name} />
                  <GraduateDetail label="Year Graduated" value={viewedGraduate.year_graduated} />
                  <GraduateDetail label="Address" value={viewedGraduate.address} wide />
                </dl>
              </section>

              <div className="flex justify-end border-t pt-4">
                <button type="button" onClick={() => setShowDetailsModal(false)} className="rounded-lg bg-[#1b2a4a] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#263c66]">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="graduate-form-title">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 id="graduate-form-title" className="text-lg font-bold text-[#1b2a4a]">
                {editingGraduateId !== null ? 'Edit Graduate' : 'Add Graduate'}
              </h2>
              <button type="button" onClick={() => { setShowModal(false); setEditingGraduateId(null); }} className="p-1 rounded-lg hover:bg-gray-100" aria-label="Close graduate form">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4 sm:p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Student No.</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="2XXX-XXXX"
                    maxLength={9}
                    pattern="[0-9]{4}-[0-9]{4}"
                    title="Use this format: 2XXX-XXXX"
                    value={formData.student_id}
                    onChange={(e) => updateField('student_id', e.target.value)}
                    required
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <Input label="First Name" value={formData.first_name} onChange={(v) => updateField('first_name', v)} required />
                <Input label="Middle Name" value={formData.middle_name} onChange={(v) => updateField('middle_name', v)} />
                <Input label="Last Name" value={formData.last_name} onChange={(v) => updateField('last_name', v)} required />
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name Extension</label>
                  <select
                    value={formData.name_extension}
                    onChange={(e) => updateField('name_extension', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {NAME_EXTENSION_OPTIONS.map((option) => (
                      <option key={option || 'none'} value={option}>{option || 'None'}</option>
                    ))}
                  </select>
                </div>
                <Input label="Email (Optional)" type="email" value={formData.email} onChange={(v) => updateField('email', v)} />
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Contact No. (Optional)</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="09XXXXXXXXX"
                    maxLength={11}
                    pattern="09[0-9]{9}"
                    title="Use this format: 09XXXXXXXXX"
                    value={formData.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Program</label>
                  <select
                    value={formData.program_id}
                    onChange={(e) => updateField('program_id', e.target.value)}
                    required
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select</option>
                    {programOptions.map((program) => (
                      <option key={program.id} value={program.id}>{program.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Year Graduated</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    value={formData.year_graduated}
                    onChange={(e) => updateField('year_graduated', e.target.value)}
                    required
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                    onClick={() => { setShowModal(false); setEditingGraduateId(null); }}
                  className="px-4 py-2.5 border rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#1b2a4a] text-white rounded-lg text-sm font-medium hover:bg-[#263c66] transition-colors"
                >
                    {editingGraduateId !== null ? 'Save Changes' : 'Add Graduate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isImporting && importProgress && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="graduate-import-progress-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start gap-4">
              <div className="mt-0.5 h-11 w-11 shrink-0 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h2 id="graduate-import-progress-title" className="text-lg font-semibold text-[#1b2a4a]">
                  {importProgress.phase === 'validating' ? 'Validating Excel file...' : 'Importing graduate records...'}
                </h2>
                <p className="mt-1 truncate text-sm text-gray-500" title={importProgress.fileName}>
                  {importProgress.fileName}
                </p>
              </div>
            </div>

            <div className="mt-6" aria-live="polite">
              <p className="text-sm text-gray-600">
                {importProgress.phase === 'validating'
                  ? 'Checking the workbook structure, required columns, and row data.'
                  : `The server is importing ${importProgress.total} validated row${importProgress.total === 1 ? '' : 's'} in one transaction.`}
              </p>
              {importProgress.currentSheet && (
                <p className="mt-3 truncate text-xs text-gray-500" title={importProgress.currentSheet}>
                  Worksheet: <span className="font-medium text-gray-700">{importProgress.currentSheet}</span>
                </p>
              )}
            </div>

            <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Keep this page open until the import finishes.
            </p>
          </div>
        </div>
      )}

      {importResult && !isImporting && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="graduate-import-results-title"
        >
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 id="graduate-import-results-title" className="text-xl font-semibold text-[#1b2a4a]">
                  Import Successful
                </h2>
                <p className="mt-1 truncate text-sm text-gray-500" title={importResult.fileName}>
                  {importResult.fileName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportResult(null)}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close import results"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Rows found</p>
                  <p className="mt-1 text-2xl font-bold text-[#1b2a4a]">{importResult.totalRows}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Added</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-700">{importResult.added}</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Skipped</p>
                  <p className="mt-1 text-2xl font-bold text-amber-700">{importResult.skipped}</p>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Worksheets</p>
                  <p className="mt-1 text-2xl font-bold text-blue-700">{importResult.sheetCount}</p>
                </div>
              </div>

              {importResult.graduationYears.length > 0 && (
                <p className="mt-4 text-sm text-gray-600">
                  Graduation year{importResult.graduationYears.length === 1 ? '' : 's'} detected from the workbook: {' '}
                  <span className="font-semibold text-gray-800">{importResult.graduationYears.join(', ')}</span>
                </p>
              )}

              {importResult.failures.length > 0 ? (
                <div className="mt-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">Skipped existing records</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        These records already exist and were not inserted again.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadImportFailures(importResult)}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50"
                    >
                      <Download size={16} />
                      Download Skipped Rows CSV
                    </button>
                  </div>

                  {importResult.failures.length > 500 && (
                    <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Showing the first 500 of {importResult.failures.length} skipped rows. The CSV download includes all skipped rows.
                    </p>
                  )}

                  <div className="mt-3 max-h-[42vh] overflow-auto rounded-xl border border-gray-200">
                    <table className="w-full min-w-[880px] text-left text-sm">
                      <thead className="sticky top-0 z-10 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Worksheet</th>
                          <th className="px-4 py-3 font-semibold">Excel Row</th>
                          <th className="px-4 py-3 font-semibold">Student ID</th>
                          <th className="px-4 py-3 font-semibold">Graduate</th>
                          <th className="px-4 py-3 font-semibold">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {importResult.failures.slice(0, 500).map((failure, index) => (
                          <tr key={`${failure.sheetName}-${failure.rowNumber}-${index}`} className="align-top hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-800">{failure.sheetName}</td>
                            <td className="px-4 py-3 tabular-nums text-gray-700">{failure.rowNumber}</td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-700">{failure.studentId}</td>
                            <td className="px-4 py-3 text-gray-700">{failure.graduateName}</td>
                            <td className="px-4 py-3 text-red-700">{failure.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm text-emerald-800">
                  All {importResult.added} graduate row{importResult.added === 1 ? '' : 's'} were imported successfully.
                </div>
              )}
            </div>

            <div className="flex justify-end border-t bg-gray-50 px-5 py-4 sm:px-6">
              <button
                type="button"
                onClick={() => setImportResult(null)}
                className="rounded-lg bg-[#1b2a4a] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#263c66]"
              >
                Done
              </button>
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
        cancelText={msgBox.cancelText}
        destructive={msgBox.destructive}
      />
    </div>
  );
}

function GraduateDetail({
  label,
  value,
  wide = false,
  breakAll = false,
}: {
  label: string;
  value: unknown;
  wide?: boolean;
  breakAll?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 ${wide ? 'sm:col-span-2' : ''}`}>
      <dt className="text-xs font-medium text-gray-500">{label}</dt>
      <dd className={`mt-1 whitespace-pre-line text-sm font-semibold text-[#1b2a4a] ${breakAll ? 'break-all' : 'break-words [overflow-wrap:anywhere]'}`}>
        {displayOptionalValue(value)}
      </dd>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', required = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
