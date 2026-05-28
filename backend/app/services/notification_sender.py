import logging
from datetime import datetime
from typing import Any, Dict, Optional

from supabase import Client

from app.core.config import settings

logger = logging.getLogger(__name__)

_FALLBACK_LINE_USER_ID = "mock-line-user"


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


def _is_missing_column(error: Any, column: str) -> bool:
    message = str(getattr(error, "message", "") or error or "").lower()
    return column.lower() in message and ("column" in message or "does not exist" in message)


def _omit_optional_fields(data: Dict[str, Any], optional_keys: list[str]) -> Dict[str, Any]:
    return {k: v for k, v in data.items() if k not in optional_keys}


def _safe_error_message(error: Any) -> str:
    text = str(getattr(error, "message", "") or error or "notification_send_failed")
    return text[:200]


def normalize_line_send_mode(value: Optional[str]) -> str:
    mode = (value or "").strip().lower()
    if mode == "real_line":
        return "real_line"
    return "mock"


def write_notification_log(
    client: Client,
    order_id: str,
    customer_id: Optional[str],
    line_user_id: Optional[str],
    message_type: str,
    message_payload: Dict[str, Any],
    send_status: str = "success",
    error_message: Optional[str] = None,
) -> bool:
    line_user_id_effective = line_user_id or _FALLBACK_LINE_USER_ID
    payload = {
        "order_id": order_id,
        "customer_id": customer_id,
        "line_user_id": line_user_id_effective,
        "message_type": message_type,
        "message_payload": message_payload,
        "send_status": send_status,
        "error_message": error_message,
        "sent_at": datetime.utcnow().isoformat(),
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
        missing_optional = any(
            _is_missing_column(exc, k)
            for k in [
                "customer_id",
                "line_user_id",
                "message_payload",
                "error_message",
                "sent_at",
            ]
        )
        send_status_missing = _is_missing_column(exc, "send_status")

        if missing_optional or send_status_missing:
            trimmed = _omit_optional_fields(
                payload,
                [
                    "customer_id",
                    "line_user_id",
                    "message_payload",
                    "error_message",
                    "sent_at",
                ]
                + (["send_status"] if send_status_missing else []),
            )
            try:
                _insert(trimmed)
                return True
            except Exception as exc2:
                logger.warning(
                    "notification_log_failed_trimmed order=%s type=%s: %s",
                    order_id,
                    message_type,
                    _safe_error_message(exc2),
                )
                return False
        logger.warning(
            "notification_log_failed order=%s type=%s: %s",
            order_id,
            message_type,
            _safe_error_message(exc),
        )
        return False


def send_mock_notification(
    client: Client,
    order_id: str,
    customer_id: Optional[str],
    line_user_id: Optional[str],
    message_type: str,
    message_payload: Dict[str, Any],
) -> Dict[str, Any]:
    line_user_id_effective = line_user_id or _FALLBACK_LINE_USER_ID
    write_notification_log(
        client=client,
        order_id=order_id,
        customer_id=customer_id,
        line_user_id=line_user_id_effective,
        message_type=message_type,
        message_payload=message_payload,
        send_status="success",
        error_message=None,
    )
    return {
        "mode": "mock",
        "send_status": "success",
        "message_type": message_type,
        "line_user_id_masked": mask_line_user_id(line_user_id_effective),
        "real_send_enabled": False,
        "notification_text": message_payload.get("message") if isinstance(message_payload, dict) else None,
    }


def send_line_notification(
    client: Client,
    order_id: str,
    customer_id: Optional[str],
    line_user_id: Optional[str],
    message_type: str,
    message_payload: Dict[str, Any],
) -> Dict[str, Any]:
    configured_mode = normalize_line_send_mode(settings.line_send_mode)

    if configured_mode == "real_line":
        # Phase 5.4B skeleton guard:
        # - recognize real_line mode
        # - do not call external LINE API yet
        # - keep DB compatibility by preserving send_status="success"
        line_user_id_effective = line_user_id or _FALLBACK_LINE_USER_ID
        write_notification_log(
            client=client,
            order_id=order_id,
            customer_id=customer_id,
            line_user_id=line_user_id_effective,
            message_type=message_type,
            message_payload=message_payload,
            send_status="success",
            error_message=None,
        )
        return {
            "mode": "real_line",
            "configured_mode": "real_line",
            "effective_mode": "disabled_skeleton",
            "real_send_enabled": False,
            "send_status": "success",
            "message_type": message_type,
            "line_user_id_masked": mask_line_user_id(line_user_id_effective),
            "notification_message": message_payload.get("message") if isinstance(message_payload, dict) else None,
        }

    # Phase 5.4A guard: never call external LINE API in this phase.
    # Even when configured_mode is real_line, effective behavior remains mock.
    result = send_mock_notification(
        client=client,
        order_id=order_id,
        customer_id=customer_id,
        line_user_id=line_user_id,
        message_type=message_type,
        message_payload=message_payload,
    )
    result["configured_mode"] = configured_mode or "mock"
    result["mode"] = "mock"
    return result

