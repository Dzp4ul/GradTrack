const fs = require('fs');
const path = require('path');
const { jsPDF } = require('../frontend/node_modules/jspdf');

const outputPath = path.resolve(__dirname, '../docs/GradTrack_Inferential_Analytics_Thesis_Defense_Reviewer.pdf');
const regularFontPath = 'C:\\Windows\\Fonts\\arial.ttf';
const boldFontPath = 'C:\\Windows\\Fonts\\arialbd.ttf';

const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
doc.addFileToVFS('Arial.ttf', fs.readFileSync(regularFontPath).toString('base64'));
doc.addFont('Arial.ttf', 'Arial', 'normal');
doc.addFileToVFS('ArialBold.ttf', fs.readFileSync(boldFontPath).toString('base64'));
doc.addFont('ArialBold.ttf', 'Arial', 'bold');
doc.setFont('Arial', 'normal');
doc.setProperties({
  title: 'GradTrack Inferential Analytics Thesis Defense Reviewer',
  subject: 'Question-and-answer reviewer for the GradTrack thesis defense',
  author: 'GradTrack',
  creator: 'GradTrack PDF Generator',
  keywords: 'GradTrack, thesis defense, inferential analytics, chi-square, Cramer V',
});

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_X = 17;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN_X * 2);
const CONTENT_TOP = 22;
const CONTENT_BOTTOM = 279;
const COLORS = {
  navy: [27, 42, 74],
  blue: [37, 84, 218],
  paleBlue: [239, 246, 255],
  green: [22, 163, 74],
  paleGreen: [236, 253, 245],
  amber: [217, 119, 6],
  paleAmber: [255, 251, 235],
  purple: [124, 58, 237],
  palePurple: [245, 243, 255],
  text: [31, 41, 55],
  muted: [75, 85, 99],
  line: [218, 223, 231],
  white: [255, 255, 255],
};

let y = CONTENT_TOP;
let questionNumber = 0;
let currentSection = '';

const setText = (size = 10, style = 'normal', color = COLORS.text) => {
  doc.setFont('Arial', style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
};

const drawContentHeader = () => {
  doc.setFillColor(...COLORS.navy);
  doc.rect(0, 0, PAGE_WIDTH, 12, 'F');
  setText(8.5, 'bold', COLORS.white);
  doc.text('GRADTRACK  |  INFERENTIAL ANALYTICS THESIS DEFENSE REVIEWER', MARGIN_X, 7.7);
  y = CONTENT_TOP;
  if (currentSection) {
    setText(7.5, 'normal', COLORS.muted);
    doc.text(currentSection.toUpperCase(), MARGIN_X, 17.4);
  }
};

const newPage = () => {
  doc.addPage();
  drawContentHeader();
};

const ensureSpace = (height) => {
  if (y + height > CONTENT_BOTTOM) newPage();
};

const addWrappedText = (text, options = {}) => {
  const {
    x = MARGIN_X,
    width = CONTENT_WIDTH,
    size = 9.5,
    style = 'normal',
    color = COLORS.text,
    lineHeight = 4.8,
    gapAfter = 2.5,
  } = options;
  setText(size, style, color);
  const lines = doc.splitTextToSize(text, width);
  for (const line of lines) {
    ensureSpace(lineHeight + gapAfter);
    doc.text(line, x, y);
    y += lineHeight;
  }
  y += gapAfter;
};

const addBullet = (text) => {
  const bulletX = MARGIN_X + 2;
  const textX = MARGIN_X + 8;
  const width = CONTENT_WIDTH - 10;
  setText(9.2, 'normal', COLORS.text);
  const lines = doc.splitTextToSize(text, width);
  ensureSpace((lines.length * 4.6) + 2);
  doc.setFillColor(...COLORS.blue);
  doc.circle(bulletX, y - 1.2, 0.8, 'F');
  lines.forEach((line, index) => {
    doc.text(line, textX, y);
    y += 4.6;
    if (index < lines.length - 1 && y > CONTENT_BOTTOM) newPage();
  });
  y += 1.2;
};

const addSection = (title, subtitle = '') => {
  currentSection = title;
  ensureSpace(subtitle ? 23 : 17);
  y += 2;
  doc.setFillColor(...COLORS.navy);
  doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, subtitle ? 18 : 12, 2, 2, 'F');
  setText(13.5, 'bold', COLORS.white);
  doc.text(title, MARGIN_X + 5, y + 7.5);
  if (subtitle) {
    setText(8.3, 'normal', [220, 230, 247]);
    doc.text(subtitle, MARGIN_X + 5, y + 13.2);
  }
  y += subtitle ? 23 : 17;
};

