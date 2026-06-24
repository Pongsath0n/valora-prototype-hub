import unittest
from types import SimpleNamespace
from typing import Any, Dict, List
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.api import store_admin


class KioskOrderEndpointTests(unittest.TestCase):
    class _FakeInsertTable:
        def __init__(self, name: str, store: List[Any]):
            self.name = name
            self.store = store
            self.payload: Any = None

        def insert(self, payload: Any) -> "KioskOrderEndpointTests._FakeInsertTable":
            self.payload = payload
            return self

        def execute(self) -> SimpleNamespace:
            if self.name == "orders":
                row = dict(self.payload)
                row.setdefault("id", f"order-{len(self.store) + 1}")
                self.store.append(row)
                return SimpleNamespace(error=None, data=[row])
            self.store.append(self.payload)
            return SimpleNamespace(error=None, data=self.payload)

    class _FakeClient:
        def __init__(self) -> None:
            self.order_rows: List[Dict[str, Any]] = []
            self.order_item_rows: List[Any] = []

        def table(self, name: str) -> "KioskOrderEndpointTests._FakeInsertTable":
            if name == "orders":
                return KioskOrderEndpointTests._FakeInsertTable(name, self.order_rows)
            if name == "order_items":
                return KioskOrderEndpointTests._FakeInsertTable(name, self.order_item_rows)
            raise AssertionError(f"unexpected table {name}")

    def _build_payload(self) -> store_admin.KioskOrderCreate:
        return store_admin.KioskOrderCreate(
            items=[store_admin.OrderItemPayload(product_id="prod-1", quantity=2)],
            payment_method="cash",
            customer=None,
            note="   walk-in latte   ",
        )

    def test_staff_kiosk_order_recalculates_totals_and_masks_response(self) -> None:
        payload = self._build_payload()
        fake_client = self._FakeClient()
        snapshot = {
            "product_id": "prod-1",
            "quantity": 2,
            "product_name": "Latte",
            "total_price": 80.0,
            "total_cost": 30.0,
        }

        def fake_build_record(
            snap: Dict[str, Any], *, order_id: str, store_id: str | None, product_name: str | None
        ) -> Dict[str, Any]:
            record = dict(snap)
            record.update({"order_id": order_id, "store_id": store_id, "product_name": product_name})
            return record

        def fake_orders_has_column(_client: Any, column: str) -> bool:
            return column in {
                "customer_name",
                "customer_phone",
                "channel_fee",
                "order_source",
                "channel",
                "order_status",
                "payment_method",
            }

        def fake_map_order(_client: Any, store_id: str, order_id: str, is_staff: bool) -> Dict[str, Any]:
            base = {
                "id": order_id,
                "store_id": store_id,
                "total_cost": 30.0,
                "gross_profit": 50.0,
                "items": [
                    {
                        "unit_cost": 15.0,
                        "line_cost": 30.0,
                        "line_profit": 20.0,
                        "total_cost": 30.0,
                        "product_name": "Latte",
                    }
                ],
            }
            return store_admin._mask_order_for_staff(base) if is_staff else base

        with patch("app.api.store_admin._get_ctx", return_value={"client": fake_client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._resolve_kiosk_channel", return_value="channel-1"), \
            patch("app.api.store_admin._ensure_product_in_store"), \
            patch("app.api.store_admin.prepare_order_item_snapshot", return_value=snapshot), \
            patch("app.api.store_admin.resolve_channel_fee", return_value=5.0), \
            patch("app.api.store_admin.generate_order_number", return_value="ORD-123"), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.build_order_item_record", side_effect=fake_build_record), \
            patch("app.api.store_admin.prune_order_item_columns", side_effect=lambda _client, record: record), \
            patch("app.api.store_admin._orders_has_column", side_effect=fake_orders_has_column), \
            patch("app.api.store_admin._create_paid_payment") as mock_payment, \
            patch("app.api.store_admin.recalculate_order_totals") as mock_recalc, \
            patch("app.api.store_admin._write_order_status_log") as mock_status_log, \
            patch("app.api.store_admin._map_created_order_with_items", side_effect=fake_map_order):
            response = store_admin.create_kiosk_order(payload, authorization="Bearer token")

        order_row = fake_client.order_rows[0]
        self.assertEqual(order_row["subtotal"], 80.0)
        self.assertEqual(order_row["total_cost"], 30.0)
        self.assertEqual(order_row["channel_fee"], 5.0)
        self.assertEqual(order_row["total_amount"], 85.0)
        self.assertEqual(order_row["gross_profit"], 50.0)
        self.assertEqual(order_row["status"], "accepted")
        self.assertEqual(order_row["payment_status"], "paid")
        self.assertEqual(order_row["order_source"], "kiosk")
        self.assertEqual(order_row["channel"], "kiosk")
        self.assertEqual(order_row["order_status"], "accepted")
        self.assertEqual(order_row["payment_method"], "cash")
        self.assertEqual(order_row["note"], "walk-in latte")
        self.assertEqual(fake_client.order_item_rows[0][0]["store_id"], "store-1")

        mock_payment.assert_called_once()
        payment_args = mock_payment.call_args[0]
        self.assertEqual(payment_args[1], "store-1")
        self.assertEqual(payment_args[2], order_row["id"])
        self.assertEqual(payment_args[3], 85.0)
        self.assertEqual(payment_args[4], "cash")
        mock_recalc.assert_called_once_with(fake_client, "store-1", order_row["id"])
        mock_status_log.assert_called_once()

        self.assertIsNone(response["total_cost"])
        self.assertIsNone(response["gross_profit"])
        self.assertEqual(len(response["items"]), 1)
        self.assertIsNone(response["items"][0]["unit_cost"])
        self.assertIsNone(response["items"][0]["line_profit"])

    def test_create_kiosk_order_blocks_non_staff_role(self) -> None:
        payload = self._build_payload()
        fake_client = self._FakeClient()

        with patch("app.api.store_admin._get_ctx", return_value={"client": fake_client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "viewer")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_kiosk_order(payload, authorization="Bearer token")

        self.assertEqual(ctx_err.exception.detail, "insufficient_role")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
