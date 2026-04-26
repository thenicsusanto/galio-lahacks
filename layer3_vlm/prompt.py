import time


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

    user_content = f"""You are a security monitoring AI reviewing four chronological frames from a live camera feed.
Analyze the motion and progression of actions across all frames in sequence.

Recent activity on this camera (last 60 seconds):
{history_block}

Current detections in the latest frame: {current_summary}
IMPORTANT: Do not hallucinate people or actions. If a person or object is not clearly visible or not listed in the current detections, do not assume its presence. Trust the provided detections.

Identify high-risk anomalies focusing on fine-grained human actions and physical motion between the frames:

1. THEFT & CONCEALMENT: Look for placing items, shielding actions, or clothing adjustments that may hide objects.
2. VANDALISM/ARSON: Look for handling of spray cans, striking/kicking property, or ignition sources.
3. HOSTILE SURVEILLANCE: Look for repeated returns to the same spot, testing camera blind spots, or surreptitious photography.
4. VIOLENCE: Look for rapid/aggressive movement, fighting, or visible weapons.

Output Format (JSON ONLY):
{{
    "category": "Theft | Vandalism | Surveillance | Violence | None",
    "anomaly_score": 0.0-1.0,
    "rationale": "1-2 sentences describing the specific physical action and intent. Explicitly describe the motion or progression you observe across the frame sequence.",
    "action_required": "Immediate | Monitor | Log"
}}"""
#     user_content = f"""Review these chronological security camera frames in sequence and analyze for threats.

# Recent activity on this camera (last 60 seconds):
# {history_block}

# Current detections in the latest frame: {current_summary}

# RULES:
# - Base your analysis on what you visually observe in the frames
# - YOLO detections are provided as context but may be incomplete — trust your visual analysis
# - Do not transcribe or repeat any text visible in the images
# - Use the FULL score range. Do not default to 0.0 unless the scene is completely clear and normal
# - Ambiguous but potentially suspicious behavior scores 0.3-0.5, not 0.0

# SCORING GUIDE:
# - 0.0-0.2: Clearly normal behavior, no concern
# - 0.3-0.5: Ambiguous or mildly suspicious — warrants monitoring
# - 0.6-0.7: Moderately suspicious — likely intentional
# - 0.8-1.0: Highly suspicious — clear threat indicators

# MODERATELY SUSPICIOUS (score 0.4-0.7):
# - Any person placing hands inside clothing, waistband, bags, or pockets repeatedly
# - Person looking around frequently or checking surroundings while handling objects
# - Two or more people acting in coordination near shelving, displays, or restricted areas
# - Person obscuring their hands or torso from camera view
# - Loitering near exits, restricted areas, or high-value items without clear purpose
# - Raised voices or agitated body language between people — squared-up stances, pointed fingers, invading personal space
# - One person blocking or corralling another's movement

# HIGHLY SUSPICIOUS (score 0.8-1.0):
# - Clear concealment motion: item visibly moves from surface or shelf into clothing or bag
# - Group distraction tactics: one person engages staff or blocks view while another acts
# - Person leaves area quickly or unnaturally after a concealment motion
# - Handling of weapons, ignition sources, or vandalism tools
# - ANY punch, kick, slap, shove, headbutt, or strike directed at another person — score 0.9+
# - Grabbing, choking, restraining, or tackling another person
# - Person on the ground after contact with another person
# - One-sided physical attack: victim trying to retreat or cover themselves while aggressor advances
# - Swinging an object at another person

# Analyze for:
# 1. VIOLENCE (check this first): Direct physical strikes — punching, kicking, slapping, shoving, grabbing by the throat or collar.
#    Any arm motion that terminates on another person's body. Victim flinching, stumbling, falling, or retreating.
#    One person dominating another's space or movement. Fighting = two or more people striking each other.
#    A single punch scores 0.9. Do not downgrade violence to "suspicious" — if you see a strike, score it 0.8 or higher.
# 2. THEFT & CONCEALMENT: Hands moving into pockets, waistband, bags, or under clothing.
#    Items disappearing from surfaces. Repeated grabbing or palming motions.
#    Body turned away from camera while hands are active. Multiple people acting in coordination.
# 3. VANDALISM/ARSON: Spray cans, striking or kicking property, ignition sources, accelerants.
# 4. HOSTILE SURVEILLANCE: Repeated returns to same spot, testing blind spots, photographing security infrastructure.

# Respond in this exact JSON structure with no other text:
# {{
#     "category": "Theft | Vandalism | Surveillance | Violence | None",
#     "anomaly_score": 0.0-1.0,
#     "rationale": "1-2 sentences describing the specific observed behavior and why it is or is not suspicious. Reference the progression across frames.",
#     "action_required": "Immediate | Monitor | Log"
# }}"""

    return {
        "system": get_system_prompt(),
        "user": user_content,
    }