const addCallout = (title, text, tone = 'blue') => {
  const palette = tone === 'green'
    ? { fill: COLORS.paleGreen, accent: COLORS.green }
    : tone === 'amber'
      ? { fill: COLORS.paleAmber, accent: COLORS.amber }
      : tone === 'purple'
        ? { fill: COLORS.palePurple, accent: COLORS.purple }
        : { fill: COLORS.paleBlue, accent: COLORS.blue };
  setText(9.3, 'normal', COLORS.text);
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH - 14);
  const height = 13 + (lines.length * 4.7);
  ensureSpace(height + 4);
  doc.setFillColor(...palette.fill);
  doc.setDrawColor(...palette.accent);
  doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, height, 2, 2, 'FD');
  doc.setFillColor(...palette.accent);
  doc.rect(MARGIN_X, y, 2.5, height, 'F');
  setText(10, 'bold', palette.accent);
  doc.text(title, MARGIN_X + 7, y + 7);
  setText(9.3, 'normal', COLORS.text);
  doc.text(lines, MARGIN_X + 7, y + 13, { lineHeightFactor: 1.28 });
  y += height + 4;
};

const addFormula = (label, formula) => {
  ensureSpace(21);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...COLORS.line);
  doc.roundedRect(MARGIN_X + 8, y, CONTENT_WIDTH - 16, 17, 2, 2, 'FD');
  setText(8.5, 'bold', COLORS.muted);
  doc.text(label, MARGIN_X + 13, y + 6);
  setText(12, 'bold', COLORS.navy);
  doc.text(formula, MARGIN_X + 13, y + 12.5);
  y += 21;
};

const addQuestion = ({ question, answer, bullets = [], formula = null, note = null }) => {
  questionNumber += 1;
  const questionText = `${questionNumber}. ${question}`;
  setText(10.2, 'bold', COLORS.navy);
  const questionLines = doc.splitTextToSize(questionText, CONTENT_WIDTH - 10);
  const questionHeight = Math.max(10, 4 + (questionLines.length * 5));
  ensureSpace(questionHeight + 15);
  doc.setFillColor(...COLORS.paleBlue);
  doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, questionHeight, 1.7, 1.7, 'F');
  doc.setFillColor(...COLORS.blue);
  doc.rect(MARGIN_X, y, 2.2, questionHeight, 'F');
  setText(10.2, 'bold', COLORS.navy);
  doc.text(questionLines, MARGIN_X + 6, y + 6.2, { lineHeightFactor: 1.18 });
  y += questionHeight + 3;
  const paragraphs = Array.isArray(answer) ? answer : [answer];
  paragraphs.forEach((paragraph) => addWrappedText(paragraph));
  bullets.forEach(addBullet);
  if (formula) addFormula(formula.label, formula.value);
  if (note) addCallout(note.title, note.text, note.tone || 'amber');
  y += 2;
};

// Title page
doc.setFillColor(...COLORS.navy);
doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');
doc.setFillColor(...COLORS.blue);
doc.circle(174, 34, 42, 'F');
doc.setFillColor(...COLORS.purple);
doc.circle(193, 79, 25, 'F');
doc.setFillColor(...COLORS.green);
doc.circle(21, 265, 34, 'F');
setText(12, 'bold', [173, 202, 255]);
doc.text('GRADTRACK', MARGIN_X, 34);
setText(29, 'bold', COLORS.white);
doc.text('Inferential Analytics', MARGIN_X, 58);
doc.text('Thesis Defense Reviewer', MARGIN_X, 71);
doc.setDrawColor(101, 146, 255);
doc.setLineWidth(1.2);
doc.line(MARGIN_X, 83, 125, 83);
setText(12, 'normal', [225, 231, 241]);
doc.text('Question-and-answer preparation guide', MARGIN_X, 94);
doc.text('for panel defense and system demonstration', MARGIN_X, 102);

