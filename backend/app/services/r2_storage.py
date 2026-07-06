"""
Cloudflare R2 object storage (S3-compatible) for order attachments.

Env-gated: without R2_* credentials every upload is a no-op returning
None and attachments live on local disk exactly as before. With them,
uploads go to R2 and the attachment record gains an `r2_key` (+ public
`r2_url` when R2_PUBLIC_BASE is set, e.g. a public bucket domain or
Cloudflare CDN route). The disk copy is still written — it's the hot
cache the download endpoint serves first.

Env:
  R2_ACCOUNT_ID   — Cloudflare account id (drives the endpoint URL)
  R2_ACCESS_KEY   — R2 API token access key id
  R2_SECRET_KEY   — R2 API token secret
  R2_BUCKET       — bucket name (e.g. fofus-attachments)
  R2_PUBLIC_BASE  — optional public base URL for direct customer links
"""

import asyncio
import logging
import os
from functools import lru_cache

logger = logging.getLogger("r2")


def _env(name: str) -> str:
    return os.environ.get(name, "").strip()


def configured() -> bool:
    return all(_env(k) for k in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY", "R2_SECRET_KEY", "R2_BUCKET"))


@lru_cache(maxsize=1)
def _client():
    import boto3  # local import — only needed when R2 is actually configured
    return boto3.client(
        "s3",
        endpoint_url=f"https://{_env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
        aws_access_key_id=_env("R2_ACCESS_KEY"),
        aws_secret_access_key=_env("R2_SECRET_KEY"),
        region_name="auto",
    )


async def upload_bytes(key: str, data: bytes, mime: str) -> dict | None:
    """Upload to R2. Returns {r2_key, r2_url?} or None when not configured
    or the upload fails (callers keep the disk copy either way)."""
    if not configured():
        return None
    try:
        await asyncio.to_thread(
            _client().put_object,
            Bucket=_env("R2_BUCKET"), Key=key, Body=data, ContentType=mime,
        )
    except Exception as e:  # boto raises many types; an upload must never 500 the request
        logger.warning("R2 upload failed for %s: %s", key, e)
        return None
    out = {"r2_key": key}
    public_base = _env("R2_PUBLIC_BASE").rstrip("/")
    if public_base:
        out["r2_url"] = f"{public_base}/{key}"
    return out


async def presigned_url(key: str, expires: int = 3600) -> str | None:
    """Time-limited GET URL for a private bucket object."""
    if not configured():
        return None
    try:
        return await asyncio.to_thread(
            _client().generate_presigned_url,
            "get_object",
            Params={"Bucket": _env("R2_BUCKET"), "Key": key},
            ExpiresIn=expires,
        )
    except Exception as e:
        logger.warning("R2 presign failed for %s: %s", key, e)
        return None
