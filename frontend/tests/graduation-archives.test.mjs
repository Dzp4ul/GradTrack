import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeGraduationYear, normalizeGraduationYears } from '../src/utils/graduationYears.ts';

assert.equal(normalizeGraduationYear(' 2027 '), '2027');
assert.equal(normalizeGraduationYear('2027x'), null);
assert.equal(normalizeGraduationYear(2100), null);
assert.deepEqual(
  normalizeGraduationYears([2023, '2027', 2026, '2027', null, '', 'invalid']),
  ['2027', '2026', '2023'],
);

const registrar = await readFile(new URL('../src/pages/admin/Graduates.tsx', import.meta.url), 'utf8');
assert.match(registrar, />Year Graduated<\/th>/);
assert.match(registrar, /archiveView === 'archived' && <th[^>]*>Actions<\/th>/);
assert.doesNotMatch(registrar, /Edit2|openEdit|handleArchive\(g/);
assert.match(registrar, /archiveView === 'archived' && <td[^>]*>[\s\S]*handlePermanentDelete\(g\)/);

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
