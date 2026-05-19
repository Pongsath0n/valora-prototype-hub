from supabase import Client


class CustomerRepo:
    def __init__(self, db: Client):
        self.db = db

    def find_by_line(self, store_id: str, line_user_id: str):
        return self.db.table('customers').select('*').eq('store_id', store_id).eq('line_user_id', line_user_id).limit(1).execute().data

    def insert(self, payload: dict):
        return self.db.table('customers').insert(payload).execute().data

    def update(self, customer_id: str, payload: dict):
        return self.db.table('customers').update(payload).eq('id', customer_id).execute().data
