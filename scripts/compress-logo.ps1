Add-Type -AssemblyName System.Drawing

$sourcePath = "E:\Web Projects\PFT\government-of-punjab-seeklogo.png"
$publicDir = "E:\Web Projects\PFT\apps\web\public"
if (!(Test-Path $publicDir)) {
    New-Item -ItemType Directory -Path $publicDir -Force | Out-Null
}

$destPath = Join-Path $publicDir "punjab-logo.png"
$destPathOrig = Join-Path $publicDir "government-of-punjab-seeklogo.png"

# Copy original to public as well
Copy-Item $sourcePath $destPathOrig -Force

# Load source
$src = [System.Drawing.Image]::FromFile($sourcePath)

# 400px width produces razor-sharp rendering at 15-25mm on 300dpi PDF and retina screens
$targetW = 400
$targetH = [int]($src.Height * ($targetW / $src.Width))

$bmp = New-Object System.Drawing.Bitmap($targetW, $targetH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

$g.DrawImage($src, 0, 0, $targetW, $targetH)

$bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()
$src.Dispose()

$fileInfo = Get-Item $destPath
Write-Output "Resized and compressed logo created at: $destPath ($($fileInfo.Length) bytes, ${targetW}x${targetH})"
