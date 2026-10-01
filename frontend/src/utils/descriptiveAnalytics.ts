import { hasBrokenReportText, normalizeReportText } from './reportText.ts';

export type DescriptiveSectionKey =
  | 'overview'
  | 'programPerformance'
  | 'yearlyTrend'
  | 'employmentStatus'
  | 'salaryDistribution';

export interface DescriptiveOverview {
  total_graduates?: number;
  total_employed?: number;
  total_unemployed?: number;
  total_employment_known?: number;
  total_employment_unknown?: number;
  total_employed_local?: number;
  total_employed_abroad?: number;
  total_aligned?: number;
  total_not_aligned?: number;
  total_alignment_known?: number;
  total_survey_responses?: number;
  employment_rate?: number | null;
  alignment_rate?: number | null;
}

export interface DescriptiveProgramRow {
  code?: string;
  name?: string;
  total_graduates?: number;
  employment_total?: number;
  employed?: number;
  unemployed?: number;
  employment_rate?: number | null;
  aligned?: number;
  alignment_total?: number;
  alignment_rate?: number | null;
  not_aligned?: number;
}

export interface DescriptiveYearRow {
  year_graduated?: number;
  total_graduates?: number;
  employment_total?: number;
  employed?: number;
  unemployed?: number;
  employment_rate?: number | null;
  aligned?: number;
  alignment_total?: number;
  alignment_rate?: number | null;
  not_aligned?: number;
}

export interface DescriptiveStatusRow {
  employment_status?: string;
  count?: number;
}

export interface DescriptiveSalaryRow {
  salary_range?: string;
  count?: number;
}

export interface DescriptiveAnalyticsSnapshot {
  overview: DescriptiveOverview | null;
  programPerformance: DescriptiveProgramRow[];
  yearlyTrend: DescriptiveYearRow[];
  employmentStatus: DescriptiveStatusRow[];
  salaryDistribution: DescriptiveSalaryRow[];
}

export interface KeyFinding {
  label: string;
  value: string;
  detail: string;
  tone: 'blue' | 'green' | 'orange' | 'purple' | 'slate';
}

export interface StructuredDescriptiveAnalysis {
  keyFindings: KeyFinding[];
  employmentInterpretation: string;
  programAnalysis: string;
  alignmentAnalysis: string;
  summary: string;
  dataNotes: string[];
}

export type PdfInterpretations = Record<DescriptiveSectionKey, string>;
export type PdfSectionNotes = Record<DescriptiveSectionKey, string[]>;

export const safeCount = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(Math.round(numeric), 0) : 0;
};

export const percentage = (part: unknown, total: unknown): number | null => {
  const numerator = Number(part);
  const denominator = Number(total);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 1000) / 10;
};

export const formatPercentage = (part: unknown, total: unknown): string => {
  const result = percentage(part, total);
  return result === null ? 'Not available' : `${result.toFixed(1)}%`;
};

export const formatRate = (value: unknown, part?: unknown, total?: unknown): string => {
  const numeric = Number(value);
  if (value !== null && value !== undefined && value !== '' && Number.isFinite(numeric)) {
    return `${numeric.toFixed(1)}%`;
  }
  return formatPercentage(part, total);
};

export const normalizeSalaryLabel = (value: unknown): string => String(value ?? '')
  .replace(/â‚±|â±|PHP\s*/gi, '₱')
  .replace(/\s*-\s*/g, ' – ')
  .trim();

const joinedParagraphs = (...paragraphs: Array<string | null | undefined>): string => (
  paragraphs.map((paragraph) => paragraph?.trim()).filter(Boolean).join('\n\n')
);

