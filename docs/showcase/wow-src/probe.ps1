# Open a demo document in the real Word, maximized, and print the screen rectangle of every shape.
param([string]$doc, [int]$zoom = 150)
Add-Type @'
using System.Runtime.InteropServices;
public static class Dpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
'@
[Dpi]::SetProcessDPIAware() | Out-Null
$w = New-Object -ComObject Word.Application
$w.Visible = $true
$d = $w.Documents.Open($doc)
$w.WindowState = 1
$win = $d.ActiveWindow
$win.View.Zoom.Percentage = $zoom
$win.DisplayRulers = $false
Start-Sleep -Milliseconds 800
function Rect($obj) {
  $l = 0; $t = 0; $wd = 0; $h = 0
  try { $win.GetPoint([ref]$l, [ref]$t, [ref]$wd, [ref]$h, $obj); "{0},{1},{2},{3}" -f $l, $t, $wd, $h } catch { "n/a: $($_.Exception.Message)" }
}
"shapes: $($d.Shapes.Count), inline: $($d.InlineShapes.Count)"
foreach ($s in $d.Shapes) {
  "shape '$($s.Name)' type=$($s.Type) -> $(Rect $s)"
  if ($s.Type -eq 20) { foreach ($c in $s.CanvasItems) { $txt = ''; try { $txt = $c.TextFrame.TextRange.Text.Trim() } catch {}; "  item '$($c.Name)' type=$($c.Type) conn=$($c.Connector) text='$txt' -> $(Rect $c)" } }
  if ($s.GroupItems) { foreach ($c in $s.GroupItems) { $txt = ''; try { $txt = $c.TextFrame.TextRange.Text.Trim() } catch {}; "  g '$($c.Name)' text='$txt' -> $(Rect $c)" } }
}
foreach ($s in $d.InlineShapes) { "inline type=$($s.Type) hasSmartArt=$($s.HasSmartArt) -> $(Rect $s.Range)" }