const titleChips = [
  'Pearson\'s Chi-Square Test of Independence',
  'Cramér\'s V Effect Size',
  'Plain-language result interpretation',
];
let chipY = 129;
titleChips.forEach((chip) => {
  doc.setFillColor(42, 59, 94);
  doc.setDrawColor(93, 123, 183);
  doc.roundedRect(MARGIN_X, chipY, 118, 13, 3, 3, 'FD');
  setText(9.5, 'bold', COLORS.white);
  doc.text(chip, MARGIN_X + 6, chipY + 8.3);
  chipY += 18;
});

setText(9, 'normal', [203, 213, 225]);
doc.text('Prepared for the GradTrack thesis defense', MARGIN_X, 238);
doc.text('Use this reviewer to practice concise, technically accurate answers.', MARGIN_X, 245);
setText(8, 'normal', [148, 163, 184]);
doc.text('Tip: explain the conclusion first, then provide the statistical evidence.', MARGIN_X, 277);

newPage();

addSection('Essential Defense Answer', 'Memorize this explanation before studying the detailed questions.');
addCallout(
  '30-second answer',
  'GradTrack uses Pearson\'s Chi-Square Test of Independence to determine whether two categorical graduate variables are statistically associated. The system uses a 0.05 significance level, while Cramér\'s V measures how large the difference is. It also checks expected-frequency requirements, excludes missing or non-applicable responses, and presents both plain-language and technical results. The analysis identifies association, not causation.',
  'green',
);
addCallout(
  'If the panel asks, “What algorithm did you use?”',
  'The inferential statistical method is Pearson\'s Chi-Square Test of Independence. Cramér\'s V is the accompanying effect-size calculation. They are statistical methods, not artificial intelligence or machine-learning algorithms.',
  'purple',
);

addSection('Foundation Questions', 'Purpose, method selection, variables, and hypotheses');
addQuestion({
  question: 'What is the inferential analytics feature of GradTrack?',
  answer: 'It determines whether two categorical graduate variables have a statistically significant association. It goes beyond describing counts by evaluating whether differences between categories are likely to be more than normal random variation.',
});
addQuestion({
  question: 'What statistical method did you use?',
  answer: 'I used Pearson\'s Chi-Square Test of Independence. It tests whether two categorical variables are independent or statistically associated.',
});
addQuestion({
  question: 'Why did you choose the Chi-Square Test?',
  answer: 'The available Graduate Tracer Study variables are categorical and are represented by frequency counts. The Chi-Square Test is designed for this type of data.',
  bullets: [
    'Employment Status: employed or unemployed',
    'Work Location: local or overseas',
    'Job/Program Alignment: aligned or not aligned',
    'Course or Program and Year Graduated: categorical groupings',
  ],
});
addQuestion({
  question: 'Why did you not use a t-test or ANOVA?',
  answer: 'A t-test and ANOVA normally compare numerical means. GradTrack compares category counts and percentages, so the Chi-Square Test is more appropriate.',
});
addQuestion({
  question: 'What is Cramér\'s V?',
  answer: 'Cramér\'s V is an effect-size measure. The p-value indicates whether a statistical difference was detected, while Cramér\'s V indicates whether that difference is almost none, small, noticeable, or large.',
});
addQuestion({
  question: 'Are the Chi-Square Test and Cramér\'s V both algorithms?',
  answer: 'The Chi-Square Test is an inferential statistical method. Cramér\'s V is an effect-size calculation. For documentation, they are best listed under “Algorithms and Statistical Methods.”',
});
addQuestion({
  question: 'What variables can the user compare?',
  answer: 'The available variables are Course or Program, Year Graduated, Employment Status, Job/Program Alignment, and Work Location. Availability can depend on whether the selected survey contains the required questions.',
});
addQuestion({
  question: 'What is the null hypothesis?',
  answer: 'The null hypothesis states that the two selected variables are independent and that no statistically significant association exists between them.',
});
addQuestion({
  question: 'What is the alternative hypothesis?',
  answer: 'The alternative hypothesis states that the two selected variables have a statistically significant association.',
});
addQuestion({
  question: 'What significance level does the system use?',
  answer: 'The system uses alpha = 0.05. This is the decision threshold used when comparing the calculated p-value.',
});

