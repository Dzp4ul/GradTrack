export type SurveyTextFieldType =
  | 'PERSON_NAME'
  | 'OCCUPATION'
  | 'PROGRAM_NAME'
  | 'SCHOOL_NAME'
  | 'COMPANY_NAME'
  | 'ADDRESS'
  | 'DURATION'
  | 'SHORT_TEXT'
  | 'LONG_TEXT'
  | 'NUMERIC'
  | 'EMAIL'
  | 'PHONE';

export type SurveyValidationAnswer = string | number | string[] | null | undefined;

export interface SurveyValidationQuestion {
  id?: number;
  question_text: string;
  question_type: string;
  options: string[] | null;
  is_required: number;
}

export interface SurveyQuestionValidationResult {
  isValid: boolean;
  value: SurveyValidationAnswer;
  error?: string;
  code?: string;
}

export interface SurveyResponseValidationResult {
  isValid: boolean;
  responses: Record<number, SurveyValidationAnswer>;
  errors: Record<number, string>;
  firstInvalidQuestionId?: number;
}

const PLACEHOLDER_ANSWERS = new Set([
  'test',
  'testing',
  'sample',
  'asdf',
  'qwerty',
  'n a',
  'na',
  'none',
]);

const COMMON_PHRASES: Partial<Record<SurveyTextFieldType, string[]>> = {
  OCCUPATION: [
    'Software Engineer',
    'Web Developer',
    'Civil Engineer',
    'Call Center Agent',
    'IT Support Specialist',
    'Administrative Assistant',
    'Computer Programmer',
    'Data Analyst',
    'Grade School Teacher',
  ],
  PROGRAM_NAME: [
    'Master of Information Technology',
    'Master of Science in Information Technology',
    'Master of Science in Computer Science',
    'Master of Arts in Education',
    'Master of Science in Hospitality Management',
  ],
};

const FIELD_MAX_LENGTH: Record<SurveyTextFieldType, number> = {
  PERSON_NAME: 120,
  OCCUPATION: 160,
  PROGRAM_NAME: 200,
  SCHOOL_NAME: 200,
  COMPANY_NAME: 200,
  ADDRESS: 250,
  DURATION: 80,
  SHORT_TEXT: 250,
  LONG_TEXT: 1200,
  NUMERIC: 20,
  EMAIL: 254,
  PHONE: 30,
};

const normalizeForComparison = (value: string) =>
  value
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const stripUnsafeControlCharacters = (value: string): string =>
  value
    .replace(/\p{Cc}/gu, (character) => (/\s/u.test(character) ? character : ''))
    .replace(/[\u200B-\u200D\uFEFF]/g, '');

export const normalizeSurveyText = (value: unknown): string => {
  const text = stripUnsafeControlCharacters(String(value ?? '').normalize('NFC'))
    .replace(/<[^>]*>/g, '');

  return text.replace(/\s+/gu, ' ').trim();
};

// Drafts intentionally retain normal leading, trailing, and repeated spaces while typing.
export const sanitizeSurveyDraftText = (value: unknown): string =>
  stripUnsafeControlCharacters(String(value ?? '').normalize('NFC'))
    .replace(/<[^>]*>/g, '')
    .slice(0, 2000);

export const isOtherSurveyOption = (option: string): boolean => {
  const normalized = normalizeForComparison(option);
  return normalized === 'other' || normalized === 'others';
};

export const getOtherSurveyOptionLabel = (option: string): string =>
  option.replace(/\s*:+\s*$/, '').trim() || option.trim();

export const isOtherSurveyAnswer = (value: string, option: string): boolean => {
  const trimmedValue = value.trim();
  const label = getOtherSurveyOptionLabel(option);
  const normalizedValue = normalizeForComparison(trimmedValue);
  const normalizedLabel = normalizeForComparison(label);

  return normalizedValue === normalizedLabel
    || trimmedValue.toLocaleLowerCase().startsWith(`${label.toLocaleLowerCase()}:`)
    || (isOtherSurveyOption(option) && /^(other|others)\s*:/i.test(trimmedValue));
};

