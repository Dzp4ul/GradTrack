import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Search,
  Target,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { API_ROOT } from '../../config/api';

const COLORS = ['#1d4ed8', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777'];
const PAGE_SIZE = 10;

type Tab = 'summary' | 'questions' | 'individual';

interface DistributionRow {
  option: string;
  count: number;
  percentage: number;
}

interface NumericSummary {
  n: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
}

interface TextSummary {
  total_responses: number;
  sample_responses: string[];
  avg_length: number;
}

interface QuestionAnalytics {
  question_id: number;
  question_text: string;
  question_type: string;
  section?: string;
  total_answers: number;
  skipped_answers: number;
  applicable_responses: number;
  chart_type: 'donut' | 'horizontal_bar' | 'likert' | 'numeric_summary' | 'text_list';
  data: DistributionRow[] | NumericSummary | TextSummary;
}

interface IndividualAnswer {
  question_id: number;
  question: string;
  answer: string | string[];
}

interface IndividualResponse {
  response_id: number;
  respondent: string;
  student_id?: string | null;
  email?: string | null;
  program_code?: string | null;
  year_graduated?: number | null;
  submitted_at?: string | null;
  answers: IndividualAnswer[];
}

interface EmploymentInsights {
  employment_rate: number | null;
  employed_count: number;
  unemployed_count: number;
  employment_total: number;
  alignment_rate: number | null;
  aligned_count: number;
  alignment_total: number;
  not_aligned_count: number;
}

interface Analytics {
  survey_id: number;
  survey_title: string;
  total_responses: number;
  completed_responses: number;
  response_rate: number | null;
  target_population: number | null;
  completion_rate: number | null;
  latest_response_date: string | null;
  questions_analytics: QuestionAnalytics[];
  individual_responses: IndividualResponse[];
  employment_insights?: EmploymentInsights;
  filter_options: {
    programs: Array<{ id: number; code: string; name: string }>;
    graduation_years: number[];
    employment_statuses: string[];
  };
}

interface Filters {
  program: string;
  graduationYear: string;
  employmentStatus: string;
  dateFrom: string;
  dateTo: string;
}

const initialFilters: Filters = {
  program: '',
  graduationYear: '',
  employmentStatus: '',
  dateFrom: '',
  dateTo: '',
};

const formatRate = (value: number | null): string => (
  value === null || !Number.isFinite(Number(value)) ? 'Not available' : `${Number(value).toFixed(1)}%`
);

const formatDate = (value?: string | null): string => {
  if (!value) return 'No responses yet';
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export default function SurveyAnalytics() {
  const { surveyId } = useParams<{ surveyId: string }>();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [tab, setTab] = useState<Tab>('summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!surveyId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ survey_id: surveyId });
      if (filters.program) params.set('program', filters.program);
      if (filters.graduationYear) params.set('graduation_year', filters.graduationYear);
      if (filters.employmentStatus) params.set('employment_status', filters.employmentStatus);
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);

      fetch(`${API_ROOT}/surveys/analytics.php?${params.toString()}`, {
        credentials: 'include',
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load survey responses.');
          setAnalytics(payload.data);
        })
        .catch((reason) => {
          if (reason?.name !== 'AbortError') setError(reason?.message || 'Unable to load survey responses.');
        })
        .finally(() => setLoading(false));
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filters, surveyId]);

  const setFilter = (name: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [name]: value }));
  };

  if (!analytics && loading) {
    return <div className="flex h-96 items-center justify-center"><div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-900" /></div>;
  }

  if (!analytics) {
    return <div className="py-12 text-center text-red-600">{error || 'Failed to load survey response summary.'}</div>;
  }

  return (
    <div className="survey-analytics-content space-y-5">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={() => navigate('/admin/surveys')} className="rounded-lg p-2 transition hover:bg-gray-100" aria-label="Back to surveys">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-blue-900 sm:text-2xl">{analytics.survey_title}</h1>
          <p className="text-sm text-gray-500">Response Summary</p>
        </div>
      </div>

      <div className="survey-report-paper rounded-xl border p-3 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FilterSelect label="Course / Program" value={filters.program} onChange={(value) => setFilter('program', value)}>
            <option value="">All programs</option>
            {analytics.filter_options.programs.map((program) => <option key={program.id} value={program.code}>{program.code} - {program.name}</option>)}
          </FilterSelect>
          <FilterSelect label="Batch / Year" value={filters.graduationYear} onChange={(value) => setFilter('graduationYear', value)}>
            <option value="">All batches</option>
            {analytics.filter_options.graduation_years.map((year) => <option key={year} value={year}>{year}</option>)}
          </FilterSelect>
          <FilterSelect label="Employment status" value={filters.employmentStatus} onChange={(value) => setFilter('employmentStatus', value)}>
            <option value="">All statuses</option>
            {analytics.filter_options.employment_statuses.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
          </FilterSelect>
          <FilterDate label="From" value={filters.dateFrom} onChange={(value) => setFilter('dateFrom', value)} />
          <FilterDate label="To" value={filters.dateTo} onChange={(value) => setFilter('dateTo', value)} />
        </div>
        {(filters.program || filters.graduationYear || filters.employmentStatus || filters.dateFrom || filters.dateTo) && (
          <button onClick={() => setFilters(initialFilters)} className="mt-3 text-sm font-medium text-blue-700 hover:text-blue-900">Clear filters</button>
        )}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total Responses" value={String(analytics.total_responses)} color="bg-blue-100 text-blue-700" />
        <StatCard icon={CheckCircle2} label="Completed Responses" value={String(analytics.completed_responses)} color="bg-green-100 text-green-700" />
        <StatCard
          icon={Target}
          label="Response Rate"
          value={formatRate(analytics.response_rate)}
          hint={analytics.target_population ? `Target population: ${analytics.target_population}` : 'No valid target population for this view'}
          color="bg-purple-100 text-purple-700"
        />
        <StatCard icon={CalendarClock} label="Latest Response" value={formatDate(analytics.latest_response_date)} color="bg-orange-100 text-orange-700" compact />
      </div>

      <div className="survey-report-paper flex overflow-x-auto rounded-xl border p-1 shadow-sm" role="tablist">
        {(['summary', 'questions', 'individual'] as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            className={`min-w-28 flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold capitalize transition ${tab === item ? 'bg-blue-700 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {item}
          </button>
        ))}
      </div>

      {loading && <div className="h-1 overflow-hidden rounded bg-blue-100"><div className="h-full w-1/2 animate-pulse rounded bg-blue-600" /></div>}
      {tab === 'summary' && <SummaryView analytics={analytics} />}
      {tab === 'questions' && <QuestionsView questions={analytics.questions_analytics} />}
      {tab === 'individual' && <IndividualView responses={analytics.individual_responses} />}
    </div>
  );
}

function SummaryView({ analytics }: { analytics: Analytics }) {
  return (
    <div className="space-y-5">
      {analytics.employment_insights && (
        <div className="grid gap-4 lg:grid-cols-2">
          <InsightCard
            title="Employment Status"
            rateLabel="Employment rate"
            rate={analytics.employment_insights.employment_rate}
            rows={[
              ['Employed', analytics.employment_insights.employed_count],
              ['Unemployed', analytics.employment_insights.unemployed_count],
            ]}
            denominator={analytics.employment_insights.employment_total}
          />
          <InsightCard
            title="Job-Course Alignment"
            rateLabel="Aligned"
            rate={analytics.employment_insights.alignment_rate}
            rows={[
              ['Aligned', analytics.employment_insights.aligned_count],
              ['Not aligned', analytics.employment_insights.not_aligned_count],
            ]}
            denominator={analytics.employment_insights.alignment_total}
          />
        </div>
      )}
      <QuestionsView questions={analytics.questions_analytics} />
    </div>
  );
}

function QuestionsView({ questions }: { questions: QuestionAnalytics[] }) {
  if (questions.length === 0) {
    return <EmptyState message="This survey has no response-bearing questions." />;
  }
  return (
    <div className="space-y-5">
      {questions.map((question, index) => <QuestionCard key={question.question_id} question={question} index={index} />)}
    </div>
  );
}

function QuestionCard({ question, index }: { question: QuestionAnalytics; index: number }) {
  const rows = Array.isArray(question.data) ? question.data : [];
  return (
    <section className="survey-report-paper rounded-xl border p-4 shadow-sm sm:p-6">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{question.section || `Question ${index + 1}`}</p>
        <h2 className="mt-1 text-base font-semibold text-blue-950 sm:text-lg">Q{index + 1}: {question.question_text}</h2>
        <p className="mt-1 text-sm text-gray-500">
          Responses: {question.total_answers}
          {question.skipped_answers > 0 ? ` · Skipped: ${question.skipped_answers}` : ''}
        </p>
      </div>

      {question.total_answers === 0 ? (
        <EmptyState message="No responses for this question." />
      ) : question.chart_type === 'donut' ? (
        <DonutChart rows={rows} />
      ) : question.chart_type === 'horizontal_bar' ? (
        <HorizontalChart rows={rows} multiple={question.question_type === 'checkbox'} />
      ) : question.chart_type === 'likert' ? (
        <LikertChart rows={rows} />
      ) : question.chart_type === 'numeric_summary' ? (
        <NumericView data={question.data as NumericSummary} />
      ) : (
        <TextResponses data={question.data as TextSummary} />
      )}
    </section>
  );
}

function DonutChart({ rows }: { rows: DistributionRow[] }) {
  return (
    <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
      <DistributionList rows={rows} />
      <div className="h-72 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="count" nameKey="option" innerRadius={58} outerRadius={92} paddingAngle={2}>
              {rows.map((row, index) => <Cell key={row.option} fill={COLORS[index % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(value, _name, context) => [`${value ?? 0} (${context.payload.percentage}%)`, context.payload.option]} />
            <Legend formatter={(value) => <span className="text-xs text-gray-700">{value}</span>} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function HorizontalChart({ rows, multiple }: { rows: DistributionRow[]; multiple: boolean }) {
  const height = Math.max(230, rows.length * 48);
  return (
    <div>
      {multiple && <p className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">Respondents may select more than one answer, so percentages may total more than 100%.</p>}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 5, right: 42, bottom: 5, left: 16 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} domain={[0, 'dataMax']} />
            <YAxis type="category" dataKey="option" width={150} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value, _name, context) => [`${value ?? 0} (${context.payload.percentage}%)`, 'Responses']} />
            <Bar dataKey="count" fill="#1d4ed8" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LikertChart({ rows }: { rows: DistributionRow[] }) {
  const data = [{ name: 'Distribution', ...Object.fromEntries(rows.map((row) => [row.option, row.percentage])) }];
  return (
    <div>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" stackOffset="expand" margin={{ left: 10, right: 10 }}>
            <XAxis type="number" hide domain={[0, 100]} />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip formatter={(value, name) => [`${Number(value ?? 0).toFixed(1)}%`, name]} />
            {rows.map((row, index) => <Bar key={row.option} dataKey={row.option} stackId="likert" fill={COLORS[index % COLORS.length]} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DistributionList rows={rows} />
    </div>
  );
}

function DistributionList({ rows }: { rows: DistributionRow[] }) {
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={row.option} className="flex items-start justify-between gap-4 rounded-lg border px-3 py-2 text-sm">
          <span className="flex min-w-0 items-start gap-2 text-gray-700"><i className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />{row.option}</span>
          <span className="shrink-0 font-semibold text-blue-950">{row.count} ({row.percentage}%)</span>
        </div>
      ))}
    </div>
  );
}

function NumericView({ data }: { data: NumericSummary }) {
  const values: Array<[string, number | null]> = [['N', data.n], ['Mean', data.mean], ['Median', data.median], ['Minimum', data.min], ['Maximum', data.max]];
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{values.map(([label, value]) => <div key={label} className="rounded-lg bg-gray-50 p-4 text-center"><p className="text-xs font-medium uppercase text-gray-500">{label}</p><p className="mt-1 text-xl font-bold text-blue-950">{value ?? '—'}</p></div>)}</div>;
}

function TextResponses({ data }: { data: TextSummary }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const responses = Array.isArray(data?.sample_responses) ? data.sample_responses : [];
    return responses.filter((response) => response.toLowerCase().includes(search.toLowerCase()));
  }, [data?.sample_responses, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => setPage(1), [search]);
  return (
    <div>
      <div className="relative mb-3"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search responses" className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></div>
      <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
        {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((response, index) => <div key={`${page}-${index}`} className="rounded-lg border bg-gray-50 p-3 text-sm text-gray-700">{response}</div>)}
        {filtered.length === 0 && <EmptyState message="No matching text responses." />}
      </div>
      <Pagination page={page} pages={pages} setPage={setPage} />
    </div>
  );
}

function IndividualView({ responses }: { responses: IndividualResponse[] }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);
  const filtered = useMemo(() => {
    const needle = search.toLowerCase();
    return responses.filter((response) => [response.respondent, response.student_id, response.email, response.program_code, response.year_graduated]
      .some((value) => String(value ?? '').toLowerCase().includes(needle)));
  }, [responses, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => setPage(1), [search]);
  if (responses.length === 0) return <EmptyState message="There are no individual responses in this view." />;
  return (
    <div className="survey-report-paper rounded-xl border p-4 shadow-sm sm:p-6">
      <div className="relative mb-4"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search respondent, student ID, program, or batch" className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></div>
      <div className="space-y-2">
        {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((response) => {
          const open = expanded === response.response_id;
          return <article key={response.response_id} className="rounded-lg border">
            <button type="button" onClick={() => setExpanded(open ? null : response.response_id)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
              <span><strong className="block text-sm text-blue-950">{response.respondent || `Response #${response.response_id}`}</strong><span className="text-xs text-gray-500">{[response.student_id, response.program_code, response.year_graduated, formatDate(response.submitted_at)].filter(Boolean).join(' · ')}</span></span>
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {open && <div className="space-y-3 border-t bg-gray-50 p-4">{response.answers.map((answer) => <div key={answer.question_id}><p className="text-xs font-semibold text-gray-600">{answer.question}</p><p className="mt-1 text-sm text-gray-800">{Array.isArray(answer.answer) ? answer.answer.join(', ') : answer.answer}</p></div>)}</div>}
          </article>;
        })}
        {filtered.length === 0 && <EmptyState message="No matching individual responses." />}
      </div>
      <Pagination page={page} pages={pages} setPage={setPage} />
    </div>
  );
}