const getOverviewCounts = (overview: DescriptiveOverview | null) => {
  const total = safeCount(overview?.total_graduates);
  const employed = safeCount(overview?.total_employed);
  const reportedUnemployed = safeCount(overview?.total_unemployed);
  const employmentKnown = safeCount(overview?.total_employment_known) || employed + reportedUnemployed;
  const unemployed = reportedUnemployed || Math.max(employmentKnown - employed, 0);
  const employmentUnknown = safeCount(overview?.total_employment_unknown)
    || Math.max(total - employmentKnown, 0);
  const local = safeCount(overview?.total_employed_local);
  const abroad = safeCount(overview?.total_employed_abroad);
  const locationKnown = local + abroad;
  const locationUnknown = Math.max(employed - locationKnown, 0);
  const aligned = safeCount(overview?.total_aligned);
  const notAligned = safeCount(overview?.total_not_aligned);
  const alignmentKnown = aligned + notAligned;
  const alignmentUnknown = Math.max(employed - alignmentKnown, 0);

  return {
    total,
    employed,
    unemployed,
    employmentKnown,
    employmentUnknown,
    local,
    abroad,
    locationKnown,
    locationUnknown,
    aligned,
    notAligned,
    alignmentKnown,
    alignmentUnknown,
  };
};

const programMetrics = (row: DescriptiveProgramRow) => {
  const total = safeCount(row.total_graduates);
  const employed = safeCount(row.employed);
  const employmentTotal = safeCount(row.employment_total) || employed + safeCount(row.unemployed);
  const unemployed = safeCount(row.unemployed) || Math.max(employmentTotal - employed, 0);
  const aligned = safeCount(row.aligned);
  const notAligned = safeCount(row.not_aligned);
  const alignmentTotal = aligned + notAligned;
  return {
    label: String(row.code || row.name || 'Unspecified program'),
    total,
    employed,
    employmentTotal,
    unemployed,
    employmentRate: formatRate(row.employment_rate, employed, employmentTotal),
    aligned,
    notAligned,
    alignmentTotal,
    alignmentRate: formatPercentage(aligned, alignmentTotal),
  };
};

const yearMetrics = (row: DescriptiveYearRow) => {
  const total = safeCount(row.total_graduates);
  const employed = safeCount(row.employed);
  const employmentTotal = safeCount(row.employment_total) || employed + safeCount(row.unemployed);
  const unemployed = safeCount(row.unemployed) || Math.max(employmentTotal - employed, 0);
  const aligned = safeCount(row.aligned);
  const alignmentTotal = aligned + safeCount(row.not_aligned);
  return {
    year: String(row.year_graduated || 'Unspecified year'),
    total,
    employed,
    unemployed,
    employmentTotal,
    employmentRate: formatRate(row.employment_rate, employed, employmentTotal),
    aligned,
    alignmentTotal,
    alignmentRate: formatPercentage(aligned, alignmentTotal),
  };
};

const statusCount = (rows: DescriptiveStatusRow[], matcher: RegExp): number => (
  rows.reduce((sum, row) => (
    matcher.test(String(row.employment_status || '')) ? sum + safeCount(row.count) : sum
  ), 0)
);

const getStatusCounts = (snapshot: DescriptiveAnalyticsSnapshot) => {
  const overview = getOverviewCounts(snapshot.overview);
  const local = statusCount(snapshot.employmentStatus, /employed\s*\(local\)|^local$/i)
    || overview.local;
  const abroad = statusCount(snapshot.employmentStatus, /employed\s*\(abroad\)|abroad|overseas/i)
    || overview.abroad;
  const unemployed = statusCount(snapshot.employmentStatus, /^unemployed$/i)
    || overview.unemployed;
  const locationUnknown = statusCount(snapshot.employmentStatus, /location unknown/i)
    || Math.max(overview.employed - local - abroad, 0);
  const employmentUnknown = statusCount(snapshot.employmentStatus, /employment.*unknown|unclassified/i)
    || overview.employmentUnknown;
  return {
    ...overview,
    local,
    abroad,
    unemployed,
    locationUnknown,
    employmentUnknown,
  };
};

