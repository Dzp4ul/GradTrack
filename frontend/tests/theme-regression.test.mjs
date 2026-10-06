import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const projectRoot = path.resolve(root, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

const css = read('frontend/src/index.css');
const tailwind = read('frontend/tailwind.config.js');
const themeSource = read('frontend/src/contexts/theme.ts');
const reports = read('frontend/src/pages/admin/Reports.tsx');
const surveys = read('frontend/src/pages/admin/Surveys.tsx');
const notifications = read('frontend/src/components/NotificationBell.tsx');
const surveyAnalytics = read('frontend/src/pages/admin/SurveyAnalytics.tsx');
const analyticsApi = read('backend/api/config/survey_response_analytics.php');
const surveyTemplatesApi = read('backend/api/surveys/templates.php');

assert.match(tailwind, /darkMode:\s*'class'/, 'Tailwind dark mode remains class-driven');
for (const token of [
  '--background', '--surface', '--surface-alt', '--surface-muted', '--input',
  '--text-primary', '--text-secondary', '--text-muted', '--border', '--border-strong',
  '--chart-axis', '--chart-grid', '--chart-tooltip', '--disabled-text',
]) {
  assert.ok(css.includes(token), `shared theme token ${token} is defined`);
}

assert.doesNotMatch(themeSource, /useLightOnlyTheme/, 'no route can force the application back to light mode');
assert.match(css, /recharts-cartesian-axis-tick-value[\s\S]*--chart-axis/, 'chart ticks use the dark-mode chart token');
assert.match(css, /recharts-cartesian-grid line[\s\S]*--chart-grid/, 'chart grid lines use the dark-mode chart token');
assert.match(css, /recharts-default-tooltip[\s\S]*--chart-tooltip/, 'chart tooltips use the dark-mode chart token');
assert.match(css, /input::placeholder[\s\S]*--text-muted/, 'dark placeholders use a readable shared token');
assert.match(css, /input:disabled[\s\S]*--disabled-text/, 'disabled form controls use a readable shared token');

assert.match(reports, /ai-descriptive-heading[\s\S]*bg-surface-alt/, 'descriptive analytics header uses semantic surfaces');
assert.match(reports, /odd:bg-surface even:bg-surface-alt/, 'inferential table rows use semantic surfaces');
assert.match(reports, /View technical statistical details[\s\S]*AIStatisticalInterpretation/, 'technical and interpretation panels remain present');
assert.match(surveys, /survey-editor-modal[\s\S]*bg-surface/, 'survey editor modal uses the shared surface hierarchy');
assert.match(surveys, /Preview Questions[\s\S]*bg-surface-alt[\s\S]*bg-surface/, 'survey preview uses nested semantic surfaces');
assert.doesNotMatch(notifications, /dark:bg-amber-950\/20/, 'unread notifications do not use the muddy brown treatment');
assert.match(notifications, /dark:bg-blue-950\/35/, 'unread notifications use a clear theme-aligned dark state');

const productionAlignmentSources = [surveyAnalytics, analyticsApi, surveyTemplatesApi].join('\n');
assert.doesNotMatch(
  productionAlignmentSources,
  /partially[ _-]?aligned|partially related/i,
  'active survey analytics and templates expose only the supported binary alignment categories',
);
assert.match(surveyTemplatesApi, /'options'\s*=>\s*\['Yes',\s*'No'\]/, 'backend survey template uses Yes/No alignment choices');

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
  return channels.reduce((sum, channel, index) => {
    const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

for (const [label, foreground, background] of [
  ['light primary', '#0f172a', '#ffffff'],
  ['light secondary', '#475569', '#ffffff'],
  ['light muted/placeholder', '#64748b', '#ffffff'],
  ['dark primary', '#f8fafc', '#1e293b'],
  ['dark secondary', '#cbd5e1', '#1e293b'],
  ['dark muted/placeholder', '#94a3b8', '#1e293b'],
  ['dark disabled', '#a8b4c7', '#334155'],
]) {
  assert.ok(contrast(foreground, background) >= 4.5, `${label} text meets WCAG AA contrast`);
}

console.log('All shared theme, high-risk component, chart, contrast, and alignment-category regression checks passed.');
