import { useEffect, useRef, useState } from 'react';
import {
  Search, Plus, Edit2, Trash2, X, ChevronLeft, ChevronRight, Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import MessageBox from '../../components/MessageBox';
import { API_ROOT } from '../../config/api';

const API_BASE = API_ROOT;

interface Graduate {
  id: number;
  student_id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  name_extension?: string;
  email: string;
  phone: string;
  program_id: number;
  program_name: string;
  program_code: string;
  year_graduated: number;
  address: string;
  employment_status: string;
  is_aligned: string;
  job_title: string;
  company_name: string;
}

interface FormData {
  id?: number;
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

const emptyForm: FormData = {
  student_id: '', first_name: '', middle_name: '', last_name: '', name_extension: '', email: '', phone: '',
  program_id: '', year_graduated: '', address: '', employment_status: 'unemployed',
  is_aligned: 'not_aligned', company_name: '', job_title: '', industry: '',
  date_hired: '', monthly_salary: '', time_to_employment: '',
};

const PROGRAM_OPTIONS = [
  { id: '1', code: 'BSCS', name: 'Bachelor of Science in Computer Science (BSCS)' },
  { id: '2', code: 'BSHM', name: 'Bachelor of Science in Hospitality Management (BSHM)' },
  { id: '3', code: 'BSED', name: 'Bachelor of Secondary Education (BSED)' },
  { id: '4', code: 'BEED', name: 'Bachelor of Elementary Education (BEED)' },
  { id: '5', code: 'ACT', name: 'Associate in Computer Technology (ACT)' },
];

const PROGRAM_DURATION_YEARS: Record<string, number> = {
  BSCS: 4,
  BSHM: 4,
  BSED: 4,
  BEED: 4,
  ACT: 2,
};

const NAME_EXTENSION_OPTIONS = ['', 'Jr.', 'Sr.', 'II', 'III', 'IV', 'V', 'VI'];

const DEFAULT_YEAR_TAB_OPTIONS = ['2021', '2022', '2023', '2024', '2025'];

const normalizeText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const pickValue = (row: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = normalizeText(row[key]);
      if (value !== '') return value;
    }
  }
  return '';
};

const normalizeHeaderKey = (value: unknown): string => normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, '');

const NAME_EXTENSION_ALIASES: Record<string, string> = {
  jr: 'Jr.',
  'jr.': 'Jr.',
  sr: 'Sr.',
  'sr.': 'Sr.',
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
  return NAME_EXTENSION_ALIASES[lower] ?? normalized;
};

const popTrailingNameExtension = (tokens: string[]): string => {
  if (tokens.length === 0) return '';

  const last = normalizeNameExtension(tokens[tokens.length - 1]);
  if (last && Object.values(NAME_EXTENSION_ALIASES).includes(last)) {
    tokens.pop();
    return last;
  }

  return '';
};

const splitName = (fullName: string): { firstName: string; middleName: string; lastName: string; nameExtension: string } => {
  const normalized = normalizeText(fullName).replace(/\s+/g, ' ');
  if (!normalized) {
    return {
      firstName: '', middleName: '', lastName: '', nameExtension: '',
    };
  }

  if (normalized.includes(',')) {
    const [lastPart, ...restParts] = normalized.split(',');
    const lastName = normalizeText(lastPart);
    const given = normalizeText(restParts.join(' '));
    const nameParts = given ? given.split(' ').filter(Boolean) : [];
    const nameExtension = popTrailingNameExtension(nameParts);
    const firstName = nameParts[0] ?? '';
    const middleName = nameParts.slice(1).join(' ');
    return {
      firstName, middleName, lastName, nameExtension,
    };
  }

  const tokens = normalized.split(' ').filter(Boolean);
  const nameExtension = popTrailingNameExtension(tokens);

  if (tokens.length === 1) {
    return {
      firstName: tokens[0], middleName: '', lastName: '', nameExtension,
    };
  }

  return {
    firstName: tokens[0],
    middleName: tokens.slice(1, -1).join(' '),
    lastName: tokens[tokens.length - 1],
    nameExtension,
  };
};

