# Render each page of a .docx to PNG with the real Word (invisible), for the carousel and checks.
param([Parameter(Mandatory)]$docx, [Parameter(Mandatory)]$outdir, [string]$prefix = "page")
Add-Type -AssemblyName System.Drawing
$w = New-Object -ComObject Word.Application; $w.Visible = $false
$d = $w.Documents.Open($docx, $false, $true)
$pages = $d.ActiveWindow.Panes.Item(1).Pages
for ($i = 1; $i -le $pages.Count; $i++) {
  $bits = $pages.Item($i).EnhMetaFileBits
  $ms = New-Object System.IO.MemoryStream(,$bits)
  $mf = New-Object System.Drawing.Imaging.Metafile($ms)
  # Long side 3300 px, short side from the page's own aspect (portrait or landscape).
  if ($mf.Width -ge $mf.Height) { $bw = 3300; $bh = [int](3300 * $mf.Height / $mf.Width) } else { $bh = 3300; $bw = [int](3300 * $mf.Width / $mf.Height) }
  $bmp = New-Object System.Drawing.Bitmap($bw, $bh)
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.Clear([System.Drawing.Color]::White)
  $g.DrawImage($mf, 0, 0, $bw, $bh); $bmp.Save("$outdir\$prefix$i.png")
}
$d.Close($false); $w.Quit()
