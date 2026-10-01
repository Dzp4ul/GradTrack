import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import type {
  DescriptiveAnalyticsSnapshot,
  DescriptiveSectionKey,
  PdfInterpretations,
  PdfSectionNotes,
} from './descriptiveAnalytics.ts';
import {
  buildReportChartDefinitions,
  renderReportChart,
  reportChartsBySection,
  type ReportChartDefinition,
} from './reportCharts.ts';
import { normalizeReportParagraphs, normalizeReportText } from './reportText.ts';

export interface ReportDocumentMetadata {
  title: string;
  institution: string;
  generatedAt: string;
  departmentLabel: string;
  batchLabel: string;
  surveyLabel: string;
  employmentStatusLabel: string;
  programAlignmentLabel: string;
  courseLabel: string;
}

export interface ReportDocumentTable {
  headers: string[];
  rows: Array<Array<string | number>>;
}

export interface FormalReportDocumentData {
  metadata: ReportDocumentMetadata;
  descriptiveSummary: string;
  keyPerformanceIndicators: Array<[string, string | number]>;
  snapshot: DescriptiveAnalyticsSnapshot;
  interpretations: PdfInterpretations;
  notes: PdfSectionNotes;
  tables: Record<DescriptiveSectionKey, ReportDocumentTable>;
}

export interface GenericDocumentSection {
  title: string;
  interpretation?: string;
  notes?: string[];
  table?: ReportDocumentTable;
  charts?: ReportChartDefinition[];
}

export interface GenericReportDocumentData {
  metadata: ReportDocumentMetadata;
  descriptiveSummary?: string;
  keyPerformanceIndicators?: Array<[string, string | number]>;
  sections: GenericDocumentSection[];
}

const NAVY = '1B2A4A';
const LIGHT_ROW = 'F7F9FC';
const WHITE = 'FFFFFF';
const BORDER = 'CBD5E1';

const sanitizeCell = (value: string | number): string => normalizeReportText(value);

const createTextParagraphs = (value: unknown): Paragraph[] => {
  const paragraphs = normalizeReportParagraphs(value);
  if (paragraphs.length === 0) {
    return [new Paragraph({
      children: [new TextRun({ text: 'No data available for the selected filters.', italics: true, color: '64748B' })],
      spacing: { after: 160, line: 300 },
    })];
  }

  return paragraphs.map((text) => new Paragraph({
    children: [new TextRun({ text })],
    alignment: AlignmentType.LEFT,
    spacing: { after: 150, line: 310 },
    keepLines: true,
  }));
};

const tableCell = (
  value: string | number,
  options: { header?: boolean; alternate?: boolean; center?: boolean } = {},
): TableCell => new TableCell({
  verticalAlign: VerticalAlign.CENTER,
  shading: options.header
    ? { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' }
    : options.alternate
      ? { type: ShadingType.CLEAR, fill: LIGHT_ROW, color: 'auto' }
      : undefined,
  margins: { top: 80, right: 85, bottom: 80, left: 85 },
  children: [new Paragraph({
    alignment: options.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: [new TextRun({
      text: sanitizeCell(value),
      bold: options.header,
      color: options.header ? WHITE : '1F2937',
      size: options.header ? 16 : 15,
    })],
    spacing: { after: 0, line: 230 },
  })],
});

const createEditableTable = (table: ReportDocumentTable): Table => {
  const headers = table.headers.length > 0 ? table.headers : ['Result'];
  const sourceRows = table.rows.length > 0
    ? table.rows
    : [['No data available for the selected filters.']];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: BORDER },
      left: { style: BorderStyle.SINGLE, size: 2, color: BORDER },
      right: { style: BorderStyle.SINGLE, size: 2, color: BORDER },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map((header) => tableCell(header, { header: true, center: headers.length > 2 })),
      }),
      ...sourceRows.map((row, rowIndex) => new TableRow({
        cantSplit: true,
        children: headers.map((_, columnIndex) => tableCell(
          row[columnIndex] ?? '',
          { alternate: rowIndex % 2 === 1, center: columnIndex > 0 },
        )),
      })),
    ],
  });
};

const createMetadataTable = (metadata: ReportDocumentMetadata): Table => createEditableTable({
  headers: ['Report Parameter', 'Selection'],
  rows: [
    ['Generated Date', metadata.generatedAt],
    ['Department', metadata.departmentLabel],
    ['Batch / Graduation Year', metadata.batchLabel],
    ['Selected Survey', metadata.surveyLabel],
    ['Employment Status Filter', metadata.employmentStatusLabel],
    ['Program Alignment Filter', metadata.programAlignmentLabel],
    ['Course / Program Filter', metadata.courseLabel],
  ],
});

const imageParagraph = (chart: ReportChartDefinition, bytes: ArrayBuffer): Paragraph => {
  const availableWidth = 640;
  const renderedHeight = Math.round(availableWidth * (chart.height / chart.width));
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    keepNext: true,
    spacing: { before: 80, after: 160 },
    children: [new ImageRun({
      type: 'png',
      data: new Uint8Array(bytes),
      transformation: { width: availableWidth, height: renderedHeight },
      altText: {
        title: chart.title,
        description: `${chart.title} chart with numerical data labels`,
        name: chart.key,
      },
    })],
  });
};