const formatGraduateDisplayName = (graduate: {
  first_name: string;
  middle_name?: string;
  last_name: string;
  name_extension?: string;
}): string => {
  const middleInitial = graduate.middle_name ? ` ${graduate.middle_name.charAt(0)}.` : '';
  const extension = normalizeText(graduate.name_extension);
  const suffix = extension ? ` ${extension}` : '';
  return `${graduate.last_name}, ${graduate.first_name}${middleInitial}${suffix}`;
};

const findHeaderRowIndex = (rows: unknown[][]): number => {
  const required = new Set(['studentnumber', 'studentid', 'name']);

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const keys = new Set(row.map((cell) => normalizeHeaderKey(cell)).filter(Boolean));
    const hasStudent = keys.has('studentnumber') || keys.has('studentid');
    const hasName = keys.has('name') || keys.has('fullname');
    const hasAnyContact = keys.has('email') || keys.has('emailadd') || keys.has('emailaddress') || keys.has('contactnumber') || keys.has('contactno');

    if (required.has('name') && hasStudent && hasName && hasAnyContact) {
      return i;
    }
  }

  return -1;
};

const extractGraduationYearFromRows = (rows: unknown[][]): string => {
  const topRows = rows.slice(0, 20);
  for (const row of topRows) {
    const joined = row.map((cell) => normalizeText(cell)).join(' ');
    const match = joined.match(/(?:19|20)\d{2}/);
    if (match) {
      return match[0];
    }
  }
  return '';
};

const mergeAndSortYears = (prevYears: string[], nextYears: string[]): string[] => {
  const merged = new Set([...prevYears, ...nextYears].filter(Boolean));
  return Array.from(merged).sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
};

const getProgramDurationById = (programId: string): number | null => {
  const selectedProgram = PROGRAM_OPTIONS.find((option) => option.id === programId);
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

const inferGraduationYear = (studentId: string, programId: string): string => {
  const startYear = extractStartYearFromStudentId(studentId);
  const duration = getProgramDurationById(programId);

  if (!startYear || !duration) return '';

  return String(startYear + duration);
};

const formatStudentId = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
};

const formatContactNumber = (value: string): string => value.replace(/\D/g, '').slice(0, 11);

const normalizeEmploymentStatus = (value: string): string => {
  const parsed = value.toLowerCase().replace(/\s+/g, '_');
  if (['employed', 'self_employed', 'freelance', 'unemployed'].includes(parsed)) {
    return parsed;
  }
  return 'unemployed';
};

const normalizeAlignment = (value: string): string => {
  const parsed = value.toLowerCase().replace(/\s+/g, '_');
  if (['aligned', 'partially_aligned', 'not_aligned'].includes(parsed)) {
    return parsed;
  }
  return 'not_aligned';
};

const resolveProgramId = (row: Record<string, unknown>): string => {
  const programId = pickValue(row, ['Program ID', 'program_id', 'programId']);
  if (programId !== '' && PROGRAM_OPTIONS.some((option) => option.id === programId)) {
    return programId;
  }

  const code = pickValue(row, ['Program Code', 'program_code', 'programCode']).toUpperCase();
  if (code !== '') {
    const matchByCode = PROGRAM_OPTIONS.find((option) => option.code === code);
    if (matchByCode) return matchByCode.id;
  }

  const name = pickValue(row, ['Program', 'Program Name', 'program_name', 'programName']).toLowerCase();
  if (name !== '') {
    const matchByName = PROGRAM_OPTIONS.find((option) => option.name.toLowerCase() === name);
    if (matchByName) return matchByName.id;
  }

  return '';
};

