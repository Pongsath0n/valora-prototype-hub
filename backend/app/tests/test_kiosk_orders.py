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
            "base_cost_breakdown": [
                {"ingredient_id": "ing-coffee", "quantity_used": 18.0, "unit": "g"},
                {"ingredient_id": "ing-milk", "quantity_used": 150.0, "unit": "ml"},
            ],
            "addon_cost_breakdown": [],
            "options_snapshot": {"sweetness": 100, "addons": []},
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
            patch("app.api.store_admin.build_usage_plan", return_value=[{"order_item_id": "oi-1", "ingredient_id": "ing-coffee", "quantity": 36.0}]) as mock_build_plan, \
            patch("app.api.store_admin.consume_for_paid_order") as mock_consume, \
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

        # Stock consumption is called AFTER payment + totals, with the real
        # order id and the authenticated actor id.
        mock_build_plan.assert_called_once()
        mock_consume.assert_called_once()
        consume_kwargs = mock_consume.call_args.kwargs
        self.assertEqual(consume_kwargs["store_id"], "store-1")
        self.assertEqual(consume_kwargs["order_id"], order_row["id"])
        self.assertEqual(consume_kwargs["actor_id"], "user-1")
        self.assertTrue(consume_kwargs["usage_plan"])
        # Payment must be created before stock consumption.
        self.assertTrue(mock_payment.called)
        self.assertTrue(mock_recalc.called)
        self.assertTrue(response["stock_consumed"])

    def test_create_kiosk_order_stock_failure_surfaces_controlled_error(self) -> None:
        from app.services.stock_service import StockSyncFailedError

        payload = self._build_payload()
        fake_client = self._FakeClient()
        snapshot = {
            "product_id": "prod-1",
            "quantity": 2,
            "product_name": "Latte",
            "total_price": 80.0,
            "total_cost": 30.0,
            "base_cost_breakdown": [
                {"ingredient_id": "ing-coffee", "quantity_used": 18.0, "unit": "g"},
            ],
            "addon_cost_breakdown": [],
            "options_snapshot": {"sweetness": 100, "addons": []},
        }

        with patch("app.api.store_admin._get_ctx", return_value={"client": fake_client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._ensure_kiosk_channel", return_value="channel-1"), \
            patch("app.api.store_admin._ensure_product_in_store"), \
            patch("app.api.store_admin.prepare_order_item_snapshot", return_value=snapshot), \
            patch("app.api.store_admin.resolve_channel_fee", return_value=5.0), \
            patch("app.api.store_admin.generate_order_number", return_value="ORD-123"), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.build_order_item_record", side_effect=lambda snap, **kw: {**snap, **kw}), \
            patch("app.api.store_admin.prune_order_item_columns", side_effect=lambda _c, record: record), \
            patch("app.api.store_admin._orders_has_column", return_value=False), \
            patch("app.api.store_admin._create_paid_payment"), \
            patch("app.api.store_admin.recalculate_order_totals"), \
            patch("app.api.store_admin._write_order_status_log"), \
            patch("app.api.store_admin.build_usage_plan", return_value=[{"order_item_id": "oi-1", "ingredient_id": "ing-coffee", "quantity": 36.0}]), \
            patch("app.api.store_admin.consume_for_paid_order", side_effect=StockSyncFailedError("sync_failed", reason="stock_sync_failed", order_id="order-1", order_no="ORD-123")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_kiosk_order(payload, authorization="Bearer token")
        # FIX-D: structured partial-commit response with order context
        self.assertEqual(ctx_err.exception.status_code, 503)
        detail = ctx_err.exception.detail
        self.assertIsInstance(detail, dict)
        self.assertEqual(detail["code"], "kiosk_order_stock_sync_failed")
        self.assertEqual(detail["payment_status"], "paid")
        self.assertEqual(detail["stock_consumed"], False)
        self.assertEqual(detail["action"], "do_not_resubmit")
        self.assertIn("order_id", detail)

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

    # ── FIX-A: Pre-persistence validation tests ──────────────────────────

    def _make_snapshot(self, *, base_breakdown=None, addon_breakdown=None) -> Dict[str, Any]:
        return {
            "product_id": "prod-1",
            "quantity": 2,
            "product_name": "Latte",
            "total_price": 80.0,
            "total_cost": 30.0,
            "base_cost_breakdown": base_breakdown if base_breakdown is not None else [
                {"ingredient_id": "ing-coffee", "quantity_used": 18.0, "unit": "g"},
            ],
            "addon_cost_breakdown": addon_breakdown if addon_breakdown is not None else [],
            "options_snapshot": {"sweetness": 100, "addons": []},
        }

    def test_missing_recipe_rejected_before_order_insert(self) -> None:
        """FIX-A: Missing recipe → 400 before any persistence."""
        payload = self._build_payload()
        fake_client = self._FakeClient()
        snapshot = self._make_snapshot(base_breakdown=[])

        with patch("app.api.store_admin._get_ctx", return_value={"client": fake_client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._ensure_kiosk_channel", return_value="channel-1"), \
            patch("app.api.store_admin._ensure_product_in_store"), \
            patch("app.api.store_admin.prepare_order_item_snapshot", return_value=snapshot):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_kiosk_order(payload, authorization="Bearer token")

        self.assertEqual(ctx_err.exception.status_code, 400)
        self.assertIn("kiosk_order_invalid_inventory_configuration", ctx_err.exception.detail)
        self.assertIn("missing_recipe", ctx_err.exception.detail)
        # No order/payment/stock must be created
        self.assertEqual(fake_client.order_rows, [])

    def test_invalid_recipe_quantity_rejected_before_persistence(self) -> None:
        """FIX-A: quantity_used <= 0 → 400 before any persistence."""
        payload = self._build_payload()
        fake_client = self._FakeClient()
        snapshot = self._make_snapshot(base_breakdown=[
            {"ingredient_id": "ing-coffee", "quantity_used": 0.0, "unit": "g"},
        ])

        with patch("app.api.store_admin._get_ctx", return_value={"client": fake_client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._ensure_kiosk_channel", return_value="channel-1"), \
            patch("app.api.store_admin._ensure_product_in_store"), \
            patch("app.api.store_admin.prepare_order_item_snapshot", return_value=snapshot):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_kiosk_order(payload, authorization="Bearer token")

        self.assertEqual(ctx_err.exception.status_code, 400)
        self.assertIn("invalid_recipe_quantity", ctx_err.exception.detail)
        self.assertEqual(fake_client.order_rows, [])

    def test_missing_ingredient_id_rejected_before_persistence(self) -> None:
        """FIX-A: missing ingredient_id → 400 before any persistence."""
        payload = self._build_payload()
        fake_client = self._FakeClient()
        snapshot = self._make_snapshot(base_breakdown=[
            {"ingredient_id": None, "quantity_used": 18.0, "unit": "g"},
        ])

        with patch("app.api.store_admin._get_ctx", return_value={"client": fake_client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._ensure_kiosk_channel", return_value="channel-1"), \
            patch("app.api.store_admin._ensure_product_in_store"), \
            patch("app.api.store_admin.prepare_order_item_snapshot", return_value=snapshot):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_kiosk_order(payload, authorization="Bearer token")

        self.assertEqual(ctx_err.exception.status_code, 400)
        self.assertIn("missing_ingredient_id", ctx_err.exception.detail)
        self.assertEqual(fake_client.order_rows, [])

    # ── FIX-B: Transaction idempotency tests ─────────────────────────────

    def test_client_order_id_used_as_order_id(self) -> None:
        """FIX-B: client_order_id is inserted as orders.id."""
        import uuid as _uuid
        client_order_id = str(_uuid.uuid4())
        payload = store_admin.KioskOrderCreate(
            items=[store_admin.OrderItemPayload(product_id="prod-1", quantity=1)],
            payment_method="cash",
            client_order_id=client_order_id,
        )
        fake_client = self._FakeClient()
        snapshot = self._make_snapshot()

        with patch("app.api.store_admin._get_ctx", return_value={"client": fake_client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._ensure_kiosk_channel", return_value="channel-1"), \
            patch("app.api.store_admin._ensure_product_in_store"), \
            patch("app.api.store_admin.prepare_order_item_snapshot", return_value=snapshot), \
            patch("app.api.store_admin.resolve_channel_fee", return_value=5.0), \
            patch("app.api.store_admin.generate_order_number", return_value="ORD-200"), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.build_order_item_record", side_effect=lambda snap, **kw: {**snap, **kw}), \
            patch("app.api.store_admin.prune_order_item_columns", side_effect=lambda _c, record: record), \
            patch("app.api.store_admin._orders_has_column", return_value=False), \
            patch("app.api.store_admin._create_paid_payment"), \
            patch("app.api.store_admin.recalculate_order_totals"), \
            patch("app.api.store_admin._write_order_status_log"), \
            patch("app.api.store_admin.build_usage_plan", return_value=[]), \
            patch("app.api.store_admin._map_created_order_with_items", return_value={"id": client_order_id}):
            store_admin.create_kiosk_order(payload, authorization="Bearer token")

        self.assertEqual(fake_client.order_rows[0]["id"], client_order_id)

    def test_invalid_client_order_id_rejected(self) -> None:
        """FIX-B: non-UUID client_order_id → 400."""
        payload = store_admin.KioskOrderCreate(
            items=[store_admin.OrderItemPayload(product_id="prod-1", quantity=1)],
            payment_method="cash",
            client_order_id="not-a-uuid",
        )
        fake_client = self._FakeClient()
        snapshot = self._make_snapshot()

        with patch("app.api.store_admin._get_ctx", return_value={"client": fake_client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._ensure_kiosk_channel", return_value="channel-1"), \
            patch("app.api.store_admin._ensure_product_in_store"), \
            patch("app.api.store_admin.prepare_order_item_snapshot", return_value=snapshot), \
            patch("app.api.store_admin.resolve_channel_fee", return_value=5.0):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_kiosk_order(payload, authorization="Bearer token")

        self.assertEqual(ctx_err.exception.status_code, 400)
        self.assertEqual(ctx_err.exception.detail, "kiosk_order_invalid_client_order_id")

    def test_duplicate_client_order_id_returns_existing_order(self) -> None:
        """FIX-B: duplicate client_order_id → idempotent replay (200)."""
        import uuid as _uuid
        client_order_id = str(_uuid.uuid4())
        payload = store_admin.KioskOrderCreate(
            items=[store_admin.OrderItemPayload(product_id="prod-1", quantity=1)],
            payment_method="cash",
            client_order_id=client_order_id,
        )
        fake_client = self._FakeClient()
        snapshot = self._make_snapshot()

        # Simulate orders_pkey violation on insert
        class _PkeyViolationClient:
            def table(self, name):
                if name == "orders":
                    return _PkeyViolationTable()
                raise AssertionError(f"unexpected table {name}")

        class _PkeyViolationTable:
            def insert(self, payload):
                self.payload = payload
                return self

            def execute(self):
                # Simulate a unique violation exception (PostgREST style)
                raise Exception("duplicate key value violates unique constraint \"orders_pkey\"")

        # Mock the replay classification to return "complete"
        replay_classification = {
            "state": "complete",
            "order_id": client_order_id,
            "order_no": "ORD-100",
            "payment_status": "paid",
            "stock_consumed": True,
        }
        existing_items = [{"product_id": "prod-1", "quantity": 1}]

        with patch("app.api.store_admin._get_ctx", return_value={"client": _PkeyViolationClient(), "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._ensure_kiosk_channel", return_value="channel-1"), \
            patch("app.api.store_admin._ensure_product_in_store"), \
            patch("app.api.store_admin.prepare_order_item_snapshot", return_value=snapshot), \
            patch("app.api.store_admin.resolve_channel_fee", return_value=5.0), \
            patch("app.api.store_admin.generate_order_number", return_value="ORD-100"), \
            patch("app.api.store_admin._orders_has_column", return_value=False), \
            patch("app.api.store_admin._classify_existing_order", return_value=replay_classification), \
            patch("app.api.store_admin._compare_payload_with_existing_order", return_value=True), \
            patch("app.api.store_admin._map_created_order_with_items", return_value={"id": client_order_id, "order_no": "ORD-100"}) as mock_map:
            result = store_admin.create_kiosk_order(payload, authorization="Bearer token")

        self.assertEqual(result["id"], client_order_id)
        self.assertTrue(result["idempotent_replay"])
        self.assertTrue(result["stock_consumed"])
        mock_map.assert_called_once()

    def test_duplicate_client_order_id_payload_mismatch_returns_409(self) -> None:
        """FIX-B: same client_order_id + different cart → 409 conflict."""
        import uuid as _uuid
        client_order_id = str(_uuid.uuid4())
        payload = store_admin.KioskOrderCreate(
            items=[store_admin.OrderItemPayload(product_id="prod-1", quantity=1)],
            payment_method="cash",
            client_order_id=client_order_id,
        )
        snapshot = self._make_snapshot()

        class _PkeyViolationTable:
            def insert(self, payload):
                return self

            def execute(self):
                raise Exception("duplicate key value violates unique constraint \"orders_pkey\"")

        class _PkeyViolationClient:
            def table(self, name):
                if name == "orders":
                    return _PkeyViolationTable()
                raise AssertionError(f"unexpected table {name}")

        with patch("app.api.store_admin._get_ctx", return_value={"client": _PkeyViolationClient(), "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._ensure_kiosk_channel", return_value="channel-1"), \
            patch("app.api.store_admin._ensure_product_in_store"), \
            patch("app.api.store_admin.prepare_order_item_snapshot", return_value=snapshot), \
            patch("app.api.store_admin.resolve_channel_fee", return_value=5.0), \
            patch("app.api.store_admin.generate_order_number", return_value="ORD-100"), \
            patch("app.api.store_admin._orders_has_column", return_value=False), \
            patch("app.api.store_admin._classify_existing_order", return_value={"state": "complete", "order_id": client_order_id}), \
            patch("app.api.store_admin._compare_payload_with_existing_order", return_value=False):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_kiosk_order(payload, authorization="Bearer token")

        self.assertEqual(ctx_err.exception.status_code, 409)
        detail = ctx_err.exception.detail
        self.assertEqual(detail["code"], "idempotency_key_conflict")

    def test_duplicate_client_order_id_partial_paid_returns_409(self) -> None:
        """FIX-B: duplicate client_order_id + partial_paid state → 409 with recovery info."""
        import uuid as _uuid
        client_order_id = str(_uuid.uuid4())
        payload = store_admin.KioskOrderCreate(
            items=[store_admin.OrderItemPayload(product_id="prod-1", quantity=1)],
            payment_method="cash",
            client_order_id=client_order_id,
        )
        snapshot = self._make_snapshot()

        class _PkeyViolationTable:
            def insert(self, payload):
                return self

            def execute(self):
                raise Exception("duplicate key value violates unique constraint \"orders_pkey\"")

        class _PkeyViolationClient:
            def table(self, name):
                if name == "orders":
                    return _PkeyViolationTable()
                raise AssertionError(f"unexpected table {name}")

        with patch("app.api.store_admin._get_ctx", return_value={"client": _PkeyViolationClient(), "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._ensure_kiosk_channel", return_value="channel-1"), \
            patch("app.api.store_admin._ensure_product_in_store"), \
            patch("app.api.store_admin.prepare_order_item_snapshot", return_value=snapshot), \
            patch("app.api.store_admin.resolve_channel_fee", return_value=5.0), \
            patch("app.api.store_admin.generate_order_number", return_value="ORD-100"), \
            patch("app.api.store_admin._orders_has_column", return_value=False), \
            patch("app.api.store_admin._classify_existing_order", return_value={
                "state": "partial_paid",
                "order_id": client_order_id,
                "order_no": "ORD-100",
                "payment_status": "paid",
                "stock_consumed": False,
            }), \
            patch("app.api.store_admin._compare_payload_with_existing_order", return_value=True):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_kiosk_order(payload, authorization="Bearer token")

        self.assertEqual(ctx_err.exception.status_code, 409)
        detail = ctx_err.exception.detail
        self.assertEqual(detail["code"], "kiosk_order_stock_sync_failed")
        self.assertEqual(detail["payment_status"], "paid")
        self.assertEqual(detail["stock_consumed"], False)
        self.assertEqual(detail["action"], "do_not_resubmit")

    # ── FIX-D: Structured partial-commit response test ───────────────────

    def test_stock_sync_failure_returns_503_with_order_context(self) -> None:
        """FIX-D: StockSyncFailedError → 503 with order_id, order_no, payment_status."""
        from app.services.stock_service import StockSyncFailedError

        payload = self._build_payload()
        fake_client = self._FakeClient()
        snapshot = self._make_snapshot()

        with patch("app.api.store_admin._get_ctx", return_value={"client": fake_client, "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._ensure_kiosk_channel", return_value="channel-1"), \
            patch("app.api.store_admin._ensure_product_in_store"), \
            patch("app.api.store_admin.prepare_order_item_snapshot", return_value=snapshot), \
            patch("app.api.store_admin.resolve_channel_fee", return_value=5.0), \
            patch("app.api.store_admin.generate_order_number", return_value="ORD-999"), \
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True), \
            patch("app.api.store_admin.build_order_item_record", side_effect=lambda snap, **kw: {**snap, **kw}), \
            patch("app.api.store_admin.prune_order_item_columns", side_effect=lambda _c, record: record), \
            patch("app.api.store_admin._orders_has_column", return_value=False), \
            patch("app.api.store_admin._create_paid_payment"), \
            patch("app.api.store_admin.recalculate_order_totals"), \
            patch("app.api.store_admin._write_order_status_log"), \
            patch("app.api.store_admin.build_usage_plan", return_value=[{"order_item_id": "oi-1", "ingredient_id": "ing-coffee", "quantity": 36.0}]), \
            patch("app.api.store_admin.consume_for_paid_order", side_effect=StockSyncFailedError("sync_failed", reason="stock_sync_failed", order_id="order-1", order_no="ORD-999")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_kiosk_order(payload, authorization="Bearer token")

        self.assertEqual(ctx_err.exception.status_code, 503)
        detail = ctx_err.exception.detail
        self.assertIsInstance(detail, dict)
        self.assertEqual(detail["code"], "kiosk_order_stock_sync_failed")
        self.assertEqual(detail["order_no"], "ORD-999")
        self.assertEqual(detail["payment_status"], "paid")
        self.assertEqual(detail["stock_consumed"], False)
        self.assertEqual(detail["action"], "do_not_resubmit")


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
