export function normalizeGraduationYear(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const year = String(value).trim();
  return /^(19|20)\d{2}$/.test(year) ? year : null;
}

export function normalizeGraduationYears(values: unknown[], direction: 'asc' | 'desc' = 'desc'): string[] {
  const years = new Set<string>();
  values.forEach((value) => {
    const year = normalizeGraduationYear(value);
    if (year) years.add(year);
  });

  return Array.from(years).sort((first, second) => (
    direction === 'asc' ? Number(first) - Number(second) : Number(second) - Number(first)
  ));
}

export function normalizeSurveyQuestionLabel(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/^\s*(?:q(?:uestion)?\s*)?\d+\s*[.\-:)]*\s*/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isGraduationYearQuestion(value: unknown): boolean {
  return [
    'year graduated',
    'year of graduation',
    'graduation year',
    'yr graduated',
  ].includes(normalizeSurveyQuestionLabel(value));
}

export function analyzeGraduationYearOptions(values: unknown[]): { years: string[]; errors: string[] } {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const invalid = new Set<string>();

  values.forEach((value) => {
    if (typeof value !== 'string' && typeof value !== 'number') {
      invalid.add('non-text value');
      return;
    }

    const text = String(value).trim();
    if (!text) return;
    const year = normalizeGraduationYear(text);
    if (!year) {
      invalid.add(text);
      return;
    }
    if (seen.has(year)) duplicates.add(year);
    seen.add(year);
  });

  const errors: string[] = [];
  if (invalid.size > 0) {
    errors.push(`Year Graduated accepts valid four-digit years only. Invalid value(s): ${Array.from(invalid).join(', ')}.`);
  }
  if (duplicates.size > 0) {
    errors.push(`Year Graduated contains duplicate year(s): ${Array.from(duplicates).sort().join(', ')}.`);
  }
  if (seen.size === 0) errors.push('Add at least one Year Graduated option.');

  return { years: Array.from(seen).sort((a, b) => Number(a) - Number(b)), errors };
}
