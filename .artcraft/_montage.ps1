Add-Type -AssemblyName System.Drawing
$dir = "D:\CRAFT\work\reference\ref5\shots"
$files = Get-ChildItem "$dir\shot*.jpg" | Sort-Object Name
$cols = 6
$cellW = 250
$cellH = 444
$rows = [math]::Ceiling($files.Count / $cols)
$sheet = New-Object System.Drawing.Bitmap ($cols * $cellW), ($rows * $cellH)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.Clear([System.Drawing.Color]::FromArgb(24, 24, 24))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$font = New-Object System.Drawing.Font("Consolas", 13, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.Brushes]::Yellow
$i = 0
foreach ($f in $files) {
    $img = [System.Drawing.Image]::FromFile($f.FullName)
    $c = $i % $cols
    $r = [math]::Floor($i / $cols)
    $g.DrawImage($img, $c * $cellW, $r * $cellH, $cellW, $cellH)
    $g.DrawString(($i + 1).ToString("00"), $font, $brush, ($c * $cellW + 6), ($r * $cellH + 4))
    $img.Dispose()
    $i++
}
$g.Dispose()
$out = "D:\CRAFT\work\reference\ref5\shots-sheet.png"
$sheet.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose()
Get-Item $out | Select-Object Name, @{n = 'KB'; e = { [math]::Round($_.Length / 1KB) } } | Format-Table -AutoSize
