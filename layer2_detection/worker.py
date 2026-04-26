import multiprocessing as mp
import time

from layer2_detection.detector import Detector


def detection_worker(in_queue: mp.Queue, out_queue: mp.Queue):
    """
    Subprocess entry point. Pulls frames from Layer 1 queue, runs YOLO,
    and pushes detection events to the Layer 3 queue.
    Only forwards frames where at least one relevant object was detected.
    """
    detector = Detector()
    frame_count = 0
    t_window = time.monotonic()

    while True:
        item = in_queue.get()  # blocks until a frame is available

        # Drain any backlog — only run YOLO on the newest frame.
        # Without this, a slow YOLO pass causes the queue to fill and
        # every subsequent frame is processed in order, compounding lag.
        drained = 0
        while True:
            try:
                item = in_queue.get_nowait()
                drained += 1
            except Exception:
                break
        if drained:
            print(f"[detector] skipped {drained} stale frames (queue was backed up)")

        t0 = time.monotonic()
        frame = item["frame"]
        anonymized_frame, detections = detector.detect(frame)
        elapsed = time.monotonic() - t0

        frame_count += 1
        if frame_count % 20 == 0:
            window = time.monotonic() - t_window
            print(f"[detector] ~{frame_count / window:.1f} fps  last inference={elapsed*1000:.0f}ms")
            frame_count = 0
            t_window = time.monotonic()

        if not detections:
            continue  # nothing detected — don't bother the VLM

        out_queue.put({
            "camera_id": item["camera_id"],
            "timestamp": item["timestamp"],
            "frame": anonymized_frame,
            "detections": detections,
        })
