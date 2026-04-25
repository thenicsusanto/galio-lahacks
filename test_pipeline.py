"""
Smoke test for Layers 1 + 2 + 3 + event store.
Run from the project root:
    python3 test_pipeline.py

Prints VLM descriptions as they arrive. Press Ctrl+C to stop.
"""
import multiprocessing as mp
import threading
import time

from layer1_ingest.ingest import load_config, start_ingest
from layer2_detection.worker import detection_worker
from layer3_vlm.worker import vlm_worker
from layer4_aggregator.event_store import EventStore


def print_store_summary(store: EventStore, interval: int = 10):
    """Background thread — prints a snapshot of the event store every N seconds."""
    while True:
        time.sleep(interval)
        events = store.get_all_recent(seconds=60)
        print(f"\n--- Event store snapshot: {len(events)} event(s) in last 60s ---")
        for e in events:
            desc = e["description"] or "(no description yet)"
            print(f"  [{e['camera_id']}] {desc}")
        print()


def main():
    config = load_config("config.yaml")

    # Layer 1 — ingest
    frame_queue, ingest_processes = start_ingest(config)

    # Layer 2 — detection
    detection_queue: mp.Queue = mp.Queue(maxsize=50)
    detector_process = mp.Process(
        target=detection_worker,
        args=(frame_queue, detection_queue),
        name="detector",
        daemon=True,
    )
    detector_process.start()

    # Shared event store
    store = EventStore()

    # Layer 3 — VLM (runs in a thread so it shares the store object directly)
    vlm_thread = threading.Thread(
        target=vlm_worker,
        args=(detection_queue, store),
        name="vlm",
        daemon=True,
    )
    vlm_thread.start()

    # Background thread that prints store state every 10 seconds
    summary_thread = threading.Thread(
        target=print_store_summary,
        args=(store,),
        daemon=True,
    )
    summary_thread.start()

    print("[pipeline] Running — press Ctrl+C to stop\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[pipeline] Stopping.")
    finally:
        for p in ingest_processes:
            p.terminate()
        detector_process.terminate()


if __name__ == "__main__":
    main()
