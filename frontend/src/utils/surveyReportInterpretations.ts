import { hasUnsupportedNumericClaim } from './descriptiveAnalytics.ts';
import {
  hasBrokenReportText,
  normalizeReportParagraphs,
  normalizeReportText,
} from './reportText.ts';

export interface SurveyInterpretationHeaderCell {
  label: string;
  colspan?: number;
  rowspan?: number;
}

export interface SurveyInterpretationRow {
  cells: string[];
  is_total?: boolean;
  is_group?: boolean;
}

export interface SurveyInterpretationTable {
  number: string;
  title: string;
  section_title?: string;
  headers: SurveyInterpretationHeaderCell[][];
  rows: SurveyInterpretationRow[];
  note?: string;
}

export interface SurveyInterpretationPayloadTable extends SurveyInterpretationTable {
  key: string;
  detail_row_count: number;
}

export type SurveyTableInterpretations = Record<string, string>;

const forbiddenInference = /\b(?:caused?|proves?|predicts?|statistically significant|significant relationship|best program|worst program|more successful|less successful)\b/i;
const invalidOutputToken = /\b(?:NaN|Infinity|undefined|null)\b/i;

export const surveyTableInterpretationKey = (index: number): string => `table_${index + 1}`;

const getColumnCount = (table: SurveyInterpretationTable): number => {
  const headerColumnCount = table.headers.reduce((maximum, headerRow) => (
    Math.max(maximum, headerRow.reduce((sum, cell) => sum + (cell.colspan ?? 1), 0))
  ), 0);
  const rowColumnCount = table.rows.reduce((maximum, row) => Math.max(maximum, row.cells.length), 0);
  return Math.max(headerColumnCount, rowColumnCount, 1);
};

export const flattenSurveyInterpretationHeaders = (table: SurveyInterpretationTable): string[] => {
  const columnCount = getColumnCount(table);
  const grid: string[][] = [];

  table.headers.forEach((headerRow, rowIndex) => {
    grid[rowIndex] = grid[rowIndex] ?? [];
    let columnIndex = 0;
    headerRow.forEach((cell) => {
      while (grid[rowIndex][columnIndex]) columnIndex += 1;
      const columnSpan = cell.colspan ?? 1;
      const rowSpan = cell.rowspan ?? 1;
      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        const targetRow = rowIndex + rowOffset;
        grid[targetRow] = grid[targetRow] ?? [];
        for (let columnOffset = 0; columnOffset < columnSpan; columnOffset += 1) {
          grid[targetRow][columnIndex + columnOffset] = cell.label;
        }
      }
      columnIndex += columnSpan;
    });
  });

  return Array.from({ length: columnCount }, (_, columnIndex) => {
    const parts: string[] = [];
    grid.forEach((headerRow) => {
      const label = String(headerRow[columnIndex] ?? '').trim();
      if (label && parts[parts.length - 1] !== label) parts.push(label);
    });
    return parts.join(' ').replace(/\s+/g, ' ').trim() || `Column ${columnIndex + 1}`;
  });
};

const parseDisplayedNumber = (value: unknown): number | null => {
  const normalized = String(value ?? '').trim().replace(/,/g, '').replace(/%$/, '').trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
};

interface DescriptiveRow {
  label: string;
  row: SurveyInterpretationRow;
}

const descriptiveRows = (table: SurveyInterpretationTable): DescriptiveRow[] => {
  const rows: DescriptiveRow[] = [];
  let group = '';
  table.rows.forEach((row, index) => {
    if (row.is_group) {
      group = String(row.cells[0] ?? '').trim();
      return;
    }
    if (row.is_total) return;
    const firstCell = String(row.cells[0] ?? '').trim() || `row ${index + 1}`;
    rows.push({
      label: group && !firstCell.toLowerCase().startsWith(group.toLowerCase())
        ? `${group}: ${firstCell}`
        : firstCell,
      row,
    });
  });
  return rows;
};

const metricColumns = (table: SurveyInterpretationTable, rows: DescriptiveRow[]): number[] => {
  const columnCount = getColumnCount(table);
  const columns: number[] = [];
  for (let columnIndex = 1; columnIndex < columnCount; columnIndex += 1) {
    if (rows.some(({ row }) => parseDisplayedNumber(row.cells[columnIndex]) !== null)) {
      columns.push(columnIndex);
    }
  }
  return columns;
};

const rowValueSummary = (
  entry: DescriptiveRow,
  headers: string[],
  columns: number[],
): string => {
  const values = columns.slice(0, 4).map((columnIndex) => {
    const value = String(entry.row.cells[columnIndex] ?? '').trim() || 'not reported';
    return `${headers[columnIndex]} is ${value}`;
  });
  return values.length > 0
    ? `${entry.label} reports ${values.join(', ')}`
    : `${entry.label} is included as a displayed category`;
};

