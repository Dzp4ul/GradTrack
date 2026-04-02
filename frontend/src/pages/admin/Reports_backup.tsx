import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Download, Users, Briefcase, Target, FileText, ClipboardList, Sparkles } from 'lucide-react';
import { API_ROOT } from '../../config/api';

const API_BASE = API_ROOT;

interface Overview {
  total_graduates: number;
  total_employed: number;
  total_employed_local: number;
  total_employed_abroad: number;
  total_aligned: number;
  total_survey_responses: number;
  employment_rate: number;
  alignment_rate: number;
}

interface ProgramReport {
  code: string;
  name: string;
  total_graduates: number;
  employed: number;
  aligned: number;
  partially_aligned: number;
  not_aligned: number;
  avg_time_to_employment: number;
  avg_salary: number;
}

interface YearReport {
  year_graduated: number;
  total_graduates: number;
  employed: number;
  aligned: number;
  avg_salary: number;
}

interface StatusData {
  employment_status: string;
  count: number;
}

interface SalaryData {
  salary_range: string;
  count: number;
}

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

// Program-specific colors
const PROGRAM_COLORS: Record<string, string> = {
  'BSCS': 'rgb(255, 196, 0)',  // yellow
  'BSHM': '#ef4444',  // red
  'BSED': '#3b82f6',  // blue
  'BEED': '#7dd3fc',  // light blue
  'ACT': '#6b7280',   // gray
};

