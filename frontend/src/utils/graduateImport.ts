import { normalizeGraduationYear } from './graduationYears.ts';
import type { SpreadsheetWorkbook } from '../lib/spreadsheets.ts';

export interface GraduateImportProgramOption {
  id: string;
  code: string;
  name: string;
}

export interface GraduateImportRow {
  row: Record<string, unknown>;
  sheetName: string;
  rowNumber: number;
  inferredProgramId: string;
  graduationYear: string;
}

export interface GraduateImportExtraction {
  rows: GraduateImportRow[];
  sheetCount: number;
  graduationYears: string[];
}

const normalizeCellText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const normalizeHeaderKey = (value: unknown): string => normalizeCellText(value).toLowerCase().replace(/[^a-z0-9]/g, '');

const STUDENT_HEADER_KEYS = new Set(['studentnumber', 'studentno', 'studentid', 'idnumber']);
const FULL_NAME_HEADER_KEYS = new Set(['name', 'fullname', 'nameofstudent', 'nameofstudents', 'studentname', 'graduatename']);
const FIRST_NAME_HEADER_KEYS = new Set(['firstname', 'givenname']);
const LAST_NAME_HEADER_KEYS = new Set(['lastname', 'surname']);

const PROGRAM_CODE_ALIASES: Record<string, string> = {
  BSHRM: 'BSHM',
  HRM: 'BSHM',
  HM: 'BSHM',
};

const PROGRAM_NAME_ALIASES: Record<string, string> = {
  bachelorofscienceinhotelandrestaurantmanagement: 'BSHM',
  bachelorofscienceinhospitalitymanagement: 'BSHM',
  bachelorofscienceincomputerscience: 'BSCS',
  bachelorofelementaryeducation: 'BEED',
  bachelorofsecondaryeducation: 'BSED',
  associateincomputertechnology: 'ACT',
  bachelorofscienceinnursing: 'BSN',
};

const rowText = (row: unknown[]): string => Array.from(new Set(
  row.map(normalizeCellText).filter(Boolean),
)).join(' ').replace(/\s+/g, ' ').trim();

const rowIsEmpty = (row: unknown[]): boolean => row.every((cell) => normalizeCellText(cell) === '');

const headerKeys = (row: unknown[]): Set<string> => new Set(row.map(normalizeHeaderKey).filter(Boolean));

const isGraduateHeaderRow = (row: unknown[]): boolean => {
  const keys = headerKeys(row);
  const hasStudent = [...STUDENT_HEADER_KEYS].some((key) => keys.has(key));
  const hasFullName = [...FULL_NAME_HEADER_KEYS].some((key) => keys.has(key));
  const hasSplitName = [...FIRST_NAME_HEADER_KEYS].some((key) => keys.has(key))
    && [...LAST_NAME_HEADER_KEYS].some((key) => keys.has(key));
  return hasStudent && (hasFullName || hasSplitName);
};

const recordValue = (record: Record<string, unknown>, keys: Set<string>): string => {
  for (const [header, value] of Object.entries(record)) {
    if (keys.has(normalizeHeaderKey(header))) {
      const normalized = normalizeCellText(value);
      if (normalized !== '') return normalized;
    }
  }
  return '';
};

const recordFromRow = (headers: string[], row: unknown[]): Record<string, unknown> => {
  const record: Record<string, unknown> = {};
  headers.forEach((header, index) => {
    if (header !== '') record[header] = row[index] ?? '';
  });
  return record;
};

const isGraduateDataRecord = (record: Record<string, unknown>): boolean => {
  const studentId = recordValue(record, STUDENT_HEADER_KEYS);
  const fullName = recordValue(record, FULL_NAME_HEADER_KEYS);
  const firstName = recordValue(record, FIRST_NAME_HEADER_KEYS);
  const lastName = recordValue(record, LAST_NAME_HEADER_KEYS);
  const hasName = fullName !== '' || (firstName !== '' && lastName !== '');

  // Registrar lists always carry a compact student number. Requiring a value
  // without whitespace prevents merged title rows from becoming graduates.
  return hasName && studentId !== '' && !/\s/.test(studentId);
};

const startsRegistrarSection = (text: string): boolean => /\bnorzagaray\s+college\b/i.test(text);

const legacyMissingProgramId = (
  seenProgramCodes: Set<string>,
  programOptions: GraduateImportProgramOption[],
): string => {
  const precedingCodes = ['BSHM', 'BEED', 'BSCS'];
  if (!precedingCodes.every((code) => seenProgramCodes.has(code)) || seenProgramCodes.has('BSED')) return '';
  return programOptions.find((program) => program.code.toUpperCase() === 'BSED')?.id ?? '';
};

