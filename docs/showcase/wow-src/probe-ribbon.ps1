# Open smartart.docx, select the SmartArt, open its Design tab and list the ribbon controls we need
# (name + screen rectangle) through UI Automation; screenshots go to $env:PROBE_OUT_DIR.
. "$PSScriptRoot\mouse.ps1"
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$take = Join-Path $env:TEMP 'take-smartart.docx'
Copy-Item (Join-Path $PSScriptRoot 'out\smartart.docx') $take -Force
$w = New-Object -ComObject Word.Application; $w.Visible = $true
$d = $w.Documents.Open($take); $w.WindowState = 1
$d.ActiveWindow.View.Zoom.Percentage = 100; $d.ShowSpellingErrors = $false
Start-Sleep 2
$h = (Get-Process WINWORD | Where-Object { $_.MainWindowTitle -like '*take-*' } | Select-Object -First 1).MainWindowHandle
Focus-Window $h
Click 1107 570 400; Start-Sleep 1
$root = [Windows.Automation.AutomationElement]::FromHandle($h)
function Find([string]$pattern) {
  $all = $root.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
  foreach ($e in $all) { $n = $e.Current.Name; if ($n -match $pattern) { $r = $e.Current.BoundingRectangle; "{0} | {1} | {2:0},{3:0},{4:0},{5:0}" -f $n, $e.Current.ControlType.ProgrammaticName, $r.X, $r.Y, $r.Width, $r.Height } }
}
Find 'SmartArt|couleurs|Styles'
$tab = $root.FindFirst([Windows.Automation.TreeScope]::Descendants, (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::NameProperty, 'Conception de SmartArt')))
if ($tab) { $r = $tab.Current.BoundingRectangle; Click ([int]($r.X + $r.Width / 2)) ([int]($r.Y + $r.Height / 2)) 400; Start-Sleep 1 }
"--- after opening the tab"
Find 'couleurs|Styles SmartArt|Couleur|Disposition|3D|Rétablir'
Click 874 120 400; Start-Sleep 1.5
ffmpeg -loglevel error -y -f gdigrab -i desktop -frames:v 1 "$env:PROBE_OUT_DIR\colors.png"
Key '{ESC}'; Start-Sleep 0.5
$d.Close([ref]0); $w.Quit()
