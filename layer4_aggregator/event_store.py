import threading
import time
from collections import deque
import numpy as np

try:
    from sentence_transformers import SentenceTransformer
    HAS_SENTENCE_TRANSFORMERS = True
except ImportError:
    HAS_SENTENCE_TRANSFORMERS = False
    print("[WARNING] sentence-transformers not installed. Semantic search will be unavailable.")

MAX_EVENT_AGE = 300  # seconds — prune events older than 5 minutes
MAX_EVENTS_PER_CAMERA = 500


class EventStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._events: dict[str, deque] = {}
        
        # Load the lightweight embedding model for semantic search
        self.embedding_model = None
        if HAS_SENTENCE_TRANSFORMERS:
            print("[EventStore] Loading embedding model 'all-MiniLM-L6-v2'...")
            self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
            print("[EventStore] Embedding model loaded.")

    def add_event(self, camera_id: str, timestamp: float, detections: list[dict], description: str | None = None):
        with self._lock:
            if camera_id not in self._events:
                self._events[camera_id] = deque(maxlen=MAX_EVENTS_PER_CAMERA)

            # Generate initial embedding if description is provided (rare for immediate add)
            embedding = None
            if description and self.embedding_model:
                embedding = self.embedding_model.encode(description)

            self._events[camera_id].append({
                "camera_id": camera_id,
                "timestamp": timestamp,
                "detections": detections,
                "description": description,
                "embedding": embedding,
            })

            self._prune(camera_id)

    def set_description(self, camera_id: str, timestamp: float, description: str):
        """Called by Layer 3 to attach VLM description to an existing event."""
        # Generate the embedding outside the lock to avoid blocking other threads
        embedding = None
        if self.embedding_model and description:
            embedding = self.embedding_model.encode(description)
            
        with self._lock:
            if camera_id not in self._events:
                return
            for event in reversed(self._events[camera_id]):
                if event["timestamp"] == timestamp:
                    event["description"] = description
                    event["embedding"] = embedding
                    return

    def semantic_search(self, query: str, limit: int = 10) -> list[dict]:
        """Searches events by meaning using cosine similarity on embeddings."""
        if not self.embedding_model:
            print("[Error] Semantic search requested but model is not loaded.")
            return []
            
        query_emb = self.embedding_model.encode(query)
        
        scored_events = []
        with self._lock:
            for events in self._events.values():
                for e in events:
                    if e.get("embedding") is not None:
                        # Cosine similarity: (A dot B) / (||A|| * ||B||)
                        # sentence-transformers outputs normalized vectors by default in many cases, 
                        # but standard numpy cosine similarity is safest.
                        a = query_emb
                        b = e["embedding"]
                        similarity = np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
                        scored_events.append((similarity, e))
                        
        # Sort by similarity (highest first)
        scored_events.sort(key=lambda x: x[0], reverse=True)
        
        # Return the actual event dictionaries, sorted
        return [e for score, e in scored_events[:limit]]

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
