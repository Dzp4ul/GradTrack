import ExcelJS from 'exceljs';
import JSZip from 'jszip';

export interface SpreadsheetWorkbook {
  sheetNames: string[];
  sheets: Record<string, unknown[][]>;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 50_000;
const MAX_COLUMNS = 500;
const MAX_XML_CHARACTERS = 50 * 1024 * 1024;

const excelValue = (value: ExcelJS.CellValue): unknown => {
  if (value === null || value === undefined || typeof value !== 'object' || value instanceof Date) return value ?? '';
  if ('result' in value) return excelValue(value.result as ExcelJS.CellValue);
  if ('text' in value) return String(value.text ?? '');
  if ('richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text).join('');
  }
  if ('error' in value) return String(value.error ?? '');
  return String(value);
};

const worksheetRows = (worksheet: ExcelJS.Worksheet): unknown[][] => {
  const rowCount = worksheet.actualRowCount;
  const columnCount = worksheet.actualColumnCount;
  if (rowCount > MAX_ROWS || columnCount > MAX_COLUMNS) {
    throw new Error(`Spreadsheet exceeds the ${MAX_ROWS.toLocaleString()} row or ${MAX_COLUMNS} column safety limit.`);
  }

  const rows: unknown[][] = [];
  for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values: unknown[] = [];
    for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
      values.push(excelValue(row.getCell(columnNumber).value));
    }
    rows.push(values);
  }
  return rows;
};

const decodeXmlText = (value: string): string => value
  .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');

const xmlAttribute = (attributes: string, name: string): string => {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = attributes.match(new RegExp(`(?:^|\\s)${escapedName}=(?:"([^"]*)"|'([^']*)')`, 'i'));
  return decodeXmlText(match?.[1] ?? match?.[2] ?? '');
};

const xmlTextRuns = (xml: string): string => {
  const parts: string[] = [];
  const textPattern = /<(?:[A-Za-z_][\w.-]*:)?t\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?t>/gi;
  for (const match of xml.matchAll(textPattern)) {
    parts.push(decodeXmlText(match[1]));
  }
  return parts.join('');
};

const columnIndexFromReference = (reference: string): number => {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? '';
  let value = 0;
  for (const letter of letters) value = (value * 26) + letter.charCodeAt(0) - 64;
  return value;
};

const normalizeZipPath = (target: string): string => {
  const normalized = target.replace(/\\/g, '/').replace(/^\/+/, '');
  const path = normalized.startsWith('xl/') ? normalized : `xl/${normalized}`;
  const parts: string[] = [];
  path.split('/').forEach((part) => {
    if (part === '' || part === '.') return;
    if (part === '..') parts.pop();
    else parts.push(part);
  });
  return parts.join('/');
};

const parseSharedStringsXml = (xml: string): string[] => {
  const strings: string[] = [];
  const itemPattern = /<(?:[A-Za-z_][\w.-]*:)?si\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?si>/gi;
  for (const match of xml.matchAll(itemPattern)) strings.push(xmlTextRuns(match[1]));
  return strings;
};

const parseWorksheetXml = (xml: string, sharedStrings: string[]): unknown[][] => {
  const rows: unknown[][] = [];
  let maximumColumn = 0;
  const rowPattern = /<(?:[A-Za-z_][\w.-]*:)?row\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?row>/gi;

  for (const rowMatch of xml.matchAll(rowPattern)) {
    const rowNumber = Number.parseInt(xmlAttribute(rowMatch[1], 'r'), 10);
    if (!Number.isFinite(rowNumber) || rowNumber < 1) continue;
    if (rowNumber > MAX_ROWS) throw new Error(`Spreadsheet exceeds the ${MAX_ROWS.toLocaleString()} row safety limit.`);

    const values: unknown[] = [];
    const cellPattern = /<(?:[A-Za-z_][\w.-]*:)?c\b([^>]*?)(?:>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?c>|\s*\/>)/gi;
    for (const cellMatch of rowMatch[2].matchAll(cellPattern)) {
      const reference = xmlAttribute(cellMatch[1], 'r');
      const columnNumber = columnIndexFromReference(reference);
      if (columnNumber < 1) continue;
      if (columnNumber > MAX_COLUMNS) throw new Error(`Spreadsheet exceeds the ${MAX_COLUMNS} column safety limit.`);
      maximumColumn = Math.max(maximumColumn, columnNumber);

      const type = xmlAttribute(cellMatch[1], 't').toLowerCase();
      const body = cellMatch[2] ?? '';
      const rawValueMatch = body.match(/<(?:[A-Za-z_][\w.-]*:)?v\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?v>/i);
      const rawValue = decodeXmlText(rawValueMatch?.[1] ?? '');
      let value: unknown = '';

      if (type === 's') {
        value = sharedStrings[Number.parseInt(rawValue, 10)] ?? '';
      } else if (type === 'inlinestr') {
        value = xmlTextRuns(body);
      } else if (type === 'b') {
        value = rawValue === '1';
      } else if (type === 'str' || type === 'e') {
        value = rawValue;
      } else if (rawValue !== '') {
        const numericValue = Number(rawValue);
        value = Number.isFinite(numericValue) ? numericValue : rawValue;
      }

      values[columnNumber - 1] = value;
    }
    rows[rowNumber - 1] = values;
  }

  if (rows.length > MAX_ROWS) throw new Error(`Spreadsheet exceeds the ${MAX_ROWS.toLocaleString()} row safety limit.`);
  return rows.map((row) => Array.from({ length: maximumColumn }, (_, index) => row?.[index] ?? ''));
};

