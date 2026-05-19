from supabase import Client


class OrderRepo:
    def __init__(self, db: Client):
        self.db = db

    def create_order(self, payload: dict):
        return self.db.table('orders').insert(payload).execute().data

    def add_item(self, payload: dict):
        return self.db.table('order_items').insert(payload).execute().data

    def get_order(self, order_id: str):
        return self.db.table('orders').select('*,customers(*),order_items(*),payments(*)').eq('id', order_id).limit(1).execute().data

    def patch_order(self, order_id: str, payload: dict):
        return self.db.table('orders').update(payload).eq('id', order_id).execute().data

    def list_admin_orders(self, **filters):
        q = self.db.table('orders').select('*')
        if filters.get('store_id'):
            q = q.eq('store_id', filters['store_id'])
        if filters.get('order_status'):
            q = q.eq('order_status', filters['order_status'])
        if filters.get('payment_status'):
            q = q.eq('payment_status', filters['payment_status'])
        if filters.get('start_date'):
            q = q.gte('created_at', filters['start_date'])
        if filters.get('end_date'):
            q = q.lte('created_at', filters['end_date'])
        return q.order('created_at', desc=True).execute().data


    def get_order_with_customer(self, order_id: str):
        return self.db.table('orders').select('*,customers(*)').eq('id', order_id).limit(1).execute().data
