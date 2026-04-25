# webcam-streamer

Turns your Windows webcam into a **real RTSP IP camera** using [MediaMTX](https://github.com/bluenviron/mediamtx) + FFmpeg.
Slots directly into the GX10 pipeline's existing `type: rtsp` config with zero pipeline changes.

```
Windows PC (webcam) ──FFmpeg──► MediaMTX (RTSP server) ──────────► ASUS GX10
                                 rtsp://10.30.55.128:8554/webcam      layer1_ingest
```

---

## Quick start

### 1. One-time setup (downloads MediaMTX + FFmpeg portable, ~90 MB total)
```powershell
.\setup.ps1
```

### 2. Start streaming
```powershell
.\stream.ps1                           # auto-detects first webcam, 1280x720 @ 30fps
.\stream.ps1 -Camera "HD Pro Webcam"  # specify camera by name
.\stream.ps1 -Width 1920 -Height 1080 -Fps 30 -Bitrate 4000
```

The script will print the exact URL to paste into config.yaml on the GX10.

---

## Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 RTSP stream URL (for GX10 pipeline config.yaml):
   rtsp://10.30.55.128:8554/webcam
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## GX10 pipeline config.yaml

```yaml
cameras:
  - id: cam_webcam
    type: rtsp
    url: rtsp://10.30.55.128:8554/webcam
    loop: false
```

---

## Files

| File | Purpose |
|------|---------|
| `setup.ps1` | Downloads MediaMTX + FFmpeg into `bin/` (one-time) |
| `stream.ps1` | Starts the RTSP stream |
| `mediamtx.yml` | MediaMTX config (RTSP only, port 8554) |
| `bin/` | Auto-created by setup, gitignored |

---

## Network / firewall

If the GX10 can't reach the stream, allow the port (run as Admin once):
```powershell
New-NetFirewallRule -DisplayName "Webcam RTSP Stream" -Direction Inbound -Protocol TCP -LocalPort 8554 -Action Allow
```

---

## Verify the stream locally

Use VLC or ffplay from `bin/`:
```powershell
.\bin\ffmpeg.exe -i rtsp://localhost:8554/webcam -vframes 1 test_frame.jpg
```