const renderChartParagraphs = async (charts: ReportChartDefinition[]): Promise<Paragraph[]> => {
  if (charts.length === 0) return [];
  const images = await Promise.all(charts.map(async (chart) => ({
    chart,
    bytes: await renderReportChart(chart, { devicePixelRatio: 2 }),
  })));
  return images.map(({ chart, bytes }) => imageParagraph(chart, bytes));
};

const sectionHeading = (title: string, pageBreakBefore = true): Paragraph => new Paragraph({
  text: normalizeReportText(title),
  heading: HeadingLevel.HEADING_1,
  pageBreakBefore,
  keepNext: true,
  spacing: { before: 120, after: 160 },
});

const subheading = (title: string): Paragraph => new Paragraph({
  text: normalizeReportText(title),
  heading: HeadingLevel.HEADING_2,
  keepNext: true,
  spacing: { before: 160, after: 100 },
});

const buildSectionChildren = async (section: GenericDocumentSection): Promise<Array<Paragraph | Table>> => {
  const children: Array<Paragraph | Table> = [sectionHeading(section.title)];
  children.push(...await renderChartParagraphs(section.charts ?? []));
  children.push(subheading('Descriptive Interpretation'));
  children.push(...createTextParagraphs(section.interpretation));
  children.push(subheading('Data Table'));
  children.push(createEditableTable(section.table ?? { headers: ['Result'], rows: [] }));

  if (section.notes && section.notes.length > 0) {
    children.push(subheading('Data Notes / Additional Observation'));
    section.notes.forEach((note) => {
      children.push(new Paragraph({
        text: normalizeReportText(note),
        bullet: { level: 0 },
        spacing: { after: 80, line: 280 },
      }));
    });
  }
  return children;
};

const createReportDocument = async (data: GenericReportDocumentData): Promise<Document> => {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 500, after: 120 },
      children: [new TextRun({
        text: normalizeReportText(data.metadata.title),
        bold: true,
        size: 36,
        color: NAVY,
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [new TextRun({
        text: normalizeReportText(data.metadata.institution),
        bold: true,
        size: 24,
        color: '475569',
      })],
    }),
    createMetadataTable(data.metadata),
    subheading('Descriptive Summary'),
    ...createTextParagraphs(data.descriptiveSummary),
  ];

  if (data.keyPerformanceIndicators && data.keyPerformanceIndicators.length > 0) {
    children.push(subheading('Key Performance Indicators'));
    children.push(createEditableTable({
      headers: ['Key Performance Indicator', 'Value'],
      rows: data.keyPerformanceIndicators.map(([label, value]) => [label, value]),
    }));
  }

  for (const section of data.sections) {
    children.push(...await buildSectionChildren(section));
  }

  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: 'GradTrack - Confidential Department Report | Page ', size: 16, color: '64748B' }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '64748B' }),
        new TextRun({ text: ' of ', size: 16, color: '64748B' }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '64748B' }),
      ],
    })],
  });

  return new Document({
    creator: 'GradTrack',
    title: normalizeReportText(data.metadata.title),
    description: 'Filtered graduate tracer study report generated by GradTrack.',
    styles: {
      default: {
        document: { run: { font: 'Aptos', size: 21, color: '1F2937' } },
        heading1: { run: { font: 'Aptos Display', size: 28, bold: true, color: NAVY } },
        heading2: { run: { font: 'Aptos', size: 22, bold: true, color: NAVY } },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 850, right: 850, bottom: 850, left: 850, header: 360, footer: 360 },
          pageNumbers: { start: 1 },
        },
      },
      footers: { default: footer },
      children,
    }],
  });
};

export const generateGenericReportDocx = async (data: GenericReportDocumentData): Promise<Blob> => (
  Packer.toBlob(await createReportDocument(data))
);

export const generateFormalReportDocx = async (data: FormalReportDocumentData): Promise<Blob> => {
  const charts = buildReportChartDefinitions(data.snapshot);
  const sectionDefinitions: Array<{
    key: DescriptiveSectionKey;
    title: string;
  }> = [
    { key: 'overview', title: 'Overview Analytics' },
    { key: 'programPerformance', title: 'Program Performance' },
    { key: 'yearlyTrend', title: 'Yearly Employment Trend' },
    { key: 'employmentStatus', title: 'Employment Status Analysis' },
    { key: 'salaryDistribution', title: 'Salary Distribution Analysis' },
  ];

  return generateGenericReportDocx({
    metadata: data.metadata,
    descriptiveSummary: data.descriptiveSummary,
    keyPerformanceIndicators: data.keyPerformanceIndicators,
    sections: sectionDefinitions.map((section) => ({
      title: section.title,
      charts: reportChartsBySection(charts, section.key),
      interpretation: data.interpretations[section.key],
      table: data.tables[section.key],
      notes: data.notes[section.key],
    })),
  });
};
