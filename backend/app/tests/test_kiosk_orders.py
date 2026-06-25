import unittest
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from unittest.mock import patch

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
            patch("app.api.store_admin._ensure_kiosk_channel", return_value="channel-1"), \
            patch("app.api.store_admin._ensure_product_in_store"), \
            patch("app.api.store_admin.prepare_order_item_snapshot", return_value=snapshot) as mock_snapshot, \
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
        self.assertEqual(order_row["channel_id"], "channel-1")
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
        mock_snapshot.assert_called_once_with(
            fake_client,
            "store-1",
            product_id="prod-1",
            quantity=2,
            channel_id="channel-1",
            raw_options=None,
        )

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

    def test_create_kiosk_order_fails_when_kiosk_channel_missing(self) -> None:
        payload = self._build_payload()
        fake_client = self._FakeClient()

        with patch("app.api.store_admin._get_ctx", return_value={"client": fake_client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch(
                "app.api.store_admin._ensure_kiosk_channel",
                side_effect=HTTPException(status_code=500, detail="kiosk_channel_unavailable"),
            ):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_kiosk_order(payload, authorization="Bearer token")

        self.assertEqual(ctx_err.exception.detail, "kiosk_channel_unavailable")
        self.assertEqual(fake_client.order_rows, [])


class _SalesChannelClientDouble:
    def __init__(self, rows: Optional[List[Dict[str, Any]]] = None, insert_error: Optional[str] = None) -> None:
        self.rows: List[Dict[str, Any]] = rows or []
        self.insert_error = insert_error
        self.insert_calls = 0
        self.last_insert_payload: Optional[Dict[str, Any]] = None

    class _Table:
        def __init__(self, parent: "_SalesChannelClientDouble", name: str):
            self.parent = parent
            self.name = name
            self.operation: Optional[str] = None
            self.filters: Dict[str, Any] = {}
            self.limit_value: Optional[int] = None
            self.payload: Optional[Dict[str, Any]] = None

        def select(self, _columns: str) -> "_SalesChannelClientDouble._Table":
            self.operation = "select"
            return self

        def eq(self, column: str, value: Any) -> "_SalesChannelClientDouble._Table":
            self.filters[column] = value
            return self

        def limit(self, value: int) -> "_SalesChannelClientDouble._Table":
            self.limit_value = value
            return self

        def insert(self, payload: Dict[str, Any]) -> "_SalesChannelClientDouble._Table":
            self.operation = "insert"
            self.payload = payload
            return self

        def execute(self) -> SimpleNamespace:
            if self.name != "sales_channels":
                raise AssertionError(f"unexpected table {self.name}")
            if self.operation == "select":
                return self.parent._execute_select(self.filters, self.limit_value)
            if self.operation == "insert":
                if self.payload is None:
                    raise AssertionError("insert payload missing")
                return self.parent._execute_insert(self.payload)
            raise AssertionError(f"unsupported operation {self.operation}")

    def table(self, name: str) -> "_SalesChannelClientDouble._Table":
        return _SalesChannelClientDouble._Table(self, name)

    def _execute_select(self, filters: Dict[str, Any], limit_value: Optional[int]) -> SimpleNamespace:
        rows: List[Dict[str, Any]] = []
        for row in self.rows:
            if all(row.get(key) == value for key, value in filters.items()):
                rows.append(dict(row))
        if limit_value is not None:
            rows = rows[:limit_value]
        return SimpleNamespace(error=None, data=rows)

    def _execute_insert(self, payload: Dict[str, Any]) -> SimpleNamespace:
        self.insert_calls += 1
        if self.insert_error:
            return SimpleNamespace(error=SimpleNamespace(message=self.insert_error), data=None)

        duplicate = any(
            row.get("store_id") == payload.get("store_id") and row.get("name") == payload.get("name")
            for row in self.rows
        )
        if duplicate:
            return SimpleNamespace(error=SimpleNamespace(message="duplicate key value violates unique constraint name"), data=None)

        record = dict(payload)
        record.setdefault("id", f"channel-{len(self.rows) + 1}")
        self.last_insert_payload = dict(payload)
        self.rows.append(record)
        return SimpleNamespace(error=None, data=[record])


class KioskChannelProvisioningTests(unittest.TestCase):
    def test_ensure_kiosk_channel_reuses_existing_row(self) -> None:
        client = _SalesChannelClientDouble(rows=[{"id": "channel-a", "store_id": "store-1", "name": "kiosk"}])

        channel_id = store_admin._ensure_kiosk_channel(client, "store-1")

        self.assertEqual(channel_id, "channel-a")
        self.assertEqual(client.insert_calls, 0)

    def test_ensure_kiosk_channel_creates_when_missing(self) -> None:
        client = _SalesChannelClientDouble()

        channel_id = store_admin._ensure_kiosk_channel(client, "store-1")

        self.assertEqual(channel_id, "channel-1")
        self.assertEqual(client.last_insert_payload["name"], store_admin.KIOSK_CHANNEL_DISPLAY_NAME)
        self.assertEqual(client.last_insert_payload["type"], "manual")
        self.assertEqual(client.last_insert_payload["fee_type"], "none")
        self.assertEqual(client.last_insert_payload["fee_value"], 0)
        self.assertTrue(client.last_insert_payload["is_active"])

    def test_ensure_kiosk_channel_bubbles_failure(self) -> None:
        client = _SalesChannelClientDouble(insert_error="forced failure")

        with self.assertRaises(HTTPException) as ctx_err:
            store_admin._ensure_kiosk_channel(client, "store-1")

        self.assertEqual(ctx_err.exception.detail, "kiosk_channel_unavailable")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
