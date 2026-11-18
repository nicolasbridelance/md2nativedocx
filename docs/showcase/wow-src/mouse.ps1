# Human-looking mouse and keyboard helpers for the automated takes (dot-source this file).
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class In {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
  public struct POINT { public int X; public int Y; }
}
'@
[In]::SetProcessDPIAware() | Out-Null

function Get-Pos { $p = New-Object In+POINT; [In]::GetCursorPos([ref]$p) | Out-Null; $p }

# Ease-in-out glide from the current position to (x, y) over $ms milliseconds.
function Move-To([int]$x, [int]$y, [int]$ms = 700) {
  $p = Get-Pos; $steps = [Math]::Max(10, [int]($ms / 12))
  for ($i = 1; $i -le $steps; $i++) {
    $t = $i / $steps; $e = $t * $t * (3 - 2 * $t)
    [In]::SetCursorPos([int]($p.X + ($x - $p.X) * $e), [int]($p.Y + ($y - $p.Y) * $e)) | Out-Null
    Start-Sleep -Milliseconds 12
  }
}
function Down { [In]::mouse_event(0x2, 0, 0, 0, [UIntPtr]::Zero) }
function Up { [In]::mouse_event(0x4, 0, 0, 0, [UIntPtr]::Zero) }
function Click([int]$x, [int]$y, [int]$ms = 700) { Move-To $x $y $ms; Start-Sleep -Milliseconds 150; Down; Start-Sleep -Milliseconds 60; Up }
function DoubleClick { Down; Start-Sleep -Milliseconds 40; Up; Start-Sleep -Milliseconds 70; Down; Start-Sleep -Milliseconds 40; Up }
function Drag([int]$x1, [int]$y1, [int]$x2, [int]$y2, [int]$ms = 1400) {
  Move-To $x1 $y1 600; Start-Sleep -Milliseconds 200; Down; Start-Sleep -Milliseconds 250
  Move-To $x2 $y2 $ms; Start-Sleep -Milliseconds 250; Up
}
# Type like a person: one character at a time, irregular rhythm.
function Type-Text([string]$s) {
  $r = New-Object Random 7
  foreach ($c in $s.ToCharArray()) {
    $k = [string]$c; if ('+^%~(){}[]'.Contains($k)) { $k = '{' + $k + '}' }
    [System.Windows.Forms.SendKeys]::SendWait($k); Start-Sleep -Milliseconds (70 + $r.Next(0, 90))
  }
}
function Key([string]$k) { [System.Windows.Forms.SendKeys]::SendWait($k) }

# Record the screen area of the maximized Office window (taskbar excluded) with ffmpeg in the
# background; returns the process. Window capture ("title=") gives blank frames: Office draws on the GPU.
function Start-Rec([string]$title, [string]$out, [int]$secs) {
  $args = @('-loglevel', 'error', '-y', '-f', 'gdigrab', '-framerate', '30', '-draw_mouse', '1', '-t', "$secs",
    '-offset_x', '0', '-offset_y', '0', '-video_size', '1920x1032', '-i', 'desktop', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', $out)
  Start-Process ffmpeg -ArgumentList $args -NoNewWindow -PassThru
}

# Bring the window to the front (the Alt tap lifts Windows' foreground lock) and check it worked.
function Focus-Window([IntPtr]$h) {
  for ($i = 0; $i -lt 5; $i++) {
    [In]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [In]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    [In]::ShowWindow($h, 3) | Out-Null; [In]::SetForegroundWindow($h) | Out-Null
    for ($j = 0; $j -lt 10; $j++) {             # Electron (VS Code) can take a couple of seconds
      Start-Sleep -Milliseconds 300
      if ([In]::GetForegroundWindow() -eq $h) { return }
    }
  }
  throw "Could not bring the window to the front; take aborted."
}

# Find a top-level window whose title contains $part (UI Automation; works across Electron windows
# that share one process, unlike Get-Process MainWindowHandle).
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
function Find-Window([string]$part, [int]$timeoutMs = 20000) {
  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.ElapsedMilliseconds -lt $timeoutMs) {
    foreach ($w in $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
      if ($w.Current.Name -like "*$part*") { return [IntPtr]$w.Current.NativeWindowHandle }
    }
    Start-Sleep -Milliseconds 300
  }
  throw "No window titled *$part* appeared."
}
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Win2 { [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l); }
'@
# VS Code ignores a posted WM_CLOSE: bring the window up and press Alt+F4 instead.
function Close-Window([IntPtr]$h) { Focus-Window $h; Key '%{F4}'; Start-Sleep -Seconds 1 }

# Click a control found by its accessible name inside a window (positions of toasts and buttons vary);
# polls until it shows up. Returns $false if it never does.
function Click-ByName([IntPtr]$h, [string[]]$names, [int]$timeoutMs = 8000, [int]$ms = 800) {
  $win = [System.Windows.Automation.AutomationElement]::FromHandle($h)
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.ElapsedMilliseconds -lt $timeoutMs) {
    foreach ($n in $names) {
      $c = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $n)
      $e = $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $c)
      if ($e) { $r = $e.Current.BoundingRectangle; Click ([int]($r.X + $r.Width / 2)) ([int]($r.Y + $r.Height / 2)) $ms; return $true }
    }
    Start-Sleep -Milliseconds 250
  }
  $false
}

# Wait for a VS Code notification toast and return the centre of its primary (blue, #0078D4) button,
# found in a screen capture of the bottom-right corner; $null if none shows up in time.
Add-Type -AssemblyName System.Drawing
function Find-ToastButton([int]$timeoutMs = 10000) {
  $x0 = 1300; $y0 = 700; $w = 620; $h = 330
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.ElapsedMilliseconds -lt $timeoutMs) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($x0, $y0, 0, 0, $bmp.Size); $g.Dispose()
    $minX = 9999; $maxX = -1; $minY = 9999; $maxY = -1
    for ($y = 0; $y -lt $h; $y += 2) { for ($x = 0; $x -lt $w; $x += 2) {
      $c = $bmp.GetPixel($x, $y)
      if ($c.R -lt 15 -and [Math]::Abs($c.G - 120) -lt 12 -and [Math]::Abs($c.B - 212) -lt 12) {
        if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }; if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
      } } }
    $bmp.Dispose()
    if ($maxX -gt $minX + 40) { return @([int]($x0 + ($minX + $maxX) / 2), [int]($y0 + ($minY + $maxY) / 2)) }
    Start-Sleep -Milliseconds 200
  }
  $null
}
