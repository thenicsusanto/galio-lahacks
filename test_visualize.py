"""
Visualizes Layer 1 + Layer 2 output with bounding boxes drawn on frames.
Run from the project root:
    python3 test_visualize.py

Press Q to quit.
"""
import multiprocessing as mp

import cv2
from http.server import BaseHTTPRequestHandler, HTTPServer
import threading
import time

from layer1_ingest.ingest import load_config, start_ingest
from layer2_detection.worker import detection_worker

latest_frame = None

class StreamingHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(b'<html><body><h1>Galio Visualization</h1><img src="/video_feed" width="800"></body></html>')
        elif self.path == '/video_feed':
            self.send_response(200)
            self.send_header('Content-type', 'multipart/x-mixed-replace; boundary=frame')
            self.end_headers()
            try:
                while True:
                    if latest_frame is not None:
                        ret, jpeg = cv2.imencode('.jpg', latest_frame)
                        if ret:
                            self.wfile.write(b'--frame\r\n')
                            self.send_header('Content-type', 'image/jpeg')
                            self.send_header('Content-length', str(len(jpeg.tobytes())))
                            self.end_headers()
                            self.wfile.write(jpeg.tobytes())
                            self.wfile.write(b'\r\n')
                    time.sleep(0.05)
            except Exception:
                pass
        else:
            self.send_error(404)

def run_server():
    server = HTTPServer(('', 5000), StreamingHandler)
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

        text = f"{label} {conf:.2f}"
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(frame, (x1, y1 - th - 6), (x1 + tw + 4, y1), color, -1)
        cv2.putText(frame, text, (x1 + 2, y1 - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)

    return frame


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
    threading.Thread(target=run_server, daemon=True).start()
    print("[visualize] Streaming at http://localhost:5000/ — press Ctrl+C to quit\n")

    global latest_frame
    try:
        while True:
            event = detection_queue.get(timeout=15)
            frame = event["frame"].copy()
            frame = draw_detections(frame, event["detections"])

            latest_frame = frame

    except KeyboardInterrupt:
        pass
    finally:
        for p in ingest_processes:
            p.terminate()
        detector_process.terminate()


if __name__ == "__main__":
    main()
