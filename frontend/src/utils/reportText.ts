export interface NormalizeReportTextOptions {
  peso?: 'preserve' | 'php';
}

const MOJIBAKE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\u00e2\u201a\u00b1|\u00e2\u00b1|\u00c3\u00a2\u20ac\u0161\u00c2\u00b1/gi, '\u20b1'],
  [/\u00e2\u20ac\u201c|\u00e2\u20ac\u201d|\u00c3\u00a2\u00e2\u201a\u00ac\u201c|\u00c3\u00a2\u00e2\u201a\u00ac\u201d/gi, '-'],
  [/\u00e2\u20ac\u02dc|\u00e2\u20ac\u2122|\u00e2\u20ac\u00b2/gi, "'"],
  [/\u00c2(?=[\s\u00a0\u20b1])/g, ''],
];

const hasLetterSpacedChunk = (value: string): boolean => (
  /(?:^|\s)(?:[\p{L}\p{N}]\s+){4,}[\p{L}\p{N}](?=\s|[.,;:!?]|$)/u.test(value)
);

const isDisallowedControlCharacter = (character: string): boolean => {
  const code = character.codePointAt(0) ?? 0;
  return (code >= 0 && code <= 8)
    || code === 11
    || code === 12
    || (code >= 14 && code <= 31)
    || (code >= 127 && code <= 159);
};

const removeControlCharacters = (value: string): string => (
  Array.from(value).filter((character) => !isDisallowedControlCharacter(character)).join('')
);

const repairLetterSpacedWords = (value: string): string => (
  value
    .split(/( {2,}|\t+)/)
    .map((chunk) => chunk.replace(
      /(?:\b[\p{L}\p{N}]\s+){2,}[\p{L}\p{N}]\b/gu,
      (spacedWord) => spacedWord.replace(/\s+/g, ''),
    ))
    .join(' ')
);

/**
 * Normalizes externally generated report prose before it reaches a PDF or DOCX
 * writer. It intentionally changes typography only, never counts or wording.
 */
export const normalizeReportText = (
  value: unknown,
  options: NormalizeReportTextOptions = {},
): string => {
  let text = String(value ?? '').normalize('NFC');

  MOJIBAKE_REPLACEMENTS.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });

  text = removeControlCharacters(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, '')
    .replace(/([\p{L}\p{N}])\s*\uFFFD\s*(?=[\p{L}\p{N}])/gu, '$1-')
    .replace(/\uFFFD/g, '')
    .replace(/[\u00AD\u2010-\u2015\u2212]/g, '-')
    // PDF built-in fonts cannot safely encode narrow/typographic spaces.
    // U+202F is especially common in AI-generated percentages and causes
    // jsPDF to emit the entire wrapped line as incompatible UTF-16 bytes.
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .split('\n')
    .map((line) => repairLetterSpacedWords(line)
      .replace(/[ \t]+/g, ' ')
      .replace(/\s+%/g, '%')
      .trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (options.peso === 'php') {
    text = text.replace(/\u20b1\s*/g, 'PHP ');
  }

  return text;
};

export const hasBrokenReportText = (value: unknown): boolean => {
  const text = String(value ?? '');
  return Array.from(text).some(isDisallowedControlCharacter)
    || /\uFFFD|[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u.test(text)
    || /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/u.test(text)
    || hasLetterSpacedChunk(text);
};

export const normalizeReportParagraphs = (
  value: unknown,
  options: NormalizeReportTextOptions = {},
): string[] => normalizeReportText(value, options)
  .split(/\n{2,}/)
  .map((paragraph) => paragraph.replace(/\n+/g, ' ').trim())
  .filter(Boolean);
