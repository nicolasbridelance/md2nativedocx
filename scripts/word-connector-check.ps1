<#
.SYNOPSIS
  Moves diagram shapes in real Word and saves the results, for scripts/test-word-connectors.mjs.

.DESCRIPTION
  Drives desktop Word through COM on a generated .docx and writes three copies, all saved by Word:
    Still   the document opened and saved, nothing moved;
    Moved   every shape a connector starts from nudged by 12 pt;
    Again   Moved reopened, then every shape a connector ends on nudged by 12 pt.
  The harness compares their XML: what Word wrote is the evidence, not the geometry COM reports for
  canvas items, whose Left/Top are not in points (measured 2026-11-25: three shapes 90 pt apart
  reported Left = 0, 5.625, 11.25 while Width was in points).

  Word holds shapes inside their drawing canvas, so a shape on the canvas's right edge cannot move
  right: a nudge takes the first direction Word allows (see Move-Shape).

  Writes one JSON line per canvas of the reopened Moved copy, with its connectors and how many Word
  reports attached at both ends. Never modifies the input: it is opened read-only, macros are disabled
  (AutomationSecurity = 3), links are not updated, Word is quit at the end.
#>
param(
  [Parameter(Mandatory = $true)][string]$Docx,
  [Parameter(Mandatory = $true)][string]$Still,
  [Parameter(Mandatory = $true)][string]$Moved,
  [Parameter(Mandatory = $true)][string]$Again
)

$ErrorActionPreference = 'Stop'
$msoCanvas = 20
$wdFormatXMLDocument = 12
$nudge = 12.0

function Get-Canvases($doc) {
  $canvases = @()
  foreach ($shape in $doc.Shapes) {
    if ($shape.Type -eq $msoCanvas) { $canvases += $shape }
  }
  return $canvases
}

function Get-Connectors($canvas) {
  $connectors = @()
  $items = $canvas.CanvasItems
  for ($i = 1; $i -le $items.Count; $i++) {
    $item = $items.Item($i)
    if ($item.Connector) { $connectors += $item }
  }
  return $connectors
}

# Right, else left, else down, else up: the first direction Word lets the shape go. A shape as wide as
# its canvas cannot move sideways at all. Comparing Left/Top before and after is enough to see that
# Word refused, whatever unit they are in.
function Move-Shape($shape) {
  foreach ($step in @(@($nudge, 0), @(-$nudge, 0), @(0, $nudge), @(0, -$nudge))) {
    $left = [double]$shape.Left
    $top = [double]$shape.Top
    if ($step[0] -ne 0) { $shape.IncrementLeft($step[0]) } else { $shape.IncrementTop($step[1]) }
    if ([double]$shape.Left -ne $left -or [double]$shape.Top -ne $top) { return }
  }
}

# Nudges, once each, the shapes the connectors of every canvas start from (Begin) or end on (End).
function Move-ConnectedShapes($doc, [string]$end) {
  foreach ($canvas in (Get-Canvases $doc)) {
    $done = @{}
    foreach ($connector in (Get-Connectors $canvas)) {
      $format = $connector.ConnectorFormat
      $attached = if ($end -eq 'Begin') { $format.BeginConnected } else { $format.EndConnected }
      if (-not $attached) { continue }
      $shape = if ($end -eq 'Begin') { $format.BeginConnectedShape } else { $format.EndConnectedShape }
      # By ID, not Name: a shape is named after its label, and several nodes can share one.
      if ($done.ContainsKey($shape.ID)) { continue }
      $done[$shape.ID] = $true
      Move-Shape $shape
    }
  }
  $doc.Repaginate()
}

function Save-Copy($doc, [string]$path) {
  $doc.SaveAs2($path, $wdFormatXMLDocument, $false)
  $doc.Close($false)
}

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$word.AutomationSecurity = 3
$updateLinks = $word.Options.UpdateLinksAtOpen
$word.Options.UpdateLinksAtOpen = $false
try {
  Save-Copy ($word.Documents.Open($Docx, $false, $true, $false)) $Still

  $doc = $word.Documents.Open($Docx, $false, $true, $false)
  Move-ConnectedShapes $doc 'Begin'
  Save-Copy $doc $Moved

  $doc = $word.Documents.Open($Moved, $false, $true, $false)
  $index = 0
  foreach ($canvas in (Get-Canvases $doc)) {
    $index++
    $connectors = Get-Connectors $canvas
    $attached = @($connectors | Where-Object { $_.ConnectorFormat.BeginConnected -and $_.ConnectorFormat.EndConnected }).Count
    Write-Output (ConvertTo-Json ([ordered]@{ canvas = $index; connectors = $connectors.Count; attached = $attached }) -Compress)
  }
  Move-ConnectedShapes $doc 'End'
  Save-Copy $doc $Again
} finally {
  $word.Options.UpdateLinksAtOpen = $updateLinks
  # Quit() without arguments: its optional parameters are by-reference, which PowerShell cannot pass
  # positionally. Every document is already closed, so there is nothing to save or prompt for.
  $word.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}
