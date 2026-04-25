import multiprocessing as mp

import yaml

from layer1_ingest.worker import ingest_worker


def load_config(path: str = "config.yaml") -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def start_ingest(config: dict) -> tuple[mp.Queue, list[mp.Process]]:
    """
    Spawns one ingest process per camera.
    Returns the shared frame queue and the list of processes.
    """
    ingest_cfg = config["ingest"]
    target_fps = ingest_cfg["target_fps"]
    queue_maxsize = ingest_cfg["queue_maxsize"]

    # Single shared queue — all cameras push here, tagged by camera_id
    frame_queue: mp.Queue = mp.Queue(maxsize=queue_maxsize)

    processes = []
    for camera_cfg in config["cameras"]:
        p = mp.Process(
            target=ingest_worker,
            args=(camera_cfg, target_fps, frame_queue),
            name=f"ingest-{camera_cfg['id']}",
            daemon=True,
        )
        p.start()
        print(f"[ingest] Started {p.name} (pid {p.pid})")
        processes.append(p)

    return frame_queue, processes
