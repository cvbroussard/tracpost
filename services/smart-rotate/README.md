# Smart Rotate

TracPost-owned video reframing service. Takes a horizontal source video URL, returns a vertical (or other aspect) reframe with subject-aware tracking. Used by the variant render worker for Enterprise-tier subscribers.

See `project_tracpost_smart_rotate_self_host.md` for the architectural decisions this implements.

## What it does

Subject-aware video reframing — converts 16:9 (or any source aspect) to 9:16 / 1:1 / 4:5 / 2:3 / 16:9 with per-frame subject tracking and temporal smoothing so the crop window follows the action.

Pipeline:

```
source video URL (R2 presigned)
  ↓ download to /tmp
YOLOv8 — per-frame subject bounding boxes
  ↓
DeepSORT / IoU — identity tracking (the same subject across frames)
  ↓
Kalman filter — smooth the bounding box center coordinates
  ↓
FFmpeg — crop with the smoothed coords + re-encode to target spec
  ↓ upload to R2 (caller-supplied destination)
result video URL (R2)
```

## Stack

- **Python 3.11+**
- **FastAPI** — HTTP API
- **ultralytics** — YOLOv8 implementation (MIT-style license)
- **opencv-python** — video frame iteration + drawing
- **ffmpeg** — video decode + re-encode (system binary, included in Docker image)
- **boto3** — S3-compatible R2 access
- **filterpy** — Kalman filter

## API

### `POST /reframe`

Synchronous reframe. Block until done. Caller (Vercel `variant-render.ts`) is already wrapped in `waitUntil` so it tolerates slow responses.

Request:
```json
{
  "source_url": "https://assets.tracpost.com/sites/.../source.mp4",
  "target_aspect": "9:16",
  "target_width": 1080,
  "target_height": 1920,
  "destination_key": "sites/.../variants/2026-05-08/reel-12345.mp4"
}
```

Response:
```json
{
  "destination_url": "https://assets.tracpost.com/sites/.../variants/2026-05-08/reel-12345.mp4",
  "duration_seconds": 14.2,
  "render_settings": {
    "method": "smart_rotate_yolov8",
    "frames_processed": 425,
    "subjects_tracked": 1,
    "smoothing_window_frames": 8
  }
}
```

Auth: `X-Smart-Rotate-Secret: <SMART_ROTATE_SECRET>` header. Service rejects requests without the matching secret.

### `GET /health`

Returns 200 OK if the service is up and the model is loaded.

## Deploy (Fly.io)

```bash
cd services/smart-rotate
fly launch                              # creates app
fly secrets set SMART_ROTATE_SECRET=...  # set the API auth secret
fly secrets set R2_ACCESS_KEY_ID=...
fly secrets set R2_SECRET_ACCESS_KEY=...
fly secrets set R2_ACCOUNT_ID=...
fly secrets set R2_BUCKET_NAME=...
fly deploy
```

(Var names match TracPost's `.env.local` so values copy directly.)

Then in Vercel project settings:
- `SMART_ROTATE_URL=https://smart-rotate.fly.dev` (or the assigned host)
- `SMART_ROTATE_SECRET=<same secret>`

When `SMART_ROTATE_URL` is unset, `variant-render.ts` falls back to ffmpeg center-crop. This means:
- **Dev/staging without the service**: fully functional via ffmpeg fallback
- **Production with the service**: Enterprise tier routes to Smart Rotate; mid-tier still uses ffmpeg

## Compute

Default deploy: 1 CPU, 2GB RAM, no GPU. Sufficient for moderate beta volume (a 30-second 1080p video reframes in ~15-45s).

Upgrade path when volume justifies:
1. Scale horizontally — add more dynos behind the same app, requests load-balance
2. GPU dyno — Fly.io GPU shared instance brings YOLOv8 inference to ~1-3s per video. ~$200-400/mo.

## Local dev

```bash
cd services/smart-rotate
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export SMART_ROTATE_SECRET=dev
export R2_ACCESS_KEY_ID=...
# ... (other R2 secrets)
uvicorn app.main:app --reload --port 8080
```

Test:
```bash
curl -X POST http://localhost:8080/reframe \
  -H "Content-Type: application/json" \
  -H "X-Smart-Rotate-Secret: dev" \
  -d '{
    "source_url": "https://example.com/source.mp4",
    "target_aspect": "9:16",
    "target_width": 1080,
    "target_height": 1920,
    "destination_key": "sites/test/variants/test-reel.mp4"
  }'
```

## What's NOT in scope

- **Mux replacement for thumbnails** — sharp handles those in the main app, separate code path.
- **Generative reformatting** — no Kling/Veo/Sora, ever. Generative reformat breaks authenticity per `project_tracpost_strategic_ai_unleash.md`.
- **Image transforms** — main app's sharp-based pipeline handles all image variants.
- **Audio post-production** — service preserves source audio as-is; no remixing.

## Discipline (LOCK these in code review)

1. **R2 canonical** — every variant URL points at R2. Service URLs never leak to subscribers.
2. **One touchpoint** — only `src/lib/pipeline/variant-render.ts` calls this service. No other imports.
3. **No vendor names public** — subscriber UI says "Smart Rotate." Operator can see "Smart Rotate (YOLOv8 + FFmpeg, Fly.io)" for debug.
4. **Fail-safe fallback** — if `SMART_ROTATE_URL` unset OR service errors, fall back to `reformatVideo` (ffmpeg center-crop). Never break the variant render pipeline because the service is down.
