# Automated takes of the showcase video, in the real Word / PowerPoint, with the real mouse cursor.
# Each take opens a fresh copy of the demo file, records the app window with ffmpeg and plays the
# gestures. Coordinates are for a 1920x1080 screen with Word maximized at 100 % zoom.
# Usage: powershell -File shoot.ps1 -shot B
param([Parameter(Mandatory)][ValidateSet('A', 'B', 'C', 'D', 'E', 'probeE', 'probe')][string]$shot, [int]$zoom = 100)
. "$PSScriptRoot\mouse.ps1"
$ErrorActionPreference = 'Stop'
$raw = Join-Path $PSScriptRoot 'raw'; New-Item -ItemType Directory -Force $raw | Out-Null
$src = @{ A = 'douleur.docx'; B = 'formes.docx'; C = 'smartart.docx'; D = 'formes.pptx'; probe = $env:PROBE_FILE }[$shot]
if ($src) {
  $take = Join-Path $env:TEMP ("take-" + $src)
  Copy-Item (Join-Path $PSScriptRoot "out\$src") $take -Force
}

# The conversion take: a separate VS Code window on a throwaway demo folder (under raw/, not versioned,
# inside the trusted repo so the extension runs), with its own settings: SmartArt off (the flowchart
# stays shapes), a large editor font for the video. The maintainer's own settings are never touched.
# A throwaway VS Code profile (raw/vscode-profile, not versioned): only this extension and the French
# language pack, copied from the maintainer's install, and the cached Pandoc copied too (no download).
# The maintainer's own profile, chat panel and remembered layout never get into the take.
function Initialize-VSCodeProfile {
  $prof = Join-Path $raw 'vscode-profile'; $ext = Join-Path $prof 'ext'; $data = Join-Path $prof 'data'
  $userExt = Join-Path $env:USERPROFILE '.vscode\extensions'
  foreach ($pat in 'md2nativedocx.md2nativedocx-*', 'ms-ceintl.vscode-language-pack-fr-*') {
    $srcExt = Get-ChildItem $userExt -Directory -Filter $pat | Sort-Object Name | Select-Object -Last 1
    if (-not (Test-Path (Join-Path $ext $srcExt.Name))) { New-Item -ItemType Directory -Force $ext | Out-Null; Copy-Item -Recurse $srcExt.FullName $ext }
  }
  $store = Join-Path $data 'User\globalStorage\md2nativedocx.md2nativedocx'
  if (-not (Test-Path (Join-Path $store 'pandoc'))) {
    New-Item -ItemType Directory -Force $store | Out-Null
    Copy-Item -Recurse (Join-Path $env:APPDATA 'Code\User\globalStorage\md2nativedocx.md2nativedocx\pandoc') $store
  }
  $user = Join-Path $data 'User'
  # The language pack registry is written at install time; reuse the maintainer's (read-only paths).
  Copy-Item (Join-Path $env:APPDATA 'Code\languagepacks.json') $data -Force
  [IO.File]::WriteAllText((Join-Path $user 'settings.json'), '{ "security.workspace.trust.enabled": false,' +
    ' "workbench.startupEditor": "none", "workbench.secondarySideBar.defaultVisibility": "hidden",' +
    ' "chat.disableAIFeatures": true, "workbench.tips.enabled": false, "update.mode": "none",' +
    ' "extensions.autoUpdate": false, "extensions.autoCheckUpdates": false, "telemetry.telemetryLevel": "off",' +
    ' "window.restoreWindows": "none", "window.newWindowDimensions": "maximized", "window.commandCenter": false,' +
    ' "workbench.layoutControl.enabled": false, "git.enabled": false, "workbench.colorTheme": "Default Dark Modern" }')
  # Deterministic layout: these keys run the close commands (Ctrl+B would toggle a remembered state;
  # Alt+F9/F10 belong to the NVIDIA overlay).
  [IO.File]::WriteAllText((Join-Path $user 'keybindings.json'), '[ { "key": "ctrl+alt+shift+8", "command": "workbench.action.closeSidebar" },' +
    ' { "key": "ctrl+alt+shift+9", "command": "workbench.action.closeAuxiliaryBar" }, { "key": "ctrl+alt+shift+0", "command": "workbench.action.closePanel" } ]')
  @($data, $ext)
}
function Hide-SideBars { Start-Sleep -Seconds 2; foreach ($k in '^%+8', '^%+9', '^%+0') { Key $k; Start-Sleep -Milliseconds 400 } }
function Open-VSCodeDemo {
  $demo = Join-Path $raw 'demo'
  # Empty it rather than delete it: a closed VS Code window can keep a handle on the folder a little while.
  if (Test-Path $demo) { Get-ChildItem $demo -File -Recurse | Remove-Item -Force }
  New-Item -ItemType Directory -Force (Join-Path $demo '.vscode') | Out-Null
  Copy-Item (Join-Path $PSScriptRoot 'formes.md') (Join-Path $demo 'formes.md')
  $settings = '{ "md2nativedocx.smartArt.enabled": false, "md2nativedocx.layout.orientation": "landscape", "editor.fontSize": 26, "editor.lineHeight": 40,' +
    ' "editor.minimap.enabled": false, "breadcrumbs.enabled": false, "editor.stickyScroll.enabled": false,' +
    ' "workbench.editor.enablePreview": false, "editor.guides.indentation": false }'
  [IO.File]::WriteAllText((Join-Path $demo '.vscode\settings.json'), $settings)
  $data, $ext = Initialize-VSCodeProfile
  & code --user-data-dir $data --extensions-dir $ext --locale fr -n $demo (Join-Path $demo 'formes.md') | Out-Null
  $h = Find-Window 'formes.md - demo'
  Start-Sleep -Seconds 3
  Focus-Window $h
  Start-Sleep -Seconds 1
  @($demo, $h)
}

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
function Open-PowerPoint {
  $p = New-Object -ComObject PowerPoint.Application
  $p.Visible = -1
  $pr = $p.Presentations.Open($take)
  $p.WindowState = 3
  Start-Sleep -Seconds 3
  $h = (Get-Process POWERPNT | Where-Object { $_.MainWindowTitle -like '*take-*' } | Select-Object -First 1).MainWindowHandle
  Focus-Window $h
  @($p, $pr, $h)
}
function Title($proc) { (Get-Process $proc | Where-Object MainWindowTitle | Select-Object -First 1).MainWindowTitle }

