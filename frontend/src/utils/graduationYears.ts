export function normalizeGraduationYear(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const year = String(value).trim();
  return /^(19|20)\d{2}$/.test(year) ? year : null;
}

export function normalizeGraduationYears(values: unknown[]): string[] {
  const years = new Set<string>();
  values.forEach((value) => {
    const year = normalizeGraduationYear(value);
    if (year) years.add(year);
  });

  return Array.from(years).sort((first, second) => Number(second) - Number(first));
}
