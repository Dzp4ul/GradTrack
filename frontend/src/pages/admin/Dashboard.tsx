import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Target,
  ClipboardList,
  BarChart3,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import { API_ROOT } from '../../config/api';

const API_BASE = API_ROOT;
const SELECTED_SURVEY_STORAGE_KEY = 'gradtrack_selected_survey_id';
const DASHBOARD_CACHE_KEY = 'gradtrack_dashboard_cache';
const DASHBOARD_CACHE_TTL_MS = 2 * 60 * 1000;

interface DashboardData {
  total_graduates: number;
  employment_rate: number;
  alignment_rate: number;
  avg_time_to_employment: number;
  selected_survey_id?: number | null;
  selected_survey_title?: string;
  at_risk_programs: string[];
  program_stats: {
    code: string;
    name: string;
    total_graduates?: number;
    employed_count?: number;
    aligned_count?: number;
    employability_index: number;
    alignment_index?: number;
  }[];
  employment_trends: { year: number; employment_rate: number; alignment_rate: number }[];
  alignment_distribution: { name: string; value: number; percentage: number }[];
  total_responses: number;
  active_surveys: number;
  total_eligible_graduates?: number;
  pending_responses?: number;
  survey_completion_rate?: number;
}

interface DashboardCacheEntry {
  data: DashboardData;
  storedAt: number;
}

const PIE_COLORS = ['#22c55e', '#f59e0b', '#ef4444'];
const BAR_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

const numberFormatter = new Intl.NumberFormat('en-US');

function formatNumber(value: number | null | undefined) {
  return numberFormatter.format(Number(value ?? 0));
}

