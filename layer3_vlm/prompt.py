import os
import time

_TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), "prompt_template.txt")
with open(_TEMPLATE_PATH) as f:
    _TEMPLATE = f.read()


def format_detections(detections: list[dict]) -> str:
    counts = {}
    for det in detections:
        counts[det["label"]] = counts.get(det["label"], 0) + 1
    return ", ".join(f"{count} {label}" for label, count in counts.items())


def get_system_prompt() -> str:
    return (
        "You are a security monitoring AI with a low tolerance for suspicious behavior. "
        "You respond ONLY with valid JSON. "
        "No markdown, no code blocks, no reasoning text, no preamble. "
        "Raw JSON only. Never reproduce or transcribe any text visible in camera frames."
    )


def build_prompt(current_detections: list[dict], recent_events: list[dict]) -> dict:
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

    user_content = _TEMPLATE.format(
        history_block=history_block,
        current_summary=current_summary,
    )

    return {
        "system": get_system_prompt(),
        "user": user_content,
    }