import json
import logging
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from supabase import Client

from app.core.config import settings
from app.core.supabase import SupabaseConfigurationError, get_supabase_admin_client
from app.services.line_service import (
    create_line_link_token,
    fetch_line_display_name,
    sanitize_line_display_name,
    should_overwrite_display_name,
    send_line_reply,
    verify_line_signature,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/line", tags=["line"])


class LineWebhookConfigurationError(RuntimeError):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def _get_client() -> Client:
    try:
        return get_supabase_admin_client()
    except SupabaseConfigurationError as exc:  # pragma: no cover - defensive
        raise LineWebhookConfigurationError("supabase_not_configured") from exc


def _validate_runtime_configuration() -> Tuple[str, str, str]:
    if not settings.line_webhook_enabled:
        raise LineWebhookConfigurationError("line_webhook_disabled")
    channel_secret = (settings.line_channel_secret or "").strip()
    if not channel_secret:
        raise LineWebhookConfigurationError("line_channel_secret_missing")
    store_id = (settings.line_store_id or "").strip()
    if not store_id:
        raise LineWebhookConfigurationError("line_store_id_missing")
    order_url = (settings.line_order_url or "").strip()
    if not order_url:
        raise LineWebhookConfigurationError("line_order_url_missing")
    return channel_secret, store_id, order_url


def _safe_event_summary(ev: Dict[str, Any]) -> Dict[str, Any]:
    event_type = ev.get("type")
    source = ev.get("source") or {}
    return {
        "event_type": event_type,
        "source_type": source.get("type"),
        "has_user_id": bool(source.get("userId")),
        "reply_token_present": bool(ev.get("replyToken")),
    }


def _upsert_line_customer(client: Client, store_id: str, line_user_id: str, display_name: Optional[str]) -> Optional[str]:
    query = (
        client.table("customers")
        .select("id, display_name")
        .eq("store_id", store_id)
        .eq("line_user_id", line_user_id)
        .limit(1)
    )
    resp = query.execute()
    err = getattr(resp, "error", None)
    if err:
        logger.warning(
            "line_customer_lookup_failed store=%s detail=%s",
            store_id,
            getattr(err, "message", err),
        )
        return None
    rows = getattr(resp, "data", None) or []
    sanitized_name = sanitize_line_display_name(display_name)
    if rows:
        customer_id = rows[0].get("id")
        current_display = rows[0].get("display_name")
        if sanitized_name and should_overwrite_display_name(current_display, sanitized_name):
            try:
                client.table("customers").update({"display_name": sanitized_name}).eq("id", customer_id).execute()
            except Exception as exc:  # pragma: no cover - best effort update
                logger.debug("line_customer_display_update_failed id=%s detail=%s", customer_id, exc)
        return customer_id

    insert_payload = {
        "store_id": store_id,
        "line_user_id": line_user_id,
    }
    if sanitized_name:
        insert_payload["display_name"] = sanitized_name
    try:
        insert_resp = client.table("customers").insert(insert_payload).execute()
    except Exception as exc:
        logger.warning("line_customer_insert_failed store=%s detail=%s", store_id, exc)
        return None
    rows = getattr(insert_resp, "data", None) or []
    return rows[0].get("id") if rows else None


def _build_binding_message(order_url: str, raw_token: str) -> str:
    ttl = settings.line_link_token_ttl_minutes or 30
    link = f"{order_url}?line_link_token={raw_token}"
    return (
        "สั่ง Brewway ผ่านระบบออนไลน์ได้เลย\n"
        "แตะลิงก์เพื่อยืนยันตัวตนกับระบบภายใน "
        f"{ttl} นาที\n{link}"
    )


def _handle_binding_event(
    client: Client,
    *,
    event: Dict[str, Any],
    store_id: str,
    order_url: str,
) -> Dict[str, Any]:
    source = event.get("source") or {}
    line_user_id = (source.get("userId") or "").strip()
    if not line_user_id:
        return {"handled": False, "reason": "missing_user_id"}

    event_display_name = sanitize_line_display_name(source.get("displayName"))
    profile_info = fetch_line_display_name(line_user_id)
    profile_result = profile_info.get("result") or {}
    profile_display_name = profile_info.get("display_name")
    if profile_result.get("attempted") and not profile_display_name:
        logger.debug(
            "line_profile_fetch_skipped status=%s reason=%s",
            profile_result.get("status"),
            profile_result.get("reason") or profile_result.get("error"),
        )

    resolved_display_name = profile_display_name or event_display_name
    customer_id = _upsert_line_customer(client, store_id, line_user_id, resolved_display_name)
    token_row = create_line_link_token(
        client,
        store_id=store_id,
        line_user_id=line_user_id,
        customer_id=customer_id,
    )
    raw_token = token_row.get("raw_token")
    reply_token = event.get("replyToken")
    if raw_token and reply_token:
        message = _build_binding_message(order_url, raw_token)
        send_line_reply(reply_token, message)

    return {
        "handled": True,
        "customer_bound": bool(customer_id),
        "token_issued": bool(raw_token),
    }


@router.post("/webhook")
async def line_webhook(request: Request, x_line_signature: str | None = Header(None)) -> JSONResponse:
    try:
        channel_secret, store_id, order_url = _validate_runtime_configuration()
    except LineWebhookConfigurationError as exc:
        return JSONResponse(status_code=status.HTTP_200_OK, content={"status": "disabled", "reason": exc.reason})

    body_bytes = await request.body()

    if not x_line_signature:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_signature")

    if not verify_line_signature(body_bytes, x_line_signature, channel_secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_signature")

    try:
        payload = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_json")

    events: List[Dict[str, Any]] = payload.get("events") if isinstance(payload, dict) else []
    if not isinstance(events, list):
        events = []

    try:
        client = _get_client()
    except LineWebhookConfigurationError as exc:
        logger.warning("line_webhook_client_unavailable reason=%s", exc.reason)
        return JSONResponse(status_code=status.HTTP_200_OK, content={"status": "disabled", "reason": exc.reason})

    supported_types = {"follow", "message", "postback"}
    processed = 0
    ignored = 0
    summaries: List[Dict[str, Any]] = []

    for ev in events:
        etype = ev.get("type") if isinstance(ev, dict) else None
        if etype not in supported_types and etype != "unfollow":
            ignored += 1
            continue

        processed += 1
        summary = _safe_event_summary(ev if isinstance(ev, dict) else {})
        if etype == "unfollow":
            summary.update({"handled": True, "event_type": etype})
            summaries.append(summary)
            continue

        try:
            result = _handle_binding_event(client, event=ev if isinstance(ev, dict) else {}, store_id=store_id, order_url=order_url)
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.exception("line_binding_event_failed event_type=%s", etype)
            result = {"handled": False, "reason": "exception"}
        summary.update(result)
        summaries.append(summary)

    if summaries:
        logger.info("line_webhook_events", extra={"processed": processed, "ignored": ignored, "summaries": summaries})
    else:
        logger.info("line_webhook_events", extra={"processed": processed, "ignored": ignored})

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": "ok",
            "mode": settings.line_send_mode or "mock",
            "processed_events": processed,
            "ignored_events": ignored,
        },
    )
