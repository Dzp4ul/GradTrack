<?php
declare(strict_types=1);

require_once __DIR__ . '/spreadsheet_import.php';
require_once __DIR__ . '/graduation_years.php';
require_once __DIR__ . '/graduate_record_validation.php';
require_once __DIR__ . '/name_format.php';

function gradtrack_graduate_import_required_columns(): array
{
    return [
        'Student Number (or Student ID)',
        'Name (or First Name and Last Name)',
    ];
}

function gradtrack_graduate_import_text($value): string
{
    return preg_replace('/\s+/', ' ', trim((string) ($value ?? ''))) ?: '';
}

function gradtrack_graduate_import_length(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function gradtrack_graduate_import_header_key($value): string
{
    return strtolower(preg_replace('/[^a-z0-9]/i', '', gradtrack_graduate_import_text($value)) ?: '');
}

function gradtrack_graduate_import_header_groups(): array
{
    return [
        'student' => ['studentnumber', 'studentno', 'studentid', 'idnumber'],
        'full_name' => ['name', 'fullname', 'nameofstudent', 'nameofstudents', 'studentname', 'graduatename'],
        'first_name' => ['firstname', 'givenname'],
        'middle_name' => ['middlename'],
        'last_name' => ['lastname', 'surname'],
        'name_extension' => ['nameextension', 'nameext', 'suffix'],
        'email' => ['email', 'emailadd', 'emailaddress'],
        'phone' => ['contactno', 'contactnumber', 'phone'],
        'program_id' => ['programid'],
        'program' => ['program', 'programname', 'programcode'],
        'year' => ['yeargraduated', 'graduationyear'],
        'address' => ['address'],
        'employment_status' => ['employmentstatus'],
        'alignment' => ['coursealignment', 'isaligned'],
        'company' => ['companyname'],
        'job_title' => ['jobtitle'],
        'industry' => ['industry'],
        'date_hired' => ['datehired'],
        'salary' => ['monthlysalary'],
        'time_to_employment' => ['timetoemploymentmonths', 'timetoemployment'],
    ];
}

function gradtrack_graduate_import_header_analysis(array $row): array
{
    $keys = [];
    foreach ($row as $cell) {
        $key = gradtrack_graduate_import_header_key($cell);
        if ($key !== '') $keys[$key] = true;
    }
    $groups = gradtrack_graduate_import_header_groups();
    $has = static function (string $group) use ($keys, $groups): bool {
        foreach ($groups[$group] as $key) {
            if (isset($keys[$key])) return true;
        }
        return false;
    };

    $hasStudent = $has('student');
    $hasFullName = $has('full_name');
    $hasFirstName = $has('first_name');
    $hasLastName = $has('last_name');
    $hasName = $hasFullName || ($hasFirstName && $hasLastName);
    $missing = [];
    if (!$hasStudent) $missing[] = 'Missing required column: Student Number (or Student ID)';
    if (!$hasName) $missing[] = 'Missing required column: Name (or First Name and Last Name)';

    return [
        'valid' => $hasStudent && $hasName,
        'score' => ($hasStudent ? 1 : 0) + ($hasFullName ? 2 : 0) + ($hasFirstName ? 1 : 0) + ($hasLastName ? 1 : 0),
        'missing' => $missing,
    ];
}

function gradtrack_graduate_import_record(array $headers, array $row): array
{
    $record = [];
    foreach ($headers as $index => $header) {
        $header = gradtrack_graduate_import_text($header);
        if ($header !== '') $record[$header] = $row[$index] ?? '';
    }
    return $record;
}

function gradtrack_graduate_import_value(array $record, string $group): string
{
    $aliases = gradtrack_graduate_import_header_groups()[$group] ?? [];
    foreach ($record as $header => $value) {
        if (!in_array(gradtrack_graduate_import_header_key($header), $aliases, true)) continue;
        $text = gradtrack_graduate_import_text($value);
        if ($text !== '') return $text;
    }
    return '';
}

function gradtrack_graduate_import_row_has_data(array $record): bool
{
    foreach (array_keys(gradtrack_graduate_import_header_groups()) as $group) {
        if (gradtrack_graduate_import_value($record, $group) !== '') return true;
    }
    return false;
}

function gradtrack_graduate_import_is_summary_row(array $record): bool
{
    if (gradtrack_graduate_import_value($record, 'student') !== '') return false;
    $name = gradtrack_graduate_import_value($record, 'full_name');
    return preg_match('/^(?:grand\s+)?total(?:\s+graduates?)?$|^(?:summary|member\s+count)$/i', $name) === 1;
}

function gradtrack_graduate_import_programs(PDO $db): array
{
    $rows = $db->query('SELECT id, code, name FROM programs ORDER BY id ASC')->fetchAll(PDO::FETCH_ASSOC);
    return array_map(static fn (array $row): array => [
        'id' => (string) $row['id'],
        'code' => strtoupper(trim((string) ($row['code'] ?? ''))),
        'name' => trim((string) ($row['name'] ?? '')),
    ], $rows);
}

function gradtrack_graduate_import_resolve_program($value, array $programs): string
{
    $text = gradtrack_graduate_import_text($value);
    if ($text === '') return '';
    foreach ($programs as $program) {
        if ($text === (string) $program['id']) return (string) $program['id'];
    }

    $aliases = ['BSHRM' => 'BSHM', 'HRM' => 'BSHM', 'HM' => 'BSHM'];
    $tokens = preg_split('/[^A-Z0-9]+/', strtoupper($text), -1, PREG_SPLIT_NO_EMPTY) ?: [];
    foreach ($tokens as $token) {
        $code = $aliases[$token] ?? $token;
        foreach ($programs as $program) {
            if ($program['code'] === $code) return (string) $program['id'];
        }
    }

    $normalized = gradtrack_graduate_import_header_key($text);
    $nameAliases = [
        'bachelorofscienceinhotelandrestaurantmanagement' => 'BSHM',
        'bachelorofscienceinhospitalitymanagement' => 'BSHM',
        'bachelorofscienceincomputerscience' => 'BSCS',
        'bachelorofelementaryeducation' => 'BEED',
        'bachelorofsecondaryeducation' => 'BSED',
        'associateincomputertechnology' => 'ACT',
        'bachelorofscienceinnursing' => 'BSN',
    ];
    foreach ($nameAliases as $name => $code) {
        if (!str_contains($normalized, $name)) continue;
        foreach ($programs as $program) {
            if ($program['code'] === $code) return (string) $program['id'];
        }
    }
    foreach ($programs as $program) {
        $name = gradtrack_graduate_import_header_key($program['name']);
        if ($name !== '' && str_contains($normalized, $name)) return (string) $program['id'];
    }
    return '';
}

function gradtrack_graduate_import_official_year(array $rows): ?int
{
    foreach ($rows as $row) {
        $parts = array_values(array_unique(array_filter(array_map('gradtrack_graduate_import_text', (array) $row))));
        $text = implode(' ', $parts);
        if (preg_match('/\b(?:a\.?\s*y\.?|academic\s+year|school\s+year)\s*[:.]?\s*((?:19|20)\d{2})\s*[-–\/]\s*((?:19|20)\d{2})\b/i', $text, $matches) === 1) {
            return gradtrack_normalize_graduation_year($matches[2]);
        }
        if (preg_match('/\bofficial\s+(?:list\s+of\s+graduates?|graduates?\s+list)\b[^0-9]{0,40}\b((?:19|20)\d{2})\b/i', $text, $matches) === 1) {
            return gradtrack_normalize_graduation_year($matches[1]);
        }
    }
    return null;
}

function gradtrack_graduate_import_name_extension(string $value): string
{
    $key = strtolower(trim($value));
    $aliases = ['jr' => 'JR.', 'jr.' => 'JR.', 'sr' => 'SR.', 'sr.' => 'SR.', 'ii' => 'II', 'iii' => 'III', 'iv' => 'IV', 'v' => 'V', 'vi' => 'VI'];
    return $key === '' ? '' : ($aliases[$key] ?? strtoupper($value));
}

function gradtrack_graduate_import_is_middle_initial(string $value): bool
{
    return preg_match('/^(?:[A-Za-z]{1,3}\.|(?:[A-Za-z]\.){2,3})$/', $value) === 1;
}

function gradtrack_graduate_import_parse_name(string $fullName): array
{
    $normalized = gradtrack_graduate_import_text($fullName);
    if ($normalized === '') return ['first_name' => '', 'middle_name' => '', 'last_name' => '', 'name_extension' => ''];

    $popExtension = static function (array &$tokens): string {
        if ($tokens === []) return '';
        $extension = gradtrack_graduate_import_name_extension((string) end($tokens));
        if (in_array($extension, ['JR.', 'SR.', 'II', 'III', 'IV', 'V', 'VI'], true)) {
            array_pop($tokens);
            return $extension;
        }
        return '';
    };

    if (str_contains($normalized, ',')) {
        $parts = explode(',', $normalized);
        $lastName = gradtrack_uppercase_name(array_shift($parts));
        $tokens = preg_split('/\s+/', gradtrack_graduate_import_text(implode(' ', $parts)), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $extension = $popExtension($tokens);
        $middle = count($tokens) > 1 && gradtrack_graduate_import_is_middle_initial((string) end($tokens))
            ? (string) array_pop($tokens)
            : '';
        return [
            'first_name' => gradtrack_uppercase_name(implode(' ', $tokens)),
            'middle_name' => gradtrack_uppercase_name($middle),
            'last_name' => $lastName,
            'name_extension' => $extension,
        ];
    }

    $tokens = preg_split('/\s+/', $normalized, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $extension = $popExtension($tokens);
    if (count($tokens) >= 3 && gradtrack_graduate_import_is_middle_initial((string) end($tokens))) {
        $lastName = (string) array_shift($tokens);
        $middle = (string) array_pop($tokens);
        return [
            'first_name' => gradtrack_uppercase_name(implode(' ', $tokens)),
            'middle_name' => gradtrack_uppercase_name($middle),
            'last_name' => gradtrack_uppercase_name($lastName),
            'name_extension' => $extension,
        ];
    }
    if (count($tokens) === 1) {
        return ['first_name' => gradtrack_uppercase_name($tokens[0]), 'middle_name' => '', 'last_name' => '', 'name_extension' => $extension];
    }
    return [
        'first_name' => gradtrack_uppercase_name($tokens[0] ?? ''),
        'middle_name' => gradtrack_uppercase_name(implode(' ', array_slice($tokens, 1, -1))),
        'last_name' => gradtrack_uppercase_name($tokens[count($tokens) - 1] ?? ''),
        'name_extension' => $extension,
    ];
}

function gradtrack_graduate_import_legacy_program(array $seenCodes, array $programs): string
{
    foreach (['BSHM', 'BEED', 'BSCS'] as $code) {
        if (!isset($seenCodes[$code])) return '';
    }
    if (isset($seenCodes['BSED'])) return '';
    foreach ($programs as $program) {
        if ($program['code'] === 'BSED') return (string) $program['id'];
    }
    return '';
}

function gradtrack_graduate_import_issue(array $row, array $errors): array
{
    return [
        'sheetName' => (string) ($row['sheet_name'] ?? ''),
        'rowNumber' => (int) ($row['row_number'] ?? 0),
        'studentId' => (string) ($row['student_id'] ?? '-'),
        'graduateName' => (string) ($row['graduate_name'] ?? '-'),
        'errors' => array_values(array_unique($errors)),
        'reason' => implode('; ', array_values(array_unique($errors))),
    ];
}

function gradtrack_graduate_import_analyze(PDO $db, array $workbook, ?int $selectedProgramId = null, $selectedYear = null): array
{
    if (!gradtrack_spreadsheet_has_content($workbook)) {
        throw new GradtrackImportException('EMPTY_FILE', 'The selected Excel file does not contain any graduate records to import.');
    }

    $programs = gradtrack_graduate_import_programs($db);
    $selectedProgram = '';
    if ($selectedProgramId !== null && $selectedProgramId > 0) {
        foreach ($programs as $program) {
            if ((int) $program['id'] === $selectedProgramId) $selectedProgram = (string) $program['id'];
        }
    }
    $selectedGraduationYear = gradtrack_normalize_graduation_year($selectedYear);
    $records = [];
    $rowIssues = [];
    $graduationYears = [];
    $validHeaderCount = 0;
    $bestHeader = ['score' => -1, 'missing' => gradtrack_graduate_import_required_columns()];
    $seenStudentIds = [];
    $seenEmails = [];

    foreach (($workbook['sheetNames'] ?? []) as $sheetName) {
        $rows = $workbook['sheets'][$sheetName] ?? [];
        $sheetProgram = gradtrack_graduate_import_resolve_program($sheetName, $programs);
        $currentProgram = $sheetProgram;
        $currentYear = gradtrack_graduate_import_official_year(array_slice($rows, 0, 30));
        $activeHeaders = null;
        $seenCodes = [];
        if ($sheetProgram !== '') {
            foreach ($programs as $program) {
                if ($program['id'] === $sheetProgram) $seenCodes[$program['code']] = true;
            }
        }

        foreach ($rows as $zeroIndex => $cells) {
            $cells = (array) $cells;
            $headerAnalysis = gradtrack_graduate_import_header_analysis($cells);
            if ($headerAnalysis['score'] > $bestHeader['score']) $bestHeader = $headerAnalysis;
            $text = implode(' ', array_values(array_unique(array_filter(array_map('gradtrack_graduate_import_text', $cells)))));
            if (preg_match('/\bnorzagaray\s+college\b/i', $text) === 1) {
                $activeHeaders = null;
                $currentProgram = $sheetProgram;
            }

            $rowYear = gradtrack_graduate_import_official_year([$cells]);
            if ($rowYear !== null) $currentYear = $rowYear;

            if ($headerAnalysis['valid']) {
                $validHeaderCount++;
                if ($currentProgram === '') $currentProgram = gradtrack_graduate_import_legacy_program($seenCodes, $programs);
                $activeHeaders = array_map('gradtrack_graduate_import_text', $cells);
                continue;
            }

            if ($activeHeaders !== null) {
                $record = gradtrack_graduate_import_record($activeHeaders, $cells);
                if (gradtrack_graduate_import_row_has_data($record) && !gradtrack_graduate_import_is_summary_row($record)) {
                    $studentId = gradtrack_graduate_import_value($record, 'student');
                    $fullName = gradtrack_graduate_import_value($record, 'full_name');
                    $parsedName = gradtrack_graduate_import_parse_name($fullName);
                    $firstName = gradtrack_uppercase_name(gradtrack_graduate_import_value($record, 'first_name') ?: $parsedName['first_name']);
                    $middleName = gradtrack_uppercase_name(gradtrack_graduate_import_value($record, 'middle_name') ?: $parsedName['middle_name']);
                    $lastName = gradtrack_uppercase_name(gradtrack_graduate_import_value($record, 'last_name') ?: $parsedName['last_name']);
                    $nameExtension = gradtrack_graduate_import_name_extension(
                        gradtrack_graduate_import_value($record, 'name_extension') ?: $parsedName['name_extension']
                    );
                    $email = strtolower(gradtrack_graduate_import_value($record, 'email'));
                    $phone = gradtrack_graduate_import_value($record, 'phone');
                    $programInput = gradtrack_graduate_import_value($record, 'program_id') ?: gradtrack_graduate_import_value($record, 'program');
                    $resolvedProgramInput = $programInput !== '' ? gradtrack_graduate_import_resolve_program($programInput, $programs) : '';
                    $programId = $resolvedProgramInput;
                    if ($programId === '') $programId = $currentProgram !== '' ? $currentProgram : $selectedProgram;
                    $yearInput = gradtrack_graduate_import_value($record, 'year');
                    $graduationYear = $currentYear ?? gradtrack_normalize_graduation_year($yearInput) ?? $selectedGraduationYear;
                    $graduateName = $lastName !== '' && $firstName !== '' ? $lastName . ', ' . $firstName : ($fullName ?: '-');
                    $row = [
                        'sheet_name' => (string) $sheetName,
                        'row_number' => $zeroIndex + 1,
                        'student_id' => $studentId,
                        'graduate_name' => $graduateName,
                        'first_name' => $firstName,
                        'middle_name' => $middleName,
                        'last_name' => $lastName,
                        'name_extension' => $nameExtension,
                        'email' => $email,
                        'phone' => $phone,
                        'program_id' => $programId,
                        'year_graduated' => $graduationYear,
                        'address' => gradtrack_graduate_import_value($record, 'address'),
                        'employment_status' => gradtrack_graduate_import_value($record, 'employment_status') ?: 'unemployed',
                        'is_aligned' => gradtrack_graduate_import_value($record, 'alignment') ?: 'not_aligned',
                        'company_name' => gradtrack_graduate_import_value($record, 'company'),
                        'job_title' => gradtrack_graduate_import_value($record, 'job_title'),
                        'industry' => gradtrack_graduate_import_value($record, 'industry'),
                        'date_hired' => gradtrack_graduate_import_value($record, 'date_hired'),
                        'monthly_salary' => gradtrack_graduate_import_value($record, 'salary'),
                        'time_to_employment' => gradtrack_graduate_import_value($record, 'time_to_employment'),
                    ];

                    $errors = [];
                    if ($studentId === '') $errors[] = 'Student ID is required';
                    elseif (strlen($studentId) > 20 || preg_match('/\s/', $studentId) === 1) $errors[] = 'Invalid Student ID';
                    if ($firstName === '') $errors[] = 'First name is required';
                    elseif (gradtrack_graduate_import_length($firstName) > 50) $errors[] = 'First name must be 50 characters or fewer';
                    if ($lastName === '') $errors[] = 'Last name is required';
                    elseif (gradtrack_graduate_import_length($lastName) > 50) $errors[] = 'Last name must be 50 characters or fewer';
                    if (gradtrack_graduate_import_length($middleName) > 50) $errors[] = 'Middle name must be 50 characters or fewer';
                    if ($email !== '' && (!gradtrack_optional_graduate_email_is_valid($email) || strlen($email) > 150)) $errors[] = 'Invalid email address';
                    if ($phone !== '' && !gradtrack_optional_graduate_phone_is_valid($phone)) $errors[] = 'Contact No. must be 11 digits and start with 09';
                    if ($programInput !== '' && $resolvedProgramInput === '') $errors[] = 'Invalid Program';
                    if ($graduationYear === null) $errors[] = 'Invalid or missing Year Graduated';
                    if ($studentId !== '') {
                        $studentKey = strtolower($studentId);
                        if (isset($seenStudentIds[$studentKey])) $errors[] = 'Duplicate Student ID in this file (first seen on row ' . $seenStudentIds[$studentKey] . ')';
                        else $seenStudentIds[$studentKey] = $zeroIndex + 1;
                    }
                    if ($email !== '') {
                        if (isset($seenEmails[$email])) $errors[] = 'Duplicate email in this file (first seen on row ' . $seenEmails[$email] . ')';
                        else $seenEmails[$email] = $zeroIndex + 1;
                    }

                    if ($errors !== []) $rowIssues[] = gradtrack_graduate_import_issue($row, $errors);
                    else {
                        $records[] = $row;
                        $graduationYears[(string) $graduationYear] = (string) $graduationYear;
                    }
                    continue;
                }
            }

            $rowProgram = gradtrack_graduate_import_resolve_program($text, $programs);
            if ($rowProgram !== '') {
                $currentProgram = $rowProgram;
                foreach ($programs as $program) {
                    if ($program['id'] === $rowProgram) $seenCodes[$program['code']] = true;
                }
            }
        }
    }

    if ($validHeaderCount === 0) {
        $errors = $bestHeader['missing'];
        if ($errors === []) $errors = ['The first row/header structure does not match the GradTrack graduate template.'];
        throw new GradtrackImportException(
            'INVALID_EXCEL_FORMAT',
            'The selected Excel file does not match the required GradTrack graduate import format.',
            $errors
        );
    }
    if ($records === [] && $rowIssues === []) {
        throw new GradtrackImportException('EMPTY_FILE', 'The selected Excel file contains headers but no graduate records to import.');
    }
    if ($rowIssues !== []) {
        $messages = array_map(static fn (array $issue): string => 'Row ' . $issue['rowNumber'] . ': ' . $issue['reason'], $rowIssues);
        $duplicateOnly = true;
        foreach ($rowIssues as $issue) {
            foreach ($issue['errors'] as $rowError) {
                if (!str_starts_with($rowError, 'Duplicate ')) $duplicateOnly = false;
            }
        }
        $exception = new GradtrackImportException(
            $duplicateOnly ? 'DUPLICATE_DATA' : 'INVALID_ROW_DATA',
            $duplicateOnly
                ? 'The Excel file contains duplicate graduate records. No records were imported.'
                : 'The Excel format is correct, but some graduate records contain invalid data. No records were imported.',
            $messages
        );
        throw $exception->setRowErrors($rowIssues);
    }

    ksort($graduationYears, SORT_NUMERIC);
    return [
        'records' => $records,
        'sheet_count' => count($workbook['sheetNames'] ?? []),
        'graduation_years' => array_values($graduationYears),
        'required_columns' => gradtrack_graduate_import_required_columns(),
    ];
}

function gradtrack_graduate_import_existing(PDO $db, array $records): array
{
    $studentIds = array_values(array_unique(array_filter(array_column($records, 'student_id'))));
    $emails = array_values(array_unique(array_filter(array_column($records, 'email'))));
    $existingStudentIds = [];
    $existingEmails = [];

    foreach (array_chunk($studentIds, 500) as $chunk) {
        $placeholders = implode(',', array_fill(0, count($chunk), '?'));
        $stmt = $db->prepare("SELECT student_id FROM graduates WHERE student_id IN ({$placeholders})");
        $stmt->execute($chunk);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $value) $existingStudentIds[strtolower((string) $value)] = true;
    }
    foreach (array_chunk($emails, 500) as $chunk) {
        $placeholders = implode(',', array_fill(0, count($chunk), '?'));
        $stmt = $db->prepare("SELECT email FROM graduates WHERE email IN ({$placeholders})");
        $stmt->execute($chunk);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $value) $existingEmails[strtolower((string) $value)] = true;
    }
    return ['student_ids' => $existingStudentIds, 'emails' => $existingEmails];
}

function gradtrack_graduate_import_execute(PDO $db, array $analysis, bool $hasNameExtensionColumn): array
{
    $existing = gradtrack_graduate_import_existing($db, $analysis['records']);
    $insertable = [];
    $skipped = [];
    foreach ($analysis['records'] as $record) {
        $reasons = [];
        if (isset($existing['student_ids'][strtolower($record['student_id'])])) $reasons[] = 'Student ID already exists';
        if ($record['email'] !== '' && isset($existing['emails'][strtolower($record['email'])])) $reasons[] = 'Email already exists';
        if ($reasons !== []) $skipped[] = gradtrack_graduate_import_issue($record, $reasons);
        else $insertable[] = $record;
    }

    $inserted = 0;
    try {
        $db->beginTransaction();
        $graduateSql = $hasNameExtensionColumn
            ? 'INSERT INTO graduates (student_id, first_name, middle_name, last_name, name_extension, email, phone, program_id, year_graduated, address) VALUES (:student_id, :first_name, :middle_name, :last_name, :name_extension, :email, :phone, :program_id, :year_graduated, :address)'
            : 'INSERT INTO graduates (student_id, first_name, middle_name, last_name, email, phone, program_id, year_graduated, address) VALUES (:student_id, :first_name, :middle_name, :last_name, :email, :phone, :program_id, :year_graduated, :address)';
        $graduateStmt = $db->prepare($graduateSql);
        $employmentStmt = $db->prepare('INSERT INTO employment (graduate_id, company_name, job_title, industry, employment_status, is_aligned, date_hired, monthly_salary, time_to_employment) VALUES (:graduate_id, :company, :job_title, :industry, :status, :aligned, :date_hired, :salary, :time)');

        foreach ($insertable as $record) {
            $parameters = [
                ':student_id' => $record['student_id'],
                ':first_name' => $record['first_name'],
                ':middle_name' => $record['middle_name'] !== '' ? $record['middle_name'] : null,
                ':last_name' => $record['last_name'],
                ':email' => $record['email'] !== '' ? $record['email'] : null,
                ':phone' => $record['phone'] !== '' ? $record['phone'] : null,
                ':program_id' => $record['program_id'] !== '' ? (int) $record['program_id'] : null,
                ':year_graduated' => (int) $record['year_graduated'],
                ':address' => $record['address'] !== '' ? $record['address'] : null,
            ];
            if ($hasNameExtensionColumn) $parameters[':name_extension'] = $record['name_extension'] !== '' ? $record['name_extension'] : null;
            $graduateStmt->execute($parameters);
            $graduateId = (int) $db->lastInsertId();
            $salary = $record['monthly_salary'] !== '' && is_numeric($record['monthly_salary']) ? $record['monthly_salary'] : null;
            $time = $record['time_to_employment'] !== '' && is_numeric($record['time_to_employment']) ? max(0, (int) $record['time_to_employment']) : 0;
            $status = strtolower(str_replace(' ', '_', $record['employment_status']));
            if (!in_array($status, ['employed', 'self_employed', 'freelance', 'unemployed'], true)) $status = 'unemployed';
            $alignment = strtolower(str_replace(' ', '_', $record['is_aligned']));
            if (!in_array($alignment, ['aligned', 'partially_aligned', 'not_aligned'], true)) $alignment = 'not_aligned';
            $employmentStmt->execute([
                ':graduate_id' => $graduateId,
                ':company' => $record['company_name'] !== '' ? $record['company_name'] : null,
                ':job_title' => $record['job_title'] !== '' ? $record['job_title'] : null,
                ':industry' => $record['industry'] !== '' ? $record['industry'] : null,
                ':status' => $status,
                ':aligned' => $alignment,
                ':date_hired' => $record['date_hired'] !== '' ? $record['date_hired'] : null,
                ':salary' => $salary,
                ':time' => $time,
            ]);
            $inserted++;
        }
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }

    return [
        'totalRows' => count($analysis['records']),
        'added' => $inserted,
        'skipped' => count($skipped),
        'sheetCount' => (int) $analysis['sheet_count'],
        'graduationYears' => $analysis['graduation_years'],
        'skippedRows' => $skipped,
    ];
}