export const buildStructuredOverviewAnalysis = (
  overview: DescriptiveOverview | null,
  programRows: DescriptiveProgramRow[],
): StructuredDescriptiveAnalysis => {
  const counts = getOverviewCounts(overview);
  const employmentRate = formatRate(overview?.employment_rate, counts.employed, counts.employmentKnown);
  const alignmentRate = formatPercentage(counts.aligned, counts.alignmentKnown);
  const programs = programRows.map(programMetrics).filter((row) => row.total > 0);
  const largestProgram = programs.reduce<typeof programs[number] | null>((best, row) => (
    !best || row.total > best.total ? row : best
  ), null);
  const smallestProgram = programs.reduce<typeof programs[number] | null>((best, row) => (
    !best || row.total < best.total ? row : best
  ), null);
  const largestEmployed = programs.reduce<typeof programs[number] | null>((best, row) => (
    !best || row.employed > best.employed ? row : best
  ), null);

  const employmentInterpretation = counts.total > 0
    ? joinedParagraphs(
        `The selected report contains ${counts.total} traced graduate responses. Employment status is known for ${counts.employmentKnown} respondents: ${counts.employed} are employed and ${counts.unemployed} are unemployed. The employment rate is ${employmentRate}, using respondents with a known employment classification as the denominator.${counts.employmentUnknown > 0 ? ` The remaining ${counts.employmentUnknown} responses are not included in that rate because their employment status is unclassified.` : ''}`,
        `Among the ${counts.employed} employed respondents, ${counts.local} are classified as working locally and ${counts.abroad} as working abroad. These represent ${formatPercentage(counts.local, counts.employed)} and ${formatPercentage(counts.abroad, counts.employed)}, respectively, using all employed respondents as the denominator.${counts.locationUnknown > 0 ? ` Work location is unavailable for ${counts.locationUnknown} employed respondents, so the local and abroad shares do not sum to 100.0%.` : ' All employed respondents have a classified work location in the selected data.'}`,
      )
    : 'No graduate responses are available for the selected filters, so employment counts and rates are not available.';

  const programAnalysis = programs.length > 0
    ? joinedParagraphs(
        `Program-level data are available for ${programs.length} ${programs.length === 1 ? 'program' : 'programs'}. ${largestProgram ? `${largestProgram.label} has the largest observed response count (${largestProgram.total})` : ''}${largestProgram && smallestProgram && largestProgram.label !== smallestProgram.label ? `, while ${smallestProgram.label} has the smallest (${smallestProgram.total})` : ''}. These counts describe sample concentration and should not be interpreted as a ranking of program quality or employability.`,
        programs.map((row) => `${row.label}: ${row.total} responses, ${row.employed} employed and ${row.unemployed} unemployed among ${row.employmentTotal} known employment classifications (${row.employmentRate}); ${row.aligned} aligned and ${row.notAligned} not aligned among ${row.alignmentTotal} valid alignment responses (${row.alignmentRate}).`).join(' '),
        largestEmployed
          ? `${largestEmployed.label} contains the largest observed employed count (${largestEmployed.employed}). That concentration must be read alongside its response count rather than treated on its own as evidence that the program performs better than programs with smaller samples.`
          : null,
      )
    : 'No program-level rows are available for the selected filters. Program comparisons are therefore not available.';

  const alignmentAnalysis = counts.alignmentKnown > 0
    ? joinedParagraphs(
        `Course alignment is classified for ${counts.alignmentKnown} employed respondents. Of these, ${counts.aligned} report work aligned with their academic program and ${counts.notAligned} report work that is not aligned. The alignment rate is ${alignmentRate}, calculated as aligned responses divided by the sum of aligned and not-aligned responses.`,
        `The alignment denominator differs from the ${counts.total} total responses because alignment is applicable to employed respondents with a valid alignment answer. ${counts.alignmentUnknown > 0 ? `${counts.alignmentUnknown} employed respondents do not have a valid alignment classification and are excluded from the rate.` : 'Every employed respondent in this selection has a valid alignment classification.'}`,
      )
    : 'No valid course-alignment responses are available for the selected filters, so an alignment percentage is not available.';

  const dataNotes = [
    counts.employmentUnknown > 0
      ? `${counts.employmentUnknown} of ${counts.total} responses have an unknown employment classification.`
      : null,
    counts.locationUnknown > 0
      ? `${counts.locationUnknown} employed responses have no classified work location.`
      : null,
    counts.alignmentKnown !== counts.total
      ? `The alignment denominator (${counts.alignmentKnown}) differs from the total response count (${counts.total}) because alignment is evaluated only among applicable, valid responses.`
      : null,
    programs.length > 1
      ? 'Program sample sizes differ; raw employed and aligned counts are not direct performance rankings.'
      : programs.length === 1
        ? 'Only one program is represented, so no cross-program comparison is available.'
        : null,
  ].filter((note): note is string => Boolean(note));

  return {
    keyFindings: [
      { label: 'Valid graduate responses', value: String(counts.total), detail: 'Current filtered dataset', tone: 'blue' },
      { label: 'Employment rate', value: employmentRate, detail: `${counts.employed} of ${counts.employmentKnown} known responses`, tone: 'green' },
      { label: 'Employed graduates', value: String(counts.employed), detail: 'Known employment classification', tone: 'green' },
      { label: 'Unemployed graduates', value: String(counts.unemployed), detail: 'Known employment classification', tone: 'slate' },
      { label: 'Local employment', value: String(counts.local), detail: `${formatPercentage(counts.local, counts.employed)} of employed`, tone: 'blue' },
      { label: 'Abroad employment', value: String(counts.abroad), detail: `${formatPercentage(counts.abroad, counts.employed)} of employed`, tone: 'purple' },
      { label: 'Alignment rate', value: alignmentRate, detail: `${counts.aligned} of ${counts.alignmentKnown} valid responses`, tone: 'orange' },
    ],
    employmentInterpretation,
    programAnalysis,
    alignmentAnalysis,
    summary: counts.total > 0
      ? `Within the selected responses, ${employmentRate} of respondents with a known employment status are employed. Local employment accounts for the largest classified work-location count, while ${alignmentRate} of valid alignment responses are classified as aligned with the graduate's academic program. These are descriptive results for the current filtered sample; they do not establish causes, future outcomes, or statistically significant differences.`
      : 'The current filters return no graduate responses. No descriptive pattern can be summarized until the selection contains valid data.',
    dataNotes,
  };
};

