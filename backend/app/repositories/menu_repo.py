from supabase import Client


class MenuRepo:
    def __init__(self, db: Client):
        self.db = db

    def list_active_products(self, store_id: str):
        return self.db.table('products').select('id,name,description,image_url,base_price,is_special,category_id,product_categories(name)').eq('store_id', store_id).eq('is_active', True).execute().data

    def get_channel_prices(self, store_id: str, channel_id: str, product_ids: list[str]):
        return self.db.table('channel_prices').select('product_id,price').eq('store_id', store_id).eq('channel_id', channel_id).in_('product_id', product_ids).execute().data
