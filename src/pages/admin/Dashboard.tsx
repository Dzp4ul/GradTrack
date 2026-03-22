import { useState, useEffect } from 'react';
import {
  Briefcase,
  Target,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
  PieChart, Pie, Cell,
} from 'recharts';

const API_BASE = '/api';

interface DashboardData {
  total_graduates: number;
  employment_rate: number;
  alignment_rate: number;
  avg_time_to_employment: number;
  at_risk_programs: string[];
  program_stats: { code: string; name: string; employability_index: number }[];
  employment_trends: { year: number; employment_rate: number; alignment_rate: number }[];
  alignment_distribution: { name: string; value: number; percentage: number }[];
  top_jobs: { job_title: string; company_name: string; graduate_count: number }[];
  recommended_actions: string[];
  total_responses: number;
  active_surveys: number;
}

const PIE_COLORS = ['#22c55e', '#f59e0b', '#ef4444'];
const BAR_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/dashboard/stats.php`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setData(res.data);
      })
      .catch(() => {
        // Use fallback data if API is not available
        setData({
          total_graduates: 20,
          employment_rate: 78,
          alignment_rate: 62,
          avg_time_to_employment: 5.4,
          at_risk_programs: ['BSBA', 'BSED'],
          program_stats: [
            { code: 'BSIT', name: 'BS Information Technology', employability_index: 82 },
            { code: 'BSED', name: 'BS Education', employability_index: 65 },
            { code: 'BSBA', name: 'BS Business Administration', employability_index: 54 },
          ],
          employment_trends: [
            { year: 2019, employment_rate: 80, alignment_rate: 72 },
            { year: 2020, employment_rate: 78, alignment_rate: 68 },
            { year: 2021, employment_rate: 76, alignment_rate: 65 },
            { year: 2022, employment_rate: 75, alignment_rate: 60 },
          ],
          alignment_distribution: [
            { name: 'Aligned', value: 10, percentage: 65 },
            { name: 'Partially Aligned', value: 3, percentage: 20 },
            { name: 'Not Aligned', value: 2, percentage: 15 },
          ],
          top_jobs: [
            { job_title: 'Web Developer', company_name: 'Tech Solutions Inc.', graduate_count: 5 },
            { job_title: 'Marketing Associate', company_name: 'Prime Innovations', graduate_count: 3 },
            { job_title: 'IT Support Specialist', company_name: 'Global Systems Co.', graduate_count: 4 },
          ],
          recommended_actions: [
            'Review BSBA Curriculum',
            'Enhance IT Internship Programs',
            'Industry Partnership Initiative',
            'Offer Data Analytics Course',
          ],
          total_responses: 6,
          active_surveys: 2,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1b2a4a]" />
      </div>
    );
  }

  if (!data) return <p className="text-red-500">Failed to load dashboard data.</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#1b2a4a]">GradTrack Dashboard</h1>
        <p className="text-sm text-gray-500">Norzagaray College</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Employment Rate */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Briefcase className="w-5 h-5 text-blue-700" />
            </div>
            <span className="text-sm font-medium text-gray-600">Employment Rate</span>
          </div>
          <p className="text-4xl font-bold text-[#1b2a4a]">
            {data.employment_rate}<span className="text-2xl">%</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">{data.employment_rate}% Employed</p>
        </div>

        {/* Alignment Rate */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Target className="w-5 h-5 text-orange-600" />
            </div>
            <span className="text-sm font-medium text-gray-600">Alignment Rate</span>
          </div>
          <p className="text-4xl font-bold text-[#1b2a4a]">
            {data.alignment_rate}<span className="text-2xl">%</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">{data.alignment_rate}% Aligned to Course</p>
        </div>

        {/* Avg Time to Employment */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-cyan-100 rounded-lg">
              <Clock className="w-5 h-5 text-cyan-600" />
            </div>
            <span className="text-sm font-medium text-gray-600">Avg. Time to Employment</span>
          </div>
          <p className="text-4xl font-bold text-[#1b2a4a]">
            {data.avg_time_to_employment} <span className="text-lg font-normal text-gray-500">Months</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">Average Time</p>
        </div>

        {/* At-Risk Programs */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <span className="text-sm font-medium text-gray-600">At-Risk Programs</span>
          </div>
          <div className="space-y-1.5">
            {data.at_risk_programs.length > 0 ? (
              data.at_risk_programs.map((p) => (
                <div key={p} className="bg-gray-100 rounded px-3 py-1.5 text-sm font-semibold text-[#1b2a4a]">
                  {p}
                </div>
              ))
            ) : (
              <p className="text-sm text-green-600 font-medium">No at-risk programs</p>
            )}
          </div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Employability Index by Program */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-lg font-semibold text-[#1b2a4a] mb-4">Employability Index by Program</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.program_stats} barSize={50}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="code" tick={{ fontSize: 13, fontWeight: 600 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value) => [`${value}%`, 'Employability Index']}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="employability_index" radius={[6, 6, 0, 0]}>
                {data.program_stats.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Employment Trends */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-lg font-semibold text-[#1b2a4a] mb-4">Employment Trends</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.employment_trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis domain={[40, 90]} tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(value) => `${value}%`} contentStyle={{ borderRadius: 8 }} />
              <Legend />
              <Line
                type="monotone"
                dataKey="employment_rate"
                name="Employment Rate"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={{ r: 5 }}
                activeDot={{ r: 7 }}
              />
              <Line
                type="monotone"
                dataKey="alignment_rate"
                name="Alignment Rate"
                stroke="#f97316"
                strokeWidth={2.5}
                dot={{ r: 5 }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: Pie + Actions + Top Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Job Alignment Distribution */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-lg font-semibold text-[#1b2a4a] mb-4">Job Alignment Distribution</h3>
          <div className="flex items-center gap-4">
            <div className="w-40 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.alignment_distribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {data.alignment_distribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, name]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 text-sm">
              {data.alignment_distribution.map((item, i) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                  <span className="text-gray-700">
                    {item.percentage}% {item.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recommended Actions */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-lg font-semibold text-[#1b2a4a] mb-4">Recommended Actions</h3>
          <div className="space-y-3">
            {data.recommended_actions.map((action, i) => (
              <div key={i} className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-gray-700">{action}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Job Listings */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-lg font-semibold text-[#1b2a4a] mb-4">Top Job Listings</h3>
          <div className="space-y-3">
            {data.top_jobs.map((job, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#1b2a4a] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-bold">{i + 1}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1b2a4a]">{job.job_title}</p>
                  <p className="text-xs text-gray-500">{job.company_name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
