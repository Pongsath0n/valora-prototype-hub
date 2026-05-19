from datetime import datetime, timezone
from ..repositories.payment_repo import PaymentRepo


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
        return self.repo.patch_payment(payment_id, {'status': 'paid', 'confirmed_at': datetime.now(timezone.utc).isoformat(), 'confirmed_by': confirmed_by})

    def reject(self, payment_id: str, reject_reason: str):
        return self.repo.patch_payment(payment_id, {'status': 'rejected', 'reject_reason': reject_reason})

    def pending_for_admin(self, store_id: str | None):
        return self.repo.list_pending_for_admin(store_id)
