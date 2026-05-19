from ..repositories.menu_repo import MenuRepo


class MenuService:
    def __init__(self, repo: MenuRepo):
        self.repo = repo

    def list_menus(self, store_id: str, channel_id: str | None = None):
        products = self.repo.list_active_products(store_id) or []
        if not channel_id:
            return [{**p, 'category': (p.get('product_categories') or {}).get('name'), 'base_price': float(p.get('base_price') or 0)} for p in products]
        pids = [p['id'] for p in products]
        prices = self.repo.get_channel_prices(store_id, channel_id, pids) if pids else []
        pmap = {x['product_id']: float(x['price']) for x in (prices or [])}
        return [{**p, 'category': (p.get('product_categories') or {}).get('name'), 'base_price': pmap.get(p['id'], float(p.get('base_price') or 0))} for p in products]
