from datetime import datetime, timezone
from ..repositories.payment_repo import PaymentRepo
from .line_service import LineService


class PaymentService:
    def __init__(self, repo: PaymentRepo):
        self.repo = repo

    def upload_slip(self, payload: dict):
        insert_payload = {
            'order_id': payload['order_id'],
            'customer_id': payload['customer_id'],
            'method': 'transfer',
            'amount': payload['amount'],
            'status': 'pending',
            'slip_url': payload.get('slip_url'),
            'slip_file_name': payload.get('slip_file_name'),
            'slip_storage_path': payload.get('slip_storage_path'),
            'submitted_at': datetime.now(timezone.utc).isoformat(),
        }
        return self.repo.create_payment(insert_payload)

    def approve(self, payment_id: str, confirmed_by: str | None):
        updated = self.repo.patch_payment(payment_id, {'status': 'paid', 'confirmed_at': datetime.now(timezone.utc).isoformat(), 'confirmed_by': confirmed_by})
        warn = None
        rows = self.repo.get_payment_with_order_customer(payment_id)
        if rows:
            p = rows[0]
            line_user_id = (p.get('customers') or {}).get('line_user_id') or ((p.get('orders') or {}).get('customers') or {}).get('line_user_id')
            if line_user_id:
                notify = LineService().push_message(
                    line_user_id=line_user_id,
                    message_type='payment_approved',
                    text='ร้านยืนยันการชำระเงินแล้ว และรับออเดอร์ของคุณเรียบร้อยค่ะ',
                    order_id=p.get('order_id'),
                    customer_id=p.get('customer_id'),
                )
                if not notify['ok']:
                    warn = {'notification': notify}
        return {'payment': updated[0] if updated else None, 'warning': warn}

    def reject(self, payment_id: str, reject_reason: str):
        updated = self.repo.patch_payment(payment_id, {'status': 'rejected', 'reject_reason': reject_reason})
        warn = None
        rows = self.repo.get_payment_with_order_customer(payment_id)
        if rows:
            p = rows[0]
            line_user_id = (p.get('customers') or {}).get('line_user_id') or ((p.get('orders') or {}).get('customers') or {}).get('line_user_id')
            if line_user_id:
                notify = LineService().push_message(
                    line_user_id=line_user_id,
                    message_type='payment_rejected',
                    text='สลิปการชำระเงินของคุณไม่ผ่านการตรวจสอบ กรุณาอัปโหลดใหม่',
                    order_id=p.get('order_id'),
                    customer_id=p.get('customer_id'),
                )
                if not notify['ok']:
                    warn = {'notification': notify}
        return {'payment': updated[0] if updated else None, 'warning': warn}

    def pending_for_admin(self, store_id: str | None):
        return self.repo.list_pending_for_admin(store_id)
