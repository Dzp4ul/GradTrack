import { useState, useEffect, useRef } from 'react';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Download, Users, Briefcase, Target, FileText, FileType2, Sparkles, TrendingUp, CheckCircle2, BarChart3, Filter, RotateCcw, Check, ChevronDown, AlertTriangle, RefreshCw } from 'lucide-react';
import { API_ROOT } from '../../config/api';
import { normalizeGraduationYears } from '../../utils/graduationYears';
import { PROGRAM_COLORS } from '../../config/programColors';
import { useAuth } from '../../contexts/AuthContext';
import AIStatisticalInterpretation from '../../components/reports/AIStatisticalInterpretation';
import type { StatisticalInterpretationContext } from '../../services/analyticsAiService';
import {
  analyticsFingerprint,
  buildPdfInterpretations,
  buildPdfSectionNotes,
  buildStructuredOverviewAnalysis,
  formatPercentage,
  hasUnsupportedNumericClaim,
  mergeValidatedPdfInterpretations,
  normalizeSalaryLabel,
  safeCount,
  type DescriptiveAnalyticsSnapshot,
  type PdfInterpretations,
  type StructuredDescriptiveAnalysis,
} from '../../utils/descriptiveAnalytics';
import {
  buildReportChartDefinitions,
  buildLabeledBarChart,
  renderReportChart,
  reportChartsBySection,
  type ReportChartDefinition,
} from '../../utils/reportCharts';
import { normalizeReportText } from '../../utils/reportText';

const API_BASE = API_ROOT;

interface Overview {
  total_graduates: number;
  total_employed: number;
  total_unemployed?: number;
  total_employment_known?: number;
  total_employment_unknown?: number;
  total_employed_local: number;
  total_employed_abroad: number;
  total_aligned: number;
  total_not_aligned?: number;
  total_alignment_known?: number;
  total_survey_responses: number;
  employment_rate: number | null;
  alignment_rate: number | null;
}

interface OverviewFilters {
  employmentStatus: 'all' | 'employed' | 'unemployed';
  programAlignment: 'all' | 'aligned' | 'not_aligned';
  graduationYear: string;
  programId: string;
}

interface OverviewFilterProgram {
  id: number;
  code: string;
  name: string;
}

interface OverviewFilterOptions {
  years: string[];
  programs: OverviewFilterProgram[];
}

interface ProgramReport {
  code: string;
  name: string;
  total_graduates: number;
  employment_total?: number;
  employed: number;
  unemployed?: number;
  employment_rate?: number | null;
  aligned: number;
  alignment_total?: number;
  alignment_rate?: number | null;
  not_aligned: number;
  avg_time_to_employment: number;
  avg_salary: number;
}

interface YearReport {
  year_graduated: number;
  total_graduates: number;
  employment_total?: number;
  employed: number;
  unemployed?: number;
  employment_rate?: number | null;
  aligned: number;
  alignment_total?: number;
  alignment_rate?: number | null;
  not_aligned?: number;
  avg_salary: number;
}

interface BatchTrendReport {
  year_graduated: number;
  total_graduates: number;
  employment_total: number;
  employed: number;
  unemployed: number;
  employment_rate: number | null;
  alignment_total: number;
  aligned: number;
  not_aligned: number;
  alignment_rate: number | null;
}

interface StatusData {
  employment_status: string;
  count: number;
}

interface SalaryData {
  salary_range: string;
  count: number;
}

interface SurveySummary {
  id: number;
  template_id?: number | null;
  based_on_survey_id?: number | null;
  title: string;
  description: string;
  response_count: number;
  status: string;
  archived_at?: string | null;
}

interface SurveyQuestionAnalytics {
  question_id: number;
  question_key?: string | null;
  analytics_key?: string | null;
  display_order?: number;
  question_text: string;
  question_type: string;
  section?: string;
  options?: string[];
  total_answers: number;
  skipped_answers?: number;
  applicable_responses?: number;
  data: unknown;
}

interface SurveyEmploymentInsights {
  employment_rate: number | null;
  employed_count: number;
  unemployed_count: number;
  employment_total: number;
  alignment_rate: number | null;
  aligned_count: number;
  alignment_total: number;
  not_aligned_count: number;
  binary_not_aligned_count: number;
  salary_distribution: Record<string, number>;
  time_to_job_distribution: Record<string, number>;
}

interface SurveyAnalyticsData {
  survey_id: number;
  survey_title: string;
  template_id?: number | null;
  total_responses: number;
  response_rate: number | null;
  completion_rate: number | null;
  questions_analytics: SurveyQuestionAnalytics[];
  employment_insights?: SurveyEmploymentInsights;
  report_tables?: SurveyReportTable[];
  field_availability?: Record<string, boolean>;
  unavailable_reasons?: string[];
  selected_graduation_year?: number | null;
  scope?: ReportScope | null;
}

interface ReportScope {
  restricted: boolean;
  department_code?: string;
  department_name?: string;
  display_name: string;
  program_codes: string[] | null;
  programs: OverviewFilterProgram[];
}

interface ReportContextData {
  scope: ReportScope;
  surveys: SurveySummary[];
  filter_options?: OverviewFilterOptions;
}

interface InferentialVariable {
  key: string;
  label: string;
  source: 'graduate_dimension' | 'analytics_key';
  analytics_key?: string | null;
}

interface InferentialMetadata {
  surveyId: number;
  surveyTitle: string;
  variables: InferentialVariable[];
  filterOptions: OverviewFilterOptions;
  fieldAvailability: Record<string, boolean>;
}

interface InferentialTableColumn {
  key: string;
  label: string;
}

interface InferentialTableRow {
  key: string;
  label: string;
  frequencies: number[];
  total: number;
}

interface InferentialTable {
  rowVariable: { key: string; label: string };
  columnVariable: { key: string; label: string };
  columns: InferentialTableColumn[];
  rows: InferentialTableRow[];
  columnTotals: number[];
  grandTotal: number;
}

interface InferentialAnalysisResult {
  status: 'complete' | 'insufficient_variation';
  message?: string | null;
  survey: { id: number; title: string };
  filters: {
    graduationYear: string | null;
    programId: number | null;
    programLabel: string | null;
  };
  analysis: {
    variable1: { key: string; label: string };
    variable2: { key: string; label: string };
    test: string;
    validResponses: number;
    excludedResponses: number;
    alpha: number;
    canCalculate: boolean;
    chiSquare: number | null;
    degreesOfFreedom: number | null;
    pValue: number | null;
    significant: boolean | null;
    cramersV: number | null;
    associationStrength: string | null;
    decision: string;
  };
  contingencyTable: InferentialTable;
  expectedFrequencies: Omit<InferentialTable, 'rowVariable' | 'columnVariable'> | [];
  chartData: {
    categories: Array<{ category: string } & Record<string, string | number>>;
    series: Array<{ key: string; label: string }>;
  };
  assumptions: {
    passed: boolean;
    cellsBelowOne: number;
    cellsBelowFive: number;
    percentageBelowFive: number;
    minimumExpected: number | null;
    warnings: string[];
  };
  interpretation: string;
  aiInterpretation: StatisticalInterpretationContext;
}

interface InferentialSettings {
  variable1: string;
  variable2: string;
  graduationYear: string;
  programId: string;
}

interface AiAnalyticsCacheEntry {
  analysis: string;
  summary: string;
  conclusion: string;
  sections?: Partial<{
    employmentInterpretation: string;
    programAnalysis: string;
    alignmentAnalysis: string;
    summary: string;
    dataNotes: string[];
  }>;
  source?: 'groq' | 'fallback';
}

interface SurveyQuestionTableRow {
  label: string;
  count: number;
}

interface SurveyReportHeaderCell {
  label: string;
  colspan?: number;
  rowspan?: number;
  align?: 'left' | 'center' | 'right';
}

interface SurveyReportRow {
  cells: string[];
  is_total?: boolean;
  is_group?: boolean;
}

interface SurveyReportTable {
  number: string;
  title: string;
  section_title?: string;
  headers: SurveyReportHeaderCell[][];
  rows: SurveyReportRow[];
  note?: string;
}

type SurveyReportChartRow = { label: string } & Record<string, string | number>;

interface SurveyReportChartSeries {
  key: string;
  name: string;
  color: string;
}

interface SurveyReportChart {
  tableNumber: string;
  title: string;
  data: SurveyReportChartRow[];
  series: SurveyReportChartSeries[];
}

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
const SURVEY_CHART_COLORS = ['#1d4ed8', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#ea580c', '#475569'];
const DEAN_ROLES = ['dean_cs', 'dean_coed', 'dean_hm'];
const REPORT_TABS = ['overview', 'program', 'year', 'employment', 'salary', 'surveys', 'inferential'] as const;
type ReportTab = typeof REPORT_TABS[number];
const DEFAULT_OVERVIEW_FILTERS: OverviewFilters = {
  employmentStatus: 'all',
  programAlignment: 'all',
  graduationYear: 'all',
  programId: 'all',
};
const SELECTED_SURVEY_STORAGE_KEY = 'gradtrack_selected_survey_id';
const NO_SURVEY_SELECTION_VALUE = 'none';
const ALL_SURVEY_TABLES_VALUE = 'all';
const DEFAULT_INFERENTIAL_SETTINGS: InferentialSettings = {
  variable1: '',
  variable2: '',
  graduationYear: 'all',
  programId: 'all',
};
const SURVEY_REPORT_HEADER_COLOR = 'FF1B2A4A';
const SURVEY_REPORT_TABLE_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};

const SURVEY_DEPARTMENT_OPTIONS = [
  {
    value: 'ccs',
    label: 'College of Computing Studies',
    programCodes: ['BSCS', 'ACT'],
  },
  {
    value: 'coe',
    label: 'College of Education',
    programCodes: ['BSED', 'BEED'],
  },
  {
    value: 'chrm',
    label: 'College of Hotel and Restaurant Management',
    programCodes: ['BSHM'],
  },
] as const;

type ExcelRow = Record<string, string | number>;

interface FormalReportExportData {
  generatedAt: Date;
  reportDepartment: string;
  departmentLabel: string;
  batchLabel: string;
  filterLabels: {
    employmentStatus: string;
    programAlignment: string;
    graduationYear: string;
    course: string;
  };
  overview: Overview | null;
  programs: ProgramReport[];
  years: YearReport[];
  statuses: StatusData[];
  salaries: SalaryData[];
  snapshot: DescriptiveAnalyticsSnapshot;
  charts: ReportChartDefinition[];
  fileBaseName: string;
}

const normalizeSurveySummary = (survey: SurveySummary): SurveySummary => ({
  ...survey,
  id: Number(survey.id),
  response_count: Number(survey.response_count ?? 0),
});

const parseSurveyId = (value: string | null): number | null => {
  const surveyId = Number(value);
  return Number.isFinite(surveyId) && surveyId > 0 ? surveyId : null;
};

const getNotEmployedCount = (item: Pick<ProgramReport | YearReport, 'total_graduates' | 'employment_total' | 'employed'>): number => (
  Math.max(Number(item.employment_total ?? item.total_graduates ?? 0) - Number(item.employed ?? 0), 0)
);

const formatNullableRate = (value: number | null | undefined): string => (
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? 'No data'
    : `${Number(value).toFixed(1)}%`
);

const formatInferentialStatistic = (value: number | null | undefined, decimals = 3): string => (
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? 'Not calculated'
    : Number(value).toFixed(decimals)
);

const formatInferentialPValue = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return 'Not calculated';
  }
  return Number(value) < 0.001 ? '< 0.001' : Number(value).toFixed(3);
};

interface InferentialComparisonCopy {
  question: string;
}

const getInferentialPairKey = (result: InferentialAnalysisResult): string => (
  [result.analysis.variable1.key, result.analysis.variable2.key].sort().join('|')
);

const getInferentialComparisonCopy = (result: InferentialAnalysisResult): InferentialComparisonCopy => {
  switch (getInferentialPairKey(result)) {
    case 'employment_status|graduation_year':
      return {
        question: 'Do employment rates differ across graduation years?',
      };
    case 'employment_status|program':
      return {
        question: 'Do programs have different employment rates?',
      };
    case 'employment_status|job_course_alignment':
      return {
        question: 'Can job alignment be compared by employment status?',
      };
    case 'employment_status|work_location':
      return {
        question: 'Can work location be compared by employment status?',
      };
    case 'graduation_year|job_course_alignment':
      return {
        question: 'Does the percentage working in course-aligned jobs change across graduation years?',
      };
    case 'graduation_year|program':
      return {
        question: 'Does the mix of program graduates change across graduation years?',
      };
    case 'graduation_year|work_location':
      return {
        question: 'Do local and overseas work percentages change across graduation years?',
      };
    case 'job_course_alignment|program':
      return {
        question: 'Do programs differ in how often graduates work in course-aligned jobs?',
      };
    case 'job_course_alignment|work_location':
      return {
        question: 'Are local and overseas workers equally likely to have course-aligned jobs?',
      };
    case 'program|work_location':
      return {
        question: 'Do local and overseas work percentages differ across programs?',
      };
    default:
      return {
        question: `Do the results differ between ${result.analysis.variable1.label} and ${result.analysis.variable2.label}?`,
      };
  }
};

const getInferentialUnavailableResult = (result: InferentialAnalysisResult): string => {
  switch (getInferentialPairKey(result)) {
    case 'employment_status|job_course_alignment':
      return 'Job alignment is recorded only for employed graduates, so employed and unemployed groups cannot be compared.';
    case 'employment_status|work_location':
      return 'Work location is recorded only for employed graduates, so employed and unemployed groups cannot be compared.';
    default:
      return 'These groups cannot be compared because the answers do not contain enough different categories.';
  }
};

const getInferentialPlainOutcome = (result: InferentialAnalysisResult): string => {
  if (!result.analysis.canCalculate) return getInferentialUnavailableResult(result);
  const { variable1, variable2 } = result.analysis;
  return result.analysis.significant
    ? `The available data provide sufficient statistical evidence of an association between ${variable1.label} and ${variable2.label}.`
    : `The available data did not provide sufficient statistical evidence of an association between ${variable1.label} and ${variable2.label}.`;
};

const getInferentialGroupResult = (result: InferentialAnalysisResult): string => {
  if (!result.analysis.canCalculate) return 'Cannot compare';
  return result.analysis.significant ? 'Evidence found' : 'Insufficient evidence';
};

const getInferentialDifferenceLabel = (strength: string | null): string => {
  switch (strength) {
    case 'Very Weak': return 'Very weak association';
    case 'Weak': return 'Weak association';
    case 'Moderate': return 'Moderate association';
    case 'Strong': return 'Strong association';
    default: return 'Cannot be measured';
  }
};

const getEmploymentStatusChartLabel = (status: string): string => {
  if (status === 'Employed (Local)') {
    return 'Local';
  }

  if (status === 'Employed (Abroad)') {
    return 'Abroad';
  }

  return status;
};

const getOverviewFilterKey = (filters: OverviewFilters): string => [
  filters.employmentStatus,
  filters.programAlignment,
  filters.graduationYear,
  filters.programId,
].join('|');

const areOverviewFiltersEqual = (a: OverviewFilters, b: OverviewFilters): boolean => (
  getOverviewFilterKey(a) === getOverviewFilterKey(b)
);

