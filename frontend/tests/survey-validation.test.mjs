import assert from 'node:assert/strict';
import {
  buildOtherSurveyAnswer,
  getOtherSurveyAnswerText,
  sanitizeSurveyMobileNumberInput,
  validateSurveyQuestionAnswer,
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

assert.equal(
  sanitizeSurveyMobileNumberInput('09123abc456-789'),
  '09123456789',
  'pasted mobile input keeps only the first 11 digits',
);
assert.equal(sanitizeSurveyMobileNumberInput('091234567890'), '09123456789', 'a 12th digit is discarded');
assert.equal(sanitizeSurveyMobileNumberInput('09123abc789'), '09123789', 'letters cannot remain in mobile input');
assert.equal(validateSurveyText('09123456789', 'MOBILE', { required: true }).isValid, true);
for (const invalidMobile of ['9123456789', '08123456789', '0912345678', '091234567890', '09123abc789']) {
  assert.equal(
    validateSurveyText(invalidMobile, 'MOBILE', { required: true }).isValid,
    false,
    `${invalidMobile} is not a valid survey mobile number`,
  );
}
assert.equal(
  validateSurveyText('+63 917 123 4567', 'PHONE', { required: true }).isValid,
  true,
  'the separate telephone/contact field retains its existing format support',
);

const editedChoiceQuestion = {
  id: 100,
  question_text: 'Is this your first job after college?',
  question_type: 'multiple_choice',
  options: ['Yes', 'No (please proceed to Question 38 and 39)'],
  option_definitions: [
    { id: 1, key: 'yes-key', value: 'Yes', label: 'Yes' },
    { id: 2, key: 'no-key', value: 'No', label: 'No (please proceed to Question 38 and 39)' },
  ],
  is_required: 1,
};
assert.equal(validateSurveyQuestionAnswer(editedChoiceQuestion, 'Yes').isValid, true);
assert.deepEqual(
  validateSurveyQuestionAnswer(editedChoiceQuestion, 'No'),
  { isValid: true, value: 'No' },
  'the stable value remains valid after its display label changes',
);
assert.deepEqual(
  validateSurveyQuestionAnswer(editedChoiceQuestion, 'No (please proceed to Question 38 and 39)'),
  { isValid: true, value: 'No' },
  'the current display label is normalized to the stable value',
);
assert.equal(validateSurveyQuestionAnswer(editedChoiceQuestion, 'Maybe').isValid, false);

console.log('All frontend survey validation tests passed.');
