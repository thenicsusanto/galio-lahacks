"""
Visualizes the full pipeline: bounding boxes + VLM description overlaid on frame.
Run from the project root:
    python3 test_visualize_pipeline.py

Press Q to quit.
"""
import multiprocessing as mp
import queue
import threading
import cv2
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import time

from layer1_ingest.ingest import load_config, start_ingest
from layer2_detection.worker import detection_worker
from layer3_vlm.prompt import build_prompt
from layer3_vlm.vlm import query_vlm
from layer4_aggregator.event_store import EventStore

import json

latest_frame = {}
latest_description = ""
_api_store = None

class StreamingHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # suppress per-request logs

    def send_cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors()
        self.end_headers()

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            html = b'''
            <html>
            <head>
                <style>
                    body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; background: #0f172a; margin: 0; padding: 20px; color: #f8fafc; }
                    .container { display: flex; gap: 24px; max-width: 1400px; width: 100%; margin-top: 20px; }
                    .video-box { flex: 2; background: #1e293b; padding: 16px; border-radius: 12px; }
                    .video-box img { width: 100%; border-radius: 8px; }
                    .text-box { flex: 1; background: #1e293b; padding: 24px; border-radius: 12px; max-height: 800px; overflow-y: auto; }
                    h1 { width: 100%; text-align: left; max-width: 1400px; margin: 0; font-size: 2rem; font-weight: 600; color: #f8fafc; }
                    h2 { margin-top: 0; color: #38bdf8; font-size: 1.25rem; font-weight: 600; margin-bottom: 16px; border-bottom: 1px solid #334155; padding-bottom: 12px; }
                    #description { white-space: pre-wrap; font-size: 1.05rem; line-height: 1.6; color: #e2e8f0; }
                </style>
                <script>
                    function fetchDescription() {
                        fetch('/description?t=' + Date.now())
                            .then(response => response.text())
                            .then(text => {
                                document.getElementById('description').innerText = text;
                            });
                    }
                    setInterval(fetchDescription, 500);
                </script>
            </head>
            <body>
                <h1>Galio Pipeline Viewer</h1>
                <div class="container">
                    <div class="video-box">
                        <img src="/video_feed">
                    </div>
                    <div class="text-box">
                        <h2>AI Analysis</h2>
                        <div id="description">Waiting for analysis...</div>
                    </div>
                </div>
            </body>
            </html>
            '''
            self.wfile.write(html)
        elif path.startswith('/description'):
            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_cors()
            self.end_headers()
            self.wfile.write(latest_description.encode('utf-8') if latest_description else b'Waiting for analysis...')
        elif path == '/api/cameras':
            # Returns the list of live camera IDs seen by the pipeline
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Cache-Control', 'no-cache')
            self.send_cors()
            self.end_headers()
            cam_ids = list(latest_frame.keys())
            self.wfile.write(json.dumps(cam_ids).encode())
        elif path == '/api/events':
            # Returns the most recent VLM event per camera as a JSON array
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Cache-Control', 'no-cache')
            self.send_cors()
            self.end_headers()
            events = _api_store.get_all_recent(seconds=120) if _api_store else []
            # Dedupe: only the most recent event per camera with a description
            seen = {}
            result = []
            for ev in reversed(events):
                cam = ev['camera_id']
                if cam not in seen and ev.get('description'):
                    seen[cam] = True
                    result.append({
                        'camera_id': cam,
                        'timestamp': ev['timestamp'],
                        'detections': ev['detections'],
                        'description': ev['description'],
                    })
            self.wfile.write(json.dumps(result).encode())
        elif path.startswith('/api/search'):
            # Perform semantic search over VLM descriptions
            from urllib.parse import urlparse, parse_qs
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Cache-Control', 'no-cache')
            self.send_cors()
            self.end_headers()
            
            parsed_url = urlparse(self.path)
            query_params = parse_qs(parsed_url.query)
            query_text = query_params.get('q', [''])[0]
            
            if not query_text or not _api_store:
                self.wfile.write(json.dumps([]).encode())
                return
                
            results = _api_store.semantic_search(query_text, limit=5)
            
            # Filter out the raw embeddings before sending JSON
            clean_results = []
            for r in results:
                clean_results.append({
                    'camera_id': r['camera_id'],
                    'timestamp': r['timestamp'],
                    'description': r['description']
                })
                
            self.wfile.write(json.dumps(clean_results).encode())
        elif path.startswith('/video_feed'):
            # Support /video_feed or /video_feed/cam_01 etc.
            parts = path.rstrip('/').split('/')
            cam_key = parts[-1] if len(parts) > 2 else None
            self.send_response(200)
            self.send_header('Content-type', 'multipart/x-mixed-replace; boundary=frame')
            self.end_headers()
            try:
                while True:
                    frame = None
                    if cam_key and cam_key in latest_frame:
                        frame = latest_frame[cam_key]
                    elif latest_frame:
                        frame = next(iter(latest_frame.values()))
                    if frame is not None:
                        ret, jpeg = cv2.imencode('.jpg', frame)
                        if ret:
                            self.wfile.write(b'--frame\r\n')
                            self.send_header('Content-type', 'image/jpeg')
                            self.send_header('Content-length', str(len(jpeg.tobytes())))
                            self.end_headers()
                            self.wfile.write(jpeg.tobytes())
                            self.wfile.write(b'\r\n')
                    time.sleep(0.033)
            except Exception:
                pass
        else:
            self.send_error(404)

