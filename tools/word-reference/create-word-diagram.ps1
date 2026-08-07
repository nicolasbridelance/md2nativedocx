# Create a Word document with a real shape group via Office automation (COM).
# This generates a reference .docx with a genuine `wpg:wgp` / `wps:wsp` structure
# produced by Word itself, for comparison with our translator output.
#
# Requires: Windows with Microsoft Word installed.
# Usage: powershell -File tools/word-reference/create-word-diagram.ps1 -OutputPath C:\Temp\word-group.docx

param([string]$OutputPath = "$PWD\word-group.docx")

$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
    $doc = $word.Documents.Add()

    # Insert a paragraph for context.
    $para = $doc.Paragraphs.Add()
    $para.Range.Text = "Test diagram`r`n"

    # Create a canvas (drawing surface) in the document.
    $canvas = $doc.Shapes.AddCanvas(100, 100, 300, 200)

    # Add two rectangles and a connector inside the canvas.
    $rect1 = $canvas.CanvasItems.AddShape(1, 10, 10, 120, 60)  # msoShapeRectangle
    $rect1.TextFrame.TextRange.Text = "A"
    $rect1.Fill.ForeColor.RGB = 13998909  # light blue
    $rect1.Line.ForeColor.RGB = 3100462   # dark blue

    $rect2 = $canvas.CanvasItems.AddShape(1, 10, 100, 120, 60)
    $rect2.TextFrame.TextRange.Text = "B"
    $rect2.Fill.ForeColor.RGB = 13998909
    $rect2.Line.ForeColor.RGB = 3100462

    $conn = $canvas.CanvasItems.AddConnector(1, 70, 70, 70, 100)  # msoConnectorStraight
    # BeginConnect/EndConnect require [ref] arguments for the shape and site index.
    $conn.ConnectorFormat.BeginConnect([ref]$rect1, [ref]3)
    $conn.ConnectorFormat.EndConnect([ref]$rect2, [ref]1)
    $conn.Line.ForeColor.RGB = 3100462

    # Group the three canvas items.
    $canvas.CanvasItems.Range(1).Group()  # group all items

    $doc.SaveAs([ref]$OutputPath, [ref]16)  # wdFormatDocumentDefault (.docx)
    Write-Host "Created: $OutputPath"
} finally {
    $word.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
}