addSection('How the Calculation Works', 'Observed counts, expected counts, test statistic, and effect size');
addQuestion({
  question: 'What steps does the system follow?',
  answer: 'The calculation follows a deterministic sequence:',
  bullets: [
    'Read the responses belonging to the selected survey and authorized scope.',
    'Keep only records with valid answers for both selected variables.',
    'Build a contingency table of observed category counts.',
    'Calculate expected frequencies assuming the variables are independent.',
    'Calculate Chi-Square, degrees of freedom, and the p-value.',
    'Compare the p-value with 0.05 and calculate Cramér\'s V.',
    'Check expected-frequency conditions and generate plain-language output.',
  ],
});
addQuestion({
  question: 'What are observed frequencies?',
  answer: 'Observed frequencies are the actual counts found in the survey. For example, if 50 graduates from 2021 are employed, the observed frequency for that cell is 50.',
});
addQuestion({
  question: 'What are expected frequencies?',
  answer: 'Expected frequencies are the counts that would be expected if the selected variables had no association.',
  formula: { label: 'Expected frequency', value: 'E = (Row Total × Column Total) / Grand Total' },
});
addQuestion({
  question: 'How is the Chi-Square value calculated?',
  answer: 'For every table cell, the system measures the squared difference between the observed and expected counts, divides it by the expected count, and adds all cell results.',
  formula: { label: 'Pearson Chi-Square statistic', value: 'χ² = Σ ((Observed − Expected)² / Expected)' },
});
addQuestion({
  question: 'How are the degrees of freedom calculated?',
  answer: 'The degrees of freedom depend on the number of row and column categories in the contingency table.',
  formula: { label: 'Degrees of freedom', value: 'df = (number of rows − 1) × (number of columns − 1)' },
});
addQuestion({
  question: 'How is the p-value obtained?',
  answer: 'The p-value is obtained from the Chi-Square distribution using the calculated Chi-Square value and degrees of freedom. In the implementation, the upper-tail probability is evaluated using the regularized gamma function.',
});
addQuestion({
  question: 'How is Cramér\'s V calculated?',
  answer: 'Cramér\'s V normalizes the Chi-Square statistic according to the sample size and table dimensions.',
  formula: { label: 'Cramér\'s V', value: 'V = √(χ² / (N × min(rows − 1, columns − 1)))' },
});
addQuestion({
  question: 'How does GradTrack describe Cramér\'s V?',
  answer: 'The technical values are translated into client-friendly descriptions:',
  bullets: [
    'Below 0.10: almost no difference',
    '0.10 to below 0.30: small difference',
    '0.30 to below 0.50: noticeable difference',
    '0.50 and above: large difference',
  ],
  note: {
    title: 'Important distinction',
    text: 'These thresholds describe effect size. They do not determine statistical significance; the p-value performs that role.',
    tone: 'amber',
  },
});

addSection('Interpreting the Results', 'How to explain p-values, significance, strength, and causation');
addQuestion({
  question: 'How do you interpret the p-value?',
  answer: 'If p < 0.05, the system rejects the null hypothesis and reports a statistical difference. If p ≥ 0.05, it fails to reject the null hypothesis because the data does not provide enough evidence of a statistical difference.',
});
addQuestion({
  question: 'Why do you say “fail to reject” instead of “accept the null hypothesis”?',
  answer: 'A non-significant result does not prove that no association can ever exist. It only means the current sample does not provide sufficient statistical evidence to confirm one.',
});
addQuestion({
  question: 'What is the difference between statistical significance and practical importance?',
  answer: 'Statistical significance indicates whether the observed pattern is unlikely to be random. Practical importance describes whether the pattern is large enough to matter in real decisions. GradTrack reports the p-value for significance and Cramér\'s V for size.',
});
addQuestion({
  question: 'Can a result be statistically significant but have only a small difference?',
  answer: 'Yes. With a large sample, even a small difference can be detected as statistically significant. That is why both the p-value and Cramér\'s V must be interpreted together.',
});
addQuestion({
  question: 'Does a significant result prove that one variable caused the other?',
  answer: 'No. The Chi-Square Test identifies association, not causation. Other variables or circumstances may explain the observed pattern.',
});
addQuestion({
  question: 'Is a non-significant result a bad result?',
  answer: 'No. It is still a valid finding. It can show that outcomes are stable across categories or that the available data does not demonstrate a reliable difference.',
});
addQuestion({
  question: 'What does “almost no difference” mean in the interface?',
  answer: 'It is the plain-language interpretation of a Cramér\'s V below 0.10. The interface also names the exact categories being compared, such as “Employment-rate difference between graduation years.”',
});

