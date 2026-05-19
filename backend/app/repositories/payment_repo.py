from supabase import Client


class PaymentRepo:
    def __init__(self, db: Client):
        self.db = db

    def create_payment(self, payload: dict):
        return self.db.table('payments').insert(payload).execute().data

    def patch_payment(self, payment_id: str, payload: dict):
        return self.db.table('payments').update(payload).eq('id', payment_id).execute().data

    def list_pending_for_admin(self, store_id: str | None = None):
        q = self.db.table('payments').select('*,orders(*),customers(*)').in_('status', ['pending', 'pending_review'])
        if store_id:
            q = q.eq('orders.store_id', store_id)
        return q.order('created_at', desc=True).execute().data


    def get_payment_with_order_customer(self, payment_id: str):
        return self.db.table('payments').select('*,orders(*,customers(*)),customers(*)').eq('id', payment_id).limit(1).execute().data
