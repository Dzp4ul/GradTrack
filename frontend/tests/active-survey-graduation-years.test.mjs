import assert from 'node:assert/strict';
import {
  analyzeGraduationYearOptions,
  isGraduationYearQuestion,
  normalizeGraduationYears,
} from '../src/utils/graduationYears.ts';

assert.deepEqual(
  analyzeGraduationYearOptions([' 2025 ', '2021', '2023']),
  { years: ['2021', '2023', '2025'], errors: [] },
  'explicit years are trimmed and displayed in ascending order',
);

const invalid = analyzeGraduationYearOptions(['2021', ' 2021 ', '202A', '', '2025']);
assert.equal(invalid.years.join(','), '2021,2025');
assert.equal(invalid.errors.length, 2, 'duplicate and malformed years are both rejected');

assert.equal(isGraduationYearQuestion('Q16: Year Graduated'), true);
assert.equal(isGraduationYearQuestion('11. Year of Graduation'), true);
assert.equal(isGraduationYearQuestion('Graduation year'), true);
assert.equal(isGraduationYearQuestion('Year Enrolled'), false);

assert.deepEqual(
  normalizeGraduationYears(['2025', 2021, '2023', '2023', 'invalid'], 'asc'),
  ['2021', '2023', '2025'],
  'year-filter options preserve exact non-contiguous membership',
);
assert.deepEqual(
  normalizeGraduationYears(['2025', '2021', '2023']),
  ['2025', '2023', '2021'],
  'the default remains descending for existing Registrar views',
);

console.log('All active-survey graduation-year frontend tests passed.');
