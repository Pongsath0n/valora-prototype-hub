import unittest

from app.api.store_admin import CUSTOMER_NAME_FALLBACK, _map_order


class StoreAdminOrderDisplayTests(unittest.TestCase):
    def _base_row(self) -> dict:
        return {
            "id": "order-1",
            "store_id": "store-1",
            "status": "pending",
            "customer_id": "cust-1",
            "customer_name": None,
            "customer_phone": None,
        }

    def test_prefers_linked_customer_display_name_over_snapshot(self) -> None:
        row = self._base_row() | {"customer_name": "Mock Customer"}
        customer_map = {
            "cust-1": {
                "display_name": "LINE Real",
                "name": "Legacy Name",
                "full_name": "Full Legacy",
            }
        }
        mapped = _map_order(row, customer_map, {})
        self.assertEqual(mapped["customer_name"], "LINE Real")

    def test_snapshot_placeholder_does_not_override_linked_phone_fallback(self) -> None:
        row = self._base_row() | {"customer_name": "Mock Customer", "customer_phone": "0812345678"}
        customer_map = {"cust-1": {}}
        mapped = _map_order(row, customer_map, {})
        self.assertEqual(mapped["customer_name"], "0812345678")

    def test_fallback_label_used_when_no_name_or_phone(self) -> None:
        row = self._base_row()
        customer_map = {"cust-1": {}}
        mapped = _map_order(row, customer_map, {})
        self.assertEqual(mapped["customer_name"], CUSTOMER_NAME_FALLBACK)


if __name__ == "__main__":
    unittest.main()