def run_server():
    server = ThreadingHTTPServer(('', 5001), StreamingHandler)
    server.serve_forever()

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


def draw_detections(frame, detections):
    for det in detections:
        x1, y1, x2, y2 = det["bbox"]
        label = det["label"]
        conf = det["confidence"]
        color = COLORS.get(label, (255, 255, 255))

        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        # Use a larger font scale and thickness for readability after downscaling
        text = f"{label} {conf:.2f}"
        font_scale = 0.8
        thickness = 2
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)
        cv2.rectangle(frame, (x1, y1 - th - 6), (x1 + tw + 4, y1), color, -1)
        cv2.putText(frame, text, (x1 + 2, y1 - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, font_scale, (0, 0, 0), thickness)
    return frame


def vlm_worker(vlm_queue: queue.Queue, store: EventStore):
    """Runs VLM inference in the background."""
    global latest_description
    import numpy as np
    import collections
    
    # Keep a sliding window of the last 120 frames (~5s at 24fps)
    # This guarantees the VLM always sees a wide temporal context, 
    # even when inference runs too fast to let the queue fill up naturally.
    frame_buffer = collections.deque(maxlen=120)
    
    while True:
        frame_buffer.append(vlm_queue.get())
        while not vlm_queue.empty():
            try:
                frame_buffer.append(vlm_queue.get_nowait())
            except queue.Empty:
                break
                
        buffer_list = list(frame_buffer)
        if len(buffer_list) > 4:
            indices = np.linspace(0, len(buffer_list) - 1, 4, dtype=int)
            items = [buffer_list[i] for i in indices]
        else:
            items = buffer_list
            
        # latest_item must come from buffer_list to ensure we get the absolute most recent
        latest_item = buffer_list[-1]

        camera_id = latest_item["camera_id"]
        timestamp = latest_item["timestamp"]
        detections = latest_item["detections"]
        
        frames = [item["frame"] for item in items]

        store.add_event(camera_id, timestamp, detections, description=None)

        recent_events = store.get_recent(camera_id, seconds=60)
        history = [e for e in recent_events if e["timestamp"] != timestamp]

        prompt = build_prompt(detections, history)
        description = query_vlm(frames, prompt)

        store.set_description(camera_id, timestamp, description)
        latest_description = f"[{camera_id}] {description}"


def main():
    config = load_config("config.yaml")
    frame_queue, ingest_processes = start_ingest(config)

    detection_queue: mp.Queue = mp.Queue(maxsize=50)
    detector_process = mp.Process(
        target=detection_worker,
        args=(frame_queue, detection_queue),
        name="detector",
        daemon=True,
    )
    detector_process.start()

    store = EventStore()
    global _api_store
    _api_store = store
    
    # Track a separate VLM queue and worker thread per camera
    vlm_queues = {}
    vlm_threads = {}

    threading.Thread(target=run_server, daemon=True).start()
    print("[visualize] Streaming at http://localhost:5001/ — press Ctrl+C to quit\n")

    last_frame = {}  # camera_id -> last rendered frame, shown while waiting for next
    global latest_frame, latest_description

    try:
        while True:
            try:
                item = detection_queue.get_nowait()
                cam = item["camera_id"]
                frame = item["frame"].copy()
                frame = draw_detections(frame, item["detections"])
                last_frame[cam] = frame
                
                # We pass the clean frame to the VLM (without bounding boxes) 
                # because thick bounding box lines and text can obscure fine-grained physical 
                # interactions like a foot striking a motorcycle.
                # Dynamically spawn a VLM worker for new cameras
                if cam not in vlm_queues:
                    vlm_queues[cam] = queue.Queue(maxsize=100)
                    t = threading.Thread(
                        target=vlm_worker,
                        args=(vlm_queues[cam], store),
                        daemon=True,
                    )
                    t.start()
                    vlm_threads[cam] = t
                
                try:
                    vlm_queues[cam].put_nowait(item)
                except queue.Full:
                    pass
            except queue.Empty:
                pass

            for cam, frame in last_frame.items():
                latest_frame[cam] = frame

            time.sleep(0.03)

    except KeyboardInterrupt:
        pass
    finally:
        for p in ingest_processes:
            p.terminate()
        detector_process.terminate()


if __name__ == "__main__":
    main()
