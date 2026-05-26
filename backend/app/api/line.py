import base64
import hashlib
import hmac
import json
import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse

from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/line", tags=["line"])


def _verify_signature(secret: str, body: bytes, signature: str) -> bool:
    try:
        mac = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).digest()
        expected = base64.b64encode(mac).decode("utf-8")
        return hmac.compare_digest(expected, signature)
    except Exception:
        return False


def _safe_event_summary(ev: Dict[str, Any]) -> Dict[str, Any]:
    event_type = ev.get("type")
    source = ev.get("source") or {}
    message = ev.get("message") or {}
    postback = ev.get("postback") or {}
    return {
        "event_type": event_type,
        "source_type": source.get("type"),
        "has_user_id": bool(source.get("userId")),
        "message_type": message.get("type") if isinstance(message, dict) else None,
        "postback_present": bool(postback),
        "reply_token_present": bool(ev.get("replyToken")),
    }


@router.post("/webhook")
async def line_webhook(request: Request, x_line_signature: str | None = Header(None)) -> JSONResponse:
    secret = settings.line_channel_secret or ""
    if not secret:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "not_configured", "reason": "line_channel_secret_missing"},
        )

    body_bytes = await request.body()

    if not x_line_signature:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_signature")

    if not _verify_signature(secret, body_bytes, x_line_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_signature")

    try:
        payload = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_json")

    events: List[Dict[str, Any]] = payload.get("events") if isinstance(payload, dict) else []
    if not isinstance(events, list):
        events = []

    supported_types = {"follow", "message", "postback"}
    processed = 0
    ignored = 0
    summaries: List[Dict[str, Any]] = []

    for ev in events:
        etype = ev.get("type") if isinstance(ev, dict) else None
        if etype in supported_types:
            processed += 1
            summaries.append(_safe_event_summary(ev if isinstance(ev, dict) else {}))
        else:
            ignored += 1

    if summaries:
        logger.info("line_webhook_mock_events", extra={"processed": processed, "ignored": ignored, "summaries": summaries})
    else:
        logger.info("line_webhook_mock_events", extra={"processed": processed, "ignored": ignored})

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": "ok",
            "mode": settings.line_send_mode or "mock",
            "real_send_enabled": False,
            "processed_events": processed,
            "ignored_events": ignored,
        },
    )
