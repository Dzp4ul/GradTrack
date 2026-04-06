import { useEffect, useState, type ReactNode } from 'react';
import { Search, Filter, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Users } from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';

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
  last_submitted_at: string | null;
}

interface DeanSummary {
  total: number;
  answered: number;
  not_answered: number;
}

export default function DeanSurveyStatus() {
  const [rows, setRows] = useState<DeanGraduateRow[]>([]);
  const [summary, setSummary] = useState<DeanSummary>({ total: 0, answered: 0, not_answered: 0 });
  const [programScope, setProgramScope] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'answered' | 'not_answered'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');

  const fetchDeanSurveyStatus = async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', '10');
      if (search.trim()) params.append('search', search.trim());
      if (statusFilter !== 'all') params.append('status', statusFilter);

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
      setError(err instanceof Error ? err.message : 'Failed to load survey participation status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeanSurveyStatus();
  }, [page, search, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-[#1b2a4a]">Graduate Survey Participation</h1>
        <p className="text-sm text-gray-500">
          Program Scope: {programScope.length > 0 ? programScope.join(', ') : '-'}
        </p>
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

      <div className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, or student ID..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="relative">
            <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'all' | 'answered' | 'not_answered');
                setPage(1);
              }}
              className="border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="answered">Answered</option>
              <option value="not_answered">Not Answered</option>
            </select>
          </div>
        </div>
      </div>

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
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Responses</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Last Submitted</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-400">Loading...</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-red-600">{error}</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-400">No graduates found</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{row.student_id || '-'}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#1b2a4a]">
                        {row.last_name}, {row.first_name} {row.middle_name ? row.middle_name.charAt(0) + '.' : ''}
                      </p>
                      <p className="text-xs text-gray-400">{row.email || '-'}</p>
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
                ))
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
