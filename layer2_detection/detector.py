import cv2
import numpy as np
import os
import warnings
import yaml
with warnings.catch_warnings():
    warnings.filterwarnings("ignore", category=UserWarning)
    from ultralytics import YOLO

# COCO class IDs we care about for security monitoring
RELEVANT_CLASSES = {
    0: "person",
    24: "backpack",
    26: "handbag",
    28: "suitcase",
    # 2: "car",
    3: "motorcycle",
    # 5: "bus",
    # 7: "truck",
}

CONFIDENCE_THRESHOLD = 0.4


class Detector:
    def __init__(self):
        cfg_path = os.path.join(os.path.dirname(__file__), "..", "config.yaml")
        try:
            with open(cfg_path) as f:
                models_cfg = yaml.safe_load(f).get("models", {})
                yolo_weights = models_cfg.get("yolo", "yolo26s.pt")
                self.imgsz = models_cfg.get("yolo_imgsz", 416)
        except Exception:
            yolo_weights = "yolo26s.pt"
            self.imgsz = 416
        self.model = YOLO(yolo_weights)

    def detect(self, frame: np.ndarray) -> tuple[np.ndarray, list[dict]]:
        """
        Runs YOLO on a frame.
        Returns (anonymized_frame, detections) where detections is a list of:
            {"label": str, "confidence": float, "bbox": [x1, y1, x2, y2]}
        Only includes relevant classes above confidence threshold.
        """
        results = self.model(frame, verbose=False, imgsz=self.imgsz)[0]

        detections = []
        for box in results.boxes:
            class_id = int(box.cls[0])
            if class_id not in RELEVANT_CLASSES:
                continue

            confidence = float(box.conf[0])
            if confidence < CONFIDENCE_THRESHOLD:
                continue

            x1, y1, x2, y2 = map(int, box.xyxy[0])
            detections.append({
                "label": RELEVANT_CLASSES[class_id],
                "confidence": round(confidence, 3),
                "bbox": [x1, y1, x2, y2],
            })

        anonymized = self._blur_faces(frame, detections)
        return anonymized, detections

    def _blur_faces(self, frame: np.ndarray, detections: list[dict]) -> np.ndarray:
        """
        For each detected person, blur the upper third of their bounding box
        (where the face is likely to be). Fast approximation — no separate face detector.
        """
        out = frame.copy()
        for det in detections:
            if det["label"] != "person":
                continue

            x1, y1, x2, y2 = det["bbox"]
            h = y2 - y1
            w = x2 - x1
            
            face_y2 = y1 + h // 6       # only top 1/6th for the head
            face_x1 = x1 + w // 4       # inset left side
            face_x2 = x2 - w // 4       # inset right side

            # Clamp to frame bounds
            face_x1 = max(0, face_x1)
            y1 = max(0, y1)
            face_x2 = min(frame.shape[1], face_x2)
            face_y2 = min(frame.shape[0], face_y2)

            region = out[y1:face_y2, face_x1:face_x2]
            if region.size == 0:
                continue

            blurred = cv2.GaussianBlur(region, (51, 51), 0)
            out[y1:face_y2, face_x1:face_x2] = blurred

        return out