const mapExcelRowToPayload = (row: Record<string, unknown>, fallbackYear = ''): FormData => {
  const fullName = pickValue(row, ['Name', 'Full Name', 'full_name', 'fullName']);
  const parsedName = splitName(fullName);

  const firstName = pickValue(row, ['First Name', 'first_name', 'firstName']) || parsedName.firstName;
  const middleName = pickValue(row, ['Middle Name', 'middle_name', 'middleName']) || parsedName.middleName;
  const lastName = pickValue(row, ['Last Name', 'last_name', 'lastName']) || parsedName.lastName;
  const nameExtension = normalizeNameExtension(
    pickValue(row, ['Name Extension', 'Name Ext', 'Suffix', 'name_extension', 'nameExtension', 'suffix']) || parsedName.nameExtension
  );

  const rawYear = pickValue(row, ['Year Graduated', 'Graduation Year', 'year_graduated', 'yearGraduated']) || fallbackYear;
  const parsedYear = rawYear ? Number.parseInt(rawYear, 10) : NaN;

  return {
    ...emptyForm,
    student_id: pickValue(row, ['Student ID', 'Student Number', 'student_id', 'studentId']),
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    name_extension: nameExtension,
    email: pickValue(row, ['Email', 'Email Add', 'Email Address', 'email']),
    phone: pickValue(row, ['Contact No.', 'Contact No', 'Contact Number', 'Phone', 'phone']),
    program_id: resolveProgramId(row),
    year_graduated: Number.isNaN(parsedYear) ? '' : String(parsedYear),
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

const getImportFailureReason = (value: unknown): string => {
  const message = normalizeText(value);
  if (!message) return 'Rejected by server';

  const lower = message.toLowerCase();
  if (lower.includes('student id already exists') || lower.includes('student no. already exists')) {
    return 'Duplicate student ID';
  }

  if (lower.includes('email already exists')) {
    return 'Duplicate email';
  }

  if (lower.includes('student_id') && lower.includes('duplicate')) {
    return 'Duplicate student ID';
  }

  if (lower.includes('email') && lower.includes('duplicate')) {
    return 'Duplicate email';
  }

  if (lower.includes('same student no. or email') || lower.includes('same student id or email')) {
    return 'Duplicate student ID or email';
  }

  if (lower.includes('same student no') || lower.includes('same student id')) {
    return 'Duplicate student ID';
  }

  if (hasTechnicalDatabaseDetails(message)) {
    return 'Duplicate or invalid record';
  }

  return message;
};

const getSafeErrorMessage = (error: unknown, fallback: string): string => {
  const message = error instanceof Error ? error.message : normalizeText(error);
  if (!message || hasTechnicalDatabaseDetails(message)) {
    return fallback;
  }

  return message;
};

export default function Graduates() {
  const [graduates, setGraduates] = useState<Graduate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('1');
  const [filterYear, setFilterYear] = useState('');
  const [yearTabOptions, setYearTabOptions] = useState<string[]>(DEFAULT_YEAR_TAB_OPTIONS);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [isEditing, setIsEditing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedGraduateIds, setSelectedGraduateIds] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [msgBox, setMsgBox] = useState<{
    isOpen: boolean;
    type: MessageType;
    message: string;
    onConfirm?: () => void;
    confirmText?: string;
    cancelText?: string;
  }>({ isOpen: false, type: 'success', message: '' });

  const buildQueryParams = (targetPage: number, limit: number) => {
    const params = new URLSearchParams();
    params.append('page', targetPage.toString());
    params.append('limit', limit.toString());
    if (search) params.append('search', search);
    if (activeTab) params.append('program_id', activeTab);
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

      setGraduates(res.data);
      setTotalPages(res.pagination.pages);
      setTotal(res.pagination.total);
      setSelectedGraduateIds([]);

      const fetchedYears = (res.data as Graduate[])
        .map((graduate) => normalizeText(graduate.year_graduated))
        .filter((year) => /^\d{4}$/.test(year));
      if (fetchedYears.length > 0) {
        setYearTabOptions((prev) => mergeAndSortYears(prev, fetchedYears));
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
  }, [page, search, activeTab, filterYear]);

  const openAdd = () => {
    setFormData({ ...emptyForm, program_id: activeTab });
    setIsEditing(false);
    setShowModal(true);
  };

  const openEdit = (g: Graduate) => {
    setFormData({
      id: g.id,
      student_id: g.student_id || '',
      first_name: g.first_name,
      middle_name: g.middle_name || '',
      last_name: g.last_name,
      name_extension: g.name_extension || '',
      email: g.email || '',
      phone: g.phone || '',
      program_id: g.program_id?.toString() || '',
      year_graduated: g.year_graduated?.toString() || '',
      address: g.address || '',
      employment_status: g.employment_status || 'unemployed',
      is_aligned: g.is_aligned || 'not_aligned',
      company_name: g.company_name || '',
      job_title: g.job_title || '',
      industry: '',
      date_hired: '',
      monthly_salary: '',
      time_to_employment: '',
    });
    setIsEditing(true);
    setShowModal(true);
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

    if (!/^09\d{9}$/.test(formData.phone)) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: 'Contact No. must be 11 digits and start with 09 (e.g., 09123456789).',
      });
      return;
    }

    try {
      const method = isEditing ? 'PUT' : 'POST';
      const response = await fetch(`${API_BASE}/graduates/index.php`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });
      const res = await response.json();

      if (!response.ok || !res.success) {
        throw new Error(res.error || 'Unable to save graduate');
      }

      setShowModal(false);
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

  const handleDelete = (id: number) => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      message: 'Are you sure you want to delete this graduate?',
      confirmText: 'Yes, delete!',
      cancelText: 'No, keep it.',
      onConfirm: async () => {
        try {
          const response = await fetch(`${API_BASE}/graduates/index.php`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id }),
          });
          const res = await response.json();

          if (!response.ok || !res.success) {
            throw new Error(res.error || 'Unable to delete graduate');
          }

          await fetchGraduates();
          setMsgBox({
            isOpen: true,
            type: 'success',
            message: 'Graduate deleted successfully.',
          });
        } catch (error) {
          setMsgBox({
            isOpen: true,
            type: 'error',
            message: getSafeErrorMessage(error, 'Unable to delete graduate'),
          });
        }
      },
    });
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

  const performDeleteRequest = async (payload: Record<string, unknown>) => {
    const response = await fetch(`${API_BASE}/graduates/index.php`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const res = await response.json();
    if (!response.ok || !res.success) {
      throw new Error(res.error || 'Unable to delete graduate records');
    }

    return res;
  };

  const handleDeleteSelected = () => {
    if (selectedGraduateIds.length === 0) return;

    setMsgBox({
      isOpen: true,
      type: 'confirm',
      message: `Delete ${selectedGraduateIds.length} selected graduate(s)? This cannot be undone.`,
      confirmText: 'Yes, delete!',
      cancelText: 'No, keep it.',
      onConfirm: async () => {
        try {
          await performDeleteRequest({ ids: selectedGraduateIds });
          await fetchGraduates();
          setMsgBox({
            isOpen: true,
            type: 'success',
            message: 'Selected graduates deleted successfully.',
          });
        } catch (error) {
          setMsgBox({
            isOpen: true,
            type: 'error',
            message: getSafeErrorMessage(error, 'Unable to delete selected graduates'),
          });
        }
      },
    });
  };

  const handleDeleteByYear = () => {
    if (!filterYear) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: 'Select a year first before deleting by year.',
      });
      return;
    }

    setMsgBox({
      isOpen: true,
      type: 'confirm',
      message: `Delete all graduates for year ${filterYear} in ${PROGRAM_OPTIONS.find((p) => p.id === activeTab)?.code || 'the selected program'}? This cannot be undone.`,
      confirmText: 'Yes, delete!',
      cancelText: 'No, keep it.',
      onConfirm: async () => {
        try {
          const result = await performDeleteRequest({
            year_graduated: filterYear,
            program_id: activeTab,
          });

          await fetchGraduates();
          setMsgBox({
            isOpen: true,
            type: 'success',
            message: `${result.deleted ?? 0} graduate(s) deleted for year ${filterYear}.`,
          });
        } catch (error) {
          setMsgBox({
            isOpen: true,
            type: 'error',
            message: getSafeErrorMessage(error, 'Unable to delete graduates by year'),
          });
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

    if (!file) return;

    setIsImporting(true);

    try {
      const fileBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(fileBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error('Excel file has no worksheet.');
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const matrixRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        defval: '',
        blankrows: false,
      }) as unknown[][];

      const inferredYear = extractGraduationYearFromRows(matrixRows);
      const fallbackYear = filterYear || inferredYear;

      const headerRowIndex = findHeaderRowIndex(matrixRows);
      let rows: Record<string, unknown>[] = [];

      if (headerRowIndex >= 0) {
        const rawHeaders = matrixRows[headerRowIndex] ?? [];
        const headers = rawHeaders.map((cell) => normalizeText(cell));

        rows = matrixRows.slice(headerRowIndex + 1)
          .map((row) => {
            const record: Record<string, unknown> = {};
            headers.forEach((header, index) => {
              if (header !== '') {
                record[header] = row[index] ?? '';
              }
            });
            return record;
          })
          .filter((row) => Object.values(row).some((value) => normalizeText(value) !== ''));
      } else {
        rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
      }

      if (rows.length === 0) {
        throw new Error('Excel file is empty.');
      }

      let successCount = 0;
      let failedCount = 0;
      const importedYears = new Set<string>();
      const failureReasons: Record<string, number> = {};

      const addFailureReason = (reason: string) => {
        const safeReason = getImportFailureReason(reason);
        failureReasons[safeReason] = (failureReasons[safeReason] ?? 0) + 1;
      };

      for (const row of rows) {
        const payload = mapExcelRowToPayload(row, fallbackYear);
        if (!payload.program_id) {
          payload.program_id = activeTab;
        }

        if (!payload.first_name || !payload.last_name) {
          failedCount += 1;
          addFailureReason('Missing name');
          continue;
        }

        if (!payload.year_graduated) {
          failedCount += 1;
          addFailureReason('Missing graduation year');
          continue;
        }

        const response = await fetch(`${API_BASE}/graduates/index.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const result = await response.json();

        if (response.ok && result.success) {
          successCount += 1;
          if (/^\d{4}$/.test(payload.year_graduated)) {
            importedYears.add(payload.year_graduated);
          }
        } else {
          failedCount += 1;
          addFailureReason(result?.error || 'Rejected by server');
        }
      }

      await fetchGraduates();
      if (importedYears.size > 0) {
        setYearTabOptions((prev) => mergeAndSortYears(prev, Array.from(importedYears)));
      }

      const sortedReasons = Object.entries(failureReasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason, count]) => `${reason}: ${count}`)
        .join(', ');

      const msgType: MessageType = failedCount === 0
        ? 'success'
        : successCount > 0
          ? 'warning'
          : 'error';

      const statusLabel = failedCount === 0
        ? 'Import completed successfully.'
        : successCount > 0
          ? 'Import completed with some skipped rows.'
          : 'Import failed.';

      setMsgBox({
        isOpen: true,
        type: msgType,
        message: `${statusLabel}\nAdded: ${successCount}. Failed: ${failedCount}.${sortedReasons ? `\nSkipped rows: ${sortedReasons}.` : ''}`,
      });
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: getSafeErrorMessage(error, 'Excel import failed. Please check the file and try again.'),
      });
    } finally {
      setIsImporting(false);
    }
  };

  const updateField = (field: keyof FormData, value: string) => {
    setFormData((prev) => {
      const normalizedValue = field === 'student_id'
        ? formatStudentId(value)
        : field === 'phone'
          ? formatContactNumber(value)
          : value;
      const next = { ...prev, [field]: normalizedValue };

      if (field === 'student_id' || field === 'program_id') {
        const computedYear = inferGraduationYear(next.student_id, next.program_id);
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
          <h1 className="text-2xl font-bold text-[#1b2a4a]">Manage Graduates</h1>
          <p className="text-sm text-gray-500">{total} total graduates</p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImportExcel}
          />

          <button
            onClick={handleImportClick}
            disabled={isImporting}
            className="flex w-full items-center justify-center gap-2 border border-blue-200 text-blue-700 px-4 py-2.5 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed sm:w-auto"
          >
            <Download className="w-4 h-4" />
            {isImporting ? 'Importing...' : 'Import Excel'}
          </button>

          <button
            onClick={openAdd}
            className="flex w-full items-center justify-center gap-2 bg-[#1b2a4a] text-white px-4 py-2.5 rounded-lg hover:bg-[#263c66] transition-colors text-sm font-medium sm:w-auto"
          >
            <Plus className="w-4 h-4" /> Add Graduate
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border">
        <div className="flex items-center gap-1 px-4 pt-4 border-b overflow-x-auto overflow-y-hidden">
          {PROGRAM_OPTIONS.map((program) => (
            <button
              key={program.id}
              onClick={() => { setActiveTab(program.id); setPage(1); }}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === program.id
                  ? 'border-[#1b2a4a] text-[#1b2a4a]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {program.code}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 px-4 pt-2 border-b overflow-x-auto overflow-y-hidden">
          <button
            onClick={() => { setFilterYear(''); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              filterYear === ''
                ? 'border-[#1b2a4a] text-[#1b2a4a]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            All Years
          </button>
          {yearTabOptions.map((year) => (
            <button
              key={year}
              onClick={() => { setFilterYear(year); setPage(1); }}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                filterYear === year
                  ? 'border-[#1b2a4a] text-[#1b2a4a]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {year}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, student ID, or email..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={toggleSelectAllVisible}
              className="px-3 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              type="button"
            >
              {allVisibleSelected ? 'Clear Selection' : 'Select All (This Page)'}
            </button>

            <button
              onClick={handleDeleteSelected}
              disabled={selectedGraduateIds.length === 0}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              type="button"
            >
              Delete Selected ({selectedGraduateIds.length})
            </button>

            <button
              onClick={handleDeleteByYear}
              disabled={!filterYear}
              className="px-3 py-2 rounded-lg text-sm font-medium text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              type="button"
            >
              Delete By Year
            </button>
          </div>

          <div className="flex flex-wrap gap-3 pt-2 border-t">
            <select
              value={filterYear}
              onChange={(e) => { setFilterYear(e.target.value); setPage(1); }}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-auto"
            >
              <option value="">All Years</option>
              {yearTabOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="divide-y md:hidden">
          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading...</div>
          ) : graduates.length === 0 ? (
            <div className="py-12 text-center text-gray-400">No graduates found</div>
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
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => openEdit(g)} className="p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors" aria-label="Edit graduate">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(g.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors" aria-label="Delete graduate">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-600">
                  <p className="col-span-2 truncate">{g.email || '-'}</p>
                  <p>{g.phone || '-'}</p>
                  <p className="text-right">{g.year_graduated || '-'}</p>
                  <p>
                    <span className="bg-blue-50 text-blue-700 text-xs font-medium px-2 py-1 rounded">
                      {g.program_code || '-'}
                    </span>
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1100px] text-sm">
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
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Year</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">Loading...</td></tr>
              ) : graduates.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">No graduates found</td></tr>
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
                    <td className="px-4 py-3 text-gray-600">{g.email || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{g.phone || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="bg-blue-50 text-blue-700 text-xs font-medium px-2 py-1 rounded">
                        {g.program_code || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">{g.year_graduated || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEdit(g)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(g.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
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

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold text-[#1b2a4a]">
                {isEditing ? 'Edit Graduate' : 'Add Graduate'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100">
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
                <Input label="Email" type="email" value={formData.email} onChange={(v) => updateField('email', v)} />
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Contact No.</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="09XXXXXXXXX"
                    maxLength={11}
                    pattern="09[0-9]{9}"
                    title="Use this format: 09XXXXXXXXX"
                    value={formData.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    required
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
                    {PROGRAM_OPTIONS.map((program) => (
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
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 border rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#1b2a4a] text-white rounded-lg text-sm font-medium hover:bg-[#263c66] transition-colors"
                >
                  {isEditing ? 'Update' : 'Add Graduate'}
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
        confirmText={msgBox.confirmText}
        cancelText={msgBox.cancelText}
      />
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