addSection('Explaining GradTrack Results', 'Use these answers for the examples shown in the system');
addQuestion({
  question: 'How do you explain Year Graduated versus Employment Status?',
  answer: 'The employment rates are approximately 76% to 78% in every graduation year. The example produced p = 0.997 and Cramér\'s V = 0.013. Therefore, employment rates are similar across graduation years, with almost no measured difference.',
});
addQuestion({
  question: 'Does p = 0.997 mean that the result is 99.7% correct?',
  answer: 'No. It means that, under the assumption of no association, a difference at least as large as the observed one is very compatible with random variation. It is not an accuracy score or probability that the null hypothesis is true.',
});
addQuestion({
  question: 'Why can Year Graduated and Program produce a significant but weak result?',
  answer: 'The mix of graduates from each program changes across graduation years, so a statistical difference can be detected. However, Cramér\'s V indicates that the overall difference is small. A statistically detectable pattern is not necessarily a large pattern.',
});
addQuestion({
  question: 'How do you explain Program versus Work Location?',
  answer: 'The local and overseas percentages are nearly the same across the programs. Different raw counts mainly reflect different program sizes, so the comparison should focus on percentages rather than bar height alone.',
});
addQuestion({
  question: 'Why can Job/Program Alignment not be compared with Employment Status?',
  answer: 'Job alignment is only recorded for employed graduates. Unemployed graduates have no current job to classify as aligned or not aligned. Because the valid alignment records contain only the employed category, there is no unemployed group for comparison.',
  note: {
    title: 'Best defense wording',
    text: 'This comparison is not applicable. Job alignment is recorded only for employed graduates, so employed and unemployed groups cannot be compared.',
    tone: 'amber',
  },
});
addQuestion({
  question: 'Why are some answers left out?',
  answer: 'A response is excluded when either selected variable is missing or not applicable. Missing values are never converted into invented categories. The interface reports the number of valid and excluded answers transparently.',
});

addSection('Data Quality and Assumptions', 'Conditions that protect the reliability of the Chi-Square approximation');
addQuestion({
  question: 'What assumptions does the Chi-Square Test require?',
  answer: 'The observations should be independent, the variables should be categorical, and the expected frequencies should be sufficiently large for the Chi-Square approximation.',
});
addQuestion({
  question: 'What data-quality warnings does GradTrack check?',
  answer: 'The system warns the user when:',
  bullets: [
    'There are fewer than 20 valid paired responses.',
    'At least one expected frequency is below 1.',
    'More than 20% of expected frequencies are below 5.',
  ],
});
addQuestion({
  question: 'What happens when the expected-frequency checks fail?',
  answer: 'The system displays a caution message and the technical details. The result should be treated as an indication rather than a final conclusion because the Chi-Square approximation may be unreliable.',
});
addQuestion({
  question: 'What happens when one selected variable contains only one category?',
  answer: 'The test cannot be calculated because no comparison is possible. GradTrack displays “Cannot compare” instead of returning an invalid p-value or effect size.',
});
addQuestion({
  question: 'Why are filters disabled when Year Graduated or Program is being tested?',
  answer: 'Filtering the dataset to only one year or one program would remove the category variation required by the test. The filter is disabled to prevent an invalid comparison.',
});

addSection('Implementation and Validation', 'Questions commonly asked by technical panel members');
addQuestion({
  question: 'Is the inferential feature artificial intelligence or machine learning?',
  answer: 'No. It is a deterministic statistical calculation. The same validated input and settings always produce the same output.',
});
addQuestion({
  question: 'Does the feature predict future employment?',
  answer: 'No. It analyzes associations in historical survey responses. Prediction would require a separate predictive model, training data, and model validation.',
});
addQuestion({
  question: 'How does the system keep descriptive and inferential results consistent?',
  answer: 'Both features use the same canonical classification rules for employment status, job alignment, and work location. This prevents the reports from interpreting the same answer differently.',
});
addQuestion({
  question: 'How did you validate the statistical calculations?',
  answer: 'The implementation was tested using a controlled dataset with known observed counts, expected counts, Chi-Square value, degrees of freedom, p-value, and Cramér\'s V. The p-value was independently checked against Excel CHISQ.DIST.RT. Integration tests also verify filtering, survey isolation, missing-data handling, authorization, and API behavior.',
});
addQuestion({
  question: 'Can the analysis be exported?',
  answer: 'Yes. PDF and Excel exports include the selected variables and filters, observed and expected frequencies, Chi-Square statistic, degrees of freedom, p-value, Cramér\'s V, and interpretation.',
});
addQuestion({
  question: 'How is access to the analysis controlled?',
  answer: 'The API applies authenticated role and scope checks. Survey data is limited to the selected survey and the user\'s authorized institutional scope, including department restrictions where applicable.',
});

