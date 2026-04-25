"""
Smoke test for Layer 1. Run from the project root:
  python test_ingest.py

Prints frame metadata as they arrive. Does not require Layer 2+.
You need at least one video file in footage/ and config.yaml pointing at it.
"""
import time

from layer1_ingest.ingest import load_config, start_ingest


def main():
    config = load_config("config.yaml")
    frame_queue, processes = start_ingest(config)

    print(f"\n[test] Consuming frames from {len(processes)} camera(s). Ctrl+C to stop.\n")

    frame_counts: dict[str, int] = {}
    start = time.time()

    try:
        while True:
            item = frame_queue.get(timeout=10)
            cam = item["camera_id"]
            ts = item["timestamp"]
            h, w = item["frame"].shape[:2]

            frame_counts[cam] = frame_counts.get(cam, 0) + 1
            elapsed = time.time() - start
            fps = frame_counts[cam] / elapsed

            print(f"[{cam}] frame #{frame_counts[cam]:04d}  {w}x{h}  ts={ts:.3f}  effective={fps:.1f}fps")

    except KeyboardInterrupt:
        print("\n[test] Stopping.")
    finally:
        for p in processes:
            p.terminate()


if __name__ == "__main__":
    main()
