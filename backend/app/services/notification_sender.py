import logging
from typing import Any, Dict, Optional

from supabase import Client

from app.core.config import settings
from app.services.line_service import log_line_notification, send_line_push

logger = logging.getLogger(__name__)

_ALLOWED_MESSAGE_TYPES = {
    "payment_approved",
    "ready",
    "payment_rejected",
    "cancelled",
}

PAYMENT_REJECT_REASON_FALLBACK = "ข้อมูลการชำระเงินไม่ถูกต้องหรือยังตรวจสอบไม่ได้"
ORDER_CANCEL_REASON_FALLBACK = "ร้านไม่สามารถดำเนินการออเดอร์นี้ต่อได้"
_PAYMENT_REJECT_GUIDANCE = "กรุณาตรวจสอบข้อมูลการชำระเงินอีกครั้ง หรือติดต่อร้านเพื่อให้ทีมงานช่วยตรวจสอบ"
_CANCELLED_GUIDANCE = "หากต้องการสอบถามเพิ่มเติม สามารถติดต่อร้านผ่านช่องทางนี้ได้เลย"


def mask_line_user_id(line_user_id: Optional[str]) -> Optional[str]:
    if not line_user_id:
        return None
    value = str(line_user_id).strip()
    if not value:
        return None
    if len(value) <= 4:
        return "***"
    if len(value) <= 8:
        return f"{value[:2]}...{value[-2:]}"
    return f"{value[:4]}...{value[-4:]}"


def _safe_error_message(error: Any) -> str:
    text = str(getattr(error, "message", "") or error or "notification_send_failed")
    return text[:200]


def _status_url_base() -> str:
    if settings.line_status_url:
        return settings.line_status_url.rstrip("/")
    frontend = (settings.frontend_url or "").rstrip("/")
    return f"{frontend or 'https://valora-system-hub.vercel.app'}/order/status"


def _build_status_link(public_token: Optional[str]) -> str:
    base = _status_url_base()
    if not public_token:
        return base
    return f"{base}?token={public_token}"


def _format_baht(amount: Optional[float]) -> Optional[str]:
    if amount is None:
        return None
    try:
        return f"{float(amount):,.2f} บาท"
    except (ValueError, TypeError):
        return None


_STATUS_TEMPLATES: Dict[str, str] = {
    "waiting_payment_review": "ร้านได้รับหลักฐานการชำระเงินแล้ว กำลังตรวจสอบ",
    "accepted": "ร้านรับออเดอร์แล้ว กำลังเตรียมเครื่องดื่มให้คุณ",
    "preparing": "ร้านกำลังจัดเตรียมเครื่องดื่มของคุณ",
    "ready": "เครื่องดื่มของคุณพร้อมรับแล้ว\n\nสามารถมารับที่ร้านได้เลย",
    "completed": "ออเดอร์เสร็จเรียบร้อย ขอบคุณที่อุดหนุน",
    "cancelled": "ออเดอร์นี้ถูกยกเลิกแล้ว",
    "payment_rejected": "สลิปการชำระเงินยังไม่ผ่านการตรวจสอบ",
    "payment_approved": "ร้านได้รับการชำระเงินเรียบร้อยแล้ว\n\nกรุณารอสักครู่ ทางร้านกำลังจัดคิวและเตรียมเครื่องดื่มให้คุณ",
}

_AMOUNT_STATUS_TYPES = {"waiting_payment_review", "accepted", "preparing"}


def _normalize_message_type(message_type: Optional[str]) -> str:
    return str(message_type or "").strip().lower()


def _should_send_notification(message_type: str) -> bool:
    return message_type in _ALLOWED_MESSAGE_TYPES


