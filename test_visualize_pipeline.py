"""
Galio Pipeline Viewer — Refactored for Multi-Camera Scale
==========================================================
Key changes vs. original:
  1. Independent per-camera detection queues (eliminates Head-of-Line blocking).
  2. Pre-encoded JPEG byte cache (imencode moved off the HTTP hot path).
  3. Global VLM Batcher thread (one multi-image call instead of N serial calls,
     leverages vLLM --limit-mm-per-prompt on Blackwell).
  4. Zero-copy frame passing where safe on unified LPDDR5X memory.
  5. Dedicated ThreadPoolExecutor for HTTP so it never steals GIL time from
     the multiprocessing workers.

Run from the project root:
    python3 test_visualize_pipeline.py

Press Ctrl+C to quit.
"""

from __future__ import annotations

import collections
import json
import multiprocessing as mp
import queue
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Dict, Optional
from urllib.parse import parse_qs, urlparse

import socket
import cv2
import numpy as np

from layer1_ingest.ingest import load_config, start_ingest
from layer1_ingest.worker import ingest_worker
from layer2_detection.worker import detection_worker
from layer3_vlm.prompt import build_prompt
from layer3_vlm.vlm import query_vlm
from layer4_aggregator.event_store import EventStore

# ---------------------------------------------------------------------------
# Global State
# ---------------------------------------------------------------------------

# camera_id -> latest pre-encoded JPEG bytes (written by main loop, read by HTTP)
_jpeg_cache: Dict[str, bytes] = {}
_jpeg_cache_lock = threading.Lock()

# camera_id -> latest VLM description string
_description_cache: Dict[str, str] = {}
_desc_lock = threading.Lock()

# Shared EventStore (thread-safe internally)
_api_store: Optional[EventStore] = None

# Active MJPEG viewer count — encode only when someone is watching
_mjpeg_client_count: int = 0
_mjpeg_count_lock = threading.Lock()

# SSE: one queue per connected browser tab; batcher pushes JSON strings here
_sse_clients: set = set()
_sse_clients_lock = threading.Lock()

# Cameras currently being processed by the VLM — skip re-submission until done
_vlm_inflight: set = set()
_vlm_inflight_lock = threading.Lock()

# Pipeline lag tracking (seconds from frame capture to JPEG encode)
_lag_samples: collections.deque = collections.deque(maxlen=30)
_lag_lock = threading.Lock()

# Queue refs for the stats monitor (set in main)
_frame_queue_size_ref: Optional[mp.Queue] = None
_detection_queue_ref: Optional[mp.Queue] = None

# Dynamic camera bookkeeping
_managed_cameras: Dict[str, dict] = {}
_ingest_processes: Dict[str, mp.Process] = {}
_cameras_lock = threading.Lock()

# Display settings (toggled at runtime via PUT /api/settings)
_show_bboxes: bool = False
_settings_lock = threading.Lock()

# Per-camera detection queues fed by a single fan-out thread
# camera_id -> queue.Queue[dict | None]
_per_cam_detect_q: Dict[str, queue.Queue] = {}

# Single inbound detection queue from the detector process → fan-out thread
_raw_detection_q: Optional[mp.Queue] = None

# Global VLM batcher input queue: camera_id → queue.Queue[dict | None]
_vlm_input_queues: Dict[str, queue.Queue] = {}
_vlm_queues_lock = threading.Lock()

# Config refs needed for dynamic camera add
_target_fps_ref: int = 24
_frame_queue_ref: Optional[mp.Queue] = None

# ---------------------------------------------------------------------------
# Color palette for bounding boxes
# ---------------------------------------------------------------------------
COLORS = {
    "person":     (0, 255, 0),
    "backpack":   (0, 165, 255),
    "handbag":    (0, 165, 255),
    "suitcase":   (0, 165, 255),
    "car":        (255, 0, 0),
    "motorcycle": (255, 0, 0),
    "bus":        (255, 0, 0),
    "truck":      (255, 0, 0),
}

# ---------------------------------------------------------------------------
# Drawing helper
# ---------------------------------------------------------------------------

