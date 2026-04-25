import multiprocessing as mp

from layer1_ingest.capture import CameraCapture


def ingest_worker(camera_cfg: dict, target_fps: int, out_queue: mp.Queue):
    """
    Subprocess entry point. Reads frames from one camera and puts them on the
    shared queue. Drops frames silently if the queue is full (backpressure).
    """
    capture = CameraCapture(camera_cfg, target_fps)
    camera_id = camera_cfg["id"]

    for camera_id, timestamp, frame in capture.frames():
        item = {
            "camera_id": camera_id,
            "timestamp": timestamp,
            "frame": frame,
        }
        try:
            out_queue.put_nowait(item)
        except Exception:
            # Queue full — downstream is behind, drop this frame
            pass
