from __future__ import annotations

import re
from typing import Any, Dict, Optional


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


def build_text_message_payload(to: str, text: str) -> Dict[str, Any]:
    recipient = (to or "").strip()
    message_text = str(text or "").strip()
    return {
        "to": recipient,
        "messages": [
            {
                "type": "text",
                "text": message_text,
            }
        ],
    }


def is_real_line_configured(settings: Any) -> bool:
    token = str(getattr(settings, "line_channel_access_token", "") or "").strip()
    secret = str(getattr(settings, "line_channel_secret", "") or "").strip()
    return bool(token and secret)


def get_line_config_status(settings: Any) -> Dict[str, Any]:
    token_set = bool(str(getattr(settings, "line_channel_access_token", "") or "").strip())
    secret_set = bool(str(getattr(settings, "line_channel_secret", "") or "").strip())
    return {
        "configured": token_set and secret_set,
        "line_channel_access_token": "configured" if token_set else "missing",
        "line_channel_secret": "configured" if secret_set else "missing",
    }


def sanitize_line_error(error: Exception | str | None) -> str:
    message = str(error or "line_adapter_error")
    # Basic redaction for token/bearer-like fragments and overly long strings.
    message = re.sub(r"(?i)bearer\s+[a-z0-9\-\._~\+\/]+=*", "bearer [redacted]", message)
    message = re.sub(r"(?i)(token|secret|apikey|api_key)\s*[=:]\s*[^\s,;]+", r"\1=[redacted]", message)
    return message[:200]


def create_disabled_line_result(
    *,
    mode: str,
    reason: str,
    line_user_id: Optional[str],
    send_status: str = "success",
    error_message: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "provider": "line",
        "mode": mode,
        "attempted": False,
        "send_status": send_status,
        "reason": reason,
        "real_send_enabled": False,
        "line_user_id_masked": mask_line_user_id(line_user_id),
        "error_message": error_message,
    }


def push_line_message(
    *,
    to: Optional[str],
    text: str,
    mode: str = "real_line",
    settings: Any = None,
) -> Dict[str, Any]:
    """
    Phase 5.4C skeleton only:
    - Builds no network transport
    - Performs no LINE Messaging API call
    - Returns safe disabled result contract
    """
    recipient = str(to or "").strip() or None

    if not recipient:
        return create_disabled_line_result(
            mode=mode,
            reason="missing_recipient",
            line_user_id=recipient,
            send_status="success",
            error_message=None,
        )

    _payload = build_text_message_payload(recipient, text)
    # Keep payload local only in skeleton path; no external send.
    _ = _payload

    if settings is not None and not is_real_line_configured(settings):
        return create_disabled_line_result(
            mode=mode,
            reason="not_configured",
            line_user_id=recipient,
            send_status="success",
            error_message=None,
        )

    return create_disabled_line_result(
        mode=mode,
        reason="disabled_skeleton",
        line_user_id=recipient,
        send_status="success",
        error_message=None,
    )