addSection('Limitations and Future Work', 'Be honest about what the current method can and cannot do');
addQuestion({
  question: 'What are the limitations of this inferential analytics feature?',
  answer: 'The current feature has the following limitations:',
  bullets: [
    'It identifies association but cannot establish causation.',
    'Its reliability depends on accurate and complete survey responses.',
    'Missing or non-applicable answers reduce the usable sample.',
    'Sparse categories can weaken the Chi-Square approximation.',
    'A significant result may still have a small practical effect.',
    'It analyzes categorical variables and does not make predictions.',
  ],
});
addQuestion({
  question: 'What improvements can be added in the future?',
  answer: 'Future versions could add Fisher\'s Exact Test for sparse 2×2 tables, adjusted residuals to identify which cells contribute most to the result, confidence intervals for effect sizes, and regression models for controlling several factors at once.',
});

addSection('Rapid Recall Sheet', 'Short answers to memorize immediately before the defense');
const recallItems = [
  ['Method', 'Pearson\'s Chi-Square Test of Independence'],
  ['Why this method?', 'The selected variables are categorical and represented by counts.'],
  ['Significance level', '0.05'],
  ['Decision rule', 'p < 0.05 means a statistical difference was detected.'],
  ['Effect size', 'Cramér\'s V measures how large the difference is.'],
  ['Null hypothesis', 'The selected variables are independent.'],
  ['Alternative hypothesis', 'The selected variables are associated.'],
  ['Key warning', 'Association does not prove causation.'],
  ['Missing data', 'Exclude records missing either selected variable and report the count.'],
  ['Not AI', 'The result is a deterministic statistical calculation.'],
];
recallItems.forEach(([label, value]) => {
  setText(9.2, 'normal', COLORS.text);
  const valueLines = doc.splitTextToSize(value, 119);
  const rowHeight = Math.max(10, 5 + (valueLines.length * 4.5));
  ensureSpace(rowHeight);
  doc.setDrawColor(...COLORS.line);
  doc.line(MARGIN_X, y + rowHeight, MARGIN_X + CONTENT_WIDTH, y + rowHeight);
  setText(9.2, 'bold', COLORS.navy);
  doc.text(label, MARGIN_X + 2, y + 6);
  setText(9.2, 'normal', COLORS.text);
  doc.text(valueLines, MARGIN_X + 55, y + 6, { lineHeightFactor: 1.2 });
  y += rowHeight;
});
y += 6;
addCallout(
  'Final defense statement',
  'GradTrack uses Pearson\'s Chi-Square Test of Independence to determine whether two categorical graduate variables are statistically associated. It uses a 0.05 significance level and reports Cramér\'s V to show the size of the difference. The system checks expected frequencies, excludes missing or non-applicable responses, and provides both plain-language and technical interpretations. It identifies association but does not claim causation or prediction.',
  'green',
);
addCallout(
  'Presentation technique',
  'When answering the panel: state the plain-language conclusion first, support it with the p-value and Cramér\'s V, and finish by saying that association does not prove causation.',
  'purple',
);

// Add consistent page numbers and footers after all pages exist.
const pageCount = doc.getNumberOfPages();
for (let page = 1; page <= pageCount; page += 1) {
  doc.setPage(page);
  if (page === 1) {
    setText(8, 'normal', [148, 163, 184]);
    doc.text(`Page ${page} of ${pageCount}`, PAGE_WIDTH - MARGIN_X, 288, { align: 'right' });
    continue;
  }
  doc.setDrawColor(...COLORS.line);
  doc.line(MARGIN_X, 284, PAGE_WIDTH - MARGIN_X, 284);
  setText(7.8, 'normal', COLORS.muted);
  doc.text('GradTrack Thesis Defense Reviewer', MARGIN_X, 289);
  doc.text(`Page ${page} of ${pageCount}`, PAGE_WIDTH - MARGIN_X, 289, { align: 'right' });
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, Buffer.from(doc.output('arraybuffer')));
console.log(`Created ${outputPath}`);
console.log(`Pages: ${pageCount}`);
