"""Supabase Storage helpers for customer slip uploads."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, Optional

from supabase import Client

from app.core.supabase import get_supabase_admin_client

logger = logging.getLogger(__name__)


class StorageUploadError(RuntimeError):
    """Raised when uploading to storage fails."""


@dataclass
class UploadedFile:
    path: str
    file_name: str
    public_url: str | None = None

    def as_dict(self) -> Dict[str, Any]:
        return {
            "path": self.path,
            "file_name": self.file_name,
            "public_url": self.public_url,
        }


def _short_path(path: str) -> str:
    value = str(path or "").strip()
    if not value:
        return ""
    return value[-32:]


def _get_storage_client(bucket: str) -> tuple[Client, Any]:
    client = get_supabase_admin_client()
    try:
        storage_client = client.storage.from_(bucket)
    except Exception as exc:  # pragma: no cover
        raise StorageUploadError("payment_slip_storage_not_configured") from exc
    return client, storage_client


def upload_payment_slip(bucket: str, path: str, data: bytes, content_type: str, *, error_prefix: str = "payment_slip") -> Dict[str, Any]:
    if not bucket:
        raise StorageUploadError(f"{error_prefix}_storage_not_configured")
    if not path:
        raise StorageUploadError(f"{error_prefix}_storage_path_missing")

    client, storage_client = _get_storage_client(bucket)
    size_bytes = len(data or b"")
    logger.info(
        "storage_upload_begin bucket=%s key=%s size=%s content_type=%s",
        bucket,
        _short_path(path),
        size_bytes,
        content_type or "unknown",
    )
    try:
        storage_client.upload(
            path,
            data,
            {
                "content-type": content_type or "application/octet-stream",
                "upsert": "true",
            },
        )
        logger.info(
            "storage_upload_success bucket=%s key=%s",
            bucket,
            _short_path(path),
        )
    except Exception as exc:  # pragma: no cover
        logger.error(
            "storage_upload_failed bucket=%s key=%s detail=%s",
            bucket,
            _short_path(path),
            str(exc)[:300],
        )
        raise StorageUploadError(f"{error_prefix}_upload_failed") from exc

    public_url = None
    try:
        public_resp = storage_client.get_public_url(path)
        if isinstance(public_resp, dict):
            public_url = public_resp.get("publicUrl")
        elif isinstance(public_resp, str):
            public_url = public_resp
    except Exception:  # pragma: no cover
        public_url = None

    return UploadedFile(path=path, file_name=path.split("/")[-1], public_url=public_url).as_dict()


def upload_public_asset(bucket: str, path: str, data: bytes, content_type: str) -> Dict[str, Any]:
    if not bucket:
        raise StorageUploadError("menu_image_storage_not_configured")
    if not path:
        raise StorageUploadError("menu_image_storage_path_missing")

    _, storage_client = _get_storage_client(bucket)
    size_bytes = len(data or b"")
    logger.info(
        "storage_public_upload_begin bucket=%s key=%s size=%s content_type=%s",
        bucket,
        _short_path(path),
        size_bytes,
        content_type or "unknown",
    )
    try:
        storage_client.upload(
            path,
            data,
            {
                "content-type": content_type or "application/octet-stream",
                "cache-control": "public, max-age=86400",
                "upsert": "true",
            },
        )
        logger.info(
            "storage_public_upload_success bucket=%s key=%s",
            bucket,
            _short_path(path),
        )
    except Exception as exc:  # pragma: no cover
        logger.error(
            "storage_public_upload_failed bucket=%s key=%s detail=%s",
            bucket,
            _short_path(path),
            str(exc)[:300],
        )
        raise StorageUploadError("menu_image_upload_failed") from exc

    public_url = None
    try:
        public_resp = storage_client.get_public_url(path)
        if isinstance(public_resp, dict):
            public_url = public_resp.get("publicUrl")
        elif isinstance(public_resp, str):
            public_url = public_resp
    except Exception as exc:  # pragma: no cover
        logger.warning(
            "storage_public_url_failed bucket=%s key=%s detail=%s",
            bucket,
            _short_path(path),
            str(exc)[:300],
        )
        public_url = None

    if not public_url:
        raise StorageUploadError("menu_image_public_url_missing")

    return UploadedFile(path=path, file_name=path.split("/")[-1], public_url=public_url).as_dict()


def delete_storage_object(bucket: str, path: str, *, error_prefix: str = "storage") -> None:
    if not bucket or not path:
        return

    _, storage_client = _get_storage_client(bucket)
    try:
        storage_client.remove([path])
        logger.info("storage_delete_success bucket=%s key=%s", bucket, _short_path(path))
    except Exception as exc:  # pragma: no cover
        logger.error(
            "storage_delete_failed bucket=%s key=%s detail=%s",
            bucket,
            _short_path(path),
            str(exc)[:300],
        )
        raise StorageUploadError(f"{error_prefix}_delete_failed") from exc


def create_signed_slip_url(bucket: str, path: str, expires_in: int = 60, *, error_prefix: str = "payment_slip") -> Dict[str, Any]:
    """Create a short-lived signed URL for a private payment slip."""
    if not bucket:
        raise StorageUploadError(f"{error_prefix}_storage_not_configured")
    if not path:
        raise StorageUploadError(f"{error_prefix}_storage_path_missing")

    _, storage_client = _get_storage_client(bucket)
    ttl = max(1, int(expires_in or 1))
    try:
        signed_resp = storage_client.create_signed_url(path, ttl)
    except Exception as exc:  # pragma: no cover
        logger.error(
            "storage_signed_url_failed bucket=%s key=%s detail=%s",
            bucket,
            _short_path(path),
            str(exc)[:300],
        )
        raise StorageUploadError(f"{error_prefix}_signed_url_failed") from exc

    signed_url: Optional[str] = None
    if isinstance(signed_resp, dict):
        signed_url = signed_resp.get("signedURL") or signed_resp.get("signed_url")
    elif isinstance(signed_resp, str):
        signed_url = signed_resp

    if not signed_url:
        raise StorageUploadError(f"{error_prefix}_signed_url_failed")

    logger.info(
        "storage_signed_url_issued bucket=%s key=%s ttl=%s",
        bucket,
        _short_path(path),
        ttl,
    )
    return {"signed_url": signed_url, "expires_in": ttl}
