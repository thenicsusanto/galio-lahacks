import threading
import time
from collections import deque


MAX_EVENT_AGE = 300  # seconds — prune events older than 5 minutes
MAX_EVENTS_PER_CAMERA = 500


class EventStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._events: dict[str, deque] = {}

    def add_event(self, camera_id: str, timestamp: float, detections: list[dict], description: str | None = None):
        with self._lock:
            if camera_id not in self._events:
                self._events[camera_id] = deque(maxlen=MAX_EVENTS_PER_CAMERA)

            self._events[camera_id].append({
                "camera_id": camera_id,
                "timestamp": timestamp,
                "detections": detections,
                "description": description,
            })

            self._prune(camera_id)

    def set_description(self, camera_id: str, timestamp: float, description: str):
        """Called by Layer 3 to attach VLM description to an existing event."""
        with self._lock:
            if camera_id not in self._events:
                return
            for event in reversed(self._events[camera_id]):
                if event["timestamp"] == timestamp:
                    event["description"] = description
                    return

    def get_recent(self, camera_id: str, seconds: int = 60) -> list[dict]:
        """Returns events for one camera within the last N seconds."""
        cutoff = time.time() - seconds
        with self._lock:
            if camera_id not in self._events:
                return []
            return [event for event in self._events[camera_id] if event["timestamp"] >= cutoff]

    def get_all_recent(self, seconds: int = 60) -> list[dict]:
        """Returns events across all cameras within the last N seconds, sorted by time."""
        cutoff = time.time() - seconds
        with self._lock:
            all_events = [
                e
                for events in self._events.values()
                for e in events
                if e["timestamp"] >= cutoff
            ]
        return sorted(all_events, key=lambda e: e["timestamp"])

    def camera_ids(self) -> list[str]:
        with self._lock:
            return list(self._events.keys())

    def _prune(self, camera_id: str):
        cutoff = time.time() - MAX_EVENT_AGE
        events = self._events[camera_id]
        while events and events[0]["timestamp"] < cutoff:
            events.popleft()