const buildOverviewPdfInterpretation = (snapshot: DescriptiveAnalyticsSnapshot): string => {
  const overview = snapshot.overview;
  const counts = getOverviewCounts(overview);
  if (counts.total === 0) {
    return 'The selected filters contain no traced graduate responses. Employment, work-location, and course-alignment percentages are therefore not available for this section.';
  }

  return joinedParagraphs(
    `The overview contains ${counts.total} traced graduate responses. Employment status is known for ${counts.employmentKnown} respondents, of whom ${counts.employed} are employed and ${counts.unemployed} are unemployed. This produces an employment rate of ${formatRate(overview?.employment_rate, counts.employed, counts.employmentKnown)} and an unemployment rate of ${formatPercentage(counts.unemployed, counts.employmentKnown)}, both calculated from respondents with a known employment status.${counts.employmentUnknown > 0 ? ` The ${counts.employmentUnknown} unclassified responses are excluded from these rates.` : ''}`,
    `Among the ${counts.employed} employed respondents, ${counts.local} work locally and ${counts.abroad} work abroad. Local employment therefore accounts for ${formatPercentage(counts.local, counts.employed)} of employed respondents, while overseas employment accounts for ${formatPercentage(counts.abroad, counts.employed)}.${counts.locationUnknown > 0 ? ` A further ${counts.locationUnknown} employed respondents have no classified work location, which explains why these shares do not total 100.0%.` : ' The local and abroad categories account for all employed respondents in this selection.'}`,
    `Course alignment is valid for ${counts.alignmentKnown} employed respondents: ${counts.aligned} are aligned and ${counts.notAligned} are not aligned. The alignment rate is ${formatPercentage(counts.aligned, counts.alignmentKnown)}, using aligned plus not-aligned responses as the valid denominator. This denominator differs from the overall response count because alignment applies only to employed graduates who supplied a classifiable answer.`,
    `Overall, the observed distribution shows that employed respondents form the larger employment-status group and local work is the largest classified work-location category. The alignment results indicate how many applicable respondents report work connected to their academic preparation; these descriptive counts and percentages do not establish causes or statistical significance.`,
  );
};

