"""G3 — Data Integrity & Transaction Guardrails.

Covers the four-guard architecture:
    Guard 1: recipe WRITE guard (quantity_used > 0 before persistence)
    Guard 2: product READINESS guard (all-rows-valid semantics)
    Guard 3: Kiosk PAYMENT-ENTRY preflight (server-authoritative)
    Guard 4: FINAL atomic validation (retained, unchanged guarantees)

Regression anchor: the confirmed production incident where
"อเมริกาโน่ (กลาง)" had 4 valid recipe rows + 1 zero-quantity row,
passed the old "at least one valid row" readiness gate, reached the
Kiosk payment UI, and only failed at final order creation with a raw
error string after the customer had already paid.
"""
import unittest
from types import SimpleNamespace
from typing import Any, Dict, List
from unittest.mock import patch

from fastapi import HTTPException

from app.api import store_admin
from app.services.readiness import (
    batch_check_addon_recipe_readiness,
    batch_check_product_recipe_readiness,
)


# ── Shared fake Supabase client (read-only queries) ─────────────────────

class _FakeTable:
    def __init__(self, name: str, data: List[Dict[str, Any]]):
        self.name = name
        self.data = data
        self._filters: List[tuple] = []
        self._limit: int = 10

    def select(self, cols: str) -> "_FakeTable":
        return self

    def eq(self, col: str, value: Any) -> "_FakeTable":
        self._filters.append(("eq", col, value))
        return self

    def in_(self, col: str, values: List[str]) -> "_FakeTable":
        self._filters.append(("in", col, values))
        return self

    def limit(self, value: int) -> "_FakeTable":
        self._limit = value
        return self

    def execute(self) -> SimpleNamespace:
        result = list(self.data)
        for ftype, col, value in self._filters:
            if ftype == "eq":
                result = [r for r in result if str(r.get(col)) == str(value)]
            elif ftype == "in":
                result = [r for r in result if str(r.get(col)) in [str(v) for v in value]]
        return SimpleNamespace(error=None, data=result[: self._limit])


class _FakeClient:
    def __init__(self, tables: Dict[str, List[Dict[str, Any]]]):
        self._tables = tables

    def table(self, name: str) -> _FakeTable:
        return _FakeTable(name, self._tables.get(name, []))


def _recipe_row(
    *,
    product_id: str = "prod-1",
    ingredient_id: str = "ing-1",
    quantity_used: float = 10.0,
    unit: str = "g",
    store_id: str = "store-1",
) -> Dict[str, Any]:
    return {
        "product_id": product_id,
        "ingredient_id": ingredient_id,
        "quantity_used": quantity_used,
        "unit": unit,
        "store_id": store_id,
    }


def _ingredient_row(
    *,
    id: str = "ing-1",
    store_id: str = "store-1",
    is_active: bool = True,
    unit: str = "g",
) -> Dict[str, Any]:
    return {"id": id, "store_id": store_id, "is_active": is_active, "unit": unit}


# ── Guard 1: Recipe write guard (Test matrix A) ─────────────────────────

