from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from supabase import Client

from app.core.config import settings

logger = logging.getLogger(__name__)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def verify_line_signature(raw_body: bytes, signature: str | None, channel_secret: str | None) -> bool:
    if not raw_body or not signature or not channel_secret:
        return False
    try:
        mac = hmac.new(channel_secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
        expected = base64.b64encode(mac).decode("utf-8")
        return hmac.compare_digest(expected, signature)
    except Exception as exc:  # pragma: no cover - defensive guard
        logger.debug("line_signature_verification_failed: %s", exc)
        return False


def hash_line_link_token(raw_token: str) -> str:
    token_bytes = raw_token.encode("utf-8")
    return hashlib.sha256(token_bytes).hexdigest()


def _safe_error_message(error: Any) -> str:
    text = str(getattr(error, "message", "") or error or "line_service_error")
    return text[:200]


def _extract_missing_column(error: Any) -> Optional[str]:
    message = str(getattr(error, "message", error) or "")
    lowered = message.lower()
    if "column" not in lowered and "does not exist" not in lowered:
        return None
    if '"' in message:
        parts = message.split('"')
        if len(parts) >= 3:
            return parts[1]
    return None


def create_line_link_token(
    client: Client,
    *,
    store_id: str,
    line_user_id: str,
    customer_id: Optional[str] = None,
    purpose: str = "order_binding",
) -> Dict[str, Any]:
    ttl_minutes = settings.line_link_token_ttl_minutes or 30
    expires_at = _now_utc() + timedelta(minutes=max(1, ttl_minutes))

    attempts = 0
    while attempts < 5:
        attempts += 1
        raw_token = secrets.token_urlsafe(32)
        token_hash = hash_line_link_token(raw_token)
        payload = {
            "store_id": store_id,
            "customer_id": customer_id,
            "line_user_id": line_user_id,
            "token_hash": token_hash,
            "purpose": purpose,
            "expires_at": expires_at.isoformat(),
        }
        resp = client.table("line_link_tokens").insert(payload).execute()
        err = getattr(resp, "error", None)
        if not err:
            rows = getattr(resp, "data", None) or []
            row = rows[0] if rows else payload
            row["raw_token"] = raw_token
            return row
        if "line_link_tokens_token_hash_key" in _safe_error_message(err):
            continue
        raise RuntimeError(f"line_link_token_create_failed: {_safe_error_message(err)}")
    raise RuntimeError("line_link_token_unique_generation_failed")


def resolve_line_link_token(
    client: Client,
    *,
    raw_token: str,
    store_id: str,
    purpose: str = "order_binding",
) -> Optional[Dict[str, Any]]:
    if not raw_token:
        return None
    token_hash = hash_line_link_token(raw_token)
    now_iso = _now_utc().isoformat()
    query = (
        client.table("line_link_tokens")
        .select("id, store_id, line_user_id, customer_id, expires_at, used_at")
        .eq("token_hash", token_hash)
        .eq("purpose", purpose)
        .eq("store_id", store_id)
        .is_("used_at", None)
        .gt("expires_at", now_iso)
        .limit(1)
    )
    resp = query.execute()
    if getattr(resp, "error", None):
        logger.warning("line_link_token_lookup_failed: %s", _safe_error_message(resp.error))
        return None
    rows = getattr(resp, "data", None) or []
    return rows[0] if rows else None


def mark_line_link_token_used(client: Client, token_id: str) -> None:
    if not token_id:
        return
    resp = (
        client.table("line_link_tokens")
        .update({"used_at": _now_utc().isoformat()})
        .eq("id", token_id)
        .execute()
    )
    if getattr(resp, "error", None):
        logger.warning("line_link_token_mark_used_failed: %s", _safe_error_message(resp.error))


def log_line_notification(
    client: Client,
    *,
    order_id: str,
    customer_id: Optional[str],
    line_user_id: Optional[str],
    message_type: str,
    message_payload: Dict[str, Any],
    send_status: str,
    error_message: Optional[str] = None,
) -> bool:
    payload = {
        "order_id": order_id,
        "customer_id": customer_id,
        "line_user_id": line_user_id,
        "message_type": message_type,
        "message_payload": message_payload,
        "send_status": send_status,
        "error_message": error_message,
        "sent_at": _now_utc().isoformat(),
    }

    def _insert(data: Dict[str, Any]) -> None:
        resp = client.table("line_notification_logs").insert(data).execute()
        err = getattr(resp, "error", None)
        if err:
            raise err

    try:
        _insert(payload)
        return True
    except Exception as exc:
        missing = _extract_missing_column(exc)
        if missing and missing in payload:
            trimmed = {k: v for k, v in payload.items() if k != missing}
            try:
                _insert(trimmed)
                return True
            except Exception as exc2:  # pragma: no cover - defensive
                logger.warning(
                    "line_notification_log_failed_trimmed order=%s type=%s detail=%s",
                    order_id,
                    message_type,
                    _safe_error_message(exc2),
                )
                return False
        logger.warning(
            "line_notification_log_failed order=%s type=%s detail=%s",
            order_id,
            message_type,
            _safe_error_message(exc),
        )
        return False


def _call_line_api(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    access_token = (settings.line_channel_access_token or "").strip()
    if not access_token:
        return {"attempted": False, "reason": "missing_access_token"}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.line.me{path}",
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {access_token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:  # nosec: B310 (trusted LINE endpoint)
            body = resp.read().decode("utf-8")
            return {
                "attempted": True,
                "status": resp.getcode(),
                "body": body,
            }
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "ignore") if exc.fp else ""
        return {
            "attempted": True,
            "status": exc.code,
            "body": detail,
            "error": _safe_error_message(exc),
        }
    except urllib.error.URLError as exc:
        return {
            "attempted": True,
            "status": None,
            "error": _safe_error_message(exc),
        }


def send_line_push(line_user_id: str, message_payload: Dict[str, Any]) -> Dict[str, Any]:
    if not line_user_id:
        return {"attempted": False, "reason": "missing_line_user_id"}
    if not settings.line_push_enabled:
        return {"attempted": False, "reason": "line_push_disabled"}
    mode = (settings.line_send_mode or "mock").strip().lower()
    if mode != "live":
        return {"attempted": False, "reason": f"send_mode_{mode}"}
    payload = dict(message_payload)
    payload.setdefault("to", line_user_id)
    return _call_line_api("/v2/bot/message/push", payload)


def send_line_reply(reply_token: str, message: str) -> Dict[str, Any]:
    if not reply_token:
        return {"attempted": False, "reason": "missing_reply_token"}
    if not settings.line_push_enabled:
        return {"attempted": False, "reason": "line_push_disabled"}
    mode = (settings.line_send_mode or "mock").strip().lower()
    if mode != "live":
        return {"attempted": False, "reason": f"send_mode_{mode}"}
    payload = {
        "replyToken": reply_token,
        "messages": [
            {
                "type": "text",
                "text": message,
            }
        ],
    }
    return _call_line_api("/v2/bot/message/reply", payload)
