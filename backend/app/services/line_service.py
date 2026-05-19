from datetime import datetime, timezone
import requests
from ..core.config import settings
from ..core.supabase import get_supabase


class LineService:
    def __init__(self):
        self.db = get_supabase()

    def _build_text(self, message_type: str, text: str, extra_reason: str | None = None) -> str:
        base = text.strip()
        if message_type in {"payment_rejected", "order_cancelled"} and extra_reason:
            return f"{base}\nเหตุผล: {extra_reason}"
        return base

    def push_message(self, line_user_id: str, message_type: str, text: str, order_id: str | None = None, customer_id: str | None = None):
        send_status = "pending"
        error_message = None
        provider_response = None

        payload_text = self._build_text(message_type, text)

        try:
            token = settings.line_channel_access_token
            if not token:
                raise RuntimeError("LINE_CHANNEL_ACCESS_TOKEN is missing")
            resp = requests.post(
                "https://api.line.me/v2/bot/message/push",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json={"to": line_user_id, "messages": [{"type": "text", "text": payload_text}]},
                timeout=10,
            )
            provider_response = resp.text
            if resp.status_code < 300:
                send_status = "success"
            else:
                send_status = "failed"
                error_message = f"HTTP {resp.status_code}"
        except Exception as exc:
            send_status = "failed"
            error_message = str(exc)

        try:
            self.db.table("line_notification_logs").insert({
                "order_id": order_id,
                "customer_id": customer_id,
                "line_user_id": line_user_id,
                "message_type": message_type,
                "message": payload_text,
                "send_status": send_status,
                "provider_response": provider_response,
                "error_message": error_message,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
        except Exception:
            pass

        return {
            "ok": send_status == "success",
            "send_status": send_status,
            "error": error_message,
        }