class RecipeWriteGuardTests(unittest.TestCase):
    """G3.1: quantity_used must be strictly positive on create/update."""

    def _create_payload(self, quantity: float) -> store_admin.RecipeCreate:
        return store_admin.RecipeCreate(
            product_id="prod-1",
            ingredient_id="ing-1",
            quantity_used=quantity,
        )

    def _assert_invalid_quantity_error(self, ctx_err: Any) -> None:
        self.assertEqual(ctx_err.exception.status_code, 400)
        detail = ctx_err.exception.detail
        self.assertEqual(detail["code"], "invalid_recipe_quantity")
        self.assertEqual(detail["message"], "จำนวนวัตถุดิบที่ใช้ต้องมากกว่า 0")

    def test_a1_create_recipe_zero_quantity_rejected(self) -> None:
        """A1: create with quantity_used = 0 → rejected before persistence."""
        with self.assertRaises(HTTPException) as ctx_err:
            store_admin._sanitize_recipe_payload(self._create_payload(0))
        self._assert_invalid_quantity_error(ctx_err)

    def test_a2_update_recipe_zero_quantity_rejected(self) -> None:
        """A2: update with quantity_used = 0 → rejected before persistence."""
        payload = store_admin.RecipeUpdate(quantity_used=0)
        with self.assertRaises(HTTPException) as ctx_err:
            store_admin._sanitize_recipe_payload(payload, partial=True)
        self._assert_invalid_quantity_error(ctx_err)

    def test_a2b_update_recipe_null_quantity_rejected(self) -> None:
        """A2: explicit null quantity → rejected (cannot silently nullify)."""
        payload = store_admin.RecipeUpdate(quantity_used=None)
        with self.assertRaises(HTTPException) as ctx_err:
            store_admin._sanitize_recipe_payload(payload, partial=True)
        self._assert_invalid_quantity_error(ctx_err)

    def test_a3_negative_quantity_rejected(self) -> None:
        """A3: negative quantity → rejected."""
        with self.assertRaises(HTTPException) as ctx_err:
            store_admin._sanitize_recipe_payload(self._create_payload(-5))
        self._assert_invalid_quantity_error(ctx_err)

    def test_a4_valid_positive_quantity_accepted(self) -> None:
        """A4: valid positive quantity → accepted."""
        data = store_admin._sanitize_recipe_payload(self._create_payload(18.0))
        self.assertEqual(data["quantity_used"], 18.0)

    def test_a4b_fractional_positive_quantity_accepted(self) -> None:
        """A4: fractional positive quantity → accepted."""
        data = store_admin._sanitize_recipe_payload(self._create_payload(0.5))
        self.assertEqual(data["quantity_used"], 0.5)

    def test_create_recipe_endpoint_rejects_zero_before_persistence(self) -> None:
        """Endpoint-level: 400 raised before any database write."""
        payload = self._create_payload(0)
        with patch("app.api.store_admin._get_ctx", return_value={"client": _FakeClient({}), "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner")), \
            patch("app.api.store_admin._require_manager") as mock_require, \
            patch("app.api.store_admin._ensure_product_in_store") as mock_product, \
            patch("app.api.store_admin._ensure_ingredient_in_store") as mock_ingredient:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_recipe(payload, authorization="Bearer token")
        self._assert_invalid_quantity_error(ctx_err)
        # Nothing persisted: no product/ingredient lookups were reached.
        mock_product.assert_not_called()
        mock_ingredient.assert_not_called()
        mock_require.assert_called_once()


# ── Guard 2: Product readiness (Test matrix B) ──────────────────────────

