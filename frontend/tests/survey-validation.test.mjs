import assert from 'node:assert/strict';
import {
  buildOtherSurveyAnswer,
  getOtherSurveyAnswerText,
  validateSurveyText,
} from '../src/utils/surveyValidation.ts';

const otherOption = 'Other:';
for (const expectedText of ['Software Engineer', 'Master of Information Technology']) {
  let storedAnswer = otherOption;
  let typedText = '';
  for (const character of expectedText) {
    typedText += character;
    storedAnswer = buildOtherSurveyAnswer(otherOption, typedText);
    assert.equal(
      getOtherSurveyAnswerText(storedAnswer, otherOption),
      typedText,
      `controlled Other input preserves ${JSON.stringify(typedText)}`,
    );
  }
}

const validValues = [
  ['Master of Information Technology', 'PROGRAM_NAME'],
  ['Software Engineer', 'OCCUPATION'],
  ['Guro sa Elementarya', 'OCCUPATION'],
  ['Self-employed', 'OCCUPATION'],
  ['UI/UX Designer', 'OCCUPATION'],
  ['Norzagaray College', 'SCHOOL_NAME'],
  ['J.P. Construction Services', 'COMPANY_NAME'],
  ["St. Mary's College", 'SCHOOL_NAME'],
  ['Norzagaray', 'ADDRESS'],
];

for (const [value, fieldType] of validValues) {
  assert.equal(validateSurveyText(value, fieldType, { required: true }).isValid, true, `${value} is valid`);
}

const invalidValues = [
  'asdasdweqw',
  'xxxxxsdsda',
  'qwertyuiop',
  'asdfghjkl',
  'zzzzzzzzzz',
  'aaaaaaaaaa',
  'abcabcabcabc',
  'sdsdsdsdsd',
  '@@@###',
  '123123123',
  '!!!@@@123',
  'hahahahahahah',
  '        ',
];

for (const value of invalidValues) {
  assert.equal(validateSurveyText(value, 'SHORT_TEXT', { required: true }).isValid, false, `${value} is invalid`);
}

assert.equal(
  validateSurveyText('   Software     Engineer   ', 'OCCUPATION', { required: true }).value,
  'Software Engineer',
);
assert.equal(validateSurveyText('Self-employed', 'OCCUPATION', { required: true }).value, 'Self-employed');

console.log('All frontend survey validation tests passed.');
