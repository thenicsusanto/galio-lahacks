import multiprocessing as mp

from layer3_vlm.prompt import build_prompt
from layer3_vlm.vlm import query_vlm
from layer4_aggregator.event_store import EventStore


def vlm_worker(in_queue: mp.Queue, store: EventStore):
    """
    Receives detection events from Layer 2, enriches them with VLM descriptions,
    and writes everything into the event store.
    """
    while True:
        item = in_queue.get()

        camera_id = item["camera_id"]
        timestamp = item["timestamp"]
        detections = item["detections"]
        frame = item["frame"]

        # Step 1 — add the event immediately so history is available for the prompt
        store.add_event(camera_id, timestamp, detections, description=None)

        # Step 2 — read recent history for this camera (excluding the event just added)
        recent_events = store.get_recent(camera_id, seconds=60)
        history = [e for e in recent_events if e["timestamp"] != timestamp]

        # Step 3 — build prompt and query VLM
        prompt = build_prompt(detections, history)
        try:
            description = query_vlm([frame], prompt)
        except Exception as exc:
            print(f"[{camera_id}] vlm error: {exc}")
            continue

        # Step 4 — attach description back to the event in the store
        store.set_description(camera_id, timestamp, description)

        print(f"[{camera_id}] {description}")
