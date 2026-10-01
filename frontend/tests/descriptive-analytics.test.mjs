import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyticsFingerprint,
  buildPdfInterpretations,
  buildStructuredOverviewAnalysis,
  formatPercentage,
  mergeValidatedPdfInterpretations,
  normalizeSalaryLabel,
  percentage,
} from '../src/utils/descriptiveAnalytics.ts';
import { hasBrokenReportText, normalizeReportText } from '../src/utils/reportText.ts';

const snapshot = {
  overview: {
    total_graduates: 59,
    total_employed: 50,
    total_unemployed: 9,
    total_employment_known: 59,
    total_employment_unknown: 0,
    total_employed_local: 46,
    total_employed_abroad: 4,
    total_aligned: 29,
    total_not_aligned: 21,
    total_alignment_known: 50,
    employment_rate: 84.7,
    alignment_rate: 58,
  },
  programPerformance: [
    { code: 'ACT', total_graduates: 4, employment_total: 4, employed: 3, unemployed: 1, employment_rate: 75, aligned: 0, not_aligned: 3, alignment_total: 3, alignment_rate: 0 },
    { code: 'BEED', total_graduates: 14, employment_total: 14, employed: 11, unemployed: 3, employment_rate: 78.6, aligned: 6, not_aligned: 5, alignment_total: 11, alignment_rate: 54.5 },
    { code: 'BSCS', total_graduates: 30, employment_total: 30, employed: 28, unemployed: 2, employment_rate: 93.3, aligned: 16, not_aligned: 12, alignment_total: 28, alignment_rate: 57.1 },
    { code: 'BSED', total_graduates: 6, employment_total: 6, employed: 6, unemployed: 0, employment_rate: 100, aligned: 5, not_aligned: 1, alignment_total: 6, alignment_rate: 83.3 },
    { code: 'BSHM', total_graduates: 5, employment_total: 5, employed: 2, unemployed: 3, employment_rate: 40, aligned: 2, not_aligned: 0, alignment_total: 2, alignment_rate: 100 },
  ],
  yearlyTrend: [
    { year_graduated: 2022, total_graduates: 15, employment_total: 15, employed: 11, unemployed: 4, employment_rate: 73.3, aligned: 6, alignment_total: 11, alignment_rate: 54.5, not_aligned: 5 },
    { year_graduated: 2023, total_graduates: 24, employment_total: 24, employed: 22, unemployed: 2, employment_rate: 91.7, aligned: 14, alignment_total: 22, alignment_rate: 63.6, not_aligned: 8 },
    { year_graduated: 2024, total_graduates: 20, employment_total: 20, employed: 17, unemployed: 3, employment_rate: 85, aligned: 9, alignment_total: 17, alignment_rate: 52.9, not_aligned: 8 },
  ],
  employmentStatus: [
    { employment_status: 'Employed (Local)', count: 46 },
    { employment_status: 'Employed (Abroad)', count: 4 },
    { employment_status: 'Unemployed', count: 9 },
  ],
  salaryDistribution: [
    { salary_range: 'Below ₱5,000', count: 1 },
    { salary_range: '₱5,000 - ₱10,000', count: 4 },
    { salary_range: '₱10,000 - ₱15,000', count: 12 },
    { salary_range: '₱15,000 - ₱20,000', count: 12 },
    { salary_range: '₱20,000 - ₱25,000', count: 8 },
    { salary_range: '₱25,000 and above', count: 5 },
  ],
};

