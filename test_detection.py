"""
Smoke test for Layer 1 + Layer 2. Run from the project root:
    python3 test_detection.py

Prints detection events as they arrive. Requires config.yaml and a video source.
"""
import multiprocessing as mp
import time

from layer1_ingest.ingest import load_config, start_ingest
from layer2_detection.worker import detection_worker


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
    print(f"[test] Detector started (pid {detector_process.pid})\n")

    try:
        while True:
            event = detection_queue.get(timeout=15)
            cam = event["camera_id"]
            ts = event["timestamp"]
            detections = event["detections"]

            print(f"[{cam}] ts={ts:.3f}  {len(detections)} object(s) detected:")
            for det in detections:
                label = det["label"]
                conf = det["confidence"]
                bbox = det["bbox"]
                print(f"    {label:12s}  conf={conf:.2f}  bbox={bbox}")
            print()

    except KeyboardInterrupt:
        print("\n[test] Stopping.")
    finally:
        for p in ingest_processes:
            p.terminate()
        detector_process.terminate()


if __name__ == "__main__":
    main()