const buildProgramPdfInterpretation = (snapshot: DescriptiveAnalyticsSnapshot): string => {
  const rows = snapshot.programPerformance.map(programMetrics).filter((row) => row.total > 0);
  if (rows.length === 0) {
    return 'No program-level responses are available for the selected filters, so program totals, employment rates, and alignment rates cannot be described.';
  }

  const totalResponses = rows.reduce((sum, row) => sum + row.total, 0);
  const largest = rows.reduce((best, row) => (row.total > best.total ? row : best), rows[0]);
  const smallest = rows.reduce((best, row) => (row.total < best.total ? row : best), rows[0]);
  const largestEmployed = rows.reduce((best, row) => (row.employed > best.employed ? row : best), rows[0]);
  const rowDetails = rows.map((row) => (
    `${row.label}: ${row.total} responses; ${row.employed} employed and ${row.unemployed} unemployed of ${row.employmentTotal} known (${row.employmentRate}); ${row.aligned} aligned and ${row.notAligned} not aligned of ${row.alignmentTotal} valid (${row.alignmentRate}).`
  )).join(' ');

  return joinedParagraphs(
    `The program chart represents ${totalResponses} responses across ${rows.length} ${rows.length === 1 ? 'program' : 'programs'}. ${largest.label} has the largest observed sample (${largest.total})${largest.label !== smallest.label ? `, whereas ${smallest.label} has the smallest (${smallest.total})` : ''}. Because program sample sizes differ, raw employment and alignment counts describe where responses are concentrated and are not performance rankings.`,
    rowDetails,
    `${largestEmployed.label} has the largest employed count (${largestEmployed.employed}) in the displayed data. This count should be interpreted with its program denominator and employment rate, since a program with more respondents can also produce a larger employed count. Alignment rates likewise use each program's valid alignment responses rather than its full response count.`,
  );
};

const buildYearlyPdfInterpretation = (snapshot: DescriptiveAnalyticsSnapshot): string => {
  const rows = snapshot.yearlyTrend.map(yearMetrics).filter((row) => row.total > 0);
  if (rows.length === 0) {
    return 'No graduation-year rows are available for the selected filters, so a yearly employment trend cannot be described.';
  }

  const totalResponses = rows.reduce((sum, row) => sum + row.total, 0);
  const highestEmployed = rows.reduce((best, row) => (row.employed > best.employed ? row : best), rows[0]);
  const lowestEmployed = rows.reduce((best, row) => (row.employed < best.employed ? row : best), rows[0]);
  const details = rows.map((row) => (
    `${row.year} contains ${row.total} responses, with ${row.employed} employed and ${row.unemployed} unemployed among ${row.employmentTotal} known classifications (${row.employmentRate} employed); ${row.aligned} of ${row.alignmentTotal} valid alignment responses are aligned (${row.alignmentRate}).`
  )).join(' ');
  const ordered = rows.slice().sort((a, b) => Number(a.year) - Number(b.year));
  const movement = ordered.length > 1
    ? ordered.slice(1).map((row, index) => {
        const previous = ordered[index];
        const difference = row.employed - previous.employed;
        return `${previous.year} to ${row.year} shows ${difference === 0 ? 'no change' : difference > 0 ? `an increase of ${difference}` : `a decrease of ${Math.abs(difference)}`} in the employed count`;
      }).join('; ')
    : 'Only one graduation year is displayed, so an increase or decrease across years cannot be assessed';

  return joinedParagraphs(
    `The yearly chart covers ${rows.length} graduation ${rows.length === 1 ? 'year' : 'years'} and ${totalResponses} responses. The observed counts vary across graduation years, with the highest employed count in ${highestEmployed.year} (${highestEmployed.employed}) and the lowest in ${lowestEmployed.year} (${lowestEmployed.employed}).`,
    details,
    `${movement}. These changes are descriptive only. Response totals differ by year, so raw count changes should be considered together with each year's employment rate and should not be interpreted as causal evidence or as a direct ranking of cohort employability.`,
  );
};

