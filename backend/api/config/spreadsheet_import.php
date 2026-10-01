<?php
declare(strict_types=1);

final class GradtrackImportException extends RuntimeException
{
    private string $errorType;
    private array $errors;
    private int $statusCode;
    private array $rowErrors = [];

    public function __construct(
        string $errorType,
        string $message,
        array $errors = [],
        int $statusCode = 400
    ) {
        parent::__construct($message);
        $this->errorType = $errorType;
        $this->errors = array_values(array_map('strval', $errors));
        $this->statusCode = $statusCode;
    }

    public function getErrorType(): string
    {
        return $this->errorType;
    }

    public function getErrors(): array
    {
        return $this->errors;
    }

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }

    public function setRowErrors(array $rowErrors): self
    {
        $this->rowErrors = array_values($rowErrors);
        return $this;
    }

    public function getRowErrors(): array
    {
        return $this->rowErrors;
    }
}

final class GradtrackSpreadsheetArchive
{
    private ?ZipArchive $zip = null;
    private ?PharData $phar = null;
    private ?string $temporaryZip = null;

    public function __construct(string $path)
    {
        if (class_exists('ZipArchive')) {
            $zip = new ZipArchive();
            $opened = $zip->open($path, ZipArchive::CHECKCONS);
            if ($opened !== true) {
                throw new GradtrackImportException(
                    'CORRUPTED_FILE',
                    'GradTrack could not read the selected Excel workbook. The file may be corrupted or use an unsupported format.'
                );
            }
            $this->zip = $zip;
            return;
        }

        if (!class_exists('PharData')) {
            throw new GradtrackImportException(
                'IMPORT_FAILED',
                'Excel validation is unavailable on the server. Please contact the system administrator.',
                [],
                500
            );
        }

        $temporaryBase = tempnam(sys_get_temp_dir(), 'gradtrack-xlsx-');
        if ($temporaryBase === false) {
            throw new GradtrackImportException('IMPORT_FAILED', 'Unable to prepare the Excel file for validation.', [], 500);
        }
        @unlink($temporaryBase);
        $this->temporaryZip = $temporaryBase . '.zip';
        if (!copy($path, $this->temporaryZip)) {
            throw new GradtrackImportException('IMPORT_FAILED', 'Unable to prepare the Excel file for validation.', [], 500);
        }

        try {
            $this->phar = new PharData($this->temporaryZip);
        } catch (Throwable $error) {
            $this->cleanup();
            throw new GradtrackImportException(
                'CORRUPTED_FILE',
                'GradTrack could not read the selected Excel workbook. The file may be corrupted or use an unsupported format.'
            );
        }
    }

    public function __destruct()
    {
        $this->cleanup();
    }

    private function cleanup(): void
    {
        if ($this->zip !== null) {
            $this->zip->close();
            $this->zip = null;
        }
        $this->phar = null;
        if ($this->temporaryZip !== null && is_file($this->temporaryZip)) {
            @unlink($this->temporaryZip);
        }
        $this->temporaryZip = null;
    }

    public function has(string $entry): bool
    {
        $entry = ltrim(str_replace('\\', '/', $entry), '/');
        if ($this->zip !== null) {
            return $this->zip->locateName($entry, ZipArchive::FL_NOCASE) !== false;
        }

        return $this->phar !== null && isset($this->phar[$entry]);
    }

    public function read(string $entry, int $maximumBytes): string
    {
        $entry = ltrim(str_replace('\\', '/', $entry), '/');
        if (!$this->has($entry)) {
            throw new GradtrackImportException(
                'CORRUPTED_FILE',
                'GradTrack could not read the selected Excel workbook. The file may be corrupted or use an unsupported format.'
            );
        }

        if ($this->zip !== null) {
            $index = $this->zip->locateName($entry, ZipArchive::FL_NOCASE);
            $stat = $index !== false ? $this->zip->statIndex($index) : false;
            if ($stat === false || (int) ($stat['size'] ?? 0) > $maximumBytes) {
                throw new GradtrackImportException('CORRUPTED_FILE', 'The Excel workbook contains an unreadable or oversized worksheet.');
            }
            $contents = $this->zip->getFromIndex($index, $maximumBytes + 1);
        } else {
            $file = $this->phar[$entry];
            if ($file->getSize() > $maximumBytes) {
                throw new GradtrackImportException('CORRUPTED_FILE', 'The Excel workbook contains an unreadable or oversized worksheet.');
            }
            try {
                $stream = $file->openFile('rb');
                $contents = $stream->fread($maximumBytes + 1);
            } catch (RuntimeException $error) {
                throw new GradtrackImportException(
                    'CORRUPTED_FILE',
                    'The Excel workbook contains an unreadable or oversized worksheet.'
                );
            }
        }

        if (!is_string($contents) || strlen($contents) > $maximumBytes) {
            throw new GradtrackImportException('CORRUPTED_FILE', 'The Excel workbook contains an unreadable or oversized worksheet.');
        }
        return $contents;
    }
}

