import time
import cv2


class CameraCapture:
    """Reads frames from a single video source and yields sampled frames."""

    def __init__(self, camera_cfg: dict, target_fps: int):
        self.camera_id = camera_cfg["id"]
        self.source_type = camera_cfg["type"]
        self.loop = camera_cfg.get("loop", False)
        self.target_fps = target_fps
        self._frame_interval = 1.0 / target_fps

        if self.source_type == "file":
            self._source = camera_cfg["path"]
        elif self.source_type == "rtsp":
            self._source = camera_cfg["url"]
        else:
            raise ValueError(f"Unknown camera type: {self.source_type}")

    def frames(self):
        """Generator that yields (camera_id, timestamp, frame) tuples at target_fps."""
        while True:
            cap = cv2.VideoCapture(self._source)
            if not cap.isOpened():
                print(f"[{self.camera_id}] Failed to open source: {self._source}")
                time.sleep(5)
                continue

            last_sample = 0.0

            while True:
                ret, frame = cap.read()

                if not ret:
                    # End of file or stream dropped
                    if self.loop and self.source_type == "file":
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        continue
                    else:
                        print(f"[{self.camera_id}] Stream ended, retrying in 5s")
                        break

                if self.source_type == "file":
                    # Simulate real-time playback for video files
                    now = time.monotonic()
                    time_to_wait = last_sample + self._frame_interval - now
                    if time_to_wait > 0:
                        time.sleep(time_to_wait)
                    last_sample = time.monotonic()
                    yield self.camera_id, time.time(), frame
                else:
                    # Drop frames for live streams to keep up with real time
                    now = time.monotonic()
                    if now - last_sample < self._frame_interval:
                        continue
                    last_sample = now
                    yield self.camera_id, time.time(), frame

            cap.release()

            if not self.loop and self.source_type == "file":
                break

            time.sleep(1)