function InsightCard({ title, rateLabel, rate, rows, denominator }: { title: string; rateLabel: string; rate: number | null; rows: Array<[string, number]>; denominator: number }) {
  return <div className="survey-report-paper rounded-xl border p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-blue-950">{title}</p><p className="text-xs text-gray-500">{denominator} valid responses</p></div><div className="text-right"><p className="text-xs text-gray-500">{rateLabel}</p><p className="text-2xl font-bold text-blue-900">{formatRate(rate)}</p></div></div><div className="mt-4 space-y-2">{rows.map(([label, value]) => <div key={label} className="flex justify-between text-sm"><span className="text-gray-600">{label}</span><strong>{value}</strong></div>)}</div></div>;
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="text-xs font-medium text-gray-600">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500">{children}</select></label>;
}

function FilterDate({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-xs font-medium text-gray-600">{label}<input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500" /></label>;
}

function Pagination({ page, pages, setPage }: { page: number; pages: number; setPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return <div className="mt-4 flex items-center justify-end gap-3 text-sm"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Previous</button><span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Next</button></div>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-lg border border-dashed bg-gray-50 px-4 py-8 text-center text-sm text-gray-500"><BarChart3 className="mx-auto mb-2 h-6 w-6 text-gray-400" />{message}</div>;
}

function StatCard({ icon: Icon, label, value, hint, color, compact = false }: { icon: React.ElementType; label: string; value: string; hint?: string; color: string; compact?: boolean }) {
  return <div className="survey-report-paper rounded-xl border p-5 shadow-sm"><div className="mb-2 flex items-center gap-3"><div className={`rounded-lg p-2 ${color}`}><Icon className="h-5 w-5" /></div><span className="text-sm font-medium text-gray-600">{label}</span></div><p className={`${compact ? 'text-base' : 'text-2xl sm:text-3xl'} font-bold text-blue-900`}>{value}</p>{hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}</div>;
}