def _has_success_notification(client: Client, order_id: str, message_type: str) -> bool:
    try:
        resp = (
            client.table("line_notification_logs")
            .select("id")
            .eq("order_id", order_id)
            .eq("message_type", message_type)
            .eq("send_status", "success")
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.debug(
            "line_notification_dedupe_check_failed order=%s type=%s detail=%s",
            order_id,
            message_type,
            _safe_error_message(exc),
        )
        return False
    rows = getattr(resp, "data", None) or []
    return bool(rows)


def _build_skip_result(message_type: str, reason: str, notification_message: Optional[str] = None) -> Dict[str, Any]:
    return {
        "mode": "mock",
        "send_status": "skipped",
        "message_type": message_type,
        "line_user_id_masked": None,
        "notification_message": notification_message,
        "reason": reason,
    }


def _load_order_notification_context(client: Client, order_id: str) -> Dict[str, Any]:
    query = (
        client.table("orders")
        .select("id, order_no, public_token, total_amount, customer_id, customers(line_user_id)")
        .eq("id", order_id)
        .limit(1)
    )
    resp = query.execute()
    if getattr(resp, "error", None):
        logger.warning("line_order_context_failed order=%s detail=%s", order_id, _safe_error_message(resp.error))
        return {}
    rows = getattr(resp, "data", None) or []
    if not rows:
        return {}
    row = rows[0]
    customer_rel = row.get("customers") if isinstance(row, dict) else None
    return {
        "order_no": row.get("order_no"),
        "public_token": row.get("public_token"),
        "total_amount": row.get("total_amount"),
        "customer_id": row.get("customer_id"),
        "line_user_id": (customer_rel or {}).get("line_user_id") if isinstance(customer_rel, dict) else None,
    }


def _build_message_text(message_type: str, ctx: Dict[str, Any], payload: Dict[str, Any]) -> str:
    order_no = ctx.get("order_no") or payload.get("order_no")
    base_text = _STATUS_TEMPLATES.get(message_type, payload.get("message") or "ระบบอัปเดตสถานะออเดอร์ของคุณแล้ว")
    lines = []
    if order_no:
        lines.append(f"ออเดอร์ {order_no}")
    lines.append(base_text)

    if message_type == "payment_rejected":
        reason = str(payload.get("reject_reason") or "").strip()
        if not reason:
            reason = PAYMENT_REJECT_REASON_FALLBACK
        payload["reject_reason"] = reason
        lines.append("")
        lines.append(f"เหตุผล: {reason}")
        lines.append("")
        lines.append(_PAYMENT_REJECT_GUIDANCE)
    elif message_type == "cancelled":
        reason = str(payload.get("cancelled_reason") or "").strip()
        if not reason:
            reason = ORDER_CANCEL_REASON_FALLBACK
        payload["cancelled_reason"] = reason
        lines.append("")
        lines.append(f"เหตุผล: {reason}")
        lines.append("")
        lines.append(_CANCELLED_GUIDANCE)

    amount_text = _format_baht(ctx.get("total_amount"))
    if amount_text and message_type in _AMOUNT_STATUS_TYPES:
        lines.append(f"ยอดรวม {amount_text}")

    status_link = _build_status_link(ctx.get("public_token"))
    lines.append(f"ติดตามสถานะ: {status_link}")
    return "\n".join(lines), status_link


def _record_notification(
    client: Client,
    *,
    order_id: str,
    customer_id: Optional[str],
    line_user_id: Optional[str],
    message_type: str,
    payload: Dict[str, Any],
    send_status: str,
    error_message: Optional[str],
) -> None:
    log_line_notification(
        client=client,
        order_id=order_id,
        customer_id=customer_id,
        line_user_id=line_user_id,
        message_type=message_type,
        message_payload=payload,
        send_status=send_status,
        error_message=error_message,
    )


def send_line_notification(
    client: Client,
    order_id: str,
    customer_id: Optional[str],
    line_user_id: Optional[str],
    message_type: str,
    message_payload: Dict[str, Any],
) -> Dict[str, Any]:
    normalized_message_type = _normalize_message_type(message_type)
    payload: Dict[str, Any] = dict(message_payload or {})
    force_send = bool(payload.pop("force_send", False))

    if not normalized_message_type:
        logger.debug("line notification skipped: unknown message type order=%s", order_id)
        return _build_skip_result("", "invalid_message_type")

    if not _should_send_notification(normalized_message_type):
        logger.debug(
            "line notification skipped by policy order=%s type=%s",
            order_id,
            normalized_message_type,
        )
        return _build_skip_result(normalized_message_type, "policy_blocked")

    if not force_send and _has_success_notification(client, order_id, normalized_message_type):
        logger.debug(
            "line notification deduped order=%s type=%s",
            order_id,
            normalized_message_type,
        )
        return _build_skip_result(normalized_message_type, "duplicate_suppressed")

    order_ctx = _load_order_notification_context(client, order_id)
    resolved_customer_id = customer_id or order_ctx.get("customer_id")
    effective_line_uid = str(line_user_id or order_ctx.get("line_user_id") or "").strip() or None
    message_text, status_link = _build_message_text(normalized_message_type, order_ctx, payload)
    payload.update(
        {
            "message_text": message_text,
            "status_link": status_link,
            "order_no": order_ctx.get("order_no"),
        }
    )

    if not effective_line_uid:
        logger.warning(
            "line notification skipped: no line identity order=%s type=%s",
            order_id,
            normalized_message_type,
        )
        _record_notification(
            client,
            order_id=order_id,
            customer_id=resolved_customer_id,
            line_user_id=None,
            message_type=normalized_message_type,
            payload=payload,
            send_status="skipped",
            error_message="no_line_identity",
        )
        return {
            "mode": "mock",
            "send_status": "skipped",
            "message_type": normalized_message_type,
            "line_user_id_masked": None,
            "notification_message": message_text,
            "reason": "no_line_identity",
        }

    push_payload = {
        "messages": [
            {
                "type": "text",
                "text": message_text,
            }
        ]
    }
    push_result = send_line_push(effective_line_uid, push_payload)
    attempted = bool(push_result.get("attempted"))
    status_code = push_result.get("status")
    error_reason = push_result.get("reason") or push_result.get("error")
    send_status = "success"
    error_message = None
    if not attempted:
        send_status = "skipped"
        error_message = error_reason
    elif status_code is None or not (200 <= int(status_code) < 400):
        send_status = "failed"
        error_message = error_reason or push_result.get("body")

    _record_notification(
        client,
        order_id=order_id,
        customer_id=resolved_customer_id,
        line_user_id=effective_line_uid,
        message_type=normalized_message_type,
        payload=payload,
        send_status=send_status,
        error_message=error_message,
    )

    return {
        "mode": "live" if attempted and send_status == "success" else "mock",
        "send_status": send_status,
        "message_type": normalized_message_type,
        "line_user_id_masked": mask_line_user_id(effective_line_uid),
        "notification_message": message_text,
        "reason": error_reason,
        "error_message": error_message,
    }

