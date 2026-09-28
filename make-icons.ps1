# Φτιάχνει τα εικονίδια του app (icons/icon-192.png, icons/icon-512.png).
Add-Type -AssemblyName System.Drawing
$dir = Join-Path $PSScriptRoot 'icons'
New-Item -ItemType Directory -Force $dir | Out-Null
foreach ($size in 192, 512) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'AntiAliasGridFit'
    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(11, 85, 99)), ([System.Drawing.Color]::FromArgb(38, 166, 154)), 45
    $g.FillRectangle($bg, $rect)
    $shine = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(30, 255, 255, 255))
    $g.FillRectangle($shine, 0, 0, $size, [int]($size / 2))
    $gold = [System.Drawing.Color]::White
    $font = New-Object System.Drawing.Font 'Segoe UI', ($size * 0.42), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = 'Center'
    $fmt.LineAlignment = 'Center'
    $brush = New-Object System.Drawing.SolidBrush $gold
    $g.DrawString([string][char]0x20AC, $font, $brush, (New-Object System.Drawing.RectangleF 0, ($size * 0.02), $size, $size), $fmt)
    $bmp.Save((Join-Path $dir "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}