// This builder is used by controlled inputs, so it must never trim the in-progress text.
export const buildOtherSurveyAnswer = (option: string, text: string): string =>
  `${getOtherSurveyOptionLabel(option)}: ${text}`;

export const getOtherSurveyAnswerText = (value: string, option: string): string => {
  const label = getOtherSurveyOptionLabel(option);
  const lowerValue = value.toLocaleLowerCase();
  const prefix = `${label.toLocaleLowerCase()}:`;

  if (lowerValue.startsWith(prefix)) {
    const detailWithSeparator = value.slice(prefix.length);
    return detailWithSeparator.startsWith(' ')
      ? detailWithSeparator.slice(1)
      : detailWithSeparator;
  }

  if (normalizeForComparison(value) === normalizeForComparison(label)) {
    return '';
  }

  if (isOtherSurveyOption(option)) {
    const colonIndex = value.indexOf(':');
    if (colonIndex >= 0 && /^(other|others)\s*$/i.test(value.slice(0, colonIndex))) {
      const detailWithSeparator = value.slice(colonIndex + 1);
      return detailWithSeparator.startsWith(' ')
        ? detailWithSeparator.slice(1)
        : detailWithSeparator;
    }
  }

  return '';
};

export const classifySurveyTextField = (
  question: Pick<SurveyValidationQuestion, 'question_text' | 'question_type'>,
): SurveyTextFieldType => {
  const text = normalizeForComparison(question.question_text);

  if (/\b(e mail|email)\b/.test(text)) return 'EMAIL';
  if (/\b(mobile|cellphone|telephone|phone|contact number|contact no)\b/.test(text)) return 'PHONE';
  if (/\b(earned units?|units earned)\b/.test(text)) return 'NUMERIC';
  if (/\b(year graduated|year of graduation|graduation year|yr graduated)\b/.test(text)) return 'NUMERIC';
  if (question.question_type === 'text' && /(^|\s)rating($|\s)/.test(text)) return 'NUMERIC';

  if (
    /\b(first name|middle name|last name|surname|given name|family name|full name)\b/.test(text)
    && !/\b(company|organization|institution|school|college|university|program|examination)\b/.test(text)
  ) {
    return 'PERSON_NAME';
  }

  if (/\b(mobile address|address|region|province|city|municipality|barangay|place of residence)\b/.test(text)) {
    return 'ADDRESS';
  }

  if (/\b(occupation|position|designation|job title|profession)\b/.test(text)) return 'OCCUPATION';
  if (/\b(company|organization|employer|business name)\b/.test(text)) return 'COMPANY_NAME';
  if (/\b(school|college|university|training institution|institution name)\b/.test(text)) return 'SCHOOL_NAME';
  if (/\b(duration|length of training)\b/.test(text)) return 'DURATION';

  if (/\b(reason|what made|other competencies|other skills)\b/.test(text)) return 'SHORT_TEXT';
  if (/\b(suggestion|suggest|improvement|describe|explain|what skills|what competencies|additional skills)\b/.test(text)) {
    return 'LONG_TEXT';
  }

  if (/\b(graduate program|degree program|course title|name of examination|title of training|program name)\b/.test(text)) {
    return 'PROGRAM_NAME';
  }

  return question.question_type === 'text' ? 'SHORT_TEXT' : 'LONG_TEXT';
};

const hasKeyboardRun = (token: string): boolean => {
  const rows = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  return rows.some((row) => {
    const reverse = [...row].reverse().join('');
    for (let index = 0; index <= token.length - 4; index += 1) {
      const fragment = token.slice(index, index + 4);
      if (row.includes(fragment) || reverse.includes(fragment)) return true;
    }
    return false;
  });
};

const isKeyboardFragment = (fragment: string): boolean => {
  if (fragment.length < 3) return false;
  const rows = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  return rows.some((row) => row.includes(fragment) || [...row].reverse().join('').includes(fragment));
};

