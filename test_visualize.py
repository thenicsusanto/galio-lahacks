"""
Visualizes Layer 1 + Layer 2 output with bounding boxes drawn on frames.
Run from the project root:
    python3 test_visualize.py

Press Q to quit.
"""
import multiprocessing as mp

import cv2

from layer1_ingest.ingest import load_config, start_ingest
from layer2_detection.worker import detection_worker

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
    print("[visualize] Running — press Q to quit\n")

    try:
        while True:
            event = detection_queue.get(timeout=15)
            frame = event["frame"].copy()
            frame = draw_detections(frame, event["detections"])

            cv2.imshow(f"Galio — {event['camera_id']}", frame)

            if cv2.waitKey(1) & 0xFF == ord("q"):
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
