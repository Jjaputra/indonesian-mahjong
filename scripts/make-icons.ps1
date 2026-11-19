# Draws the app icons (the 金 tile from the header) into public/icons. Run: pwsh scripts/make-icons.ps1
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\public\icons'
New-Item -ItemType Directory -Force $out | Out-Null

function Hex($h) { [System.Drawing.ColorTranslator]::FromHtml($h) }

# $tileH = tile height as a share of the canvas (maskable icons keep to the central safe zone).
function Draw-Icon([int]$size, [double]$tileH, [string]$name) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.Clear((Hex '#f3f0e8'))
  $h = $size * $tileH; $w = $h * 0.76
  $x = ($size - $w) / 2; $y = ($size - $h) / 2
  $r = $h * 0.14
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  function Round($px, $py, $pw, $ph, $pr) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $pr * 2
    $p.AddArc($px, $py, $d, $d, 180, 90); $p.AddArc($px + $pw - $d, $py, $d, $d, 270, 90)
    $p.AddArc($px + $pw - $d, $py + $ph - $d, $d, $d, 0, 90); $p.AddArc($px, $py + $ph - $d, $d, $d, 90, 90)
    $p.CloseFigure(); return $p
  }
  $lift = $h * 0.05
  $g.FillPath((New-Object System.Drawing.SolidBrush (Hex '#bdb197')), (Round $x ($y + $lift) $w $h $r))
  $g.FillPath((New-Object System.Drawing.SolidBrush (Hex '#fffdf6')), (Round $x $y $w $h $r))
  $g.DrawPath((New-Object System.Drawing.Pen (Hex '#d4cab3'), ([single]($h * 0.012))), (Round $x $y $w $h $r))
  $font = New-Object System.Drawing.Font 'Microsoft YaHei', ([single]($h * 0.52)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
  $g.DrawString([string][char]0x91D1, $font, (New-Object System.Drawing.SolidBrush (Hex '#5b3a8c')), (New-Object System.Drawing.RectangleF $x, ($y + $h * 0.03), $w, $h), $fmt)
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Draw-Icon 192 0.72 'icon-192.png'
Draw-Icon 512 0.72 'icon-512.png'
Draw-Icon 512 0.56 'icon-maskable-512.png'
Draw-Icon 180 0.72 'apple-touch-icon.png'
