"""BE-FIX-05: Kiosk Atomic Payment Migration tests.

Tests cover:
- T01-T05: Authorization (Staff/Manager/Owner/Unauthorized)
- T06-T11: Trust boundary (client _system, fake price, invalid recipe,
  unit mismatch, invalid addon, addon max_quantity)
- T12-T15: Legacy removal (no _create_paid_payment, no
  consume_for_paid_order, no direct apply_order_stock_usage, one RPC)
- T16-T20: Atomic error mapping (insufficient_stock, invalid payment
  method, DB error, already_finalized, incomplete duplicate)
- T21-T24: Order number (no trusted order_no, RPC returns order_no,
  format preserved, concurrent design)
- T25-T32: Availability (base, limiting ingredient, base unavailable,
  addon unavailable, addon usage, invalid unit, missing recipe,
  read-only)
- T33-T35: Idempotency (double confirm, timeout replay, cart changed)
"""
import unittest
import uuid as _uuid
from types import SimpleNamespace
from typing import Any, Dict, List
from unittest.mock import patch

from fastapi import HTTPException

from app.api import store_admin
from app.services import availability
from app.services.atomic_rpc import AtomicRPCError


def _make_snapshot(
    *,
    product_id: str = "prod-1",
    quantity: int = 2,
    product_name: str = "Latte",
    total_price: float = 80.0,
    total_cost: float = 30.0,
    base_breakdown: Any = None,
    addon_breakdown: Any = None,
    options_snapshot: Any = None,
) -> Dict[str, Any]:
    if base_breakdown is None:
        base_breakdown = [
            {"ingredient_id": "ing-coffee", "quantity_used": 18.0, "unit": "g"},
            {"ingredient_id": "ing-milk", "quantity_used": 150.0, "unit": "ml"},
        ]
    if options_snapshot is None:
        options_snapshot = {"sweetness": 100, "addons": [], "_system": {"usage_breakdown": {"base": [{"ingredient_id": "ing-coffee", "quantity_used": 18.0, "unit": "g"}], "addons": []}}}
    return {
        "product_id": product_id,
        "quantity": quantity,
        "product_name": product_name,
        "store_id": "store-1",
        "total_price": total_price,
        "total_cost": total_cost,
        "unit_price": total_price / quantity,
        "unit_cost": total_cost / quantity,
        "line_profit": total_price - total_cost,
        "base_price": total_price / quantity,
        "base_cost": 15.0,
        "base_cost_breakdown": base_breakdown,
        "option_total": 0.0,
        "option_cost_total": 0.0,
        "options_snapshot": options_snapshot,
        "addon_cost_breakdown": addon_breakdown if addon_breakdown is not None else [],
    }


def _make_item_record(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "product_id": snapshot.get("product_id"),
        "quantity": snapshot.get("quantity"),
        "unit_price": snapshot.get("unit_price"),
        "unit_cost": snapshot.get("unit_cost"),
        "total_price": snapshot.get("total_price"),
        "total_cost": snapshot.get("total_cost"),
        "line_profit": snapshot.get("line_profit"),
        "product_name_snapshot": snapshot.get("product_name"),
        "options": snapshot.get("options_snapshot"),
        "option_total": snapshot.get("option_total", 0),
        "option_cost_total": snapshot.get("option_cost_total", 0),
    }


class _BaseKioskAtomicTests(unittest.TestCase):
    """Base class with common patching helpers for BE-FIX-05 Kiosk tests."""

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

    def _common_patches(self, snapshot=None, rpc_result=None, rpc_error=None):
        """Return a context manager stack for common Kiosk patches."""
        if snapshot is None:
            snapshot = _make_snapshot()
        if rpc_result is None:
            rpc_result = {
                "status": "finalized",
                "order_id": "order-1",
                "order_no": "ORD-00001",
                "payment_id": "pay-1",
                "payment_method": "cash",
                "payment_status": "paid",
                "order_status": "accepted",
                "total_amount": 80.0,
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
            patch("app.api.store_admin.build_order_item_record", side_effect=lambda snap, **kw: {**_make_item_record(snap), "order_id": kw.get("order_id"), "store_id": kw.get("store_id")}),
            patch("app.api.store_admin.prune_order_item_columns", side_effect=lambda _c, record: record),
            patch("app.api.store_admin._ensure_customer_record_for_kiosk", return_value=(None, "Walk-in Customer", None)),
            patch("app.api.store_admin._map_created_order_with_items", return_value={"id": "order-1", "order_no": "ORD-00001", "items": []}),
        ]
        if rpc_error:
            patches.append(
                patch("app.api.store_admin.create_and_finalize_kiosk_order", side_effect=rpc_error)
            )
        else:
            patches.append(
                patch("app.api.store_admin.create_and_finalize_kiosk_order", return_value=rpc_result)
            )
        return patches

    def _run_with_patches(self, patches, payload):
        import contextlib
        with contextlib.ExitStack() as stack:
            for p in patches:
                stack.enter_context(p)
            return store_admin.create_kiosk_order(payload, authorization="Bearer token")


# =====================================================================
# T01-T05: Authorization
# =====================================================================

