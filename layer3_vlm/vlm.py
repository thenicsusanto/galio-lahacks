import base64
import json

import cv2
import numpy as np
import requests

OLLAMA_URL = "http://localhost:11434/api/generate"
VLM_MODEL = "qwen2.5vl:7b"
STUB_MODE = False  # set True if Ollama is not available


def frame_to_base64(frame: np.ndarray) -> str:
    _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return base64.b64encode(buffer).decode("utf-8")


def query_vlm(frame: np.ndarray, prompt: str) -> str:
    if STUB_MODE:
        return "[stub] Person detected near entrance, behavior appears normal."

    image_b64 = frame_to_base64(frame)

    payload = {
        "model": VLM_MODEL,
        "prompt": prompt,
        "images": [image_b64],
        "stream": False,
    }

    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=30)
        response.raise_for_status()
        return response.json()["response"].strip()
    except Exception as e:
        return f"[vlm error] {e}"