export default function Reports() {
  const [tab, setTab] = useState<'overview' | 'program' | 'year' | 'employment' | 'salary' | 'surveys'>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [programData, setProgramData] = useState<ProgramReport[]>([]);
  const [yearData, setYearData] = useState<YearReport[]>([]);
  const [statusData, setStatusData] = useState<StatusData[]>([]);
  const [salaryData, setSalaryData] = useState<SalaryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const navigate = useNavigate();

  const fetchReport = (type: string, year: string = 'all') => {
    setLoading(true);
    const url = year !== 'all' ? `${API_BASE}/reports/index.php?type=${type}&year=${year}` : `${API_BASE}/reports/index.php?type=${type}`;
    fetch(url)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          switch (type) {
            case 'overview': setOverview(res.data); break;
            case 'by_program': setProgramData(res.data); break;
            case 'by_year': 
              setYearData(res.data);
              // Extract available years from the data
              const years = res.data.map((y: YearReport) => y.year_graduated.toString());
              setAvailableYears(years);
              break;
            case 'employment_status': setStatusData(res.data); break;
            case 'salary_distribution': setSalaryData(res.data); break;
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // Fetch year data first to populate the filter
    fetch(`${API_BASE}/reports/index.php?type=by_year`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          const years = res.data.map((y: YearReport) => y.year_graduated.toString());
          setAvailableYears(years);
        }
      })
      .catch(() => {});
    
    // Fetch program data for overview
    fetch(`${API_BASE}/reports/index.php?type=by_program`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setProgramData(res.data);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const typeMap: Record<string, string> = {
      overview: 'overview', program: 'by_program', year: 'by_year',
      employment: 'employment_status', salary: 'salary_distribution',
    };
    fetchReport(typeMap[tab], selectedYear);
    
    // Fetch AI analytics when on overview tab
    if (tab === 'overview') {
      fetchAIAnalytics();
    }
  }, [tab, selectedYear]);

  const fetchAIAnalytics = () => {
    setAiLoading(true);
    fetch(`${API_BASE}/reports/ai-analytics.php`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data.ai_analysis) {
          setAiAnalysis(res.data.ai_analysis);
        }
      })
      .catch(() => {
        setAiAnalysis('AI analysis temporarily unavailable.');
      })
      .finally(() => setAiLoading(false));
  };

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'program', label: 'By Program' },
    { key: 'year', label: 'By Year' },
    { key: 'employment', label: 'Employment Status' },
    { key: 'salary', label: 'Salary Distribution' },
    { key: 'surveys', label: 'Survey Analytics' },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1b2a4a]">Reports & Analytics</h1>
          <p className="text-sm text-gray-500">Graduate employment data insights</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Year Filter */}
          {(tab === 'program' || tab === 'employment' || tab === 'salary') && availableYears.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Filter by Year:</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Years</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          )}
          <button className="flex items-center gap-2 border px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="flex border-b overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.key
                  ? 'border-b-2 border-[#1b2a4a] text-[#1b2a4a]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1b2a4a]" />
            </div>
          ) : (
            <>
              {/* Overview */}
              {tab === 'overview' && overview && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    <StatCard icon={Users} label="Total Graduates" value={overview.total_graduates.toString()} color="bg-blue-100 text-blue-700" />
                    <StatCard icon={Briefcase} label="Employed (Total)" value={overview.total_employed.toString()} sub={`${overview.employment_rate}%`} color="bg-green-100 text-green-700" />
                    <StatCard icon={Briefcase} label="Employed (Local)" value={overview.total_employed_local.toString()} color="bg-teal-100 text-teal-700" />
                    <StatCard icon={Briefcase} label="Employed (Abroad)" value={overview.total_employed_abroad.toString()} color="bg-indigo-100 text-indigo-700" />
                    <StatCard icon={Target} label="Aligned" value={overview.total_aligned.toString()} sub={`${overview.alignment_rate}%`} color="bg-orange-100 text-orange-700" />
                  </div>

                  {/* Pie Charts Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Employment Status Pie Chart */}
                    <div className="border rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-[#1b2a4a] mb-4">Employment Status</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie 
                              data={[
                                { name: 'Employed', value: overview.total_employed },
                                { name: 'Unemployed', value: overview.total_graduates - overview.total_employed }
                              ]} 
                              cx="50%" 
                              cy="50%" 
                              outerRadius={80} 
                              dataKey="value"
                              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                            >
                              <Cell fill="#22c55e" />
                              <Cell fill="#ef4444" />
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-green-500" />
                          <span className="text-xs text-gray-600">Employed: {overview.total_employed}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-red-500" />
                          <span className="text-xs text-gray-600">Unemployed: {overview.total_graduates - overview.total_employed}</span>
                        </div>
                      </div>
                    </div>

                    {/* Work Location Pie Chart */}
                    <div className="border rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-[#1b2a4a] mb-4">Work Location</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie 
                              data={[
                                { name: 'Local', value: overview.total_employed_local },
                                { name: 'Abroad', value: overview.total_employed_abroad }
                              ]} 
                              cx="50%" 
                              cy="50%" 
                              outerRadius={80} 
                              dataKey="value"
                              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                            >
                              <Cell fill="#14b8a6" />
                              <Cell fill="#6366f1" />
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-teal-500" />
                          <span className="text-xs text-gray-600">Local: {overview.total_employed_local}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-indigo-500" />
                          <span className="text-xs text-gray-600">Abroad: {overview.total_employed_abroad}</span>
                        </div>
                      </div>
                    </div>

                    {/* Job Alignment Pie Chart */}
                    <div className="border rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-[#1b2a4a] mb-4">Job Alignment</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie 
                              data={[
                                { name: 'Aligned', value: overview.total_aligned },
                                { name: 'Not Aligned', value: overview.total_employed - overview.total_aligned }
                              ]} 
                              cx="50%" 
                              cy="50%" 
                              outerRadius={80} 
                              dataKey="value"
                              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                            >
                              <Cell fill="#f59e0b" />
                              <Cell fill="#94a3b8" />
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-orange-500" />
                          <span className="text-xs text-gray-600">Aligned: {overview.total_aligned}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-slate-400" />
                          <span className="text-xs text-gray-600">Not Aligned: {overview.total_employed - overview.total_aligned}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Program-Based Pie Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Employment by Program */}
                    <div className="border rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-[#1b2a4a] mb-4">Employment by Program</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie 
                              data={programData.map((p) => ({ name: p.code, value: p.employed }))} 
                              cx="50%" 
                              cy="50%" 
                              outerRadius={80} 
                              dataKey="value"
                              label={({ name, value }) => `${name}: ${value}`}
                            >
                              {programData.map((p, i) => (
                                <Cell key={i} fill={PROGRAM_COLORS[p.code] || COLORS[i % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 mt-2">
                        {programData.map((p, i) => (
                          <div key={p.code} className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PROGRAM_COLORS[p.code] || COLORS[i % COLORS.length] }} />
                            <span className="text-xs text-gray-600">{p.code}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Alignment by Program */}
                    <div className="border rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-[#1b2a4a] mb-4">Alignment by Program</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie 
                              data={programData.map((p) => ({ name: p.code, value: p.aligned }))} 
                              cx="50%" 
                              cy="50%" 
                              outerRadius={80} 
                              dataKey="value"
                              label={({ name, value }) => `${name}: ${value}`}
                            >
                              {programData.map((p, i) => (
                                <Cell key={i} fill={PROGRAM_COLORS[p.code] || COLORS[i % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 mt-2">
                        {programData.map((p, i) => (
                          <div key={p.code} className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PROGRAM_COLORS[p.code] || COLORS[i % COLORS.length] }} />
                            <span className="text-xs text-gray-600">{p.code}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Employment Rate by Program */}
                    <div className="border rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-[#1b2a4a] mb-4">Employment Rate by Program</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie 
                              data={programData.map((p) => ({ 
                                name: p.code, 
                                value: p.total_graduates > 0 ? Math.round((p.employed / p.total_graduates) * 100) : 0 
                              }))} 
                              cx="50%" 
                              cy="50%" 
                              outerRadius={80} 
                              dataKey="value"
                              label={({ name, value }) => `${name}: ${value}%`}
                            >
                              {programData.map((p, i) => (
                                <Cell key={i} fill={PROGRAM_COLORS[p.code] || COLORS[i % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => `${value}%`} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 mt-2">
                        {programData.map((p, i) => (
                          <div key={p.code} className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PROGRAM_COLORS[p.code] || COLORS[i % COLORS.length] }} />
                            <span className="text-xs text-gray-600">{p.code}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* AI-Powered Descriptive Analytics */}
                  <div className="border-2 border-purple-200 rounded-xl p-6 bg-gradient-to-br from-purple-50 via-blue-50 to-white shadow-lg">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg shadow-md">
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-3">
                          <h3 className="text-lg font-bold text-[#1b2a4a]">AI-Powered Descriptive Analytics</h3>
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full">Powered by AI</span>
                        </div>
                        {aiLoading ? (
                          <div className="flex items-center gap-3 py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600" />
                            <span className="text-sm text-gray-600">Generating AI insights...</span>
                          </div>
                        ) : (
                          <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
                            {aiAnalysis.split('\n\n').map((paragraph, idx) => (
                              <p key={idx} className="text-justify">{paragraph}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* By Program */}
              {tab === 'program' && (
                <div className="space-y-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={programData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="code" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ borderRadius: 8 }} />
                      <Legend />
                      <Bar dataKey="employed" name="Employed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="aligned" name="Aligned" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="not_aligned" name="Not Aligned" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-gray-600">Program</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Graduates</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Employed</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Aligned</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Avg Time (mo)</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Avg Salary</th>
                        </tr>
                      </thead>
                      <tbody>
                        {programData.map((p) => (
                          <tr key={p.code} className="border-t hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{p.code} — {p.name}</td>
                            <td className="px-4 py-3 text-center">{p.total_graduates}</td>
                            <td className="px-4 py-3 text-center">{p.employed}</td>
                            <td className="px-4 py-3 text-center">{p.aligned}</td>
                            <td className="px-4 py-3 text-center">{p.avg_time_to_employment ?? '—'}</td>
                            <td className="px-4 py-3 text-center">{p.avg_salary ? `₱${Number(p.avg_salary).toLocaleString()}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* By Year */}
              {tab === 'year' && (
                <div className="space-y-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={yearData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="year_graduated" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ borderRadius: 8 }} />
                      <Legend />
                      <Bar dataKey="total_graduates" name="Total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="employed" name="Employed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="aligned" name="Aligned" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-gray-600">Year</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Graduates</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Employed</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Aligned</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Avg Salary</th>
                        </tr>
                      </thead>
                      <tbody>
                        {yearData.map((y) => (
                          <tr key={y.year_graduated} className="border-t hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{y.year_graduated}</td>
                            <td className="px-4 py-3 text-center">{y.total_graduates}</td>
                            <td className="px-4 py-3 text-center">{y.employed}</td>
                            <td className="px-4 py-3 text-center">{y.aligned}</td>
                            <td className="px-4 py-3 text-center">{y.avg_salary ? `₱${Number(y.avg_salary).toLocaleString()}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Employment Status */}
              {tab === 'employment' && (
                <div className="space-y-6">
                  <div className="flex flex-col lg:flex-row items-center gap-8">
                    <div className="w-80 h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={statusData.map((s) => ({ name: s.employment_status, value: parseInt(String(s.count)) }))} cx="50%" cy="50%" outerRadius={120} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                            {statusData.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-3">
                      {statusData.map((s, i) => (
                        <div key={s.employment_status} className="flex items-center justify-between border rounded-lg p-3">
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="text-sm font-medium">{s.employment_status}</span>
                          </div>
                          <span className="text-lg font-bold text-[#1b2a4a]">{s.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Separate Analytics for Local and Overseas */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
                    {/* Local Employment Analytics */}
                    <div className="border-2 border-teal-200 rounded-xl p-6 bg-teal-50">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 bg-teal-500 rounded-lg">
                          <Briefcase className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-teal-900">Local Employment</h3>
                          <p className="text-sm text-teal-700">Graduates working in the Philippines</p>
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-4 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Total Employed Locally</span>
                          <span className="text-2xl font-bold text-teal-900">
                            {statusData.find(s => s.employment_status === 'Employed (Local)')?.count || 0}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t">
                          <span className="text-sm text-gray-600">Percentage of Total Employed</span>
                          <span className="text-xl font-bold text-teal-700">
                            {(() => {
                              const localCount = statusData.find(s => s.employment_status === 'Employed (Local)')?.count || 0;
                              const abroadCount = statusData.find(s => s.employment_status === 'Employed (Abroad)')?.count || 0;
                              const totalEmployed = localCount + abroadCount;
                              return totalEmployed > 0 ? Math.round((localCount / totalEmployed) * 100) : 0;
                            })()}%
                          </span>
                        </div>
                        <div className="pt-3 border-t">
                          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-teal-500 rounded-full transition-all duration-500" 
                              style={{ 
                                width: `${(() => {
                                  const localCount = statusData.find(s => s.employment_status === 'Employed (Local)')?.count || 0;
                                  const abroadCount = statusData.find(s => s.employment_status === 'Employed (Abroad)')?.count || 0;
                                  const totalEmployed = localCount + abroadCount;
                                  return totalEmployed > 0 ? Math.round((localCount / totalEmployed) * 100) : 0;
                                })()}%` 
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Overseas Employment Analytics */}
                    <div className="border-2 border-indigo-200 rounded-xl p-6 bg-indigo-50">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 bg-indigo-500 rounded-lg">
                          <Briefcase className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-indigo-900">Overseas Employment</h3>
                          <p className="text-sm text-indigo-700">Graduates working abroad</p>
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-4 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Total Employed Abroad</span>
                          <span className="text-2xl font-bold text-indigo-900">
                            {statusData.find(s => s.employment_status === 'Employed (Abroad)')?.count || 0}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t">
                          <span className="text-sm text-gray-600">Percentage of Total Employed</span>
                          <span className="text-xl font-bold text-indigo-700">
                            {(() => {
                              const localCount = statusData.find(s => s.employment_status === 'Employed (Local)')?.count || 0;
                              const abroadCount = statusData.find(s => s.employment_status === 'Employed (Abroad)')?.count || 0;
                              const totalEmployed = localCount + abroadCount;
                              return totalEmployed > 0 ? Math.round((abroadCount / totalEmployed) * 100) : 0;
                            })()}%
                          </span>
                        </div>
                        <div className="pt-3 border-t">
                          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-500 rounded-full transition-all duration-500" 
                              style={{ 
                                width: `${(() => {
                                  const localCount = statusData.find(s => s.employment_status === 'Employed (Local)')?.count || 0;
                                  const abroadCount = statusData.find(s => s.employment_status === 'Employed (Abroad)')?.count || 0;
                                  const totalEmployed = localCount + abroadCount;
                                  return totalEmployed > 0 ? Math.round((abroadCount / totalEmployed) * 100) : 0;
                                })()}%` 
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Summary Statistics */}
                  <div className="border rounded-xl p-6 bg-gray-50">
                    <h3 className="text-lg font-bold text-[#1b2a4a] mb-4">Employment Distribution Summary</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white rounded-lg p-4 text-center">
                        <p className="text-sm text-gray-600 mb-2">Total Employed</p>
                        <p className="text-3xl font-bold text-green-600">
                          {(() => {
                            const localCount = statusData.find(s => s.employment_status === 'Employed (Local)')?.count || 0;
                            const abroadCount = statusData.find(s => s.employment_status === 'Employed (Abroad)')?.count || 0;
                            return localCount + abroadCount;
                          })()}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-4 text-center">
                        <p className="text-sm text-gray-600 mb-2">Local vs Abroad Ratio</p>
                        <p className="text-xl font-bold text-[#1b2a4a]">
                          {(() => {
                            const localCount = statusData.find(s => s.employment_status === 'Employed (Local)')?.count || 0;
                            const abroadCount = statusData.find(s => s.employment_status === 'Employed (Abroad)')?.count || 0;
                            return `${localCount} : ${abroadCount}`;
                          })()}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-4 text-center">
                        <p className="text-sm text-gray-600 mb-2">Unemployed</p>
                        <p className="text-3xl font-bold text-red-600">
                          {statusData.find(s => s.employment_status === 'Unemployed')?.count || 0}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Salary Distribution */}
              {tab === 'salary' && (
                <div className="space-y-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={salaryData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="salary_range" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ borderRadius: 8 }} />
                      <Bar dataKey="count" name="Graduates" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {salaryData.map((s) => (
                      <div key={s.salary_range} className="border rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-[#1b2a4a]">{s.count}</p>
                        <p className="text-xs text-gray-500 mt-1">{s.salary_range}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Survey Analytics */}
              {tab === 'surveys' && (
                <div className="space-y-6">
                  <div className="text-center py-12">
                    <ClipboardList className="w-16 h-16 text-blue-600 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-[#1b2a4a] mb-2">Survey Analytics</h3>
                    <p className="text-gray-600 mb-6">View detailed analytics for each survey</p>
                    <button
                      onClick={() => navigate('/admin/surveys')}
                      className="bg-blue-900 hover:bg-blue-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                    >
                      Go to Survey Management
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border rounded-xl p-6">
                      <h4 className="text-lg font-semibold text-[#1b2a4a] mb-4">Survey Features</h4>
                      <ul className="space-y-3 text-sm text-gray-700">
                        <li className="flex items-start gap-2">
                          <div className="w-2 h-2 bg-blue-600 rounded-full mt-1.5" />
                          <span>Real-time response tracking</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-2 h-2 bg-blue-600 rounded-full mt-1.5" />
                          <span>Employment and alignment analytics</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-2 h-2 bg-blue-600 rounded-full mt-1.5" />
                          <span>Question-by-question insights</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-2 h-2 bg-blue-600 rounded-full mt-1.5" />
                          <span>Visual data representations</span>
                        </li>
                      </ul>
                    </div>
                    
                    <div className="border rounded-xl p-6">
                      <h4 className="text-lg font-semibold text-[#1b2a4a] mb-4">Quick Stats</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Total Responses</span>
                          <span className="text-xl font-bold text-blue-900">{overview?.total_survey_responses || 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Response Rate</span>
                          <span className="text-xl font-bold text-green-600">
                            {overview ? Math.round((overview.total_survey_responses / overview.total_graduates) * 100) : 0}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-[#1b2a4a]">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub} rate</p>}
    </div>
  );
}

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-[#1b2a4a]">{value}%</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