const metricComparison = (
  rows: DescriptiveRow[],
  headers: string[],
  columnIndex: number,
): string | null => {
  const values = rows
    .map((entry) => ({ entry, value: parseDisplayedNumber(entry.row.cells[columnIndex]) }))
    .filter((item): item is { entry: DescriptiveRow; value: number } => item.value !== null);
  if (values.length === 0) return null;

  const highest = values.reduce((best, item) => item.value > best.value ? item : best, values[0]);
  const lowest = values.reduce((best, item) => item.value < best.value ? item : best, values[0]);
  const metric = headers[columnIndex] || `column ${columnIndex + 1}`;
  if (highest.value === lowest.value) {
    return `${metric} is ${highest.value} for every detailed category with a reported value`;
  }
  return `${metric} is highest for ${highest.entry.label} at ${highest.value} and lowest for ${lowest.entry.label} at ${lowest.value}`;
};

export const buildSurveyInterpretationPayload = (
  tables: SurveyInterpretationTable[],
): SurveyInterpretationPayloadTable[] => tables.map((table, index) => ({
  ...table,
  key: surveyTableInterpretationKey(index),
  detail_row_count: descriptiveRows(table).length,
}));

export const buildSurveyTableFallbackInterpretation = (
  table: SurveyInterpretationTable,
): string => {
  const headers = flattenSurveyInterpretationHeaders(table);
  const rows = descriptiveRows(table);
  const columns = metricColumns(table, rows);
  const totalRow = table.rows.find((row) => row.is_total);
  const tableLabel = `Table ${table.number}`.trim();

  const firstParagraph = [
    `${tableLabel} presents ${table.title} using the frequencies, percentages, and other values displayed in the exported table.`,
    rows.length > 0
      ? `It contains ${rows.length} detailed ${rows.length === 1 ? 'category' : 'categories'}${table.rows.some((row) => row.is_group) ? ' organized under the table\'s reported groups' : ''}.`
      : 'No detailed response category contains a reportable value under the selected filters.',
    rows[0] ? `${rowValueSummary(rows[0], headers, columns)}.` : '',
    rows.length > 1 ? `${rowValueSummary(rows[rows.length - 1], headers, columns)}.` : '',
    totalRow ? `The reported total row contains ${totalRow.cells.slice(1).filter((cell) => String(cell).trim() !== '').join(', ') || 'no additional numeric values'}.` : '',
  ].filter(Boolean).join(' ');

  const comparisons = columns
    .slice(0, 2)
    .map((columnIndex) => metricComparison(rows, headers, columnIndex))
    .filter((value): value is string => Boolean(value));
  const secondParagraph = [
    comparisons[0]
      ? `Across the displayed categories, ${comparisons[0]}.`
      : 'The available cells do not provide a common numeric column for a highest-to-lowest comparison.',
    comparisons[1]
      ? `For the next reported measure, ${comparisons[1]}.`
      : 'Any comparison is therefore limited to the values explicitly shown for each category.',
    rows.length > 1
      ? 'These differences identify where the observed responses are concentrated within this specific table without implying a cause or an unreported relationship.'
      : 'The single available category describes the selected responses but does not support a distributional comparison.',
    table.note
      ? `The table also states: ${String(table.note).trim()}`
      : 'The interpretation remains limited to the table\'s displayed categories and applicable response denominators.',
  ].join(' ');

  return normalizeReportText(`${firstParagraph}\n\n${secondParagraph}`);
};

export const buildSurveyTableFallbackInterpretations = (
  tables: SurveyInterpretationTable[],
): SurveyTableInterpretations => tables.reduce<SurveyTableInterpretations>((result, table, index) => {
  result[surveyTableInterpretationKey(index)] = buildSurveyTableFallbackInterpretation(table);
  return result;
}, {});

export const isValidSurveyTableInterpretation = (
  value: unknown,
  table: SurveyInterpretationPayloadTable,
): value is string => {
  if (typeof value !== 'string') return false;
  const normalized = normalizeReportText(value);
  const paragraphs = normalizeReportParagraphs(normalized);
  const words = normalized.split(/\s+/).filter(Boolean).length;
  if (
    paragraphs.length !== 2
    || paragraphs.some((paragraph) => !/[.!?]$/.test(paragraph))
    || words < (table.detail_row_count > 1 ? 55 : 30)
    || forbiddenInference.test(normalized)
    || invalidOutputToken.test(normalized)
    || hasBrokenReportText(normalized)
    || hasUnsupportedNumericClaim(normalized, table)
  ) {
    return false;
  }
  return true;
};

export const mergeValidatedSurveyTableInterpretations = (
  candidate: unknown,
  fallback: SurveyTableInterpretations,
  tables: SurveyInterpretationPayloadTable[],
): SurveyTableInterpretations => {
  const source = candidate && typeof candidate === 'object'
    ? candidate as Record<string, unknown>
    : {};
  return tables.reduce<SurveyTableInterpretations>((result, table) => {
    const normalizedCandidate = normalizeReportText(source[table.key]);
    result[table.key] = isValidSurveyTableInterpretation(normalizedCandidate, table)
      ? normalizedCandidate
      : fallback[table.key];
    return result;
  }, {});
};
