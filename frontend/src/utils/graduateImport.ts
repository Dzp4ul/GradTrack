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

export interface GraduateImportStructureValidation {
  errorType: 'EMPTY_FILE' | 'INVALID_EXCEL_FORMAT' | null;
  errors: string[];
  requiredColumns: string[];
}

export const GRADUATE_IMPORT_REQUIRED_COLUMNS = [
  'Student Number (or Student ID)',
  'Name (or First Name and Last Name)',
];

const normalizeCellText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const normalizeHeaderKey = (value: unknown): string => normalizeCellText(value).toLowerCase().replace(/[^a-z0-9]/g, '');

const STUDENT_HEADER_KEYS = new Set(['studentnumber', 'studentno', 'studentid', 'idnumber']);
const FULL_NAME_HEADER_KEYS = new Set(['name', 'fullname', 'nameofstudent', 'nameofstudents', 'studentname', 'graduatename']);
const FIRST_NAME_HEADER_KEYS = new Set(['firstname', 'givenname']);
const LAST_NAME_HEADER_KEYS = new Set(['lastname', 'surname']);
const DATA_HEADER_KEYS = new Set([
  ...STUDENT_HEADER_KEYS,
  ...FULL_NAME_HEADER_KEYS,
  ...FIRST_NAME_HEADER_KEYS,
  ...LAST_NAME_HEADER_KEYS,
  'middlename', 'nameextension', 'nameext', 'suffix',
  'email', 'emailadd', 'emailaddress', 'contactno', 'contactnumber', 'phone',
  'program', 'programname', 'programcode', 'programid', 'yeargraduated', 'graduationyear',
  'address', 'employmentstatus', 'coursealignment', 'isaligned', 'companyname', 'jobtitle',
  'industry', 'datehired', 'monthlysalary', 'timetoemploymentmonths', 'timetoemployment',
]);

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

const graduateHeaderAnalysis = (row: unknown[]): { valid: boolean; score: number; missing: string[] } => {
  const keys = headerKeys(row);
  const hasStudent = [...STUDENT_HEADER_KEYS].some((key) => keys.has(key));
  const hasFullName = [...FULL_NAME_HEADER_KEYS].some((key) => keys.has(key));
  const hasFirstName = [...FIRST_NAME_HEADER_KEYS].some((key) => keys.has(key));
  const hasLastName = [...LAST_NAME_HEADER_KEYS].some((key) => keys.has(key));
  const hasName = hasFullName || (hasFirstName && hasLastName);
  const missing: string[] = [];
  if (!hasStudent) missing.push('Missing required column: Student Number (or Student ID)');
  if (!hasName) missing.push('Missing required column: Name (or First Name and Last Name)');
  return {
    valid: hasStudent && hasName,
    score: Number(hasStudent) + (hasFullName ? 2 : 0) + Number(hasFirstName) + Number(hasLastName),
    missing,
  };
};

const recordFromRow = (headers: string[], row: unknown[]): Record<string, unknown> => {
  const record: Record<string, unknown> = {};
  headers.forEach((header, index) => {
    if (header !== '') record[header] = row[index] ?? '';
  });
  return record;
};

const isGraduateCandidateRecord = (record: Record<string, unknown>): boolean => Object.entries(record).some(
  ([header, value]) => DATA_HEADER_KEYS.has(normalizeHeaderKey(header)) && normalizeCellText(value) !== '',
);

const isGraduateSummaryRecord = (record: Record<string, unknown>): boolean => {
  const studentId = Object.entries(record).find(([header]) => STUDENT_HEADER_KEYS.has(normalizeHeaderKey(header)))?.[1];
  if (normalizeCellText(studentId) !== '') return false;
  const name = Object.entries(record).find(([header]) => FULL_NAME_HEADER_KEYS.has(normalizeHeaderKey(header)))?.[1];
  return /^(?:grand\s+)?total(?:\s+graduates?)?$|^(?:summary|member\s+count)$/i.test(normalizeCellText(name));
};

export function validateGraduateImportStructure(
  workbook: SpreadsheetWorkbook,
  programOptions: GraduateImportProgramOption[],
): GraduateImportStructureValidation {
  const hasContent = workbook.sheetNames.some((sheetName) => (
    (workbook.sheets[sheetName] ?? []).some((row) => !rowIsEmpty(row ?? []))
  ));
  if (!hasContent) {
    return {
      errorType: 'EMPTY_FILE',
      errors: ['The selected Excel file does not contain any graduate records to import.'],
      requiredColumns: GRADUATE_IMPORT_REQUIRED_COLUMNS,
    };
  }

  let validHeaderCount = 0;
  let best = { valid: false, score: -1, missing: GRADUATE_IMPORT_REQUIRED_COLUMNS.map((column) => `Missing required column: ${column}`) };
  workbook.sheetNames.forEach((sheetName) => {
    (workbook.sheets[sheetName] ?? []).forEach((row) => {
      const analysis = graduateHeaderAnalysis(row ?? []);
      if (analysis.valid) validHeaderCount += 1;
      if (analysis.score > best.score) best = analysis;
    });
  });

  if (validHeaderCount === 0) {
    return {
      errorType: 'INVALID_EXCEL_FORMAT',
      errors: best.missing,
      requiredColumns: GRADUATE_IMPORT_REQUIRED_COLUMNS,
    };
  }

  const extraction = extractGraduateImportRows(workbook, programOptions);
  if (extraction.rows.length === 0) {
    return {
      errorType: 'EMPTY_FILE',
      errors: ['The selected Excel file contains headers but no graduate records to import.'],
      requiredColumns: GRADUATE_IMPORT_REQUIRED_COLUMNS,
    };
  }

  return { errorType: null, errors: [], requiredColumns: GRADUATE_IMPORT_REQUIRED_COLUMNS };
}

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
        if (isGraduateCandidateRecord(record) && !isGraduateSummaryRecord(record)) {
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
