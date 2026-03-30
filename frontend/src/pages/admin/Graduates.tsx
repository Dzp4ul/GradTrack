import { useState, useEffect } from 'react';
import {
  Search, Plus, Edit2, Trash2, X, ChevronLeft, ChevronRight, Filter,
} from 'lucide-react';
import MessageBox from '../../components/MessageBox';
import { API_ROOT } from '../../config/api';

const API_BASE = API_ROOT;

interface Graduate {
  id: number;
  student_id: string;
  first_name: string;
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
  student_id: '', first_name: '', last_name: '', email: '', phone: '',
  program_id: '', year_graduated: '', address: '', employment_status: 'unemployed',
  is_aligned: 'not_aligned', company_name: '', job_title: '', industry: '',
  date_hired: '', monthly_salary: '', time_to_employment: '',
};

const statusColors: Record<string, string> = {
  employed: 'bg-green-100 text-green-700',
  self_employed: 'bg-blue-100 text-blue-700',
  freelance: 'bg-purple-100 text-purple-700',
  unemployed: 'bg-red-100 text-red-700',
};

const alignColors: Record<string, string> = {
  aligned: 'bg-green-100 text-green-700',
  partially_aligned: 'bg-yellow-100 text-yellow-700',
  not_aligned: 'bg-red-100 text-red-700',
};

