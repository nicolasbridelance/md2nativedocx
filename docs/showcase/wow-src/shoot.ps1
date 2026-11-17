# Automated takes of the showcase video, in the real Word / PowerPoint, with the real mouse cursor.
# Each take opens a fresh copy of the demo file, records the app window with ffmpeg and plays the
# gestures. Coordinates are for a 1920x1080 screen with Word maximized at 100 % zoom.
# Usage: powershell -File shoot.ps1 -shot B
param([Parameter(Mandatory)][ValidateSet('A', 'B', 'C', 'D', 'probe')][string]$shot, [int]$zoom = 100)
. "$PSScriptRoot\mouse.ps1"
$ErrorActionPreference = 'Stop'
$raw = Join-Path $PSScriptRoot 'raw'; New-Item -ItemType Directory -Force $raw | Out-Null
$src = @{ A = 'douleur.docx'; B = 'formes.docx'; C = 'smartart.docx'; D = 'smartart.pptx'; probe = $env:PROBE_FILE }[$shot]
$take = Join-Path $env:TEMP ("take-" + $src)
Copy-Item (Join-Path $PSScriptRoot "out\$src") $take -Force

function Open-Word {
  $w = New-Object -ComObject Word.Application
  $w.Visible = $true
  $d = $w.Documents.Open($take)
  $w.WindowState = 1
  $d.ActiveWindow.View.Zoom.Percentage = $zoom
  $d.ActiveWindow.DisplayRulers = $false
  $d.ShowSpellingErrors = $false; $d.ShowGrammaticalErrors = $false
  Start-Sleep -Seconds 2
  $h = (Get-Process WINWORD | Where-Object { $_.MainWindowTitle -like '*take-*' } | Select-Object -First 1).MainWindowHandle
  Focus-Window $h
  @($w, $d, $h)
}
function Title($proc) { (Get-Process $proc | Where-Object MainWindowTitle | Select-Object -First 1).MainWindowTitle }

Move-To 960 820 200
switch ($shot) {
  'probe' { $w, $d, $h = Open-Word; ffmpeg -loglevel error -y -f gdigrab -i desktop -frames:v 1 $env:PROBE_OUT; Start-Sleep 1 }
  'C' {
    $w, $d, $h = Open-Word
    $rec = Start-Rec '' "$raw\C-smartart.mp4" 19
    Start-Sleep -Milliseconds 1200
    Click 1107 570 900; Start-Sleep -Milliseconds 600            # select the SmartArt
    Click 815 63 800; Start-Sleep -Milliseconds 700              # "Conception de SmartArt" tab
    Click 874 120 700; Start-Sleep -Milliseconds 800             # "Modifier les couleurs"
    Move-To 950 405 600; Start-Sleep -Milliseconds 900           # live preview: accent 1
    Move-To 950 500 500; Start-Sleep -Milliseconds 900           # accent 2
    Click 1094 310 600; Start-Sleep -Milliseconds 1000           # pick a "Coloré" palette
    Move-To 1378 120 700; Start-Sleep -Milliseconds 800          # SmartArt styles, live preview
    Click 1600 120 700; Start-Sleep -Milliseconds 800            # a 3D style
    Click 1500 860 800; Start-Sleep -Milliseconds 1800           # click away (page margin): the restyled cycle
  }
  'A' {
    $w, $d, $h = Open-Word
    $rec = Start-Rec (Title 'WINWORD') "$raw\A-douleur.mp4" 9
    Start-Sleep -Milliseconds 1200
    Click 741 482 900; Start-Sleep -Milliseconds 900          # the whole picture gets selected
    Move-To 741 482 100; DoubleClick; Start-Sleep -Milliseconds 1500   # picture tools, no text cursor
    Move-To 760 486 300; DoubleClick; Start-Sleep -Milliseconds 1500
  }
  'B' {
    $w, $d, $h = Open-Word
    $rec = Start-Rec '' "$raw\B-formes.mp4" 16
    Start-Sleep -Milliseconds 1200
    Click 802 650 900; Start-Sleep -Milliseconds 500             # select the decision diamond
    Move-To 802 650 100; DoubleClick; Start-Sleep -Milliseconds 600 # select the word "Relecture"
    Type-Text 'Revue sécurité'; Start-Sleep -Milliseconds 800
    Key '{ESC}'; Key '{ESC}'; Start-Sleep -Milliseconds 500
    Click 959 785 900; Start-Sleep -Milliseconds 400             # grab "Deck PowerPoint" by its right edge, between handles
    Drag 959 785 1150 785 1800; Start-Sleep -Milliseconds 900    # its two connectors follow
    Move-To 1250 600 700; Start-Sleep -Milliseconds 800
  }
}
if ($rec) { $rec.WaitForExit() }
Start-Sleep -Milliseconds 300
if ($d) { $d.Close([ref]0) ; $w.Quit() }
"recorded $shot"
