# Draws the app icons and favicon (the cream flower tile from the maciokYU! logo on black) into public/icons. Run: pwsh scripts/make-icons.ps1
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\public\icons'
New-Item -ItemType Directory -Force $out | Out-Null

function Hex($h) { [System.Drawing.ColorTranslator]::FromHtml($h) }
function Brush($h) { New-Object System.Drawing.SolidBrush (Hex $h) }

function Round($px, $py, $pw, $ph, $pr) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $pr * 2
  $p.AddArc($px, $py, $d, $d, 180, 90); $p.AddArc($px + $pw - $d, $py, $d, $d, 270, 90)
  $p.AddArc($px + $pw - $d, $py + $ph - $d, $d, $d, 0, 90); $p.AddArc($px, $py + $ph - $d, $d, $d, 90, 90)
  $p.CloseFigure(); return $p
}

# Four-petal flower: dark red petals, cream inner petals, red centre. $c = centre, $u = tile height.
function Draw-Flower($g, [double]$cx, [double]$cy, [double]$u) {
  $red = Brush '#8a1216'; $cream = Brush '#f8e4c6'
  $g.TranslateTransform([single]$cx, [single]$cy)
  $g.RotateTransform(45)
  foreach ($a in 0, 90, 180, 270) {
    $g.RotateTransform($a)
    $g.FillEllipse($red, [single](-$u * 0.02), [single](-$u * 0.125), [single]($u * 0.32), [single]($u * 0.25))
    $g.RotateTransform(-$a)
  }
  foreach ($a in 0, 90, 180, 270) {
    $g.RotateTransform($a)
    $g.FillEllipse($cream, [single]($u * 0.06), [single](-$u * 0.065), [single]($u * 0.17), [single]($u * 0.13))
    $g.RotateTransform(-$a)
  }
  $g.FillEllipse($red, [single](-$u * 0.035), [single](-$u * 0.035), [single]($u * 0.07), [single]($u * 0.07))
  $g.ResetTransform()
}

# $tileH = tile height as a share of the canvas (maskable icons keep to the central safe zone).
function Draw-Icon([int]$size, [double]$tileH, [string]$name) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear((Hex '#0d0d0d'))
  $h = $size * $tileH; $w = $h * 0.9
  $x = ($size - $w) / 2; $y = ($size - $h) / 2 - $h * 0.03
  $r = $h * 0.16
  $lift = $h * 0.07
  $g.FillPath((Brush '#d9bd93'), (Round $x ($y + $lift) $w $h $r))
  $g.FillPath((Brush '#f8e4c6'), (Round $x $y $w $h $r))
  Draw-Flower $g ($x + $w / 2) ($y + $h / 2) $h
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Draw-Icon 192 0.72 'icon-192.png'
Draw-Icon 512 0.72 'icon-512.png'
Draw-Icon 512 0.56 'icon-maskable-512.png'
Draw-Icon 180 0.72 'apple-touch-icon.png'
Draw-Icon 32 0.86 'favicon-32.png'
