import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Download, Users, Briefcase, Target, FileText } from 'lucide-react';

const API_BASE = '/api';

interface Overview {
  total_graduates: number;
  total_employed: number;
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

export default function Reports() {
  const [tab, setTab] = useState<'overview' | 'program' | 'year' | 'employment' | 'salary'>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [programData, setProgramData] = useState<ProgramReport[]>([]);
  const [yearData, setYearData] = useState<YearReport[]>([]);
  const [statusData, setStatusData] = useState<StatusData[]>([]);
  const [salaryData, setSalaryData] = useState<SalaryData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReport = (type: string) => {
    setLoading(true);
    fetch(`${API_BASE}/reports/index.php?type=${type}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          switch (type) {
            case 'overview': setOverview(res.data); break;
            case 'by_program': setProgramData(res.data); break;
            case 'by_year': setYearData(res.data); break;
            case 'employment_status': setStatusData(res.data); break;
            case 'salary_distribution': setSalaryData(res.data); break;
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const typeMap: Record<string, string> = {
      overview: 'overview', program: 'by_program', year: 'by_year',
      employment: 'employment_status', salary: 'salary_distribution',
    };
    fetchReport(typeMap[tab]);
  }, [tab]);

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'program', label: 'By Program' },
    { key: 'year', label: 'By Year' },
    { key: 'employment', label: 'Employment Status' },
    { key: 'salary', label: 'Salary Distribution' },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1b2a4a]">Reports & Analytics</h1>
          <p className="text-sm text-gray-500">Graduate employment data insights</p>
        </div>
        <button className="flex items-center gap-2 border px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
          <Download className="w-4 h-4" /> Export
        </button>
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
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard icon={Users} label="Total Graduates" value={overview.total_graduates.toString()} color="bg-blue-100 text-blue-700" />
                    <StatCard icon={Briefcase} label="Employed" value={overview.total_employed.toString()} sub={`${overview.employment_rate}%`} color="bg-green-100 text-green-700" />
                    <StatCard icon={Target} label="Aligned" value={overview.total_aligned.toString()} sub={`${overview.alignment_rate}%`} color="bg-orange-100 text-orange-700" />
                    <StatCard icon={FileText} label="Survey Responses" value={overview.total_survey_responses.toString()} color="bg-purple-100 text-purple-700" />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="border rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-[#1b2a4a] mb-3">Key Metrics</h3>
                      <div className="space-y-3">
                        <MetricBar label="Employment Rate" value={overview.employment_rate} color="bg-green-500" />
                        <MetricBar label="Alignment Rate" value={overview.alignment_rate} color="bg-orange-500" />
                      </div>
                    </div>
                    <div className="border rounded-xl p-4">
                      <h3 className="text-sm font-semibold text-[#1b2a4a] mb-3">Summary</h3>
                      <div className="space-y-2 text-sm text-gray-600">
                        <p>Out of <strong>{overview.total_graduates}</strong> graduates tracked, <strong>{overview.total_employed}</strong> are currently employed.</p>
                        <p><strong>{overview.total_aligned}</strong> graduates have jobs aligned with their course.</p>
                        <p>A total of <strong>{overview.total_survey_responses}</strong> survey responses have been collected.</p>
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
                <div className="flex flex-col lg:flex-row items-center gap-8">
                  <div className="w-80 h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusData.map((s) => ({ name: s.employment_status.replace('_', ' '), value: parseInt(String(s.count)) }))} cx="50%" cy="50%" outerRadius={120} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
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
                          <span className="text-sm font-medium capitalize">{s.employment_status.replace('_', ' ')}</span>
                        </div>
                        <span className="text-lg font-bold text-[#1b2a4a]">{s.count}</span>
                      </div>
                    ))}
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
