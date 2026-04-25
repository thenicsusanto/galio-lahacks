import time


def format_detections(detections: list[dict]) -> str:
    counts = {}
    for det in detections:
        counts[det["label"]] = counts.get(det["label"], 0) + 1
    return ", ".join(f"{count} {label}" for label, count in counts.items())


def build_prompt(current_detections: list[dict], recent_events: list[dict]) -> str:
    current_summary = format_detections(current_detections)

    history_lines = []
    now = time.time()
    for event in recent_events:
        seconds_ago = int(now - event["timestamp"])
        det_summary = format_detections(event["detections"])
        line = f"  - {seconds_ago}s ago: {det_summary}"
        if event.get("description"):
            line += f' — "{event["description"]}"'
        history_lines.append(line)

    history_block = "\n".join(history_lines) if history_lines else "  No prior events."

    return f"""You are a security monitoring AI reviewing a sequence of chronological frames from a live camera feed.
The frames provided span approximately 2.5 seconds. You MUST analyze the motion and changes between Frame 1 and Frame 4.

Recent activity on this camera (last 60 seconds):
{history_block}

Current detections in the latest frame: {current_summary}
Note: The action may involve small objects in the distance, or a person who has just left the frame. Observe the entire frame carefully. CRITICAL: Do not hallucinate human presence. If a person is not clearly visible or not listed in the current detections, assume that any irregular shapes on the ground are fallen property or objects, not people. Trust the provided detections to identify what the objects are.

Identify high-risk anomalies focusing on fine-grained human actions and physical motion between the frames:

1. THEFT & CONCEALMENT: Identify "staging" (placing items in corners/strollers), "shielding" (using body/coat to block camera view of hands), or "clothing interaction" (adjusting waistband, tucking items under oversized hoodies/coats).
2. VANDALISM/ARSON: Identify handling of spray cans/markers near surfaces, repetitive striking/kicking of property, intentionally pushing/knocking over property (e.g., knocking over a motorcycle/vehicle), or ignition sources (lighters/matches) in non-smoking zones.
3. HOSTILE SURVEILLANCE: Detect "repeated perching" (returning to the same spot 3+ times), "blind spot testing" (walking to corners and looking directly at camera placement), or surreptitious photography.
4. VIOLENCE: Detect rapid/aggressive movement, fighting, or assault, alongside weapons that could be used for violence.

Output Format (JSON ONLY):
{{
  "category": "Theft | Vandalism | Surveillance | Violence | None",
  "anomaly_score": 0.0-1.0,
  "rationale": "1-2 sentences describing the specific physical action and intent. Explicitly describe the motion or changes you see between the 4 frames.",
  "action_required": "Immediate | Monitor | Log"
}}"""
