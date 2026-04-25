"""
webcam-streamer/streamer.py
────────────────────────────
Streams your local webcam as an MJPEG feed over HTTP.

Endpoints:
  GET /          -> simple browser viewer (verify the stream is live)
  GET /stream    -> raw MJPEG feed  (use this in cv2.VideoCapture / pipeline)
  GET /snapshot  -> single JPEG frame

Usage:
  python streamer.py [--camera 0] [--port 8080] [--width 1280] [--height 720] [--fps 30] [--quality 80]

Pipeline consumer (on the GX10):
  cap = cv2.VideoCapture("http://10.30.55.128:8080/stream")
"""

import argparse
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import cv2


# ---------------------------------------------------------------------------
# Shared frame buffer
# ---------------------------------------------------------------------------

class FrameBuffer:
    """Thread-safe single-slot frame buffer with event signalling."""

    def __init__(self):
        self._lock = threading.Lock()
        self._jpeg: bytes | None = None
        self._event = threading.Event()

    def put(self, jpeg_bytes: bytes):
        with self._lock:
            self._jpeg = jpeg_bytes
        self._event.set()
        self._event.clear()

    def latest(self) -> bytes | None:
        with self._lock:
            return self._jpeg

    def wait_next(self, timeout: float = 1.0) -> bytes | None:
        self._event.wait(timeout)
        return self.latest()


BUFFER = FrameBuffer()
SERVER_PORT = 8080  # updated at runtime


# ---------------------------------------------------------------------------
# Capture thread
# ---------------------------------------------------------------------------

def capture_loop(camera_index: int, width: int, height: int, fps: int, quality: int):
    """Continuously reads webcam frames and pushes JPEG bytes into BUFFER."""

    # CAP_DSHOW is faster/more compatible on Windows
    cap = cv2.VideoCapture(camera_index, cv2.CAP_DSHOW)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
    cap.set(cv2.CAP_PROP_FPS, fps)

    if not cap.isOpened():
        print(f"[streamer] ERROR: cannot open camera index {camera_index}")
        return

    actual_w  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_h  = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    actual_fps = cap.get(cv2.CAP_PROP_FPS)
    print(f"[streamer] Camera ready: {actual_w}x{actual_h} @ {actual_fps:.1f} fps  (quality={quality})")

    interval = 1.0 / fps
    last_sample = 0.0
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, quality]

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[streamer] Frame read failed, retrying in 100 ms…")
            time.sleep(0.1)
            continue

        now = time.monotonic()
        if now - last_sample < interval:
            continue
        last_sample = now

        ok, buf = cv2.imencode(".jpg", frame, encode_params)
        if ok:
            BUFFER.put(buf.tobytes())

    cap.release()


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

VIEWER_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Webcam Stream</title>
  <style>
    *{{margin:0;padding:0;box-sizing:border-box}}
    body{{
      background:#07090f;color:#e2e8f0;
      font-family:'Segoe UI',system-ui,sans-serif;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      min-height:100vh;gap:1.4rem;
    }}
    h1{{font-size:1.3rem;letter-spacing:.1em;color:#7dd3fc;text-transform:uppercase;}}
    .pill{{
      display:inline-flex;align-items:center;gap:.45rem;
      background:#052e16;border:1px solid #16a34a;
      border-radius:999px;padding:.2rem .75rem;font-size:.75rem;color:#4ade80;
    }}
    .dot{{
      width:8px;height:8px;border-radius:50%;background:#4ade80;
      animation:blink 1.4s ease-in-out infinite;
    }}
    @keyframes blink{{0%,100%{{opacity:1}}50%{{opacity:.2}}}}
    img{{
      max-width:90vw;max-height:72vh;
      border-radius:10px;border:1.5px solid #1e293b;
      box-shadow:0 0 48px rgba(125,211,252,.1);
    }}
    .info{{font-size:.75rem;color:#475569;text-align:center;line-height:1.9;}}
    code{{background:#1e293b;padding:.1rem .4rem;border-radius:4px;color:#93c5fd;}}
  </style>
</head>
<body>
  <h1>&#x1F4F7; Webcam · MJPEG Stream</h1>
  <div class="pill"><div class="dot"></div>LIVE</div>
  <img src="/stream" alt="webcam"/>
  <div class="info">
    GX10 pipeline URL: <code>http://{host}:{port}/stream</code><br>
    Snapshot: <code>http://{host}:{port}/snapshot</code>
  </div>
</body>
</html>
"""


class StreamHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        # Print only non-stream requests so the console stays clean
        if "/stream" not in self.path:
            print(f"[http] {self.address_string()} {self.requestline}")

    def do_GET(self):
        if self.path == "/":
            self._viewer()
        elif self.path == "/stream":
            self._mjpeg()
        elif self.path == "/snapshot":
            self._snapshot()
        else:
            self.send_error(404, "Not found")

    # -- routes ---------------------------------------------------------------

    def _viewer(self):
        host = self.server.server_address[0]
        html = VIEWER_HTML_TEMPLATE.format(host=host, port=SERVER_PORT).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html)))
        self.end_headers()
        self.wfile.write(html)

    def _mjpeg(self):
        self.send_response(200)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=mjpegframe")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()

        try:
            while True:
                frame = BUFFER.wait_next(timeout=2.0)
                if frame is None:
                    continue
                header = (
                    "--mjpegframe\r\n"
                    "Content-Type: image/jpeg\r\n"
                    f"Content-Length: {len(frame)}\r\n\r\n"
                ).encode()
                self.wfile.write(header + frame + b"\r\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass  # normal — client disconnected

    def _snapshot(self):
        frame = BUFFER.latest()
        if frame is None:
            self.send_error(503, "No frame available yet — camera still warming up")
            return
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(frame)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(frame)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    global SERVER_PORT

    parser = argparse.ArgumentParser(description="Stream local webcam as MJPEG over HTTP")
    parser.add_argument("--camera",  type=int, default=0,    help="Camera device index (default: 0)")
    parser.add_argument("--port",    type=int, default=8080, help="HTTP listen port (default: 8080)")
    parser.add_argument("--width",   type=int, default=1280, help="Capture width  (default: 1280)")
    parser.add_argument("--height",  type=int, default=720,  help="Capture height (default: 720)")
    parser.add_argument("--fps",     type=int, default=30,   help="Target FPS     (default: 30)")
    parser.add_argument("--quality", type=int, default=80,   help="JPEG quality 1-100 (default: 80)")
    args = parser.parse_args()

    SERVER_PORT = args.port

    print(f"[streamer] Opening camera {args.camera}…")
    t = threading.Thread(
        target=capture_loop,
        args=(args.camera, args.width, args.height, args.fps, args.quality),
        daemon=True,
    )
    t.start()
    time.sleep(1.2)  # let camera warm up before accepting connections

    server = HTTPServer(("0.0.0.0", args.port), StreamHandler)
    print(f"[streamer] Listening on port {args.port}. Endpoints:")
    print(f"           http://localhost:{args.port}/         <- browser viewer")
    print(f"           http://10.30.55.128:{args.port}/stream   <- GX10 pipeline URL")
    print(f"           http://10.30.55.128:{args.port}/snapshot <- single frame")
    print(f"[streamer] Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[streamer] Shutting down.")
        server.server_close()


if __name__ == "__main__":
    main()