// Some registrar-generated workbooks use valid namespace-prefixed OOXML tags
// (for example <x:workbook>) that ExcelJS 4 cannot parse. This fallback reads
// the small, tabular subset GradTrack needs without changing the uploaded file.
const readNamespacedXlsx = async (buffer: ArrayBuffer): Promise<SpreadsheetWorkbook> => {
  const zip = await JSZip.loadAsync(buffer);
  const workbookEntry = zip.file('xl/workbook.xml');
  if (!workbookEntry) throw new Error('Workbook metadata is missing');

  const workbookXml = await workbookEntry.async('string');
  if (workbookXml.length > MAX_XML_CHARACTERS) throw new Error('Workbook metadata is too large');

  const relationshipsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string') ?? '';
  const relationshipTargets = new Map<string, string>();
  const relationshipPattern = /<(?:[A-Za-z_][\w.-]*:)?Relationship\b([^>]*?)(?:\/?>)/gi;
  for (const match of relationshipsXml.matchAll(relationshipPattern)) {
    const id = xmlAttribute(match[1], 'Id');
    const target = xmlAttribute(match[1], 'Target');
    if (id && target) relationshipTargets.set(id, normalizeZipPath(target));
  }

  const sharedStringsEntry = zip.file('xl/sharedStrings.xml');
  const sharedStringsXml = sharedStringsEntry ? await sharedStringsEntry.async('string') : '';
  if (sharedStringsXml.length > MAX_XML_CHARACTERS) throw new Error('Shared strings are too large');
  const sharedStrings = parseSharedStringsXml(sharedStringsXml);

  const sheetNames: string[] = [];
  const sheets: Record<string, unknown[][]> = {};
  const sheetPattern = /<(?:[A-Za-z_][\w.-]*:)?sheet\b([^>]*?)(?:\/?>)/gi;
  let sheetIndex = 0;
  for (const match of workbookXml.matchAll(sheetPattern)) {
    sheetIndex += 1;
    const name = xmlAttribute(match[1], 'name') || `Sheet${sheetIndex}`;
    const relationshipId = xmlAttribute(match[1], 'r:id');
    const target = relationshipTargets.get(relationshipId) ?? `xl/worksheets/sheet${sheetIndex}.xml`;
    const worksheetEntry = zip.file(target);
    if (!worksheetEntry) continue;

    const worksheetXml = await worksheetEntry.async('string');
    if (worksheetXml.length > MAX_XML_CHARACTERS) throw new Error(`Worksheet ${name} is too large`);
    sheetNames.push(name);
    sheets[name] = parseWorksheetXml(worksheetXml, sharedStrings);
  }

  if (sheetNames.length === 0) throw new Error('No readable worksheet was found');
  return { sheetNames, sheets };
};

const csvRows = (content: string): unknown[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '"') {
      if (quoted && content[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && content[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      if (rows.length > MAX_ROWS) throw new Error(`CSV exceeds the ${MAX_ROWS.toLocaleString()} row safety limit.`);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  if (rows.some((candidate) => candidate.length > MAX_COLUMNS)) {
    throw new Error(`CSV exceeds the ${MAX_COLUMNS} column safety limit.`);
  }
  return rows;
};

export const readSpreadsheet = async (file: File): Promise<SpreadsheetWorkbook> => {
  if (file.size > MAX_FILE_BYTES) throw new Error('Import file must be 10 MB or smaller.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv') {
    return { sheetNames: ['CSV'], sheets: { CSV: csvRows(await file.text()) } };
  }
  if (extension !== 'xlsx') {
    throw new Error('Only .xlsx and .csv files are supported. Convert legacy .xls files to .xlsx before importing.');
  }

  const buffer = await file.arrayBuffer();
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheets: Record<string, unknown[][]> = {};
    workbook.eachSheet((worksheet) => {
      sheets[worksheet.name] = worksheetRows(worksheet);
    });
    return { sheetNames: Object.keys(sheets), sheets };
  } catch {
    return readNamespacedXlsx(buffer);
  }
};

export const createXlsxBlob = async (rows: Record<string, unknown>[], sheetName: string): Promise<Blob> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31));
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  if (headers.length > 0) {
    worksheet.addRow(headers);
    rows.forEach((row) => worksheet.addRow(headers.map((header) => {
      const value = row[header];
      return value !== null && typeof value === 'object' ? JSON.stringify(value) : (value ?? '');
    })));
    worksheet.getRow(1).font = { bold: true };
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
