import multiprocessing as mp

from layer2_detection.detector import Detector


def detection_worker(in_queue: mp.Queue, out_queue: mp.Queue):
    """
    Subprocess entry point. Pulls frames from Layer 1 queue, runs YOLO,
    and pushes detection events to the Layer 3 queue.
    Only forwards frames where at least one relevant object was detected.
    """
    detector = Detector()

    while True:
        item = in_queue.get()  # blocks until a frame is available

        frame = item["frame"]
        anonymized_frame, detections = detector.detect(frame)

        if not detections:
            continue  # nothing detected — don't bother the VLM

        out_queue.put({
            "camera_id": item["camera_id"],
            "timestamp": item["timestamp"],
            "frame": anonymized_frame,
            "detections": detections,
        })
