<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config/graduate_import.php';
require_once __DIR__ . '/../api/config/alumni_registry.php';

function import_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function import_test_expect_error(callable $callback, string $errorType): GradtrackImportException
{
    try {
        $callback();
    } catch (GradtrackImportException $error) {
        import_test_assert($error->getErrorType() === $errorType, "Expected {$errorType}; got {$error->getErrorType()}");
        return $error;
    }
    throw new RuntimeException("Expected {$errorType}, but no import exception was thrown");
}

function import_test_create_xlsx(): string
{
    $base = tempnam(sys_get_temp_dir(), 'gradtrack-import-test-');
    if ($base === false) throw new RuntimeException('Unable to create temporary test file');
    @unlink($base);
    $zipPath = $base . '.zip';
    $xlsxPath = $base . '.xlsx';
    $archive = new PharData($zipPath, 0, null, Phar::ZIP);
    $archive->addFromString('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
    $archive->addFromString('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="BSCS 4A" sheetId="1" r:id="rId1"/></sheets></workbook>');
    $archive->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
    $archive->addFromString('xl/worksheets/sheet1.xml', '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Official List of Graduates Year 2020</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Student Number</t></is></c><c r="B2" t="inlineStr"><is><t>Name</t></is></c><c r="C2" t="inlineStr"><is><t>Email</t></is></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>2016-0999</t></is></c><c r="B3" t="inlineStr"><is><t>Example, Graduate</t></is></c><c r="C3" t="inlineStr"><is><t>graduate@example.test</t></is></c></row></sheetData></worksheet>');
    unset($archive);
    if (!rename($zipPath, $xlsxPath)) throw new RuntimeException('Unable to finalize temporary XLSX fixture');
    return $xlsxPath;
}

$xlsxPath = import_test_create_xlsx();
try {
    $workbook = gradtrack_read_xlsx($xlsxPath);
    import_test_assert($workbook['sheetNames'] === ['BSCS 4A'], 'The backend must read genuine XLSX worksheets');
    import_test_assert($workbook['sheets']['BSCS 4A'][2][0] === '2016-0999', 'The backend must read inline XLSX cells');
} finally {
    @unlink($xlsxPath);
}

$fakeXlsx = tempnam(sys_get_temp_dir(), 'gradtrack-fake-xlsx-');
file_put_contents($fakeXlsx, 'plain text renamed to xlsx');
import_test_expect_error(static fn () => gradtrack_read_xlsx($fakeXlsx), 'INVALID_FILE_TYPE');
@unlink($fakeXlsx);

$corruptedXlsx = tempnam(sys_get_temp_dir(), 'gradtrack-corrupt-xlsx-');
file_put_contents($corruptedXlsx, "PK\x03\x04broken archive");
import_test_expect_error(static fn () => gradtrack_read_xlsx($corruptedXlsx), 'CORRUPTED_FILE');
@unlink($corruptedXlsx);

$db = new PDO('sqlite::memory:');
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('CREATE TABLE programs (id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL)');
$db->exec("INSERT INTO programs (id, code, name) VALUES (1, 'BSCS', 'Bachelor of Science in Computer Science'), (2, 'BSHM', 'Bachelor of Science in Hospitality Management'), (3, 'BSED', 'Bachelor of Secondary Education'), (4, 'BEED', 'Bachelor of Elementary Education')");
$db->exec('CREATE TABLE graduates (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL UNIQUE, first_name TEXT NOT NULL, middle_name TEXT, last_name TEXT NOT NULL, name_extension TEXT, email TEXT UNIQUE, phone TEXT, program_id INTEGER, year_graduated INTEGER NOT NULL, address TEXT)');
$db->exec('CREATE TABLE employment (id INTEGER PRIMARY KEY AUTOINCREMENT, graduate_id INTEGER, company_name TEXT, job_title TEXT, industry TEXT, employment_status TEXT, is_aligned TEXT, date_hired TEXT, monthly_salary TEXT, time_to_employment INTEGER)');
$db->exec('CREATE TABLE registered_alumni (id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, normalized_name TEXT NOT NULL, course_id INTEGER, course_name TEXT NOT NULL, course_code TEXT NOT NULL, batch_year INTEGER NOT NULL, archived_at TEXT, UNIQUE(normalized_name, course_code, batch_year))');

$validGraduateWorkbook = [
    'sheetNames' => ['BSCS 4A'],
    'sheets' => ['BSCS 4A' => [
        ['Official List of Graduates Year 2020'],
        ['Student Number', 'Name', 'Email Add', 'Contact Number'],
        ['2016-0001', 'Graduate, Valid A.', 'valid@example.test', '09123456789'],
    ]],
];
$analysis = gradtrack_graduate_import_analyze($db, $validGraduateWorkbook);
$result = gradtrack_graduate_import_execute($db, $analysis, true);
import_test_assert($result['added'] === 1, 'A valid Registrar workbook must import successfully');
import_test_assert((int) $db->query('SELECT COUNT(*) FROM graduates')->fetchColumn() === 1, 'A valid Registrar workbook must insert one graduate');

$wrongGraduateWorkbook = [
    'sheetNames' => ['Sheet1'],
    'sheets' => ['Sheet1' => [['Employee Number', 'Department'], ['100', 'Sales']]],
];
$formatError = import_test_expect_error(
    static fn () => gradtrack_graduate_import_analyze($db, $wrongGraduateWorkbook),
    'INVALID_EXCEL_FORMAT'
);
import_test_assert(count($formatError->getErrors()) === 2, 'Wrong Registrar headers must report every missing required column');
import_test_assert((int) $db->query('SELECT COUNT(*) FROM graduates')->fetchColumn() === 1, 'Invalid Registrar format must not insert records');

$oneMissingGraduateHeader = [
    'sheetNames' => ['Sheet1'],
    'sheets' => ['Sheet1' => [['Student ID', 'Department'], ['2016-1000', 'BSCS']]],
];
$oneMissingGraduateError = import_test_expect_error(
    static fn () => gradtrack_graduate_import_analyze($db, $oneMissingGraduateHeader),
    'INVALID_EXCEL_FORMAT'
);
import_test_assert($oneMissingGraduateError->getErrors() === ['Missing required column: Name (or First Name and Last Name)'], 'Registrar validation must identify one missing header precisely');

$invalidGraduateWorkbook = [
    'sheetNames' => ['BSCS 4A'],
    'sheets' => ['BSCS 4A' => [
        ['Official List of Graduates Year 2020'],
        ['Student Number', 'Name', 'Email Add'],
        ['2016-0002', 'Graduate, Valid B.', 'not-an-email'],
    ]],
];
import_test_expect_error(
    static fn () => gradtrack_graduate_import_analyze($db, $invalidGraduateWorkbook),
    'INVALID_ROW_DATA'
);
import_test_assert((int) $db->query('SELECT COUNT(*) FROM graduates')->fetchColumn() === 1, 'Invalid Registrar rows must not insert records');

$duplicateGraduateWorkbook = [
    'sheetNames' => ['BSCS 4A'],
    'sheets' => ['BSCS 4A' => [
        ['Official List of Graduates Year 2020'],
        ['Student Number', 'Name'],
        ['2016-0003', 'Graduate, One'],
        ['2016-0003', 'Graduate, Two'],
    ]],
];
import_test_expect_error(
    static fn () => gradtrack_graduate_import_analyze($db, $duplicateGraduateWorkbook),
    'DUPLICATE_DATA'
);
import_test_assert((int) $db->query('SELECT COUNT(*) FROM graduates')->fetchColumn() === 1, 'Duplicate Registrar rows must not insert records');

$existingGraduateWorkbook = [
    'sheetNames' => ['BSCS 4A'],
    'sheets' => ['BSCS 4A' => [
        ['Official List of Graduates Year 2020'],
        ['Student Number', 'Name'],
        ['2016-0001', 'Graduate, Existing'],
        ['2016-0002', 'Graduate, New'],
    ]],
];
$existingAnalysis = gradtrack_graduate_import_analyze($db, $existingGraduateWorkbook);
$existingResult = gradtrack_graduate_import_execute($db, $existingAnalysis, true);
import_test_assert($existingResult['added'] === 1 && $existingResult['skipped'] === 1, 'Existing Registrar records must be skipped without blocking valid new records');
import_test_assert((int) $db->query('SELECT COUNT(*) FROM graduates')->fetchColumn() === 2, 'Existing Registrar records must not be inserted twice');

$db->exec("CREATE TRIGGER fail_test_graduate BEFORE INSERT ON graduates WHEN NEW.student_id = '2016-0099' BEGIN SELECT RAISE(ABORT, 'forced import failure'); END");
$rollbackWorkbook = [
    'sheetNames' => ['BSCS 4A'],
    'sheets' => ['BSCS 4A' => [
        ['Official List of Graduates Year 2020'],
        ['Student Number', 'Name'],
        ['2016-0098', 'Rollback, First'],
        ['2016-0099', 'Rollback, Second'],
    ]],
];
$rollbackAnalysis = gradtrack_graduate_import_analyze($db, $rollbackWorkbook);
$rollbackTriggered = false;
try {
    gradtrack_graduate_import_execute($db, $rollbackAnalysis, true);
} catch (PDOException $error) {
    $rollbackTriggered = true;
}
import_test_assert($rollbackTriggered, 'The rollback test must trigger a database error');
import_test_assert((int) $db->query('SELECT COUNT(*) FROM graduates')->fetchColumn() === 2, 'A fatal Registrar import error must roll back every row in the batch');

$metadataProgramWorkbook = [
    'sheetNames' => ['BECEd 2025 SAMPLE'],
    'sheets' => ['BECEd 2025 SAMPLE' => [
        ['NORZAGARAY COLLEGE'],
        ['Official List of Graduates Year 2025'],
        ['Bachelor of Early Childhood Education (BECEd)'],
        [],
        ['No.', 'Student Number', 'Name', 'Remarks', 'Email Add', 'Contact Number'],
        ['1', '2025-9001', 'Metadata, Graduate', 'Regular', 'metadata.beced@example.test', ''],
    ]],
];
$metadataProgramAnalysis = gradtrack_graduate_import_analyze($db, $metadataProgramWorkbook);
import_test_assert(
    ($metadataProgramAnalysis['records'][0]['program_code'] ?? '') === 'BECED'
    && ($metadataProgramAnalysis['records'][0]['program_name'] ?? '') === 'Bachelor of Early Childhood Education',
    'a new program declared in a Registrar title row is attached to every following graduate row'
);
$metadataProgramResult = gradtrack_graduate_import_execute($db, $metadataProgramAnalysis, true);
import_test_assert($metadataProgramResult['added'] === 1, 'a title-row program imports successfully without a repeated Program column');
import_test_assert((int) $db->query("SELECT COUNT(*) FROM programs WHERE UPPER(TRIM(code)) = 'BECED'")->fetchColumn() === 1, 'the title-row import registers BECED once');

$generatedCodeWorkbook = [
    'sheetNames' => ['Accountancy 2026'],
    'sheets' => ['Accountancy 2026' => [
        ['Official List of Graduates Year 2026'],
        ['Bachelor of Science in Accountancy'],
        ['Student Number', 'Name', 'Email Add'],
        ['2026-9002', 'Accountancy, Graduate', 'accountancy@example.test'],
    ]],
];
$generatedCodeAnalysis = gradtrack_graduate_import_analyze($db, $generatedCodeWorkbook);
import_test_assert(
    ($generatedCodeAnalysis['records'][0]['program_code'] ?? '') === 'BSA',
    'a program title without an explicit code receives a readable generated code'
);
$generatedCodeResult = gradtrack_graduate_import_execute($db, $generatedCodeAnalysis, true);
import_test_assert($generatedCodeResult['added'] === 1, 'a full program name without a code imports successfully');
import_test_assert((int) $db->query("SELECT COUNT(*) FROM programs WHERE code = 'BSA'")->fetchColumn() === 1, 'the generated BSA code is registered once');

$dynamicProgramWorkbook = [
    'sheetNames' => ['New Programs'],
    'sheets' => ['New Programs' => [
        ['Student ID', 'Name', 'Program Code', 'Program Name', 'Year Graduated'],
        ['2026-0001', 'Sample, Graduate', ' BECED ', 'Bachelor of Early Childhood Education', '2026'],
        ['2026-0002', 'Sample, Graduate Two', 'beced', ' Bachelor of Early Childhood Education ', '2026'],
        ['2026-0003', 'Sample, Graduate Three', 'BSIT', 'Bachelor of Science in Information Technology', '2026'],
    ]],
];
$dynamicAnalysis = gradtrack_graduate_import_analyze($db, $dynamicProgramWorkbook);
$dynamicResult = gradtrack_graduate_import_execute($db, $dynamicAnalysis, true);
import_test_assert($dynamicResult['added'] === 3, 'multiple graduates from new programs import successfully');
import_test_assert((int) $db->query("SELECT COUNT(*) FROM programs WHERE UPPER(TRIM(code)) = 'BECED'")->fetchColumn() === 1, 'case and whitespace variants create one BECED master program');
import_test_assert((int) $db->query("SELECT COUNT(*) FROM programs WHERE UPPER(TRIM(code)) = 'BSIT'")->fetchColumn() === 1, 'a second new program is registered once in the same import');
import_test_assert((int) $db->query("SELECT COUNT(DISTINCT program_id) FROM graduates WHERE student_id IN ('2026-0001', '2026-0002')")->fetchColumn() === 1, 'all BECED rows reference the same stable program ID');

$existingProgramWorkbook = [
    'sheetNames' => ['Existing Program'],
    'sheets' => ['Existing Program' => [
        ['Student ID', 'Name', 'Department', 'Year Graduated'],
        ['2026-0004', 'Existing Program, Graduate', ' bsCs ', '2026'],
    ]],
];
$existingProgramResult = gradtrack_graduate_import_execute(
    $db,
    gradtrack_graduate_import_analyze($db, $existingProgramWorkbook),
    true
);
import_test_assert($existingProgramResult['added'] === 1, 'an existing program is resolved case-insensitively from a Department column');
import_test_assert((int) $db->query("SELECT COUNT(*) FROM programs WHERE UPPER(TRIM(code)) = 'BSCS'")->fetchColumn() === 1, 'an existing BSCS import does not create a duplicate program');

$programRollbackWorkbook = [
    'sheetNames' => ['Rollback Program'],
    'sheets' => ['Rollback Program' => [
        ['Student ID', 'Name', 'Program Code', 'Program Name', 'Year Graduated'],
        ['2016-0098', 'Rollback Program, First', 'BSNEW', 'Bachelor of Science in New Studies', '2026'],
        ['2016-0099', 'Rollback Program, Second', 'BSNEW', 'Bachelor of Science in New Studies', '2026'],
    ]],
];
$programRollbackTriggered = false;
try {
    gradtrack_graduate_import_execute(
        $db,
        gradtrack_graduate_import_analyze($db, $programRollbackWorkbook),
        true
    );
} catch (PDOException $error) {
    $programRollbackTriggered = true;
}
import_test_assert($programRollbackTriggered, 'a failed import still rolls back after discovering a new program');
import_test_assert((int) $db->query("SELECT COUNT(*) FROM programs WHERE code = 'BSNEW'")->fetchColumn() === 0, 'program registration rolls back with the failed graduate batch');

$alumniWorkbook = [
    'sheetNames' => ['Registered Alumni'],
    'sheets' => ['Registered Alumni' => [
        [' Name ', 'PROGRAM', 'year graduated'],
        ['Sample Alumni', 'BSCS', '2020'],
    ]],
];
$alumniExtract = gradtrack_alumni_registry_extract_import_rows($alumniWorkbook, 'Registered Alumni');
import_test_assert(count($alumniExtract['rows']) === 1, 'Alumni headers must be case- and whitespace-insensitive');
import_test_assert($alumniExtract['rows'][0]['course'] === 'BSCS', 'Alumni row values must be extracted from the matched headers');
$alumniPreview = gradtrack_alumni_registry_validate_import_rows($db, $alumniExtract['rows']);
import_test_assert($alumniPreview['valid_rows'] === 1 && $alumniPreview['invalid_rows'] === 0, 'A valid Alumni workbook must pass row validation');

$wrongAlumniWorkbook = [
    'sheetNames' => ['Sheet1'],
    'sheets' => ['Sheet1' => [['Employee', 'Office'], ['Someone', 'Registrar']]],
];
$alumniFormatError = import_test_expect_error(
    static fn () => gradtrack_alumni_registry_extract_import_rows($wrongAlumniWorkbook, 'Sheet1'),
    'INVALID_EXCEL_FORMAT'
);
import_test_assert(count($alumniFormatError->getErrors()) === 3, 'Wrong Alumni headers must report every missing required column');

$oneMissingAlumniHeader = [
    'sheetNames' => ['Registered Alumni'],
    'sheets' => ['Registered Alumni' => [['Name', 'Course'], ['Someone', 'BSCS']]],
];
$oneMissingAlumniError = import_test_expect_error(
    static fn () => gradtrack_alumni_registry_extract_import_rows($oneMissingAlumniHeader, 'Registered Alumni'),
    'INVALID_EXCEL_FORMAT'
);
import_test_assert($oneMissingAlumniError->getErrors() === ['Missing required column: Batch'], 'Alumni validation must identify one missing header precisely');

$headersOnlyAlumni = [
    'sheetNames' => ['Registered Alumni'],
    'sheets' => ['Registered Alumni' => [['Name', 'Course', 'Batch']]],
];
import_test_expect_error(
    static fn () => gradtrack_alumni_registry_extract_import_rows($headersOnlyAlumni, 'Registered Alumni'),
    'EMPTY_FILE'
);

$invalidAlumniWorkbook = [
    'sheetNames' => ['Registered Alumni'],
    'sheets' => ['Registered Alumni' => [
        ['Name', 'Course', 'Batch'],
        ['Invalid Alumni', 'Unknown Program', 'not-a-year'],
    ]],
];
$invalidAlumniRows = gradtrack_alumni_registry_extract_import_rows($invalidAlumniWorkbook, 'Registered Alumni')['rows'];
$invalidAlumniPreview = gradtrack_alumni_registry_validate_import_rows($db, $invalidAlumniRows);
import_test_assert($invalidAlumniPreview['invalid_rows'] === 1, 'Invalid Alumni rows must be rejected before import');
import_test_assert((int) $db->query('SELECT COUNT(*) FROM registered_alumni')->fetchColumn() === 0, 'Invalid Alumni rows must not insert records');

$duplicateAlumniWorkbook = [
    'sheetNames' => ['Registered Alumni'],
    'sheets' => ['Registered Alumni' => [
        ['Name', 'Course', 'Batch'],
        ['Duplicate Alumni', 'BSCS', '2020'],
        ['Duplicate Alumni', 'BSCS', '2020'],
    ]],
];
$duplicateAlumniRows = gradtrack_alumni_registry_extract_import_rows($duplicateAlumniWorkbook, 'Registered Alumni')['rows'];
$duplicateAlumniPreview = gradtrack_alumni_registry_validate_import_rows($db, $duplicateAlumniRows);
import_test_assert($duplicateAlumniPreview['duplicate_rows'] === 1, 'Duplicate Alumni rows in one file must be detected');
import_test_assert(($duplicateAlumniPreview['duplicates'][0]['duplicate_type'] ?? '') === 'file', 'The duplicate source must be identified as the upload file');
import_test_assert((int) $db->query('SELECT COUNT(*) FROM registered_alumni')->fetchColumn() === 0, 'Duplicate Alumni rows must not insert records');

echo "All backend spreadsheet import validation tests passed.\n";
