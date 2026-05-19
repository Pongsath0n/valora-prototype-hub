import requests
from datetime import datetime, timezone
from ..core.config import settings


class LineService:
    def __init__(self, db):
        self.db = db

    def push(self, store_id: str, line_user_id: str, message: str, order_id: str | None = None, customer_id: str | None = None):
        ok = False
        err = None
        resp_body = None
        try:
            if not settings.line_channel_access_token:
                raise RuntimeError('LINE_CHANNEL_ACCESS_TOKEN is missing')
            r = requests.post(
                'https://api.line.me/v2/bot/message/push',
                headers={'Authorization': f'Bearer {settings.line_channel_access_token}', 'Content-Type': 'application/json'},
                json={'to': line_user_id, 'messages': [{'type': 'text', 'text': message}]},
                timeout=10,
            )
            ok = r.status_code < 300
            resp_body = r.text
            if not ok:
                err = f'HTTP {r.status_code}'
        except Exception as e:
            err = str(e)
        finally:
            self.db.table('line_notification_logs').insert({
                'store_id': store_id,
                'order_id': order_id,
                'customer_id': customer_id,
                'line_user_id': line_user_id,
                'message': message,
                'status': 'success' if ok else 'failed',
                'error_message': err,
                'provider_response': resp_body,
                'created_at': datetime.now(timezone.utc).isoformat(),
            }).execute()
        return {'ok': ok, 'error': err}