assert.equal(percentage(50, 59), 84.7, 'employment percentage rounds to one decimal place');
assert.equal(percentage(1, 0), null, 'zero denominator is unavailable');
assert.equal(formatPercentage(1, 0), 'Not available', 'zero denominator never renders NaN or Infinity');
assert.equal(normalizeSalaryLabel('â‚±5,000 - â‚±10,000'), '₱5,000 – ₱10,000', 'mojibake salary labels are normalized');
assert.equal(
  normalizeReportText('P r o g r a m   l e v e l   d a t a   s h o w variation.'),
  'Program level data show variation.',
  'accidental character-by-character spacing is repaired without joining words',
);
assert.equal(
  normalizeReportText('Program �level and job �course alignment'),
  'Program-level and job-course alignment',
  'replacement characters between words are normalized as standard hyphens',
);
assert.equal(
  normalizeReportText('Salary: ₱15,000', { peso: 'php' }),
  'Salary: PHP 15,000',
  'PDF-safe text uses PHP when the built-in PDF font cannot guarantee the peso glyph',
);
assert.equal(normalizeReportText('valid\u0000 text\u200B here'), 'valid text here', 'control and invisible characters are removed');
assert.equal(
  normalizeReportText('Employment rate: 84.1\u202f% and alignment: 60.4\u00a0%.'),
  'Employment rate: 84.1% and alignment: 60.4%.',
  'typographic spaces before percentages are converted to PDF-safe spacing',
);
assert.equal(hasBrokenReportText('Employment rate: 84.1\u202f%'), true, 'narrow no-break spaces are detected before normalization');
assert.equal(hasBrokenReportText('P r o g r a m level'), true, 'letter-spaced source text is detected');

const structured = buildStructuredOverviewAnalysis(snapshot.overview, snapshot.programPerformance);
assert.equal(structured.keyFindings.find((item) => item.label === 'Employment rate')?.value, '84.7%');
assert.match(structured.alignmentAnalysis, /29 report work aligned.*21 report work that is not aligned/);
assert.match(structured.alignmentAnalysis, /sum of aligned and not-aligned responses/);
assert.match(structured.programAnalysis, /ACT:/);
assert.match(structured.programAnalysis, /BSHM:/);
assert.doesNotMatch(structured.summary, /\b(?:caused?|proves?)\b/i);

const pdf = buildPdfInterpretations(snapshot);
for (const program of ['ACT', 'BEED', 'BSCS', 'BSED', 'BSHM']) {
  assert.match(pdf.programPerformance, new RegExp(program), `program interpretation includes ${program}`);
}
for (const year of ['2022', '2023', '2024']) {
  assert.match(pdf.yearlyTrend, new RegExp(year), `year interpretation includes ${year}`);
}
for (const range of ['Below ₱5,000', '₱5,000 – ₱10,000', '₱25,000 and above']) {
  assert.ok(pdf.salaryDistribution.includes(range), `salary interpretation includes ${range}`);
}
assert.match(pdf.salaryDistribution, /42 valid grouped salary responses/);
assert.match(pdf.salaryDistribution, /17 responses do not contribute/);
assert.match(pdf.salaryDistribution, /tied across/);
assert.ok(pdf.programPerformance.split(/\s+/).length <= 240, 'five-program interpretation stays readable while covering every program');
assert.doesNotMatch(Object.values(pdf).join(' '), /NaN|Infinity|undefined|null/);
assert.doesNotMatch(Object.values(pdf).join(' '), /partially aligned/i, 'PDF interpretations use only the two supported alignment categories');

const rejectedAi = mergeValidatedPdfInterpretations({
  overview: 'This proves the program caused a statistically significant relationship.',
  programPerformance: 'Too short.',
}, pdf, snapshot);
assert.equal(rejectedAi.overview, pdf.overview, 'causal/inferential AI output is rejected');
assert.equal(rejectedAi.programPerformance, pdf.programPerformance, 'undersized AI output is rejected');

const emptySnapshot = {
  overview: { total_graduates: 0, total_employed: 0, total_employment_known: 0, total_alignment_known: 0 },
  programPerformance: [],
  yearlyTrend: [],
  employmentStatus: [],
  salaryDistribution: [],
};
const emptyPdf = buildPdfInterpretations(emptySnapshot);
assert.match(emptyPdf.overview, /no traced graduate responses/i);
assert.match(emptyPdf.salaryDistribution, /missing salary information is not treated as ₱0/i);
assert.notEqual(analyticsFingerprint(snapshot), analyticsFingerprint(emptySnapshot), 'data changes invalidate the analytics cache key');

