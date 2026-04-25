import time
from layer4_aggregator.event_store import EventStore

def run_test():
    print("Initializing EventStore (this will download weights if first run)...")
    store = EventStore()
    
    if not store.embedding_model:
        print("sentence-transformers not installed. Cannot test semantic search.")
        return

    print("\nAdding mock events...")
    
    # We only care about the description for this test
    events_to_add = [
        "A man in a red shirt walking a golden retriever",
        "A silver sedan speeding through the intersection",
        "A person loitering near the backdoor",
        "Two people arguing aggressively in the parking lot",
        "A delivery driver dropping off a package",
    ]
    
    # Add dummy events and set descriptions
    for i, desc in enumerate(events_to_add):
        cam_id = f"cam_{i}"
        ts = time.time() - (100 - i * 10) # spread timestamps
        
        # Add event without description first (simulating Layer 2)
        store.add_event(cam_id, ts, [])
        # Update with description (simulating Layer 3)
        store.set_description(cam_id, ts, desc)
        
        print(f"Added: '{desc}'")

    print("\n--- Testing Semantic Search ---")
    
    queries = [
        "someone walking a dog",
        "car moving fast",
        "suspicious activity by entrance",
        "fight or altercation",
    ]
    
    for q in queries:
        print(f"\nQuery: '{q}'")
        results = store.semantic_search(q, limit=2)
        for i, res in enumerate(results):
            desc = res.get('description', 'N/A')
            print(f"  {i+1}. {desc}")

if __name__ == "__main__":
    run_test()
