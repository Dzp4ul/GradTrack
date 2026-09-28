import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(resolve(here, '../src/components/reports/AIStatisticalInterpretation.tsx'), 'utf8');
const service = readFileSync(resolve(here, '../src/services/analyticsAiService.ts'), 'utf8');
const reports = readFileSync(resolve(here, '../src/pages/admin/Reports.tsx'), 'utf8');

assert.match(component, /flex-col[^\n]*sm:flex-row/, 'TEST 10: header and actions use a mobile-first layout');
assert.match(component, /min-h-10/, 'TEST 10: mobile refresh control keeps an accessible touch target');
assert.match(component, /Generating statistical interpretation/, 'AI loading is local to the interpretation card');
assert.ok(
  component.indexOf('What This Result Means') < component.indexOf('Statistical basis'),
  'the reader-friendly result meaning is shown before the technical statistical basis',
);
assert.match(component, /interpretation\.practical_interpretation/, 'the prominent explanation uses the reader-friendly interpretation');
assert.match(component, /interpretation\.thesis_interpretation/, 'the verified technical paragraph remains available below it');
assert.doesNotMatch(component, /View full statistical explanation/, 'expanded full statistical explanation is removed');
assert.doesNotMatch(reports, /View Expected Frequencies/, 'expected-frequency table control is removed');
assert.match(service, /responseCache\.get\(context\.fingerprint\)/, 'same-analysis responses use the frontend fingerprint cache');
assert.match(service, /pendingRequests\.get\(context\.fingerprint\)/, 'concurrent rerenders deduplicate the provider request');
assert.doesNotMatch(service, /GROQ_API_KEY|api\.groq\.com/, 'frontend service contains no Groq key or direct provider request');

console.log('PASS: TEST 10 mobile/responsive layout and frontend request controls');