const singleScope = {
  overview: { ...snapshot.overview, total_graduates: 4, total_employed: 3, total_unemployed: 1, total_employment_known: 4, total_employed_local: 2, total_employed_abroad: 1, total_aligned: 1, total_not_aligned: 2, total_alignment_known: 3, employment_rate: 75, alignment_rate: 33.3 },
  programPerformance: [snapshot.programPerformance[0]],
  yearlyTrend: [{ year_graduated: 2024, total_graduates: 4, employment_total: 4, employed: 3, unemployed: 1, employment_rate: 75, aligned: 1, alignment_total: 3, alignment_rate: 33.3, not_aligned: 2 }],
  employmentStatus: [{ employment_status: 'Employed (Local)', count: 2 }, { employment_status: 'Employed (Abroad)', count: 1 }, { employment_status: 'Unemployed', count: 1 }],
  salaryDistribution: [{ salary_range: 'Below ₱5,000', count: 1 }, { salary_range: '₱5,000 - ₱10,000', count: 0 }],
};
const singlePdf = buildPdfInterpretations(singleScope);
assert.match(singlePdf.programPerformance, /1 program/);
assert.match(singlePdf.yearlyTrend, /Only one graduation year/);
assert.match(singlePdf.overview, /1 are aligned and 2 are not aligned/);
assert.doesNotMatch(Object.values(singlePdf).join(' '), /NaN|Infinity|undefined|null/);

const validAiOverview = `${pdf.overview}\n\nWithin the selected responses, this additional synthesis remains descriptive and uses the same verified counts and denominators.`;
const acceptedAi = mergeValidatedPdfInterpretations({ overview: validAiOverview }, pdf, snapshot);
assert.equal(acceptedAi.overview, validAiOverview, 'valid GROQ content is retained when it matches the current snapshot');
const inventedCountAi = mergeValidatedPdfInterpretations({
  overview: `${validAiOverview} An unsupported total of 999 respondents is also claimed.`,
}, pdf, snapshot);
assert.equal(inventedCountAi.overview, pdf.overview, 'GROQ content with an unsupported number is rejected');

const here = dirname(fileURLToPath(import.meta.url));
const reportsSource = readFileSync(resolve(here, '../src/pages/admin/Reports.tsx'), 'utf8');
const analyticsUtilitySource = readFileSync(resolve(here, '../src/utils/descriptiveAnalytics.ts'), 'utf8');
const reportsApiSource = readFileSync(resolve(here, '../../backend/api/reports/index.php'), 'utf8');
const aiApiSource = readFileSync(resolve(here, '../../backend/api/reports/ai-analytics.php'), 'utf8');
const overviewAiIndex = reportsSource.indexOf('{renderAiAnalyticsSection()}');
assert.ok(
  overviewAiIndex > reportsSource.indexOf('{/* Pie Charts Section */}')
    && overviewAiIndex < reportsSource.indexOf('{/* By Program */}'),
  'Overview AI descriptive analytics is rendered after all Overview charts',
);
assert.doesNotMatch(reportsSource, /structured\.keyFindings\.map/, 'the AI section does not render duplicate KPI cards');
assert.match(reportsSource, /Descriptive Analysis[\s\S]*Program-Level Analysis[\s\S]*Overall Summary[\s\S]*Data Notes/, 'the AI section uses a report-style paragraph sequence');
for (const source of [reportsSource, analyticsUtilitySource, reportsApiSource, aiApiSource]) {
  assert.doesNotMatch(source, /partially[ _-]?aligned|partial[ _-]?alignment|total_partially_aligned|explicit_not_aligned/i, 'report pipeline contains no unsupported alignment category');
}
assert.match(aiApiSource, /openai\/gpt-oss-120b/, 'Reports AI uses an active Groq model fallback');
assert.doesNotMatch(aiApiSource, /llama-3\.3-70b-versatile|llama-3\.1-8b-instant/, 'Reports AI no longer depends on unavailable Groq models');
assert.match(reportsSource, /\{ name: 'Aligned', value: overview\.total_aligned \}[\s\S]*\{ name: 'Not Aligned', value: overviewNotAligned \}/, 'Job Alignment chart has exactly the two supported categories');
assert.match(reportsSource, /type: 'formal_report'/, 'PDF export requests all chart interpretations in one GROQ payload');
assert.match(reportsSource, /controller\.abort\(\)/, 'PDF GROQ request has a timeout fallback');
assert.ok(
  reportsSource.indexOf("pdf.addImage(imageBase64") < reportsSource.indexOf("pdf.text('Descriptive Interpretation'"),
  'PDF sections place the graph before its detailed interpretation',
);

console.log('All descriptive analytics and PDF fallback tests passed.');
