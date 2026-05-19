from datetime import datetime, timezone
from ..repositories.order_repo import OrderRepo
from ..utils.order_no import generate_order_no
from .line_service import LineService


class OrderService:
    ALLOWED = {'preparing', 'ready', 'completed', 'cancelled'}

    def __init__(self, repo: OrderRepo):
        self.repo = repo

    def create_order(self, store_id: str, customer_id: str, pickup_time: str | None, customer_note: str | None):
        payload = {
            'store_id': store_id,
            'customer_id': customer_id,
            'order_no': generate_order_no(),
            'order_type': 'manual',
            'channel': 'line_oa',
            'pickup_type': 'pickup',
            'order_status': 'pending_payment',
            'status': 'pending_payment',
            'payment_status': 'unpaid',
            'pickup_time': pickup_time,
            'customer_note': customer_note,
        }
        return self.repo.create_order(payload)

    def add_item(self, order_id: str, item: dict):
        payload = {'order_id': order_id, **item}
        return self.repo.add_item(payload)

    def get_order(self, order_id: str):
        return self.repo.get_order(order_id)

    def patch_status(self, order_id: str, order_status: str, cancelled_reason: str | None):
        if order_status not in self.ALLOWED:
            raise ValueError('Unsupported status')
        payload = {'order_status': order_status, 'status': order_status, 'updated_at': datetime.now(timezone.utc).isoformat()}
        if order_status == 'cancelled':
            payload['cancelled_reason'] = cancelled_reason
            payload['cancelled_at'] = datetime.now(timezone.utc).isoformat()
        updated = self.repo.patch_order(order_id, payload)

        warn = None
        if order_status in {'ready', 'cancelled'}:
            rows = self.repo.get_order_with_customer(order_id)
            if rows:
                o = rows[0]
                c = o.get('customers') or {}
                line_user_id = c.get('line_user_id')
                if line_user_id:
                    if order_status == 'ready':
                        notify = LineService().push_message(line_user_id, 'order_ready', 'ออเดอร์ของคุณพร้อมรับที่ร้านแล้วค่ะ', order_id=order_id, customer_id=o.get('customer_id'))
                    else:
                        reason = cancelled_reason or 'ไม่ระบุเหตุผล'
                        notify = LineService().push_message(line_user_id, 'order_cancelled', f'ออเดอร์ของคุณถูกยกเลิก ({reason})', order_id=order_id, customer_id=o.get('customer_id'))
                    if not notify['ok']:
                        warn = {'notification': notify}
        return {'order': updated[0] if updated else None, 'warning': warn}

    def list_admin_orders(self, **filters):
        return self.repo.list_admin_orders(**filters)