function formatPercent(value: number | null | undefined) {
  const normalized = Number(value ?? 0);
  return Number.isInteger(normalized) ? `${normalized}` : normalized.toFixed(1);
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const cachedRaw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
    let hasFreshCache = false;

    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as DashboardCacheEntry;
        if (
          cached
          && typeof cached.storedAt === 'number'
          && cached.data
          && (Date.now() - cached.storedAt) <= DASHBOARD_CACHE_TTL_MS
        ) {
          setData(cached.data);
          setLoading(false);
          hasFreshCache = true;
        }
      } catch {
        sessionStorage.removeItem(DASHBOARD_CACHE_KEY);
      }
    }

    const selectedSurveyId = localStorage.getItem(SELECTED_SURVEY_STORAGE_KEY);
    const params = new URLSearchParams();
    if (selectedSurveyId) {
      params.set('survey_id', selectedSurveyId);
    }

    const dashboardUrl = params.toString()
      ? `${API_BASE}/dashboard/stats.php?${params.toString()}`
      : `${API_BASE}/dashboard/stats.php`;

    fetch(dashboardUrl)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) {
          setData(res.data);
          sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({
            data: res.data,
            storedAt: Date.now(),
          }));
        }
      })
      .catch(() => {
        // Use fallback data if API is not available
        setData({
          total_graduates: 20,
          employment_rate: 78,
          alignment_rate: 62,
          avg_time_to_employment: 5.4,
          selected_survey_id: null,
          selected_survey_title: 'Graduate Tracer Study Survey',
          at_risk_programs: [],
          program_stats: [
            {
              code: 'BSCS',
              name: 'BS Computer Science',
              total_graduates: 7,
              employed_count: 6,
              aligned_count: 4,
              employability_index: 82,
              alignment_index: 67,
            },
            {
              code: 'BSHM',
              name: 'BS Hospitality Management',
              total_graduates: 5,
              employed_count: 4,
              aligned_count: 2,
              employability_index: 75,
              alignment_index: 50,
            },
            {
              code: 'BSED',
              name: 'BS Secondary Education',
              total_graduates: 4,
              employed_count: 3,
              aligned_count: 2,
              employability_index: 70,
              alignment_index: 67,
            },
            {
              code: 'BEED',
              name: 'BS Elementary Education',
              total_graduates: 4,
              employed_count: 3,
              aligned_count: 2,
              employability_index: 68,
              alignment_index: 67,
            },
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
          total_responses: 6,
          active_surveys: 2,
          total_eligible_graduates: 20,
          pending_responses: 14,
          survey_completion_rate: 30,
        });
      })
      .finally(() => {
        if (!hasFreshCache) {
          setLoading(false);
        }
      });
  }, []);

  const trendData = useMemo(() => {
    if (!data?.employment_trends?.length) return [];
    if (data.employment_trends.length > 1) return data.employment_trends;

    const current = data.employment_trends[0];
    return [
      {
        year: current.year - 1,
        employment_rate: current.employment_rate,
        alignment_rate: current.alignment_rate,
      },
      current,
    ];
  }, [data?.employment_trends]);

  const alignmentDistribution = useMemo(() => {
    if (!data?.alignment_distribution?.length) {
      return [
        { name: 'Aligned', value: 0, percentage: 0 },
        { name: 'Not Aligned', value: 0, percentage: 0 },
      ];
    }

    const aligned = data.alignment_distribution.find((item) =>
      item.name.toLowerCase().includes('aligned') && !item.name.toLowerCase().includes('not') && !item.name.toLowerCase().includes('partial')
    );
    const notAlignedTotal = data.alignment_distribution
      .filter((item) => item.name.toLowerCase().includes('not') || item.name.toLowerCase().includes('partial'))
      .reduce((sum, item) => sum + item.value, 0);

    const alignedValue = aligned?.value ?? 0;
    const total = alignedValue + notAlignedTotal;

    if (total === 0) {
      return [
        { name: 'Aligned', value: 0, percentage: 0 },
        { name: 'Not Aligned', value: 0, percentage: 0 },
      ];
    }

    return [
      {
        name: 'Aligned',
        value: alignedValue,
        percentage: Number(((alignedValue / total) * 100).toFixed(1)),
      },
      {
        name: 'Not Aligned',
        value: notAlignedTotal,
        percentage: Number(((notAlignedTotal / total) * 100).toFixed(1)),
      },
    ];
  }, [data?.alignment_distribution]);

  const surveySummary = useMemo(() => {
    if (!data) {
      return { eligible: 0, pending: 0, rate: 0 };
    }

    const eligible = data.total_eligible_graduates ?? data.total_responses;
    const pending = data.pending_responses ?? Math.max(eligible - data.total_responses, 0);
    const rate = data.survey_completion_rate ?? (eligible > 0
      ? Number(((data.total_responses / eligible) * 100).toFixed(1))
      : 0);

    return { eligible, pending, rate };
  }, [data]);

  const employmentSummary = useMemo(() => {
    if (!data) {
      return { employed: 0, unemployed: 0, aligned: 0, notAligned: 0 };
    }

    const employedCount = Math.round((data.total_responses * data.employment_rate) / 100);
    const unemployedCount = Math.max(data.total_responses - employedCount, 0);
    const alignedCount = alignmentDistribution.find((item) => item.name === 'Aligned')?.value ?? 0;
    const notAlignedCount = alignmentDistribution.find((item) => item.name === 'Not Aligned')?.value ?? 0;

    return {
      employed: employedCount,
      unemployed: unemployedCount,
      aligned: alignedCount,
      notAligned: notAlignedCount,
    };
  }, [alignmentDistribution, data]);

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
        <h1 className="text-xl font-bold text-[#1b2a4a] sm:text-2xl">GradTrack Dashboard</h1>
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
          <p className="text-3xl font-bold text-[#1b2a4a] sm:text-4xl">
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
          <p className="text-3xl font-bold text-[#1b2a4a] sm:text-4xl">
            {data.alignment_rate}<span className="text-2xl">%</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">{data.alignment_rate}% Aligned to Course</p>
        </div>

        {/* Active Surveys */}
        <div
          onClick={() => navigate('/admin/surveys')}
          className="bg-white rounded-lg shadow-sm border border-amber-200 p-5 cursor-pointer hover:shadow-lg hover:border-amber-300 transition-all group"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-amber-100 rounded-lg group-hover:bg-amber-200 transition">
              <ClipboardList className="w-5 h-5 text-amber-700" />
            </div>
            <span className="text-sm font-medium text-gray-600">Active Surveys</span>
          </div>
          <p className="text-3xl font-bold text-[#1b2a4a] sm:text-4xl">
            {formatNumber(data.active_surveys)}
          </p>
          <p className="text-xs text-gray-400 mt-1 truncate">
            {data.selected_survey_title || 'Survey campaigns currently open'}
          </p>
          <p className="text-xs text-amber-700 mt-2 font-medium">
            Manage survey forms and response windows
          </p>
        </div>

        {/* Survey Coverage */}
        <div 
          onClick={() => navigate(data.selected_survey_id ? `/admin/surveys/${data.selected_survey_id}/analytics` : '/admin/surveys')}
          className="bg-white rounded-lg shadow-sm border border-emerald-200 p-5 cursor-pointer hover:shadow-lg hover:border-emerald-300 transition-all group"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-emerald-100 rounded-lg group-hover:bg-emerald-200 transition">
              <ClipboardList className="w-5 h-5 text-emerald-700" />
            </div>
            <span className="text-sm font-medium text-gray-600">Survey Coverage</span>
          </div>
          <p className="text-3xl font-bold text-[#1b2a4a] sm:text-4xl">
            {formatPercent(surveySummary.rate)}<span className="text-2xl">%</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {formatNumber(data.total_responses)} of {formatNumber(surveySummary.eligible)} responses
          </p>
          <p className="text-xs text-emerald-700 mt-2 font-medium flex items-center gap-1">
            <BarChart3 className="w-3 h-3" /> Open analytics - {formatNumber(surveySummary.pending)} pending
          </p>
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
                formatter={(value) => {
                  const numericValue = typeof value === 'number' ? value : Number(value);
                  return [`${numericValue.toFixed(1)}%`, 'Employability Index'];
                }}
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
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis domain={[40, 90]} tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(value) => `${value}%`} contentStyle={{ borderRadius: 8 }} />
              <Legend />
              <Line
                type="linear"
                dataKey="employment_rate"
                name="Employment Rate"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={{ r: 5 }}
                activeDot={{ r: 7 }}
              />
              <Line
                type="linear"
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

      {/* Row 2: Alignment + Survey Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Job Alignment Distribution */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-lg font-semibold text-[#1b2a4a] mb-4">Job Alignment Distribution</h3>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="w-40 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={alignmentDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {alignmentDistribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, name]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 text-sm">
              {alignmentDistribution.map((item, i) => (
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

        {/* Selected Survey Snapshot */}
        <div className="bg-white rounded-lg shadow-sm border p-5">
          <h3 className="text-lg font-semibold text-[#1b2a4a] mb-2">Selected Survey Snapshot</h3>
          <p className="text-xs text-gray-500 truncate mb-4">
            {data.selected_survey_title || 'All graduate tracer responses'}
          </p>
          <div className="space-y-3 text-sm">
            <div>
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className="font-medium text-gray-700">Survey coverage</span>
                <span className="font-bold text-[#1b2a4a]">{formatPercent(surveySummary.rate)}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-600"
                  style={{ width: `${Math.min(surveySummary.rate, 100)}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-2">
              <div>
                <p className="text-xs text-gray-500">Responses</p>
                <p className="text-lg font-bold text-[#1b2a4a]">{formatNumber(data.total_responses)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Pending</p>
                <p className="text-lg font-bold text-emerald-700">{formatNumber(surveySummary.pending)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Employed</p>
                <p className="text-lg font-bold text-blue-700">{formatNumber(employmentSummary.employed)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Unemployed</p>
                <p className="text-lg font-bold text-orange-700">{formatNumber(employmentSummary.unemployed)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Aligned jobs</p>
                <p className="text-lg font-bold text-green-700">{formatNumber(employmentSummary.aligned)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Not aligned</p>
                <p className="text-lg font-bold text-amber-700">{formatNumber(employmentSummary.notAligned)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