function gradtrack_import_error_response(GradtrackImportException $error): void
{
    http_response_code($error->getStatusCode());
    $payload = [
        'success' => false,
        'errorType' => $error->getErrorType(),
        'message' => $error->getMessage(),
        'error' => $error->getMessage(),
        'errors' => $error->getErrors(),
    ];
    if ($error->getRowErrors() !== []) $payload['rowErrors'] = $error->getRowErrors();
    echo json_encode($payload);
}

function gradtrack_import_uploaded_file(string $field = 'file'): array
{
    $file = $_FILES[$field] ?? null;
    if (!is_array($file)) {
        throw new GradtrackImportException('INVALID_FILE_TYPE', 'No Excel import file was uploaded.');
    }

    $uploadError = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($uploadError !== UPLOAD_ERR_OK) {
        $message = $uploadError === UPLOAD_ERR_INI_SIZE || $uploadError === UPLOAD_ERR_FORM_SIZE
            ? 'The selected import file is too large.'
            : 'The selected import file could not be uploaded.';
        throw new GradtrackImportException('INVALID_FILE_TYPE', $message);
    }

    $path = (string) ($file['tmp_name'] ?? '');
    $name = basename((string) ($file['name'] ?? ''));
    if ($path === '' || !is_file($path) || $name === '') {
        throw new GradtrackImportException('INVALID_FILE_TYPE', 'No valid Excel import file was uploaded.');
    }

    $actualSize = filesize($path);
    $size = $actualSize !== false ? (int) $actualSize : (int) ($file['size'] ?? 0);
    if ($size <= 0) {
        throw new GradtrackImportException('EMPTY_FILE', 'The selected Excel file is empty.');
    }
    if ($size > 10 * 1024 * 1024) {
        throw new GradtrackImportException('INVALID_FILE_TYPE', 'Import file must be 10 MB or smaller.');
    }

    $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!in_array($extension, ['xlsx', 'csv'], true)) {
        throw new GradtrackImportException(
            'INVALID_FILE_TYPE',
            'The selected file is not a supported spreadsheet. Please upload a valid .xlsx or .csv file.'
        );
    }

    return [
        'name' => $name,
        'path' => $path,
        'size' => $size,
        'extension' => $extension,
        'mime_type' => (string) ($file['type'] ?? ''),
    ];
}

function gradtrack_spreadsheet_xml(string $xml, string $label): DOMDocument
{
    if (stripos($xml, '<!DOCTYPE') !== false || stripos($xml, '<!ENTITY') !== false) {
        throw new GradtrackImportException('CORRUPTED_FILE', "The Excel {$label} contains unsupported XML declarations.");
    }

    $document = new DOMDocument();
    $previous = libxml_use_internal_errors(true);
    $loaded = $document->loadXML($xml, LIBXML_NONET | LIBXML_COMPACT | LIBXML_NOBLANKS);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    if (!$loaded) {
        throw new GradtrackImportException(
            'CORRUPTED_FILE',
            'GradTrack could not read the selected Excel workbook. The file may be corrupted or use an unsupported format.'
        );
    }
    return $document;
}

function gradtrack_spreadsheet_column_index(string $reference): int
{
    if (preg_match('/^([A-Z]+)/i', $reference, $matches) !== 1) {
        return 0;
    }

    $index = 0;
    foreach (str_split(strtoupper($matches[1])) as $character) {
        $index = ($index * 26) + ord($character) - 64;
    }
    return $index;
}

function gradtrack_spreadsheet_normalize_zip_path(string $target): string
{
    $target = str_replace('\\', '/', $target);
    $target = ltrim($target, '/');
    if (!str_starts_with($target, 'xl/')) {
        $target = 'xl/' . $target;
    }

    $parts = [];
    foreach (explode('/', $target) as $part) {
        if ($part === '' || $part === '.') continue;
        if ($part === '..') {
            if ($parts === []) {
                throw new GradtrackImportException('CORRUPTED_FILE', 'The Excel workbook contains an invalid worksheet reference.');
            }
            array_pop($parts);
            continue;
        }
        $parts[] = $part;
    }
    return implode('/', $parts);
}

