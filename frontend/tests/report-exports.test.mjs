import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { buildReportChartDefinitions } from '../src/utils/reportCharts.ts';
import { generateGenericReportDocx } from '../src/utils/reportDocumentExport.ts';
import { normalizeReportText } from '../src/utils/reportText.ts';

const snapshot = {
  overview: {
    total_graduates: 59,
    total_employed: 50,
    total_unemployed: 9,
    total_employment_known: 59,
    total_employed_local: 46,
    total_employed_abroad: 4,
    total_aligned: 29,
    total_not_aligned: 21,
  },
  programPerformance: [
    { code: 'ACT', total_graduates: 4, employment_total: 4, employed: 3, unemployed: 1, aligned: 0, not_aligned: 3 },
    { code: 'BEED', total_graduates: 14, employment_total: 14, employed: 11, unemployed: 3, aligned: 6, not_aligned: 5 },
    { code: 'BSCS', total_graduates: 30, employment_total: 30, employed: 28, unemployed: 2, aligned: 16, not_aligned: 12 },
  ],
  yearlyTrend: [
    { year_graduated: 2025, total_graduates: 59, employment_total: 59, employed: 50, unemployed: 9, aligned: 29, not_aligned: 21, alignment_total: 50 },
  ],
  employmentStatus: [
    { employment_status: 'Employed (Local)', count: 46 },
    { employment_status: 'Employed (Abroad)', count: 4 },
    { employment_status: 'Unemployed', count: 9 },
  ],
  salaryDistribution: [
    { salary_range: 'Below ₱5,000', count: 1 },
    { salary_range: '₱5,000 - ₱10,000', count: 4 },
  ],
};

const charts = buildReportChartDefinitions(snapshot);
assert.equal(charts.filter((chart) => chart.section === 'overview').length, 3, 'overview export includes employment, work-location, and alignment charts');

const employmentPie = charts.find((chart) => chart.key === 'overview-employment');
assert.ok(employmentPie, 'employment pie chart is generated');
assert.equal(employmentPie.config.type, 'pie', 'pie charts use the stable data-label renderer');
assert.deepEqual(
  employmentPie.config.data.labels,
  ['Employed: 50 (84.7%)', 'Unemployed: 9 (15.3%)'],
  'pie legends contain the count and correctly denominated percentage',
);
assert.equal(employmentPie.config.options.plugins.datalabels.display, true);
assert.equal(employmentPie.config.options.plugins.datalabels.formatter, '__GRADTRACK_PIE_LABEL_FORMATTER__');

const locationPie = charts.find((chart) => chart.key === 'overview-location');
assert.deepEqual(
  locationPie.config.data.labels,
  ['Local: 46 (92%)', 'Abroad: 4 (8%)'],
  'work-location percentages use employed respondents as their denominator',
);

const alignmentPie = charts.find((chart) => chart.key === 'overview-alignment');
assert.deepEqual(
  alignmentPie.config.data.labels,
  ['Aligned: 29 (58%)', 'Not Aligned: 21 (42%)'],
  'alignment percentages use valid alignment responses as their denominator',
);

const programBar = charts.find((chart) => chart.key === 'program-performance');
assert.ok(programBar, 'program bar chart is generated');
assert.equal(programBar.config.options.plugins.datalabels.anchor, 'end');
assert.equal(programBar.config.options.plugins.datalabels.align, 'end');
assert.equal(programBar.config.options.plugins.datalabels.clip, false, 'bar values are not clipped at the chart boundary');
assert.ok(programBar.config.options.scales.yAxes[0].ticks.suggestedMax > 28, 'the y-axis reserves headroom above the highest bar label');

