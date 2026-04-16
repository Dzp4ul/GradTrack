import { useEffect, useRef, useState } from 'react';
import {
  Search, Plus, Edit2, Trash2, X, ChevronLeft, ChevronRight, Upload, Download,
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
  student_id: '', first_name: '', middle_name: '', last_name: '', email: '', phone: '',
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

const YEAR_TAB_OPTIONS = ['2021', '2022', '2023', '2024', '2025'];

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

const mapExcelRowToPayload = (row: Record<string, unknown>): FormData => {
  const rawYear = pickValue(row, ['Year Graduated', 'year_graduated', 'yearGraduated']);
  const parsedYear = rawYear ? Number.parseInt(rawYear, 10) : NaN;

  return {
    ...emptyForm,
    student_id: pickValue(row, ['Student ID', 'student_id', 'studentId']),
    first_name: pickValue(row, ['First Name', 'first_name', 'firstName']),
    last_name: pickValue(row, ['Last Name', 'last_name', 'lastName']),
    email: pickValue(row, ['Email', 'email']),
    phone: pickValue(row, ['Contact No.', 'Contact Number', 'Phone', 'phone']),
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

type MessageType = 'confirm' | 'success' | 'error';

export default function Graduates() {
  const [graduates, setGraduates] = useState<Graduate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('1');
  const [filterYear, setFilterYear] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [isEditing, setIsEditing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [msgBox, setMsgBox] = useState<{ isOpen: boolean; type: MessageType; message: string; onConfirm?: () => void }>({ isOpen: false, type: 'success', message: '' });

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
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to load graduates',
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
        message: error instanceof Error ? error.message : 'Unable to save graduate',
      });
    }
  };

  const handleDelete = (id: number) => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      message: 'Are you sure you want to delete this graduate?',
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
            message: error instanceof Error ? error.message : 'Unable to delete graduate',
          });
        }
      },
    });
  };

  const fetchAllGraduates = async () => {
    const rows: Graduate[] = [];
    let currentPage = 1;
    let pages = 1;

    while (currentPage <= pages) {
      const params = buildQueryParams(currentPage, 200);
      const response = await fetch(`${API_BASE}/graduates/index.php?${params}`, {
        credentials: 'include',
      });
      const res = await response.json();

      if (!response.ok || !res.success) {
        throw new Error(res.error || 'Unable to fetch graduates for export');
      }

      rows.push(...res.data);
      pages = res.pagination.pages;
      currentPage += 1;
    }

    return rows;
  };

  const handleExportExcel = async () => {
    setIsExporting(true);

    try {
      const exportRows = await fetchAllGraduates();
      const sheetData = exportRows.map((g) => ({
        'Student ID': g.student_id || '',
        'First Name': g.first_name || '',
        'Last Name': g.last_name || '',
        Email: g.email || '',
        Phone: g.phone || '',
        'Program ID': g.program_id || '',
        'Program Code': g.program_code || '',
        'Year Graduated': g.year_graduated || '',
        Address: g.address || '',
        'Employment Status': g.employment_status || '',
        'Course Alignment': g.is_aligned || '',
        'Company Name': g.company_name || '',
        'Job Title': g.job_title || '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(sheetData, {
        header: [
          'Student ID',
          'First Name',
          'Last Name',
          'Email',
          'Phone',
          'Program ID',
          'Program Code',
          'Year Graduated',
          'Address',
          'Employment Status',
          'Course Alignment',
          'Company Name',
          'Job Title',
        ],
      });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Graduates');

      const dateStamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `graduates-${dateStamp}.xlsx`);

      setMsgBox({
        isOpen: true,
        type: 'success',
        message: `Exported ${exportRows.length} graduate record(s) to Excel.`,
      });
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Excel export failed',
      });
    } finally {
      setIsExporting(false);
    }
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
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });

      if (rows.length === 0) {
        throw new Error('Excel file is empty.');
      }

      let successCount = 0;
      let failedCount = 0;

      for (const row of rows) {
        const payload = mapExcelRowToPayload(row);
        if (!payload.first_name || !payload.last_name) {
          failedCount += 1;
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
        } else {
          failedCount += 1;
        }
      }

      await fetchGraduates();

      const msgType: MessageType = failedCount > 0 ? 'error' : 'success';
      setMsgBox({
        isOpen: true,
        type: msgType,
        message: `Excel import finished. Added: ${successCount}. Failed: ${failedCount}.`,
      });
    } catch (error) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: error instanceof Error ? error.message : 'Excel import failed',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const updateField = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex w-full items-center justify-center gap-2 border border-emerald-200 text-emerald-700 px-4 py-2.5 rounded-lg hover:bg-emerald-50 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed sm:w-auto"
          >
            <Upload className="w-4 h-4" />
            {isExporting ? 'Exporting...' : 'Export Excel'}
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
        <div className="flex items-center gap-1 px-4 pt-4 border-b overflow-x-auto">
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

        <div className="flex items-center gap-1 px-4 pt-2 border-b overflow-x-auto">
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
          {YEAR_TAB_OPTIONS.map((year) => (
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

          <div className="flex flex-wrap gap-3 pt-2 border-t">
            <select
              value={filterYear}
              onChange={(e) => { setFilterYear(e.target.value); setPage(1); }}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-auto"
            >
              <option value="">All Years</option>
              {YEAR_TAB_OPTIONS.map((year) => (
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
                    <p className="font-semibold text-[#1b2a4a]">
                      {g.last_name}, {g.first_name}{g.middle_name ? ` ${g.middle_name.charAt(0)}.` : ''}
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
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">Loading...</td></tr>
              ) : graduates.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">No graduates found</td></tr>
              ) : (
                graduates.map((g) => (
                  <tr key={g.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{g.student_id}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#1b2a4a]">
                        {g.last_name}, {g.first_name}{g.middle_name ? ` ${g.middle_name.charAt(0)}.` : ''}
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
                <Input label="Student No." value={formData.student_id} onChange={(v) => updateField('student_id', v)} required />
                <Input label="First Name" value={formData.first_name} onChange={(v) => updateField('first_name', v)} required />
                <Input label="Middle Name" value={formData.middle_name} onChange={(v) => updateField('middle_name', v)} />
                <Input label="Last Name" value={formData.last_name} onChange={(v) => updateField('last_name', v)} required />
                <Input label="Email" type="email" value={formData.email} onChange={(v) => updateField('email', v)} />
                <Input label="Contact No." type="tel" value={formData.phone} onChange={(v) => updateField('phone', v)} />
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
                <Input label="Year Graduated" type="number" value={formData.year_graduated} onChange={(v) => updateField('year_graduated', v)} required />
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
