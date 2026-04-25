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

    return f"""You are a security monitoring AI reviewing a live camera feed.

Recent activity on this camera (last 60 seconds):
{history_block}

Current frame detections: {current_summary}

Describe any unusual or concerning behavior visible in this frame.
Consider the history above — note patterns like loitering, repeated appearances, or unattended objects.
Be concise: 1-2 sentences maximum."""
