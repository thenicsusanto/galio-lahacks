import base64
import json
import os

import cv2
import numpy as np
import requests
import yaml


def _load_model_cfg() -> dict:
    cfg_path = os.path.join(os.path.dirname(__file__), "..", "config.yaml")
    try:
        with open(cfg_path) as f:
            return yaml.safe_load(f).get("models", {})
    except Exception:
        return {}


_cfg = _load_model_cfg()
VLLM_URL  = _cfg.get("vlm_url",   "http://localhost:8000/v1/chat/completions")
VLM_MODEL = _cfg.get("vlm_model", "nvidia/cosmos-reason2-2b")
STUB_MODE = False  # set True if vLLM is not available


def frame_to_base64(frame: np.ndarray) -> str:
    h, w = frame.shape[:2]
    max_dim = 512
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        frame = cv2.resize(frame, (int(w * scale), int(h * scale)))

    _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return base64.b64encode(buffer).decode("utf-8")


def query_vlm(frames: list[np.ndarray], prompt: dict) -> str:
    """
    prompt: dict with 'system' and 'user' keys, as returned by build_prompt()
    """
    if STUB_MODE:
        return "[stub] Person detected near entrance, behavior appears normal."

    frames = frames[:6]

    image_blocks = [
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{frame_to_base64(f)}"},
        }
        for f in frames
    ]

    messages = [
        {
            "role": "system",
            "content": prompt["system"],
        },
        {
            "role": "user",
            "content": [
                *image_blocks,
                {"type": "text", "text": prompt["user"]},
            ],
        },
    ]

    payload = {
        "model": VLM_MODEL,
        "messages": messages,
        "max_tokens": 150,
        "temperature": 0.1,
        "top_p": 0.9,
    }

    response = None
    try:
        response = requests.post(VLLM_URL, json=payload, timeout=60)
        response.raise_for_status()
        result = response.json()["choices"][0]["message"]["content"].strip()
        result = result.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return result
    except requests.exceptions.HTTPError as e:
        print(f"--- VLM API ERROR (Status {response.status_code}) ---")
        try:
            print(json.dumps(response.json(), indent=2))
        except Exception:
            print(response.text)
        print("----------------------------------------------")
        raise e