export default function Graduates() {
  const [graduates, setGraduates] = useState<Graduate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterProgram, setFilterProgram] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [isEditing, setIsEditing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [msgBox, setMsgBox] = useState<{ isOpen: boolean; type: 'confirm' | 'success' | 'error'; message: string; onConfirm?: () => void }>({ isOpen: false, type: 'success', message: '' });

  const fetchGraduates = () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', '10');
    if (search) params.append('search', search);
    if (filterProgram) params.append('program_id', filterProgram);
    if (filterYear) params.append('year_graduated', filterYear);
    if (filterStatus) params.append('employment_status', filterStatus);

    fetch(`${API_BASE}/graduates/index.php?${params}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setGraduates(res.data);
          setTotalPages(res.pagination.pages);
          setTotal(res.pagination.total);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchGraduates(); }, [page, search, filterProgram, filterYear, filterStatus]);

  const openAdd = () => {
    setFormData(emptyForm);
    setIsEditing(false);
    setShowModal(true);
  };

  const openEdit = (g: Graduate) => {
    setFormData({
      id: g.id,
      student_id: g.student_id || '',
      first_name: g.first_name,
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const method = isEditing ? 'PUT' : 'POST';
    fetch(`${API_BASE}/graduates/index.php`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setShowModal(false);
          fetchGraduates();
        }
      })
      .catch(() => {});
  };

  const handleDelete = (id: number) => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      message: 'Are you sure you want to delete this graduate?',
      onConfirm: () => {
        fetch(`${API_BASE}/graduates/index.php`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })
          .then((r) => r.json())
          .then((res) => {
            if (res.success) fetchGraduates();
          })
          .catch(() => {});
      }
    });
  };

  const updateField = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1b2a4a]">Manage Graduates</h1>
          <p className="text-sm text-gray-500">{total} total graduates</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-[#1b2a4a] text-white px-4 py-2.5 rounded-lg hover:bg-[#263c66] transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Add Graduate
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
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
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg text-sm transition-colors ${showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'hover:bg-gray-50'}`}
          >
            <Filter className="w-4 h-4" /> Filters
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-3 pt-2 border-t">
            <select
              value={filterProgram}
              onChange={(e) => { setFilterProgram(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Programs</option>
              <option value="1">Bachelor of Science in Computer Science (BSCS)</option>
              <option value="2">Bachelor of Science in Hospitality Management (BSHM)</option>
              <option value="3">Bachelor of Secondary Education (BSED)</option>
              <option value="4">Bachelor of Elementary Education (BEED)</option>
            </select>
            <select
              value={filterYear}
              onChange={(e) => { setFilterYear(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Years</option>
              {[2022, 2021, 2020, 2019].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="employed">Employed</option>
              <option value="self_employed">Self-Employed</option>
              <option value="freelance">Freelance</option>
              <option value="unemployed">Unemployed</option>
            </select>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Student ID</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Program</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Year</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Alignment</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Job</th>
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
                    <td className="px-4 py-3 font-mono text-xs">{g.student_id}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#1b2a4a]">{g.first_name} {g.last_name}</p>
                      <p className="text-xs text-gray-400">{g.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-blue-50 text-blue-700 text-xs font-medium px-2 py-1 rounded">
                        {g.program_code || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">{g.year_graduated || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded capitalize ${statusColors[g.employment_status] || 'bg-gray-100 text-gray-600'}`}>
                        {(g.employment_status || 'unknown').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded capitalize ${alignColors[g.is_aligned] || 'bg-gray-100 text-gray-600'}`}>
                        {(g.is_aligned || 'unknown').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {g.job_title ? (
                        <>
                          <p className="font-medium">{g.job_title}</p>
                          <p className="text-gray-400">{g.company_name}</p>
                        </>
                      ) : '—'}
                    </td>
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold text-[#1b2a4a]">
                {isEditing ? 'Edit Graduate' : 'Add Graduate'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-5">
              {/* Personal Info */}
              <div>
                <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Personal Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Student ID" value={formData.student_id} onChange={(v) => updateField('student_id', v)} />
                  <Input label="First Name" value={formData.first_name} onChange={(v) => updateField('first_name', v)} required />
                  <Input label="Last Name" value={formData.last_name} onChange={(v) => updateField('last_name', v)} required />
                  <Input label="Email" type="email" value={formData.email} onChange={(v) => updateField('email', v)} />
                  <Input label="Phone" value={formData.phone} onChange={(v) => updateField('phone', v)} />
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Program</label>
                    <select
                      value={formData.program_id}
                      onChange={(e) => updateField('program_id', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select</option>
                      <option value="1">Bachelor of Science in Computer Science (BSCS)</option>
                      <option value="2">Bachelor of Science in Hospitality Management (BSHM)</option>
                      <option value="3">Bachelor of Secondary Education (BSED)</option>
                      <option value="4">Bachelor of Elementary Education (BEED)</option>
                    </select>
                  </div>
                  <Input label="Year Graduated" type="number" value={formData.year_graduated} onChange={(v) => updateField('year_graduated', v)} />
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => updateField('address', e.target.value)}
                    rows={2}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Employment Info */}
              <div>
                <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Employment Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Employment Status</label>
                    <select
                      value={formData.employment_status}
                      onChange={(e) => updateField('employment_status', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="unemployed">Unemployed</option>
                      <option value="employed">Employed</option>
                      <option value="self_employed">Self-Employed</option>
                      <option value="freelance">Freelance</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Alignment</label>
                    <select
                      value={formData.is_aligned}
                      onChange={(e) => updateField('is_aligned', e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="not_aligned">Not Aligned</option>
                      <option value="partially_aligned">Partially Aligned</option>
                      <option value="aligned">Aligned</option>
                    </select>
                  </div>
                  <Input label="Company Name" value={formData.company_name} onChange={(v) => updateField('company_name', v)} />
                  <Input label="Job Title" value={formData.job_title} onChange={(v) => updateField('job_title', v)} />
                  <Input label="Industry" value={formData.industry} onChange={(v) => updateField('industry', v)} />
                  <Input label="Date Hired" type="date" value={formData.date_hired} onChange={(v) => updateField('date_hired', v)} />
                  <Input label="Monthly Salary" type="number" value={formData.monthly_salary} onChange={(v) => updateField('monthly_salary', v)} />
                  <Input label="Time to Employment (months)" type="number" value={formData.time_to_employment} onChange={(v) => updateField('time_to_employment', v)} />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
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