const hasRepeatedMeaninglessPattern = (letters: string, allowLoosePrefix: boolean): boolean => {
  if (/([\p{L}])\1{4,}/u.test(letters)) return true;
  for (let patternLength = 2; patternLength <= Math.min(6, Math.floor(letters.length / 3)); patternLength += 1) {
    const pattern = letters.slice(0, patternLength);
    let repetitions = 0;
    while (letters.slice(repetitions * patternLength, (repetitions + 1) * patternLength) === pattern) {
      repetitions += 1;
    }
    const coveredLength = repetitions * patternLength;
    if (repetitions >= 3 && letters.length - coveredLength <= 1) return true;
  }

  // Catches a repeated keyboard-like prefix followed by another short random fragment.
  const prefixMatch = allowLoosePrefix ? letters.match(/^([a-z]{2,3})\1([a-z]{1,5})$/i) : null;
  if (prefixMatch && letters.length >= 8 && isKeyboardFragment(prefixMatch[1].toLocaleLowerCase())) return true;

  return false;
};

const looksLikeHighConfidenceGibberish = (value: string, fieldType: SurveyTextFieldType): boolean => {
  const tokens = value.toLocaleLowerCase().match(/[\p{L}\p{M}]+/gu) || [];
  const compactLetters = tokens.join('');
  if (!compactLetters) return false;
  const properNounFriendly = ['PERSON_NAME', 'SCHOOL_NAME', 'COMPANY_NAME', 'ADDRESS'].includes(fieldType);
  if (hasRepeatedMeaninglessPattern(compactLetters, true)) return true;
  if (tokens.some((token) => token.length >= 4 && hasKeyboardRun(token))) return true;

  if (properNounFriendly) return false;

  return tokens.some((token) => {
    if (token.length < 7) return false;
    const consonantRuns = token.match(/[^aeiouyáéíóúàèìòùâêîôûäëïöüñ]+/giu) || [];
    return consonantRuns.some((run) => run.length >= 7);
  });
};

const levenshteinDistance = (left: string, right: string): number => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + substitutionCost,
      );
      diagonal = above;
    }
  }

  return previous[right.length];
};

const getSafeSpellingSuggestion = (value: string, fieldType: SurveyTextFieldType): string | undefined => {
  const candidates = COMMON_PHRASES[fieldType] || [];
  const comparableValue = normalizeForComparison(value);
  if (!comparableValue) return undefined;

  let closest: { phrase: string; distance: number } | undefined;
  candidates.forEach((phrase) => {
    const comparablePhrase = normalizeForComparison(phrase);
    if (comparablePhrase.split(' ').length !== comparableValue.split(' ').length) return;
    const distance = levenshteinDistance(comparableValue, comparablePhrase);
    if (distance > 0 && distance <= 2 && (!closest || distance < closest.distance)) {
      closest = { phrase, distance };
    }
  });

  return closest?.phrase;
};