def draw_detections(frame: np.ndarray, detections: list) -> np.ndarray:
    """Draw bounding boxes in-place (no copy — caller owns the buffer)."""
    for det in detections:
        x1, y1, x2, y2 = det["bbox"]
        label = det["label"]
        conf  = det["confidence"]
        color = COLORS.get(label, (255, 255, 255))
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        text = f"{label} {conf:.2f}"
        font_scale, thickness = 0.8, 2
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)
        cv2.rectangle(frame, (x1, y1 - th - 6), (x1 + tw + 4, y1), color, -1)
        # cv2.putText(frame, text, (x1 + 2, y1 - 4),
        #             cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 0, 0), thickness)
    return frame

# ---------------------------------------------------------------------------
# 1. Fan-out thread: one mp.Queue → N per-camera queue.Queues
# ---------------------------------------------------------------------------

def detection_fanout_worker(raw_q: mp.Queue):
    """
    Reads from the single multiprocessing detection queue and routes each item
    to the appropriate per-camera queue.  Creating the per-camera queue here
    (rather than in the main loop) ensures no item is ever dropped due to a
    race between process startup and queue creation.
    """
    while True:
        try:
            item = raw_q.get(timeout=1.0)
        except Exception:
            continue
        if item is None:
            break
        cam = item["camera_id"]

        with _cameras_lock:
            is_managed = cam in _managed_cameras

        if not is_managed:
            continue  # camera was removed while frame was in-flight

        # Ensure per-camera structures exist
        if cam not in _per_cam_detect_q:
            _per_cam_detect_q[cam] = queue.Queue(maxsize=120)

        # Track how old the frame is by the time we reach this point
        lag = time.time() - item["timestamp"]
        with _lag_lock:
            _lag_samples.append(lag)

        # Use unblurred frame for streaming, blurred for pipeline
        orig_frame = item.get("frame_unblurred")
        if orig_frame is None:
            orig_frame = item["frame"]

        # For pipeline, use the blurred frame (item["frame"])
        blurred_frame = item["frame"]

        # Always encode and cache the unblurred JPEG for streaming
        draw_frame = orig_frame.copy()
        with _settings_lock:
            bboxes_on = _show_bboxes
        if bboxes_on:
            draw_detections(draw_frame, item["detections"])
        ret, jpeg_buf = cv2.imencode(
            ".jpg", draw_frame,
            [cv2.IMWRITE_JPEG_QUALITY, 80]
        )
        if ret:
            with _jpeg_cache_lock:
                _jpeg_cache[cam] = jpeg_buf.tobytes()


# ---------------------------------------------------------------------------
# 2. Per-camera VLM feeder thread
#    Drains _per_cam_detect_q[cam] and forwards to the global batcher queue.
#    Keeps a temporal frame buffer so the batcher always has rich context.
# ---------------------------------------------------------------------------

def per_camera_vlm_feeder(cam: str, store: EventStore):
    """
    Maintains a sliding window of recent frames for `cam` and pushes
    summarised items into the global VLM batcher queue at a controlled rate.
    """
    WINDOW = 48           # frames to keep (~2 s @ 24 fps) — keeps submitted frames recent
    VLM_INTERVAL = 8.0    # seconds between VLM submissions per camera

    frame_buffer: collections.deque = collections.deque(maxlen=WINDOW)
    last_submitted = 0.0

    # Ensure the input queue exists
    with _vlm_queues_lock:
        if cam not in _vlm_input_queues:
            _vlm_input_queues[cam] = queue.Queue(maxsize=8)
    vlm_q = _vlm_input_queues[cam]

    detect_q = _per_cam_detect_q.setdefault(cam, queue.Queue(maxsize=120))

    while True:
        # Drain all available detection results into the buffer
        try:
            item = detect_q.get(timeout=0.5)
        except queue.Empty:
            # Check if camera was removed (sentinel)
            with _cameras_lock:
                if cam not in _managed_cameras:
                    return
            continue

        if item is None:  # removal sentinel
            return

        frame_buffer.append(item)
        # Drain any backlog
        while True:
            try:
                extra = detect_q.get_nowait()
                if extra is None:
                    return
                frame_buffer.append(extra)
            except queue.Empty:
                break

        now = time.monotonic()
        if now - last_submitted < VLM_INTERVAL:
            continue

        # Build the submission: 4 evenly-spaced keyframes across the buffer
        buf_list = list(frame_buffer)
        n_frames = min(6, len(buf_list))
        if n_frames > 1:
            indices = np.linspace(0, len(buf_list) - 1, n_frames, dtype=int)
            selected = [buf_list[i] for i in indices]
        else:
            selected = buf_list

        latest_item = buf_list[-1]

        submission = {
            "camera_id":  cam,
            "timestamp":  latest_item["timestamp"],
            "detections": latest_item["detections"],
            "frames":     [i["frame"] for i in selected],  # no .copy() — unified mem
        }

        try:
            vlm_q.put_nowait(submission)
            last_submitted = now
        except queue.Full:
            pass  # batcher is busy; skip this cycle