function gradtrack_spreadsheet_cell_text(DOMElement $cell, array $sharedStrings): string
{
    $type = strtolower($cell->getAttribute('t'));
    $xpath = new DOMXPath($cell->ownerDocument);
    $valueNode = $xpath->query('./*[local-name()="v"]', $cell)?->item(0);
    $raw = $valueNode ? trim((string) $valueNode->textContent) : '';

    if ($type === 's') {
        $index = filter_var($raw, FILTER_VALIDATE_INT);
        return $index !== false ? (string) ($sharedStrings[$index] ?? '') : '';
    }
    if ($type === 'inlinestr') {
        $nodes = $xpath->query('.//*[local-name()="t"]', $cell);
        $parts = [];
        if ($nodes !== false) {
            foreach ($nodes as $node) $parts[] = (string) $node->textContent;
        }
        return implode('', $parts);
    }
    if ($type === 'b') return $raw === '1' ? 'TRUE' : 'FALSE';
    if ($type === 'str' || $type === 'e') return $raw;
    return $raw;
}

function gradtrack_read_xlsx(string $path): array
{
    $signature = file_get_contents($path, false, null, 0, 4);
    if (!is_string($signature) || !in_array($signature, ["PK\x03\x04", "PK\x05\x06", "PK\x07\x08"], true)) {
        throw new GradtrackImportException(
            'INVALID_FILE_TYPE',
            'The selected file is not a valid Excel file. Please upload a genuine .xlsx workbook.'
        );
    }

    $archive = new GradtrackSpreadsheetArchive($path);
    foreach (['[Content_Types].xml', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels'] as $requiredEntry) {
        if (!$archive->has($requiredEntry)) {
            throw new GradtrackImportException(
                'INVALID_FILE_TYPE',
                'The selected file is not a valid Excel file. Please upload a genuine .xlsx workbook.'
            );
        }
    }

    $sharedStrings = [];
    if ($archive->has('xl/sharedStrings.xml')) {
        $sharedDocument = gradtrack_spreadsheet_xml(
            $archive->read('xl/sharedStrings.xml', 50 * 1024 * 1024),
            'shared strings'
        );
        $xpath = new DOMXPath($sharedDocument);
        $items = $xpath->query('//*[local-name()="si"]');
        if ($items !== false) {
            foreach ($items as $item) {
                $parts = [];
                $textNodes = $xpath->query('.//*[local-name()="t"]', $item);
                if ($textNodes !== false) {
                    foreach ($textNodes as $node) $parts[] = (string) $node->textContent;
                }
                $sharedStrings[] = implode('', $parts);
            }
        }
    }

    $relationshipsDocument = gradtrack_spreadsheet_xml(
        $archive->read('xl/_rels/workbook.xml.rels', 5 * 1024 * 1024),
        'relationships'
    );
    $relationships = [];
    $relationshipsXpath = new DOMXPath($relationshipsDocument);
    $relationshipNodes = $relationshipsXpath->query('//*[local-name()="Relationship"]');
    if ($relationshipNodes !== false) {
        foreach ($relationshipNodes as $relationship) {
            if (!$relationship instanceof DOMElement) continue;
            $id = $relationship->getAttribute('Id');
            $target = $relationship->getAttribute('Target');
            if ($id !== '' && $target !== '') {
                $relationships[$id] = gradtrack_spreadsheet_normalize_zip_path($target);
            }
        }
    }

    $workbookDocument = gradtrack_spreadsheet_xml(
        $archive->read('xl/workbook.xml', 5 * 1024 * 1024),
        'metadata'
    );
    $workbookXpath = new DOMXPath($workbookDocument);
    $sheetNodes = $workbookXpath->query('//*[local-name()="sheet"]');
    $sheetNames = [];
    $sheets = [];
    $sheetIndex = 0;

    if ($sheetNodes !== false) {
        foreach ($sheetNodes as $sheetNode) {
            if (!$sheetNode instanceof DOMElement) continue;
            $sheetIndex++;
            $name = trim($sheetNode->getAttribute('name'));
            if ($name === '') $name = 'Sheet' . $sheetIndex;
            $relationshipId = $sheetNode->getAttributeNS(
                'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
                'id'
            );
            if ($relationshipId === '') $relationshipId = $sheetNode->getAttribute('r:id');
            $entry = $relationships[$relationshipId] ?? ('xl/worksheets/sheet' . $sheetIndex . '.xml');
            if (!$archive->has($entry)) {
                throw new GradtrackImportException('CORRUPTED_FILE', "Worksheet {$name} is missing from the Excel workbook.");
            }

            $worksheetDocument = gradtrack_spreadsheet_xml(
                $archive->read($entry, 50 * 1024 * 1024),
                'worksheet'
            );
            $worksheetXpath = new DOMXPath($worksheetDocument);
            $rowNodes = $worksheetXpath->query('//*[local-name()="sheetData"]/*[local-name()="row"]');
            $rows = [];
            $sequentialRow = 0;
            if ($rowNodes !== false) {
                foreach ($rowNodes as $rowNode) {
                    if (!$rowNode instanceof DOMElement) continue;
                    $sequentialRow++;
                    $rowNumber = (int) $rowNode->getAttribute('r');
                    if ($rowNumber <= 0) $rowNumber = $sequentialRow;
                    if ($rowNumber > 50000) {
                        throw new GradtrackImportException('INVALID_EXCEL_FORMAT', 'Excel worksheets are limited to 50,000 rows.');
                    }

                    $values = [];
                    $sequentialColumn = 0;
                    $cellNodes = $worksheetXpath->query('./*[local-name()="c"]', $rowNode);
                    if ($cellNodes !== false) {
                        foreach ($cellNodes as $cellNode) {
                            if (!$cellNode instanceof DOMElement) continue;
                            $sequentialColumn++;
                            $column = gradtrack_spreadsheet_column_index($cellNode->getAttribute('r'));
                            if ($column <= 0) $column = $sequentialColumn;
                            if ($column > 500) {
                                throw new GradtrackImportException('INVALID_EXCEL_FORMAT', 'Excel worksheets are limited to 500 columns.');
                            }
                            $values[$column - 1] = gradtrack_spreadsheet_cell_text($cellNode, $sharedStrings);
                        }
                    }
                    if ($values !== []) {
                        $maximumColumn = max(array_keys($values));
                        $values = array_replace(array_fill(0, $maximumColumn + 1, ''), $values);
                    }
                    $rows[$rowNumber - 1] = $values;
                }
            }

            if ($rows !== []) {
                $maximumRow = max(array_keys($rows));
                $rows = array_replace(array_fill(0, $maximumRow + 1, []), $rows);
            }
            $sheetNames[] = $name;
            $sheets[$name] = $rows;
        }
    }

    if ($sheetNames === []) {
        throw new GradtrackImportException('CORRUPTED_FILE', 'No readable worksheet was found in the Excel workbook.');
    }

    return ['sheetNames' => $sheetNames, 'sheets' => $sheets];
}

function gradtrack_read_csv(string $path): array
{
    $sample = file_get_contents($path, false, null, 0, 8192);
    if (!is_string($sample) || str_contains($sample, "\0")) {
        throw new GradtrackImportException('INVALID_FILE_TYPE', 'The selected .csv file is not a readable text spreadsheet.');
    }

    $handle = fopen($path, 'rb');
    if ($handle === false) {
        throw new GradtrackImportException('CORRUPTED_FILE', 'GradTrack could not read the selected CSV file.');
    }

    $rows = [];
    try {
        while (($row = fgetcsv($handle, 0, ',', '"', '\\')) !== false) {
            if (count($row) > 500) {
                throw new GradtrackImportException('INVALID_EXCEL_FORMAT', 'CSV files are limited to 500 columns.');
            }
            if (isset($row[0])) $row[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $row[0]) ?? (string) $row[0];
            $rows[] = array_map(static fn ($value): string => (string) ($value ?? ''), $row);
            if (count($rows) > 50000) {
                throw new GradtrackImportException('INVALID_EXCEL_FORMAT', 'CSV files are limited to 50,000 rows.');
            }
        }
    } finally {
        fclose($handle);
    }

    return ['sheetNames' => ['CSV'], 'sheets' => ['CSV' => $rows]];
}

function gradtrack_read_uploaded_spreadsheet(array $file): array
{
    if (($file['extension'] ?? '') === 'xlsx') {
        return gradtrack_read_xlsx((string) $file['path']);
    }
    if (($file['extension'] ?? '') === 'csv') {
        return gradtrack_read_csv((string) $file['path']);
    }

    throw new GradtrackImportException('INVALID_FILE_TYPE', 'Only .xlsx and .csv spreadsheet files are supported.');
}

function gradtrack_spreadsheet_has_content(array $workbook): bool
{
    foreach (($workbook['sheets'] ?? []) as $rows) {
        foreach ((array) $rows as $row) {
            foreach ((array) $row as $cell) {
                if (trim((string) ($cell ?? '')) !== '') return true;
            }
        }
    }
    return false;
}