const buildEmploymentPdfInterpretation = (snapshot: DescriptiveAnalyticsSnapshot): string => {
  const counts = getStatusCounts(snapshot);
  const knownEmployment = counts.employmentKnown || counts.employed + counts.unemployed;
  if (knownEmployment === 0) {
    return 'No respondents have a known employment classification under the selected filters. Local employment, overseas employment, and unemployment percentages are therefore not available.';
  }

  return joinedParagraphs(
    `The employment-status analysis includes ${knownEmployment} respondents with a known employment classification. Of these, ${counts.employed} are employed and ${counts.unemployed} are unemployed, corresponding to ${formatPercentage(counts.employed, knownEmployment)} employed and ${formatPercentage(counts.unemployed, knownEmployment)} unemployed. The known-employment denominator excludes ${counts.employmentUnknown} responses whose status could not be classified.`,
    `Within the employed group, ${counts.local} respondents work locally and ${counts.abroad} work abroad. Local employment represents ${formatPercentage(counts.local, counts.employed)} of all employed respondents, while employment abroad represents ${formatPercentage(counts.abroad, counts.employed)}. These work-location shares use employed respondents as the denominator, whereas the unemployment percentage uses all respondents with known employment status.`,
    `${counts.local >= counts.abroad ? 'Local employment is the largest classified work-location category' : 'Employment abroad is the largest classified work-location category'} in the selected data.${counts.locationUnknown > 0 ? ` Work location is unknown for ${counts.locationUnknown} employed respondents; they remain in the employed denominator but are not assigned to local or abroad.` : ' Every employed respondent has a classified local or abroad work location.'} The distribution describes the observed categories and does not explain why respondents work locally, abroad, or remain unemployed.`,
  );
};

