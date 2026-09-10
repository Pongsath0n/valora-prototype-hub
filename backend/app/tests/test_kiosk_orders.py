import unittest
import uuid as _uuid
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from unittest.mock import patch

from fastapi import HTTPException

from app.api import store_admin
from app.services.atomic_rpc import AtomicRPCError


class KioskOrderEndpointTests(unittest.TestCase):
    """BE-FIX-05: Kiosk atomic order endpoint tests.

    The Kiosk endpoint now uses a single atomic RPC
    (create_and_finalize_kiosk_order_atomic) that handles order
    creation, payment, and stock consumption in ONE transaction.
    """

    def _build_payload(self, **overrides) -> store_admin.KioskOrderCreate:
        defaults = dict(
            items=[store_admin.OrderItemPayload(product_id="prod-1", quantity=2)],
            payment_method="cash",
            customer=None,
            note="   walk-in latte   ",
            client_order_id=str(_uuid.uuid4()),
        )
        defaults.update(overrides)
        return store_admin.KioskOrderCreate(**defaults)

    def _make_snapshot(self, *, base_breakdown=None, addon_breakdown=None) -> Dict[str, Any]:
        return {
            "product_id": "prod-1",
            "quantity": 2,
            "product_name": "Latte",
            "total_price": 80.0,
            "total_cost": 30.0,
            "unit_price": 40.0,
            "unit_cost": 15.0,
            "line_profit": 50.0,
            "base_cost_breakdown": base_breakdown if base_breakdown is not None else [
                {"ingredient_id": "ing-coffee", "quantity_used": 18.0, "unit": "g"},
            ],
            "addon_cost_breakdown": addon_breakdown if addon_breakdown is not None else [],
            "options_snapshot": {
                "sweetness": 100,
                "addons": [],
                "_system": {
                    "usage_breakdown": {
                        "base": [{"ingredient_id": "ing-coffee", "quantity_used": 18.0, "unit": "g"}],
                        "addons": [],
                    }
                },
            },
        }

    def _common_patches(self, snapshot=None, rpc_result=None, rpc_error=None):
        if snapshot is None:
            snapshot = self._make_snapshot()
        if rpc_result is None:
            rpc_result = {
                "status": "finalized",
                "order_id": "order-1",
                "order_no": "ORD-00001",
                "payment_id": "pay-1",
                "payment_method": "cash",
                "payment_status": "paid",
                "order_status": "accepted",
                "total_amount": 85.0,
                "confirmed_at": "2025-01-01T00:00:00Z",
                "idempotent_replay": False,
            }
        patches = [
            patch("app.api.store_admin._get_ctx", return_value={
                "client": SimpleNamespace(),
                "user_id": "user-1",
                "memberships": [],
            }),
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")),
            patch("app.api.store_admin._normalize_store_role", return_value="staff"),
            patch("app.api.store_admin._ensure_kiosk_channel", return_value="channel-1"),
            patch("app.api.store_admin._ensure_product_in_store"),
            patch("app.api.store_admin.prepare_order_item_snapshot", return_value=snapshot),
            patch("app.api.store_admin.resolve_channel_fee", return_value=5.0),
            patch("app.api.store_admin.order_items_supports_store_scope", return_value=True),
            patch("app.api.store_admin.build_order_item_record", side_effect=lambda snap, **kw: {**snap, "order_id": kw.get("order_id"), "store_id": kw.get("store_id"), "product_name_snapshot": snap.get("product_name")}),
            patch("app.api.store_admin.prune_order_item_columns", side_effect=lambda _c, record: record),
            patch("app.api.store_admin._ensure_customer_record_for_kiosk", return_value=(None, "Walk-in Customer", None)),
            patch("app.api.store_admin._map_created_order_with_items", return_value={"id": "order-1", "order_no": "ORD-00001", "items": []}),
        ]
        if rpc_error:
            patches.append(patch("app.api.store_admin.create_and_finalize_kiosk_order", side_effect=rpc_error))
        else:
            patches.append(patch("app.api.store_admin.create_and_finalize_kiosk_order", return_value=rpc_result))
        return patches

    def _run_with_patches(self, patches, payload):
        import contextlib
        with contextlib.ExitStack() as stack:
            for p in patches:
                stack.enter_context(p)
            return store_admin.create_kiosk_order(payload, authorization="Bearer token")

    def test_staff_kiosk_order_recalculates_totals_and_masks_response(self) -> None:
        """BE-FIX-05: Staff kiosk order returns finalized order with stock_consumed=True."""
        payload = self._build_payload()
        patches = self._common_patches()
        response = self._run_with_patches(patches, payload)
        self.assertTrue(response["stock_consumed"])
        self.assertFalse(response["idempotent_replay"])
        self.assertEqual(response["order_no"], "ORD-00001")

    def test_create_kiosk_order_blocks_non_staff_role(self) -> None:
        """BE-FIX-05: Viewer role is rejected with 403, no RPC call."""
        payload = self._build_payload()
        with patch("app.api.store_admin._get_ctx", return_value={"client": SimpleNamespace(), "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "viewer")), \
            patch("app.api.store_admin.create_and_finalize_kiosk_order") as mock_rpc:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_kiosk_order(payload, authorization="Bearer token")
        self.assertEqual(ctx_err.exception.status_code, 403)
        mock_rpc.assert_not_called()

    def test_create_kiosk_order_fails_when_kiosk_channel_missing(self) -> None:
        """BE-FIX-05: Missing kiosk channel raises before RPC call."""
        payload = self._build_payload()
        with patch("app.api.store_admin._get_ctx", return_value={"client": SimpleNamespace(), "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")), \
            patch("app.api.store_admin._ensure_kiosk_channel", side_effect=HTTPException(status_code=500, detail="kiosk_channel_unavailable")), \
            patch("app.api.store_admin.create_and_finalize_kiosk_order") as mock_rpc:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_kiosk_order(payload, authorization="Bearer token")
        self.assertEqual(ctx_err.exception.detail, "kiosk_channel_unavailable")
        mock_rpc.assert_not_called()

    # ── Pre-persistence validation tests ──────────────────────────────

    def test_missing_recipe_rejected_before_order_insert(self) -> None:
        """BE-FIX-05: Missing recipe → 400 before any persistence."""
        payload = self._build_payload()
        snapshot = self._make_snapshot(base_breakdown=[])
        patches = self._common_patches(snapshot=snapshot)
        # Replace the RPC mock to verify it's NOT called
        patches[-1] = patch("app.api.store_admin.create_and_finalize_kiosk_order")
        import contextlib
        with contextlib.ExitStack() as stack:
            rpc_mock = None
            for p in patches:
                entered = stack.enter_context(p)
                if p is patches[-1]:
                    rpc_mock = entered
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_kiosk_order(payload, authorization="Bearer token")
        self.assertEqual(ctx_err.exception.status_code, 400)
        rpc_mock.assert_not_called()

    def test_invalid_recipe_quantity_rejected_before_persistence(self) -> None:
        """BE-FIX-05: quantity_used <= 0 → 400 before any persistence."""
        payload = self._build_payload()
        snapshot = self._make_snapshot(base_breakdown=[
            {"ingredient_id": "ing-coffee", "quantity_used": 0.0, "unit": "g"},
        ])
        patches = self._common_patches(snapshot=snapshot)
        patches[-1] = patch("app.api.store_admin.create_and_finalize_kiosk_order")
        import contextlib
        with contextlib.ExitStack() as stack:
            rpc_mock = None
            for p in patches:
                entered = stack.enter_context(p)
                if p is patches[-1]:
                    rpc_mock = entered
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_kiosk_order(payload, authorization="Bearer token")
        self.assertEqual(ctx_err.exception.status_code, 400)
        rpc_mock.assert_not_called()

    def test_missing_ingredient_id_rejected_before_persistence(self) -> None:
        """BE-FIX-05: missing ingredient_id → 400 before any persistence."""
        payload = self._build_payload()
        snapshot = self._make_snapshot(base_breakdown=[
            {"ingredient_id": None, "quantity_used": 18.0, "unit": "g"},
        ])
        patches = self._common_patches(snapshot=snapshot)
        patches[-1] = patch("app.api.store_admin.create_and_finalize_kiosk_order")
        import contextlib
        with contextlib.ExitStack() as stack:
            rpc_mock = None
            for p in patches:
                entered = stack.enter_context(p)
                if p is patches[-1]:
                    rpc_mock = entered
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_kiosk_order(payload, authorization="Bearer token")
        self.assertEqual(ctx_err.exception.status_code, 400)
        rpc_mock.assert_not_called()

    # ── Idempotency tests ─────────────────────────────────────────────

    def test_client_order_id_used_as_order_id(self) -> None:
        """BE-FIX-05: client_order_id is passed to the RPC as the order id."""
        client_order_id = str(_uuid.uuid4())
        payload = self._build_payload(client_order_id=client_order_id)
        patches = self._common_patches()
        patches[-1] = patch("app.api.store_admin.create_and_finalize_kiosk_order")
        import contextlib
        with contextlib.ExitStack() as stack:
            rpc_mock = None
            for p in patches:
                entered = stack.enter_context(p)
                if p is patches[-1]:
                    rpc_mock = entered
            store_admin.create_kiosk_order(payload, authorization="Bearer token")
        call_kwargs = rpc_mock.call_args.kwargs
        self.assertEqual(call_kwargs["client_order_id"], client_order_id)

    def test_invalid_client_order_id_rejected(self) -> None:
        """BE-FIX-05: non-UUID client_order_id → 400."""
        payload = self._build_payload(client_order_id="not-a-uuid")
        patches = self._common_patches()
        # Replace the RPC mock to verify it's NOT called
        patches[-1] = patch("app.api.store_admin.create_and_finalize_kiosk_order")
        import contextlib
        with contextlib.ExitStack() as stack:
            rpc_mock = None
            for p in patches:
                entered = stack.enter_context(p)
                if p is patches[-1]:
                    rpc_mock = entered
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_kiosk_order(payload, authorization="Bearer token")
        self.assertEqual(ctx_err.exception.status_code, 400)
        self.assertEqual(ctx_err.exception.detail, "kiosk_order_invalid_client_order_id")
        rpc_mock.assert_not_called()

    def test_duplicate_client_order_id_returns_existing_order(self) -> None:
        """BE-FIX-05: duplicate client_order_id → already_finalized (idempotent)."""
        client_order_id = str(_uuid.uuid4())
        payload = self._build_payload(client_order_id=client_order_id)
        rpc_result = {
            "status": "already_finalized",
            "order_id": client_order_id,
            "order_no": "ORD-00001",
            "payment_id": "pay-1",
            "payment_method": "cash",
            "payment_status": "paid",
            "order_status": "accepted",
            "total_amount": 85.0,
            "confirmed_at": "2025-01-01T00:00:00Z",
            "idempotent_replay": True,
        }
        patches = self._common_patches(rpc_result=rpc_result)
        patches[11] = patch(
            "app.api.store_admin._map_created_order_with_items",
            return_value={"id": client_order_id, "order_no": "ORD-00001", "items": []},
        )
        result = self._run_with_patches(patches, payload)
        self.assertEqual(result["id"], client_order_id)
        self.assertTrue(result["idempotent_replay"])
        self.assertTrue(result["stock_consumed"])

    def test_duplicate_client_order_id_incomplete_returns_409(self) -> None:
        """BE-FIX-05: duplicate client_order_id with incomplete state → 409."""
        client_order_id = str(_uuid.uuid4())
        payload = self._build_payload(client_order_id=client_order_id)
        rpc_result = {
            "status": "idempotency_conflict",
            "order_id": client_order_id,
            "order_no": "ORD-00001",
            "order_status": "pending_payment",
            "payment_status": "unpaid",
            "idempotent_replay": False,
        }
        patches = self._common_patches(rpc_result=rpc_result)
        with self.assertRaises(HTTPException) as ctx_err:
            self._run_with_patches(patches, payload)
        self.assertEqual(ctx_err.exception.status_code, 409)
        self.assertEqual(ctx_err.exception.detail["code"], "idempotency_conflict")

    # ── Atomic error mapping tests ────────────────────────────────────

    def test_stock_sync_failure_returns_409_with_order_context(self) -> None:
        """BE-FIX-05: insufficient_stock RPC error → 409 (atomic, no partial commit)."""
        payload = self._build_payload()
        error = AtomicRPCError(
            "insufficient_stock ingredient=ing-coffee required=36 available=20",
            reason="insufficient_stock",
            http_status=409,
        )
        patches = self._common_patches(rpc_error=error)
        with self.assertRaises(HTTPException) as ctx_err:
            self._run_with_patches(patches, payload)
        self.assertEqual(ctx_err.exception.status_code, 409)
        detail = ctx_err.exception.detail
        self.assertEqual(detail["code"], "insufficient_stock")

    def test_create_kiosk_order_stock_failure_surfaces_controlled_error(self) -> None:
        """BE-FIX-05: Stock failure is atomic - no partial commit, returns 409."""
        payload = self._build_payload()
        error = AtomicRPCError(
            "insufficient_stock ingredient=ing-coffee required=36 available=20",
            reason="insufficient_stock",
            http_status=409,
        )
        patches = self._common_patches(rpc_error=error)
        with self.assertRaises(HTTPException) as ctx_err:
            self._run_with_patches(patches, payload)
        # Atomic: no partial commit, so no "do_not_resubmit" needed
        self.assertEqual(ctx_err.exception.status_code, 409)
        detail = ctx_err.exception.detail
        self.assertEqual(detail["code"], "insufficient_stock")


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
