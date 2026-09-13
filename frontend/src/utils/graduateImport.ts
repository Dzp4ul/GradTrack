import { normalizeGraduationYear } from './graduationYears.ts';

const normalizeCellText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

export function extractOfficialListGraduationYear(rows: unknown[][]): string | null {
  for (const row of rows) {
    const text = row.map(normalizeCellText).filter(Boolean).join(' ').replace(/\s+/g, ' ');
    const match = text.match(
      /\bofficial\s+list\s+of\s+graduates?\b[^0-9]{0,40}\b((?:19|20)\d{2})\b/i,
    );
    const year = normalizeGraduationYear(match?.[1]);
    if (year) return year;
  }

  return null;
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