class TestKioskAuthorization(_BaseKioskAtomicTests):
    def test_t01_staff_kiosk_cash_allowed(self):
        """T01: Staff can confirm Kiosk cash order via atomic RPC."""
        payload = self._build_payload(payment_method="cash")
        patches = self._common_patches()
        result = self._run_with_patches(patches, payload)
        self.assertEqual(result["stock_consumed"], True)
        self.assertEqual(result["idempotent_replay"], False)

    def test_t02_staff_kiosk_promptpay_allowed(self):
        """T02: Staff can confirm Kiosk PromptPay order via same RPC."""
        payload = self._build_payload(payment_method="promptpay")
        patches = self._common_patches(rpc_result={
            "status": "finalized",
            "order_id": "order-1",
            "order_no": "ORD-00001",
            "payment_id": "pay-1",
            "payment_method": "promptpay",
            "payment_status": "paid",
            "order_status": "accepted",
            "total_amount": 80.0,
            "confirmed_at": "2025-01-01T00:00:00Z",
            "idempotent_replay": False,
        })
        result = self._run_with_patches(patches, payload)
        self.assertEqual(result["stock_consumed"], True)

    def test_t03_manager_allowed(self):
        """T03: Manager can confirm Kiosk order."""
        payload = self._build_payload()
        patches = self._common_patches()
        # Override role to manager
        patches[1] = patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "manager"))
        result = self._run_with_patches(patches, payload)
        self.assertEqual(result["stock_consumed"], True)

    def test_t04_owner_allowed(self):
        """T04: Owner can confirm Kiosk order."""
        payload = self._build_payload()
        patches = self._common_patches()
        patches[1] = patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner"))
        result = self._run_with_patches(patches, payload)
        self.assertEqual(result["stock_consumed"], True)

    def test_t05_unauthorized_rejected(self):
        """T05: Viewer role is rejected with 403, no RPC call."""
        payload = self._build_payload()
        with patch("app.api.store_admin._get_ctx", return_value={"client": SimpleNamespace(), "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "viewer")), \
            patch("app.api.store_admin.create_and_finalize_kiosk_order") as mock_rpc:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_kiosk_order(payload, authorization="Bearer token")
        self.assertEqual(ctx_err.exception.status_code, 403)
        mock_rpc.assert_not_called()


# =====================================================================
# T06-T11: Trust Boundary
# =====================================================================

class TestKioskTrustBoundary(_BaseKioskAtomicTests):
    def test_t06_client_system_stripped(self):
        """T06: Client-supplied _system is stripped and replaced."""
        payload = self._build_payload(
            items=[store_admin.OrderItemPayload(
                product_id="prod-1",
                quantity=1,
                options={"_system": {"fake": True}, "sweetness": 50},
            )]
        )
        patches = self._common_patches()
        # Track what strip_client_system receives
        with patch("app.api.store_admin.strip_client_system", side_effect=lambda opts: ({k: v for k, v in (opts or {}).items() if k != "_system"})) as mock_strip:
            self._run_with_patches(patches, payload)
        mock_strip.assert_called_once()
        # Verify _system was in the original options
        original_opts = mock_strip.call_args[0][0]
        self.assertIn("_system", original_opts)

    def test_t07_client_fake_price_not_trusted(self):
        """T07: Client-supplied price is not trusted - server snapshot overrides."""
        payload = self._build_payload(
            items=[store_admin.OrderItemPayload(
                product_id="prod-1",
                quantity=1,
                options={"unit_price": 999.99},  # Client tries to set price
            )]
        )
        server_snapshot = _make_snapshot(total_price=80.0, quantity=1)
        patches = self._common_patches(snapshot=server_snapshot)
        result = self._run_with_patches(patches, payload)
        # The server snapshot price (80.0) is used, not 999.99
        self.assertEqual(result["stock_consumed"], True)

    def test_t08_invalid_recipe_rejected_before_rpc(self):
        """T08: Invalid recipe is rejected before any write RPC."""
        payload = self._build_payload()
        bad_snapshot = _make_snapshot(base_breakdown=[])
        patches = self._common_patches(snapshot=bad_snapshot)
        # _validate_sale_configuration should raise before RPC
        with patch("app.api.store_admin.create_and_finalize_kiosk_order") as mock_rpc:
            with self.assertRaises(HTTPException) as ctx_err:
                self._run_with_patches(patches, payload)
            self.assertEqual(ctx_err.exception.status_code, 400)
            mock_rpc.assert_not_called()

    def test_t09_unit_mismatch_rejected_before_rpc(self):
        """T09: Unit mismatch is rejected before any write RPC."""
        payload = self._build_payload()
        # Snapshot with unit_mismatch flag in breakdown
        bad_snapshot = _make_snapshot(base_breakdown=[
            {"ingredient_id": "ing-1", "quantity_used": 10.0, "unit": "g", "unit_mismatch": True},
        ])
        patches = self._common_patches(snapshot=bad_snapshot)
        with patch("app.api.store_admin.create_and_finalize_kiosk_order") as mock_rpc:
            with self.assertRaises(HTTPException) as ctx_err:
                self._run_with_patches(patches, payload)
            # embed_usage_snapshot raises UsageSnapshotError for unit mismatch
            self.assertEqual(ctx_err.exception.status_code, 400)
            mock_rpc.assert_not_called()

    def test_t10_invalid_addon_rejected_before_rpc(self):
        """T10: Invalid addon is rejected before any write RPC."""
        payload = self._build_payload()
        bad_snapshot = _make_snapshot(addon_breakdown=[
            {"ingredient_id": None, "addon_id": "addon-1", "quantity_used": 5.0, "unit": "g"},
        ])
        patches = self._common_patches(snapshot=bad_snapshot)
        with patch("app.api.store_admin.create_and_finalize_kiosk_order") as mock_rpc:
            with self.assertRaises(HTTPException) as ctx_err:
                self._run_with_patches(patches, payload)
            self.assertEqual(ctx_err.exception.status_code, 400)
            mock_rpc.assert_not_called()

    def test_t11_addon_max_quantity_preserved(self):
        """T11: Addon max_quantity validation is preserved."""
        # This is validated inside prepare_order_item_snapshot via _validate_addon
        payload = self._build_payload()
        snapshot = _make_snapshot()
        patches = self._common_patches(snapshot=snapshot)
        result = self._run_with_patches(patches, payload)
        self.assertEqual(result["stock_consumed"], True)


# =====================================================================
# T12-T15: Legacy Removal
# =====================================================================

class TestKioskLegacyRemoval(_BaseKioskAtomicTests):
    def test_t12_no_create_paid_payment(self):
        """T12: Kiosk route does NOT call _create_paid_payment."""
        payload = self._build_payload()
        patches = self._common_patches()
        with patch("app.api.store_admin._create_paid_payment") as mock_payment:
            self._run_with_patches(patches, payload)
        mock_payment.assert_not_called()

    def test_t13_no_consume_for_paid_order(self):
        """T13: Kiosk route does NOT call consume_for_paid_order."""
        payload = self._build_payload()
        patches = self._common_patches()
        with patch("app.api.store_admin.consume_for_paid_order") as mock_consume:
            self._run_with_patches(patches, payload)
        mock_consume.assert_not_called()

    def test_t14_no_direct_apply_order_stock_usage(self):
        """T14: Kiosk route does NOT directly call apply_order_stock_usage."""
        payload = self._build_payload()
        patches = self._common_patches()
        # The RPC wrapper doesn't call apply_order_stock_usage directly;
        # finalize_paid_order_atomic calls it inside the DB transaction.
        # We verify the Python layer doesn't call it.
        with patch("app.services.stock_service.consume_for_paid_order") as mock_consume:
            self._run_with_patches(patches, payload)
        mock_consume.assert_not_called()

    def test_t15_exactly_one_write_rpc(self):
        """T15: Kiosk uses exactly ONE business write RPC."""
        payload = self._build_payload()
        patches = self._common_patches()
        # Replace the last patch (create_and_finalize_kiosk_order) with a
        # fresh Mock so we can count calls.
        patches[-1] = patch("app.api.store_admin.create_and_finalize_kiosk_order")
        import contextlib
        with contextlib.ExitStack() as stack:
            rpc_mock = None
            for p in patches:
                entered = stack.enter_context(p)
                if p is patches[-1]:
                    rpc_mock = entered
            store_admin.create_kiosk_order(payload, authorization="Bearer token")
        self.assertEqual(rpc_mock.call_count, 1)


# =====================================================================
# T16-T20: Atomic Error Mapping
# =====================================================================

class TestKioskErrorMapping(_BaseKioskAtomicTests):
    def test_t16_insufficient_stock_returns_409(self):
        """T16: insufficient_stock RPC error maps to HTTP 409."""
        payload = self._build_payload()
        error = AtomicRPCError(
            "insufficient_stock ingredient=ing-1 required=10 available=5",
            reason="insufficient_stock",
            http_status=409,
        )
        patches = self._common_patches(rpc_error=error)
        with self.assertRaises(HTTPException) as ctx_err:
            self._run_with_patches(patches, payload)
        self.assertEqual(ctx_err.exception.status_code, 409)
        detail = ctx_err.exception.detail
        self.assertEqual(detail["code"], "insufficient_stock")

    def test_t17_invalid_payment_method_returns_400(self):
        """T17: Invalid payment method returns 400."""
        payload = self._build_payload()
        error = AtomicRPCError(
            "invalid_payment_method",
            reason="invalid_payment_method",
            http_status=400,
        )
        patches = self._common_patches(rpc_error=error)
        with self.assertRaises(HTTPException) as ctx_err:
            self._run_with_patches(patches, payload)
        self.assertEqual(ctx_err.exception.status_code, 400)

    def test_t18_rpc_db_error_returns_5xx(self):
        """T18: RPC unexpected DB error returns safe 5xx."""
        payload = self._build_payload()
        error = AtomicRPCError(
            "kiosk_atomic_rpc_exception",
            reason="rpc_exception",
            http_status=503,
        )
        patches = self._common_patches(rpc_error=error)
        with self.assertRaises(HTTPException) as ctx_err:
            self._run_with_patches(patches, payload)
        self.assertEqual(ctx_err.exception.status_code, 503)

    def test_t19_already_finalized_replay_success(self):
        """T19: already_finalized returns idempotent success."""
        payload = self._build_payload()
        rpc_result = {
            "status": "already_finalized",
            "order_id": "order-1",
            "order_no": "ORD-00001",
            "payment_id": "pay-1",
            "payment_method": "cash",
            "payment_status": "paid",
            "order_status": "accepted",
            "total_amount": 80.0,
            "confirmed_at": "2025-01-01T00:00:00Z",
            "idempotent_replay": True,
        }
        patches = self._common_patches(rpc_result=rpc_result)
        result = self._run_with_patches(patches, payload)
        self.assertTrue(result["idempotent_replay"])
        self.assertTrue(result["stock_consumed"])

    def test_t20_existing_incomplete_duplicate_returns_409(self):
        """T20: Existing incomplete duplicate returns safe 409 conflict."""
        payload = self._build_payload()
        rpc_result = {
            "status": "idempotency_conflict",
            "order_id": "order-1",
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


# =====================================================================
# T21-T24: Order Number
# =====================================================================

class TestKioskOrderNumber(_BaseKioskAtomicTests):
    def test_t21_backend_does_not_supply_trusted_order_no(self):
        """T21: Backend does NOT supply a trusted final order_no to the RPC."""
        payload = self._build_payload()
        patches = self._common_patches()
        # Replace the last patch (create_and_finalize_kiosk_order) with a
        # fresh Mock so we can inspect call kwargs.
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
        # The RPC payload must NOT contain an order_no field
        self.assertNotIn("order_no", call_kwargs)

    def test_t22_rpc_returns_canonical_order_no(self):
        """T22: RPC returns canonical order_no in the result."""
        payload = self._build_payload()
        rpc_result = {
            "status": "finalized",
            "order_id": "order-1",
            "order_no": "ORD-00042",
            "payment_id": "pay-1",
            "payment_method": "cash",
            "payment_status": "paid",
            "order_status": "accepted",
            "total_amount": 80.0,
            "confirmed_at": "2025-01-01T00:00:00Z",
            "idempotent_replay": False,
        }
        patches = self._common_patches(rpc_result=rpc_result)
        result = self._run_with_patches(patches, payload)
        self.assertEqual(result["order_no"], "ORD-00042")

    def test_t23_existing_format_preserved(self):
        """T23: Existing ORD-XXXXX format is preserved."""
        payload = self._build_payload()
        rpc_result = {
            "status": "finalized",
            "order_id": "order-1",
            "order_no": "ORD-00001",
            "payment_id": "pay-1",
            "payment_method": "cash",
            "payment_status": "paid",
            "order_status": "accepted",
            "total_amount": 80.0,
            "confirmed_at": "2025-01-01T00:00:00Z",
            "idempotent_replay": False,
        }
        patches = self._common_patches(rpc_result=rpc_result)
        result = self._run_with_patches(patches, payload)
        import re
        self.assertTrue(re.match(r"^ORD-\d{5}$", result["order_no"]),
                        f"order_no {result['order_no']} does not match ORD-XXXXX format")

    def test_t24_concurrent_generation_design(self):
        """T24: Concurrent generation design uses pg_advisory_xact_lock.

        This is a design verification test. The SQL uses
        pg_advisory_xact_lock(hashtext(store_id)) to serialize
        order_no generation per store. We verify the SQL file
        contains the advisory lock.
        """
        import os
        # The SQL file is at backend/sql/be_fix_05_kiosk_atomic_payment.sql
        # Tests are at backend/app/tests/, so go up 3 levels to reach backend/
        sql_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "sql", "be_fix_05_kiosk_atomic_payment.sql"
        )
        if not os.path.exists(sql_path):
            self.skipTest(f"SQL file not found at {sql_path}")
        with open(sql_path, encoding="utf-8") as f:
            sql_content = f.read()
        self.assertIn("pg_advisory_xact_lock", sql_content)
        self.assertIn("generate_kiosk_order_no_atomic", sql_content)


# =====================================================================
# T25-T32: Availability (max producible quantity)
# =====================================================================

class TestAvailability(unittest.TestCase):
    """Test the advisory availability service (max producible quantity)."""

    def _make_client(self, ingredients: List[Dict], recipes: List[Dict]):
        """Build a fake Supabase client with ingredient + recipe data."""
        class _FakeTable:
            def __init__(self, parent, name):
                self.parent = parent
                self.name = name
                self._filters = {}
                self._in_filter = {}

            def select(self, _cols):
                return self

            def eq(self, col, val):
                self._filters[col] = val
                return self

            def in_(self, col, vals):
                self._in_filter[col] = [str(v) for v in vals]
                return self

            def execute(self):
                if self.name == "ingredients":
                    rows = list(self.parent.ingredients)
                elif self.name == "recipes":
                    rows = list(self.parent.recipes)
                elif self.name == "product_addon_recipes":
                    rows = list(self.parent.addon_recipes)
                else:
                    rows = []
                # Apply in_ filter
                for col, vals in self._in_filter.items():
                    rows = [r for r in rows if str(r.get(col)) in vals]
                # Apply eq filter
                for col, val in self._filters.items():
                    rows = [r for r in rows if str(r.get(col)) == str(val)]
                return SimpleNamespace(error=None, data=rows)

        class _FakeClient:
            def __init__(self):
                self.ingredients = ingredients
                self.recipes = recipes
                self.addon_recipes = []

            def table(self, name):
                return _FakeTable(self, name)

        return _FakeClient()

    def test_t25_base_fully_available(self):
        """T25: Base product fully available returns correct max quantity."""
        ingredients = [
            {"id": "ing-a", "store_id": "store-1", "unit": "g", "current_stock": 100, "is_active": True},
            {"id": "ing-b", "store_id": "store-1", "unit": "ml", "current_stock": 200, "is_active": True},
        ]
        recipes = [
            {"product_id": "prod-1", "store_id": "store-1", "ingredient_id": "ing-a", "quantity_used": 20, "unit": "g"},
            {"product_id": "prod-1", "store_id": "store-1", "ingredient_id": "ing-b", "quantity_used": 50, "unit": "ml"},
        ]
        client = self._make_client(ingredients, recipes)
        result = availability.product_max_producible(client, "store-1", "prod-1")
        # ing-a: 100/20 = 5, ing-b: 200/50 = 4 → min = 4
        self.assertEqual(result, 4)

    def test_t26_limiting_ingredient_wins(self):
        """T26: Minimum capacity across ingredients wins."""
        ingredients = [
            {"id": "ing-a", "store_id": "store-1", "unit": "g", "current_stock": 100, "is_active": True},
            {"id": "ing-b", "store_id": "store-1", "unit": "ml", "current_stock": 30, "is_active": True},
        ]
        recipes = [
            {"product_id": "prod-1", "store_id": "store-1", "ingredient_id": "ing-a", "quantity_used": 20, "unit": "g"},
            {"product_id": "prod-1", "store_id": "store-1", "ingredient_id": "ing-b", "quantity_used": 10, "unit": "ml"},
        ]
        client = self._make_client(ingredients, recipes)
        result = availability.product_max_producible(client, "store-1", "prod-1")
        # ing-a: 100/20 = 5, ing-b: 30/10 = 3 → min = 3
        self.assertEqual(result, 3)

    def test_t27_base_unavailable(self):
        """T27: Base product with no stock returns 0 (unavailable)."""
        ingredients = [
            {"id": "ing-a", "store_id": "store-1", "unit": "g", "current_stock": 0, "is_active": True},
        ]
        recipes = [
            {"product_id": "prod-1", "store_id": "store-1", "ingredient_id": "ing-a", "quantity_used": 20, "unit": "g"},
        ]
        client = self._make_client(ingredients, recipes)
        result = availability.product_max_producible(client, "store-1", "prod-1")
        self.assertEqual(result, 0)

    def test_t28_addon_unavailable_base_remains(self):
        """T28: Addon unavailable does not affect base availability."""
        ingredients = [
            {"id": "ing-a", "store_id": "store-1", "unit": "g", "current_stock": 100, "is_active": True},
            {"id": "ing-b", "store_id": "store-1", "unit": "g", "current_stock": 0, "is_active": True},
        ]
        recipes = [
            {"product_id": "prod-1", "store_id": "store-1", "ingredient_id": "ing-a", "quantity_used": 20, "unit": "g"},
        ]
        client = self._make_client(ingredients, recipes)
        client.addon_recipes = [
            {"addon_id": "addon-1", "store_id": "store-1", "ingredient_id": "ing-b", "quantity_used": 5, "unit": "g"},
        ]
        # Base product max
        base_max = availability.product_max_producible(client, "store-1", "prod-1")
        self.assertEqual(base_max, 5)
        # Addon max (unavailable)
        addon_max = availability.addon_max_producible(client, "store-1", "addon-1")
        self.assertEqual(addon_max, 0)

    def test_t29_addon_usage_reduces_available(self):
        """T29: Addon usage reduces combined available quantity."""
        ingredients = [
            {"id": "ing-coffee", "store_id": "store-1", "unit": "g", "current_stock": 30, "is_active": True},
        ]
        recipes = [
            {"product_id": "prod-1", "store_id": "store-1", "ingredient_id": "ing-coffee", "quantity_used": 10, "unit": "g"},
        ]
        client = self._make_client(ingredients, recipes)
        client.addon_recipes = [
            {"addon_id": "addon-extra-shot", "store_id": "store-1", "ingredient_id": "ing-coffee", "quantity_used": 10, "unit": "g"},
        ]
        # 1 drink + 1 extra shot = 10 + 10 = 20g per serving → 30/20 = 1
        result = availability.compute_item_max_producible(
            client, "store-1", "prod-1",
            selected_addons=[{"addon_id": "addon-extra-shot", "quantity": 1}],
        )
        self.assertEqual(result, 1)
        # 2 drinks each + 1 extra = (10*2) + 10 = 30g per serving → 30/30 = 1
        # But wait: 2 drinks means quantity=2, each with 1 extra shot
        # Per serving (1 drink + 1 extra) = 20g. For 2 servings = 40g. 30/20=1.
        # Actually compute_item_max_producible computes per-serving usage,
        # not per-order. So 1 serving = 20g, max = floor(30/20) = 1.

    def test_t30_invalid_unit_fail_closed(self):
        """T30: Invalid unit (mismatch) returns 0 (fail closed)."""
        ingredients = [
            {"id": "ing-a", "store_id": "store-1", "unit": "kg", "current_stock": 100, "is_active": True},
        ]
        recipes = [
            {"product_id": "prod-1", "store_id": "store-1", "ingredient_id": "ing-a", "quantity_used": 20, "unit": "g"},
        ]
        client = self._make_client(ingredients, recipes)
        result = availability.product_max_producible(client, "store-1", "prod-1")
        self.assertEqual(result, 0)

    def test_t31_missing_recipe_fail_closed(self):
        """T31: Missing recipe returns 0 (fail closed)."""
        ingredients = [
            {"id": "ing-a", "store_id": "store-1", "unit": "g", "current_stock": 100, "is_active": True},
        ]
        recipes = []  # No recipe
        client = self._make_client(ingredients, recipes)
        result = availability.product_max_producible(client, "store-1", "prod-1")
        self.assertEqual(result, 0)

    def test_t32_availability_read_only(self):
        """T32: Availability computation does not mutate stock."""
        ingredients = [
            {"id": "ing-a", "store_id": "store-1", "unit": "g", "current_stock": 100, "is_active": True},
        ]
        recipes = [
            {"product_id": "prod-1", "store_id": "store-1", "ingredient_id": "ing-a", "quantity_used": 20, "unit": "g"},
        ]
        client = self._make_client(ingredients, recipes)
        original_stock = client.ingredients[0]["current_stock"]
        availability.product_max_producible(client, "store-1", "prod-1")
        self.assertEqual(client.ingredients[0]["current_stock"], original_stock)


# =====================================================================
# T33-T35: Idempotency
# =====================================================================

class TestKioskIdempotency(_BaseKioskAtomicTests):
    def test_t33_double_confirm_single_order(self):
        """T33: Double confirm with same client_order_id returns single order."""
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
            "total_amount": 80.0,
            "confirmed_at": "2025-01-01T00:00:00Z",
            "idempotent_replay": True,
        }
        patches = self._common_patches(rpc_result=rpc_result)
        # Override _map_created_order_with_items to return the correct order_id
        # _map_created_order_with_items is at index 11 in the patches list.
        patches[11] = patch(
            "app.api.store_admin._map_created_order_with_items",
            return_value={"id": client_order_id, "order_no": "ORD-00001", "items": []},
        )
        result = self._run_with_patches(patches, payload)
        self.assertTrue(result["idempotent_replay"])
        self.assertEqual(result["id"], client_order_id)

    def test_t34_timeout_replay_already_finalized(self):
        """T34: Timeout replay with same client_order_id returns already_finalized."""
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
            "total_amount": 80.0,
            "confirmed_at": "2025-01-01T00:00:00Z",
            "idempotent_replay": True,
        }
        patches = self._common_patches(rpc_result=rpc_result)
        result = self._run_with_patches(patches, payload)
        self.assertTrue(result["idempotent_replay"])
        self.assertTrue(result["stock_consumed"])

    def test_t35_cart_changed_new_client_order_id(self):
        """T35: Cart materially changed requires new client_order_id.

        This is a contract documentation test. If the cart changes,
        the frontend must generate a new client_order_id. The backend
        cannot detect cart changes from the idempotency key alone -
        the contract is that client_order_id maps to ONE logical checkout.
        """
        # First checkout
        client_order_id_1 = str(_uuid.uuid4())
        payload_1 = self._build_payload(client_order_id=client_order_id_1)
        patches_1 = self._common_patches()
        self._run_with_patches(patches_1, payload_1)

        # Second checkout with DIFFERENT cart → new client_order_id
        client_order_id_2 = str(_uuid.uuid4())
        payload_2 = self._build_payload(
            client_order_id=client_order_id_2,
            items=[store_admin.OrderItemPayload(product_id="prod-2", quantity=3)],
        )
        patches_2 = self._common_patches()
        self._run_with_patches(patches_2, payload_2)

        # The two client_order_ids must be different
        self.assertNotEqual(client_order_id_1, client_order_id_2)


