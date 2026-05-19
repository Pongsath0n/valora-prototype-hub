from datetime import datetime, timezone
from ..repositories.customer_repo import CustomerRepo


class CustomerService:
    def __init__(self, repo: CustomerRepo):
        self.repo = repo

    def upsert_line_customer(self, store_id: str, line_user_id: str, display_name: str, phone: str | None):
        now = datetime.now(timezone.utc).isoformat()
        found = self.repo.find_by_line(store_id, line_user_id)
        if found:
            row = found[0]
            updated = self.repo.update(row['id'], {'display_name': display_name, 'phone': phone, 'updated_at': now})
            return updated[0]['id']
        created = self.repo.insert({'store_id': store_id, 'line_user_id': line_user_id, 'display_name': display_name, 'phone': phone, 'total_orders': 0})
        return created[0]['id']