const buildSalaryPdfInterpretation = (snapshot: DescriptiveAnalyticsSnapshot): string => {
  const rows = snapshot.salaryDistribution.map((row) => ({
    label: normalizeSalaryLabel(row.salary_range),
    count: safeCount(row.count),
  }));
  const validSalaryResponses = rows.reduce((sum, row) => sum + row.count, 0);
  const totalResponses = getOverviewCounts(snapshot.overview).total;
  const hasComparableResponseTotal = totalResponses >= validSalaryResponses && totalResponses > 0;
  if (validSalaryResponses === 0) {
    return totalResponses > 0
      ? `None of the ${totalResponses} selected graduate responses contains a classifiable salary-range answer. Salary percentages and a modal range are therefore not available; missing salary information is not treated as ₱0.`
      : 'No classifiable salary-range responses are available for the selected filters. Salary percentages and a modal range are therefore not available; missing salary information is not treated as ₱0.';
  }

  const largestCount = Math.max(...rows.map((row) => row.count));
  const smallestCount = Math.min(...rows.map((row) => row.count));
  const largest = rows.filter((row) => row.count === largestCount).map((row) => row.label);
  const smallest = rows.filter((row) => row.count === smallestCount).map((row) => row.label);
  const missing = hasComparableResponseTotal ? totalResponses - validSalaryResponses : null;
  const details = rows.map((row) => (
    `${row.label || 'Unspecified range'} contains ${row.count} ${row.count === 1 ? 'response' : 'responses'} (${formatPercentage(row.count, validSalaryResponses)} of valid salary responses)`
  )).join('; ');

  return joinedParagraphs(
    hasComparableResponseTotal
      ? `Salary analysis is based on ${validSalaryResponses} valid grouped salary responses from ${totalResponses} selected graduate responses. ${Number(missing) > 0 ? `${missing} responses do not contribute a classifiable salary range and are excluded from every salary percentage.` : 'Every selected response contributes a valid salary range.'} Missing responses are not interpreted as zero salary.`
      : `Salary analysis is based on ${validSalaryResponses} valid grouped salary responses. The overall selected-response total was not supplied with this salary-only view, so the number of missing salary responses cannot be calculated here. Missing responses are not interpreted as zero salary.`,
    `The distribution is as follows: ${details}.`,
    `${largest.length > 1 ? `The highest observed count is tied across ${largest.join(', ')} at ${largestCount} responses each.` : `${largest[0]} is the most common reported range, with ${largestCount} responses.`} ${smallest.length > 1 ? `The smallest count is shared by ${smallest.join(', ')} at ${smallestCount} responses each.` : `${smallest[0]} has the smallest observed count (${smallestCount}).`} These grouped categories show where valid responses are concentrated; they do not support an exact mean salary unless midpoint estimation is explicitly performed and labelled as an estimate.`,
  );
};

export const buildPdfInterpretations = (snapshot: DescriptiveAnalyticsSnapshot): PdfInterpretations => ({
  overview: buildOverviewPdfInterpretation(snapshot),
  programPerformance: buildProgramPdfInterpretation(snapshot),
  yearlyTrend: buildYearlyPdfInterpretation(snapshot),
  employmentStatus: buildEmploymentPdfInterpretation(snapshot),
  salaryDistribution: buildSalaryPdfInterpretation(snapshot),
});

export const buildPdfSectionNotes = (snapshot: DescriptiveAnalyticsSnapshot): PdfSectionNotes => {
  const counts = getOverviewCounts(snapshot.overview);
  const validSalaryResponses = snapshot.salaryDistribution.reduce((sum, row) => sum + safeCount(row.count), 0);
  return {
    overview: [
      counts.employmentUnknown > 0 ? `${counts.employmentUnknown} employment-status responses are unclassified.` : null,
      counts.alignmentKnown !== counts.total ? `Alignment uses ${counts.alignmentKnown} valid applicable responses, not all ${counts.total} graduate responses.` : null,
    ].filter((note): note is string => Boolean(note)),
    programPerformance: snapshot.programPerformance.length > 1
      ? ['Program response counts differ; compare rates and denominators alongside raw counts.']
      : ['Only one program is represented by the selected filters.'],
    yearlyTrend: snapshot.yearlyTrend.length > 1
      ? ['Graduation-year response totals differ, so changes in raw counts are not direct cohort rankings.']
      : ['Only one graduation year is represented by the selected filters.'],
    employmentStatus: [
      counts.locationUnknown > 0 ? `${counts.locationUnknown} employed respondents have an unknown work location.` : null,
      counts.employmentUnknown > 0 ? `${counts.employmentUnknown} responses are excluded from known-employment percentages.` : null,
    ].filter((note): note is string => Boolean(note)),
    salaryDistribution: [
      `Salary percentages use ${validSalaryResponses} valid salary responses as the denominator.`,
      counts.total > validSalaryResponses ? `${counts.total - validSalaryResponses} selected responses have no classifiable salary range.` : null,
      'Grouped salary ranges are not converted into an exact average salary.',
    ].filter((note): note is string => Boolean(note)),
  };
};

const forbiddenInference = /\b(statistically significant|significant relationship|caused?|proves?|affects?|predicts?|more successful|less successful|best program|worst program)\b/i;
const invalidOutputToken = /\b(?:NaN|Infinity|undefined|null)\b/i;