const tinySliceCharts = buildReportChartDefinitions({
  ...snapshot,
  overview: {
    ...snapshot.overview,
    total_graduates: 100,
    total_employed: 99,
    total_unemployed: 1,
    total_employment_known: 100,
  },
});
const tinySlicePie = tinySliceCharts.find((chart) => chart.key === 'overview-employment');
assert.deepEqual(
  tinySlicePie.config.data.labels,
  ['Employed: 99 (99%)', 'Unemployed: 1 (1%)'],
  'very small pie slices retain full count and percentage details in the legend',
);

const zeroCharts = buildReportChartDefinitions({
  overview: {
    total_graduates: 0,
    total_employed: 0,
    total_unemployed: 0,
    total_employment_known: 0,
    total_employed_local: 0,
    total_employed_abroad: 0,
    total_aligned: 0,
    total_not_aligned: 0,
  },
  programPerformance: [{
    name: 'Bachelor of Science in an Intentionally Long Program Name',
    total_graduates: 0,
    employment_total: 0,
    employed: 0,
    unemployed: 0,
    aligned: 0,
    not_aligned: 0,
  }],
  yearlyTrend: [],
  employmentStatus: [],
  salaryDistribution: [],
});
assert.equal(zeroCharts.some((chart) => chart.key === 'overview-employment'), false, 'all-zero pie data does not produce a broken graph');
assert.equal(zeroCharts.some((chart) => chart.key === 'salary-distribution'), false, 'missing salary answers do not produce a broken graph');
assert.doesNotMatch(JSON.stringify(zeroCharts), /NaN|Infinity|undefined|null/, 'zero and missing data never create invalid chart values');

const documentBlob = await generateGenericReportDocx({
  metadata: {
    title: 'Graduate Tracer Study Report',
    institution: 'Norzagaray College',
    generatedAt: 'October 1, 2026',
    departmentLabel: 'All Departments',
    batchLabel: 'All Years',
    surveyLabel: 'Graduate Tracer Study Survey 2021 - 2025',
    employmentStatusLabel: 'All',
    programAlignmentLabel: 'All',
    courseLabel: 'All Courses',
  },
  descriptiveSummary: 'The report contains 59 responses and remains descriptive.',
  keyPerformanceIndicators: [['Total Responses', 59], ['Employed', 50]],
  sections: [{
    title: 'Program Performance',
    interpretation: 'Program-level data show variation in sample size, employment, and alignment.',
    table: {
      headers: ['Program', 'Responses', 'Employed'],
      rows: [['BSCS', 30, 28]],
    },
    notes: ['Observed counts do not establish causation.'],
  }],
});

assert.equal(documentBlob.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
const zip = await JSZip.loadAsync(await documentBlob.arrayBuffer());
for (const requiredPart of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/footer1.xml']) {
  assert.ok(zip.file(requiredPart), `DOCX contains ${requiredPart}`);
}
const documentXml = await zip.file('word/document.xml').async('string');
assert.match(documentXml, /Graduate Tracer Study Report/);
assert.match(documentXml, /Program-level data show variation/);
assert.match(documentXml, /<w:tbl>/, 'DOCX tables are native editable Word tables');
assert.doesNotMatch(documentXml, /P r o g r a m/, 'DOCX prose contains no accidental letter spacing');

const pdf = new jsPDF({ compress: false });
pdf.setFont('helvetica', 'normal');
const pdfSafeInterpretation = normalizeReportText(
  'Among the valid responses, the employment rate is 84.1\u202f% and the alignment rate is 60.4\u202f%.',
  { peso: 'php' },
);
for (const [index, line] of pdf.splitTextToSize(pdfSafeInterpretation, 180).entries()) {
  pdf.text(line, 20, 30 + index * 12, { align: 'left' });
}
const rawPdf = Buffer.from(pdf.output('arraybuffer')).toString('latin1');
assert.doesNotMatch(rawPdf, /\x00[A-Za-z]\x00[A-Za-z]/, 'PDF interpretation lines are not emitted as incompatible UTF-16 text');
assert.match(rawPdf, /84\.1%/, 'PDF-safe output preserves percentages without a narrow no-break space');

console.log('All report export tests passed.');