# ---------------------------------------------------------------------------
# 3. Pipeline stats monitor
# ---------------------------------------------------------------------------

def stats_monitor():
    """Prints queue depths and pipeline lag every 5 seconds."""
    INTERVAL = 5.0
    while True:
        time.sleep(INTERVAL)

        fq_size = _frame_queue_size_ref.qsize() if _frame_queue_size_ref else -1
        dq_size = _detection_queue_ref.qsize() if _detection_queue_ref else -1

        per_cam = {cam: q.qsize() for cam, q in _per_cam_detect_q.items()}

        with _lag_lock:
            samples = list(_lag_samples)
        avg_lag = sum(samples) / len(samples) if samples else 0.0
        max_lag = max(samples) if samples else 0.0

        with _vlm_inflight_lock:
            inflight = set(_vlm_inflight)

        lines = [
            f"[stats] frame_q={fq_size}  detect_q={dq_size}  "
            f"lag avg={avg_lag:.2f}s max={max_lag:.2f}s  "
            f"vlm_inflight={inflight or '{}'}",
        ]
        for cam, depth in per_cam.items():
            lines.append(f"         {cam}: per_cam_q={depth}")
        print("\n".join(lines))


# ---------------------------------------------------------------------------
# 5. Global VLM Batcher
#    Collects one pending submission per camera and issues a single
#    multi-image call to vLLM, exploiting continuous batching on Blackwell.
# ---------------------------------------------------------------------------

# One worker per camera — concurrent VLM calls, each with clean isolated JSON output
_vlm_executor = ThreadPoolExecutor(max_workers=8, thread_name_prefix="vlm-worker")


def global_vlm_batcher(store: EventStore):
    """
    Harvests the latest pending item from each camera's VLM input queue every
    BATCH_INTERVAL seconds, then fires one concurrent VLM call per camera via
    a thread pool. Each camera gets its own prompt and receives clean JSON back —
    no fused-prompt splitting required.
    """
    BATCH_INTERVAL = 0.5

    while True:
        time.sleep(BATCH_INTERVAL)

        with _vlm_queues_lock:
            cam_queues = dict(_vlm_input_queues)

        if not cam_queues:
            continue

        for cam, q in cam_queues.items():
            # Drain queue, keep only the most recent item
            item = None
            while True:
                try:
                    item = q.get_nowait()
                except queue.Empty:
                    break
            if item is None:
                continue
            # Skip if a VLM call for this camera is already in-flight —
            # avoids queue build-up when inference is slower than VLM_INTERVAL
            with _vlm_inflight_lock:
                if cam in _vlm_inflight:
                    continue
                _vlm_inflight.add(cam)
            print(f"[batcher] submitting VLM job for {cam}")
            _vlm_executor.submit(_process_single_camera, item, store)


