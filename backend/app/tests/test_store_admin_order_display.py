import unittest
from unittest.mock import patch

from app.api.store_admin import CUSTOMER_NAME_FALLBACK, _load_order_relation_maps, _map_order


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
        customer_map = {"cust-1": {"display_name": "LINE Real", "phone": "081"}}
        mapped = _map_order(row, customer_map, {})
        self.assertEqual(mapped["customer_name"], "LINE Real")

    def test_snapshot_name_used_when_no_linked_display(self) -> None:
        row = self._base_row() | {"customer_name": "คุณลูกค้า"}
        customer_map = {"cust-1": {"display_name": None, "phone": "081"}}
        mapped = _map_order(row, customer_map, {})
        self.assertEqual(mapped["customer_name"], "คุณลูกค้า")

    def test_linked_phone_used_when_no_names(self) -> None:
        row = self._base_row()
        customer_map = {"cust-1": {"display_name": None, "phone": "0812345678"}}
        mapped = _map_order(row, customer_map, {})
        self.assertEqual(mapped["customer_name"], "0812345678")
        self.assertEqual(mapped["customer_phone"], "0812345678")

    def test_order_phone_used_when_only_snapshot_phone_exists(self) -> None:
        row = self._base_row() | {"customer_phone": "0999999999"}
        customer_map = {"cust-1": {}}
        mapped = _map_order(row, customer_map, {})
        self.assertEqual(mapped["customer_name"], "0999999999")
        self.assertEqual(mapped["customer_phone"], "0999999999")

    def test_snapshot_placeholder_does_not_override_linked_phone_fallback(self) -> None:
        row = self._base_row() | {"customer_name": "Mock Customer"}
        customer_map = {"cust-1": {"display_name": None, "phone": "0811111111"}}
        mapped = _map_order(row, customer_map, {})
        self.assertEqual(mapped["customer_name"], "0811111111")

    def test_fallback_label_used_when_no_name_or_phone(self) -> None:
        row = self._base_row()
        customer_map = {"cust-1": {}}
        mapped = _map_order(row, customer_map, {})
        self.assertEqual(mapped["customer_name"], CUSTOMER_NAME_FALLBACK)

    @patch("app.api.store_admin._load_relation_names", return_value={})
    def test_load_order_relation_maps_only_requests_supported_customer_columns(self, _mock_rel) -> None:
        class FakeResponse:
            def __init__(self, data):
                self.data = data
                self.error = None

        class FakeTable:
            def __init__(self, client):
                self.client = client

            def select(self, columns: str):
                self.client.last_select = columns
                return self

            def eq(self, *_args, **_kwargs):
                return self

            def in_(self, *_args, **_kwargs):
                return self

            def execute(self):
                return FakeResponse([{ "id": "cust-1", "display_name": "LINE", "phone": "080" }])

        class FakeClient:
            def __init__(self):
                self.last_select = None

            def table(self, name: str):
                if name != "customers":
                    raise AssertionError(f"unexpected table {name}")
                return FakeTable(self)

        fake_client = FakeClient()
        customer_map, channel_map = _load_order_relation_maps(
            fake_client,
            "store",
            [{"customer_id": "cust-1"}],
        )
        self.assertEqual(fake_client.last_select, "id, display_name, phone")
        self.assertIn("cust-1", customer_map)
        self.assertEqual(customer_map["cust-1"]["display_name"], "LINE")
        self.assertEqual(channel_map, {})


if __name__ == "__main__":
    unittest.main()
