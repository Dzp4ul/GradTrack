export interface ParsedGraduateName {
  firstName: string;
  middleName: string;
  lastName: string;
  nameExtension: string;
}

const NAME_EXTENSION_ALIASES: Record<string, string> = {
  jr: 'Jr.',
  'jr.': 'Jr.',
  sr: 'Sr.',
  'sr.': 'Sr.',
  ii: 'II',
  iii: 'III',
  iv: 'IV',
  v: 'V',
  vi: 'VI',
};

const cleanNameText = (value: unknown): string => String(value ?? '').trim().replace(/\s+/g, ' ');

export const normalizeGraduateNameExtension = (value: unknown): string => {
  const normalized = cleanNameText(value);
  if (!normalized) return '';
  return NAME_EXTENSION_ALIASES[normalized.toLowerCase()] ?? normalized;
};

const popTrailingNameExtension = (tokens: string[]): string => {
  if (tokens.length === 0) return '';

  const extension = normalizeGraduateNameExtension(tokens[tokens.length - 1]);
  if (extension && Object.values(NAME_EXTENSION_ALIASES).includes(extension)) {
    tokens.pop();
    return extension;
  }

  return '';
};

// Registrar master lists use one- to three-letter middle initials followed by a
// period (for example U., J., or DG.). Requiring the period avoids treating a
// second given name such as "Mae" as a middle name.
const isMiddleInitial = (value: string): boolean => /^(?:[A-Za-z]{1,3}\.|(?:[A-Za-z]\.){2,3})$/.test(value);

export const parseGraduateName = (fullName: unknown): ParsedGraduateName => {
  const normalized = cleanNameText(fullName);
  if (!normalized) {
    return { firstName: '', middleName: '', lastName: '', nameExtension: '' };
  }

  if (normalized.includes(',')) {
    const [lastPart, ...givenParts] = normalized.split(',');
    const lastName = cleanNameText(lastPart);
    const tokens = cleanNameText(givenParts.join(' ')).split(' ').filter(Boolean);
    const nameExtension = popTrailingNameExtension(tokens);
    const trailingMiddleInitial = tokens.length > 1 && isMiddleInitial(tokens[tokens.length - 1]);
    const middleName = trailingMiddleInitial ? tokens.pop() ?? '' : '';
    const firstName = tokens.join(' ');

    return { firstName, middleName, lastName, nameExtension };
  }

  const tokens = normalized.split(' ').filter(Boolean);
  const nameExtension = popTrailingNameExtension(tokens);

  // A trailing initial identifies a row that follows the Registrar's
  // "Last First-name(s) M." convention but is missing its comma, as in
  // "Medico Kyla Mae J.". Preserve the legacy First-Middle-Last fallback for
  // genuinely unstructured names without that signal.
  if (tokens.length >= 3 && isMiddleInitial(tokens[tokens.length - 1])) {
    const lastName = tokens.shift() ?? '';
    const middleName = tokens.pop() ?? '';
    return { firstName: tokens.join(' '), middleName, lastName, nameExtension };
  }

  if (tokens.length === 1) {
    return { firstName: tokens[0], middleName: '', lastName: '', nameExtension };
  }

  return {
    firstName: tokens[0],
    middleName: tokens.slice(1, -1).join(' '),
    lastName: tokens[tokens.length - 1],
    nameExtension,
  };
};
