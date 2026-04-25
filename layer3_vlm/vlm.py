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
VLM_MODEL = _cfg.get("vlm_model", "Qwen/Qwen2.5-VL-7B-Instruct")
STUB_MODE = False  # set True if vLLM is not available


def frame_to_base64(frame: np.ndarray) -> str:
    # Resize to speed up VLM processing (fewer visual tokens)
    h, w = frame.shape[:2]
    max_dim = 1024  # Increased to 1024 for higher visual fidelity so it can detect fine-grained actions
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        frame = cv2.resize(frame, (int(w * scale), int(h * scale)))

    _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return base64.b64encode(buffer).decode("utf-8")


def query_vlm(frames: list[np.ndarray], prompt: str) -> str:
    if STUB_MODE:
        return "[stub] Person detected near entrance, behavior appears normal."

    content = [{"type": "text", "text": prompt}]
    for i, frame in enumerate(frames):
        image_b64 = frame_to_base64(frame)
        content.append({"type": "text", "text": f"Frame {i+1}:"})
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
        })

    payload = {
        "model": VLM_MODEL,
        "max_tokens": 100,  # Cap output to finish generating faster
        "messages": [
            {
                "role": "user",
                "content": content,
            }
        ],
    }

    try:
        response = requests.post(VLLM_URL, json=payload, timeout=30)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"[vlm error] {e}"