class ProductReadinessGuardTests(unittest.TestCase):
    """G3.2: readiness requires EVERY recipe row to be valid."""

    def _client(
        self,
        recipes: List[Dict[str, Any]],
        ingredients: List[Dict[str, Any]],
    ) -> _FakeClient:
        return _FakeClient({"recipes": recipes, "ingredients": ingredients})

    def test_b1_all_rows_valid_is_ready(self) -> None:
        """B1: every row valid → READY."""
        client = self._client(
            recipes=[
                _recipe_row(ingredient_id="ing-1", quantity_used=18.0),
                _recipe_row(ingredient_id="ing-2", quantity_used=180.0),
            ],
            ingredients=[
                _ingredient_row(id="ing-1"),
                _ingredient_row(id="ing-2"),
            ],
        )
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertTrue(readiness["prod-1"])

    def test_b2_mixed_valid_and_zero_rows_not_ready(self) -> None:
        """B2/G3.3 regression: 4 valid rows + 1 zero row → NOT READY.

        This is the confirmed Americano production incident shape.
        Under the old "at least one valid row" semantics this product
        appeared sellable and only failed at final order creation.
        """
        client = self._client(
            recipes=[
                _recipe_row(ingredient_id="ing-cup", quantity_used=1.0, unit="pcs"),
                _recipe_row(ingredient_id="ing-water", quantity_used=180.0, unit="ml"),
                _recipe_row(ingredient_id="ing-ice", quantity_used=350.0, unit="g"),
                _recipe_row(ingredient_id="ing-coffee", quantity_used=0.0, unit="g"),
            ],
            ingredients=[
                _ingredient_row(id="ing-cup", unit="pcs"),
                _ingredient_row(id="ing-water", unit="ml"),
                _ingredient_row(id="ing-ice", unit="g"),
                _ingredient_row(id="ing-coffee", unit="g"),
            ],
        )
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertFalse(readiness["prod-1"])

    def test_b3_unit_mismatch_not_ready(self) -> None:
        """B3: any row with a unit mismatch → NOT READY."""
        client = self._client(
            recipes=[
                _recipe_row(ingredient_id="ing-1", quantity_used=10.0, unit="kg"),
                _recipe_row(ingredient_id="ing-2", quantity_used=5.0, unit="g"),
            ],
            ingredients=[
                _ingredient_row(id="ing-1", unit="g"),
                _ingredient_row(id="ing-2", unit="g"),
            ],
        )
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertFalse(readiness["prod-1"])

    def test_b4_missing_ingredient_reference_not_ready(self) -> None:
        """B4: a row referencing an ingredient outside the store → NOT READY."""
        client = self._client(
            recipes=[
                _recipe_row(ingredient_id="ing-1", quantity_used=10.0),
                _recipe_row(ingredient_id="ing-2", quantity_used=5.0),
            ],
            ingredients=[_ingredient_row(id="ing-1")],
        )
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertFalse(readiness["prod-1"])

    def test_b5_legacy_zero_row_not_ready(self) -> None:
        """B5: a single legacy zero-quantity row → NOT READY."""
        client = self._client(
            recipes=[_recipe_row(ingredient_id="ing-1", quantity_used=0.0)],
            ingredients=[_ingredient_row(id="ing-1")],
        )
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertFalse(readiness["prod-1"])

    def test_inactive_ingredient_row_not_ready(self) -> None:
        """Any row with an inactive ingredient → NOT READY."""
        client = self._client(
            recipes=[
                _recipe_row(ingredient_id="ing-1", quantity_used=10.0),
                _recipe_row(ingredient_id="ing-2", quantity_used=5.0),
            ],
            ingredients=[
                _ingredient_row(id="ing-1"),
                _ingredient_row(id="ing-2", is_active=False),
            ],
        )
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertFalse(readiness["prod-1"])

    def test_no_recipe_rows_not_ready(self) -> None:
        """No recipe rows → NOT READY (unchanged baseline)."""
        client = self._client(recipes=[], ingredients=[_ingredient_row()])
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertFalse(readiness["prod-1"])

    def test_addon_mixed_valid_and_zero_rows_not_selectable(self) -> None:
        """G3.23: the same all-rows-valid contract applies to addon recipes."""
        client = _FakeClient(
            {
                "product_addon_recipes": [
                    {"addon_id": "addon-1", "ingredient_id": "ing-1", "quantity_used": 7.0, "unit": "g"},
                    {"addon_id": "addon-1", "ingredient_id": "ing-2", "quantity_used": 0.0, "unit": "g"},
                ],
                "ingredients": [
                    _ingredient_row(id="ing-1"),
                    _ingredient_row(id="ing-2"),
                ],
            }
        )
        readiness = batch_check_addon_recipe_readiness(client, "store-1", ["addon-1"])
        self.assertFalse(readiness["addon-1"])


# ── Guard 3: Kiosk payment-entry preflight (Test matrix C3/D) ────────────

def _make_snapshot(base_breakdown: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "product_id": "prod-1",
        "product_name": "Americano",
        "store_id": "store-1",
        "quantity": 2,
        "total_price": 80.0,
        "total_cost": 30.0,
        "unit_price": 40.0,
        "unit_cost": 15.0,
        "line_profit": 50.0,
        "base_cost_breakdown": base_breakdown,
        "addon_cost_breakdown": [],
        "options_snapshot": {"sweetness": 100, "addons": []},
    }


_VALID_BREAKDOWN = [
    {"ingredient_id": "ing-cup", "quantity_used": 1.0, "unit": "pcs"},
    {"ingredient_id": "ing-coffee", "quantity_used": 18.0, "unit": "g"},
]


