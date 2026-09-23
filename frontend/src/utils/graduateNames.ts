export interface ParsedGraduateName {
  firstName: string;
  middleName: string;
  lastName: string;
  nameExtension: string;
}

const NAME_EXTENSION_ALIASES: Record<string, string> = {
  jr: 'JR.',
  'jr.': 'JR.',
  sr: 'SR.',
  'sr.': 'SR.',
  ii: 'II',
  iii: 'III',
  iv: 'IV',
  v: 'V',
  vi: 'VI',
};

const cleanNameText = (value: unknown): string => String(value ?? '').trim().replace(/\s+/g, ' ');

export const uppercaseGraduateName = (value: unknown): string => cleanNameText(value).toUpperCase();

export const normalizeGraduateNameExtension = (value: unknown): string => {
  const normalized = cleanNameText(value);
  if (!normalized) return '';
  return NAME_EXTENSION_ALIASES[normalized.toLowerCase()] ?? normalized.toUpperCase();
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
    const lastName = uppercaseGraduateName(lastPart);
    const tokens = cleanNameText(givenParts.join(' ')).split(' ').filter(Boolean);
    const nameExtension = popTrailingNameExtension(tokens);
    const trailingMiddleInitial = tokens.length > 1 && isMiddleInitial(tokens[tokens.length - 1]);
    const middleName = uppercaseGraduateName(trailingMiddleInitial ? tokens.pop() ?? '' : '');
    const firstName = uppercaseGraduateName(tokens.join(' '));

    return { firstName, middleName, lastName, nameExtension };
  }

  const tokens = normalized.split(' ').filter(Boolean);
  const nameExtension = popTrailingNameExtension(tokens);

  // A trailing initial identifies a row that follows the Registrar's
  // "Last First-name(s) M." convention but is missing its comma, as in
  // "Medico Kyla Mae J.". Preserve the legacy First-Middle-Last fallback for
  // genuinely unstructured names without that signal.
  if (tokens.length >= 3 && isMiddleInitial(tokens[tokens.length - 1])) {
    const lastName = uppercaseGraduateName(tokens.shift() ?? '');
    const middleName = uppercaseGraduateName(tokens.pop() ?? '');
    return { firstName: uppercaseGraduateName(tokens.join(' ')), middleName, lastName, nameExtension };
  }

  if (tokens.length === 1) {
    return { firstName: uppercaseGraduateName(tokens[0]), middleName: '', lastName: '', nameExtension };
  }

  return {
    firstName: uppercaseGraduateName(tokens[0]),
    middleName: uppercaseGraduateName(tokens.slice(1, -1).join(' ')),
    lastName: uppercaseGraduateName(tokens[tokens.length - 1]),
    nameExtension,
  };
};