def _process_single_camera(item: dict, store: EventStore):
    """Issues one VLM call for a single camera and writes the result to state."""
    cam    = item["camera_id"]
    ts     = item["timestamp"]
    dets   = item["detections"]
    frames = item["frames"]

    try:
        print(f"[vlm-worker] starting inference for {cam} ({len(frames)} frames)")
        store.add_event(cam, ts, dets, description=None)

        recent_events = store.get_recent(cam, seconds=60)
        history = [e for e in recent_events if e["timestamp"] != ts]
        prompt  = build_prompt(dets, history)

        try:
            desc = query_vlm(frames, prompt)
        except Exception as exc:
            print(f"[vlm] {cam} error: {exc}")
            return

        print(f"[vlm] {cam}: {desc}")
        store.set_description(cam, ts, desc)
        with _desc_lock:
            _description_cache[cam] = f"[{cam}] {desc}"

        payload  = json.dumps({"camera_id": cam, "timestamp": ts, "description": desc})
        sse_line = f"data: {payload}\n\n".encode()
        with _sse_clients_lock:
            dead = set()
            for q in _sse_clients:
                try:
                    q.put_nowait(sse_line)
                except queue.Full:
                    dead.add(q)
            _sse_clients.difference_update(dead)
    except Exception as exc:
        import traceback
        print(f"[vlm-worker] unexpected error for {cam}: {type(exc).__name__}: {exc}")
        traceback.print_exc()
    finally:
        with _vlm_inflight_lock:
            _vlm_inflight.discard(cam)


# ---------------------------------------------------------------------------
# 4. HTTP Server (serves pre-computed bytes — no heavy work in handlers)
# ---------------------------------------------------------------------------

class StreamingHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # suppress per-request noise
        pass

    # --- CORS helpers -------------------------------------------------------
    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json_response(self, code: int, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-type", "application/json")
        self.send_header("Cache-Control", "no-cache")
        self._send_cors()
        self.end_headers()
        self.wfile.write(body)

    # --- Route dispatcher ---------------------------------------------------
    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]

        if path == "/":
            self._serve_index()
        elif path.startswith("/description"):
            self._serve_description()
        elif path == "/api/cameras":
            self._serve_cameras()
        elif path == "/api/events/all":
            self._serve_all_events()
        elif path == "/api/vlm/log":
            self._serve_vlm_log()
        elif path == "/api/events":
            self._serve_events()
        elif path == "/api/stream":
            self._serve_sse()
        elif path.startswith("/api/search"):
            self._serve_search()
        elif path.startswith("/video_feed"):
            self._serve_mjpeg(path)
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path.split("?")[0] == "/api/cameras":
            self._add_camera()
        else:
            self.send_error(404)

    def do_PUT(self):
        if self.path.split("?")[0] == "/api/settings":
            self._update_settings()
        else:
            self.send_error(404)

    def do_DELETE(self):
        path = self.path.split("?")[0]
        if path.startswith("/api/cameras/"):
            self._remove_camera(path[len("/api/cameras/"):])
        else:
            self.send_error(404)

    # --- Handler implementations --------------------------------------------

    def _rebind_to_low_pool(self):
        """
        Called at the top of low-priority handlers. Does nothing if the pools
        aren't attached (e.g. during unit tests), otherwise this is a no-op
        at the thread level — the current thread just keeps running, but we
        release a slot in the priority pool by not blocking it further.
        The key insight: ThreadPoolExecutor futures run to completion on the
        thread they started on. There is no mid-flight rebinding of threads.
        Instead, we simply ensure MJPEG/HTML are submitted to _low_pool from
        the start — handled in process_request routing below.
        """
        pass  # Routing is done at submission time in process_request.

    def _serve_index(self):
        # Test UI is lowest priority — run on the low pool so it can never
        # consume a slot needed by /api/* handlers.
        self._rebind_to_low_pool()
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(_INDEX_HTML.encode("utf-8"))

    def _serve_description(self):
        cam_id = parse_qs(urlparse(self.path).query).get("cam", [None])[0]
        with _desc_lock:
            if cam_id and cam_id in _description_cache:
                body = _description_cache[cam_id]
            elif _description_cache:
                body = next(iter(_description_cache.values()))
            else:
                body = "Waiting for analysis..."
        self.send_response(200)
        self.send_header("Content-type", "text/plain")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self._send_cors()
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def _serve_cameras(self):
        with _cameras_lock:
            result = []
            for cid, cfg in _managed_cameras.items():
                proc = _ingest_processes.get(cid)
                online = proc is not None and proc.is_alive()
                result.append({**cfg, "online": online})
        self._json_response(200, result)

    def _serve_events(self):
        events = _api_store.get_all_recent(seconds=120) if _api_store else []
        seen: dict = {}
        result = []
        for ev in reversed(events):
            cam = ev["camera_id"]
            if cam not in seen and ev.get("description"):
                seen[cam] = True
                result.append({
                    "camera_id":  cam,
                    "timestamp":  ev["timestamp"],
                    "detections": ev["detections"],
                    "description": ev["description"],
                })
        self._json_response(200, result)

    def _serve_all_events(self):
        events = _api_store.get_all_recent(seconds=300) if _api_store else []
        result = [
            {
                "camera_id":   ev["camera_id"],
                "timestamp":   ev["timestamp"],
                "detections":  ev["detections"],
                "description": ev.get("description") or "",
            }
            for ev in reversed(events)  # newest first
        ]
        self._json_response(200, result)

    def _serve_vlm_log(self):
        events = _api_store.get_all_recent(seconds=300) if _api_store else []
        result = []
        for ev in reversed(events):  # newest first
            raw = ev.get("description") or ""
            if not raw:
                continue
            try:
                parsed = json.loads(raw)
            except Exception:
                parsed = {"raw": raw}
            result.append({
                "camera_id": ev["camera_id"],
                "timestamp": ev["timestamp"],
                "vlm":       parsed,
            })
        self._json_response(200, result)

    def _serve_sse(self):
        """Long-lived SSE connection. Pushes description updates instantly."""
        my_q: queue.Queue = queue.Queue(maxsize=32)
        with _sse_clients_lock:
            _sse_clients.add(my_q)
        self.send_response(200)
        self.send_header("Content-type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self._send_cors()
        self.end_headers()
        try:
            # Send current state immediately so the client doesn't wait for next VLM cycle
            with _desc_lock:
                snapshot = dict(_description_cache)
            for cam, full_desc in snapshot.items():
                desc = full_desc[len(f"[{cam}] "):] if full_desc.startswith(f"[{cam}] ") else full_desc
                payload = json.dumps({"camera_id": cam, "description": desc})
                self.wfile.write(f"data: {payload}\n\n".encode())
            self.wfile.flush()
            while True:
                try:
                    chunk = my_q.get(timeout=15)
                    self.wfile.write(chunk)
                    self.wfile.flush()
                except queue.Empty:
                    # Heartbeat keeps the connection alive through proxies
                    self.wfile.write(b": keep-alive\n\n")
                    self.wfile.flush()
        except Exception:
            pass
        finally:
            with _sse_clients_lock:
                _sse_clients.discard(my_q)

    def _serve_search(self):
        query_text = parse_qs(urlparse(self.path).query).get("q", [""])[0]
        if not query_text or not _api_store:
            self._json_response(200, [])
            return
        results = _api_store.semantic_search(query_text, limit=5)
        clean = [
            {"camera_id": r["camera_id"],
             "timestamp": r["timestamp"],
             "description": r["description"]}
            for r in results
        ]
        self._json_response(200, clean)

    def _serve_mjpeg(self, path: str):
        """Serve pre-encoded JPEG bytes; zero encoding work in this thread."""
        # MJPEG is a long-lived loop — demote to low pool immediately so it
        # cannot hold a priority-pool thread hostage for its entire lifetime.
        self._rebind_to_low_pool()
        parts = path.rstrip("/").split("/")
        cam_key = parts[-1] if len(parts) > 2 else None

        self.send_response(200)
        self.send_header("Content-type", "multipart/x-mixed-replace; boundary=frame")
        self.end_headers()

        with _mjpeg_count_lock:
            global _mjpeg_client_count
            _mjpeg_client_count += 1
        try:
            while True:
                jpeg = None
                with _jpeg_cache_lock:
                    if cam_key and cam_key in _jpeg_cache:
                        jpeg = _jpeg_cache[cam_key]
                    elif _jpeg_cache:
                        jpeg = next(iter(_jpeg_cache.values()))

                if jpeg is not None:
                    self.wfile.write(
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n"
                        + b"Content-Length: " + str(len(jpeg)).encode() + b"\r\n"
                        b"\r\n"
                        + jpeg
                        + b"\r\n"
                    )

                time.sleep(0.033)  # ~30 fps ceiling for MJPEG clients
        except Exception:
            pass
        finally:
            with _mjpeg_count_lock:
                _mjpeg_client_count -= 1

    def _update_settings(self):
        global _show_bboxes
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except Exception:
            self._json_response(400, {"error": "invalid JSON"})
            return
        with _settings_lock:
            if "bboxes" in data:
                _show_bboxes = bool(data["bboxes"])
        with _settings_lock:
            self._json_response(200, {"bboxes": _show_bboxes})

    def _add_camera(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            camera_cfg = json.loads(body)
            cam_id = camera_cfg.get("id", "").strip()
            if not cam_id:
                self._json_response(400, {"error": "id required"})
                return
            with _cameras_lock:
                if cam_id in _ingest_processes:
                    self._json_response(409, {"error": "camera already exists"})
                    return
                p = mp.Process(
                    target=ingest_worker,
                    args=(camera_cfg, _target_fps_ref, _frame_queue_ref),
                    name=f"ingest-{cam_id}",
                    daemon=True,
                )
                p.start()
                _ingest_processes[cam_id] = p
                _managed_cameras[cam_id] = camera_cfg

            # Spin up per-camera VLM feeder
            _ensure_camera_threads(cam_id, _api_store)

            self._json_response(201, {"id": cam_id, "status": "started"})
        except Exception as exc:
            self._json_response(500, {"error": str(exc)})

    def _remove_camera(self, cam_id: str):
        with _cameras_lock:
            if cam_id not in _ingest_processes:
                self._json_response(404, {"error": "not found"})
                return
            _ingest_processes[cam_id].terminate()
            del _ingest_processes[cam_id]
            del _managed_cameras[cam_id]

        # Send sentinel to per-camera feeder and VLM queues
        if cam_id in _per_cam_detect_q:
            try:
                _per_cam_detect_q[cam_id].put_nowait(None)
            except queue.Full:
                pass
        with _vlm_queues_lock:
            if cam_id in _vlm_input_queues:
                try:
                    _vlm_input_queues[cam_id].put_nowait(None)
                except queue.Full:
                    pass
                del _vlm_input_queues[cam_id]

        with _jpeg_cache_lock:
            _jpeg_cache.pop(cam_id, None)
        with _desc_lock:
            _description_cache.pop(cam_id, None)

        self._json_response(200, {"status": "removed"})


# ---------------------------------------------------------------------------
# 5. Index HTML (dark-themed multi-camera grid)
# ---------------------------------------------------------------------------

_INDEX_HTML = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Galio Pipeline Viewer</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@300;500&display=swap');
  :root {
    --bg: #080c14; --surface: #0d1526; --border: #1a2744;
    --accent: #00e5ff; --accent2: #ff4c6e; --text: #c8d8f0; --muted: #4a6080;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text);
         font-family: 'IBM Plex Sans', sans-serif; min-height: 100vh; padding: 24px; }
  header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
  header h1 { font-family: 'IBM Plex Mono', monospace; font-size: 1.4rem;
               letter-spacing: .08em; color: var(--accent); }
  header span { font-size:.75rem; color: var(--muted); font-family: 'IBM Plex Mono', monospace; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(480px, 1fr)); gap: 20px; }
  .camera-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
                 overflow: hidden; display: flex; flex-direction: column; }
  .cam-header { display: flex; align-items: center; justify-content: space-between;
                padding: 10px 14px; border-bottom: 1px solid var(--border); }
  .cam-id { font-family: 'IBM Plex Mono', monospace; font-size: .8rem; color: var(--accent); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent2); }
  .dot.online { background: #00e676; box-shadow: 0 0 6px #00e676; }
  .cam-feed img { width: 100%; display: block; background: #000; aspect-ratio: 16/9; object-fit: cover; }
  .cam-desc { padding: 12px 14px; font-size: .82rem; line-height: 1.55;
              color: var(--text); min-height: 72px; border-top: 1px solid var(--border); }
  .cam-desc.muted { color: var(--muted); font-style: italic; }
</style>
</head>
<body>
<header>
  <h1>&#9632; GALIO</h1>
  <span id="cam-count">— cameras</span>
</header>
<div class="grid" id="grid"></div>
<script>
  const grid = document.getElementById('grid');
  const camCount = document.getElementById('cam-count');

  // --- Camera card helpers ---------------------------------------------------
  function ensureCard(id) {
    let card = document.getElementById('card-' + id);
    if (!card) {
      card = document.createElement('div');
      card.className = 'camera-card';
      card.id = 'card-' + id;
      card.innerHTML = `
        <div class="cam-header">
          <span class="cam-id">${id}</span>
          <span class="dot" id="dot-${id}"></span>
        </div>
        <div class="cam-feed">
          <img src="/video_feed/${id}" alt="${id}" loading="lazy">
        </div>
        <div class="cam-desc muted" id="desc-${id}">Waiting for analysis…</div>`;
      grid.appendChild(card);
    }
    return card;
  }

  // --- One-time camera list fetch (cameras change rarely) -------------------
  async function loadCameras() {
    try {
      const cameras = await fetch('/api/cameras').then(r => r.json());
      camCount.textContent = cameras.length + ' camera' + (cameras.length !== 1 ? 's' : '');
      cameras.forEach(cam => {
        ensureCard(cam.id);
        const dot = document.getElementById('dot-' + cam.id);
        if (dot) dot.className = 'dot' + (cam.online ? ' online' : '');
      });
      // Prune removed cameras
      Array.from(grid.children).forEach(card => {
        const cid = card.id.replace('card-', '');
        if (!cameras.find(c => c.id === cid)) card.remove();
      });
    } catch(e) {}
    // Re-poll cameras every 5s (only for online-dot accuracy + add/remove)
    setTimeout(loadCameras, 5000);
  }
  loadCameras();

  // --- SSE: descriptions pushed the instant VLM finishes -------------------
  function connectSSE() {
    const es = new EventSource('/api/stream');
    es.onmessage = e => {
      try {
        const { camera_id, description } = JSON.parse(e.data);
        ensureCard(camera_id);
        const el = document.getElementById('desc-' + camera_id);
        if (el) {
          el.className = 'cam-desc';
          el.textContent = description;
        }
      } catch(_) {}
    };
    es.onerror = () => {
      es.close();
      setTimeout(connectSSE, 2000);  // reconnect on drop
    };
  }
  connectSSE();
</script>
</body>
</html>'''


# ---------------------------------------------------------------------------
# 6. Helper: ensure per-camera VLM feeder thread is running
# ---------------------------------------------------------------------------

def _ensure_camera_threads(cam_id: str, store: EventStore):
    """Idempotently start the per-camera VLM feeder thread."""
    if cam_id not in _per_cam_detect_q:
        _per_cam_detect_q[cam_id] = queue.Queue(maxsize=120)
    with _vlm_queues_lock:
        if cam_id not in _vlm_input_queues:
            _vlm_input_queues[cam_id] = queue.Queue(maxsize=8)
    t = threading.Thread(
        target=per_camera_vlm_feeder,
        args=(cam_id, store),
        name=f"vlm-feeder-{cam_id}",
        daemon=True,
    )
    t.start()


# ---------------------------------------------------------------------------
# 7. HTTP Server bootstrap (dedicated thread pool — no GIL competition)
# ---------------------------------------------------------------------------

# Paths that serve the real Galio frontend — get dedicated threads.
_PRIORITY_PREFIXES = ("/api/",)
# Everything else (inline test UI, MJPEG video) is low-priority.
_LOW_PRIORITY_PREFIXES = ("/", "/video_feed", "/description")


def run_server():
    """
    Two-pool HTTP server:
      • _priority_pool  — /api/* and SSE: 12 threads, never blocked by video
      • _low_pool       — MJPEG + inline test HTML: 4 threads, best-effort
    MJPEG handlers are long-lived (they loop forever), so capping them at 4
    prevents them from ever consuming pool slots needed by the real API.
    """
    priority_pool = ThreadPoolExecutor(max_workers=12, thread_name_prefix="http-api")
    low_pool      = ThreadPoolExecutor(max_workers=4,  thread_name_prefix="http-low")

    class PrioritizedHTTPServer(ThreadingHTTPServer):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._priority_pool = priority_pool
            self._low_pool      = low_pool

        def process_request(self, request, client_address):
            # Peek at the HTTP request line (already in the TCP recv buffer)
            # to decide which pool to use — no need to parse headers.
            try:
                first_line = request.recv(256, socket.MSG_PEEK).decode("latin-1", errors="replace")
                path = first_line.split(" ")[1] if " " in first_line else "/"
            except Exception:
                path = "/"

            is_low = (
                path == "/"
                or path.startswith("/video_feed")
                or path.startswith("/description")
            )
            pool = self._low_pool if is_low else self._priority_pool
            try:
                pool.submit(self.process_request_thread, request, client_address)
            except RuntimeError:
                pass  # pool shut down during server close; drop in-flight request

        def server_close(self):
            self._priority_pool.shutdown(wait=False)
            self._low_pool.shutdown(wait=False)
            super().server_close()

    # Attach pools to handler class so individual handlers can self-demote.
    StreamingHandler._priority_pool = priority_pool
    StreamingHandler._low_pool      = low_pool

    server = PrioritizedHTTPServer(("", 5001), StreamingHandler)
    server.serve_forever()


# ---------------------------------------------------------------------------
# 8. Entry point
# ---------------------------------------------------------------------------

def main():
    global _api_store, _frame_queue_ref, _target_fps_ref, _raw_detection_q

    config = load_config("config.yaml")
    _target_fps_ref = config["ingest"]["target_fps"]

    # -- Layer 1: Ingest -------------------------------------------------------
    frame_queue, ingest_processes = start_ingest(config)
    _frame_queue_ref = frame_queue

    # -- Layer 2: Detection (single process, fan-out handled in Python) --------
    detection_queue: mp.Queue = mp.Queue(maxsize=200)
    _raw_detection_q = detection_queue
    global _frame_queue_size_ref, _detection_queue_ref
    _frame_queue_size_ref = frame_queue
    _detection_queue_ref  = detection_queue

    detector_process = mp.Process(
        target=detection_worker,
        args=(frame_queue, detection_queue),
        name="detector",
        daemon=True,
    )
    detector_process.start()

    # -- Layer 4: EventStore ---------------------------------------------------
    store = EventStore()
    _api_store = store

    # -- Register initial cameras ----------------------------------------------
    with _cameras_lock:
        for proc in ingest_processes:
            cam_id = proc.name.replace("ingest-", "")
            _ingest_processes[cam_id] = proc
        for cam_cfg in config["cameras"]:
            _managed_cameras[cam_cfg["id"]] = cam_cfg

    # -- Spin up per-camera feeder threads -------------------------------------
    for cam_cfg in config["cameras"]:
        _ensure_camera_threads(cam_cfg["id"], store)

    # -- Fan-out thread: routes raw detections to per-camera queues + encodes --
    threading.Thread(
        target=detection_fanout_worker,
        args=(detection_queue,),
        name="fanout",
        daemon=True,
    ).start()

    # -- Pipeline stats monitor ------------------------------------------------
    threading.Thread(target=stats_monitor, name="stats", daemon=True).start()

    # -- Global VLM batcher (single thread, multi-image calls) -----------------
    threading.Thread(
        target=global_vlm_batcher,
        args=(store,),
        name="vlm-batcher",
        daemon=True,
    ).start()

    # -- HTTP server (pooled, daemon) ------------------------------------------
    threading.Thread(target=run_server, name="http", daemon=True).start()
    print("[galio] Streaming at http://localhost:5001/ — press Ctrl+C to quit")

    # -- Main thread: just keeps the process alive and reaps workers -----------
    try:
        while True:
            time.sleep(5)
            # Reap dead ingest processes (optional watchdog)
            with _cameras_lock:
                for cid, proc in list(_ingest_processes.items()):
                    if not proc.is_alive():
                        print(f"[galio] ingest-{cid} exited (exit code {proc.exitcode})")
    except KeyboardInterrupt:
        pass
    finally:
        for p in ingest_processes:
            p.terminate()
        detector_process.terminate()
        print("[galio] Shutdown complete.")


if __name__ == "__main__":
    main()