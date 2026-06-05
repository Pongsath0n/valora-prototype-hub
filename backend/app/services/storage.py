"""Supabase Storage helpers for customer slip uploads."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

from supabase import Client

from app.core.supabase import get_supabase_admin_client


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
    try:
        storage_client.upload(
            path,
            data,
            {
                "contentType": content_type or "application/octet-stream",
                "upsert": True,
            },
        )
    except Exception as exc:  # pragma: no cover
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
