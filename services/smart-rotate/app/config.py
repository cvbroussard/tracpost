"""Service configuration via env vars."""
import os


class Config:
    # Auth secret — incoming /reframe requests must include this in the
    # X-Smart-Rotate-Secret header. Vercel sets the same value on its side.
    SMART_ROTATE_SECRET: str = os.environ.get("SMART_ROTATE_SECRET", "")

    # R2 (Cloudflare's S3-compatible storage) — variants are written here.
    # Var names match TracPost's .env.local (R2_ACCOUNT_ID + R2_BUCKET_NAME)
    # so operator can copy values from existing config.
    R2_ACCESS_KEY_ID: str = os.environ.get("R2_ACCESS_KEY_ID", "")
    R2_SECRET_ACCESS_KEY: str = os.environ.get("R2_SECRET_ACCESS_KEY", "")
    R2_ACCOUNT_ID: str = os.environ.get("R2_ACCOUNT_ID", "")
    R2_BUCKET_NAME: str = os.environ.get("R2_BUCKET_NAME", "")
    R2_PUBLIC_BASE: str = os.environ.get("R2_PUBLIC_BASE", "https://assets.tracpost.com")

    @classmethod
    def r2_endpoint(cls) -> str:
        """Endpoint URL constructed from account ID — matches main app's r2.ts."""
        return f"https://{cls.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

    # Tunable smoothing window for the Kalman tracker. Larger = smoother
    # camera path, smaller = more responsive to subject motion.
    SMOOTHING_WINDOW_FRAMES: int = int(os.environ.get("SMOOTHING_WINDOW_FRAMES", "8"))

    # YOLOv8 model variant. yolov8n is the smallest/fastest; m or l for
    # better detection quality at the cost of inference latency.
    YOLO_MODEL: str = os.environ.get("YOLO_MODEL", "yolov8n.pt")

    # Subject classes to consider as primary tracking targets. COCO
    # class indices: 0=person. For service-business content, person is
    # typically the right anchor. Extending beyond this requires
    # operator coaching on what shots benefit from non-person tracking.
    PRIMARY_SUBJECT_CLASSES: list[int] = [0]


def assert_runtime_config():
    """Fail fast at startup if required secrets aren't set."""
    missing = []
    for k in ("SMART_ROTATE_SECRET", "R2_ACCESS_KEY_ID",
              "R2_SECRET_ACCESS_KEY", "R2_ACCOUNT_ID", "R2_BUCKET_NAME"):
        if not getattr(Config, k):
            missing.append(k)
    if missing:
        raise RuntimeError(f"Missing required env vars: {', '.join(missing)}")
