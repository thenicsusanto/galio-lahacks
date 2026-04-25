###############################################################################
# setup.ps1
# One-time setup: downloads MediaMTX and FFmpeg portable binaries into ./bin/
# Run once before using stream.ps1
###############################################################################

$ErrorActionPreference = "Stop"
$BinDir = Join-Path $PSScriptRoot "bin"
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

# ── MediaMTX ─────────────────────────────────────────────────────────────────
$MtxExe = Join-Path $BinDir "mediamtx.exe"
if (-not (Test-Path $MtxExe)) {
    Write-Host "[setup] Downloading MediaMTX..." -ForegroundColor Cyan
    $MtxVersion = "v1.9.3"
    $MtxUrl = "https://github.com/bluenviron/mediamtx/releases/download/$MtxVersion/mediamtx_${MtxVersion}_windows_amd64.zip"
    $MtxZip = Join-Path $BinDir "mediamtx.zip"
    Invoke-WebRequest -Uri $MtxUrl -OutFile $MtxZip -UseBasicParsing
    Expand-Archive -Path $MtxZip -DestinationPath $BinDir -Force
    Remove-Item $MtxZip
    # The zip contains mediamtx.exe at root level
    Write-Host "[setup] MediaMTX downloaded: $MtxExe" -ForegroundColor Green
} else {
    Write-Host "[setup] MediaMTX already present." -ForegroundColor Green
}

# ── FFmpeg ────────────────────────────────────────────────────────────────────
$FfmpegExe = Join-Path $BinDir "ffmpeg.exe"
if (-not (Test-Path $FfmpegExe)) {
    Write-Host "[setup] Downloading FFmpeg (this is ~90 MB, please wait)..." -ForegroundColor Cyan
    # Using the official gyan.dev build (most widely used Windows FFmpeg build)
    $FfUrl = "https://github.com/BtbN/ffmpeg-builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
    $FfZip = Join-Path $BinDir "ffmpeg.zip"
    Invoke-WebRequest -Uri $FfUrl -OutFile $FfZip -UseBasicParsing
    Write-Host "[setup] Extracting FFmpeg..."
    Expand-Archive -Path $FfZip -DestinationPath $BinDir -Force
    Remove-Item $FfZip
    # The zip extracts to a versioned folder — find ffmpeg.exe inside bin/
    $FfFound = Get-ChildItem -Path $BinDir -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
    if ($FfFound) {
        Copy-Item $FfFound.FullName $FfmpegExe
        # Clean up the extracted folder (keep only the exe)
        Get-ChildItem $BinDir -Directory | Remove-Item -Recurse -Force
        Write-Host "[setup] FFmpeg downloaded: $FfmpegExe" -ForegroundColor Green
    } else {
        Write-Error "[setup] Could not find ffmpeg.exe after extraction."
    }
} else {
    Write-Host "[setup] FFmpeg already present." -ForegroundColor Green
}

Write-Host ""
Write-Host "Setup complete! Run .\stream.ps1 to start streaming." -ForegroundColor Yellow
