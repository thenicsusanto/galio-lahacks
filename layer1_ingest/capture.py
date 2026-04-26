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
            cap = cv2.VideoCapture(self._source, cv2.CAP_FFMPEG)
            if not cap.isOpened():
                print(f"[{self.camera_id}] Failed to open source: {self._source}")
                time.sleep(5)
                continue

            if self.source_type == "rtsp":
                # Keep only 1 frame in the decode buffer to minimize latency.
                # Without this OpenCV/FFMPEG buffers several seconds of video.
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            last_sample = 0.0

            while True:
                if self.source_type == "rtsp":
                    # For live streams: skip frames that we don't need to sample
                    # using grab() (advances the buffer without a full decode) so
                    # we always consume the stream in real time without CPU waste.
                    now = time.monotonic()
                    if now - last_sample < self._frame_interval:
                        if not cap.grab():
                            print(f"[{self.camera_id}] Stream ended, retrying in 5s")
                            break
                        continue
                    ret, frame = cap.read()
                    if not ret:
                        print(f"[{self.camera_id}] Stream ended, retrying in 5s")
                        break
                    last_sample = now
                    yield self.camera_id, time.time(), frame
                else:
                    ret, frame = cap.read()
                    if not ret:
                        if self.loop:
                            cap.release()
                            break  # re-open cleanly via outer loop
                        else:
                            print(f"[{self.camera_id}] Stream ended, retrying in 5s")
                            break
                    # Simulate real-time playback for video files
                    now = time.monotonic()
                    time_to_wait = last_sample + self._frame_interval - now
                    if time_to_wait > 0:
                        time.sleep(time_to_wait)
                    last_sample = time.monotonic()
                    yield self.camera_id, time.time(), frame

            cap.release()

            if not self.loop and self.source_type == "file":
                break

            time.sleep(1)