const requiredSectionValues = (
  key: DescriptiveSectionKey,
  snapshot: DescriptiveAnalyticsSnapshot,
): number[] => {
  const counts = getOverviewCounts(snapshot.overview);
  if (key === 'overview') return [counts.total, counts.employed, counts.unemployed, counts.aligned];
  if (key === 'programPerformance') {
    return snapshot.programPerformance.flatMap((row) => [safeCount(row.total_graduates), safeCount(row.employed)]);
  }
  if (key === 'yearlyTrend') {
    return snapshot.yearlyTrend.flatMap((row) => [safeCount(row.year_graduated), safeCount(row.total_graduates), safeCount(row.employed)]);
  }
  if (key === 'employmentStatus') return [counts.local, counts.abroad, counts.unemployed];
  return [snapshot.salaryDistribution.reduce((sum, row) => sum + safeCount(row.count), 0)];
};

const numericTokens = (value: unknown): number[] => {
  const matches = String(value ?? '').match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches
    .map((token) => Number(token.replace(/,/g, '')))
    .filter(Number.isFinite);
};

const canonicalNumber = (value: number): string => (
  Number(value.toFixed(3)).toString()
);

export const hasUnsupportedNumericClaim = (
  text: string,
  observedData: unknown,
): boolean => {
  const observedNumbers = numericTokens(JSON.stringify(observedData));
  const allowed = new Set(observedNumbers.map(canonicalNumber));
  allowed.add('0');
  allowed.add('1');
  allowed.add('100');

  observedNumbers.forEach((numerator) => {
    observedNumbers.forEach((denominator) => {
      if (denominator <= 0 || numerator < 0 || numerator > denominator) return;
      allowed.add(canonicalNumber((numerator / denominator) * 100));
      allowed.add(canonicalNumber(Math.round((numerator / denominator) * 1000) / 10));
    });
  });

  return numericTokens(text).some((value) => !allowed.has(canonicalNumber(value)));
};

export const isValidAiInterpretation = (
  key: DescriptiveSectionKey,
  value: unknown,
  snapshot: DescriptiveAnalyticsSnapshot,
): value is string => {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  const hasSubstantialData = key === 'programPerformance'
    ? snapshot.programPerformance.length > 1
    : key === 'yearlyTrend'
      ? snapshot.yearlyTrend.length > 1
      : getOverviewCounts(snapshot.overview).total >= 10;
  if (
    words < (hasSubstantialData ? 80 : 35)
    || forbiddenInference.test(text)
    || invalidOutputToken.test(text)
    || hasBrokenReportText(text)
    || hasUnsupportedNumericClaim(text, snapshot)
  ) {
    return false;
  }
  return requiredSectionValues(key, snapshot).every((valueToFind) => (
    valueToFind === 0 || new RegExp(`(^|\\D)${valueToFind}(?:\\.0)?(?=\\D|$)`).test(text)
  ));
};

export const mergeValidatedPdfInterpretations = (
  candidate: unknown,
  fallback: PdfInterpretations,
  snapshot: DescriptiveAnalyticsSnapshot,
): PdfInterpretations => {
  const source = candidate && typeof candidate === 'object'
    ? candidate as Partial<Record<DescriptiveSectionKey, unknown>>
    : {};
  return (Object.keys(fallback) as DescriptiveSectionKey[]).reduce<PdfInterpretations>((result, key) => {
    const normalizedCandidate = normalizeReportText(source[key]);
    result[key] = isValidAiInterpretation(key, normalizedCandidate, snapshot)
      ? normalizedCandidate
      : normalizeReportText(fallback[key]);
    return result;
  }, { ...fallback });
};

export const analyticsFingerprint = (value: unknown): string => {
  const source = JSON.stringify(value) || '';
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${source.length}-${(hash >>> 0).toString(16)}`;
};