export const validateSurveyText = (
  value: unknown,
  fieldType: SurveyTextFieldType,
  options: { required?: boolean; min?: number; max?: number } = {},
): SurveyQuestionValidationResult => {
  const normalized = normalizeSurveyText(value);

  if (!normalized) {
    return options.required
      ? { isValid: false, value: normalized, error: 'This field is required.', code: 'required' }
      : { isValid: true, value: normalized };
  }

  if (normalized.length > FIELD_MAX_LENGTH[fieldType]) {
    return { isValid: false, value: normalized, error: 'Please shorten your answer.', code: 'too_long' };
  }

  if (fieldType === 'EMAIL') {
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(normalized);
    return isValidEmail
      ? { isValid: true, value: normalized }
      : { isValid: false, value: normalized, error: 'Please enter a valid email address.', code: 'email' };
  }

  if (fieldType === 'PHONE') {
    const compactPhone = normalized.replace(/[\s().-]/g, '');
    const isValidPhone = /^(?:\+63\d{9,10}|0\d{9,10})$/.test(compactPhone);
    return isValidPhone
      ? { isValid: true, value: normalized }
      : { isValid: false, value: normalized, error: 'Please enter a valid Philippine phone number.', code: 'phone' };
  }

  if (fieldType === 'NUMERIC') {
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
      return { isValid: false, value: normalized, error: 'Please enter a valid number.', code: 'numeric' };
    }

    const numberValue = Number(normalized);
    if (!Number.isFinite(numberValue)
      || (options.min !== undefined && numberValue < options.min)
      || (options.max !== undefined && numberValue > options.max)) {
      return { isValid: false, value: normalized, error: 'Please enter a valid number.', code: 'numeric_range' };
    }

    return { isValid: true, value: normalized };
  }

  const unwantedSymbols = normalized.match(/[^\p{L}\p{M}\p{N}\s.,'’/&()#+-]/gu) || [];
  if (/[^\p{L}\p{M}\p{N}\s.,'’/&()#+-]{3,}/u.test(normalized)
    || unwantedSymbols.length / Math.max(normalized.length, 1) > 0.2) {
    return {
      isValid: false,
      value: normalized,
      error: 'Please remove unnecessary special characters.',
      code: 'symbols',
    };
  }

  if (!/[\p{L}\p{M}]/u.test(normalized)) {
    return {
      isValid: false,
      value: normalized,
      error: 'Please enter a valid answer using words.',
      code: 'words_required',
    };
  }

  if (fieldType === 'PERSON_NAME' && !/^[\p{L}\p{M} .\-'’]+$/u.test(normalized)) {
    return { isValid: false, value: normalized, error: 'Please enter a valid and readable answer.', code: 'name' };
  }

  const comparison = normalizeForComparison(normalized);
  if (PLACEHOLDER_ANSWERS.has(comparison)) {
    return { isValid: false, value: normalized, error: 'Please enter a valid and readable answer.', code: 'placeholder' };
  }

  if (looksLikeHighConfidenceGibberish(normalized, fieldType)) {
    const keyboardInput = (normalized.match(/[\p{L}\p{M}]+/gu) || [])
      .some((token) => token.length >= 4 && hasKeyboardRun(token.toLocaleLowerCase()));
    return {
      isValid: false,
      value: normalized,
      error: keyboardInput
        ? 'Please enter a meaningful answer instead of random characters.'
        : 'Please enter a valid and readable answer.',
      code: keyboardInput ? 'keyboard_input' : 'gibberish',
    };
  }

  const letterCount = (normalized.match(/[\p{L}\p{M}]/gu) || []).length;
  const wordCount = (normalized.match(/[\p{L}\p{M}]+/gu) || []).length;
  if (fieldType === 'LONG_TEXT' && (letterCount < 6 || (wordCount < 2 && letterCount < 8))) {
    return { isValid: false, value: normalized, error: 'Please provide a more complete answer.', code: 'too_short' };
  }

  const suggestion = getSafeSpellingSuggestion(normalized, fieldType);
  if (suggestion) {
    return {
      isValid: false,
      value: normalized,
      error: `Please check the spelling. Did you mean '${suggestion}'?`,
      code: 'spelling',
    };
  }

  return { isValid: true, value: normalized };
};

const numericRangeForQuestion = (question: SurveyValidationQuestion) => {
  const text = normalizeForComparison(question.question_text);
  if (/\bearned units?\b/.test(text)) return { min: 0, max: 300 };
  if (/\b(year graduated|year of graduation|graduation year|yr graduated)\b/.test(text)) {
    return { min: 1900, max: new Date().getFullYear() + 1 };
  }
  if (/\brating\b/.test(text)) return { min: 0, max: 100 };
  return {};
};

const validateOtherDetail = (
  question: SurveyValidationQuestion,
  option: string,
  answer: string,
): SurveyQuestionValidationResult => {
  const detail = getOtherSurveyAnswerText(answer, option);
  const result = validateSurveyText(detail, classifySurveyTextField(question), { required: true });
  if (!result.isValid) {
    return {
      ...result,
      error: result.code === 'required' ? 'Please specify your answer.' : result.error,
    };
  }

  return {
    isValid: true,
    value: `${getOtherSurveyOptionLabel(option)}: ${String(result.value)}`,
  };
};

export const validateSurveyQuestionAnswer = (
  question: SurveyValidationQuestion,
  answer: SurveyValidationAnswer,
): SurveyQuestionValidationResult => {
  const required = Number(question.is_required) === 1;
  const isEmptyArray = Array.isArray(answer) && answer.length === 0;
  const isEmptyScalar = !Array.isArray(answer) && normalizeSurveyText(answer) === '';

  if (isEmptyArray || isEmptyScalar) {
    return required
      ? { isValid: false, value: answer, error: 'This field is required.', code: 'required' }
      : { isValid: true, value: Array.isArray(answer) ? [] : '' };
  }

  if (question.question_type === 'date') {
    const normalized = normalizeSurveyText(answer);
    const dateParts = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const parsedDate = dateParts
      ? new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3])))
      : null;
    const isValidDate = Boolean(
      dateParts
      && parsedDate
      && parsedDate.getUTCFullYear() === Number(dateParts[1])
      && parsedDate.getUTCMonth() === Number(dateParts[2]) - 1
      && parsedDate.getUTCDate() === Number(dateParts[3])
    );
    return isValidDate
      ? { isValid: true, value: normalized }
      : { isValid: false, value: normalized, error: 'Please enter a valid date.', code: 'date' };
  }

  if (question.question_type === 'rating') {
    const numericValue = Number(answer);
    return Number.isInteger(numericValue) && numericValue >= 1 && numericValue <= 5
      ? { isValid: true, value: numericValue }
      : { isValid: false, value: answer, error: 'Please select a valid rating.', code: 'rating' };
  }

  if (['multiple_choice', 'radio', 'checkbox'].includes(question.question_type)) {
    const options = question.options || [];
    const otherOption = options.find(isOtherSurveyOption);
    const submittedValues = Array.isArray(answer) ? answer.map(String) : [String(answer)];
    const normalizedValues: string[] = [];

    for (const submittedValue of submittedValues) {
      if (otherOption && isOtherSurveyAnswer(submittedValue, otherOption)) {
        const otherResult = validateOtherDetail(question, otherOption, submittedValue);
        if (!otherResult.isValid) return otherResult;
        normalizedValues.push(String(otherResult.value));
        continue;
      }

      if (!options.includes(submittedValue)) {
        return { isValid: false, value: answer, error: 'Please select a valid option.', code: 'option' };
      }
      normalizedValues.push(submittedValue);
    }

    return {
      isValid: true,
      value: question.question_type === 'checkbox' ? normalizedValues : normalizedValues[0],
    };
  }

  const fieldType = classifySurveyTextField(question);
  return validateSurveyText(answer, fieldType, {
    required,
    ...numericRangeForQuestion(question),
  });
};

export const validateSurveyResponses = (
  questions: SurveyValidationQuestion[],
  responses: Record<number, SurveyValidationAnswer>,
): SurveyResponseValidationResult => {
  const normalizedResponses = { ...responses };
  const errors: Record<number, string> = {};

  questions.forEach((question) => {
    if (!question.id || question.question_type === 'header') return;
    const result = validateSurveyQuestionAnswer(question, responses[question.id]);
    if (result.isValid) {
      if (result.value === '' || (Array.isArray(result.value) && result.value.length === 0)) {
        delete normalizedResponses[question.id];
      } else {
        normalizedResponses[question.id] = result.value;
      }
      return;
    }

    errors[question.id] = result.error || 'Please enter a valid and readable answer.';
  });

  const firstInvalidQuestionId = questions.find((question) => question.id && errors[question.id])?.id;
  return {
    isValid: Object.keys(errors).length === 0,
    responses: normalizedResponses,
    errors,
    firstInvalidQuestionId,
  };
};
