"""
Visualizes the full pipeline: bounding boxes + VLM description overlaid on frame.
Run from the project root:
    python3 test_visualize_pipeline.py

Press Q to quit.
"""
import multiprocessing as mp
import queue
import threading
import time

import cv2

from layer1_ingest.ingest import load_config, start_ingest
from layer2_detection.worker import detection_worker
from layer3_vlm.prompt import build_prompt
from layer3_vlm.vlm import query_vlm
from layer4_aggregator.event_store import EventStore

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


def draw_description(frame, description: str):
    """Wraps and draws the VLM description at the bottom of the frame."""
    h, w = frame.shape[:2]
    margin = 8
    max_chars = w // 7

    # Word-wrap the description
    words = description.split()
    lines, current = [], ""
    for word in words:
        if len(current) + len(word) + 1 <= max_chars:
            current += ("" if not current else " ") + word
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)

    bar_h = len(lines) * 20 + margin * 2
    cv2.rectangle(frame, (0, h - bar_h), (w, h), (0, 0, 0), -1)

    for i, line in enumerate(lines):
        y = h - bar_h + margin + i * 20 + 12
        cv2.putText(frame, line, (margin, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
    return frame


def vlm_display_worker(in_queue: mp.Queue, display_queue: queue.Queue, store: EventStore):
    """Runs VLM inference and pushes annotated frames to the display queue."""
    while True:
        item = in_queue.get()

        camera_id = item["camera_id"]
        timestamp = item["timestamp"]
        detections = item["detections"]
        frame = item["frame"]

        store.add_event(camera_id, timestamp, detections, description=None)

        recent_events = store.get_recent(camera_id, seconds=60)
        history = [e for e in recent_events if e["timestamp"] != timestamp]

        prompt = build_prompt(detections, history)
        description = query_vlm(frame, prompt)

        store.set_description(camera_id, timestamp, description)

        display_queue.put({
            "camera_id": camera_id,
            "frame": frame,
            "detections": detections,
            "description": description,
        })


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
    display_queue: queue.Queue = queue.Queue(maxsize=10)

    vlm_thread = threading.Thread(
        target=vlm_display_worker,
        args=(detection_queue, display_queue, store),
        daemon=True,
    )
    vlm_thread.start()

    print("[visualize] Running — press Q to quit\n")

    last_frame = {}  # camera_id -> last rendered frame, shown while waiting for next

    try:
        while True:
            try:
                item = display_queue.get_nowait()
                cam = item["camera_id"]
                frame = item["frame"].copy()
                frame = draw_detections(frame, item["detections"])
                frame = draw_description(frame, item["description"])
                last_frame[cam] = frame
            except queue.Empty:
                pass

            for cam, frame in last_frame.items():
                cv2.imshow(f"Galio — {cam}", frame)

            if cv2.waitKey(30) & 0xFF == ord("q"):
                break

    except KeyboardInterrupt:
        pass
    finally:
        cv2.destroyAllWindows()
        for p in ingest_processes:
            p.terminate()
        detector_process.terminate()


if __name__ == "__main__":
    main()