class KioskPreflightTests(unittest.TestCase):
    """G3.4: server-authoritative cart validation before the payment UI."""

    def _build_payload(self, items: List[store_admin.OrderItemPayload]) -> store_admin.KioskOrderPreflight:
        return store_admin.KioskOrderPreflight(items=items)

    def _patches(self, snapshot: Dict[str, Any]) -> List[Any]:
        return [
            patch("app.api.store_admin._get_ctx", return_value={
                "client": _FakeClient({}),
                "user_id": "user-1",
                "memberships": [],
            }),
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")),
            patch("app.api.store_admin._ensure_kiosk_channel", return_value="channel-1"),
            patch("app.api.store_admin._ensure_product_in_store"),
            patch("app.api.store_admin.prepare_order_item_snapshot", return_value=snapshot),
            # Stock availability is unit-tested separately in
            # KioskStockPreflightTests; the endpoint test focuses on
            # configuration validation.
            patch("app.api.store_admin._validate_kiosk_stock_preflight"),
            patch("app.api.store_admin.create_and_finalize_kiosk_order"),
        ]

    def _run(self, patches: List[Any], payload: store_admin.KioskOrderPreflight) -> Any:
        import contextlib
        with contextlib.ExitStack() as stack:
            rpc_mock = None
            for p in patches:
                entered = stack.enter_context(p)
                if p is patches[-1]:
                    rpc_mock = entered
            return store_admin.kiosk_order_preflight(payload, authorization="Bearer token"), rpc_mock

    def test_d4_valid_cart_returns_ready_without_persistence(self) -> None:
        """D4: valid cart → preflight ready; the order RPC is never called."""
        payload = self._build_payload([store_admin.OrderItemPayload(product_id="prod-1", quantity=2)])
        patches = self._patches(_make_snapshot(_VALID_BREAKDOWN))
        result, rpc_mock = self._run(patches, payload)
        self.assertEqual(result["status"], "ready")
        rpc_mock.assert_not_called()

    def test_d1_invalid_cart_returns_409_and_blocks_payment_entry(self) -> None:
        """D1/F1: invalid cart → structured 409; the payment UI must not open."""
        payload = self._build_payload([store_admin.OrderItemPayload(product_id="prod-1", quantity=2)])
        snapshot = _make_snapshot(_VALID_BREAKDOWN + [
            {"ingredient_id": "ing-sugar", "quantity_used": 0.0, "unit": "g"},
        ])
        patches = self._patches(snapshot)
        import contextlib
        with contextlib.ExitStack() as stack:
            rpc_mock = None
            for p in patches:
                entered = stack.enter_context(p)
                if p is patches[-1]:
                    rpc_mock = entered
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.kiosk_order_preflight(payload, authorization="Bearer token")
        self.assertEqual(ctx_err.exception.status_code, 409)
        detail = ctx_err.exception.detail
        self.assertEqual(detail["code"], "invalid_inventory_configuration")
        self.assertEqual(detail["reason"], "invalid_recipe_quantity")
        self.assertEqual(detail["product_name"], "Americano")
        rpc_mock.assert_not_called()

    def test_preflight_blocks_viewer_role(self) -> None:
        """Role guard: viewer cannot run preflight."""
        payload = self._build_payload([store_admin.OrderItemPayload(product_id="prod-1", quantity=1)])
        with patch("app.api.store_admin._get_ctx", return_value={"client": _FakeClient({}), "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "viewer")), \
            patch("app.api.store_admin.create_and_finalize_kiosk_order") as rpc_mock:
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.kiosk_order_preflight(payload, authorization="Bearer token")
        self.assertEqual(ctx_err.exception.status_code, 403)
        rpc_mock.assert_not_called()

    def test_preflight_rejects_empty_items(self) -> None:
        """Input guard: empty cart → 400 items_required."""
        payload = self._build_payload([])
        with patch("app.api.store_admin._get_ctx", return_value={"client": _FakeClient({}), "user_id": "user-1", "memberships": []}), \
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.kiosk_order_preflight(payload, authorization="Bearer token")
        self.assertEqual(ctx_err.exception.status_code, 400)
        self.assertEqual(ctx_err.exception.detail, "items_required")


class KioskStockPreflightTests(unittest.TestCase):
    """G3.4: practical stock availability check (advisory)."""

    def _snapshots(self, quantity: int = 2) -> List[Dict[str, Any]]:
        snapshot = _make_snapshot(_VALID_BREAKDOWN)
        snapshot["quantity"] = quantity
        snapshot["options_snapshot"] = {
            "sweetness": 100,
            "addons": [],
            "_system": {
                "usage_breakdown": {
                    "base": [
                        {"ingredient_id": "ing-cup", "quantity_used": 1.0, "unit": "pcs"},
                        {"ingredient_id": "ing-coffee", "quantity_used": 18.0, "unit": "g"},
                    ],
                    "addons": [],
                }
            },
        }
        return [snapshot]

    def _client(self, stock_coffee: float, stock_cup: float) -> _FakeClient:
        return _FakeClient(
            {
                "ingredients": [
                    {"id": "ing-cup", "store_id": "store-1", "stock_on_hand": stock_cup, "current_stock": stock_cup},
                    {"id": "ing-coffee", "store_id": "store-1", "stock_on_hand": stock_coffee, "current_stock": stock_coffee},
                ]
            }
        )

    def test_sufficient_stock_passes(self) -> None:
        client = self._client(stock_coffee=100.0, stock_cup=10.0)
        store_admin._validate_kiosk_stock_preflight(client, "store-1", self._snapshots(quantity=2))

    def test_insufficient_stock_returns_409_business_conflict(self) -> None:
        """F2: insufficient stock → structured 409 with a safe message."""
        client = self._client(stock_coffee=20.0, stock_cup=10.0)
        with self.assertRaises(HTTPException) as ctx_err:
            store_admin._validate_kiosk_stock_preflight(client, "store-1", self._snapshots(quantity=2))
        self.assertEqual(ctx_err.exception.status_code, 409)
        detail = ctx_err.exception.detail
        self.assertEqual(detail["code"], "insufficient_stock")
        self.assertIn("วัตถุดิบไม่เพียงพอ", detail["message"])
        # G3.20: no ingredient identifiers in the client-facing detail.
        self.assertNotIn("ing-coffee", str(detail))

    def test_stock_lookup_failure_is_skipped_not_fatal(self) -> None:
        """Advisory check: a lookup failure must not block checkout."""

        class _BrokenTable:
            def select(self, cols: str) -> "_BrokenTable":
                return self

            def eq(self, col: str, value: Any) -> "_BrokenTable":
                return self

            def in_(self, col: str, values: List[str]) -> "_BrokenTable":
                return self

            def execute(self) -> SimpleNamespace:
                raise RuntimeError("network down")

        class _BrokenClient:
            def table(self, name: str) -> _BrokenTable:
                return _BrokenTable()

        store_admin._validate_kiosk_stock_preflight(_BrokenClient(), "store-1", self._snapshots())


class FinalAtomicGuardRetainedTests(unittest.TestCase):
    """G3.5: the final atomic validation remains active after preflight."""

    def test_preflight_success_does_not_bypass_final_validation(self) -> None:
        """E1: state can change between preflight and submit — the final
        create path still runs its own validation and can reject."""
        payload = store_admin.KioskOrderCreate(
            items=[store_admin.OrderItemPayload(product_id="prod-1", quantity=2)],
            payment_method="cash",
            customer=None,
            note=None,
            client_order_id="881391b8-2415-4e11-8888-49686e3fe06d",
        )
        # A cart that PASSED preflight earlier (recipe was valid then) but
        # whose snapshot now contains a zero-quantity row (recipe edited in
        # another terminal between preflight and submit).
        snapshot = _make_snapshot(_VALID_BREAKDOWN + [
            {"ingredient_id": "ing-sugar", "quantity_used": 0.0, "unit": "g"},
        ])
        patches = [
            patch("app.api.store_admin._get_ctx", return_value={"client": _FakeClient({}), "user_id": "user-1", "memberships": []}),
            patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff")),
            patch("app.api.store_admin._normalize_store_role", return_value="staff"),
            patch("app.api.store_admin._ensure_kiosk_channel", return_value="channel-1"),
            patch("app.api.store_admin._ensure_product_in_store"),
            patch("app.api.store_admin.prepare_order_item_snapshot", return_value=snapshot),
            patch("app.api.store_admin.create_and_finalize_kiosk_order"),
        ]
        import contextlib
        import uuid as _uuid
        with contextlib.ExitStack() as stack:
            rpc_mock = None
            for p in patches:
                entered = stack.enter_context(p)
                if p is patches[-1]:
                    rpc_mock = entered
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_kiosk_order(payload, authorization="Bearer token")
        self.assertEqual(ctx_err.exception.status_code, 409)
        self.assertEqual(ctx_err.exception.detail["reason"], "invalid_recipe_quantity")
        # E2: no order persistence — the RPC was never reached.
        rpc_mock.assert_not_called()
        self.assertIsInstance(_uuid.UUID("881391b8-2415-4e11-8888-49686e3fe06d"), _uuid.UUID)


if __name__ == "__main__":
    unittest.main()