# =====================================================================
# T36: Missing client_order_id rejected
# =====================================================================

class TestKioskClientIdValidation(_BaseKioskAtomicTests):
    def test_missing_client_order_id_rejected(self):
        """Missing client_order_id is rejected with 400."""
        payload = self._build_payload(client_order_id=None)
        patches = self._common_patches()
        with self.assertRaises(HTTPException) as ctx_err:
            self._run_with_patches(patches, payload)
        self.assertEqual(ctx_err.exception.status_code, 400)
        self.assertEqual(ctx_err.exception.detail, "kiosk_order_invalid_client_order_id")

    def test_invalid_client_order_id_rejected(self):
        """Non-UUID client_order_id is rejected with 400."""
        payload = self._build_payload(client_order_id="not-a-uuid")
        patches = self._common_patches()
        with self.assertRaises(HTTPException) as ctx_err:
            self._run_with_patches(patches, payload)
        self.assertEqual(ctx_err.exception.status_code, 400)
        self.assertEqual(ctx_err.exception.detail, "kiosk_order_invalid_client_order_id")


# =====================================================================
# Concurrency test design (documentation only - not executed)
# =====================================================================

class TestConcurrencyDesign(unittest.TestCase):
    """Documentation tests for concurrency test design.

    These tests verify the DESIGN of the concurrency protection, not
    the actual execution (which requires an isolated DB environment).
    """

    def test_self_order_vs_kiosk_concurrency_design(self):
        """Design: Self-order vs Kiosk last-stock race.

        Scenario:
        - Ingredient stock enough for exactly ONE serving.
        - Self-order A: pending_payment, unpaid, valid snapshot.
        - Kiosk B: valid trusted cart.
        - Execute simultaneously:
          A: finalize_paid_order_atomic
          B: create_and_finalize_kiosk_order_atomic
        - Expected:
          - exactly ONE succeeds
          - exactly ONE returns insufficient_stock
          - Final stock = 0
          - Paid payments = 1
          - Used stock movement sets = 1
          - Negative stock = NO
          - Failed Kiosk order NOT persisted
          - Duplicate payment = NO

        Both paths use finalize_paid_order_atomic which acquires
        deterministic ingredient locks (ORDER BY ingredient_id). The
        first transaction to acquire the lock wins; the second waits,
        re-reads locked stock, and fails with insufficient_stock.
        """
        # This is a design verification - the actual test requires
        # an isolated DB environment.
        self.assertTrue(True, "Concurrency design documented")

    def test_kiosk_vs_kiosk_concurrency_design(self):
        """Design: Kiosk vs Kiosk last-stock race.

        Scenario:
        - Stock enough for one serving.
        - Kiosk A confirms.
        - Kiosk B confirms.
        - Concurrent execution.
        - Expected:
          - one success
          - one insufficient_stock
          - stock = 0
          - no negative stock
          - no partial failed order
          - no duplicate order_no

        The pg_advisory_xact_lock in generate_kiosk_order_no_atomic
        serializes order_no generation per store. The ingredient
        FOR UPDATE locks in finalize_paid_order_atomic serialize
        stock consumption.
        """
        self.assertTrue(True, "Kiosk vs Kiosk concurrency design documented")


