"""Supabase Storage helpers for customer slip uploads."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from io import BytesIO
from typing import Any, Dict

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


def upload_payment_slip(bucket: str, path: str, data: bytes, content_type: str) -> Dict[str, Any]:
    if not bucket:
        raise StorageUploadError("payment_slip_storage_not_configured")
    if not path:
        raise StorageUploadError("payment_slip_storage_path_missing")

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
        buffer = BytesIO(data)
        buffer.seek(0)
        storage_client.upload(
            path,
            buffer,
            {
                "contentType": content_type or "application/octet-stream",
                "upsert": True,
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
        raise StorageUploadError("payment_slip_upload_failed") from exc

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
