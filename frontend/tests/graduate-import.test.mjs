import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { readSpreadsheet } from '../src/lib/spreadsheets.ts';
import {
  extractGraduateImportRows,
  extractOfficialListGraduationYear,
  resolveGraduateImportProgramId,
} from '../src/utils/graduateImport.ts';

const programs = [
  { id: '1', code: 'BSCS', name: 'Bachelor of Science in Computer Science' },
  { id: '2', code: 'BSHM', name: 'Bachelor of Science in Hospitality Management' },
  { id: '3', code: 'BSED', name: 'Bachelor of Secondary Education' },
  { id: '4', code: 'BEED', name: 'Bachelor of Elementary Education' },
];

assert.equal(
  extractOfficialListGraduationYear([['Official List of Student Enrolled for 1st Semester AY 2019-2020']]),
  '2020',
  'the ending academic year is used for the legacy registrar layout',
);
assert.equal(resolveGraduateImportProgramId('BSHRM 4A', programs), '2');
assert.equal(resolveGraduateImportProgramId('Bachelor of Science in Hotel and Restaurant Management', programs), '2');

const legacyWorkbook = {
  sheetNames: ['Sheet1'],
  sheets: {
    Sheet1: [
      ['NORZAGARAY COLLEGE'],
      ['Official List of Student Enrolled for 1st Semester AY 2019-2020'],
      ['Bachelor of Science in Hotel and Restaurant Management'],
      ['', 'Student Number', 'Name of Student', 'Remarks'],
      [1, '2016-0001', 'Hotel, Graduate A.', 'Regular'],
      [],
      ['NORZAGARAY COLLEGE'],
      ['Official List of Student Enrolled for 2nd Semester AY 2019-2020'],
      ['Bachelor of Elementary Education'],
      ['', 'Student Number', 'Name of Student', 'Remarks'],
      [1, '2016-0002', 'Elementary, Graduate B.', 'Regular'],
      [],
      ['NORZAGARAY COLLEGE'],
      ['Official List of Student Enrolled for 2nd Semester AY 2019-2020'],
      ['Bachelor of Science in Computer Science'],
      ['', 'Student Number', 'Name of Student', 'Remarks'],
      [1, '2016-0003', 'Computing, Graduate C.', 'Regular'],
      [],
      ['NORZAGARAY COLLEGE'],
      ['Official List of Student Enrolled for 2nd Semester AY 2019-2020'],
      ['(Fourth Year - 4A)'],
      ['', 'Student Number', 'Name of Student', 'Remarks'],
      [1, '2016-0004', 'Secondary, Graduate D.', 'Regular'],
    ],
  },
};

const legacyImport = extractGraduateImportRows(legacyWorkbook, programs);
assert.equal(legacyImport.rows.length, 4);
assert.deepEqual(legacyImport.rows.map((row) => row.inferredProgramId), ['2', '4', '1', '3']);
assert.deepEqual(legacyImport.rows.map((row) => row.graduationYear), ['2020', '2020', '2020', '2020']);
assert.equal(legacyImport.rows[0].row['Name of Student'], 'Hotel, Graduate A.');

const currentWorkbook = {
  sheetNames: ['BSHRM 4A', 'BEED 4A', 'BSCS 4A', 'BSED 4A'],
  sheets: Object.fromEntries([
    ['BSHRM 4A', '2016-0101'],
    ['BEED 4A', '2016-0102'],
    ['BSCS 4A', '2016-0103'],
    ['BSED 4A', '2016-0104'],
  ].map(([sheetName, studentNumber]) => [sheetName, [
    ['Official List of Graduates Year 2020'],
    [sheetName],
    ['', 'Student Number', 'Name', 'Remarks', 'Email Add', 'Contact Number'],
    [1, studentNumber, `${sheetName}, Graduate`, 'Regular', '', ''],
  ]])),
};

const currentImport = extractGraduateImportRows(currentWorkbook, programs);
assert.equal(currentImport.rows.length, 4);
assert.equal(currentImport.sheetCount, 4);
assert.deepEqual(currentImport.rows.map((row) => row.inferredProgramId), ['2', '4', '1', '3']);

const zip = new JSZip();
zip.file('xl/workbook.xml', '<?xml version="1.0"?><x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><x:sheets><x:sheet name="BSCS 4A" sheetId="1" r:id="rId1" /></x:sheets></x:workbook>');
zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml" /></Relationships>');
zip.file('xl/worksheets/sheet1.xml', '<?xml version="1.0"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData><x:row r="1"><x:c r="A1" t="str"><x:v>Student Number</x:v></x:c><x:c r="B1" t="str"><x:v>Name</x:v></x:c></x:row><x:row r="2"><x:c r="A2" t="str"><x:v>2016-0999</x:v></x:c><x:c r="B2" t="str"><x:v>Example, Graduate</x:v></x:c></x:row></x:sheetData></x:worksheet>');
zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');

const namespacedBytes = await zip.generateAsync({ type: 'uint8array' });
const namespacedFile = new File([namespacedBytes], 'namespaced.xlsx', {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});
const namespacedWorkbook = await readSpreadsheet(namespacedFile);
assert.deepEqual(namespacedWorkbook.sheetNames, ['BSCS 4A']);
assert.equal(namespacedWorkbook.sheets['BSCS 4A'][0][0], 'Student Number');
assert.equal(namespacedWorkbook.sheets['BSCS 4A'][1][1], 'Example, Graduate');

console.log('All graduate import compatibility tests passed.');