export function resolveGraduateImportProgramId(
  value: unknown,
  programOptions: GraduateImportProgramOption[],
): string {
  const text = normalizeCellText(value);
  if (!text) return '';

  const tokens = text.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  for (const token of tokens) {
    const canonicalCode = PROGRAM_CODE_ALIASES[token] ?? token;
    const match = programOptions.find((program) => program.code.toUpperCase() === canonicalCode);
    if (match) return match.id;
  }

  const normalizedText = normalizeHeaderKey(text);
  const aliasCode = Object.entries(PROGRAM_NAME_ALIASES)
    .find(([name]) => normalizedText.includes(name))?.[1];
  if (aliasCode) {
    return programOptions.find((program) => program.code.toUpperCase() === aliasCode)?.id ?? '';
  }

  const nameMatch = programOptions.find((program) => {
    const normalizedName = normalizeHeaderKey(program.name);
    return normalizedName !== '' && normalizedText.includes(normalizedName);
  });
  return nameMatch?.id ?? '';
}

export function extractOfficialListGraduationYear(rows: unknown[][]): string | null {
  for (const row of rows) {
    const text = rowText(row);
    const academicYearMatch = text.match(
      /\b(?:a\.?\s*y\.?|academic\s+year|school\s+year)\s*[:.]?\s*((?:19|20)\d{2})\s*[-–/]\s*((?:19|20)\d{2})\b/i,
    );
    const academicYear = normalizeGraduationYear(academicYearMatch?.[2]);
    if (academicYear) return academicYear;

    const match = text.match(
      /\bofficial\s+(?:list\s+of\s+graduates?|graduates?\s+list)\b[^0-9]{0,40}\b((?:19|20)\d{2})\b/i,
    );
    const year = normalizeGraduationYear(match?.[1]);
    if (year) return year;
  }

  return null;
}

export function extractGraduateImportRows(
  workbook: SpreadsheetWorkbook,
  programOptions: GraduateImportProgramOption[],
): GraduateImportExtraction {
  const importedRows: GraduateImportRow[] = [];
  const graduationYears = new Set<string>();

  workbook.sheetNames.forEach((sheetName) => {
    const rows = workbook.sheets[sheetName] ?? [];
    const sheetProgramId = resolveGraduateImportProgramId(sheetName, programOptions);
    const sheetYear = extractOfficialListGraduationYear(rows.slice(0, 30)) ?? '';
    const seenProgramCodes = new Set<string>();
    let currentProgramId = sheetProgramId;
    let currentYear = sheetYear;
    let activeHeaders: string[] | null = null;

    if (sheetProgramId) {
      const sheetProgram = programOptions.find((program) => program.id === sheetProgramId);
      if (sheetProgram) seenProgramCodes.add(sheetProgram.code.toUpperCase());
    }

    rows.forEach((row, index) => {
      const cells = row ?? [];
      if (rowIsEmpty(cells)) {
        return;
      }

      const text = rowText(cells);
      if (startsRegistrarSection(text)) {
        activeHeaders = null;
        currentProgramId = sheetProgramId;
      }

      const rowYear = extractOfficialListGraduationYear([cells]);
      if (rowYear) currentYear = rowYear;

      if (isGraduateHeaderRow(cells)) {
        if (!currentProgramId) {
          currentProgramId = legacyMissingProgramId(seenProgramCodes, programOptions);
          const inferredProgram = programOptions.find((program) => program.id === currentProgramId);
          if (inferredProgram) seenProgramCodes.add(inferredProgram.code.toUpperCase());
        }
        activeHeaders = cells.map(normalizeCellText);
        return;
      }

      if (activeHeaders) {
        const record = recordFromRow(activeHeaders, cells);
        if (isGraduateDataRecord(record)) {
          if (currentYear) graduationYears.add(currentYear);
          importedRows.push({
            row: record,
            sheetName,
            rowNumber: index + 1,
            inferredProgramId: currentProgramId,
            graduationYear: currentYear,
          });
          return;
        }
      }

      const rowProgramId = resolveGraduateImportProgramId(text, programOptions);
      if (rowProgramId) {
        currentProgramId = rowProgramId;
        const program = programOptions.find((option) => option.id === rowProgramId);
        if (program) seenProgramCodes.add(program.code.toUpperCase());
      }
    });
  });

  return {
    rows: importedRows,
    sheetCount: workbook.sheetNames.length,
    graduationYears: Array.from(graduationYears).sort((first, second) => Number(first) - Number(second)),
  };
}

export function resolveImportedGraduationYear(
  officialListYear: unknown,
  rowYear: unknown,
  selectedFilterYear: unknown,
): string {
  return normalizeGraduationYear(officialListYear)
    ?? normalizeGraduationYear(rowYear)
    ?? normalizeGraduationYear(selectedFilterYear)
    ?? '';
}
