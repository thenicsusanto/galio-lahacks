###############################################################################
# stream.ps1
# Starts the webcam RTSP stream.
#
# What it does:
#   1. Lists available webcam devices (DirectShow)
#   2. Starts MediaMTX as the RTSP server (background)
#   3. Starts FFmpeg to push your webcam → MediaMTX as H.264 RTSP
#
# Stream URL (for the GX10 pipeline):
#   rtsp://10.30.55.128:8554/webcam
#
# Usage:
#   .\stream.ps1                          # auto-selects first webcam
#   .\stream.ps1 -Camera "HD Pro Webcam" # specify camera name
#   .\stream.ps1 -Width 1920 -Height 1080 -Fps 30
###############################################################################

param(
    [string]$Camera  = "",      # DirectShow camera name (empty = auto-detect first)
    [int]   $Width   = 1280,
    [int]   $Height  = 720,
    [int]   $Fps     = 30,
    [int]   $Bitrate = 2000,    # kbps
    [int]   $Port    = 8554
)

$ErrorActionPreference = "Stop"
$BinDir    = Join-Path $PSScriptRoot "bin"
$MtxExe    = Join-Path $BinDir "mediamtx.exe"
$FfmpegExe = Join-Path $BinDir "ffmpeg.exe"
$MtxConfig = Join-Path $PSScriptRoot "mediamtx.yml"

# ── Preflight checks ──────────────────────────────────────────────────────────
if (-not (Test-Path $MtxExe) -or -not (Test-Path $FfmpegExe)) {
    Write-Host "[stream] ERROR: Missing binaries. Run .\setup.ps1 first." -ForegroundColor Red
    exit 1
}

# ── List DirectShow devices, auto-detect camera ───────────────────────────────
Write-Host "[stream] Detecting webcam devices..." -ForegroundColor Cyan
$DeviceOutput = cmd /c "`"$FfmpegExe`" -list_devices true -f dshow -i dummy 2>&1"
$VideoDevices = $DeviceOutput | Select-String '"(.+?)" \(video\)' | ForEach-Object {
    $_.Matches[0].Groups[1].Value
}

if ($VideoDevices.Count -eq 0) {
    Write-Host "[stream] ERROR: No DirectShow video devices found." -ForegroundColor Red
    Write-Host "         Make sure your webcam is plugged in."
    exit 1
}

Write-Host "[stream] Available cameras:"
$VideoDevices | ForEach-Object { Write-Host "           - $_" }

if ($Camera -eq "") {
    $Camera = $VideoDevices[0]
    Write-Host "[stream] Auto-selected: '$Camera'" -ForegroundColor Yellow
} else {
    if ($Camera -notin $VideoDevices) {
        Write-Host "[stream] WARNING: '$Camera' not found in device list, trying anyway." -ForegroundColor Yellow
    }
}

# ── Start MediaMTX ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[stream] Starting MediaMTX (RTSP server on port $Port)..." -ForegroundColor Cyan
$MtxProc = Start-Process -FilePath $MtxExe `
    -ArgumentList "`"$MtxConfig`"" `
    -PassThru -NoNewWindow
Start-Sleep -Milliseconds 1500   # let it bind

if ($MtxProc.HasExited) {
    Write-Host "[stream] ERROR: MediaMTX exited immediately. Check mediamtx.yml." -ForegroundColor Red
    exit 1
}
Write-Host "[stream] MediaMTX running (PID $($MtxProc.Id))" -ForegroundColor Green

# ── Start FFmpeg webcam → RTSP push ──────────────────────────────────────────
$RtspUrl = "rtsp://localhost:$Port/webcam"
$FfArgs = @(
    "-f", "dshow",
    "-video_size", "${Width}x${Height}",
    "-framerate", "$Fps",
    "-i", "video=$Camera",
    "-vcodec", "libx264",
    "-preset", "ultrafast",   # minimize encode latency
    "-tune", "zerolatency",
    "-b:v", "${Bitrate}k",
    "-f", "rtsp",
    "-rtsp_transport", "tcp",
    $RtspUrl
)

Write-Host "[stream] Starting FFmpeg → $RtspUrl" -ForegroundColor Cyan
Write-Host "         Camera : $Camera"
Write-Host "         Resolution : ${Width}x${Height} @ ${Fps}fps  (${Bitrate} kbps H.264)"

$LanIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.*" } |
    Sort-Object PrefixLength |
    Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkCyan
Write-Host " RTSP stream URL (for GX10 pipeline config.yaml):" -ForegroundColor White
Write-Host "   rtsp://${LanIp}:${Port}/webcam" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkCyan
Write-Host " Press Ctrl+C to stop everything." -ForegroundColor DarkGray
Write-Host ""

try {
    & $FfmpegExe @FfArgs
} finally {
    # Cleanup: kill MediaMTX when FFmpeg exits or Ctrl+C
    Write-Host "[stream] Stopping MediaMTX..."
    if (-not $MtxProc.HasExited) {
        Stop-Process -Id $MtxProc.Id -Force
    }
    Write-Host "[stream] Done."
}
