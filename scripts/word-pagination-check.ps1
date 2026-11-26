<#
.SYNOPSIS
  Measures how real Word paginates a generated .docx, for scripts/test-word-pagination.mjs.

.DESCRIPTION
  Opens the document read-only in desktop Word through COM, repaginates it and writes one JSON object:
    pages      the page count Word computes;
    sections   orientation, page size and margins (points) and the pages each section spans;
    headings   every paragraph of outline level 1 to 3, with its page and the page where the next
               paragraph starts (a heading left alone at the bottom of a page shows as a difference);
    tables     rows, whether the first row repeats as a header, and the pages the table spans;
    canvases   every drawing canvas: its size (points), the pages it starts and ends on, and the
               usable area of its section;
    inlineShapes  the same for inline shapes (SmartArt, charts), with their Word type;
    footnotes  the count, and the document's full text for the harness to search.
  Optionally exports a PDF with Word, for a person to look at.

  Never modifies the input: it is opened read-only, macros are disabled (AutomationSecurity = 3),
  links are not updated, the document is closed without saving and Word is quit at the end.
#>
param(
  [Parameter(Mandatory = $true)][string]$Docx,
  [string]$Pdf = ''
)

$ErrorActionPreference = 'Stop'
$msoCanvas = 20
$wdActiveEndPageNumber = 3
$wdStatisticPages = 2
$wdOrientLandscape = 1
$wdFormatPDF = 17

function Get-Page($doc, [int]$position) {
  return [int]$doc.Range($position, $position).Information($wdActiveEndPageNumber)
}

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$word.AutomationSecurity = 3
$updateLinks = $word.Options.UpdateLinksAtOpen
$word.Options.UpdateLinksAtOpen = $false
try {
  $doc = $word.Documents.Open($Docx, $false, $true, $false)
  try {
    $doc.Repaginate()

    $sections = @()
    foreach ($section in $doc.Sections) {
      $setup = $section.PageSetup
      $range = $section.Range
      $sections += [ordered]@{
        landscape = ($setup.Orientation -eq $wdOrientLandscape)
        pageWidth = [double]$setup.PageWidth
        pageHeight = [double]$setup.PageHeight
        usableWidth = [double]($setup.PageWidth - $setup.LeftMargin - $setup.RightMargin)
        usableHeight = [double]($setup.PageHeight - $setup.TopMargin - $setup.BottomMargin)
        startPage = Get-Page $doc $range.Start
        endPage = Get-Page $doc ([Math]::Max($range.Start, $range.End - 1))
      }
    }

    $headings = @()
    $paragraphs = $doc.Paragraphs
    for ($i = 1; $i -le $paragraphs.Count; $i++) {
      $paragraph = $paragraphs.Item($i)
      $level = [int]$paragraph.OutlineLevel
      if ($level -lt 1 -or $level -gt 3) { continue }
      $range = $paragraph.Range
      $next = if ($i -lt $paragraphs.Count) { Get-Page $doc $paragraphs.Item($i + 1).Range.Start } else { $null }
      $headings += [ordered]@{
        level = $level
        text = $range.Text.Trim()
        page = Get-Page $doc ([Math]::Max($range.Start, $range.End - 1))
        nextPage = $next
      }
    }

    $tables = @()
    foreach ($table in $doc.Tables) {
      $range = $table.Range
      $tables += [ordered]@{
        rows = [int]$table.Rows.Count
        headerRepeats = [bool]$table.Rows.Item(1).HeadingFormat
        startPage = Get-Page $doc $range.Start
        endPage = Get-Page $doc ($range.End - 1)
      }
    }

    $canvases = @()
    foreach ($shape in $doc.Shapes) {
      if ($shape.Type -ne $msoCanvas) { continue }
      $anchor = $shape.Anchor
      $setup = $anchor.Sections.Item(1).PageSetup
      $canvases += [ordered]@{
        width = [double]$shape.Width
        height = [double]$shape.Height
        startPage = Get-Page $doc $anchor.Start
        endPage = Get-Page $doc ([Math]::Max($anchor.Start, $anchor.End - 1))
        usableWidth = [double]($setup.PageWidth - $setup.LeftMargin - $setup.RightMargin)
        usableHeight = [double]($setup.PageHeight - $setup.TopMargin - $setup.BottomMargin)
      }
    }

    # SmartArt and charts are inline shapes, not canvases.
    $inline = @()
    foreach ($shape in $doc.InlineShapes) {
      $range = $shape.Range
      $setup = $range.Sections.Item(1).PageSetup
      $inline += [ordered]@{
        type = [int]$shape.Type
        width = [double]$shape.Width
        height = [double]$shape.Height
        startPage = Get-Page $doc $range.Start
        endPage = Get-Page $doc ([Math]::Max($range.Start, $range.End - 1))
        usableWidth = [double]($setup.PageWidth - $setup.LeftMargin - $setup.RightMargin)
        usableHeight = [double]($setup.PageHeight - $setup.TopMargin - $setup.BottomMargin)
      }
    }

    $result = [ordered]@{
      pages = [int]$doc.ComputeStatistics($wdStatisticPages)
      wordBuild = [string]$word.Build
      sections = $sections
      headings = $headings
      tables = $tables
      canvases = $canvases
      inlineShapes = $inline
      footnotes = [int]$doc.Footnotes.Count
      text = [string]$doc.Content.Text
    }
    if ($Pdf -ne '') { $doc.ExportAsFixedFormat($Pdf, $wdFormatPDF, $false) }
  } finally {
    $doc.Close($false)
  }
  Write-Output (ConvertTo-Json $result -Depth 4 -Compress)
} finally {
  $word.Options.UpdateLinksAtOpen = $updateLinks
  # Quit() without arguments: its optional parameters are by-reference, which PowerShell cannot pass
  # positionally. The document is already closed without saving, so there is nothing to prompt for.
  $word.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
