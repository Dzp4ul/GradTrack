import { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Target,
  ClipboardList,
  BarChart3,
  ChevronDown,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  LineChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { API_ENDPOINTS } from '../../config/api';
import { getProgramColor } from '../../config/programColors';
import { useAuth } from '../../contexts/AuthContext';

const SELECTED_SURVEY_STORAGE_KEY = 'gradtrack_selected_survey_id';
const DASHBOARD_CACHE_KEY = 'gradtrack_dashboard_cache_v4';
const DASHBOARD_CACHE_TTL_MS = 2 * 60 * 1000;
const PIE_COLORS = ['#0d9488', '#e11d48'];

type NullableRate = number | null;

interface DistributionItem {
  name: 'Aligned' | 'Not Aligned' | string;
  value: number;
  percentage: NullableRate;
}

interface MetricProgram {
  program_id: number | null;
  code: string;
  name: string;
  rate: NullableRate;
  count: number;
  total: number;
  distribution?: DistributionItem[];
}

interface MetricYear {
  year: number;
  rate: NullableRate;
  count: number;
  total: number;
}

interface EmploymentMetric {
  rate: NullableRate;
  employed: number;
  total: number;
  by_program: MetricProgram[];
  by_year?: MetricYear[];
}

interface AlignmentMetric {
  rate: NullableRate;
  aligned: number;
  not_aligned: number;
  total: number;
  distribution: DistributionItem[];
  by_program: MetricProgram[];
  by_year?: MetricYear[];
}

interface ProgramStat {
  program_id?: number | null;
  code: string;
  name: string;
  total_graduates?: number;
  employed_count?: number;
  aligned_count?: number;
  employment_total?: number;
  alignment_total?: number;
  employability_index: NullableRate;
  alignment_index?: NullableRate;
  alignment_distribution?: DistributionItem[];
}

interface EmploymentTrend {
  year: number;
  employment_rate: NullableRate;
  alignment_rate: NullableRate;
  employed?: number;
  employment_total?: number;
  aligned?: number;
  alignment_total?: number;
}

interface DashboardData {
  total_graduates: number;
  total_employed?: number;
  total_unemployed?: number;
  total_employment_known?: number;
  total_aligned?: number;
  total_not_aligned?: number;
  total_alignment_known?: number;
  employment_rate: NullableRate;
  alignment_rate: NullableRate;
  avg_time_to_employment: number | null;
  employment?: EmploymentMetric;
  alignment?: AlignmentMetric;
  selected_survey_id?: number | null;
  selected_survey_title?: string;
  at_risk_programs: string[];
  program_stats: ProgramStat[];
  employment_trends: EmploymentTrend[];
  alignment_distribution: DistributionItem[];
  total_responses: number;
  active_surveys: number;
  total_eligible_graduates?: number;
  pending_responses?: number;
  survey_completion_rate?: NullableRate;
  scope?: {
    restricted: boolean;
    display_name: string;
    department_code?: string;
    department_name?: string;
    program_codes: string[] | null;
  };
}

interface DashboardCacheEntry {
  data: DashboardData;
  storedAt: number;
}

const numberFormatter = new Intl.NumberFormat('en-US');

function formatNumber(value: number | null | undefined) {
  return numberFormatter.format(Number(value ?? 0));
}

function validRate(value: unknown): NullableRate {
  if (value === null || value === undefined || value === '') return null;
  const rate = Number(value);
  return Number.isFinite(rate) ? rate : null;
}

function formatRate(value: unknown, includeSymbol = true) {
  const rate = validRate(value);
  if (rate === null) return 'No data';
  return `${rate.toFixed(1)}${includeSymbol ? '%' : ''}`;
}

function MetricBreakdown({
  programs,
  years,
  noun,
  byBatch,
}: {
  programs: MetricProgram[];
  years: MetricYear[];
  noun: string;
  byBatch: boolean;
}) {
  const rows = byBatch
    ? years.map((year) => ({
        key: `batch-${year.year}`,
        label: String(year.year),
        title: `Batch ${year.year}`,
        rate: year.rate,
        count: year.count,
        total: year.total,
      }))
    : programs.map((program) => ({
        key: String(program.program_id ?? program.code),
        label: program.code,
        title: program.name,
        rate: program.rate,
        count: program.count,
        total: program.total,
      }));

  return (
    <details className="group mt-4 border-t border-gray-100 pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:text-blue-300">
        <span>View by {byBatch ? 'Batch' : 'Program'}</span>
        <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
      </summary>
      <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
        {rows.map((row) => (
          <div
            key={row.key}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 text-xs"
            title={row.title}
          >
            <span className="truncate font-semibold text-gray-700">{byBatch ? `Batch ${row.label}` : row.label}</span>
            <span className="tabular-nums font-semibold text-gray-700">{formatRate(row.rate)}</span>
            <span className="min-w-14 text-right tabular-nums text-gray-400">
              {row.total > 0 ? `${formatNumber(row.count)}/${formatNumber(row.total)}` : `No ${noun}`}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [alignmentProgram, setAlignmentProgram] = useState('overall');
  const selectedSurveyId = localStorage.getItem(SELECTED_SURVEY_STORAGE_KEY) || 'active';
  const dashboardCacheKey = `${DASHBOARD_CACHE_KEY}:${user?.id ?? 'unknown'}:${user?.role ?? 'unknown'}:${selectedSurveyId}`;

  useEffect(() => {
    const controller = new AbortController();
    const cachedRaw = sessionStorage.getItem(dashboardCacheKey);
    let hasFreshCache = false;

    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as DashboardCacheEntry;
        if (cached?.data && typeof cached.storedAt === 'number' && Date.now() - cached.storedAt <= DASHBOARD_CACHE_TTL_MS) {
          setData(cached.data);
          setLoading(false);
          hasFreshCache = true;
        }
      } catch {
        sessionStorage.removeItem(dashboardCacheKey);
      }
    }

    const params = new URLSearchParams();
    if (selectedSurveyId !== 'active') params.set('survey_id', selectedSurveyId);
    const dashboardUrl = params.size > 0
      ? `${API_ENDPOINTS.DASHBOARD}?${params.toString()}`
      : API_ENDPOINTS.DASHBOARD;

    fetch(dashboardUrl, { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error || 'Unable to load dashboard analytics.');
        }
        return result.data as DashboardData;
      })
      .then((dashboardData) => {
        setData(dashboardData);
        setError('');
        sessionStorage.setItem(dashboardCacheKey, JSON.stringify({
          data: dashboardData,
          storedAt: Date.now(),
        } satisfies DashboardCacheEntry));
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(requestError instanceof Error ? requestError.message : 'Unable to load dashboard analytics.');
      })
      .finally(() => {
        if (!hasFreshCache) setLoading(false);
      });

    return () => controller.abort();
  }, [dashboardCacheKey, selectedSurveyId]);

  const employment = useMemo<EmploymentMetric>(() => {
    if (data?.employment) return data.employment;
    return {
      rate: data?.employment_rate ?? null,
      employed: Number(data?.total_employed ?? 0),
      total: Number(data?.total_employment_known ?? 0),
      by_program: (data?.program_stats ?? []).map((program) => ({
        program_id: program.program_id ?? null,
        code: program.code,
        name: program.name,
        rate: program.employability_index,
        count: Number(program.employed_count ?? 0),
        total: Number(program.employment_total ?? program.total_graduates ?? 0),
      })),
    };
  }, [data]);

  const alignment = useMemo<AlignmentMetric>(() => {
    if (data?.alignment) return data.alignment;
    return {
      rate: data?.alignment_rate ?? null,
      aligned: Number(data?.total_aligned ?? 0),
      not_aligned: Number(data?.total_not_aligned ?? 0),
      total: Number(data?.total_alignment_known ?? 0),
      distribution: data?.alignment_distribution ?? [],
      by_program: (data?.program_stats ?? []).map((program) => ({
        program_id: program.program_id ?? null,
        code: program.code,
        name: program.name,
        rate: program.alignment_index ?? null,
        count: Number(program.aligned_count ?? 0),
        total: Number(program.alignment_total ?? 0),
        distribution: program.alignment_distribution ?? [],
      })),
    };
  }, [data]);

  const selectedAlignment = useMemo(() => {
    if (alignmentProgram === 'overall') {
      return {
        label: 'Overall',
        total: alignment.total,
        distribution: alignment.distribution,
      };
    }
    const program = alignment.by_program.find((item) => item.code === alignmentProgram);
    return {
      label: program?.code ?? alignmentProgram,
      total: program?.total ?? 0,
      distribution: program?.distribution ?? [],
    };
  }, [alignment, alignmentProgram]);

  const surveySummary = useMemo(() => {
    const eligible = Number(data?.total_eligible_graduates ?? 0);
    const responses = Number(data?.total_responses ?? 0);
    return {
      eligible,
      pending: Number(data?.pending_responses ?? Math.max(eligible - responses, 0)),
      rate: validRate(data?.survey_completion_rate),
    };
  }, [data]);
  const useBatchBreakdown = data?.scope?.restricted === true;

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#1b2a4a]" />
      </div>
    );
  }

  if (!data) {
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error || 'Failed to load dashboard data.'}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1b2a4a] sm:text-2xl">
          {data.scope?.restricted ? 'Dean Dashboard' : 'GradTrack Dashboard'}
        </h1>
        <p className="text-sm text-gray-500">{data.scope?.display_name || 'Norzagaray College'}</p>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Showing the latest saved dashboard while fresh analytics could not be loaded: {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="rounded-lg bg-blue-100 p-2">
              <Briefcase className="h-5 w-5 text-blue-700" />
            </div>
            <span className="text-sm font-medium text-gray-600">Employment Rate</span>
          </div>
          <p className="text-3xl font-bold text-[#1b2a4a] sm:text-4xl">{formatRate(employment.rate)}</p>
          <p className="mt-1 text-xs text-gray-500">
            {employment.total > 0
              ? `${formatNumber(employment.employed)} employed / ${formatNumber(employment.total)} valid respondents`
              : 'No valid employment-status responses'}
          </p>
          <MetricBreakdown
            programs={employment.by_program}
            years={employment.by_year ?? []}
            noun="responses"
            byBatch={useBatchBreakdown}
          />
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="rounded-lg bg-orange-100 p-2">
              <Target className="h-5 w-5 text-orange-600" />
            </div>
            <span className="text-sm font-medium text-gray-600">Alignment Rate</span>
          </div>
          <p className="text-3xl font-bold text-[#1b2a4a] sm:text-4xl">{formatRate(alignment.rate)}</p>
          <p className="mt-1 text-xs text-gray-500">
            {alignment.total > 0
              ? `${formatNumber(alignment.aligned)} aligned / ${formatNumber(alignment.total)} valid applicable respondents`
              : 'No valid applicable alignment responses'}
          </p>
          <MetricBreakdown
            programs={alignment.by_program}
            years={alignment.by_year ?? []}
            noun="answers"
            byBatch={useBatchBreakdown}
          />
        </div>

        <div className="rounded-lg border border-amber-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="rounded-lg bg-amber-100 p-2">
              <ClipboardList className="h-5 w-5 text-amber-700" />
            </div>
            <span className="text-sm font-medium text-gray-600">Active Surveys</span>
          </div>
          <p className="text-3xl font-bold text-[#1b2a4a] sm:text-4xl">{formatNumber(data.active_surveys)}</p>
          <p className="mt-1 truncate text-xs text-gray-400">{data.selected_survey_title || 'No survey selected'}</p>
          <p className="mt-2 text-xs font-medium text-amber-700">Survey forms and response windows</p>
        </div>

        <div className="rounded-lg border border-emerald-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="rounded-lg bg-emerald-100 p-2">
              <ClipboardList className="h-5 w-5 text-emerald-700" />
            </div>
            <span className="text-sm font-medium text-gray-600">Survey Coverage</span>
          </div>
          <p className="text-3xl font-bold text-[#1b2a4a] sm:text-4xl">{formatRate(surveySummary.rate)}</p>
          <p className="mt-1 text-xs text-gray-400">
            {formatNumber(data.total_responses)} of {formatNumber(surveySummary.eligible)} active graduates
          </p>
          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-700">
            <BarChart3 className="h-3 w-3" /> {formatNumber(surveySummary.pending)} pending responses
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-[#1b2a4a]">Employability Index by Program</h3>
          {data.program_stats.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.program_stats} barSize={50} margin={{ top: 28 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="code" tick={{ fontSize: 13, fontWeight: 600 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={(value) => `${value}%`} />
                <Tooltip
                  formatter={(value) => [formatRate(value), 'Employability Index']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="employability_index" radius={[6, 6, 0, 0]}>
                  <LabelList
                    dataKey="employability_index"
                    position="top"
                    offset={8}
                    formatter={(value: unknown) => validRate(value) === null ? '' : formatRate(value)}
                    style={{ fill: '#1b2a4a', fontSize: 12, fontWeight: 600 }}
                  />
                  {data.program_stats.map((program) => (
                    <Cell key={program.code} fill={getProgramColor(program.code)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-gray-500">No program data</div>
          )}
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-[#1b2a4a]">Employment Trends</h3>
          {data.employment_trends.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.employment_trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={(value) => `${value}%`} />
                <Tooltip formatter={(value) => formatRate(value)} contentStyle={{ borderRadius: 8 }} />
                <Legend />
                <Line type="linear" connectNulls={false} dataKey="employment_rate" name="Employment Rate" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 5 }} activeDot={{ r: 7 }} />
                <Line type="linear" connectNulls={false} dataKey="alignment_rate" name="Alignment Rate" stroke="#f97316" strokeWidth={2.5} dot={{ r: 5 }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-gray-500">No graduation-year analytics</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-[#1b2a4a]">Job Alignment Distribution</h3>
            <select
              value={alignmentProgram}
              onChange={(event) => setAlignmentProgram(event.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              aria-label="Filter job alignment by program"
            >
              <option value="overall">Overall</option>
              {alignment.by_program.map((program) => (
                <option key={program.program_id ?? program.code} value={program.code}>{program.code}</option>
              ))}
            </select>
          </div>
          {selectedAlignment.total > 0 ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="h-40 w-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={selectedAlignment.distribution} cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={3} dataKey="value">
                      {selectedAlignment.distribution.map((item, index) => (
                        <Cell key={item.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [formatNumber(Number(value)), 'Respondents']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 text-sm">
                {selectedAlignment.distribution.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                    <span className="text-gray-700">
                      {formatRate(item.percentage)} {item.name} ({formatNumber(item.value)})
                    </span>
                  </div>
                ))}
                <p className="pt-1 text-xs text-gray-400">
                  {formatNumber(selectedAlignment.total)} valid applicable {selectedAlignment.label} responses
                </p>
              </div>
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-gray-500">
              No valid applicable alignment responses for {selectedAlignment.label}
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <h3 className="mb-2 text-lg font-semibold text-[#1b2a4a]">Selected Survey Snapshot</h3>
          <p className="mb-4 truncate text-xs text-gray-500">{data.selected_survey_title || 'No survey selected'}</p>
          <div className="space-y-3 text-sm">
            <div>
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="font-medium text-gray-700">Survey coverage</span>
                <span className="font-bold text-[#1b2a4a]">{formatRate(surveySummary.rate)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-emerald-600"
                  style={{ width: `${Math.min(surveySummary.rate ?? 0, 100)}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-2">
              <div><p className="text-xs text-gray-500">Valid responses</p><p className="text-lg font-bold text-[#1b2a4a]">{formatNumber(data.total_responses)}</p></div>
              <div><p className="text-xs text-gray-500">Pending</p><p className="text-lg font-bold text-emerald-700">{formatNumber(surveySummary.pending)}</p></div>
              <div><p className="text-xs text-gray-500">Employed</p><p className="text-lg font-bold text-blue-700">{formatNumber(employment.employed)}</p></div>
              <div><p className="text-xs text-gray-500">Unemployed</p><p className="text-lg font-bold text-orange-700">{formatNumber(data.total_unemployed)}</p></div>
              <div><p className="text-xs text-gray-500">Aligned jobs</p><p className="text-lg font-bold text-green-700">{formatNumber(alignment.aligned)}</p></div>
              <div><p className="text-xs text-gray-500">Not aligned</p><p className="text-lg font-bold text-amber-700">{formatNumber(alignment.not_aligned)}</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