Move-To 960 820 200
switch ($shot) {
  'E' {
    if (Get-Process WINWORD -ErrorAction SilentlyContinue) { throw 'Close Word first: the take opens the exported file in it.' }
    $demo, $h = Open-VSCodeDemo
    Hide-SideBars
    Move-To 700 560 300
    $rec = Start-Rec '' "$raw\E-export.mp4" 24
    Start-Sleep -Milliseconds 1200
    Move-To 520 420 900; Start-Sleep -Milliseconds 500           # the eye follows the Mermaid source
    Click 260 82 900                                             # CodeLens "Exporter en Word"
    $btn = Find-ToastButton 12000                                # toast "Exporté : formes.docx"
    if (-not $btn) { throw 'No export toast.' }
    Start-Sleep -Milliseconds 700
    Click $btn[0] $btn[1] 900                                    # "Ouvrir dans Word"
    $wh = Find-Window ' - Word' 12000
    [In]::ShowWindow($wh, 3) | Out-Null
    $rec.WaitForExit(); $rec = $null
    $w = [Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application')
    foreach ($doc in @($w.Documents)) { if ($doc.FullName -like '*\demo\formes.docx') { $doc.Close([ref]0) } }
    if ($w.Documents.Count -eq 0) { $w.Quit() }
    Close-Window $h
  }
  'probeE' {
    $demo, $h = Open-VSCodeDemo
    Hide-SideBars
    ffmpeg -loglevel error -y -f gdigrab -i desktop -frames:v 1 "$env:PROBE_OUT-1.png"
    Click 524 87 700; Start-Sleep -Seconds 4
    ffmpeg -loglevel error -y -f gdigrab -i desktop -frames:v 1 "$env:PROBE_OUT-2.png"
    Start-Sleep -Seconds 6
    ffmpeg -loglevel error -y -f gdigrab -i desktop -frames:v 1 "$env:PROBE_OUT-3.png"
    Close-Window $h
  }
  'probe' { if ($src -like '*.pptx') { $p, $pr, $h = Open-PowerPoint } else { $w, $d, $h = Open-Word }; ffmpeg -loglevel error -y -f gdigrab -i desktop -frames:v 1 $env:PROBE_OUT; Start-Sleep 1 }
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
  'D' {
    $p, $pr, $h = Open-PowerPoint
    $rec = Start-Rec '' "$raw\D-pptx.mp4" 11
    Start-Sleep -Milliseconds 1200
    Click 760 553 900; Start-Sleep -Milliseconds 400             # select the "Pare-feu" diamond
    Click 795 553 200; Start-Sleep -Milliseconds 300             # text cursor in its label
    Key '{END}'; Type-Text ' WAF'; Start-Sleep -Milliseconds 800
    Key '{ESC}'; Key '{ESC}'; Start-Sleep -Milliseconds 400
    Click 700 860 800; Start-Sleep -Milliseconds 1500
  }
  'A' {
    $w, $d, $h = Open-Word
    $rec = Start-Rec '' "$raw\A-douleur.mp4" 10
    Start-Sleep -Milliseconds 1200
    Click 589 523 900; Start-Sleep -Milliseconds 1000            # click "Pare-feu": the whole picture is selected
    Move-To 589 523 100; DoubleClick; Start-Sleep -Milliseconds 1500  # picture format tab, no text cursor
    Click 878 456 700; Start-Sleep -Milliseconds 300              # try "Journal sécurité": same picture
    Move-To 878 456 100; DoubleClick; Start-Sleep -Milliseconds 2000
  }
  'B' {
    $w, $d, $h = Open-Word
    $rec = Start-Rec '' "$raw\B-formes.mp4" 14
    Start-Sleep -Milliseconds 1200
    Click 609 507 900; Start-Sleep -Milliseconds 400             # select the "Pare-feu" diamond
    Click 640 507 200; Start-Sleep -Milliseconds 300             # text cursor in its label
    Key '{END}'; Type-Text ' WAF'; Start-Sleep -Milliseconds 700
    Key '{ESC}'; Key '{ESC}'; Start-Sleep -Milliseconds 500
    Click 998 410 900; Start-Sleep -Milliseconds 400             # grab "Journal sécurité" by its right edge, between handles
    Drag 998 410 720 650 1700; Start-Sleep -Milliseconds 900     # under the firewall (the drawing frame stops it at the top): its connector follows
    Move-To 1250 860 700; Start-Sleep -Milliseconds 800
  }
}
if ($rec) { $rec.WaitForExit() }
Start-Sleep -Milliseconds 300
if ($d) { $d.Close([ref]0) ; $w.Quit() }
if ($pr) { $pr.Saved = -1; $pr.Close(); $p.Quit() }
"recorded $shot"
