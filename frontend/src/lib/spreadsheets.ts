import ExcelJS from 'exceljs';

export interface SpreadsheetWorkbook {
  sheetNames: string[];
  sheets: Record<string, unknown[][]>;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 50_000;
const MAX_COLUMNS = 500;

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

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheets: Record<string, unknown[][]> = {};
  workbook.eachSheet((worksheet) => {
    sheets[worksheet.name] = worksheetRows(worksheet);
  });
  return { sheetNames: Object.keys(sheets), sheets };
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