const isSpecificFilterValue = (value: unknown): value is string => {
  if (value === null || value === undefined) {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized !== '' && normalized !== 'all' && normalized !== 'null' && normalized !== 'undefined';
};

const appendOverviewFilterParams = (params: URLSearchParams, filters?: OverviewFilters) => {
  if (!filters) {
    return;
  }

  if (isSpecificFilterValue(filters.employmentStatus)) {
    params.set('employmentStatus', filters.employmentStatus);
  }
  if (isSpecificFilterValue(filters.programAlignment)) {
    params.set('programAlignment', filters.programAlignment);
  }
  if (isSpecificFilterValue(filters.graduationYear)) {
    params.set('graduationYear', filters.graduationYear);
  }
  if (isSpecificFilterValue(filters.programId)) {
    params.set('programId', filters.programId);
  }
};

const analyticsCount = (value: unknown): number => {
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
};

const analyticsPercentage = (part: number, whole: number): string => (
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : 'not available'
);

const emptyLocalAnalytics = (): AiAnalyticsCacheEntry => ({
  analysis: 'No report data is available for the selected filters.',
  summary: 'The current selection does not contain enough classified responses to calculate descriptive totals or percentages.',
  conclusion: 'A descriptive conclusion cannot be formed until report data is available for this selection.',
});

const buildLocalDescriptiveAnalytics = (reportType: string, reportData: unknown): AiAnalyticsCacheEntry => {
  if (reportType === 'overview') {
    const payload = reportData && typeof reportData === 'object'
      ? reportData as {
          overview?: Overview;
          by_batch_trends?: BatchTrendReport[];
          scope?: string;
          selected_batch?: string;
        }
      : {};
    const data = payload.overview ?? (reportData as Overview | null);
    if (!data) return emptyLocalAnalytics();

    const total = analyticsCount(data.total_graduates);
    const employed = analyticsCount(data.total_employed);
    const employmentKnown = analyticsCount(data.total_employment_known)
      || employed + analyticsCount(data.total_unemployed);
    const unemployed = analyticsCount(data.total_unemployed)
      || Math.max(employmentKnown - employed, 0);
    const employmentUnknown = analyticsCount(data.total_employment_unknown)
      || Math.max(total - employmentKnown, 0);
    const local = analyticsCount(data.total_employed_local);
    const abroad = analyticsCount(data.total_employed_abroad);
    const locationKnown = local + abroad;
    const aligned = analyticsCount(data.total_aligned);
    const notAligned = analyticsCount(data.total_not_aligned);
    const alignmentKnown = aligned + notAligned;
    const batchRows = Array.isArray(payload.by_batch_trends)
      ? payload.by_batch_trends.slice().sort((a, b) => Number(a.year_graduated) - Number(b.year_graduated))
      : [];
    const scopeText = payload.scope ? ` The authenticated report scope is ${payload.scope}.` : '';
    const batchSelectionText = payload.selected_batch
      ? ` The active batch selection is ${payload.selected_batch}.`
      : '';
    const batchDetails = batchRows.map((row) => {
      const batchEmploymentKnown = analyticsCount(row.employment_total);
      const batchNotAligned = analyticsCount(row.not_aligned);
      const batchAlignmentKnown = analyticsCount(row.aligned) + batchNotAligned;
      return `Batch ${row.year_graduated} records ${analyticsCount(row.employed)} employed and ${analyticsCount(row.unemployed)} unemployed graduates among ${batchEmploymentKnown} classified employment responses, for an employment rate of ${formatNullableRate(row.employment_rate)}. Its job-alignment distribution contains ${analyticsCount(row.aligned)} aligned and ${batchNotAligned} not-aligned graduates among ${batchAlignmentKnown} classified alignment responses, with an alignment rate of ${formatNullableRate(row.alignment_rate)}.`;
    }).join('\n\n');
    const leadingEmploymentBatch = batchRows.length > 0
      ? batchRows.reduce((highest, row) => (
          analyticsCount(row.employment_rate) > analyticsCount(highest.employment_rate) ? row : highest
        ))
      : null;
    const leadingAlignmentBatch = batchRows.length > 0
      ? batchRows.reduce((highest, row) => (
          analyticsCount(row.alignment_rate) > analyticsCount(highest.alignment_rate) ? row : highest
        ))
      : null;
    const batchSummary = batchRows.length === 0
      ? 'No batch-trend rows are available for the current filters.'
      : batchRows.length === 1
        ? `The batch charts contain one cohort, ${batchRows[0].year_graduated}, so their employment and alignment counts match the single selected cohort described above.`
        : `Across the displayed cohorts, batch ${leadingEmploymentBatch?.year_graduated} has the highest employment rate at ${formatNullableRate(leadingEmploymentBatch?.employment_rate)}, while batch ${leadingAlignmentBatch?.year_graduated} has the highest alignment rate at ${formatNullableRate(leadingAlignmentBatch?.alignment_rate)}.`;

    return {
      analysis: `The selected overview contains ${total} graduate responses.${scopeText}${batchSelectionText} Employment status is classified for ${employmentKnown} responses, while ${employmentUnknown} ${employmentUnknown === 1 ? 'response remains' : 'responses remain'} unclassified. Of the classified responses, ${employed} are employed and ${unemployed} are unemployed, producing an employment rate of ${formatNullableRate(data.employment_rate)}.\n\nThe work-location chart classifies ${locationKnown} employed graduates: ${local} are working locally and ${abroad} are working abroad. Local employment represents ${analyticsPercentage(local, locationKnown)} of classified work locations, and employment abroad represents ${analyticsPercentage(abroad, locationKnown)}.\n\nThe job-alignment chart contains ${alignmentKnown} applicable classified responses: ${aligned} aligned and ${notAligned} not aligned. Aligned work represents ${analyticsPercentage(aligned, alignmentKnown)} of classified alignment responses, and the reported alignment rate is ${formatNullableRate(data.alignment_rate)}.${batchDetails ? `\n\n${batchDetails}` : ''}`,
      summary: `Employment is the status of ${analyticsPercentage(employed, employmentKnown)} of graduates with a classified employment response, while unemployment accounts for ${analyticsPercentage(unemployed, employmentKnown)}. The exact counts are ${employed} employed and ${unemployed} unemployed.\n\nLocal and abroad employment are distributed as ${local} and ${abroad}, respectively. Alignment responses are distributed as ${aligned} aligned and ${notAligned} not aligned.\n\n${batchSummary}`,
      conclusion: `Overall, the overview shows an employment rate of ${formatNullableRate(data.employment_rate)} and an alignment rate of ${formatNullableRate(data.alignment_rate)} within their respective valid-response denominators. The employment, location, and alignment percentages therefore describe different classified subsets and are not calculated from one common denominator.\n\n${batchRows.length > 0 ? `The batch charts account for ${batchRows.length} displayed ${batchRows.length === 1 ? 'cohort' : 'cohorts'} and preserve the same employment and alignment categories shown in the overview totals. ${batchSummary}` : batchSummary}`,
    };
  }

  if (reportType === 'by_program') {
    const rows = Array.isArray(reportData) ? reportData as ProgramReport[] : [];
    if (rows.length === 0) return emptyLocalAnalytics();

    const total = rows.reduce((sum, row) => sum + analyticsCount(row.total_graduates), 0);
    const employed = rows.reduce((sum, row) => sum + analyticsCount(row.employed), 0);
    const employmentKnown = rows.reduce(
      (sum, row) => sum + analyticsCount(row.employment_total ?? row.total_graduates),
      0,
    );
    const aligned = rows.reduce((sum, row) => sum + analyticsCount(row.aligned), 0);
    const alignmentKnown = rows.reduce((sum, row) => sum + analyticsCount(row.alignment_total), 0);
    const leading = rows.reduce((highest, row) => (
      analyticsCount(row.total_graduates) > analyticsCount(highest.total_graduates) ? row : highest
    ));
    const detailed = buildPdfInterpretations({
      overview: null,
      programPerformance: rows,
      yearlyTrend: [],
      employmentStatus: [],
      salaryDistribution: [],
    }).programPerformance;

    return {
      analysis: detailed,
      summary: `${rows.length} programs; ${total} responses; ${employmentKnown} known employment classifications; ${employed} employed; ${Math.max(employmentKnown - employed, 0)} unemployed; ${aligned} aligned among ${alignmentKnown} valid alignment responses.`,
      conclusion: `${leading.code || leading.name} contains the largest response sample (${analyticsCount(leading.total_graduates)}). Across all displayed programs, employment accounts for ${analyticsPercentage(employed, employmentKnown)} of known classifications; this pooled percentage and the raw program counts are descriptive and do not rank program quality.`,
    };
  }

  if (reportType === 'by_year') {
    const rows = Array.isArray(reportData) ? reportData as YearReport[] : [];
    if (rows.length === 0) return emptyLocalAnalytics();

    const total = rows.reduce((sum, row) => sum + analyticsCount(row.total_graduates), 0);
    const employed = rows.reduce((sum, row) => sum + analyticsCount(row.employed), 0);
    const employmentKnown = rows.reduce(
      (sum, row) => sum + analyticsCount(row.employment_total ?? row.total_graduates),
      0,
    );
    const aligned = rows.reduce((sum, row) => sum + analyticsCount(row.aligned), 0);
    const alignmentKnown = rows.reduce((sum, row) => sum + analyticsCount(row.alignment_total), 0);
    const leading = rows.reduce((highest, row) => (
      analyticsCount(row.total_graduates) > analyticsCount(highest.total_graduates) ? row : highest
    ));
    const detailed = buildPdfInterpretations({
      overview: null,
      programPerformance: [],
      yearlyTrend: rows,
      employmentStatus: [],
      salaryDistribution: [],
    }).yearlyTrend;

    return {
      analysis: detailed,
      summary: `${rows.length} graduation ${rows.length === 1 ? 'year' : 'years'}; ${total} responses; ${employmentKnown} known employment classifications; ${employed} employed; ${aligned} aligned among ${alignmentKnown} valid alignment responses.`,
      conclusion: `The largest response sample appears in ${leading.year_graduated} (${analyticsCount(leading.total_graduates)} responses). Across all displayed years, employment accounts for ${analyticsPercentage(employed, employmentKnown)} of known classifications; year-to-year counts remain descriptive because cohort response totals can differ.`,
    };
  }

  if (reportType === 'employment_status') {
    const payload = reportData && typeof reportData === 'object'
      ? reportData as {
          statuses?: StatusData[];
          summary?: {
            total_employed?: number;
            local_count?: number;
            abroad_count?: number;
            location_unknown_count?: number;
            unemployed_count?: number;
          };
        }
      : {};
    const rows = Array.isArray(payload.statuses) ? payload.statuses : [];
    if (rows.length === 0) return emptyLocalAnalytics();

    const countFor = (label: string) => analyticsCount(
      rows.find((row) => row.employment_status === label)?.count,
    );
    const local = countFor('Employed (Local)');
    const abroad = countFor('Employed (Abroad)');
    const locationUnknown = countFor('Employed (Location Unknown)');
    const employmentUnknown = countFor('Employment Status Unknown');
    const unemployed = countFor('Unemployed');
    const employed = local + abroad + locationUnknown;
    const employmentKnown = employed + unemployed;
    const total = employmentKnown + employmentUnknown;
    const detailed = buildPdfInterpretations({
      overview: {
        total_graduates: total,
        total_employed: employed,
        total_unemployed: unemployed,
        total_employment_known: employmentKnown,
        total_employment_unknown: employmentUnknown,
        total_employed_local: local,
        total_employed_abroad: abroad,
      },
      programPerformance: [],
      yearlyTrend: [],
      employmentStatus: rows,
      salaryDistribution: [],
    }).employmentStatus;

    return {
      analysis: detailed,
      summary: `${employmentKnown} known employment responses; ${employed} employed; ${unemployed} unemployed; ${local} local; ${abroad} abroad${locationUnknown > 0 ? `; ${locationUnknown} employed with unknown location` : ''}.`,
      conclusion: `Employment accounts for ${analyticsPercentage(employed, employmentKnown)} of known employment responses. Among employed respondents, local work represents ${analyticsPercentage(local, employed)} and overseas work represents ${analyticsPercentage(abroad, employed)}; these denominators differ from the unemployment denominator.`,
    };
  }

  if (reportType === 'salary_distribution') {
    const payload = reportData && typeof reportData === 'object'
      ? reportData as { salary_buckets?: SalaryData[] }
      : {};
    const rows = Array.isArray(payload.salary_buckets) ? payload.salary_buckets : [];
    if (rows.length === 0) return emptyLocalAnalytics();

    const total = rows.reduce((sum, row) => sum + analyticsCount(row.count), 0);
    const leading = rows.reduce((highest, row) => (
      analyticsCount(row.count) > analyticsCount(highest.count) ? row : highest
    ));
    const detailed = buildPdfInterpretations({
      overview: null,
      programPerformance: [],
      yearlyTrend: [],
      employmentStatus: [],
      salaryDistribution: rows,
    }).salaryDistribution;

    return {
      analysis: detailed,
      summary: `${total} valid salary responses across ${rows.length} grouped ranges. ${normalizeSalaryLabel(leading.salary_range)} has ${analyticsCount(leading.count)} responses (${analyticsPercentage(analyticsCount(leading.count), total)} of valid salary responses).`,
      conclusion: 'The salary distribution describes grouped valid responses only. Missing salary answers are not treated as zero, and the grouped ranges are not converted into an exact average salary.',
    };
  }

  return emptyLocalAnalytics();
};

export default function Reports() {
  const { user } = useAuth();
  const isDean = DEAN_ROLES.includes(user?.role ?? '');
  const initialParams = new URLSearchParams(window.location.search);
  const initialTabParam = initialParams.get('tab') as ReportTab | null;
  const initialSurveyParam = initialParams.get('survey_id');
  const hasInitialSurveyParam = initialSurveyParam !== null;
  const initialStoredSurvey = localStorage.getItem(SELECTED_SURVEY_STORAGE_KEY);
  const initialSurveyId = parseSurveyId(initialSurveyParam ?? initialStoredSurvey);
  const initialNoSurveySelection = hasInitialSurveyParam && parseSurveyId(initialSurveyParam) === null;
  const [tab, setTab] = useState<ReportTab>(
    initialTabParam && REPORT_TABS.includes(initialTabParam) ? initialTabParam : 'overview'
  );
  const [overview, setOverview] = useState<Overview | null>(null);
  const [programData, setProgramData] = useState<ProgramReport[]>([]);
  const [overviewProgramData, setOverviewProgramData] = useState<ProgramReport[]>([]);
  const [overviewBatchTrends, setOverviewBatchTrends] = useState<BatchTrendReport[]>([]);
  const [yearData, setYearData] = useState<YearReport[]>([]);
  const [statusData, setStatusData] = useState<StatusData[]>([]);
  const [salaryData, setSalaryData] = useState<SalaryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedSurveyDepartment, setSelectedSurveyDepartment] = useState<string>(SURVEY_DEPARTMENT_OPTIONS[0].value);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [availableDepartments, setAvailableDepartments] = useState<Array<{ code: string; name: string }>>([]);
  const [overviewFilters, setOverviewFilters] = useState<OverviewFilters>({ ...DEFAULT_OVERVIEW_FILTERS });
  const [overviewFilterDraft, setOverviewFilterDraft] = useState<OverviewFilters>({ ...DEFAULT_OVERVIEW_FILTERS });
  const [overviewFilterOptions, setOverviewFilterOptions] = useState<OverviewFilterOptions>({
    years: [],
    programs: [],
  });
  const [overviewFilterError, setOverviewFilterError] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [aiSummary, setAiSummary] = useState<string>('');
  const [aiConclusion, setAiConclusion] = useState<string>('');
  const [aiSections, setAiSections] = useState<AiAnalyticsCacheEntry['sections']>();
  const [aiSource, setAiSource] = useState<'groq' | 'fallback'>('fallback');
  const [aiLoading, setAiLoading] = useState(true);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [wordExporting, setWordExporting] = useState(false);
  const [excelExporting, setExcelExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [surveyItems, setSurveyItems] = useState<SurveySummary[]>([]);
  const [surveyItemsLoaded, setSurveyItemsLoaded] = useState(false);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(initialSurveyId);
  const [noSurveySelectionExplicit, setNoSurveySelectionExplicit] = useState(initialNoSurveySelection);
  const [surveyAnalytics, setSurveyAnalytics] = useState<SurveyAnalyticsData | null>(null);
  const [surveyAnalyticsLoading, setSurveyAnalyticsLoading] = useState(false);
  const [reportScope, setReportScope] = useState<ReportScope | null>(null);
  const [reportError, setReportError] = useState('');
  const [surveyAnalyticsError, setSurveyAnalyticsError] = useState('');
  const [showSurveyGraphs, setShowSurveyGraphs] = useState(false);
  const [selectedSurveyTable, setSelectedSurveyTable] = useState(ALL_SURVEY_TABLES_VALUE);
  const [inferentialMetadata, setInferentialMetadata] = useState<InferentialMetadata | null>(null);
  const [inferentialSettings, setInferentialSettings] = useState<InferentialSettings>({ ...DEFAULT_INFERENTIAL_SETTINGS });
  const [inferentialResult, setInferentialResult] = useState<InferentialAnalysisResult | null>(null);
  const [inferentialMetadataLoading, setInferentialMetadataLoading] = useState(false);
  const [inferentialAnalysisLoading, setInferentialAnalysisLoading] = useState(false);
  const [inferentialError, setInferentialError] = useState('');
  const reportCacheRef = useRef<Record<string, unknown>>({});
  const aiCacheRef = useRef<Record<string, AiAnalyticsCacheEntry>>({});
  const aiRequestCacheRef = useRef<Record<string, Promise<AiAnalyticsCacheEntry>>>({});
  const pdfInterpretationCacheRef = useRef<Record<string, PdfInterpretations>>({});
  const surveyAnalyticsCacheRef = useRef<Record<string, SurveyAnalyticsData>>({});
  const activeReportLoadKeyRef = useRef<string | null>(null);
  const surveyAnalyticsRequestKeyRef = useRef<string | null>(null);
  const reportRequestSeqRef = useRef(0);
  const overviewRequestSeqRef = useRef(0);
  const aiRequestSeqRef = useRef(0);
  const inferentialRequestSeqRef = useRef(0);
  const selectedSurvey = surveyItems.find((survey) => Number(survey.id) === selectedSurveyId);

  useEffect(() => {
    const reportYear = tab === 'overview' ? overviewFilters.graduationYear : selectedYear;
    const reportProgram = tab === 'overview'
      ? overviewFilterOptions.programs.find((program) => String(program.id) === overviewFilters.programId)?.code || 'all'
      : selectedDepartment;
    const context = {
      surveyId: selectedSurveyId,
      surveyTitle: selectedSurvey?.title || '',
      reportType: tab,
      tab,
      selectedYear: reportYear,
      selectedDepartment: reportProgram,
      overviewFilters,
      filterLabels: {
        program: reportProgram === 'all' ? 'All Programs' : reportProgram,
        graduationYear: reportYear === 'all' ? 'All Years' : reportYear,
      },
      contextLabel: `${tab.replace(/_/g, ' ')} - ${reportProgram === 'all' ? 'All Programs' : reportProgram} - ${reportYear === 'all' ? 'All Years' : reportYear}`,
      source: 'reports-page',
    };
    window.dispatchEvent(new CustomEvent('gradtrack:report-context', { detail: context }));
    window.dispatchEvent(new CustomEvent('gradtrack:page-context', {
      detail: {
        route: '/admin/reports',
        currentModule: 'Reports & Analytics',
        currentFilters: {
          survey_id: selectedSurveyId || 0,
          survey_title: selectedSurvey?.title || '',
          program_code: reportProgram === 'all' ? '' : reportProgram,
          year_graduated: reportYear === 'all' ? '' : reportYear,
        },
      },
    }));
  }, [overviewFilterOptions.programs, overviewFilters, selectedDepartment, selectedSurvey?.title, selectedSurveyId, selectedYear, tab]);

  const getReportCacheKey = (
    type: string,
    year: string,
    department: string,
    filters?: OverviewFilters,
  ) => (
    [type, selectedSurveyId ?? 'none', year, department, filters ? getOverviewFilterKey(filters) : 'standard'].join('|')
  );

  const getOverviewBundleCacheKey = (filters: OverviewFilters) => (
    getReportCacheKey('overview_bundle', 'all', 'all', filters)
  );

  const getAiCacheKey = (reportType: string, year: string, department: string, reportData: unknown) => {
    const reportYear = reportType === 'overview' && !isDean ? 'all' : year;
    const reportDepartment = isDean
      ? reportScope?.department_code || 'dean_scope'
      : reportType === 'overview' ? 'all' : department;
    return ['ai-v4', getReportCacheKey(reportType, reportYear, reportDepartment, overviewFilters), analyticsFingerprint(reportData)].join('|');
  };

  const getSurveyAnalyticsCacheKey = (surveyId: number, surveyDepartment: string, year: string) => (
    [surveyId, surveyDepartment, year].join('|')
  );

  const applyReportDataByType = (type: string, data: unknown) => {
    switch (type) {
      case 'overview':
        setOverview(data as Overview);
        break;
      case 'by_program':
        setProgramData(data as ProgramReport[]);
        break;
      case 'by_year': {
        const typedYearData = data as YearReport[];
        setYearData(typedYearData);
        const years = normalizeGraduationYears(typedYearData.map((y) => y.year_graduated));
        setAvailableYears(years);
        break;
      }
      case 'employment_status':
        setStatusData(data as StatusData[]);
        break;
      case 'salary_distribution':
        setSalaryData(data as SalaryData[]);
        break;
      default:
        break;
    }
  };

  const buildReportUrl = (
    type: string,
    year: string = 'all',
    department: string = selectedDepartment,
    auditAction?: string,
    filters?: OverviewFilters,
    preserveOverviewDepartment = false,
  ) => {
    const params = new URLSearchParams({ type });
    const effectiveDepartment = type === 'overview' && !preserveOverviewDepartment ? 'all' : department;
    params.set('survey_id', selectedSurveyId ? selectedSurveyId.toString() : NO_SURVEY_SELECTION_VALUE);
    if (year !== 'all') {
      params.set('year', year);
    }
    if (effectiveDepartment !== 'all') {
      params.set('department', effectiveDepartment);
    }
    if (auditAction) {
      params.set('audit_action', auditAction);
    }
    appendOverviewFilterParams(params, filters);

    return `${API_BASE}/reports/index.php?${params.toString()}`;
  };

  const getDefaultSurveyId = (surveys: SurveySummary[], currentId: number | null = selectedSurveyId) => {
    if (currentId && surveys.some((survey) => Number(survey.id) === currentId)) {
      return currentId;
    }

    const activeSurvey = surveys.find((survey) => survey.status === 'active');
    return activeSurvey ? Number(activeSurvey.id) : null;
  };

  const buildAiPayload = (reportType: string, data: unknown) => {
    if (reportType === 'overview' && data && typeof data === 'object') {
      return {
        overview: data,
        by_program: overviewProgramData,
        by_batch_trends: overviewBatchTrends,
        scope: reportScope?.display_name || '',
        selected_batch: selectedYear === 'all' ? 'All Batches' : selectedYear,
      };
    }

    if (reportType === 'employment_status' && Array.isArray(data)) {
      const localCount = Number((data as StatusData[]).find((status) => status.employment_status === 'Employed (Local)')?.count ?? 0);
      const abroadCount = Number((data as StatusData[]).find((status) => status.employment_status === 'Employed (Abroad)')?.count ?? 0);
      const locationUnknownCount = Number((data as StatusData[]).find((status) => status.employment_status === 'Employed (Location Unknown)')?.count ?? 0);
      const unemployedCount = Number((data as StatusData[]).find((status) => status.employment_status === 'Unemployed')?.count ?? 0);
      const totalEmployed = localCount + abroadCount + locationUnknownCount;

      return {
        statuses: data,
        summary: {
          total_employed: totalEmployed,
          local_count: localCount,
          abroad_count: abroadCount,
          location_unknown_count: locationUnknownCount,
          unemployed_count: unemployedCount,
          local_share_percent: totalEmployed > 0 ? Number(((localCount / totalEmployed) * 100).toFixed(1)) : null,
          abroad_share_percent: totalEmployed > 0 ? Number(((abroadCount / totalEmployed) * 100).toFixed(1)) : null,
        },
      };
    }

    if (reportType === 'salary_distribution' && Array.isArray(data)) {
      const totalClassified = (data as SalaryData[]).reduce((sum, item) => sum + Number(item.count ?? 0), 0);
      return {
        salary_buckets: data,
        summary: {
          total_classified: totalClassified,
          total_filtered_responses: overview?.total_graduates ?? null,
        },
      };
    }

    return data;
  };

  const fetchReport = (
    type: string,
    year: string = 'all',
    department: string = selectedDepartment,
    forceRefresh = false,
  ) => {
    if (!surveyItemsLoaded) {
      setLoading(true);
      return;
    }

    const reportYear = type === 'overview' ? 'all' : year;
    const reportDepartment = type === 'overview' ? 'all' : department;

    const activeFilters = type === 'overview_filter_options' ? undefined : overviewFilters;
    const cacheKey = getReportCacheKey(type, reportYear, reportDepartment, activeFilters);
    if (forceRefresh) {
      delete reportCacheRef.current[cacheKey];
    }
    const cachedData = reportCacheRef.current[cacheKey];
    activeReportLoadKeyRef.current = cacheKey;
    setReportError('');

    if (cachedData !== undefined) {
      applyReportDataByType(type, cachedData);
      if (type !== 'overview') {
        fetchAIAnalytics(type, buildAiPayload(type, cachedData), reportYear, reportDepartment);
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    const url = buildReportUrl(type, reportYear, reportDepartment, undefined, activeFilters);
    const requestId = ++reportRequestSeqRef.current;

    fetch(url, { credentials: 'include' })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          reportCacheRef.current[cacheKey] = res.data;

          if (requestId !== reportRequestSeqRef.current || activeReportLoadKeyRef.current !== cacheKey) {
            return;
          }

          applyReportDataByType(type, res.data);

          if (type !== 'overview') {
            fetchAIAnalytics(type, buildAiPayload(type, res.data), reportYear, reportDepartment);
          }
        } else if (requestId === reportRequestSeqRef.current && activeReportLoadKeyRef.current === cacheKey) {
          setReportError(res.error || 'Unable to load report data. Please try again.');
        }
      })
      .catch(() => {
        if (requestId === reportRequestSeqRef.current && activeReportLoadKeyRef.current === cacheKey) {
          setReportError('Unable to load report data. Please try again.');
          if (forceRefresh) setAiLoading(false);
        }
      })
      .finally(() => {
        if (requestId === reportRequestSeqRef.current && activeReportLoadKeyRef.current === cacheKey) {
          setLoading(false);
        }
      });
  };

  const applySurveyItems = (
    surveys: SurveySummary[],
    loadAnalytics: boolean,
  ) => {
    setSurveyItems(surveys);

    if (surveys.length === 0) {
      setSelectedSurveyId(null);
      setSurveyAnalytics(null);
      setInferentialMetadata(null);
      setInferentialResult(null);
      localStorage.removeItem(SELECTED_SURVEY_STORAGE_KEY);
      return;
    }

    const currentSurveyToPreserve = hasInitialSurveyParam || surveyItemsLoaded ? selectedSurveyId : null;
    const surveyIdToLoad = noSurveySelectionExplicit ? null : getDefaultSurveyId(surveys, currentSurveyToPreserve);
    setSelectedSurveyId(surveyIdToLoad);
    if (surveyIdToLoad) {
      setNoSurveySelectionExplicit(false);
      localStorage.setItem(SELECTED_SURVEY_STORAGE_KEY, surveyIdToLoad.toString());
    } else {
      setNoSurveySelectionExplicit(true);
      localStorage.setItem(SELECTED_SURVEY_STORAGE_KEY, NO_SURVEY_SELECTION_VALUE);
    }
    if (loadAnalytics && surveyIdToLoad) {
      fetchSurveyAnalytics(surveyIdToLoad, selectedSurveyDepartment, selectedYear);
    } else if (loadAnalytics) {
      setSurveyAnalytics(null);
    }
  };

  const fetchSurveyItems = (loadAnalytics: boolean = false) => {
    if (loadAnalytics) {
      setSurveyLoading(true);
    }

    if (isDean) {
      const params = new URLSearchParams({ type: 'report_context' });
      if (selectedSurveyId) {
        params.set('survey_id', selectedSurveyId.toString());
      }

      fetch(`${API_BASE}/reports/index.php?${params.toString()}`, { credentials: 'include' })
        .then((response) => response.json())
        .then((result) => {
          if (!result.success || !result.data) {
            throw new Error(result.error || 'Unable to load report context.');
          }

          const context = result.data as ReportContextData;
          setReportScope(context.scope);
          if (context.filter_options) {
            setOverviewFilterOptions(context.filter_options);
            setAvailableYears(normalizeGraduationYears(context.filter_options.years || []));
          }
          applySurveyItems((context.surveys || []).map(normalizeSurveySummary), loadAnalytics);
        })
        .catch(() => {
          setSurveyItems([]);
          setSelectedSurveyId(null);
          setSurveyAnalytics(null);
          setReportError('Unable to load report data. Please try again.');
        })
        .finally(() => {
          setSurveyItemsLoaded(true);
          if (loadAnalytics) {
            setSurveyLoading(false);
          }
        });
      return;
    }

    Promise.all([
      fetch(`${API_BASE}/surveys/index.php?archive=active&limit=100`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${API_BASE}/surveys/index.php?archive=archived&limit=100`, { credentials: 'include' }).then((r) => r.json()),
    ])
      .then(([activeResult, archivedResult]) => {
        if (activeResult.success) {
          const surveys: SurveySummary[] = [
            ...(activeResult.data || []),
            ...(archivedResult.success ? archivedResult.data || [] : []),
          ].map(normalizeSurveySummary);
          applySurveyItems(surveys, loadAnalytics);
        } else {
          setSurveyItems([]);
          setSelectedSurveyId(null);
          setSurveyAnalytics(null);
        }
      })
      .catch(() => {
        setSurveyItems([]);
        setSelectedSurveyId(null);
        setSurveyAnalytics(null);
      })
      .finally(() => {
        setSurveyItemsLoaded(true);
        if (loadAnalytics) {
          setSurveyLoading(false);
        }
      });
  };

  const getSurveyDepartmentOption = (departmentValue: string) => (
    SURVEY_DEPARTMENT_OPTIONS.find((option) => option.value === departmentValue) ?? SURVEY_DEPARTMENT_OPTIONS[0]
  );

  const getSurveyProgramFilterParam = (departmentValue: string) => (
    getSurveyDepartmentOption(departmentValue).programCodes.join(',')
  );

  const fetchSurveyAnalytics = (
    surveyId: number,
    surveyDepartment: string = selectedSurveyDepartment,
    graduationYear: string = selectedYear,
  ) => {
    const cacheKey = getSurveyAnalyticsCacheKey(surveyId, surveyDepartment, isDean ? graduationYear : 'all');
    const cachedAnalytics = surveyAnalyticsCacheRef.current[cacheKey];

    surveyAnalyticsRequestKeyRef.current = cacheKey;

    if (cachedAnalytics) {
      setSurveyAnalytics(cachedAnalytics);
      setSurveyAnalyticsLoading(false);
      return;
    }

    setSurveyAnalyticsLoading(true);
    setSurveyAnalyticsError('');
    const params = new URLSearchParams({ survey_id: surveyId.toString() });
    if (isDean) {
      if (graduationYear !== 'all') {
        params.set('graduation_year', graduationYear);
      }
    } else {
      params.set('program', getSurveyProgramFilterParam(surveyDepartment));
    }

    fetch(`${API_BASE}/surveys/analytics.php?${params.toString()}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          surveyAnalyticsCacheRef.current[cacheKey] = res.data;
          if (surveyAnalyticsRequestKeyRef.current === cacheKey) {
            setSurveyAnalytics(res.data);
          }
        } else {
          if (surveyAnalyticsRequestKeyRef.current === cacheKey) {
            setSurveyAnalytics(null);
            setSurveyAnalyticsError(res.error || 'Unable to load survey analytics. Please try again.');
          }
        }
      })
      .catch(() => {
        if (surveyAnalyticsRequestKeyRef.current === cacheKey) {
          setSurveyAnalytics(null);
          setSurveyAnalyticsError('Unable to load survey analytics. Please try again.');
        }
      })
      .finally(() => {
        if (surveyAnalyticsRequestKeyRef.current === cacheKey) {
          setSurveyAnalyticsLoading(false);
        }
      });
  };

  const handleSelectedSurveyChange = (surveyId: number | null) => {
    inferentialRequestSeqRef.current += 1;
    setSelectedSurveyId(surveyId);
    setInferentialMetadata(null);
    setInferentialResult(null);
    setInferentialSettings({ ...DEFAULT_INFERENTIAL_SETTINGS });
    setInferentialError('');
    setInferentialMetadataLoading(false);
    setInferentialAnalysisLoading(false);
    if (!surveyId) {
      setSurveyAnalytics(null);
      setNoSurveySelectionExplicit(true);
      localStorage.setItem(SELECTED_SURVEY_STORAGE_KEY, NO_SURVEY_SELECTION_VALUE);
      return;
    }

    setNoSurveySelectionExplicit(false);
    localStorage.setItem(SELECTED_SURVEY_STORAGE_KEY, surveyId.toString());

    if (tab === 'surveys') {
      fetchSurveyAnalytics(surveyId, selectedSurveyDepartment, selectedYear);
    }
  };

  const fetchInferentialMetadata = async (surveyId: number) => {
    const requestId = ++inferentialRequestSeqRef.current;
    setInferentialMetadataLoading(true);
    setInferentialError('');

    try {
      const params = new URLSearchParams({ survey_id: surveyId.toString() });
      const response = await fetch(`${API_BASE}/reports/inferential-analysis.php?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Unable to load inferential analysis settings.');
      }
      if (requestId !== inferentialRequestSeqRef.current) return;

      const metadata = payload.data as InferentialMetadata;
      const availableKeys = metadata.variables.map((variable) => variable.key);
      const preferredVariable1 = availableKeys.includes('program') ? 'program' : availableKeys[0] || '';
      const preferredVariable2 = availableKeys.find((key) => key === 'employment_status' && key !== preferredVariable1)
        || availableKeys.find((key) => key !== preferredVariable1)
        || '';
      setInferentialMetadata(metadata);
      setInferentialSettings({
        variable1: preferredVariable1,
        variable2: preferredVariable2,
        graduationYear: 'all',
        programId: 'all',
      });
    } catch (error) {
      if (requestId !== inferentialRequestSeqRef.current) return;
      setInferentialMetadata(null);
      setInferentialError(error instanceof Error ? error.message : 'Unable to load inferential analysis settings.');
    } finally {
      if (requestId === inferentialRequestSeqRef.current) {
        setInferentialMetadataLoading(false);
      }
    }
  };

  const updateInferentialSetting = <K extends keyof InferentialSettings>(
    key: K,
    value: InferentialSettings[K],
  ) => {
    setInferentialSettings((current) => ({ ...current, [key]: value }));
    setInferentialResult(null);
    setInferentialError('');
  };

  const handleResetInferential = () => {
    const availableKeys = inferentialMetadata?.variables.map((variable) => variable.key) ?? [];
    const variable1 = availableKeys.includes('program') ? 'program' : availableKeys[0] || '';
    const variable2 = availableKeys.find((key) => key === 'employment_status' && key !== variable1)
      || availableKeys.find((key) => key !== variable1)
      || '';
    inferentialRequestSeqRef.current += 1;
    setInferentialSettings({ variable1, variable2, graduationYear: 'all', programId: 'all' });
    setInferentialResult(null);
    setInferentialError('');
    setInferentialAnalysisLoading(false);
  };

  const runInferentialAnalysis = async () => {
    if (!selectedSurveyId || inferentialAnalysisLoading) return;
    if (!inferentialSettings.variable1 || !inferentialSettings.variable2) {
      setInferentialError('Please select two categorical variables for inferential analysis.');
      return;
    }
    if (inferentialSettings.variable1 === inferentialSettings.variable2) {
      setInferentialError('Please select two different variables for inferential analysis.');
      return;
    }

    const requestId = ++inferentialRequestSeqRef.current;
    setInferentialAnalysisLoading(true);
    setInferentialResult(null);
    setInferentialError('');

    try {
      const response = await fetch(`${API_BASE}/reports/inferential-analysis.php`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surveyId: selectedSurveyId,
          variable1: inferentialSettings.variable1,
          variable2: inferentialSettings.variable2,
          filters: {
            graduationYear: inferentialSettings.graduationYear,
            programId: inferentialSettings.programId,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Unable to complete the inferential analysis.');
      }
      if (requestId !== inferentialRequestSeqRef.current) return;
      setInferentialResult(payload.data as InferentialAnalysisResult);
    } catch (error) {
      if (requestId !== inferentialRequestSeqRef.current) return;
      setInferentialError(error instanceof Error ? error.message : 'Unable to complete the inferential analysis.');
    } finally {
      if (requestId === inferentialRequestSeqRef.current) {
        setInferentialAnalysisLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchSurveyItems();
  }, [isDean]);

  const fetchOverviewFilterOptions = () => {
    fetch(buildReportUrl('overview_filter_options', 'all', 'all'), { credentials: 'include' })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          const years = normalizeGraduationYears(Array.isArray(res.data.years) ? res.data.years : []);
          const programs: OverviewFilterProgram[] = Array.isArray(res.data.programs)
            ? res.data.programs.map((program: OverviewFilterProgram) => ({
                id: Number(program.id),
                code: String(program.code),
                name: String(program.name || program.code),
              }))
            : [];
          setOverviewFilterOptions({
            years,
            programs,
          });
          if (isDean) {
            setAvailableYears(years);
          }
          if (programs.length > 0) {
            setAvailableDepartments(
              programs
                .filter((item) => item.code)
                .map((item) => ({ code: item.code, name: item.name || item.code }))
                .sort((a, b) => a.code.localeCompare(b.code)),
            );
          }
        } else {
          setOverviewFilterOptions({ years: [], programs: [] });
        }
      })
      .catch(() => setOverviewFilterOptions({ years: [], programs: [] }));
  };

  const fetchOverviewProgramData = async (filters: OverviewFilters): Promise<ProgramReport[]> => {
    const cacheKey = getReportCacheKey('by_program', 'all', 'all', filters);
    const cachedData = reportCacheRef.current[cacheKey];

    if (cachedData !== undefined) {
      return cachedData as ProgramReport[];
    }

    const response = await fetch(buildReportUrl('by_program', 'all', 'all', undefined, filters), {
      credentials: 'include',
    });
    const result = await response.json();
    const data = result.success && Array.isArray(result.data) ? (result.data as ProgramReport[]) : [];
    reportCacheRef.current[cacheKey] = data;
    return data;
  };

  const fetchOverviewBatchTrendData = async (filters: OverviewFilters): Promise<BatchTrendReport[]> => {
    const cacheKey = getReportCacheKey('by_batch_trends', 'all', 'all', filters);
    const cachedData = reportCacheRef.current[cacheKey];

    if (cachedData !== undefined) {
      return cachedData as BatchTrendReport[];
    }

    const response = await fetch(buildReportUrl('by_batch_trends', 'all', 'all', undefined, filters), {
      credentials: 'include',
    });
    const result = await response.json();
    if (!response.ok || !result.success || !Array.isArray(result.data)) {
      throw new Error(result.error || 'Failed to load batch trend analytics.');
    }

    const data = (result.data as BatchTrendReport[]).slice().sort(
      (a, b) => Number(a.year_graduated) - Number(b.year_graduated),
    );
    reportCacheRef.current[cacheKey] = data;
    return data;
  };

  const fetchOverviewReports = async (
    filters: OverviewFilters = overviewFilters,
    forceRefresh = false,
  ) => {
    if (!surveyItemsLoaded) {
      setLoading(true);
      return;
    }

    const overviewCacheKey = getReportCacheKey('overview', 'all', 'all', filters);
    const overviewProgramCacheKey = getReportCacheKey('by_program', 'all', 'all', filters);
    const overviewBatchTrendCacheKey = getReportCacheKey('by_batch_trends', 'all', 'all', filters);
    const overviewBundleCacheKey = getOverviewBundleCacheKey(filters);
    if (forceRefresh) {
      delete reportCacheRef.current[overviewCacheKey];
      delete reportCacheRef.current[overviewProgramCacheKey];
      delete reportCacheRef.current[overviewBatchTrendCacheKey];
    }
    const cachedOverview = reportCacheRef.current[overviewCacheKey] as Overview | undefined;
    const cachedOverviewPrograms = reportCacheRef.current[overviewProgramCacheKey] as ProgramReport[] | undefined;
    const cachedOverviewBatchTrends = reportCacheRef.current[overviewBatchTrendCacheKey] as BatchTrendReport[] | undefined;
    const hasCachedSecondaryData = isDean
      ? cachedOverviewBatchTrends !== undefined
      : cachedOverviewPrograms !== undefined;

    activeReportLoadKeyRef.current = overviewBundleCacheKey;

    if (cachedOverview !== undefined && hasCachedSecondaryData) {
      setOverview(cachedOverview);
      if (isDean) {
        setOverviewBatchTrends(cachedOverviewBatchTrends ?? []);
        setOverviewProgramData([]);
      } else {
        setOverviewProgramData(cachedOverviewPrograms ?? []);
        setOverviewBatchTrends([]);
      }
      setOverviewFilterError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setReportError('');
    setOverviewFilterError('');
    const requestId = ++overviewRequestSeqRef.current;

    try {
      const fetchOverviewData = async (): Promise<Overview> => {
        if (cachedOverview !== undefined) {
          return cachedOverview;
        }

        const overviewResponse = await fetch(buildReportUrl('overview', 'all', 'all', undefined, filters), { credentials: 'include' });
        const overviewResult = await overviewResponse.json();

        if (!overviewResult.success) {
          throw new Error(overviewResult.error || 'Failed to load overview report.');
        }

        reportCacheRef.current[overviewCacheKey] = overviewResult.data;
        return overviewResult.data as Overview;
      };

      const [overviewData, secondaryOverviewData] = await Promise.all([
        fetchOverviewData(),
        isDean ? fetchOverviewBatchTrendData(filters) : fetchOverviewProgramData(filters),
      ]);

      if (requestId !== overviewRequestSeqRef.current || activeReportLoadKeyRef.current !== overviewBundleCacheKey) {
        return;
      }

      setOverview(overviewData);
      if (isDean) {
        setOverviewBatchTrends(secondaryOverviewData as BatchTrendReport[]);
        setOverviewProgramData([]);
      } else {
        setOverviewProgramData(secondaryOverviewData as ProgramReport[]);
        setOverviewBatchTrends([]);
      }
    } catch (error) {
      if (requestId !== overviewRequestSeqRef.current || activeReportLoadKeyRef.current !== overviewBundleCacheKey) {
        return;
      }

      setOverview(null);
      setOverviewProgramData([]);
      setOverviewBatchTrends([]);
      setOverviewFilterError(error instanceof Error ? error.message : 'Failed to load overview report.');
      if (forceRefresh) setAiLoading(false);
    } finally {
      if (requestId === overviewRequestSeqRef.current && activeReportLoadKeyRef.current === overviewBundleCacheKey) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!surveyItemsLoaded) {
      return;
    }

    reportCacheRef.current = {};
    aiCacheRef.current = {};
    fetchOverviewFilterOptions();

    // Fetch year data first to populate the filter
    fetch(buildReportUrl('by_year', 'all', 'all'), { credentials: 'include' })
      .then((r) => r.json())
      .then((res) => {
        if (!isDean && res.success && res.data) {
          const years = normalizeGraduationYears(res.data.map((y: YearReport) => y.year_graduated));
          setAvailableYears(years);
        }
      })
      .catch(() => {});
  }, [selectedSurveyId, surveyItemsLoaded]);

  useEffect(() => {
    if (selectedYear !== 'all' && !availableYears.includes(selectedYear)) {
      setSelectedYear('all');
    }
  }, [availableYears, selectedYear]);

  useEffect(() => {
    const isAvailable = (year: string) => year === 'all' || overviewFilterOptions.years.includes(year);
    setOverviewFilterDraft((current) => isAvailable(current.graduationYear)
      ? current
      : { ...current, graduationYear: 'all' });
    setOverviewFilters((current) => isAvailable(current.graduationYear)
      ? current
      : { ...current, graduationYear: 'all' });
  }, [overviewFilterOptions.years]);

  useEffect(() => {
    if (!isDean) {
      return;
    }

    setOverviewFilterDraft((current) => (
      current.graduationYear === selectedYear ? current : { ...current, graduationYear: selectedYear }
    ));
    setOverviewFilters((current) => (
      current.graduationYear === selectedYear ? current : { ...current, graduationYear: selectedYear }
    ));
  }, [isDean, selectedYear]);

  useEffect(() => {
    if (!surveyItemsLoaded) {
      setLoading(true);
      return;
    }

    const typeMap: Record<string, string> = {
      overview: 'overview', program: 'by_program', year: 'by_year',
      employment: 'employment_status', salary: 'salary_distribution',
    };

    if (tab === 'surveys' || tab === 'inferential') {
      activeReportLoadKeyRef.current = tab;
      if (tab === 'inferential') setReportError('');
      setLoading(false);
      return;
    }

    if (tab === 'overview') {
      fetchOverviewReports(overviewFilters);
      return;
    }

    fetchReport(typeMap[tab], selectedYear, selectedDepartment);
  }, [tab, selectedYear, selectedDepartment, selectedSurveyId, overviewFilters, surveyItemsLoaded]);

  useEffect(() => {
    if (tab === 'surveys' && selectedSurveyId) {
      fetchSurveyAnalytics(selectedSurveyId, selectedSurveyDepartment, selectedYear);
    }
  }, [tab, selectedSurveyDepartment, selectedSurveyId, isDean, selectedYear]);

  useEffect(() => {
    if (tab !== 'inferential') return;
    setInferentialResult(null);
    setInferentialError('');
    if (selectedSurveyId) {
      fetchInferentialMetadata(selectedSurveyId);
    } else {
      setInferentialMetadata(null);
      setInferentialMetadataLoading(false);
    }
  }, [tab, selectedSurveyId, isDean]);

  useEffect(() => {
    setShowSurveyGraphs(false);
    setSelectedSurveyTable(ALL_SURVEY_TABLES_VALUE);
  }, [selectedSurveyId, selectedSurveyDepartment, isDean, selectedYear]);

  useEffect(() => {
    if (selectedSurveyTable === ALL_SURVEY_TABLES_VALUE) {
      return;
    }

    const tableIndex = Number(selectedSurveyTable);
    const tableCount = surveyAnalytics?.report_tables?.length ?? 0;
    if (!Number.isInteger(tableIndex) || tableIndex < 0 || tableIndex >= tableCount) {
      setSelectedSurveyTable(ALL_SURVEY_TABLES_VALUE);
    }
  }, [selectedSurveyTable, surveyAnalytics]);

  const handleSurveyTableChange = (value: string) => {
    setSelectedSurveyTable(value);

    if (!showSurveyGraphs || value === ALL_SURVEY_TABLES_VALUE) {
      return;
    }

    const table = surveyAnalytics?.report_tables?.[Number(value)];
    if (!table || buildSurveyReportCharts([table]).length === 0) {
      setShowSurveyGraphs(false);
    }
  };

  const updateOverviewFilterDraft = <K extends keyof OverviewFilters>(key: K, value: OverviewFilters[K]) => {
    setOverviewFilterDraft((current) => ({ ...current, [key]: value }));
  };

  const handleApplyOverviewFilters = () => {
    const nextFilters = { ...overviewFilterDraft };
    setOverviewFilterError('');

    if (areOverviewFiltersEqual(nextFilters, overviewFilters)) {
      if (tab === 'overview') {
        fetchOverviewReports(nextFilters);
      }
      return;
    }

    setOverviewFilters(nextFilters);
  };

  const handleResetOverviewFilters = () => {
    const resetFilters = {
      ...DEFAULT_OVERVIEW_FILTERS,
      graduationYear: isDean ? selectedYear : DEFAULT_OVERVIEW_FILTERS.graduationYear,
    };
    setOverviewFilterDraft(resetFilters);
    setOverviewFilterError('');

    if (areOverviewFiltersEqual(resetFilters, overviewFilters)) {
      if (tab === 'overview') {
        fetchOverviewReports(resetFilters);
      }
      return;
    }

    setOverviewFilters(resetFilters);
  };

  useEffect(() => {
    if (tab !== 'overview' || !overview) {
      return;
    }

    fetchAIAnalytics(
      'overview',
      {
        overview,
        by_program: overviewProgramData,
        by_batch_trends: overviewBatchTrends,
        scope: reportScope?.display_name || '',
        selected_batch: selectedYear === 'all' ? 'All Batches' : selectedYear,
        visible_cards: [
          'Total Graduate Responses',
          'Employed (Total)',
          'Employed (Local)',
          'Employed (Abroad)',
          'Aligned',
        ],
      },
      isDean ? selectedYear : 'all',
      'all',
    );
  }, [
    tab,
    overview,
    overviewProgramData,
    overviewBatchTrends,
    isDean,
    selectedYear,
    reportScope?.department_code,
    reportScope?.display_name,
  ]);

  const fetchAIAnalytics = (
    reportType: string,
    reportData: unknown,
    year: string = selectedYear,
    department: string = selectedDepartment,
    force = false,
  ) => {
    if (!selectedSurveyId) {
      setAiLoading(false);
      setAiAnalysis('Select a survey to generate AI-powered analytics.');
      setAiSummary('');
      setAiConclusion('');
      setAiSections(undefined);
      setAiSource('fallback');
      return;
    }

    const params = new URLSearchParams({ type: reportType });
    const reportYear = reportType === 'overview' && !isDean ? 'all' : year;
    const effectiveDepartment = isDean
      ? reportScope?.department_code || 'dean_scope'
      : reportType === 'overview' ? 'all' : department;
    const requestId = ++aiRequestSeqRef.current;
    const aiCacheKey = getAiCacheKey(reportType, reportYear, effectiveDepartment, reportData);
    const cachedAi = aiCacheRef.current[aiCacheKey];
    const localAnalytics = buildLocalDescriptiveAnalytics(reportType, reportData);
    const localOverviewSections = reportType === 'overview'
      ? buildStructuredOverviewAnalysis(
          (reportData as { overview?: Overview })?.overview ?? reportData as Overview,
          (reportData as { by_program?: ProgramReport[] })?.by_program ?? [],
        )
      : null;
    const localSections: AiAnalyticsCacheEntry['sections'] = localOverviewSections
      ? {
          employmentInterpretation: localOverviewSections.employmentInterpretation,
          programAnalysis: localOverviewSections.programAnalysis,
          alignmentAnalysis: localOverviewSections.alignmentAnalysis,
          summary: localOverviewSections.summary,
          dataNotes: localOverviewSections.dataNotes,
        }
      : undefined;

    const applyLocalAnalytics = () => {
      setAiAnalysis(localAnalytics.analysis);
      setAiSummary(localAnalytics.summary);
      setAiConclusion(localAnalytics.conclusion);
      setAiSections(localSections);
      setAiSource('fallback');
    };

    if (force) {
      delete aiCacheRef.current[aiCacheKey];
      delete aiRequestCacheRef.current[aiCacheKey];
    } else if (cachedAi) {
      setAiAnalysis(cachedAi.analysis);
      setAiSummary(cachedAi.summary);
      setAiConclusion(cachedAi.conclusion);
      setAiSections(cachedAi.sections);
      setAiSource(cachedAi.source ?? 'fallback');
      setAiLoading(false);
      return;
    }

    setAiLoading(true);
    if (reportYear !== 'all') {
      params.set('year', reportYear);
    }
    if (effectiveDepartment !== 'all') {
      params.set('department', effectiveDepartment);
    }
    params.set('survey_id', selectedSurveyId.toString());

    let analyticsRequest = aiRequestCacheRef.current[aiCacheKey];
    if (!analyticsRequest) {
      analyticsRequest = fetch(`${API_BASE}/reports/ai-analytics.php?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          report_data: reportData,
          selected_survey_id: selectedSurveyId,
          selected_year: reportYear,
          selected_department: effectiveDepartment,
        }),
      })
        .then(async (response) => {
          const result = await response.json().catch(() => null);
          if (!response.ok || !result?.success) {
            throw new Error(result?.error || `Analytics request failed with status ${response.status}.`);
          }
          if (!result.data || !(result.data.ai_analysis || result.data.ai_summary || result.data.ai_conclusion)) {
            throw new Error('The analytics response did not contain descriptive content.');
          }

          if (result.data.ai_error || !result.data.ai_model) {
            throw new Error('The AI provider response was unavailable or did not pass validation.');
          }

          const providerSections = result.data.ai_sections && typeof result.data.ai_sections === 'object'
            ? result.data.ai_sections as Record<string, unknown>
            : {};
          const validSection = (value: unknown, fallback: string): string => {
            if (typeof value !== 'string') return fallback;
            const text = normalizeReportText(value);
            const wordCount = text.split(/\s+/).filter(Boolean).length;
            if (
              wordCount < 20
              || /\b(?:NaN|Infinity|undefined|null|statistically significant|caused?|proves?)\b/i.test(text)
              || hasUnsupportedNumericClaim(text, reportData)
            ) {
              return fallback;
            }
            return text;
          };
          const providerDataNotes = Array.isArray(providerSections.data_notes)
            ? providerSections.data_notes
                .filter((note): note is string => typeof note === 'string' && note.trim() !== '')
                .map((note) => normalizeReportText(note))
                .filter((note) => !hasUnsupportedNumericClaim(note, reportData))
            : typeof providerSections.data_notes === 'string'
              ? normalizeReportText(providerSections.data_notes)
                  .split(/\n+/)
                  .map((note) => note.trim())
                  .filter((note) => note !== '' && !hasUnsupportedNumericClaim(note, reportData))
              : localSections?.dataNotes ?? [];

          return {
            analysis: validSection(result.data.ai_analysis, localAnalytics.analysis),
            summary: validSection(result.data.ai_summary, localAnalytics.summary),
            conclusion: validSection(result.data.ai_conclusion, localAnalytics.conclusion),
            sections: reportType === 'overview'
              ? {
                  employmentInterpretation: validSection(providerSections.employment_interpretation, localSections?.employmentInterpretation ?? ''),
                  programAnalysis: validSection(providerSections.program_level_analysis, localSections?.programAnalysis ?? ''),
                  alignmentAnalysis: validSection(providerSections.course_alignment_analysis, localSections?.alignmentAnalysis ?? ''),
                  summary: validSection(providerSections.summary, localSections?.summary ?? localAnalytics.summary),
                  dataNotes: providerDataNotes.length > 0 ? providerDataNotes : localSections?.dataNotes,
                }
              : {
                  summary: validSection(providerSections.summary, localAnalytics.conclusion),
                  dataNotes: providerDataNotes,
                },
            source: 'groq' as const,
          };
        });
      aiRequestCacheRef.current[aiCacheKey] = analyticsRequest;
      const clearRequest = () => {
        if (aiRequestCacheRef.current[aiCacheKey] === analyticsRequest) {
          delete aiRequestCacheRef.current[aiCacheKey];
        }
      };
      analyticsRequest.then(clearRequest, clearRequest);
    }

    analyticsRequest
      .then((nextAi) => {
        aiCacheRef.current[aiCacheKey] = nextAi;
        if (requestId !== aiRequestSeqRef.current) {
          return;
        }

        setAiAnalysis(nextAi.analysis);
        setAiSummary(nextAi.summary);
        setAiConclusion(nextAi.conclusion);
        setAiSections(nextAi.sections);
        setAiSource(nextAi.source ?? 'fallback');
      })
      .catch((error) => {
        if (requestId !== aiRequestSeqRef.current) {
          return;
        }
        console.warn('Using local descriptive analytics fallback:', error);
        applyLocalAnalytics();
      })
      .finally(() => {
        if (requestId === aiRequestSeqRef.current) {
          setAiLoading(false);
        }
      });
  };

  const handleRegenerateAiAnalytics = () => {
    const reportType = tab === 'program'
      ? 'by_program'
      : tab === 'year'
        ? 'by_year'
        : tab === 'employment'
          ? 'employment_status'
          : tab === 'salary'
            ? 'salary_distribution'
            : 'overview';
    aiCacheRef.current = {};
    aiRequestCacheRef.current = {};
    setAiLoading(true);
    if (reportType === 'overview') {
      void fetchOverviewReports(overviewFilters, true);
      return;
    }
    fetchReport(reportType, selectedYear, selectedDepartment, true);
  };

  const getSelectedSurveyDepartmentLabel = () => getSurveyDepartmentOption(selectedSurveyDepartment).label;
  const getReportScopeLabel = () => (
    isDean && reportScope?.display_name
      ? reportScope.display_name
      : getSelectedSurveyDepartmentLabel()
  );
  const getBatchLabel = () => (
    !isDean && tab === 'surveys'
      ? 'All Batches'
      : selectedYear === 'all' ? 'All Batches' : selectedYear
  );

  const handleSurveyExcelExport = async () => {
    if (!surveyAnalytics) {
      return;
    }

    const generatedAt = new Date();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GradTrack';
    workbook.created = generatedAt;

    addSurveyExportSummarySheet(
      workbook,
      surveyAnalytics,
      getReportScopeLabel(),
      getBatchLabel(),
      generatedAt,
    );

    if (surveyAnalytics.report_tables && surveyAnalytics.report_tables.length > 0) {
      surveyAnalytics.report_tables.forEach((table, index) => {
        addSurveyReportTableWorksheet(workbook, table, index);
      });
    } else {
      addSurveyQuestionExportWorksheet(workbook, surveyAnalytics);
    }

    const fileDate = generatedAt.toISOString().slice(0, 10);
    const programSuffix = `_${toFileSafePart(isDean ? reportScope?.department_code || 'dean_scope' : selectedSurveyDepartment)}`;
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `gradtrack_survey_analytics${programSuffix}_${fileDate}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleSurveyPdfExport = async () => {
    if (!surveyAnalytics) {
      return;
    }

    const generatedAt = new Date();
    const pdf = new jsPDF('l', 'pt', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginLeft = 36;
    const departmentLabel = getReportScopeLabel();

    const drawSurveyPdfHeader = (title: string, subtitle?: string) => {
      pdf.setFillColor(27, 42, 74);
      pdf.rect(0, 0, pageWidth, 58, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(15);
      pdf.text(title, marginLeft, 26);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(subtitle || surveyAnalytics.survey_title, marginLeft, 42);
      pdf.setTextColor(45, 45, 45);
    };

    drawSurveyPdfHeader('Survey Analytics Report');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text(surveyAnalytics.survey_title, marginLeft, 88);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(`Generated: ${generatedAt.toLocaleString()}`, marginLeft, 106);
    pdf.text(`${isDean ? 'Program Scope' : 'Department'}: ${departmentLabel}`, marginLeft, 120);
    pdf.text(`Batch: ${getBatchLabel()}`, marginLeft, 134);

    autoTable(pdf, {
      startY: 158,
      head: [['Metric', 'Value']],
      body: [
        ['Total Responses', surveyAnalytics.total_responses],
        ['Response Rate', formatNullableRate(surveyAnalytics.response_rate)],
        ['Completion Rate', formatNullableRate(surveyAnalytics.completion_rate)],
        ['Questions', surveyAnalytics.questions_analytics.length],
      ],
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [27, 42, 74] },
      margin: { left: marginLeft, right: marginLeft },
    });

    if (surveyAnalytics.report_tables && surveyAnalytics.report_tables.length > 0) {
      surveyAnalytics.report_tables.forEach((table) => {
        pdf.addPage();
        const tableTitle = `Table ${table.number}. ${table.title}`;
        drawSurveyPdfHeader(table.section_title || 'Survey Analytics', tableTitle);

        autoTable(pdf, {
          startY: 88,
          head: buildSurveyPdfReportTableHead(table),
          body: buildSurveyPdfReportTableBody(table),
          theme: 'grid',
          styles: {
            font: 'times',
            fontSize: 8,
            cellPadding: 3,
            lineColor: [0, 0, 0],
            lineWidth: 0.2,
            textColor: [0, 0, 0],
          },
          headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            halign: 'center',
          },
          margin: { top: 88, left: marginLeft, right: marginLeft, bottom: 30 },
          didDrawPage: () => {
            drawSurveyPdfHeader(table.section_title || 'Survey Analytics', tableTitle);
          },
        });

        if (table.note) {
          const finalY = ((pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 88) + 14;
          if (finalY < pageHeight - 30) {
            pdf.setFont('times', 'italic');
            pdf.setFontSize(8);
            pdf.text(table.note, marginLeft, finalY);
          }
        }
      });
    } else {
      pdf.addPage();
      drawSurveyPdfHeader('Survey Question Report', surveyAnalytics.survey_title);

      autoTable(pdf, {
        startY: 88,
        head: [['Section', 'No.', 'Survey Question', 'Type', 'Answer / Option', 'Frequency', 'Percentage']],
        body: buildSurveyQuestionPdfRows(surveyAnalytics),
        styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
        headStyles: { fillColor: [27, 42, 74] },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 38, halign: 'center' },
          2: { cellWidth: 230 },
          3: { cellWidth: 86 },
          4: { cellWidth: 170 },
          5: { cellWidth: 62, halign: 'right' },
          6: { cellWidth: 64, halign: 'right' },
        },
        margin: { top: 88, left: marginLeft, right: marginLeft, bottom: 30 },
        didDrawPage: () => {
          drawSurveyPdfHeader('Survey Question Report', surveyAnalytics.survey_title);
        },
      });
    }

    const pageCount = (pdf as jsPDF & { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page);
      pdf.setFontSize(8);
      pdf.setTextColor(110, 110, 110);
      pdf.text(`Page ${page} of ${pageCount}`, pageWidth - 88, pageHeight - 16);
      pdf.text('GradTrack - Survey Analytics Export', marginLeft, pageHeight - 16);
    }

    const fileDate = generatedAt.toISOString().slice(0, 10);
    const programSuffix = `_${toFileSafePart(isDean ? reportScope?.department_code || 'dean_scope' : selectedSurveyDepartment)}`;
    pdf.save(`gradtrack_survey_analytics${programSuffix}_${fileDate}.pdf`);
  };

  const getOverviewProgramFilterLabel = (programId: string = overviewFilters.programId) => {
    if (programId === 'all') {
      return isDean && reportScope?.display_name ? reportScope.display_name : 'All Courses';
    }

    const program = overviewFilterOptions.programs.find((item) => item.id.toString() === programId);
    return program ? `${program.code} - ${program.name}` : `Program ID ${programId}`;
  };

  const getOverviewFilterLabels = (filters: OverviewFilters = overviewFilters) => ({
    employmentStatus: filters.employmentStatus === 'all'
      ? 'All'
      : filters.employmentStatus === 'employed'
      ? 'Employed'
      : 'Unemployed',
    programAlignment: filters.programAlignment === 'all'
      ? 'All'
      : filters.programAlignment === 'aligned'
      ? 'Aligned'
      : 'Not Aligned',
    graduationYear: filters.graduationYear === 'all' ? 'All Years' : filters.graduationYear,
    course: getOverviewProgramFilterLabel(filters.programId),
  });

  const getOverviewActiveFilterChips = () => {
    const labels = getOverviewFilterLabels();
    return [
      overviewFilters.employmentStatus !== 'all' ? `Employability Status: ${labels.employmentStatus}` : null,
      overviewFilters.programAlignment !== 'all' ? `Program Alignment: ${labels.programAlignment}` : null,
      !isDean && overviewFilters.graduationYear !== 'all' ? `Year Graduated: ${labels.graduationYear}` : null,
      !isDean && overviewFilters.programId !== 'all' ? `Course: ${labels.course}` : null,
    ].filter((chip): chip is string => Boolean(chip));
  };

  const buildFormalReportFileBaseName = (
    generatedAt: Date,
    reportDepartment: string,
    batchLabel: string,
    filters: OverviewFilters,
  ) => {
    const localDate = [
      generatedAt.getFullYear(),
      String(generatedAt.getMonth() + 1).padStart(2, '0'),
      String(generatedAt.getDate()).padStart(2, '0'),
    ].join('-');
    const scopePart = isDean
      ? toFileSafePart(reportScope?.department_code || 'dean_scope')
      : reportDepartment === 'all'
        ? 'all_departments'
        : toFileSafePart(reportDepartment);
    const yearPart = batchLabel === 'All Years' || batchLabel === 'All Batches'
      ? 'all_years'
      : toFileSafePart(batchLabel);
    const optionalParts = [
      filters.programId !== 'all'
        ? toFileSafePart(overviewFilterOptions.programs.find((program) => String(program.id) === filters.programId)?.code || 'selected_program')
        : null,
      filters.employmentStatus !== 'all' ? filters.employmentStatus : null,
      filters.programAlignment !== 'all' ? filters.programAlignment : null,
    ].filter((part): part is string => Boolean(part));

    return [
      'gradtrack_graduate_tracer_report',
      scopePart,
      yearPart,
      ...optionalParts,
      localDate,
    ].join('_').slice(0, 150);
  };

  const loadFormalReportExportData = async (auditAction: 'export_pdf' | 'export_word' | 'export_excel'): Promise<FormalReportExportData> => {
    const generatedAt = new Date();
    const reportDepartment = tab === 'overview' ? 'all' : selectedDepartment;
    const filters = { ...overviewFilters };
    const filterLabels = getOverviewFilterLabels(filters);
    const batchLabel = tab === 'overview'
      ? (isDean ? getBatchLabel() : filterLabels.graduationYear)
      : getBatchLabel();
    const departmentLabel = isDean
      ? getReportScopeLabel()
      : reportDepartment === 'all' ? 'All Departments' : reportDepartment;
    const exportYear = tab === 'overview' ? 'all' : selectedYear;

    const fetchSection = async <T,>(type: string): Promise<T> => {
      const response = await fetch(
        buildReportUrl(type, exportYear, reportDepartment, auditAction, filters, true),
        { credentials: 'include' },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || `Unable to load ${type.replace(/_/g, ' ')} report data.`);
      }
      return result.data as T;
    };

    const [overviewExport, programs, years, statuses, salaryRows] = await Promise.all([
      fetchSection<Overview>('overview'),
      fetchSection<ProgramReport[]>('by_program'),
      fetchSection<YearReport[]>('by_year'),
      fetchSection<StatusData[]>('employment_status'),
      fetchSection<SalaryData[]>('salary_distribution'),
    ]);
    const salaries = (Array.isArray(salaryRows) ? salaryRows : []).map((row) => ({
      ...row,
      salary_range: normalizeSalaryLabel(row.salary_range),
    }));
    const snapshot: DescriptiveAnalyticsSnapshot = {
      overview: overviewExport ?? null,
      programPerformance: Array.isArray(programs) ? programs : [],
      yearlyTrend: Array.isArray(years) ? years : [],
      employmentStatus: Array.isArray(statuses) ? statuses : [],
      salaryDistribution: salaries,
    };

    return {
      generatedAt,
      reportDepartment,
      departmentLabel,
      batchLabel,
      filterLabels,
      overview: overviewExport ?? null,
      programs: snapshot.programPerformance as ProgramReport[],
      years: snapshot.yearlyTrend as YearReport[],
      statuses: snapshot.employmentStatus as StatusData[],
      salaries: snapshot.salaryDistribution as SalaryData[],
      snapshot,
      charts: buildReportChartDefinitions(snapshot),
      fileBaseName: buildFormalReportFileBaseName(generatedAt, reportDepartment, batchLabel, filters),
    };
  };

  const resolveFormalReportInterpretations = async (data: FormalReportExportData): Promise<PdfInterpretations> => {
    const fallbackInterpretations = buildPdfInterpretations(data.snapshot);
    const interpretationCacheKey = analyticsFingerprint({
      surveyId: selectedSurveyId,
      department: data.reportDepartment,
      batch: data.batchLabel,
      filters: overviewFilters,
      snapshot: data.snapshot,
    });
    const cached = pdfInterpretationCacheRef.current[interpretationCacheKey];
    if (cached) return cached;

    let interpretations = fallbackInterpretations;
    const params = new URLSearchParams({ type: 'formal_report' });
    if (selectedSurveyId) params.set('survey_id', selectedSurveyId.toString());
    if (data.batchLabel !== 'All Years' && data.batchLabel !== 'All Batches') params.set('year', data.batchLabel);
    if (data.reportDepartment !== 'all') params.set('department', data.reportDepartment);
    appendOverviewFilterParams(params, overviewFilters);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${API_BASE}/reports/ai-analytics.php?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          report_data: data.snapshot,
          filters: {
            department: data.departmentLabel,
            batch: data.batchLabel,
            survey: selectedSurvey?.title || 'No survey selected',
            employmentStatus: data.filterLabels.employmentStatus,
            programAlignment: data.filterLabels.programAlignment,
            program: data.filterLabels.course,
          },
        }),
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.success && result.data?.ai_model && !result.data?.ai_error) {
        interpretations = mergeValidatedPdfInterpretations(
          result.data.pdf_interpretations,
          fallbackInterpretations,
          data.snapshot,
        );
      }
    } catch (error) {
      console.warn('Using verified local report interpretations:', error);
    } finally {
      window.clearTimeout(timeoutId);
    }

    const normalized = (Object.keys(interpretations) as Array<keyof PdfInterpretations>)
      .reduce<PdfInterpretations>((result, key) => {
        result[key] = normalizeReportText(interpretations[key]);
        return result;
      }, { ...interpretations });
    pdfInterpretationCacheRef.current[interpretationCacheKey] = normalized;
    return normalized;
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  const addInferentialWorksheetHeader = (sheet: ExcelJS.Worksheet, title: string, columns = 2) => {
    const titleRow = sheet.addRow([title]);
    titleRow.font = { bold: true, size: 14, color: { argb: SURVEY_REPORT_HEADER_COLOR } };
    if (columns > 1) sheet.mergeCells(titleRow.number, 1, titleRow.number, columns);
    sheet.addRow([]);
  };

  const styleInferentialTableHeader = (row: ExcelJS.Row) => {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SURVEY_REPORT_HEADER_COLOR } };
    row.alignment = { vertical: 'middle', horizontal: 'center' };
  };

  const handleInferentialExcelExport = async () => {
    if (!inferentialResult) return;
    const { analysis, contingencyTable, assumptions } = inferentialResult;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GradTrack';
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet('Analysis Summary');
    addInferentialWorksheetHeader(summarySheet, 'GradTrack Inferential Analysis', 2);
    [
      ['Survey', inferentialResult.survey.title],
      ['Generated At', new Date().toLocaleString()],
      ['Variable 1', analysis.variable1.label],
      ['Variable 2', analysis.variable2.label],
      ['Year Graduated Filter', inferentialResult.filters.graduationYear || 'All Years'],
      ['Course or Program Filter', inferentialResult.filters.programLabel || 'All Courses'],
      ['Valid Responses Used', analysis.validResponses],
      ['Excluded / Missing Responses', analysis.excludedResponses],
      ['Decision', analysis.decision],
      ['Interpretation', inferentialResult.interpretation || inferentialResult.message || 'Not calculated'],
    ].forEach((row) => summarySheet.addRow(row));
    summarySheet.getColumn(1).width = 30;
    summarySheet.getColumn(2).width = 100;
    summarySheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
    for (let index = 3; index <= summarySheet.rowCount; index += 1) {
      summarySheet.getRow(index).getCell(1).font = { bold: true };
    }

    const observedSheet = workbook.addWorksheet('Observed Frequencies');
    addInferentialWorksheetHeader(observedSheet, 'Observed Frequencies', contingencyTable.columns.length + 2);
    const observedHeader = observedSheet.addRow([
      analysis.variable1.label,
      ...contingencyTable.columns.map((column) => column.label),
      'Total',
    ]);
    styleInferentialTableHeader(observedHeader);
    contingencyTable.rows.forEach((row) => observedSheet.addRow([row.label, ...row.frequencies, row.total]));
    const observedTotalRow = observedSheet.addRow(['Total', ...contingencyTable.columnTotals, contingencyTable.grandTotal]);
    observedTotalRow.font = { bold: true };
    observedSheet.columns.forEach((column, index) => { column.width = index === 0 ? 28 : 16; });
    observedSheet.views = [{ state: 'frozen', ySplit: 3 }];

    const resultsSheet = workbook.addWorksheet('Statistical Results');
    addInferentialWorksheetHeader(resultsSheet, 'Chi-Square Test Result', 2);
    [
      ['Statistical Test', analysis.test],
      ['Variables', `${analysis.variable1.label} × ${analysis.variable2.label}`],
      ['Chi-Square', analysis.chiSquare ?? 'Not calculated'],
      ['Degrees of Freedom (df)', analysis.degreesOfFreedom ?? 'Not calculated'],
      ['p-value', analysis.pValue ?? 'Not calculated'],
      ['Significance Level (alpha)', analysis.alpha],
      ["Cramer's V", analysis.cramersV ?? 'Not calculated'],
      ['Association Strength', analysis.associationStrength ?? 'Not calculated'],
      ['Decision', analysis.decision],
      ['Valid Responses Used', analysis.validResponses],
      ['Excluded / Missing Responses', analysis.excludedResponses],
      ['Assumptions Passed', assumptions.passed ? 'Yes' : 'No'],
      ['Expected Cells Below 1', assumptions.cellsBelowOne],
      ['Expected Cells Below 5', assumptions.cellsBelowFive],
      ['Percent of Expected Cells Below 5', assumptions.percentageBelowFive],
      ['Minimum Expected Frequency', assumptions.minimumExpected ?? 'Not calculated'],
      ['Assumption Warnings', assumptions.warnings.join(' ') || 'None'],
    ].forEach((row) => resultsSheet.addRow(row));
    resultsSheet.getColumn(1).width = 38;
    resultsSheet.getColumn(2).width = 84;
    resultsSheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
    for (let index = 3; index <= resultsSheet.rowCount; index += 1) {
      resultsSheet.getRow(index).getCell(1).font = { bold: true };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `gradtrack_inferential_analysis_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleInferentialPdfExport = async () => {
    if (!inferentialResult) return;
    const { analysis, contingencyTable, assumptions } = inferentialResult;
    const pdf = new jsPDF('p', 'pt', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 40;
    const drawHeader = (title: string) => {
      pdf.setFillColor(27, 42, 74);
      pdf.rect(0, 0, pageWidth, 82, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(18);
      pdf.text(title, margin, 46);
      pdf.setFontSize(10);
      pdf.text('Norzagaray College | GradTrack Reports & Analytics', margin, 66);
      pdf.setTextColor(30, 30, 30);
    };

    drawHeader('Inferential Analysis Report');
    pdf.setFontSize(10);
    const summaryRows = [
      ['Survey', inferentialResult.survey.title],
      ['Variables', `${analysis.variable1.label} x ${analysis.variable2.label}`],
      ['Year Graduated', inferentialResult.filters.graduationYear || 'All Years'],
      ['Course or Program', inferentialResult.filters.programLabel || 'All Courses'],
      ['Valid Responses', analysis.validResponses],
      ['Excluded / Missing', analysis.excludedResponses],
    ];
    autoTable(pdf, {
      startY: 105,
      head: [['Analysis Setting', 'Value']],
      body: summaryRows,
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [27, 42, 74] },
      margin: { left: margin, right: margin },
    });

    if (analysis.canCalculate && inferentialResult.chartData.categories.length > 0) {
      const chart = buildLabeledBarChart(
        'inferential-analysis-pdf',
        'overview',
        `${analysis.variable2.label} by ${analysis.variable1.label}`,
        inferentialResult.chartData.categories.map((row) => String(row.category)),
        inferentialResult.chartData.series.map((series, index) => ({
          label: series.label,
          color: SURVEY_CHART_COLORS[index % SURVEY_CHART_COLORS.length],
          values: inferentialResult.chartData.categories.map((row) => safeCount(row[series.key])),
        })),
        { rotateLabels: true },
      );
      try {
        if (chart) {
          const chartBase64 = `data:image/png;base64,${arrayBufferToBase64(
            await renderReportChart(chart, { devicePixelRatio: 2 }),
          )}`;
          pdf.addPage();
          drawHeader('Distribution Comparison');
          pdf.addImage(chartBase64, 'PNG', margin, 110, pageWidth - margin * 2, 230);
        }
      } catch {
        // Chart capture is best-effort; the complete numeric analysis remains in the export.
      }
    }

    pdf.addPage();
    drawHeader('Observed Frequencies');
    autoTable(pdf, {
      startY: 105,
      head: [[analysis.variable1.label, ...contingencyTable.columns.map((column) => column.label), 'Total']],
      body: [
        ...contingencyTable.rows.map((row) => [row.label, ...row.frequencies, row.total]),
        ['Total', ...contingencyTable.columnTotals, contingencyTable.grandTotal],
      ],
      styles: { fontSize: 8, cellPadding: 4, halign: 'center' },
      headStyles: { fillColor: [27, 42, 74] },
      columnStyles: { 0: { halign: 'left' } },
      margin: { left: margin, right: margin },
    });

    pdf.addPage();
    drawHeader('Chi-Square Test Result');
    autoTable(pdf, {
      startY: 105,
      head: [['Statistical Detail', 'Result']],
      body: [
        ['Statistical Test', analysis.test],
        ['Variables', `${analysis.variable1.label} x ${analysis.variable2.label}`],
        ['Chi-Square', formatInferentialStatistic(analysis.chiSquare)],
        ['Degrees of Freedom (df)', analysis.degreesOfFreedom ?? 'Not calculated'],
        ['p-value', formatInferentialPValue(analysis.pValue)],
        ['Significance Level (alpha)', analysis.alpha.toFixed(2)],
        ["Cramer's V", formatInferentialStatistic(analysis.cramersV)],
        ['Association Strength', analysis.associationStrength ?? 'Not calculated'],
        ['Decision', analysis.decision],
        ['Minimum Expected Frequency', formatInferentialStatistic(assumptions.minimumExpected)],
      ],
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [27, 42, 74] },
      margin: { left: margin, right: margin },
    });
    const tableEndY = (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 360;
    let textY = tableEndY + 28;
    pdf.setFontSize(12);
    pdf.setTextColor(27, 42, 74);
    pdf.text('Statistical Interpretation', margin, textY);
    textY += 18;
    pdf.setFontSize(9);
    pdf.setTextColor(35, 35, 35);
    const interpretation = inferentialResult.interpretation || inferentialResult.message || 'The test could not be calculated.';
    const interpretationLines = pdf.splitTextToSize(interpretation, pageWidth - margin * 2);
    pdf.text(interpretationLines, margin, textY);
    textY += interpretationLines.length * 11 + 18;
    if (assumptions.warnings.length > 0) {
      pdf.setFontSize(11);
      pdf.setTextColor(146, 64, 14);
      pdf.text('Statistical Assumption Notice', margin, textY);
      textY += 16;
      pdf.setFontSize(9);
      const warningLines = pdf.splitTextToSize(assumptions.warnings.join(' '), pageWidth - margin * 2);
      pdf.text(warningLines, margin, textY);
    }

    const pageCount = (pdf as jsPDF & { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page);
      pdf.setFontSize(8);
      pdf.setTextColor(110, 110, 110);
      pdf.text(`Page ${page} of ${pageCount}`, pageWidth - 90, pageHeight - 16);
      pdf.text('GradTrack - Confidential Inferential Analysis', margin, pageHeight - 16);
    }
    pdf.save(`gradtrack_inferential_analysis_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const runExcelExport = async () => {
    if (tab === 'surveys') {
      await handleSurveyExcelExport();
      return;
    }
    if (tab === 'inferential') {
      await handleInferentialExcelExport();
      return;
    }

    const reportData = await loadFormalReportExportData('export_excel');
    const {
      overview: overviewExport,
      programs: programExport,
      years: yearExport,
      statuses: statusExport,
      salaries: salaryExport,
    } = reportData;

    const overviewRows: ExcelRow[] = overviewExport
      ? [
          { Metric: 'Total Graduates', Value: overviewExport.total_graduates },
          { Metric: 'Total Employed', Value: overviewExport.total_employed },
          { Metric: 'Employed (Local)', Value: overviewExport.total_employed_local },
          { Metric: 'Employed (Abroad)', Value: overviewExport.total_employed_abroad },
          { Metric: 'Total Aligned', Value: overviewExport.total_aligned },
          { Metric: 'Survey Responses', Value: overviewExport.total_survey_responses },
          { Metric: 'Employment Rate (%)', Value: overviewExport.employment_rate ?? 'No data' },
          { Metric: 'Alignment Rate (%)', Value: overviewExport.alignment_rate ?? 'No data' },
        ]
      : [];

    const programRows: ExcelRow[] = programExport.map((item) => ({
      'Program Code': item.code,
      'Program Name': item.name,
      'Total Graduates': item.total_graduates,
      Employed: item.employed,
      'Not Employed': getNotEmployedCount(item),
      Aligned: item.aligned,
      'Not Aligned': item.not_aligned,
      'Employment Rate (%)': item.employment_rate ?? 'No data',
      'Alignment Rate (%)': item.alignment_rate ?? 'No data',
    }));

    const yearRows: ExcelRow[] = yearExport.map((item) => ({
      'Year Graduated': item.year_graduated,
      'Total Graduates': item.total_graduates,
      Employed: item.employed,
      'Not Employed': getNotEmployedCount(item),
      Aligned: item.aligned,
      'Employment Rate (%)': item.employment_rate ?? 'No data',
      'Alignment Rate (%)': item.alignment_rate ?? 'No data',
    }));

    const statusRows: ExcelRow[] = statusExport.map((item) => ({
      'Employment Status': item.employment_status,
      Count: item.count,
    }));

    const salaryRows: ExcelRow[] = salaryExport.map((item) => ({
      'Salary Range': item.salary_range,
      Count: item.count,
    }));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GradTrack';
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.addRow(['GradTrack Report Export']);
    summarySheet.addRow(['Generated At', reportData.generatedAt.toLocaleString()]);
    summarySheet.addRow(['Survey', selectedSurvey?.title || 'No survey selected']);
    summarySheet.addRow(['Batch / Year Graduated', reportData.batchLabel]);
    summarySheet.addRow([isDean ? 'Program Scope' : 'Department Filter', reportData.departmentLabel]);
    const labels = reportData.filterLabels;
    summarySheet.addRow(['Employability Status', labels.employmentStatus]);
    summarySheet.addRow(['Program Alignment', labels.programAlignment]);
    summarySheet.addRow(['Year Graduated', labels.graduationYear]);
    summarySheet.addRow(['Course', labels.course]);
    summarySheet.addRow(['Export Triggered From Tab', tab]);
    summarySheet.addRow([]);
    summarySheet.getRow(1).font = { bold: true, size: 14 };

    const addSheetFromRows = (sheetName: string, rows: ExcelRow[]) => {
      const sheet = workbook.addWorksheet(sheetName);

      if (!rows.length) {
        sheet.addRow(['No data available for this section.']);
        sheet.columns = [{ width: 42 }];
        return;
      }

      const columns = Object.keys(rows[0]);
      sheet.columns = columns.map((column) => ({
        header: column,
        key: column,
        width: Math.max(16, Math.min(42, column.length + 6)),
      }));

      rows.forEach((row) => sheet.addRow(row));

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1B2A4A' },
      };

      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = {
        from: 'A1',
        to: `${String.fromCharCode(64 + columns.length)}1`,
      };
    };

    addSheetFromRows('Overview', overviewRows);
    addSheetFromRows('By Program', programRows);
    addSheetFromRows('By Year', yearRows);
    addSheetFromRows('Employment Status', statusRows);
    addSheetFromRows('Salary Distribution', salaryRows);

    const chartsSheet = workbook.addWorksheet('Charts');
    chartsSheet.addRow(['Report Graphs']);
    chartsSheet.getRow(1).font = { bold: true, size: 14 };

    let nextChartTopRow = 3;

    const addChartImage = async (chart: ReportChartDefinition) => {
      chartsSheet.getCell(`A${nextChartTopRow}`).value = chart.title;
      chartsSheet.getCell(`A${nextChartTopRow}`).font = { bold: true, size: 12 };
      nextChartTopRow += 1;
      const imageBuffer = await renderReportChart(chart, { devicePixelRatio: 2 });
      const imageBase64 = `data:image/png;base64,${arrayBufferToBase64(imageBuffer)}`;
      const imageId = workbook.addImage({ base64: imageBase64, extension: 'png' });
      const width = 900;
      const height = Math.round(width * (chart.height / chart.width));

      chartsSheet.addImage(imageId, {
        tl: { col: 0, row: nextChartTopRow - 1 },
        ext: { width, height },
      });
      nextChartTopRow += Math.ceil(height / 20) + 2;
    };

    for (const chart of reportData.charts) {
      await addChartImage(chart);
    }
    if (reportData.charts.length === 0) {
      chartsSheet.getCell('A3').value = 'No chart data is available for the selected filters.';
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, `${reportData.fileBaseName}.xlsx`);
  };

  const runPdfExport = async () => {
    if (tab === 'surveys') {
      await handleSurveyPdfExport();
      return;
    }
    if (tab === 'inferential') {
      await handleInferentialPdfExport();
      return;
    }
    setPdfExporting(true);
    try {
      const reportData = await loadFormalReportExportData('export_pdf');
      const {
        overview: overviewForPdf,
        programs: programForPdf,
        years: yearForPdf,
        statuses: statusForPdf,
        salaries: salaryForPdf,
        snapshot,
        departmentLabel,
        batchLabel,
        filterLabels,
      } = reportData;
      const [interpretations, renderedCharts] = await Promise.all([
        resolveFormalReportInterpretations(reportData),
        Promise.all(reportData.charts.map(async (chart) => ({
          chart,
          image: await renderReportChart(chart, { devicePixelRatio: 2 }),
        }))),
      ]);
      const chartImages = new Map(renderedCharts.map(({ chart, image }) => [chart.key, image]));
      const sectionNotes = buildPdfSectionNotes(snapshot);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginLeft = 40;
      const contentWidth = pageWidth - marginLeft * 2;
      const contentBottom = pageHeight - 38;

      const drawContinuationHeader = (title: string) => {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(27, 42, 74);
        pdf.text(normalizeReportText(`${title} (continued)`, { peso: 'php' }), marginLeft, 34);
        pdf.setDrawColor(220, 226, 235);
        pdf.line(marginLeft, 42, pageWidth - marginLeft, 42);
      };

      const writePaginatedText = (text: string, startY: number, title: string, fontSize = 9.5) => {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(fontSize);
        pdf.setTextColor(45, 55, 70);
        const lineHeight = fontSize + 3.8;
        let y = startY;
        const paragraphs = normalizeReportText(text, { peso: 'php' })
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.replace(/\n+/g, ' ').trim())
          .filter(Boolean);
        paragraphs.forEach((paragraph, paragraphIndex) => {
          const lines = pdf.splitTextToSize(paragraph, contentWidth) as string[];
          lines.forEach((line) => {
            if (y + lineHeight > contentBottom) {
              pdf.addPage();
              drawContinuationHeader(title);
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(fontSize);
              pdf.setTextColor(45, 55, 70);
              y = 62;
            }
            pdf.text(line, marginLeft, y, { align: 'left' });
            y += lineHeight;
          });
          if (paragraphIndex < paragraphs.length - 1) y += 7;
        });
        return y;
      };

      const coverSummary = buildStructuredOverviewAnalysis(overviewForPdf, programForPdf).summary;
      pdf.setFillColor(27, 42, 74);
      pdf.rect(0, 0, pageWidth, 110, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(22);
      pdf.text('Graduate Tracer Study Report', marginLeft, 52);
      pdf.setFontSize(13);
      pdf.text('Norzagaray College', marginLeft, 76);

      pdf.setTextColor(30, 30, 30);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      const coverRows = [
        `Generated: ${reportData.generatedAt.toLocaleString()}`,
        `${isDean ? 'Program Scope' : 'Department'}: ${departmentLabel}`,
        `Batch / Graduation Year: ${batchLabel}`,
        `Survey: ${selectedSurvey?.title || 'No survey selected'}`,
        `Employment Status: ${filterLabels.employmentStatus}`,
        `Program Alignment: ${filterLabels.programAlignment}`,
        `Course / Program: ${filterLabels.course}`,
      ];
      coverRows.forEach((row, index) => pdf.text(normalizeReportText(row, { peso: 'php' }), marginLeft, 142 + index * 17));
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(27, 42, 74);
      pdf.text('Descriptive Summary', marginLeft, 278);
      let coverY = writePaginatedText(coverSummary, 296, 'Graduate Tracer Study Report', 10);

      if (overviewForPdf) {
        coverY += 10;
        const coverCounts = [
          ['Total Responses', overviewForPdf.total_graduates],
          ['Known Employment Status', overviewForPdf.total_employment_known ?? safeCount(overviewForPdf.total_employed) + safeCount(overviewForPdf.total_unemployed)],
          ['Employed', overviewForPdf.total_employed],
          ['Unemployed', overviewForPdf.total_unemployed ?? 0],
          ['Employment Rate', formatNullableRate(overviewForPdf.employment_rate)],
          ['Valid Alignment Responses', overviewForPdf.total_alignment_known ?? 0],
          ['Aligned', overviewForPdf.total_aligned],
          ['Alignment Rate', formatNullableRate(overviewForPdf.alignment_rate)],
        ];
        if (coverY > contentBottom - 180) {
          pdf.addPage();
          drawContinuationHeader('Graduate Tracer Study Report');
          coverY = 62;
        }
        autoTable(pdf, {
          startY: coverY,
          head: [['Key Performance Indicator', 'Value']],
          body: coverCounts,
          styles: { fontSize: 9, cellPadding: 5 },
          headStyles: { fillColor: [27, 42, 74] },
          margin: { left: marginLeft, right: marginLeft, bottom: 34 },
        });
      }

      const sectionInterpretationKey: Record<'overview' | 'program' | 'year' | 'employment' | 'salary', keyof PdfInterpretations> = {
        overview: 'overview',
        program: 'programPerformance',
        year: 'yearlyTrend',
        employment: 'employmentStatus',
        salary: 'salaryDistribution',
      };

      const addSection = async (
        sectionTitle: string,
        sectionTab: 'overview' | 'program' | 'year' | 'employment' | 'salary',
      ) => {
        const tableData = getPdfTableForTab(
          sectionTab,
          overviewForPdf,
          programForPdf,
          yearForPdf,
          statusForPdf,
          salaryForPdf,
        );
        const interpretationKey = sectionInterpretationKey[sectionTab];
        const sectionCharts = reportChartsBySection(reportData.charts, interpretationKey);
        pdf.addPage();
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(15);
        pdf.setTextColor(25, 35, 50);
        pdf.text(sectionTitle, marginLeft, 36);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(75, 85, 100);
        const sectionFilterRows = [
          `${isDean ? 'Program Scope' : 'Department'}: ${departmentLabel} | Batch: ${batchLabel}`,
          `Survey: ${selectedSurvey?.title || 'No survey selected'} | Employment: ${filterLabels.employmentStatus} | Alignment: ${filterLabels.programAlignment}`,
          `Course / Program: ${filterLabels.course}`,
        ];
        sectionFilterRows.forEach((row, index) => pdf.text(
          normalizeReportText(row, { peso: 'php' }),
          marginLeft,
          52 + index * 12,
        ));

        let nextY = 92;
        for (const chart of sectionCharts) {
          const imageBuffer = chartImages.get(chart.key);
          if (!imageBuffer) throw new Error(`The ${chart.title} chart could not be generated.`);
          const chartHeight = contentWidth * (chart.height / chart.width);
          if (nextY + chartHeight > contentBottom - 20) {
            pdf.addPage();
            drawContinuationHeader(sectionTitle);
            nextY = 58;
          }
          const imageBase64 = `data:image/png;base64,${arrayBufferToBase64(imageBuffer)}`;
          pdf.addImage(imageBase64, 'PNG', marginLeft, nextY, contentWidth, chartHeight, undefined, 'FAST');
          nextY += chartHeight + 14;
        }

        if (nextY > contentBottom - 44) {
          pdf.addPage();
          drawContinuationHeader(sectionTitle);
          nextY = 62;
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(27, 42, 74);
        pdf.text('Descriptive Interpretation', marginLeft, nextY);
        nextY = writePaginatedText(interpretations[interpretationKey], nextY + 16, sectionTitle);

        if (nextY > contentBottom - 95) {
          pdf.addPage();
          drawContinuationHeader(sectionTitle);
          nextY = 62;
        } else {
          nextY += 8;
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10.5);
        pdf.setTextColor(27, 42, 74);
        pdf.text('Data Table', marginLeft, nextY);
        nextY += 8;

        autoTable(pdf, {
          startY: nextY,
          head: [tableData.headers],
          body: (tableData.rows.length > 0
            ? tableData.rows
            : [tableData.headers.map((_, index) => index === 0 ? 'No data available for the selected filters.' : '')]
          ).map((row) => row.map((cell) => normalizeReportText(cell, { peso: 'php' }))),
          styles: { fontSize: 7.5, cellPadding: 4, overflow: 'linebreak', valign: 'middle' },
          headStyles: { fillColor: [27, 42, 74], fontSize: 7.5 },
          alternateRowStyles: { fillColor: [247, 249, 252] },
          margin: { top: 54, left: marginLeft, right: marginLeft, bottom: 34 },
          didDrawPage: (hookData) => {
            if (hookData.pageNumber > 1) drawContinuationHeader(sectionTitle);
          },
        });

        const tableEndY = (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY;
        const notes = sectionNotes[interpretationKey];
        if (notes.length > 0) {
          let notesY = tableEndY + 16;
          if (notesY > contentBottom - 54) {
            pdf.addPage();
            drawContinuationHeader(sectionTitle);
            notesY = 62;
          }
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(10);
          pdf.setTextColor(27, 42, 74);
          pdf.text('Data Notes / Additional Observation', marginLeft, notesY);
          writePaginatedText(notes.map((note) => `- ${note}`).join('\n\n'), notesY + 15, sectionTitle, 8.5);
        }
      };

      await addSection('Overview Analytics', 'overview');
      await addSection('Program Performance', 'program');
      await addSection('Yearly Employment Trend', 'year');
      await addSection('Employment Status Analysis', 'employment');
      await addSection('Salary Distribution Analysis', 'salary');

      const pageCount = (pdf as jsPDF & { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        pdf.setPage(page);
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, pageHeight - 30, pageWidth, 30, 'F');
        pdf.setFontSize(8);
        pdf.setTextColor(105, 115, 130);
        pdf.text(`Page ${page} of ${pageCount}`, pageWidth - 90, pageHeight - 16);
        pdf.text('GradTrack - Confidential Department Report', marginLeft, pageHeight - 16);
      }

      pdf.save(`${reportData.fileBaseName}.pdf`);
    } finally {
      setPdfExporting(false);
    }
  };

  const buildWordMetadata = (data: FormalReportExportData) => ({
    title: 'Graduate Tracer Study Report',
    institution: 'Norzagaray College',
    generatedAt: data.generatedAt.toLocaleString(),
    departmentLabel: data.departmentLabel,
    batchLabel: data.batchLabel,
    surveyLabel: selectedSurvey?.title || 'No survey selected',
    employmentStatusLabel: data.filterLabels.employmentStatus,
    programAlignmentLabel: data.filterLabels.programAlignment,
    courseLabel: data.filterLabels.course,
  });

  const runWordExport = async () => {
    const { generateFormalReportDocx, generateGenericReportDocx } = await import('../../utils/reportDocumentExport');

    if (tab === 'surveys') {
      if (!surveyAnalytics) throw new Error('Survey analytics are not available for this selection.');
      const generatedAt = new Date();
      const surveyCharts = buildSurveyReportCharts(surveyAnalytics.report_tables ?? [])
        .map((chart, chartIndex) => buildLabeledBarChart(
          `survey-${chart.tableNumber}-${chartIndex}`,
          'overview',
          chart.title,
          chart.data.map((row) => String(row.label)),
          chart.series.map((series) => ({
            label: series.name,
            color: series.color,
            values: chart.data.map((row) => safeCount(row[series.key])),
          })),
          { rotateLabels: true },
        ))
        .filter((chart): chart is ReportChartDefinition => chart !== null);
      const reportTables = surveyAnalytics.report_tables ?? [];
      const sections = reportTables.length > 0
        ? reportTables.map((table, index) => ({
            title: `Table ${table.number || index + 1}. ${table.title}`,
            interpretation: table.note || 'The table reports the observed frequencies and percentages for this survey section.',
            table: {
              headers: flattenSurveyReportHeaders(table),
              rows: table.rows.map((row) => row.cells),
            },
            charts: surveyCharts.filter((chart) => chart.key.startsWith(`survey-${table.number}-`)),
          }))
        : [{
            title: 'Survey Question Analytics',
            interpretation: 'Frequencies and percentages are based on the responses applicable to each survey question.',
            table: {
              headers: ['Section', 'No.', 'Survey Question', 'Type', 'Answer / Option', 'Frequency', 'Percentage'],
              rows: buildSurveyQuestionPdfRows(surveyAnalytics),
            },
          }];
      const blob = await generateGenericReportDocx({
        metadata: {
          title: 'Survey Analytics Report',
          institution: 'Norzagaray College',
          generatedAt: generatedAt.toLocaleString(),
          departmentLabel: getReportScopeLabel(),
          batchLabel: getBatchLabel(),
          surveyLabel: surveyAnalytics.survey_title,
          employmentStatusLabel: 'All',
          programAlignmentLabel: 'All',
          courseLabel: 'All Courses',
        },
        descriptiveSummary: `The selected survey contains ${surveyAnalytics.total_responses} valid responses. Tables remain editable and percentages retain the denominators supplied by the survey analytics endpoint.`,
        keyPerformanceIndicators: [
          ['Total Responses', surveyAnalytics.total_responses],
          ['Response Rate', formatNullableRate(surveyAnalytics.response_rate)],
          ['Completion Rate', formatNullableRate(surveyAnalytics.completion_rate)],
          ['Questions', surveyAnalytics.questions_analytics.length],
        ],
        sections,
      });
      downloadBlob(blob, `gradtrack_survey_analytics_${toFileSafePart(getReportScopeLabel())}_${generatedAt.toISOString().slice(0, 10)}.docx`);
      return;
    }

    if (tab === 'inferential') {
      if (!inferentialResult) throw new Error('Run an inferential analysis before exporting the Word document.');
      const generatedAt = new Date();
      const result = inferentialResult;
      const analysisChart = buildLabeledBarChart(
        'inferential-analysis',
        'overview',
        `${result.analysis.variable2.label} by ${result.analysis.variable1.label}`,
        result.chartData.categories.map((row) => String(row.category)),
        result.chartData.series.map((series, index) => ({
          label: series.label,
          color: SURVEY_CHART_COLORS[index % SURVEY_CHART_COLORS.length],
          values: result.chartData.categories.map((row) => safeCount(row[series.key])),
        })),
        { rotateLabels: true },
      );
      const blob = await generateGenericReportDocx({
        metadata: {
          title: 'Inferential Analysis Report',
          institution: 'Norzagaray College',
          generatedAt: generatedAt.toLocaleString(),
          departmentLabel: getReportScopeLabel(),
          batchLabel: result.filters.graduationYear || 'All Years',
          surveyLabel: result.survey.title,
          employmentStatusLabel: 'Not applicable',
          programAlignmentLabel: 'Not applicable',
          courseLabel: result.filters.programLabel || 'All Courses',
        },
        descriptiveSummary: result.interpretation || result.message || 'The selected comparison could not be calculated.',
        keyPerformanceIndicators: [
          ['Valid Responses Used', result.analysis.validResponses],
          ['Excluded / Missing Responses', result.analysis.excludedResponses],
          ['Chi-Square', formatInferentialStatistic(result.analysis.chiSquare)],
          ['p-value', formatInferentialPValue(result.analysis.pValue)],
          ["Cramer's V", formatInferentialStatistic(result.analysis.cramersV)],
          ['Decision', result.analysis.decision],
        ],
        sections: [{
          title: 'Inferential Analysis',
          interpretation: result.interpretation || result.message || 'The test could not be calculated.',
          charts: analysisChart ? [analysisChart] : [],
          table: {
            headers: [result.analysis.variable1.label, ...result.contingencyTable.columns.map((column) => column.label), 'Total'],
            rows: [
              ...result.contingencyTable.rows.map((row) => [row.label, ...row.frequencies, row.total]),
              ['Total', ...result.contingencyTable.columnTotals, result.contingencyTable.grandTotal],
            ],
          },
          notes: result.assumptions.warnings,
        }],
      });
      downloadBlob(blob, `gradtrack_inferential_analysis_${generatedAt.toISOString().slice(0, 10)}.docx`);
      return;
    }

    const data = await loadFormalReportExportData('export_word');
    const interpretations = await resolveFormalReportInterpretations(data);
    const notes = buildPdfSectionNotes(data.snapshot);
    const tableFor = (sectionTab: 'overview' | 'program' | 'year' | 'employment' | 'salary') => getPdfTableForTab(
      sectionTab,
      data.overview,
      data.programs,
      data.years,
      data.statuses,
      data.salaries,
    );
    const overviewCounts = data.overview;
    const blob = await generateFormalReportDocx({
      metadata: buildWordMetadata(data),
      descriptiveSummary: buildStructuredOverviewAnalysis(data.overview, data.programs).summary,
      keyPerformanceIndicators: overviewCounts ? [
        ['Total Responses', overviewCounts.total_graduates],
        ['Known Employment Status', overviewCounts.total_employment_known ?? safeCount(overviewCounts.total_employed) + safeCount(overviewCounts.total_unemployed)],
        ['Employed', overviewCounts.total_employed],
        ['Unemployed', overviewCounts.total_unemployed ?? 0],
        ['Employment Rate', formatNullableRate(overviewCounts.employment_rate)],
        ['Valid Alignment Responses', overviewCounts.total_alignment_known ?? safeCount(overviewCounts.total_aligned) + safeCount(overviewCounts.total_not_aligned)],
        ['Aligned', overviewCounts.total_aligned],
        ['Alignment Rate', formatNullableRate(overviewCounts.alignment_rate)],
      ] : [['Result', 'No data available for the selected filters.']],
      snapshot: data.snapshot,
      interpretations,
      notes,
      tables: {
        overview: tableFor('overview'),
        programPerformance: tableFor('program'),
        yearlyTrend: tableFor('year'),
        employmentStatus: tableFor('employment'),
        salaryDistribution: tableFor('salary'),
      },
    });
    downloadBlob(blob, `${data.fileBaseName}.docx`);
  };

  const handleExportPdf = async () => {
    if (pdfExporting) return;
    setExportError('');
    setPdfExporting(true);
    try {
      await runPdfExport();
    } catch (error) {
      console.error('PDF export failed:', error);
      setExportError(error instanceof Error ? error.message : 'The PDF report could not be generated. Please try again.');
    } finally {
      setPdfExporting(false);
    }
  };

  const handleWordExport = async () => {
    if (wordExporting) return;
    setExportError('');
    setWordExporting(true);
    try {
      await runWordExport();
    } catch (error) {
      console.error('Word export failed:', error);
      setExportError(error instanceof Error ? error.message : 'The Word document could not be generated. Please try again.');
    } finally {
      setWordExporting(false);
    }
  };

  const handleExport = async () => {
    if (excelExporting) return;
    setExportError('');
    setExcelExporting(true);
    try {
      await runExcelExport();
    } catch (error) {
      console.error('Excel export failed:', error);
      setExportError(error instanceof Error ? error.message : 'The Excel report could not be generated. Please try again.');
    } finally {
      setExcelExporting(false);
    }
  };

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'program', label: 'By Program' },
    { key: 'year', label: 'By Year' },
    { key: 'employment', label: 'Employment Status' },
    { key: 'salary', label: 'Salary Distribution' },
    { key: 'surveys', label: 'Survey Analytics' },
    { key: 'inferential', label: 'Inferential Analysis' },
  ] as const;

  const renderAiAnalyticsSection = () => {
    const localStructured = buildStructuredOverviewAnalysis(overview, overviewProgramData);
    const structured: StructuredDescriptiveAnalysis = {
      ...localStructured,
      employmentInterpretation: aiSections?.employmentInterpretation || localStructured.employmentInterpretation,
      programAnalysis: aiSections?.programAnalysis || localStructured.programAnalysis,
      alignmentAnalysis: aiSections?.alignmentAnalysis || localStructured.alignmentAnalysis,
      summary: aiSections?.summary || localStructured.summary,
      dataNotes: aiSections?.dataNotes?.length ? aiSections.dataNotes : localStructured.dataNotes,
    };
    const renderParagraphs = (content: string) => (
      <div className="space-y-3 text-sm leading-6 text-slate-700">
        {normalizeReportText(content)
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean)
          .map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
    );

    return (
      <section aria-labelledby="ai-descriptive-heading" className="overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm">
        <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-blue-50 to-white px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="shrink-0 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 p-2.5 shadow-sm">
                <Sparkles className="h-5 w-5 text-white" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 id="ai-descriptive-heading" className="text-base font-bold text-[#1b2a4a] sm:text-lg">AI-Powered Descriptive Analytics</h3>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  {aiSource === 'groq' ? 'Powered by GROQ AI' : 'Verified local analysis while GROQ AI is unavailable'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRegenerateAiAnalytics}
              disabled={aiLoading || !selectedSurveyId}
              className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"
              aria-label="Regenerate descriptive analytics"
            >
              <RefreshCw className={`h-4 w-4 ${aiLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Regenerate analysis
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {aiLoading ? (
            <div role="status" aria-live="polite">
              <p className="mb-3 text-sm font-semibold text-violet-800">Analyzing graduate tracer data...</p>
              <AiAnalyticsSkeleton />
            </div>
          ) : tab === 'overview' ? (
            <div className="space-y-6">
              <section>
                <h4 className="mb-3 text-sm font-bold text-[#1b2a4a]">Descriptive Analysis</h4>
                {renderParagraphs(`${structured.employmentInterpretation}\n\n${structured.alignmentAnalysis}`)}
              </section>

              <section className="border-t border-slate-200 pt-5">
                <h4 className="mb-3 text-sm font-bold text-[#1b2a4a]">Program-Level Analysis</h4>
                {renderParagraphs(structured.programAnalysis)}
              </section>

              <section className="border-t border-slate-200 pt-5">
                <h4 className="mb-3 text-sm font-bold text-[#1b2a4a]">Overall Summary</h4>
                {renderParagraphs(structured.summary)}
              </section>

              {structured.dataNotes.length > 0 && (
                <section className="border-t border-slate-200 pt-5">
                  <h4 className="text-sm font-bold text-[#1b2a4a]">Data Notes</h4>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
                    {structured.dataNotes.map((note) => <li key={note}>{note}</li>)}
                  </ul>
                </section>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {[
                {
                  title: 'Descriptive Analysis',
                  content: aiAnalysis || (aiSummary || aiConclusion ? '' : 'AI analysis temporarily unavailable.'),
                },
                { title: 'Key Findings', content: aiSummary },
                { title: 'Overall Summary', content: aiConclusion },
              ]
                .filter((section) => section.content.trim() !== '')
                .map((section, index) => (
                  <section key={section.title} className={index === 0 ? '' : 'border-t border-slate-200 pt-5'}>
                    <h4 className="mb-3 text-sm font-bold text-[#1b2a4a]">{section.title}</h4>
                    {renderParagraphs(section.content)}
                  </section>
                ))}
              {aiSections?.dataNotes && aiSections.dataNotes.length > 0 && (
                <section className="border-t border-slate-200 pt-5">
                  <h4 className="mb-3 text-sm font-bold text-[#1b2a4a]">Data Notes</h4>
                  <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
                    {aiSections.dataNotes.map((note) => <li key={note}>{note}</li>)}
                  </ul>
                </section>
              )}
            </div>
          )}
          <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
            AI-assisted interpretation is based only on the currently selected GradTrack data and remains descriptive, not inferential.
          </p>
        </div>
      </section>
    );
  };

  const surveyReportTables = surveyAnalytics?.report_tables ?? [];
  const selectedSurveyTableIndex = Number(selectedSurveyTable);
  const hasValidSurveyTableSelection = selectedSurveyTable !== ALL_SURVEY_TABLES_VALUE
    && Number.isInteger(selectedSurveyTableIndex)
    && selectedSurveyTableIndex >= 0
    && selectedSurveyTableIndex < surveyReportTables.length;
  const visibleSurveyReportTables = hasValidSurveyTableSelection
    ? [surveyReportTables[selectedSurveyTableIndex]]
    : surveyReportTables;
  const surveyReportGraphCount = buildSurveyReportCharts(visibleSurveyReportTables).length;
  const overviewUnemployed = overview?.total_unemployed
    ?? Math.max((overview?.total_employment_known ?? 0) - (overview?.total_employed ?? 0), 0);
  const overviewNotAligned = safeCount(overview?.total_not_aligned);
  const overviewPrograms = overviewProgramData;
  const overviewActiveFilterChips = getOverviewActiveFilterChips();
  const overviewHasRecords = (overview?.total_graduates ?? 0) > 0;
  const overviewHasGraduatePopulation = isDean
    && overviewBatchTrends.some((row) => Number(row.total_graduates) > 0);
  const hasOverviewEmploymentData = (overview?.total_employed ?? 0) + overviewUnemployed > 0;
  const hasOverviewWorkLocationData = (overview?.total_employed_local ?? 0) + (overview?.total_employed_abroad ?? 0) > 0;
  const hasOverviewAlignmentData = (overview?.total_aligned ?? 0) + overviewNotAligned > 0;
  const hasOverviewProgramEmploymentData = overviewPrograms.some((program) => Number(program.employed ?? 0) > 0);
  const hasOverviewProgramAlignmentData = overviewPrograms.some((program) => Number(program.aligned ?? 0) > 0);
  const overviewProgramRateData = overviewPrograms
    .filter((program) => program.employment_rate !== null && program.employment_rate !== undefined)
    .map((program) => ({ name: program.code, value: Number(program.employment_rate) }));
  const hasOverviewProgramRateData = overviewProgramRateData.length > 0;
  const programChartData = programData.map((program) => ({
    ...program,
    not_employed: getNotEmployedCount(program),
  }));
  const yearChartData = yearData.map((year) => ({
    ...year,
    not_employed: getNotEmployedCount(year),
  }));
  const statusLocalCount = safeCount(statusData.find((status) => status.employment_status === 'Employed (Local)')?.count);
  const statusAbroadCount = safeCount(statusData.find((status) => status.employment_status === 'Employed (Abroad)')?.count);
  const statusLocationUnknownCount = safeCount(statusData.find((status) => status.employment_status === 'Employed (Location Unknown)')?.count);
  const statusEmployedCount = statusLocalCount + statusAbroadCount + statusLocationUnknownCount;
  const departmentOptions = availableDepartments;
  const isSurveyExportDisabled = tab === 'surveys' && (
    surveyLoading || surveyAnalyticsLoading || !selectedSurveyId || !surveyAnalytics
  );
  const isInferentialExportDisabled = tab === 'inferential' && (
    inferentialMetadataLoading || inferentialAnalysisLoading || !inferentialResult
  );
  const isExportUnavailable = isSurveyExportDisabled || isInferentialExportDisabled;
  const exportInProgress = pdfExporting || wordExporting || excelExporting;
  const inferentialTestsGraduationYear = [inferentialSettings.variable1, inferentialSettings.variable2]
    .includes('graduation_year');
  const inferentialTestsProgram = [inferentialSettings.variable1, inferentialSettings.variable2]
    .includes('program');
  const inferentialVariablesMatch = Boolean(inferentialSettings.variable1)
    && inferentialSettings.variable1 === inferentialSettings.variable2;
  const exportButtonClass = (disabled: boolean) => `flex w-full items-center justify-center gap-2 border px-4 py-2.5 rounded-lg text-sm font-medium transition-colors sm:w-auto ${
    disabled ? 'cursor-not-allowed bg-gray-100 text-gray-400' : 'hover:bg-gray-50'
  }`;
  const renderOverviewFiltersSection = () => (
    <div className="border rounded-xl p-4 bg-gray-50">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#1b2a4a]" />
            <h3 className="text-sm font-semibold text-[#1b2a4a]">Report Filters</h3>
          </div>
          {loading && tab === 'overview' && (
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-b-[#1b2a4a]" />
              Loading filtered data...
            </div>
          )}
        </div>

        <div className={`grid grid-cols-1 gap-3 md:grid-cols-2 ${isDean ? '' : 'xl:grid-cols-4'}`}>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Employability Status
            <select
              value={overviewFilterDraft.employmentStatus}
              onChange={(e) => updateOverviewFilterDraft('employmentStatus', e.target.value as OverviewFilters['employmentStatus'])}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">All</option>
              <option value="employed">Employed</option>
              <option value="unemployed">Unemployed</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Program Alignment
            <select
              value={overviewFilterDraft.programAlignment}
              onChange={(e) => updateOverviewFilterDraft('programAlignment', e.target.value as OverviewFilters['programAlignment'])}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">All</option>
              <option value="aligned">Aligned</option>
              <option value="not_aligned">Not Aligned</option>
            </select>
          </label>

          {!isDean && <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Year Graduated
            <select
              value={overviewFilterDraft.graduationYear}
              onChange={(e) => updateOverviewFilterDraft('graduationYear', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">All Years</option>
              {overviewFilterOptions.years.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>}

          {!isDean && <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
            Course or Program
            <select
              value={overviewFilterDraft.programId}
              onChange={(e) => updateOverviewFilterDraft('programId', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="all">All Courses</option>
              {overviewFilterOptions.programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.code} - {program.name}
                </option>
              ))}
            </select>
          </label>}

        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {overviewActiveFilterChips.length > 0 ? (
              overviewActiveFilterChips.map((chip) => (
                <span key={chip} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  {chip}
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-500">No active filters</span>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleApplyOverviewFilters}
              disabled={loading && tab === 'overview'}
              className={`flex items-center justify-center gap-2 rounded-lg bg-[#1b2a4a] px-4 py-2 text-sm font-semibold text-white transition-colors ${
                loading && tab === 'overview' ? 'cursor-not-allowed opacity-60' : 'hover:bg-[#24385f]'
              }`}
            >
              <Filter className="w-4 h-4" />
              Apply Filters
            </button>
            <button
              type="button"
              onClick={handleResetOverviewFilters}
              disabled={loading && tab === 'overview'}
              className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 transition-colors ${
                loading && tab === 'overview' ? 'cursor-not-allowed opacity-60' : 'hover:bg-white'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              Reset Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="reports-analytics-page space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1b2a4a]">Reports & Analytics</h1>
          <p className="text-sm text-gray-500">
            {selectedSurvey ? `Viewing analytics for ${selectedSurvey.title}` : 'Graduate employment data counts'}
          </p>
          {isDean && reportScope?.display_name && (
            <p className="mt-1 text-sm font-semibold text-blue-800">
              Program Scope: {reportScope.display_name}
            </p>
          )}
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
          {tab !== 'surveys' && surveyItems.length > 0 && (
            <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
              <label className="text-sm font-medium text-gray-700">Survey:</label>
              <select
                value={selectedSurveyId ?? ''}
                onChange={(e) => handleSelectedSurveyChange(e.target.value ? Number(e.target.value) : null)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white sm:min-w-[240px]"
              >
                <option value="">No active survey selected</option>
                {surveyItems.map((survey) => (
                  <option key={survey.id} value={survey.id}>
                    {survey.title}
                    {survey.archived_at ? ' (Archived)' : survey.status === 'active' ? ' (Active)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          {isDean && tab !== 'inferential' && (
            <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
              <label className="text-sm font-medium text-gray-700">Batch / Year Graduated:</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-auto"
              >
                <option value="all">All Batches</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          )}
          {/* Year Filter */}
          {!isDean && (tab === 'program' || tab === 'employment' || tab === 'salary') && availableYears.length > 0 && (
            <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
              <label className="text-sm font-medium text-gray-700">Filter by Year:</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white sm:w-auto"
              >
                <option value="all">All Years</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          )}
          {!isDean && tab !== 'overview' && tab !== 'surveys' && tab !== 'inferential' && (
            <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
              <label className="text-sm font-medium text-gray-700">Department:</label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white sm:w-auto"
              >
                <option value="all">All Departments</option>
                {departmentOptions.map((department) => (
                  <option key={department.code} value={department.code}>
                    {department.code} - {department.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!isDean && tab === 'surveys' && (
            <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
              <label className="text-sm font-medium text-gray-700">Department:</label>
              <select
                value={selectedSurveyDepartment}
                onChange={(e) => setSelectedSurveyDepartment(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white sm:w-auto"
              >
                {SURVEY_DEPARTMENT_OPTIONS.map((department) => (
                  <option key={department.value} value={department.value}>
                    {department.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={handleExportPdf}
            disabled={isExportUnavailable || exportInProgress}
            className={exportButtonClass(isExportUnavailable || exportInProgress)}
          >
            {pdfExporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {pdfExporting ? 'Generating PDF...' : 'Export PDF'}
          </button>
          <button
            onClick={handleWordExport}
            disabled={isExportUnavailable || exportInProgress}
            className={exportButtonClass(isExportUnavailable || exportInProgress)}
          >
            {wordExporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileType2 className="w-4 h-4" />}
            {wordExporting ? 'Generating Word document...' : 'Export Word'}
          </button>
          <button
            onClick={handleExport}
            disabled={isExportUnavailable || exportInProgress}
            className={exportButtonClass(isExportUnavailable || exportInProgress)}
          >
            {excelExporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {excelExporting ? 'Generating Excel file...' : 'Export Excel'}
          </button>
        </div>
      </div>

      {exportError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {exportError}
        </div>
      )}

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
          {reportError && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {reportError}
            </div>
          )}
          {tab === 'overview' ? (
            <div className="space-y-6">
              {renderOverviewFiltersSection()}
              {overviewFilterError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {overviewFilterError}
                </div>
              )}
              {loading ? (
                <OverviewLoadingSkeleton />
              ) : overview ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <StatCard icon={Users} label="Total Graduate Responses" value={overview.total_graduates.toString()} color="bg-blue-100 text-blue-700" />
                    <StatCard icon={Briefcase} label="Employed (Total)" value={overview.total_employed.toString()} sub={formatNullableRate(overview.employment_rate)} color="bg-green-100 text-green-700" />
                    <StatCard icon={Briefcase} label="Employed (Local)" value={overview.total_employed_local.toString()} color="bg-teal-100 text-teal-700" />
                    <StatCard icon={Briefcase} label="Employed (Abroad)" value={overview.total_employed_abroad.toString()} color="bg-indigo-100 text-indigo-700" />
                    <StatCard icon={Target} label="Aligned" value={overview.total_aligned.toString()} sub={formatNullableRate(overview.alignment_rate)} color="bg-orange-100 text-orange-700" />
                  </div>

                  {!overviewHasRecords && !overviewHasGraduatePopulation ? (
                    <div className="border rounded-xl p-8 text-center">
                      <p className="font-semibold text-[#1b2a4a]">No report data is available for the selected batch.</p>
                      <p className="mt-1 text-sm text-gray-500">Try another batch or reset the applicable filters.</p>
                    </div>
                  ) : (
                    <>
                  {/* Pie Charts Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Employment Status Pie Chart */}
                    <div className="border rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-[#1b2a4a] mb-4">Employment Status</h3>
                      <div className="h-64">
                        {hasOverviewEmploymentData ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie 
                                data={[
                                  { name: 'Employed', value: overview.total_employed },
                                  { name: 'Unemployed', value: overviewUnemployed }
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
                        ) : (
                          <OverviewChartEmptyState />
                        )}
                      </div>
                      <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-green-500" />
                          <span className="text-xs text-gray-600">Employed: {overview.total_employed}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-red-500" />
                          <span className="text-xs text-gray-600">Unemployed: {overviewUnemployed}</span>
                        </div>
                      </div>
                    </div>

                    {/* Work Location Pie Chart */}
                    <div className="border rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-[#1b2a4a] mb-4">Work Location</h3>
                      <div className="h-64">
                        {hasOverviewWorkLocationData ? (
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
                        ) : (
                          <OverviewChartEmptyState message="No work-location data for the selected filters." />
                        )}
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
                        {hasOverviewAlignmentData ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie 
                                data={[
                                  { name: 'Aligned', value: overview.total_aligned },
                                  { name: 'Not Aligned', value: overviewNotAligned },
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
                        ) : (
                          <OverviewChartEmptyState message="No job-alignment data for the selected filters." />
                        )}
                      </div>
                      <div className="flex flex-wrap justify-center gap-4 mt-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-orange-500" />
                          <span className="text-xs text-gray-600">Aligned: {overview.total_aligned}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-slate-400" />
                          <span className="text-xs text-gray-600">Not Aligned: {overviewNotAligned}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dean batch trends replace single-scope program comparisons. */}
                  {isDean ? (
                    <DeanBatchTrendCharts data={overviewBatchTrends} />
                  ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Employment by Program */}
                    <div className="border rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-[#1b2a4a] mb-4">Employment by Program</h3>
                      <div className="h-64">
                        {hasOverviewProgramEmploymentData ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie 
                                data={overviewPrograms.map((p) => ({ name: p.code, value: p.employed }))} 
                                cx="50%" 
                                cy="50%" 
                                outerRadius={80} 
                                dataKey="value"
                                label={({ name, value }) => `${name}: ${value}`}
                              >
                                {overviewPrograms.map((p, i) => (
                                  <Cell key={i} fill={PROGRAM_COLORS[p.code] || COLORS[i % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <OverviewChartEmptyState message="No employed graduates by program for the selected filters." />
                        )}
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 mt-2">
                        {overviewPrograms.map((p, i) => (
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
                        {hasOverviewProgramAlignmentData ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie 
                                data={overviewPrograms.map((p) => ({ name: p.code, value: p.aligned }))} 
                                cx="50%" 
                                cy="50%" 
                                outerRadius={80} 
                                dataKey="value"
                                label={({ name, value }) => `${name}: ${value}`}
                              >
                                {overviewPrograms.map((p, i) => (
                                  <Cell key={i} fill={PROGRAM_COLORS[p.code] || COLORS[i % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <OverviewChartEmptyState message="No aligned graduates by program for the selected filters." />
                        )}
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 mt-2">
                        {overviewPrograms.map((p, i) => (
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
                        {hasOverviewProgramRateData ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie 
                                data={overviewProgramRateData}
                                cx="50%" 
                                cy="50%" 
                                outerRadius={80} 
                                dataKey="value"
                                label={({ name, value }) => `${name}: ${value}%`}
                              >
                                {overviewProgramRateData.map((p, i) => (
                                  <Cell key={p.name} fill={PROGRAM_COLORS[p.name] || COLORS[i % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(value) => `${value}%`} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <OverviewChartEmptyState message="No valid employment-status responses for the selected filters." />
                        )}
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 mt-2">
                        {overviewPrograms.map((p, i) => (
                          <div key={p.code} className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PROGRAM_COLORS[p.code] || COLORS[i % COLORS.length] }} />
                            <span className="text-xs text-gray-600">{p.code}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  )}

                    </>
                  )}

                  {renderAiAnalyticsSection()}

                </>
              ) : (
                <div className="border rounded-xl p-8 text-center">
                  <p className="font-semibold text-[#1b2a4a]">No overview data available.</p>
                  <p className="text-sm text-gray-500 mt-1">Select a survey or reset the filters to reload the complete Overview report.</p>
                </div>
              )}
            </div>
          ) : loading ? (
            <ReportTabLoadingSkeleton />
          ) : (
            <>
              {tab !== 'surveys' && tab !== 'inferential' && (
                <div className="mb-6 space-y-3">
                  {renderOverviewFiltersSection()}
                  {overviewFilterError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                      {overviewFilterError}
                    </div>
                  )}
                </div>
              )}

              {/* By Program */}
              {tab === 'program' && (
                programData.length === 0 ? (
                  <ReportEmptyState batchLabel={getBatchLabel()} />
                ) : (
                <div className="space-y-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={programChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="code" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ borderRadius: 8 }} />
                      <Legend />
                      <Bar dataKey="employed" name="Employed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="not_employed" name="Not Employed" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="aligned" name="Aligned" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="not_aligned" name="Not Aligned" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-gray-600">Program</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Graduates</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Employed</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Not Employed</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Aligned</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Not Aligned</th>
                        </tr>
                      </thead>
                      <tbody>
                        {programData.map((p) => (
                          <tr key={p.code} className="border-t hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{p.code} — {p.name}</td>
                            <td className="px-4 py-3 text-center">{p.total_graduates}</td>
                            <td className="px-4 py-3 text-center">{p.employed}</td>
                            <td className="px-4 py-3 text-center">{getNotEmployedCount(p)}</td>
                            <td className="px-4 py-3 text-center">{p.aligned}</td>
                            <td className="px-4 py-3 text-center">{p.not_aligned}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {renderAiAnalyticsSection()}
                </div>
                )
              )}

              {/* By Year */}
              {tab === 'year' && (
                yearData.length === 0 ? (
                  <ReportEmptyState batchLabel={getBatchLabel()} />
                ) : (
                <div className="space-y-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={yearChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="year_graduated" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ borderRadius: 8 }} />
                      <Legend />
                      <Bar dataKey="total_graduates" name="Total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="employed" name="Employed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="not_employed" name="Not Employed" fill="#ef4444" radius={[4, 4, 0, 0]} />
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
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Not Employed</th>
                          <th className="text-center px-4 py-3 font-semibold text-gray-600">Aligned</th>
                        </tr>
                      </thead>
                      <tbody>
                        {yearData.map((y) => (
                          <tr key={y.year_graduated} className="border-t hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{y.year_graduated}</td>
                            <td className="px-4 py-3 text-center">{y.total_graduates}</td>
                            <td className="px-4 py-3 text-center">{y.employed}</td>
                            <td className="px-4 py-3 text-center">{getNotEmployedCount(y)}</td>
                            <td className="px-4 py-3 text-center">{y.aligned}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {renderAiAnalyticsSection()}
                </div>
                )
              )}

              {/* Employment Status */}
              {tab === 'employment' && (
                statusData.reduce((sum, item) => sum + Number(item.count || 0), 0) === 0 ? (
                  <ReportEmptyState batchLabel={getBatchLabel()} />
                ) : (
                <div className="space-y-6">
                  <div className="flex flex-col lg:flex-row items-center gap-8">
                    <div className="w-full max-w-[520px] h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart margin={{ top: 24, right: 72, bottom: 36, left: 72 }}>
                          <Pie
                            data={statusData.map((s) => ({ name: s.employment_status, value: parseInt(String(s.count)) }))}
                            cx="50%"
                            cy="48%"
                            outerRadius={105}
                            dataKey="value"
                            labelLine={{ strokeWidth: 1 }}
                            label={({ name, percent }) => `${getEmploymentStatusChartLabel(String(name))} ${((percent ?? 0) * 100).toFixed(0)}%`}
                          >
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
                            {statusLocalCount}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t">
                          <span className="text-sm text-gray-600">Percentage of Total Employed</span>
                          <span className="text-xl font-bold text-teal-700">
                            {formatPercentage(statusLocalCount, statusEmployedCount)}
                          </span>
                        </div>
                        <div className="pt-3 border-t">
                          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-teal-500 rounded-full transition-all duration-500" 
                              style={{ 
                                width: `${statusEmployedCount > 0 ? (statusLocalCount / statusEmployedCount) * 100 : 0}%`
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
                            {statusAbroadCount}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-3 border-t">
                          <span className="text-sm text-gray-600">Percentage of Total Employed</span>
                          <span className="text-xl font-bold text-indigo-700">
                            {formatPercentage(statusAbroadCount, statusEmployedCount)}
                          </span>
                        </div>
                        <div className="pt-3 border-t">
                          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-500 rounded-full transition-all duration-500" 
                              style={{ 
                                width: `${statusEmployedCount > 0 ? (statusAbroadCount / statusEmployedCount) * 100 : 0}%`
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

                  {renderAiAnalyticsSection()}
                </div>
                )
              )}

              {/* Salary Distribution */}
              {tab === 'salary' && (
                salaryData.reduce((sum, item) => sum + Number(item.count || 0), 0) === 0 ? (
                  <ReportEmptyState batchLabel={getBatchLabel()} />
                ) : (
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {salaryData.map((s) => (
                      <div key={s.salary_range} className="border rounded-xl p-4 text-center">
                        <p className="text-2xl font-bold text-[#1b2a4a]">{s.count}</p>
                        <p className="text-xs text-gray-500 mt-1">{s.salary_range}</p>
                      </div>
                    ))}
                  </div>

                  {renderAiAnalyticsSection()}
                </div>
                )
              )}

              {/* Survey Analytics */}
              {tab === 'surveys' && (
                <div className="survey-analytics-content space-y-6">
                  {surveyLoading ? (
                    <SurveyAnalyticsLoadingSkeleton />
                  ) : surveyItems.length === 0 ? (
                    <div className="border rounded-xl p-8 text-center">
                      <h3 className="text-xl font-bold text-[#1b2a4a] mb-2">Survey Analytics</h3>
                      <p className="text-gray-600">No surveys available for analytics yet.</p>
                    </div>
                  ) : (
                    <>
                      <div className="border rounded-xl p-4 bg-white">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-bold text-[#1b2a4a]">Survey Analytics</h3>
                            <p className="text-sm text-gray-500">Select a survey to view detailed analytics</p>
                          </div>
                          <select
                            value={selectedSurveyId ?? ''}
                            onChange={(e) => handleSelectedSurveyChange(e.target.value ? Number(e.target.value) : null)}
                            className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[260px]"
                          >
                            <option value="">Select a saved survey</option>
                            {surveyItems.map((survey) => (
                              <option key={survey.id} value={survey.id}>
                                {survey.title}
                                {survey.archived_at ? ' (Archived)' : survey.status === 'active' ? ' (Active)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {surveyAnalyticsLoading ? (
                        <SurveyAnalyticsLoadingSkeleton />
                      ) : !selectedSurveyId ? (
                        <div className="text-center py-12 border rounded-xl bg-white">
                          <p className="font-semibold text-[#1b2a4a]">Select a survey to load saved analytics.</p>
                          <p className="text-sm text-gray-500 mt-1">Inactive surveys keep their old responses and can still be reviewed here.</p>
                        </div>
                      ) : !surveyAnalytics ? (
                        <div className="text-center py-12 border rounded-xl bg-white">
                          <p className="font-semibold text-red-600">
                            {surveyAnalyticsError || 'Unable to load survey analytics. Please try again.'}
                          </p>
                        </div>
                      ) : surveyAnalytics.total_responses === 0 ? (
                        <div className="rounded-xl border bg-white px-6 py-12 text-center">
                          <p className="font-semibold text-[#1b2a4a]">No survey responses are available for this selection.</p>
                          <p className="mt-1 text-sm text-gray-500">Try another batch or tracer survey.</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {Array.isArray(surveyAnalytics.unavailable_reasons) && surveyAnalytics.unavailable_reasons.length > 0 && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                              <p className="font-semibold">Some analytics are unavailable for this survey version:</p>
                              <ul className="mt-1 list-disc space-y-1 pl-5">
                                {surveyAnalytics.unavailable_reasons.map((reason) => <li key={reason}>{reason}</li>)}
                              </ul>
                            </div>
                          )}
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h2 className="text-xl font-bold text-[#1b2a4a]">{surveyAnalytics.survey_title}</h2>
                              <p className="text-sm text-gray-500">Survey Analytics & Insights</p>
                            </div>
                            {surveyReportTables.length > 0 && (
                              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                                <SurveyTableFilter
                                  tables={surveyReportTables}
                                  value={selectedSurveyTable}
                                  onChange={handleSurveyTableChange}
                                />

                                {surveyReportGraphCount > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setShowSurveyGraphs((current) => !current)}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#1b2a4a] px-4 py-2.5 text-sm font-semibold text-[#1b2a4a] transition-colors hover:bg-[#1b2a4a] hover:text-white sm:w-auto"
                                  >
                                    <BarChart3 className="w-4 h-4" />
                                    {showSurveyGraphs ? 'Show Tables' : 'Show Graph'}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {!(surveyAnalytics.report_tables && surveyAnalytics.report_tables.length > 0) && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                              <SurveyAnalyticsStatCard icon={Users} label="Total Responses" value={surveyAnalytics.total_responses.toString()} color="bg-blue-100 text-blue-700" />
                              <SurveyAnalyticsStatCard icon={TrendingUp} label="Response Rate" value={formatNullableRate(surveyAnalytics.response_rate)} color="bg-green-100 text-green-700" />
                              <SurveyAnalyticsStatCard icon={CheckCircle2} label="Completion Rate" value={formatNullableRate(surveyAnalytics.completion_rate)} color="bg-purple-100 text-purple-700" />
                              <SurveyAnalyticsStatCard icon={BarChart3} label="Questions" value={surveyAnalytics.questions_analytics.length.toString()} color="bg-orange-100 text-orange-700" />
                            </div>
                          )}

                          {surveyReportTables.length > 0 ? (
                            showSurveyGraphs ? (
                              <SurveyReportGraphs tables={visibleSurveyReportTables} />
                            ) : (
                              <SurveyNumberedReportTables tables={visibleSurveyReportTables} />
                            )
                          ) : (
                            <SurveyQuestionReportTable analytics={surveyAnalytics} />
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Inferential Analysis */}
              {tab === 'inferential' && (
                <InferentialAnalysisPanel
                  selectedSurveyId={selectedSurveyId}
                  metadata={inferentialMetadata}
                  settings={inferentialSettings}
                  result={inferentialResult}
                  metadataLoading={inferentialMetadataLoading}
                  analysisLoading={inferentialAnalysisLoading}
                  error={inferentialError}
                  testsGraduationYear={inferentialTestsGraduationYear}
                  testsProgram={inferentialTestsProgram}
                  variablesMatch={inferentialVariablesMatch}
                  onSettingChange={updateInferentialSetting}
                  onReset={handleResetInferential}
                  onRun={runInferentialAnalysis}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InferentialResults({ result }: { result: InferentialAnalysisResult }) {
  const { analysis, contingencyTable, assumptions } = result;
  const comparisonCopy = getInferentialComparisonCopy(result);
  const groupResult = getInferentialGroupResult(result);
  const relationshipSummary = getInferentialPlainOutcome(result);
  const strengthLabel = analysis.canCalculate
    ? getInferentialDifferenceLabel(analysis.associationStrength)
    : 'Cannot be measured';
  const dataCheckLabel = !analysis.canCalculate
    ? 'Cannot compare'
    : assumptions.passed
      ? 'Passed'
      : 'Use caution';
  const decisionColor = analysis.significant === true
    ? 'bg-green-100 text-green-700'
    : analysis.significant === false
      ? 'bg-slate-100 text-slate-700'
      : 'bg-amber-100 text-amber-700';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <InferentialStatCard
          icon={Users}
          label="Answers Compared"
          value={analysis.validResponses.toLocaleString()}
          subtext="Complete answers used in this comparison"
          color="bg-blue-100 text-blue-700"
        />
        <InferentialStatCard
          icon={!analysis.canCalculate ? AlertTriangle : analysis.significant ? CheckCircle2 : BarChart3}
          label="Group Results"
          value={groupResult}
          subtext={relationshipSummary}
          color={decisionColor}
          compact
        />
        <InferentialStatCard
          icon={Target}
          label="Association Strength"
          value={strengthLabel}
          subtext="Cramer's V effect size"
          color="bg-purple-100 text-purple-700"
          compact
        />
        <InferentialStatCard
          icon={Filter}
          label="Answers Left Out"
          value={analysis.excludedResponses.toLocaleString()}
          subtext="Missing or incomplete answers"
          color="bg-orange-100 text-orange-700"
        />
        <InferentialStatCard
          icon={assumptions.passed && analysis.canCalculate ? CheckCircle2 : AlertTriangle}
          label="Data Check"
          value={dataCheckLabel}
          subtext={assumptions.passed && analysis.canCalculate ? 'No common sample-size warning' : 'Review the note below'}
          color={assumptions.passed && analysis.canCalculate ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}
          compact
        />
      </div>

      {result.status === 'insufficient_variation' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
            <div>
              <p className="font-semibold">These groups cannot be compared</p>
              <p className="mt-1">{getInferentialUnavailableResult(result)}</p>
            </div>
          </div>
        </div>
      )}

      {result.chartData.categories.length > 0 && (
        <div className="rounded-xl border p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-[#1b2a4a]">{analysis.variable2.label} by {analysis.variable1.label}</h3>
            <p className="mt-1 text-xs text-gray-500">Grouped comparison of the observed category counts used in the test.</p>
          </div>
          <div className="overflow-x-auto">
            <div className="h-[340px] min-w-[640px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={result.chartData.categories} margin={{ top: 12, right: 24, bottom: 28, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} interval={0} angle={-12} textAnchor="end" height={58} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8 }} />
                  <Legend />
                  {result.chartData.series.map((series, index) => (
                    <Bar
                      key={series.key}
                      dataKey={series.key}
                      name={series.label}
                      fill={SURVEY_CHART_COLORS[index % SURVEY_CHART_COLORS.length]}
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="rounded-xl border p-5 xl:col-span-3">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-[#1b2a4a]">Contingency Table</h3>
            <p className="mt-1 text-xs text-gray-500">Observed Frequencies</p>
          </div>
          <InferentialFrequencyTable table={contingencyTable} />
        </div>

        <div className="rounded-xl border p-5 xl:col-span-2">
          <h3 className="text-sm font-semibold text-[#1b2a4a]">Analysis Summary</h3>
          <p className="mt-1 text-xs text-gray-500">A simple explanation of what the comparison found.</p>
          <div className={`mt-4 rounded-lg px-4 py-3 ${decisionColor}`}>
            <p className="font-semibold">{relationshipSummary}</p>
            <p className="mt-1 text-xs opacity-90">
              {analysis.canCalculate
                ? `Cramer's V effect size: ${strengthLabel.toLowerCase()}.`
                : 'The selected answers do not contain enough variation for a reliable comparison.'}
            </p>
          </div>
          <dl className="divide-y text-sm">
            <InferentialDetail label="What was compared?" value={comparisonCopy.question} />
            <InferentialDetail label="What does the data show?" value={relationshipSummary} />
            <InferentialDetail label="Association strength (Cramer's V)" value={strengthLabel} />
            <InferentialDetail label="Answers compared" value={analysis.validResponses.toLocaleString()} />
            <InferentialDetail label="Answers left out" value={analysis.excludedResponses.toLocaleString()} />
            <InferentialDetail label="Data check" value={dataCheckLabel} />
          </dl>
          <details className="mt-4 rounded-lg border bg-gray-50">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[#1b2a4a]">
              View technical statistical details
            </summary>
            <div className="border-t bg-white px-4 pb-2">
              <p className="py-3 text-xs leading-relaxed text-gray-500">
                These values are included for researchers and report verification.
              </p>
              <dl className="divide-y text-sm">
                <InferentialDetail label="Statistical method" value={analysis.test} />
                <InferentialDetail label="Chi-Square" value={formatInferentialStatistic(analysis.chiSquare)} />
                <InferentialDetail label="Degrees of freedom" value={analysis.degreesOfFreedom?.toString() ?? 'Not calculated'} />
                <InferentialDetail label="p-value" value={formatInferentialPValue(analysis.pValue)} />
                <InferentialDetail label="Significance level" value={analysis.alpha.toFixed(2)} />
                <InferentialDetail label="Cramer's V" value={formatInferentialStatistic(analysis.cramersV)} />
              </dl>
            </div>
          </details>
        </div>
      </div>

      <AIStatisticalInterpretation context={result.aiInterpretation} />

      <div className={`rounded-xl border px-4 py-4 text-sm ${
        assumptions.passed
          ? 'border-green-200 bg-green-50 text-green-900'
          : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}>
        <div className="flex items-start gap-3">
          {assumptions.passed
            ? <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none" />
            : <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />}
          <div>
            <h3 className="font-semibold">Data Quality Check</h3>
            {assumptions.passed ? (
              <p className="mt-1">The response groups are large enough for this comparison. No common sample-size warning was found.</p>
            ) : (
              <p className="mt-1">Some groups have very few responses. Treat the result as an indication, not a final conclusion.</p>
            )}
            <details className="mt-2 text-xs opacity-80">
              <summary className="cursor-pointer font-semibold">View technical data-check details</summary>
              {!assumptions.passed && assumptions.warnings.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {assumptions.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
              <p className="mt-2">
                Expected cells below 5: {assumptions.cellsBelowFive} ({assumptions.percentageBelowFive.toFixed(1)}%); below 1: {assumptions.cellsBelowOne}; minimum expected: {formatInferentialStatistic(assumptions.minimumExpected)}.
              </p>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}

function InferentialStatCard({ icon: Icon = BarChart3, label, value, subtext, color, compact = false }: {
  icon?: typeof BarChart3;
  label: string;
  value: string;
  subtext?: string;
  color: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className={`rounded-lg p-2 ${color}`}><Icon className="h-4 w-4" /></div>
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p className={`${compact ? 'text-base leading-snug' : 'text-2xl'} font-bold text-[#1b2a4a]`}>{value}</p>
      {subtext && <p className="mt-1 text-xs leading-snug text-gray-500">{subtext}</p>}
    </div>
  );
}

function InferentialDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-2 sm:gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-semibold text-[#1b2a4a] sm:text-right">{value}</dd>
    </div>
  );
}

function InferentialFrequencyTable({ table }: { table: InferentialTable }) {
  const formatCell = (value: number) => Number(value).toLocaleString();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="bg-[#1b2a4a] text-white">
            <th className="border border-slate-300 px-3 py-2 text-left">{table.rowVariable.label}</th>
            {table.columns.map((column) => (
              <th key={column.key} className="border border-slate-300 px-3 py-2 text-center">{column.label}</th>
            ))}
            <th className="border border-slate-300 px-3 py-2 text-center">Total</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.key} className="odd:bg-white even:bg-gray-50">
              <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-[#1b2a4a]">{row.label}</th>
              {row.frequencies.map((frequency, index) => (
                <td key={`${row.key}-${table.columns[index]?.key ?? index}`} className="border border-gray-200 px-3 py-2 text-center">
                  {formatCell(frequency)}
                </td>
              ))}
              <td className="border border-gray-200 px-3 py-2 text-center font-semibold">{formatCell(row.total)}</td>
            </tr>
          ))}
          <tr className="bg-gray-100 font-bold text-[#1b2a4a]">
            <th className="border border-gray-200 px-3 py-2 text-left">Total</th>
            {table.columnTotals.map((total, index) => (
              <td key={table.columns[index]?.key ?? index} className="border border-gray-200 px-3 py-2 text-center">{formatCell(total)}</td>
            ))}
            <td className="border border-gray-200 px-3 py-2 text-center">{formatCell(table.grandTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function InferentialLoadingSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading inferential analysis settings">
      <div className="rounded-xl border bg-gray-50 p-4">
        <SkeletonBlock className="mb-4 h-4 w-52" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <SkeletonBlock key={index} className="h-16" />)}
        </div>
      </div>
      <SkeletonBlock className="h-32 w-full" />
    </div>
  );
}

function InferentialResultLoadingSkeleton() {
  return (
    <div className="space-y-6" aria-label="Running inferential analysis">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => <SkeletonBlock key={index} className="h-28" />)}
      </div>
      <SkeletonBlock className="h-80 w-full" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SkeletonBlock className="h-72" />
        <SkeletonBlock className="h-72" />
      </div>
    </div>
  );
}

function SurveyTableFilter({
  tables,
  value,
  onChange,
}: {
  tables: SurveyReportTable[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const parsedTableIndex = Number(value);
  const selectedOptionIndex = value !== ALL_SURVEY_TABLES_VALUE
    && Number.isInteger(parsedTableIndex)
    && parsedTableIndex >= 0
    && parsedTableIndex < tables.length
    ? parsedTableIndex + 1
    : 0;
  const selectedLabel = selectedOptionIndex === 0
    ? `All tables (${tables.length})`
    : `Table ${tables[selectedOptionIndex - 1].number} - ${tables[selectedOptionIndex - 1].title}`;
  const optionCount = tables.length + 1;

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const frame = window.requestAnimationFrame(() => {
      optionRefs.current[selectedOptionIndex]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, selectedOptionIndex]);

  const closeAndFocusTrigger = () => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const selectOption = (nextValue: string) => {
    onChange(nextValue);
    closeAndFocusTrigger();
  };

  const focusOption = (index: number) => {
    const wrappedIndex = (index + optionCount) % optionCount;
    optionRefs.current[wrappedIndex]?.focus();
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusOption(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusOption(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusOption(0);
        break;
      case 'End':
        event.preventDefault();
        focusOption(optionCount - 1);
        break;
      case 'Escape':
        event.preventDefault();
        closeAndFocusTrigger();
        break;
      default:
        break;
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full sm:w-[360px]">
      <button
        ref={triggerRef}
        type="button"
        className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-[#1b2a4a] transition hover:border-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label="Filter survey analytics table"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="survey-table-filter-options"
        title={selectedLabel}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            setOpen(false);
          }
        }}
      >
        <Filter className="h-4 w-4 flex-none" aria-hidden="true" />
        <span className="flex-none whitespace-nowrap text-sm font-semibold text-gray-700">Table:</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{selectedLabel}</span>
        <ChevronDown
          className={`h-4 w-4 flex-none text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id="survey-table-filter-options"
          className="absolute right-0 z-40 mt-1 max-h-64 w-full max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white py-1 shadow-xl sm:w-[36rem]"
          role="listbox"
          aria-label="Survey analytics tables"
        >
          <button
            ref={(element) => { optionRefs.current[0] = element; }}
            type="button"
            role="option"
            aria-selected={selectedOptionIndex === 0}
            className={`survey-table-filter-option flex w-full items-start gap-2 px-3 py-2 text-left text-sm leading-5 transition-colors hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none ${
              selectedOptionIndex === 0 ? 'bg-blue-50 font-semibold text-blue-900' : 'text-gray-700'
            }`}
            onClick={() => selectOption(ALL_SURVEY_TABLES_VALUE)}
            onKeyDown={(event) => handleOptionKeyDown(event, 0)}
          >
            <span className="mt-0.5 h-4 w-4 flex-none">
              {selectedOptionIndex === 0 && <Check className="h-4 w-4" aria-hidden="true" />}
            </span>
            <span>All tables ({tables.length})</span>
          </button>

          {tables.map((table, index) => {
            const optionIndex = index + 1;
            const isSelected = optionIndex === selectedOptionIndex;
            return (
              <button
                key={`${table.number}-${index}`}
                ref={(element) => { optionRefs.current[optionIndex] = element; }}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`survey-table-filter-option flex w-full items-start gap-2 px-3 py-2 text-left text-sm leading-5 transition-colors hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none ${
                  isSelected ? 'bg-blue-50 font-semibold text-blue-900' : 'text-gray-700'
                }`}
                onClick={() => selectOption(index.toString())}
                onKeyDown={(event) => handleOptionKeyDown(event, optionIndex)}
              >
                <span className="mt-0.5 h-4 w-4 flex-none">
                  {isSelected && <Check className="h-4 w-4" aria-hidden="true" />}
                </span>
                <span>Table {table.number} - {table.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InferentialAnalysisPanel({
  selectedSurveyId,
  metadata: inferentialMetadata,
  settings: inferentialSettings,
  result: inferentialResult,
  metadataLoading: inferentialMetadataLoading,
  analysisLoading: inferentialAnalysisLoading,
  error: inferentialError,
  testsGraduationYear: inferentialTestsGraduationYear,
  testsProgram: inferentialTestsProgram,
  variablesMatch: inferentialVariablesMatch,
  onSettingChange: updateInferentialSetting,
  onReset: handleResetInferential,
  onRun: runInferentialAnalysis,
}: {
  selectedSurveyId: number | null;
  metadata: InferentialMetadata | null;
  settings: InferentialSettings;
  result: InferentialAnalysisResult | null;
  metadataLoading: boolean;
  analysisLoading: boolean;
  error: string;
  testsGraduationYear: boolean;
  testsProgram: boolean;
  variablesMatch: boolean;
  onSettingChange: <K extends keyof InferentialSettings>(key: K, value: InferentialSettings[K]) => void;
  onReset: () => void;
  onRun: () => void;
}) {
    if (!selectedSurveyId) {
      return (
        <div className="rounded-xl border bg-white px-6 py-12 text-center">
          <p className="font-semibold text-[#1b2a4a]">Select a survey to configure inferential analysis.</p>
          <p className="mt-1 text-sm text-gray-500">Only responses belonging to the selected survey will be analyzed.</p>
        </div>
      );
    }

    if (inferentialMetadataLoading || (!inferentialMetadata && !inferentialError)) {
      return <InferentialLoadingSkeleton />;
    }

    if (!inferentialMetadata) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center">
          <p className="font-semibold text-red-700">{inferentialError || 'Unable to load inferential analysis settings.'}</p>
          <p className="mt-1 text-sm text-red-600">Select another survey or reopen this tab to retry.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="rounded-xl border bg-gray-50 p-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-[#1b2a4a]" />
                  <h3 className="text-sm font-semibold text-[#1b2a4a]">Inferential Analysis Settings</h3>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Select two categorical graduate tracer variables to test whether they are statistically associated.
                </p>
              </div>
              {inferentialAnalysisLoading && (
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-b-[#1b2a4a]" />
                  Running analysis...
                </div>
              )}
            </div>

            {inferentialMetadata && inferentialMetadata.variables.length >= 2 ? (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                    Variable 1
                    <select
                      value={inferentialSettings.variable1}
                      onChange={(event) => updateInferentialSetting('variable1', event.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select a variable</option>
                      {inferentialMetadata.variables.map((variable) => (
                        <option key={variable.key} value={variable.key}>{variable.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                    Variable 2
                    <select
                      value={inferentialSettings.variable2}
                      onChange={(event) => updateInferentialSetting('variable2', event.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select a variable</option>
                      {inferentialMetadata.variables.map((variable) => (
                        <option key={variable.key} value={variable.key}>{variable.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                    Year Graduated
                    <select
                      value={inferentialTestsGraduationYear ? 'all' : inferentialSettings.graduationYear}
                      onChange={(event) => updateInferentialSetting('graduationYear', event.target.value)}
                      disabled={inferentialTestsGraduationYear}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      <option value="all">All Years</option>
                      {inferentialMetadata.filterOptions.years.map((year) => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    {inferentialTestsGraduationYear && <span className="font-normal text-gray-400">Disabled because Year Graduated is being compared.</span>}
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                    Course or Program
                    <select
                      value={inferentialTestsProgram ? 'all' : inferentialSettings.programId}
                      onChange={(event) => updateInferentialSetting('programId', event.target.value)}
                      disabled={inferentialTestsProgram}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      <option value="all">All Courses</option>
                      {inferentialMetadata.filterOptions.programs.map((program) => (
                        <option key={program.id} value={program.id}>{program.code} - {program.name}</option>
                      ))}
                    </select>
                    {inferentialTestsProgram && <span className="font-normal text-gray-400">Disabled because Course or Program is being tested.</span>}
                  </label>
                </div>

                {inferentialVariablesMatch && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                    Please select two different variables for inferential analysis.
                  </div>
                )}

                <div className="flex flex-col justify-end gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleResetInferential}
                    disabled={inferentialAnalysisLoading}
                    className="flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RotateCcw className="h-4 w-4" /> Reset
                  </button>
                  <button
                    type="button"
                    onClick={runInferentialAnalysis}
                    disabled={inferentialAnalysisLoading || inferentialVariablesMatch || !inferentialSettings.variable1 || !inferentialSettings.variable2}
                    className="flex items-center justify-center gap-2 rounded-lg bg-[#1b2a4a] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#24385f] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <BarChart3 className="h-4 w-4" />
                    {inferentialAnalysisLoading ? 'Running Analysis...' : 'Run Analysis'}
                  </button>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                This survey does not contain at least two supported categorical variables for inferential analysis.
              </div>
            )}
          </div>
        </div>

        {inferentialError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {inferentialError}
          </div>
        )}

        {inferentialAnalysisLoading ? (
          <InferentialResultLoadingSkeleton />
        ) : !inferentialResult ? (
          <div className="rounded-xl border bg-white px-6 py-12 text-center">
            <BarChart3 className="mx-auto mb-3 h-10 w-10 text-blue-500" />
            <p className="font-semibold text-[#1b2a4a]">Select two graduate tracer variables and click Run Analysis to perform an inferential statistical analysis.</p>
            <p className="mt-1 text-sm text-gray-500">The Chi-Square test uses valid paired responses only.</p>
          </div>
        ) : (
          <InferentialResults result={inferentialResult} />
        )}
      </div>
    );
}

function SkeletonBlock({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200 ${className}`} style={style} />;
}

function OverviewLoadingSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading report data">
      <p className="text-sm font-medium text-gray-500">Loading reports...</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="rounded-xl border p-4">
            <div className="mb-4 flex items-center gap-2">
              <SkeletonBlock className="h-9 w-9" />
              <SkeletonBlock className="h-3 w-28" />
            </div>
            <SkeletonBlock className="h-8 w-16" />
            <SkeletonBlock className="mt-2 h-3 w-12" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-xl border p-5">
            <SkeletonBlock className="mb-4 h-4 w-36" />
            <div className="flex h-64 items-center justify-center">
              <SkeletonBlock className="h-36 w-36 rounded-full" />
            </div>
            <div className="mt-2 flex justify-center gap-4">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-xl border p-5">
            <SkeletonBlock className="mb-4 h-4 w-40" />
            <div className="flex h-64 items-center justify-center">
              <SkeletonBlock className="h-36 w-36 rounded-full" />
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {Array.from({ length: 5 }).map((__, chipIndex) => (
                <SkeletonBlock key={chipIndex} className="h-3 w-12" />
              ))}
            </div>
          </div>
        ))}
      </div>

      <AiAnalyticsSkeleton framed />
    </div>
  );
}

function ReportTabLoadingSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading report tab">
      <p className="text-sm font-medium text-gray-500">Loading reports...</p>
      <div className="rounded-xl border p-5">
        <SkeletonBlock className="mb-5 h-4 w-44" />
        <div className="flex h-72 items-end gap-3">
          {Array.from({ length: 9 }).map((_, index) => (
            <SkeletonBlock
              key={index}
              className="flex-1"
              style={{
                height: `${80 + ((index * 37) % 150)}px`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="grid grid-cols-5 gap-3">
              <SkeletonBlock className="col-span-2 h-4" />
              <SkeletonBlock className="h-4" />
              <SkeletonBlock className="h-4" />
              <SkeletonBlock className="h-4" />
            </div>
          ))}
        </div>
      </div>

      <AiAnalyticsSkeleton framed />
    </div>
  );
}

function SurveyAnalyticsLoadingSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading survey analytics">
      <p className="text-sm font-medium text-gray-500">Loading reports...</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border p-5">
            <div className="mb-4 flex items-center gap-3">
              <SkeletonBlock className="h-9 w-9" />
              <SkeletonBlock className="h-4 w-28" />
            </div>
            <SkeletonBlock className="h-9 w-20" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border p-5">
        <SkeletonBlock className="mb-5 h-5 w-56" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="grid grid-cols-7 gap-3">
              <SkeletonBlock className="col-span-3 h-4" />
              <SkeletonBlock className="col-span-2 h-4" />
              <SkeletonBlock className="h-4" />
              <SkeletonBlock className="h-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportEmptyState({ batchLabel }: { batchLabel: string }) {
  return (
    <div className="rounded-xl border bg-white px-6 py-12 text-center">
      <p className="font-semibold text-[#1b2a4a]">No report data is available for the selected batch.</p>
      <p className="mt-1 text-sm text-gray-500">Current selection: {batchLabel}</p>
    </div>
  );
}

function AiAnalyticsSkeleton({ framed = false }: { framed?: boolean }) {
  const content = (
    <div className="space-y-4" aria-label="Generating descriptive analytics">
      <div className="flex items-center gap-3">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-300 border-b-purple-600" />
        <span className="text-sm font-medium text-gray-600">Generating descriptive analytics...</span>
      </div>
      {Array.from({ length: 3 }).map((_, sectionIndex) => (
        <div key={sectionIndex} className={sectionIndex > 0 ? 'border-t border-purple-100 pt-4 dark:border-purple-400/20' : ''}>
          <SkeletonBlock className="mb-3 h-4 w-40" />
          <div className="space-y-2">
            <SkeletonBlock className="h-3 w-full" />
            <SkeletonBlock className="h-3 w-11/12" />
            <SkeletonBlock className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );

  if (!framed) {
    return content;
  }

  return (
    <div className="rounded-xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 via-blue-50 to-slate-50 p-6 shadow-lg dark:border-purple-400/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      {content}
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

type BatchTrendTooltipMode = 'employment' | 'alignment';

function formatBatchTrendRate(value: number | null | undefined): string {
  const rate = Number(value);
  return value !== null && value !== undefined && Number.isFinite(rate)
    ? rate.toFixed(1) + '%'
    : 'Not available';
}

function BatchTrendTooltip({ active, payload, mode }: {
  active?: boolean;
  payload?: Array<{ payload?: BatchTrendReport }>;
  mode: BatchTrendTooltipMode;
}) {
  const row = payload?.find((item) => item.payload)?.payload;
  if (!active || !row) {
    return null;
  }

  return (
    <div className="max-w-[220px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-[#1b2a4a]">Batch: {row.year_graduated}</p>
      {mode === 'employment' && (
        <>
          <p className="text-emerald-700">Employed: {row.employed}</p>
          <p className="text-red-600">Unemployed: {row.unemployed}</p>
          <p className="mt-1 text-gray-600">Employment Rate: {formatBatchTrendRate(row.employment_rate)}</p>
        </>
      )}
      {mode === 'alignment' && (
        <>
          <p className="text-orange-600">Aligned: {row.aligned}</p>
          <p className="text-slate-600">Not Aligned: {row.not_aligned}</p>
          <p className="mt-1 text-gray-600">Alignment Rate: {formatBatchTrendRate(row.alignment_rate)}</p>
        </>
      )}
    </div>
  );
}

function DeanBatchTrendCharts({ data }: { data: BatchTrendReport[] }) {
  const chartData = data
    .filter((row) => Number.isFinite(Number(row.year_graduated)))
    .map((row) => ({ ...row }))
    .slice()
    .sort((a, b) => Number(a.year_graduated) - Number(b.year_graduated));
  const employmentAxisMax = Math.max(
    1,
    ...chartData.map((row) => Number(row.employed || 0) + Number(row.unemployed || 0)),
  );
  const alignmentAxisMax = Math.max(
    1,
    ...chartData.map((row) => Number(row.aligned || 0) + Number(row.not_aligned || 0)),
  );

  const countAxisLabel = {
    value: 'Number of Graduates',
    angle: -90,
    position: 'insideLeft' as const,
    style: { fill: '#64748b', fontSize: 11 },
  };
  const batchAxisLabel = {
    value: 'Batch',
    position: 'insideBottom' as const,
    offset: -8,
    style: { fill: '#64748b', fontSize: 11 },
  };

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="min-w-0 rounded-xl border p-5">
        <h3 className="mb-4 text-sm font-semibold text-[#1b2a4a]">Employment Trend by Batch</h3>
        <div className="h-72 min-w-0">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 28, left: 14 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="year_graduated" label={batchAxisLabel} minTickGap={12} />
                <YAxis allowDecimals={false} domain={[0, employmentAxisMax]} label={countAxisLabel} width={46} />
                <Tooltip content={<BatchTrendTooltip mode="employment" />} cursor={{ fill: '#f8fafc' }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="employed" name="Employed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="unemployed" name="Unemployed" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <OverviewChartEmptyState message="No graduation-year scope is configured for the selected survey." />
          )}
        </div>
      </div>

      <div className="min-w-0 rounded-xl border p-5">
        <h3 className="mb-4 text-sm font-semibold text-[#1b2a4a]">Job Alignment by Batch</h3>
        <div className="h-72 min-w-0">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 28, left: 14 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="year_graduated" label={batchAxisLabel} minTickGap={12} />
                <YAxis allowDecimals={false} domain={[0, alignmentAxisMax]} label={countAxisLabel} width={46} />
                <Tooltip content={<BatchTrendTooltip mode="alignment" />} cursor={{ fill: '#f8fafc' }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="aligned" name="Aligned" stackId="alignment" fill="#f59e0b" />
                <Bar dataKey="not_aligned" name="Not Aligned" stackId="alignment" fill="#94a3b8" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <OverviewChartEmptyState message="No graduation-year scope is configured for the selected survey." />
          )}
        </div>
      </div>

    </div>
  );
}

function OverviewChartEmptyState({ message = 'No chart data for the selected filters.' }: { message?: string }) {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center rounded-lg bg-gray-50 px-4 text-center text-sm font-medium text-gray-500">
      {message}
    </div>
  );
}

function SurveyAnalyticsStatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string; color: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm font-medium text-gray-600">{label}</span>
      </div>
      <p className="text-3xl font-bold text-[#1b2a4a]">{value}</p>
    </div>
  );
}

function SurveyNumberedReportTables({ tables }: { tables: SurveyReportTable[] }) {
  return (
    <div className="survey-report-paper rounded-xl border p-5 shadow-sm sm:p-8">
      <div className="space-y-10" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
        {tables.map((table, index) => (
          <ThesisReportTable key={`${table.number}-${index}`} table={table} />
        ))}
      </div>
    </div>
  );
}

function SurveyReportGraphs({ tables }: { tables: SurveyReportTable[] }) {
  const charts = buildSurveyReportCharts(tables);

  if (charts.length === 0) {
    return (
      <div className="survey-report-paper rounded-xl border p-8 text-center">
        <p className="font-semibold text-[#1b2a4a]">No graph-ready data found.</p>
        <p className="mt-1 text-sm text-gray-500">The current survey tables do not have count columns that can be charted.</p>
      </div>
    );
  }

  return (
    <div className="survey-report-paper rounded-xl border p-5 shadow-sm sm:p-6">
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-[#1b2a4a]">Survey Graphs</h3>
          <p className="text-sm text-gray-500">Charts are generated from the frequency and count columns in each report table.</p>
        </div>
        <span className="text-sm font-semibold text-[#1b2a4a]">{charts.length} graphs</span>
      </div>

      <div className="space-y-8">
        {charts.map((chart) => (
          <section key={`${chart.tableNumber}-${chart.title}`} className="survey-chart-card rounded-xl border p-4 sm:p-5">
            <div className="mb-4">
              <h4 className="text-base font-bold text-[#1b2a4a]">{chart.title}</h4>
              <p className="mt-1 text-xs text-gray-500">Graph based on available frequency/count values.</p>
            </div>
            <div className="overflow-x-auto">
              <div className="h-[360px] min-w-[720px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart.data} margin={{ top: 12, right: 24, bottom: 16, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      angle={-18}
                      textAnchor="end"
                      interval={0}
                      height={100}
                    />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {chart.series.map((series) => (
                      <Bar
                        key={series.key}
                        dataKey={series.key}
                        name={series.name}
                        fill={series.color}
                        radius={[4, 4, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ThesisReportTable({ table }: { table: SurveyReportTable }) {
  return (
    <section className="break-inside-avoid">
      {table.section_title && (
        <h3 className="text-base font-bold mb-2">{table.section_title}</h3>
      )}
      <h4 className="text-base font-bold mb-1">
        Table {table.number}. {table.title}
      </h4>
      <div className="overflow-x-auto">
        <table className="survey-report-table w-full min-w-[620px] border-collapse text-[15px] leading-tight">
          <thead>
            {table.headers.map((headerRow, rowIndex) => (
              <tr key={rowIndex}>
                {headerRow.map((cell, cellIndex) => (
                  <th
                    key={`${rowIndex}-${cellIndex}`}
                    colSpan={cell.colspan ?? 1}
                    rowSpan={cell.rowspan ?? 1}
                    className={`px-2 py-1 font-bold ${
                      rowIndex === 0 ? 'border-t' : ''
                    } ${
                      rowIndex === table.headers.length - 1 ? 'border-b' : ''
                    } ${getReportCellAlignClass(cell.align)}`}
                  >
                    {cell.label}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={row.is_total ? 'survey-report-total' : row.is_group ? 'survey-report-group' : ''}>
                {row.cells.map((cell, cellIndex) => (
                  <td
                    key={`${rowIndex}-${cellIndex}`}
                    className={`px-2 py-0.5 ${
                      row.is_total ? 'font-bold border-t' : ''
                    } ${
                      row.is_group ? 'font-bold' : ''
                    } ${
                      rowIndex === table.rows.length - 1 ? 'border-b' : ''
                    } ${cellIndex === 0 ? 'text-left' : 'text-center'}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.note && (
        <p className="mt-1 text-sm italic">{table.note}</p>
      )}
    </section>
  );
}

function buildSurveyReportCharts(tables: SurveyReportTable[]): SurveyReportChart[] {
  return tables
    .map(buildSurveyReportChart)
    .filter((chart): chart is SurveyReportChart => chart !== null);
}

function buildSurveyReportChart(table: SurveyReportTable): SurveyReportChart | null {
  const headerLabels = flattenSurveyReportHeaders(table);
  const chartColumnIndexes = getSurveyChartColumnIndexes(table, headerLabels).slice(0, 8);

  if (chartColumnIndexes.length === 0) {
    return null;
  }

  const firstMetricColumn = Math.min(...chartColumnIndexes);
  const data: SurveyReportChartRow[] = [];
  let currentGroup = '';

  table.rows.forEach((row) => {
    const firstCell = String(row.cells[0] ?? '').trim();

    if (row.is_group) {
      currentGroup = firstCell;
      return;
    }

    if (row.is_total) {
      return;
    }

    const descriptor = row.cells
      .slice(0, firstMetricColumn)
      .map((cell) => String(cell ?? '').trim())
      .filter(Boolean)
      .join(' - ');
    const rawLabel = descriptor || firstCell || `Row ${data.length + 1}`;
    const groupedLabel = currentGroup && !rawLabel.toLowerCase().startsWith(currentGroup.toLowerCase())
      ? `${currentGroup}: ${rawLabel}`
      : rawLabel;
    const chartRow: SurveyReportChartRow = {
      label: truncateSurveyChartText(groupedLabel.replace(/\s+/g, ' '), 44),
    };
    let hasValue = false;

    chartColumnIndexes.forEach((columnIndex, seriesIndex) => {
      const value = parseSurveyReportNumber(row.cells[columnIndex]);
      chartRow[`value_${seriesIndex}`] = value ?? 0;
      hasValue = hasValue || Number(value ?? 0) > 0;
    });

    if (hasValue) {
      data.push(chartRow);
    }
  });

  if (data.length === 0) {
    return null;
  }

  const series = chartColumnIndexes.map((columnIndex, seriesIndex) => ({
    key: `value_${seriesIndex}`,
    name: truncateSurveyChartText(headerLabels[columnIndex] || `Column ${columnIndex + 1}`, 36),
    color: SURVEY_CHART_COLORS[seriesIndex % SURVEY_CHART_COLORS.length],
  }));

  return {
    tableNumber: table.number,
    title: `Table ${table.number}. ${table.title}`,
    data,
    series,
  };
}

function getSurveyChartColumnIndexes(table: SurveyReportTable, headerLabels: string[]): number[] {
  const columnCount = getSurveyReportTableColumnCount(table);
  const chartColumns: number[] = [];

  for (let columnIndex = 1; columnIndex < columnCount; columnIndex += 1) {
    const headerLabel = headerLabels[columnIndex] || '';
    if (isSurveyNonChartMetric(headerLabel)) {
      continue;
    }

    const values = table.rows
      .filter((row) => !row.is_total && !row.is_group)
      .map((row) => parseSurveyReportNumber(row.cells[columnIndex]))
      .filter((value): value is number => value !== null);

    if (values.length > 0 && values.some((value) => value > 0)) {
      chartColumns.push(columnIndex);
    }
  }

  return chartColumns;
}

function flattenSurveyReportHeaders(table: SurveyReportTable): string[] {
  const columnCount = getSurveyReportTableColumnCount(table);
  const grid: string[][] = [];

  table.headers.forEach((headerRow, rowIndex) => {
    grid[rowIndex] = grid[rowIndex] ?? [];
    let columnIndex = 0;

    headerRow.forEach((cell) => {
      while (grid[rowIndex][columnIndex]) {
        columnIndex += 1;
      }

      const colSpan = cell.colspan ?? 1;
      const rowSpan = cell.rowspan ?? 1;

      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        const targetRow = rowIndex + rowOffset;
        grid[targetRow] = grid[targetRow] ?? [];

        for (let colOffset = 0; colOffset < colSpan; colOffset += 1) {
          grid[targetRow][columnIndex + colOffset] = cell.label;
        }
      }

      columnIndex += colSpan;
    });
  });

  return Array.from({ length: columnCount }, (_, columnIndex) => {
    const parts: string[] = [];

    grid.forEach((headerRow) => {
      const label = String(headerRow[columnIndex] ?? '').trim();
      if (label && parts[parts.length - 1] !== label) {
        parts.push(label);
      }
    });

    return parts.join(' ').replace(/\s+/g, ' ').trim() || `Column ${columnIndex + 1}`;
  });
}

function isSurveyNonChartMetric(label: string): boolean {
  const normalized = label.toLowerCase();

  return normalized.includes('%')
    || normalized.includes('percentage')
    || normalized.includes('rate')
    || /\brank\b/.test(normalized)
    || /\br\b/.test(normalized);
}

function parseSurveyReportNumber(value: unknown): number | null {
  const text = String(value ?? '').trim();

  if (!text || text === '-') {
    return null;
  }

  const normalized = text.replace(/,/g, '');
  const lessThanMatch = normalized.match(/^<\s*(\d+(?:\.\d+)?)/);
  const numericMatch = lessThanMatch ?? normalized.match(/-?\d+(?:\.\d+)?/);

  if (!numericMatch) {
    return null;
  }

  const parsed = Number(numericMatch[1] ?? numericMatch[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function truncateSurveyChartText(value: string, maxLength: number): string {
  const normalized = value.trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(maxLength - 3, 1))}...`;
}

function getReportCellAlignClass(align?: 'left' | 'center' | 'right') {
  if (align === 'left') {
    return 'text-left';
  }
  if (align === 'right') {
    return 'text-right';
  }
  return 'text-center';
}

function addSurveyExportSummarySheet(
  workbook: ExcelJS.Workbook,
  analytics: SurveyAnalyticsData,
  scopeLabel: string,
  batchLabel: string,
  generatedAt: Date,
) {
  const sheet = workbook.addWorksheet('Summary');
  sheet.addRow(['GradTrack Survey Analytics Export']);
  sheet.mergeCells('A1:B1');
  sheet.getRow(1).font = { bold: true, size: 14, color: { argb: SURVEY_REPORT_HEADER_COLOR } };
  sheet.addRow([]);
  sheet.addRow(['Survey Title', analytics.survey_title]);
  sheet.addRow(['Generated At', generatedAt.toLocaleString()]);
  sheet.addRow(['Program / Department Scope', scopeLabel]);
  sheet.addRow(['Batch / Year Graduated', batchLabel]);
  sheet.addRow(['Total Responses', analytics.total_responses]);
  sheet.addRow(['Response Rate (%)', analytics.response_rate ?? 'No data']);
  sheet.addRow(['Completion Rate (%)', analytics.completion_rate ?? 'No data']);
  sheet.addRow(['Questions', analytics.questions_analytics.length]);
  sheet.addRow(['Report Tables', analytics.report_tables?.length ?? 0]);
  sheet.getColumn(1).width = 24;
  sheet.getColumn(2).width = 64;

  for (let rowIndex = 3; rowIndex <= sheet.rowCount; rowIndex += 1) {
    sheet.getRow(rowIndex).getCell(1).font = { bold: true };
  }
}

function addSurveyReportTableWorksheet(
  workbook: ExcelJS.Workbook,
  table: SurveyReportTable,
  index: number,
) {
  const columnCount = getSurveyReportTableColumnCount(table);
  const sheetName = toWorksheetSafeName(`Table ${index + 1}${table.number ? ` ${table.number}` : ''}`);
  const sheet = workbook.addWorksheet(sheetName);

  if (table.section_title) {
    const sectionRow = sheet.addRow([table.section_title]);
    sectionRow.font = { bold: true, size: 12 };
    sheet.mergeCells(sectionRow.number, 1, sectionRow.number, columnCount);
  }

  const titleRow = sheet.addRow([`Table ${table.number}. ${table.title}`]);
  titleRow.font = { bold: true, size: 12 };
  sheet.mergeCells(titleRow.number, 1, titleRow.number, columnCount);
  sheet.addRow([]);

  const headerStartRow = sheet.rowCount + 1;
  table.headers.forEach(() => {
    sheet.addRow(Array.from({ length: columnCount }, () => ''));
  });

  const occupiedHeaderCells = new Set<string>();
  table.headers.forEach((headerRow, rowIndex) => {
    let columnIndex = 1;

    headerRow.forEach((cell) => {
      while (occupiedHeaderCells.has(`${rowIndex}:${columnIndex}`)) {
        columnIndex += 1;
      }

      const rowNumber = headerStartRow + rowIndex;
      const colSpan = cell.colspan ?? 1;
      const rowSpan = cell.rowspan ?? 1;
      const excelCell = sheet.getCell(rowNumber, columnIndex);
      excelCell.value = cell.label;
      excelCell.font = { bold: true };
      excelCell.alignment = {
        horizontal: cell.align ?? 'center',
        vertical: 'middle',
        wrapText: true,
      };
      excelCell.border = SURVEY_REPORT_TABLE_BORDER;

      if (colSpan > 1 || rowSpan > 1) {
        sheet.mergeCells(rowNumber, columnIndex, rowNumber + rowSpan - 1, columnIndex + colSpan - 1);
      }

      // Ensure full grid borders exist across merged header ranges.
      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        for (let colOffset = 0; colOffset < colSpan; colOffset += 1) {
          const mergedCell = sheet.getCell(rowNumber + rowOffset, columnIndex + colOffset);
          mergedCell.border = SURVEY_REPORT_TABLE_BORDER;
          mergedCell.alignment = {
            horizontal: cell.align ?? 'center',
            vertical: 'middle',
            wrapText: true,
          };
          mergedCell.font = { bold: true };
        }
      }

      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        for (let colOffset = 0; colOffset < colSpan; colOffset += 1) {
          if (rowOffset > 0 || colOffset > 0) {
            occupiedHeaderCells.add(`${rowIndex + rowOffset}:${columnIndex + colOffset}`);
          }
        }
      }

      columnIndex += colSpan;
    });
  });

  table.rows.forEach((row) => {
    const excelRow = sheet.addRow(Array.from({ length: columnCount }, (_, cellIndex) => row.cells[cellIndex] ?? ''));
    if (row.is_group && row.cells.length === 1 && columnCount > 1) {
      sheet.mergeCells(excelRow.number, 1, excelRow.number, columnCount);
    }

    excelRow.eachCell({ includeEmpty: true }, (cell, cellIndex) => {
      cell.border = SURVEY_REPORT_TABLE_BORDER;
      cell.alignment = {
        horizontal: cellIndex === 1 ? 'left' : 'center',
        vertical: 'middle',
        wrapText: true,
      };
    });

    if (row.is_total || row.is_group) {
      excelRow.font = { bold: true };
    }

    if (row.is_group && row.cells.length === 1 && columnCount > 1) {
      const mergedGroupCell = sheet.getCell(excelRow.number, 1);
      mergedGroupCell.alignment = {
        horizontal: 'left',
        vertical: 'middle',
      };
      for (let col = 1; col <= columnCount; col += 1) {
        sheet.getCell(excelRow.number, col).border = SURVEY_REPORT_TABLE_BORDER;
      }
    }
  });

  if (table.note) {
    sheet.addRow([]);
    const noteRow = sheet.addRow([table.note]);
    noteRow.font = { italic: true };
    sheet.mergeCells(noteRow.number, 1, noteRow.number, columnCount);
  }

  for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
    sheet.getColumn(columnIndex).width = columnIndex === 1 ? 34 : 14;
  }
  sheet.views = [{ state: 'frozen', ySplit: headerStartRow + table.headers.length - 1 }];
}

function addSurveyQuestionExportWorksheet(workbook: ExcelJS.Workbook, analytics: SurveyAnalyticsData) {
  const sheet = workbook.addWorksheet('Question Analytics');
  const rows = buildSurveyQuestionExcelRows(analytics);

  if (!rows.length) {
    sheet.addRow(['No survey questions found.']);
    sheet.getColumn(1).width = 34;
    return;
  }

  const columns = Object.keys(rows[0]);
  sheet.columns = columns.map((column) => ({
    key: column,
    width: Math.max(14, Math.min(46, column.length + 8)),
  }));

  const worksheetRows = rows.map((row) => columns.map((column) => row[column] ?? ''));
  sheet.addTable({
    name: 'SurveyQuestionAnalyticsTable',
    ref: 'A1',
    headerRow: true,
    totalsRow: false,
    style: {
      theme: 'TableStyleMedium2',
      showRowStripes: true,
    },
    columns: columns.map((column) => ({ name: column })),
    rows: worksheetRows,
  });

  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: SURVEY_REPORT_HEADER_COLOR },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    sheet.getRow(rowNumber).eachCell({ includeEmpty: true }, (cell, cellIndex) => {
      cell.border = SURVEY_REPORT_TABLE_BORDER;
      if (cellIndex <= 5) {
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      } else {
        cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
      }
    });
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: 'A1',
    to: `${String.fromCharCode(64 + columns.length)}1`,
  };
}

function buildSurveyQuestionExcelRows(analytics: SurveyAnalyticsData): ExcelRow[] {
  const rows: ExcelRow[] = [];

  analytics.questions_analytics.forEach((question, questionIndex) => {
    const section = question.section?.trim() || 'General';
    const questionType = formatSurveyQuestionType(question.question_type);
    const answerRows = getSurveyQuestionTableRows(question, analytics.total_responses);

    answerRows.forEach((row) => {
      rows.push({
        Section: section,
        Number: `Q${question.display_order || questionIndex + 1}`,
        'Survey Question': question.question_text,
        Type: questionType,
        'Answer / Option': row.label,
        Frequency: row.count,
        Percentage: formatSurveyPercentage(row.count, question.applicable_responses ?? analytics.total_responses),
      });
    });
  });

  return rows;
}

function buildSurveyPdfReportTableHead(table: SurveyReportTable) {
  return table.headers.map((headerRow) => (
    headerRow.map((cell) => ({
      content: cell.label,
      colSpan: cell.colspan ?? 1,
      rowSpan: cell.rowspan ?? 1,
      styles: {
        halign: cell.align ?? 'center',
        valign: 'middle' as const,
        fontStyle: 'bold' as const,
      },
    }))
  ));
}

function buildSurveyPdfReportTableBody(table: SurveyReportTable) {
  return table.rows.map((row) => (
    row.cells.map((cell, cellIndex) => ({
      content: cell,
      styles: {
        halign: (cellIndex === 0 ? 'left' : 'center') as 'left' | 'center',
        fontStyle: (row.is_total || row.is_group ? 'bold' : 'normal') as 'bold' | 'normal',
      },
    }))
  ));
}

function buildSurveyQuestionPdfRows(analytics: SurveyAnalyticsData): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [];

  analytics.questions_analytics.forEach((question, questionIndex) => {
    const section = question.section?.trim() || 'General';
    const questionType = formatSurveyQuestionType(question.question_type);
    const answerRows = getSurveyQuestionTableRows(question, analytics.total_responses);

    answerRows.forEach((row) => {
      rows.push([
        section,
        `Q${question.display_order || questionIndex + 1}`,
        question.question_text,
        questionType,
        row.label,
        row.count,
        formatSurveyPercentage(row.count, question.applicable_responses ?? analytics.total_responses),
      ]);
    });
  });

  return rows;
}

function getSurveyReportTableColumnCount(table: SurveyReportTable): number {
  const headerColumnCount = table.headers.reduce((max, headerRow) => {
    const count = headerRow.reduce((sum, cell) => sum + (cell.colspan ?? 1), 0);
    return Math.max(max, count);
  }, 0);
  const rowColumnCount = table.rows.reduce((max, row) => Math.max(max, row.cells.length), 0);

  return Math.max(headerColumnCount, rowColumnCount, 1);
}

function toFileSafePart(value: string): string {
  const safeValue = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return safeValue || 'report';
}

function toWorksheetSafeName(value: string): string {
  const safeValue = value.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim();
  return (safeValue || 'Sheet').slice(0, 31);
}

function SurveyQuestionReportTable({ analytics }: { analytics: SurveyAnalyticsData }) {
  return (
    <div className="survey-report-paper rounded-xl border p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-5">
        <div>
          <h3 className="text-xl font-bold text-[#1b2a4a]">Survey Question Report</h3>
          <p className="text-sm text-gray-500 mt-1">Percentages use the responses applicable to each question in this survey version.</p>
        </div>
        <div className="text-sm font-semibold text-[#1b2a4a]">
          {analytics.total_responses} total responses
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="survey-question-table min-w-full border-collapse text-sm">
          <thead className="bg-[#1b2a4a] text-white">
            <tr>
              <th className="px-4 py-3 text-left font-semibold w-36">Section</th>
              <th className="px-4 py-3 text-left font-semibold w-20">No.</th>
              <th className="px-4 py-3 text-left font-semibold min-w-[320px]">Survey Question</th>
              <th className="px-4 py-3 text-left font-semibold w-36">Type</th>
              <th className="px-4 py-3 text-left font-semibold min-w-[220px]">Answer / Option</th>
              <th className="px-4 py-3 text-right font-semibold w-28">Frequency</th>
              <th className="px-4 py-3 text-right font-semibold w-28">Percentage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {analytics.questions_analytics.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No survey questions found.
                </td>
              </tr>
            ) : (
              analytics.questions_analytics.map((question, questionIndex) => {
                const rows = getSurveyQuestionTableRows(question, analytics.total_responses);
                const section = question.section?.trim() || 'General';
                const questionType = formatSurveyQuestionType(question.question_type);

                return rows.map((row, rowIndex) => (
                  <tr key={`${question.question_id}-${rowIndex}`} className={questionIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                    {rowIndex === 0 && (
                      <>
                        <td rowSpan={rows.length} className="align-top px-4 py-4 text-gray-700 border-r">
                          {section}
                        </td>
                        <td rowSpan={rows.length} className="align-top px-4 py-4 font-semibold text-[#1b2a4a] border-r">
                          Q{question.display_order || questionIndex + 1}
                        </td>
                        <td rowSpan={rows.length} className="align-top px-4 py-4 text-[#1b2a4a] border-r">
                          {question.question_text}
                        </td>
                        <td rowSpan={rows.length} className="align-top px-4 py-4 text-gray-600 border-r">
                          {questionType}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 text-gray-700 border-r">{row.label}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#1b2a4a] border-r">{row.count}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatSurveyPercentage(row.count, question.applicable_responses ?? analytics.total_responses)}</td>
                  </tr>
                ));
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getSurveyQuestionTableRows(question: SurveyQuestionAnalytics, totalResponses: number): SurveyQuestionTableRow[] {
  const rows: SurveyQuestionTableRow[] = [];
  const skippedAnswers = Math.max(
    Number(question.skipped_answers ?? totalResponses - Number(question.total_answers || 0)),
    0,
  );
  const isChoiceQuestion = ['multiple_choice', 'radio', 'rating', 'checkbox'].includes(question.question_type);

  if (isChoiceQuestion && Array.isArray(question.data)) {
    question.data.forEach((item) => {
      const choice = item as { option?: unknown; count?: unknown };
      rows.push({
        label: String(choice.option ?? 'No answer'),
        count: Number(choice.count ?? 0),
      });
    });
  } else {
    rows.push({
      label: 'Answered responses',
      count: Number(question.total_answers || 0),
    });
  }

  if (skippedAnswers > 0) {
    rows.push({
      label: 'No answer',
      count: skippedAnswers,
    });
  }

  if (rows.length === 0) {
    rows.push({
      label: 'No answer',
      count: 0,
    });
  }

  return rows;
}

function formatSurveyQuestionType(type: string): string {
  return type
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatSurveyPercentage(count: number, total: number): string {
  if (!total) {
    return '0%';
  }

  return `${((count / total) * 100).toFixed(1)}%`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function getPdfTableForTab(
  tab: 'overview' | 'program' | 'year' | 'employment' | 'salary' | 'surveys',
  overview: Overview | null,
  programData: ProgramReport[],
  yearData: YearReport[],
  statusData: StatusData[],
  salaryData: SalaryData[],
): { headers: string[]; rows: Array<Array<string | number>> } {
  if (tab === 'overview' && overview) {
    const employmentKnown = safeCount(overview.total_employment_known)
      || safeCount(overview.total_employed) + safeCount(overview.total_unemployed);
    const unemployed = safeCount(overview.total_unemployed)
      || Math.max(employmentKnown - safeCount(overview.total_employed), 0);
    const alignmentKnown = safeCount(overview.total_aligned) + safeCount(overview.total_not_aligned);
    return {
      headers: ['Metric', 'Value'],
      rows: [
        ['Total Graduate Responses', overview.total_graduates],
        ['Known Employment Responses', employmentKnown],
        ['Total Employed', overview.total_employed],
        ['Total Unemployed', unemployed],
        ['Employed (Local)', overview.total_employed_local],
        ['Employed (Abroad)', overview.total_employed_abroad],
        ['Valid Alignment Responses', alignmentKnown],
        ['Total Aligned', overview.total_aligned],
        ['Not Aligned', safeCount(overview.total_not_aligned)],
        ['Employment Rate', formatNullableRate(overview.employment_rate)],
        ['Alignment Rate', formatNullableRate(overview.alignment_rate)],
      ],
    };
  }

  if (tab === 'program') {
    return {
      headers: ['Code', 'Program', 'Responses', 'Known Employment', 'Employed', 'Unemployed', 'Employment Rate', 'Valid Alignment', 'Aligned', 'Not Aligned', 'Alignment Rate'],
      rows: programData.map((item) => [
        item.code,
        item.name,
        item.total_graduates,
        item.employment_total ?? item.total_graduates,
        item.employed,
        getNotEmployedCount(item),
        formatNullableRate(item.employment_rate),
        safeCount(item.aligned) + safeCount(item.not_aligned),
        item.aligned,
        item.not_aligned,
        formatNullableRate(item.alignment_rate),
      ]),
    };
  }

  if (tab === 'year') {
    return {
      headers: ['Year', 'Responses', 'Known Employment', 'Employed', 'Unemployed', 'Employment Rate', 'Valid Alignment', 'Aligned', 'Not Aligned', 'Alignment Rate'],
      rows: yearData.map((item) => [
        item.year_graduated,
        item.total_graduates,
        item.employment_total ?? item.total_graduates,
        item.employed,
        getNotEmployedCount(item),
        formatNullableRate(item.employment_rate),
        item.alignment_total ?? 0,
        item.aligned,
        item.not_aligned ?? Math.max(safeCount(item.alignment_total) - safeCount(item.aligned), 0),
        formatNullableRate(item.alignment_rate),
      ]),
    };
  }

  if (tab === 'employment') {
    return {
      headers: ['Employment Status', 'Count'],
      rows: statusData.map((item) => [item.employment_status, item.count]),
    };
  }

  if (tab === 'salary') {
    const validSalaryResponses = salaryData.reduce((sum, item) => sum + safeCount(item.count), 0);
    return {
      headers: ['Salary Range', 'Count', 'Percentage of Valid Salary Responses'],
      rows: salaryData.map((item) => [
        normalizeSalaryLabel(item.salary_range),
        item.count,
        formatPercentage(item.count, validSalaryResponses),
      ]),
    };
  }

  return { headers: [], rows: [] };
}