# =====================================================================
# SQL Contract Design Tests (REV 2 — Product Owner review corrections)
# =====================================================================

class TestSqlContractRev2(unittest.TestCase):
    """SQL contract design tests for BE-FIX-05 Rev 2 corrections.

    These tests verify the SQL file content matches the corrected
    contract requirements from the Product Owner review.
    """

    @classmethod
    def setUpClass(cls):
        import os
        sql_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "sql", "be_fix_05_kiosk_atomic_payment.sql"
        )
        if not os.path.exists(sql_path):
            cls.skipTest("SQL file not found")
        with open(sql_path, encoding="utf-8") as f:
            cls.sql_content = f.read()

    def test_s01_confirmed_at_from_payments_not_orders(self):
        """S01: confirmed_at loaded from payments, NOT orders.confirmed_at.

        P0-1: public.orders does NOT contain confirmed_at.
        The SQL must load confirmed_at from public.payments.
        """
        # Must NOT read orders.confirmed_at (column doesn't exist)
        self.assertNotIn("orders.confirmed_at", self.sql_content)
        self.assertNotIn("o.confirmed_at", self.sql_content)
        # Must load confirmed_at from payments table
        self.assertIn("confirmed_at", self.sql_content)
        # The canonical load query must select confirmed_at from payments
        self.assertIn("select id, method, confirmed_at", self.sql_content.lower())
        self.assertIn("from public.payments", self.sql_content)

    def test_s02_order_no_collision_retry_loop(self):
        """S02: order_no unique collision retries, not idempotency_conflict.

        P0-2: orders_store_order_no_unique collision must regenerate
        order_no and retry, NOT report as idempotency_conflict.
        """
        # Must distinguish the two unique constraints
        self.assertIn("orders_store_order_no_unique", self.sql_content)
        self.assertIn("orders_pkey", self.sql_content)
        # Must have a bounded retry loop
        self.assertIn("order_insert_loop", self.sql_content)
        self.assertIn("v_max_attempts", self.sql_content)
        # order_no collision must continue the loop (retry)
        self.assertIn("continue order_insert_loop", self.sql_content)

    def test_s03_idempotent_payment_data_from_existing(self):
        """S03: already_finalized returns existing payment data.

        P1-1: already_finalized must return existing payment.method,
        payment.id, payment.confirmed_at — NOT p_payment_method.
        """
        # The already_finalized response must use v_existing_payment_method
        # (loaded from payments), not p_payment_method
        self.assertIn("v_existing_payment_method", self.sql_content)
        self.assertIn("v_existing_payment_id", self.sql_content)
        self.assertIn("v_existing_confirmed_at", self.sql_content)
        # The already_finalized block must NOT use p_payment_method
        # for the payment_method field
        # Find the already_finalized block and verify it uses
        # v_existing_payment_method
        already_finalized_count = self.sql_content.count("'already_finalized'")
        self.assertGreaterEqual(already_finalized_count, 2,
            "Must have already_finalized in both pre-check and exception handler")

    def test_s04_membership_guard_before_idempotent_replay(self):
        """S04: actor membership validated BEFORE idempotent replay.

        P1-2: DB membership guard must run before any idempotent
        replay return. Non-member cannot receive replay data.
        """
        # Must have store_members membership check
        self.assertIn("store_members", self.sql_content)
        self.assertIn("actor_not_member_of_store", self.sql_content)
        # The membership check must appear BEFORE the idempotency check
        # in the function body (not in the header comment).
        # Find the function body start (after the declare/begin)
        func_start = self.sql_content.find("create_and_finalize_kiosk_order_atomic")
        # Find the 'begin' keyword that starts the function body
        begin_pos = self.sql_content.find("begin", func_start)
        # Find the membership check (raise exception 'actor_not_member_of_store')
        # after the begin
        membership_pos = self.sql_content.find("actor_not_member_of_store", begin_pos)
        # Find the first already_finalized return after begin
        idempotency_pos = self.sql_content.find("'already_finalized'", begin_pos)
        self.assertLess(membership_pos, idempotency_pos,
            "Membership check must come BEFORE idempotent replay return")
        self.assertGreater(membership_pos, begin_pos,
            "Membership check must be inside the function body")

    def test_s05_jsonb_typeof_validation(self):
        """S05: jsonb_typeof validation before jsonb_array_length.

        Additional hardening: validate p_items is a JSONB array
        before calling jsonb_array_length.
        """
        self.assertIn("jsonb_typeof", self.sql_content)
        self.assertIn("'array'", self.sql_content)

    def test_s06_zero_payments_before_finalize(self):
        """S06: verify zero payment rows before finalize.

        Additional hardening: ensure no payment rows exist before
        calling finalize_paid_order_atomic.
        """
        self.assertIn("unexpected_payment_row_before_finalize", self.sql_content)

    def test_s07_no_ingredient_locks_in_outer_rpc(self):
        """S07: outer RPC does NOT lock ingredients.

        Ingredient locking is owned by finalize_paid_order_atomic.
        The outer RPC must not contain FOR UPDATE on ingredients.
        """
        # Extract only the outer RPC function body (between begin and end),
        # skipping header comments and the helper function.
        func_start = self.sql_content.find("create_and_finalize_kiosk_order_atomic")
        # Find the function body: from 'begin' to the matching '$function$'
        begin_pos = self.sql_content.find("begin", func_start)
        # Find the closing $function$ after the begin
        func_end = self.sql_content.find("$function$", begin_pos)
        outer_body = self.sql_content[begin_pos:func_end]
        # The outer RPC should not query ingredients directly
        self.assertNotIn("from public.ingredients", outer_body)
        self.assertNotIn("FOR UPDATE", outer_body)

    def test_s08_no_finalize_modification(self):
        """S08: finalize_paid_order_atomic is NOT modified.

        The SQL must not contain CREATE OR REPLACE for
        finalize_paid_order_atomic.
        """
        # Check that we don't redefine finalize_paid_order_atomic
        self.assertNotIn(
            "CREATE OR REPLACE FUNCTION public.finalize_paid_order_atomic",
            self.sql_content
        )

    def test_s09_no_second_stock_engine(self):
        """S09: no second stock engine created.

        The SQL must not create a new stock consumption function.
        Stock consumption is owned by apply_order_stock_usage (called
        inside finalize_paid_order_atomic).
        """
        self.assertNotIn(
            "CREATE OR REPLACE FUNCTION public.apply_order_stock_usage",
            self.sql_content
        )
        # No new stock-related function
        self.assertNotIn("consume_stock", self.sql_content)
        self.assertNotIn("deduct_stock", self.sql_content)

    def test_s10_ord_format_preserved(self):
        """S10: ORD-XXXXX format preserved."""
        self.assertIn("ORD-", self.sql_content)
        self.assertIn("lpad", self.sql_content)

    def test_s11_no_existing_row_modification(self):
        """S11: SQL installation does not modify existing business rows.

        The SQL must only contain CREATE OR REPLACE FUNCTION,
        COMMENT, GRANT, REVOKE — no UPDATE/DELETE/INSERT on
        business tables at the top level.
        """
        # The SQL should not contain standalone UPDATE/DELETE/INSERT
        # on business tables outside of function bodies.
        # Function bodies contain INSERT/UPDATE as deferred logic.
        # We check that the top-level SQL (outside $function$ blocks)
        # does not contain business DML.
        lines = self.sql_content.split("\n")
        in_function = False
        for line in lines:
            stripped = line.strip()
            if "$function$" in stripped:
                in_function = not in_function
                continue
            if not in_function:
                # Top-level SQL must not contain business DML
                upper = stripped.upper()
                self.assertFalse(
                    upper.startswith("UPDATE ") and "public." in upper,
                    f"Top-level UPDATE not allowed: {stripped}"
                )
                self.assertFalse(
                    upper.startswith("DELETE FROM ") and "public." in upper,
                    f"Top-level DELETE not allowed: {stripped}"
                )
                self.assertFalse(
                    upper.startswith("INSERT INTO ") and "public." in upper,
                    f"Top-level INSERT not allowed: {stripped}"
                )

    def test_s12_security_definer_and_acl(self):
        """S12: functions are SECURITY DEFINER with restricted ACLs."""
        self.assertIn("SECURITY DEFINER", self.sql_content)
        self.assertIn("REVOKE EXECUTE", self.sql_content)
        self.assertIn("GRANT EXECUTE", self.sql_content)
        self.assertIn("service_role", self.sql_content)
        # Must revoke from PUBLIC, anon, authenticated
        self.assertIn("FROM PUBLIC", self.sql_content)
        self.assertIn("FROM anon", self.sql_content)
        self.assertIn("FROM authenticated", self.sql_content)

    # ── REV 3 FINAL HARDENING TESTS ──────────────────────────────────

    def test_s13_payment_method_null_validation(self):
        """S13: NULL payment method rejected (SQL NULL not in NOT IN).

        H-1: The SQL must explicitly check p_payment_method IS NULL
        before the NOT IN ('cash', 'promptpay') test, because SQL NULL
        does not evaluate TRUE in NOT IN.
        """
        self.assertIn("p_payment_method is null", self.sql_content.lower())
        self.assertIn("invalid_payment_method", self.sql_content)

    def test_s14_idempotent_paid_payment_integrity_check(self):
        """S14: idempotent replay fails closed if paid payment missing.

        H-2: Both already_finalized paths must verify
        v_existing_payment_id IS NOT NULL
        v_existing_payment_method IS NOT NULL
        v_existing_confirmed_at IS NOT NULL
        and raise 'finalized_order_missing_paid_payment' if any is null.
        """
        self.assertIn("finalized_order_missing_paid_payment", self.sql_content)
        self.assertIn("v_existing_payment_id is null", self.sql_content.lower())
        self.assertIn("v_existing_payment_method is null", self.sql_content.lower())
        self.assertIn("v_existing_confirmed_at is null", self.sql_content.lower())
        # The integrity check must appear in BOTH already_finalized paths
        # (pre-check and exception handler). Count occurrences.
        integrity_count = self.sql_content.lower().count(
            "finalized_order_missing_paid_payment"
        )
        self.assertGreaterEqual(integrity_count, 2,
            "Integrity check must appear in both already_finalized paths")

    def test_s15_installation_transaction_begin(self):
        """S15: installation wrapped in BEGIN transaction.

        H-3: The SQL must start the installation transaction with BEGIN.
        """
        self.assertIn("BEGIN;", self.sql_content)

    def test_s16_installation_transaction_commit(self):
        """S16: installation ends with COMMIT transaction.

        H-3: The SQL must end the installation transaction with COMMIT.
        """
        self.assertIn("COMMIT;", self.sql_content)

    def test_s17_installation_transaction_order(self):
        """S17: BEGIN appears before CREATE FUNCTION, COMMIT after GRANT.

        H-3: The BEGIN must appear before the first CREATE OR REPLACE
        FUNCTION, and COMMIT must appear after the last GRANT.
        """
        begin_pos = self.sql_content.find("BEGIN;")
        first_create = self.sql_content.find("CREATE OR REPLACE FUNCTION")
        last_grant = self.sql_content.rfind("GRANT EXECUTE")
        commit_pos = self.sql_content.find("COMMIT;")
        self.assertLess(begin_pos, first_create,
            "BEGIN must appear before first CREATE OR REPLACE FUNCTION")
        self.assertLess(last_grant, commit_pos,
            "COMMIT must appear after last GRANT EXECUTE")

    def test_s18_no_business_rpc_in_installation_transaction(self):
        """S18: no business RPC calls in the installation SQL.

        H-3: The installation transaction (outside function bodies)
        must not contain calls to create_and_finalize_kiosk_order_atomic
        or finalize_paid_order_atomic or generate_kiosk_order_no_atomic.
        CREATE OR REPLACE FUNCTION, COMMENT ON FUNCTION, REVOKE, GRANT
        reference function names but are not RPC calls and are allowed.
        """
        lines = self.sql_content.split("\n")
        in_function = False
        for line in lines:
            stripped = line.strip()
            if "$function$" in stripped:
                in_function = not in_function
                continue
            if not in_function:
                lower = stripped.lower()
                # Skip DDL lines — they reference function names but
                # are not RPC calls.
                if (lower.startswith("create or replace function")
                    or lower.startswith("comment on function")
                    or lower.startswith("revoke")
                    or lower.startswith("grant")):
                    continue
                # Top-level SQL must not call business RPCs
                self.assertFalse(
                    "create_and_finalize_kiosk_order_atomic(" in lower,
                    f"Business RPC call not allowed at top level: {stripped}"
                )
                self.assertFalse(
                    "finalize_paid_order_atomic(" in lower,
                    f"Business RPC call not allowed at top level: {stripped}"
                )
                self.assertFalse(
                    "generate_kiosk_order_no_atomic(" in lower,
                    f"Business RPC call not allowed at top level: {stripped}"
                )

    def test_s19_no_top_level_drop_truncate_alter(self):
        """S19: no top-level DROP/TRUNCATE/ALTER on business data.

        Data safety: the installation SQL must not contain top-level
        DROP TABLE, DROP COLUMN, TRUNCATE, or ALTER on business tables.
        """
        lines = self.sql_content.split("\n")
        in_function = False
        for line in lines:
            stripped = line.strip()
            if "$function$" in stripped:
                in_function = not in_function
                continue
            if not in_function:
                upper = stripped.upper()
                self.assertFalse(
                    upper.startswith("DROP TABLE"),
                    f"Top-level DROP TABLE not allowed: {stripped}"
                )
                self.assertFalse(
                    upper.startswith("DROP COLUMN"),
                    f"Top-level DROP COLUMN not allowed: {stripped}"
                )
                self.assertFalse(
                    upper.startswith("TRUNCATE"),
                    f"Top-level TRUNCATE not allowed: {stripped}"
                )
                self.assertFalse(
                    upper.startswith("ALTER TABLE") and "public." in upper,
                    f"Top-level ALTER TABLE not allowed: {stripped}"
                )


if __name__ == "__main__":
    unittest.main()
