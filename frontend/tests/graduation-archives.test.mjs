import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeGraduationYear, normalizeGraduationYears } from '../src/utils/graduationYears.ts';
import {
  extractOfficialListGraduationYear,
  resolveImportedGraduationYear,
} from '../src/utils/graduateImport.ts';

assert.equal(normalizeGraduationYear(' 2027 '), '2027');
assert.equal(normalizeGraduationYear('2027x'), null);
assert.equal(normalizeGraduationYear(2100), null);
assert.deepEqual(
  normalizeGraduationYears([2023, '2027', 2026, '2027', null, '', 'invalid']),
  ['2027', '2026', '2023'],
);

const official2027Rows = [
  ['NORZAGARAY COLLEGE'],
  ['OFFICE OF THE REGISTRAR'],
  ['Official List of Graduates Year 2027'],
  ['', 'Student Number', 'Name', 'Email Add', 'Contact Number'],
  [1, '2019-0093', 'Medina, Gleiza B.', 'graduate@example.invalid', '09123456789'],
];
assert.equal(extractOfficialListGraduationYear(official2027Rows.slice(0, 3)), '2027');
assert.equal(
  resolveImportedGraduationYear('2027', '', '2023'),
  '2027',
  'the official-list heading overrides the currently selected Registrar year',
);
assert.equal(
  resolveImportedGraduationYear('2027', '2023', ''),
  '2027',
  'the official-list heading is authoritative for every imported row',
);
assert.equal(
  extractOfficialListGraduationYear([['Student Number'], ['2019-0093']]),
  null,
  'a student-number year is never treated as the graduation year',
);

const registrar = await readFile(new URL('../src/pages/admin/Graduates.tsx', import.meta.url), 'utf8');
assert.match(registrar, />Year Graduated<\/th>/);
assert.match(registrar, /archiveView === 'archived' && <th[^>]*>Actions<\/th>/);
assert.doesNotMatch(registrar, /Edit2|openEdit|handleArchive\(g/);
assert.match(registrar, /archiveView === 'archived' && <td[^>]*>[\s\S]*handlePermanentDelete\(g\)/);
assert.match(registrar, /handlePermanentDeleteSelected/);
assert.match(registrar, /action: 'permanent_delete'/);
assert.match(registrar, /Delete Permanently/);
assert.match(registrar, /aria-label="Filter graduates by department"/);
assert.match(registrar, /aria-label="Filter graduates by graduation year"/);
assert.match(registrar, /res\.program_options/);
assert.doesNotMatch(registrar, /PROGRAM_OPTIONS/);

const adminLayout = await readFile(new URL('../src/pages/admin/AdminLayout.tsx', import.meta.url), 'utf8');
const registrarNavigation = adminLayout.match(/const registrarNavItems:[\s\S]*?= \[([\s\S]*?)\];/)?.[1] ?? '';
assert.match(registrarNavigation, /Manage Graduates/);
assert.doesNotMatch(registrarNavigation, /Dashboard/);

const forum = await readFile(new URL('../src/pages/GraduatePortal.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(forum, /<option value="202[1-9]">/);
assert.match(forum, /normalizeGraduationYears\(forumPosts\.map\(\(post\) => post\.author_year_graduated\)\)/);
assert.match(forum, /post\.author_program_code === programFilter/);
assert.match(forum, /post\.author_year_graduated \?\? ''\) === yearFilter/);

for (const relativePath of [
  '../src/pages/admin/Graduates.tsx',
  '../src/pages/admin/Surveys.tsx',
  '../src/pages/admin/AlumniRegisteredList.tsx',
]) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  assert.match(source, /Permanently Delete/);
  assert.match(source, /destructive: true/);
}

const messageBox = await readFile(new URL('../src/components/MessageBox.tsx', import.meta.url), 'utf8');
assert.match(messageBox, /onClick=\{onClose\}[\s\S]*\{cancelText\}/);
assert.match(messageBox, /const handleConfirm = \(\) => \{[\s\S]*onConfirm\?\.\(\)/);
assert.match(messageBox, /destructive[\s\S]*bg-red-600/);

console.log('All graduation-year and archive UI tests passed.');
