import type { DescriptiveAnalyticsSnapshot, DescriptiveSectionKey } from './descriptiveAnalytics.ts';
import { normalizeSalaryLabel, percentage, safeCount } from './descriptiveAnalytics.ts';

export interface ReportChartDefinition {
  key: string;
  section: DescriptiveSectionKey;
  title: string;
  width: number;
  height: number;
  config: Record<string, unknown>;
}

export interface RenderReportChartOptions {
  devicePixelRatio?: number;
  signal?: AbortSignal;
}

const CHART_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#0891b2', '#64748b'];
const PIE_LABEL_FORMATTER = '__GRADTRACK_PIE_LABEL_FORMATTER__';

const displayPercent = (value: number, total: number): string => {
  const result = percentage(value, total);
  if (result === null) return '0%';
  return `${Number.isInteger(result) ? result.toFixed(0) : result.toFixed(1)}%`;
};

const chartTitleOptions = (title: string) => ({
  display: true,
  text: title,
  fontSize: 17,
  fontColor: '#1b2a4a',
  padding: 14,
});

const buildPieChart = (
  key: string,
  section: DescriptiveSectionKey,
  title: string,
  rows: Array<{ label: string; value: number; color?: string }>,
): ReportChartDefinition | null => {
  const visibleRows = rows.filter((row) => safeCount(row.value) > 0);
  const total = visibleRows.reduce((sum, row) => sum + safeCount(row.value), 0);
  if (total <= 0) return null;

  const detailedLabels = visibleRows.map((row) => (
    `${row.label}: ${safeCount(row.value)} (${displayPercent(safeCount(row.value), total)})`
  ));

  return {
    key,
    section,
    title,
    width: 1100,
    height: 520,
    config: {
      type: 'pie',
      data: {
        labels: detailedLabels,
        datasets: [{
          data: visibleRows.map((row) => safeCount(row.value)),
          backgroundColor: visibleRows.map((row, index) => row.color || CHART_COLORS[index % CHART_COLORS.length]),
          borderColor: '#ffffff',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: false,
        animation: false,
        layout: { padding: { top: 8, right: 70, bottom: 18, left: 70 } },
        title: chartTitleOptions(title),
        legend: {
          display: true,
          position: 'bottom',
          labels: { fontSize: visibleRows.length > 4 ? 10 : 12, boxWidth: 14, padding: 14 },
        },
        plugins: {
          datalabels: {
            display: true,
            formatter: PIE_LABEL_FORMATTER,
            anchor: 'center',
            align: 'center',
            color: '#ffffff',
            backgroundColor: 'rgba(15,23,42,0.78)',
            borderColor: '#ffffff',
            borderWidth: 1,
            borderRadius: 4,
            padding: 5,
            textAlign: 'center',
            font: { size: visibleRows.length > 5 ? 10 : 13, weight: 'bold' },
          },
        },
      },
    },
  };
};

export const buildLabeledBarChart = (
  key: string,
  section: DescriptiveSectionKey,
  title: string,
  labels: Array<string | number>,
  datasets: Array<{ label: string; color: string; values: number[] }>,
  options: { rotateLabels?: boolean; hideLegend?: boolean } = {},
): ReportChartDefinition | null => {
  if (labels.length === 0 || datasets.length === 0) return null;
  const maxValue = Math.max(0, ...datasets.flatMap((dataset) => dataset.values.map(safeCount)));
  const suggestedMax = Math.max(1, Math.ceil(maxValue * 1.18) + (maxValue > 0 ? 1 : 0));
  const categoryCount = labels.length * datasets.length;
  const dataLabelSize = categoryCount > 36 ? 8 : categoryCount > 20 ? 9 : 11;

  return {
    key,
    section,
    title,
    width: 1200,
    height: 500,
    config: {
      type: 'bar',
      data: {
        labels,
        datasets: datasets.map((dataset) => ({
          label: dataset.label,
          backgroundColor: dataset.color,
          borderColor: dataset.color,
          borderWidth: 1,
          data: dataset.values.map(safeCount),
        })),
      },
      options: {
        responsive: false,
        animation: false,
        layout: { padding: { top: 28, right: 18, bottom: 4, left: 8 } },
        title: chartTitleOptions(title),
        legend: {
          display: !options.hideLegend,
          position: 'bottom',
          labels: { fontSize: 11, boxWidth: 14, padding: 12 },
        },
        plugins: {
          datalabels: {
            display: true,
            anchor: 'end',
            align: 'end',
            offset: 2,
            clamp: true,
            clip: false,
            color: '#1f2937',
            font: { size: dataLabelSize, weight: 'bold' },
          },
        },
        scales: {
          xAxes: [{
            gridLines: { display: false },
            ticks: {
              autoSkip: false,
              fontSize: labels.length > 10 ? 9 : 11,
              maxRotation: options.rotateLabels ? 28 : 0,
              minRotation: options.rotateLabels ? 28 : 0,
            },
          }],
          yAxes: [{
            gridLines: { color: '#e5e7eb', zeroLineColor: '#94a3b8' },
            ticks: { beginAtZero: true, precision: 0, suggestedMax, fontSize: 10 },
          }],
        },
      },
    },
  };
};

export const buildReportChartDefinitions = (
  snapshot: DescriptiveAnalyticsSnapshot,
): ReportChartDefinition[] => {
  const overview = snapshot.overview;
  const charts: Array<ReportChartDefinition | null> = [];

  if (overview) {
    const employed = safeCount(overview.total_employed);
    const employmentKnown = safeCount(overview.total_employment_known)
      || employed + safeCount(overview.total_unemployed);
    const unemployed = safeCount(overview.total_unemployed)
      || Math.max(employmentKnown - employed, 0);
    charts.push(buildPieChart('overview-employment', 'overview', 'Employment Status', [
      { label: 'Employed', value: employed, color: '#22c55e' },
      { label: 'Unemployed', value: unemployed, color: '#ef4444' },
    ]));
    charts.push(buildPieChart('overview-location', 'overview', 'Work Location (Employed Respondents)', [
      { label: 'Local', value: safeCount(overview.total_employed_local), color: '#14b8a6' },
      { label: 'Abroad', value: safeCount(overview.total_employed_abroad), color: '#6366f1' },
      {
        label: 'Location Unknown',
        value: Math.max(
          employed - safeCount(overview.total_employed_local) - safeCount(overview.total_employed_abroad),
          0,
        ),
        color: '#94a3b8',
      },
    ]));
    charts.push(buildPieChart('overview-alignment', 'overview', 'Job Alignment (Valid Responses)', [
      { label: 'Aligned', value: safeCount(overview.total_aligned), color: '#f59e0b' },
      { label: 'Not Aligned', value: safeCount(overview.total_not_aligned), color: '#94a3b8' },
    ]));
  }

  charts.push(buildLabeledBarChart(
    'program-performance',
    'programPerformance',
    'Employment and Alignment by Program',
    snapshot.programPerformance.map((row) => String(row.code || row.name || 'Unspecified')),
    [
      { label: 'Employed', color: '#22c55e', values: snapshot.programPerformance.map((row) => safeCount(row.employed)) },
      {
        label: 'Unemployed',
        color: '#ef4444',
        values: snapshot.programPerformance.map((row) => {
          const known = safeCount(row.employment_total) || safeCount(row.total_graduates);
          return safeCount(row.unemployed) || Math.max(known - safeCount(row.employed), 0);
        }),
      },
      { label: 'Aligned', color: '#3b82f6', values: snapshot.programPerformance.map((row) => safeCount(row.aligned)) },
      { label: 'Not Aligned', color: '#f59e0b', values: snapshot.programPerformance.map((row) => safeCount(row.not_aligned)) },
    ],
  ));

  charts.push(buildLabeledBarChart(
    'yearly-trend',
    'yearlyTrend',
    'Employment and Alignment by Graduation Year',
    snapshot.yearlyTrend.map((row) => String(row.year_graduated || 'Unspecified')),
    [
      { label: 'Responses', color: '#3b82f6', values: snapshot.yearlyTrend.map((row) => safeCount(row.total_graduates)) },
      { label: 'Employed', color: '#22c55e', values: snapshot.yearlyTrend.map((row) => safeCount(row.employed)) },
      {
        label: 'Unemployed',
        color: '#ef4444',
        values: snapshot.yearlyTrend.map((row) => safeCount(row.unemployed)
          || Math.max((safeCount(row.employment_total) || safeCount(row.total_graduates)) - safeCount(row.employed), 0)),
      },
      { label: 'Aligned', color: '#f59e0b', values: snapshot.yearlyTrend.map((row) => safeCount(row.aligned)) },
      {
        label: 'Not Aligned',
        color: '#8b5cf6',
        values: snapshot.yearlyTrend.map((row) => safeCount(row.not_aligned)
          || Math.max(safeCount(row.alignment_total) - safeCount(row.aligned), 0)),
      },
    ],
  ));

  charts.push(buildPieChart(
    'employment-status',
    'employmentStatus',
    'Employment Status Distribution',
    snapshot.employmentStatus.map((row, index) => ({
      label: String(row.employment_status || 'Unspecified'),
      value: safeCount(row.count),
      color: CHART_COLORS[index % CHART_COLORS.length],
    })),
  ));

  charts.push(buildLabeledBarChart(
    'salary-distribution',
    'salaryDistribution',
    'Salary Distribution',
    snapshot.salaryDistribution.map((row) => normalizeSalaryLabel(row.salary_range)),
    [{ label: 'Responses', color: '#6366f1', values: snapshot.salaryDistribution.map((row) => safeCount(row.count)) }],
    { rotateLabels: true, hideLegend: true },
  ));

  return charts.filter((chart): chart is ReportChartDefinition => chart !== null);
};

export const renderReportChart = async (
  chart: ReportChartDefinition,
  options: RenderReportChartOptions = {},
): Promise<ArrayBuffer> => {
  const serializedConfig = JSON.stringify(chart.config);
  const quickChartConfig = serializedConfig.includes(`"${PIE_LABEL_FORMATTER}"`)
    ? serializedConfig.replace(
      `"${PIE_LABEL_FORMATTER}"`,
      `function(value, context) {
        var values = context.chart.data.datasets[0].data;
        var total = values.reduce(function(sum, item) { return sum + Number(item || 0); }, 0);
        var percent = total > 0 ? (Number(value || 0) / total) * 100 : 0;
        var rounded = Math.round(percent * 10) / 10;
        return String(value) + '\\n' + String(rounded) + '%';
      }`,
    )
    : chart.config;
  const requestBody = {
    version: '2',
    format: 'png',
    backgroundColor: 'white',
    width: chart.width,
    height: chart.height,
    devicePixelRatio: options.devicePixelRatio ?? 2,
    chart: quickChartConfig,
  };
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch('https://quickchart.io/chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: options.signal,
      });
      if (!response.ok) {
        throw new Error(`Chart service returned HTTP ${response.status}.`);
      }
      return await response.arrayBuffer();
    } catch (error) {
      lastError = error;
      if (options.signal?.aborted) break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Unable to render chart: ${chart.title}`);
};

export const reportChartsBySection = (
  charts: ReportChartDefinition[],
  section: DescriptiveSectionKey,
): ReportChartDefinition[] => charts.filter((chart) => chart.section === section);
