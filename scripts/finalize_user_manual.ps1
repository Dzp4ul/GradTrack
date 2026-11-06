param(
    [Parameter(Mandatory = $true)]
    [string]$DocxPath,
    [Parameter(Mandatory = $true)]
    [string]$PdfPath
)

$ErrorActionPreference = 'Stop'
$resolvedDocx = (Resolve-Path -LiteralPath $DocxPath).Path
$resolvedPdf = [IO.Path]::GetFullPath($PdfPath)
$expectedRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\documentation\GradTrack_User_Manual_Update'))

if (-not $resolvedDocx.StartsWith($expectedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "The Word file is outside the documentation output directory: $resolvedDocx"
}
if (-not $resolvedPdf.StartsWith($expectedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "The PDF file is outside the documentation output directory: $resolvedPdf"
}

$word = $null
$document = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $document = $word.Documents.Open($resolvedDocx, $false, $false)

    foreach ($story in $document.StoryRanges) {
        $range = $story
        while ($null -ne $range) {
            if ($range.Fields.Count -gt 0) {
                [void]$range.Fields.Update()
            }
            $range = $range.NextStoryRange
        }
    }

    [void]$document.Repaginate()
    foreach ($toc in $document.TablesOfContents) {
        [void]$toc.Update()
    }
    foreach ($tof in $document.TablesOfFigures) {
        [void]$tof.Update()
    }
    if ($document.Fields.Count -gt 0) {
        [void]$document.Fields.Update()
    }
    [void]$document.Repaginate()

    $document.Save()
    $wdExportFormatPDF = 17
    $wdExportOptimizeForPrint = 0
    $wdExportAllDocument = 0
    $wdExportDocumentContent = 0
    $wdExportCreateHeadingBookmarks = 1
    $document.ExportAsFixedFormat(
        $resolvedPdf,
        $wdExportFormatPDF,
        $false,
        $wdExportOptimizeForPrint,
        $wdExportAllDocument,
        1,
        1,
        $wdExportDocumentContent,
        $true,
        $true,
        $wdExportCreateHeadingBookmarks,
        $true,
        $true,
        $false
    )
    Write-Output "Updated fields and exported PDF: $resolvedPdf"
}
finally {
    if ($null -ne $document) {
        $document.Close($false)
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document)
    }
    if ($null -ne $word) {
        $word.Quit()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
