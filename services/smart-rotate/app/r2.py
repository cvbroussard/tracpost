"""R2 (Cloudflare S3-compatible) helpers — download source, upload result."""
import boto3
import httpx
from .config import Config


def s3_client():
    """Lazy boto3 client. R2 endpoint is the only difference from native S3."""
    return boto3.client(
        "s3",
        endpoint_url=Config.r2_endpoint(),
        aws_access_key_id=Config.R2_ACCESS_KEY_ID,
        aws_secret_access_key=Config.R2_SECRET_ACCESS_KEY,
        region_name="auto",
    )


async def download_source(url: str, local_path: str) -> None:
    """
    Download the source video to a local temp path. We use HTTP fetch
    (works with R2 public URLs and presigned URLs alike) rather than
    boto3.get_object to keep this generic — the variant render worker
    may pass any URL pattern.
    """
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            with open(local_path, "wb") as f:
                async for chunk in response.aiter_bytes(chunk_size=1024 * 1024):
                    f.write(chunk)


def upload_result(local_path: str, key: str, content_type: str = "video/mp4") -> str:
    """
    Upload the reframed video to R2 at the caller-specified key. Returns
    the public URL (per R2_PUBLIC_BASE convention) — variant-render.ts
    persists this to asset_variants.storage_url.

    Per the Layer-1 discipline: this service only WRITES to R2 and never
    serves content. R2 stays canonical.
    """
    client = s3_client()
    with open(local_path, "rb") as f:
        client.put_object(
            Bucket=Config.R2_BUCKET_NAME,
            Key=key,
            Body=f,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )
    return f"{Config.R2_PUBLIC_BASE}/{key}"
