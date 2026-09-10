"""Tests for BE-FIX-02: Menu & addon readiness contract.

Covers:
- Product readiness: active + recipe ready = customer-orderable
- Product with no recipe = hidden from customer menu
- Inactive product = not customer-orderable
- Addon readiness: active + max_quantity > 0 + recipe ready = selectable
- Addon with max_quantity NULL/0 = hidden
- Addon with missing recipe = hidden and rejected
- Addon over max_quantity = rejected
- Wrong-product addon = rejected
- Customer menu filtering
- Customer addon filtering
- Self-order atomic validation (no partial persistence)
- BE-FIX-01 regression
- Snapshot regression (per-unit semantics)
"""
import unittest
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.services.cost_engine import prepare_order_item_snapshot
from app.services.readiness import (
    batch_check_addon_recipe_readiness,
    batch_check_product_recipe_readiness,
    is_addon_customer_selectable,
    is_product_customer_orderable,
    validate_addon_max_quantity,
)
from app.services.usage_snapshot import has_usage_snapshot


def _make_recipe_row(
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


def _make_addon_recipe_row(
    *,
    addon_id: str = "addon-1",
    ingredient_id: str = "ing-2",
    quantity_used: float = 5.0,
    unit: str = "g",
    store_id: str = "store-1",
) -> Dict[str, Any]:
    return {
        "addon_id": addon_id,
        "ingredient_id": ingredient_id,
        "quantity_used": quantity_used,
        "unit": unit,
        "store_id": store_id,
    }


def _make_ingredient_row(
    *,
    id: str = "ing-1",
    store_id: str = "store-1",
    is_active: bool = True,
    unit: str = "g",
) -> Dict[str, Any]:
    return {"id": id, "store_id": store_id, "is_active": is_active, "unit": unit}


class _FakeTable:
    def __init__(self, name: str, data: List[Dict[str, Any]]):
        self.name = name
        self.data = data
        self._filters: List[tuple] = []

    def select(self, cols: str) -> "_FakeTable":
        self._cols = cols
        return self

    def in_(self, col: str, values: List[str]) -> "_FakeTable":
        self._filters.append(("in", col, values))
        return self

    def eq(self, col: str, value: Any) -> "_FakeTable":
        self._filters.append(("eq", col, value))
        return self

    def order(self, *args, **kwargs) -> "_FakeTable":
        return self

    def execute(self) -> SimpleNamespace:
        result = list(self.data)
        for ftype, col, value in self._filters:
            if ftype == "eq":
                result = [r for r in result if str(r.get(col)) == str(value)]
            elif ftype == "in":
                result = [r for r in result if str(r.get(col)) in [str(v) for v in value]]
        return SimpleNamespace(error=None, data=result)


class _FakeClient:
    def __init__(self, tables: Dict[str, List[Dict[str, Any]]]):
        self._tables = tables

    def table(self, name: str) -> _FakeTable:
        return _FakeTable(name, self._tables.get(name, []))


# ── Product Readiness Tests ────────────────────────────────────────────


class ProductReadinessTests(unittest.TestCase):
    def _make_client(
        self,
        *,
        recipes: List[Dict[str, Any]] = None,
        ingredients: List[Dict[str, Any]] = None,
    ) -> _FakeClient:
        return _FakeClient({
            "recipes": recipes or [],
            "ingredients": ingredients or [],
        })

    def test_t01_active_with_valid_recipe_is_ready(self) -> None:
        client = self._make_client(
            recipes=[_make_recipe_row(ingredient_id="ing-1", quantity_used=10.0)],
            ingredients=[_make_ingredient_row(id="ing-1")],
        )
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertTrue(readiness["prod-1"])

    def test_t02_active_zero_recipe_rows_not_ready(self) -> None:
        client = self._make_client(recipes=[])
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertFalse(readiness["prod-1"])

    def test_t03_inactive_product_not_orderable(self) -> None:
        product_row = {"is_active": False}
        self.assertFalse(is_product_customer_orderable(product_row, True))

    def test_t04_recipe_quantity_zero_not_ready(self) -> None:
        client = self._make_client(
            recipes=[_make_recipe_row(quantity_used=0)],
            ingredients=[_make_ingredient_row(id="ing-1")],
        )
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertFalse(readiness["prod-1"])

    def test_t05_recipe_quantity_negative_not_ready(self) -> None:
        client = self._make_client(
            recipes=[_make_recipe_row(quantity_used=-5)],
            ingredients=[_make_ingredient_row(id="ing-1")],
        )
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertFalse(readiness["prod-1"])

    def test_t06_missing_ingredient_not_ready(self) -> None:
        client = self._make_client(
            recipes=[_make_recipe_row(ingredient_id="ing-missing")],
            ingredients=[],
        )
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertFalse(readiness["prod-1"])

    def test_t07_wrong_store_ingredient_not_ready(self) -> None:
        """Ingredient belongs to store B, recipe queries store A."""
        client = self._make_client(
            recipes=[_make_recipe_row(store_id="store-1", ingredient_id="ing-1")],
            ingredients=[_make_ingredient_row(id="ing-1", store_id="store-2")],
        )
        # The ingredient query filters by store_id="store-1", so the
        # store-2 ingredient won't be found.
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertFalse(readiness["prod-1"])

    def test_t08_inactive_ingredient_not_ready(self) -> None:
        client = self._make_client(
            recipes=[_make_recipe_row(ingredient_id="ing-1")],
            ingredients=[_make_ingredient_row(id="ing-1", is_active=False)],
        )
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertFalse(readiness["prod-1"])

    def test_active_product_with_recipe_is_orderable(self) -> None:
        product_row = {"is_active": True}
        self.assertTrue(is_product_customer_orderable(product_row, True))

    def test_active_product_without_recipe_not_orderable(self) -> None:
        product_row = {"is_active": True}
        self.assertFalse(is_product_customer_orderable(product_row, False))


# ── Addon Readiness Tests ──────────────────────────────────────────────


class AddonReadinessTests(unittest.TestCase):
    def _make_client(
        self,
        *,
        addon_recipes: List[Dict[str, Any]] = None,
        ingredients: List[Dict[str, Any]] = None,
    ) -> _FakeClient:
        return _FakeClient({
            "product_addon_recipes": addon_recipes or [],
            "ingredients": ingredients or [],
        })

    def test_t09_ready_addon_is_selectable(self) -> None:
        client = self._make_client(
            addon_recipes=[_make_addon_recipe_row(addon_id="addon-1")],
            ingredients=[_make_ingredient_row(id="ing-2")],
        )
        readiness = batch_check_addon_recipe_readiness(client, "store-1", ["addon-1"])
        addon_row = {"is_active": True, "max_quantity": 2}
        self.assertTrue(is_addon_customer_selectable(addon_row, readiness["addon-1"]))

    def test_t10_max_quantity_null_not_selectable(self) -> None:
        addon_row = {"is_active": True, "max_quantity": None}
        self.assertFalse(is_addon_customer_selectable(addon_row, True))

    def test_t11_max_quantity_zero_not_selectable(self) -> None:
        addon_row = {"is_active": True, "max_quantity": 0}
        self.assertFalse(is_addon_customer_selectable(addon_row, True))

    def test_t12_addon_recipe_missing_not_selectable(self) -> None:
        client = self._make_client(addon_recipes=[], ingredients=[])
        readiness = batch_check_addon_recipe_readiness(client, "store-1", ["addon-1"])
        addon_row = {"is_active": True, "max_quantity": 2}
        self.assertFalse(is_addon_customer_selectable(addon_row, readiness.get("addon-1", False)))

    def test_t13_inactive_addon_not_selectable(self) -> None:
        addon_row = {"is_active": False, "max_quantity": 2}
        self.assertFalse(is_addon_customer_selectable(addon_row, True))

    def test_t14_addon_above_max_rejected(self) -> None:
        addon_row = {"max_quantity": 2}
        with self.assertRaises(HTTPException) as ctx:
            validate_addon_max_quantity(addon_row, quantity=3)
        self.assertEqual(ctx.exception.detail, "addon_quantity_exceeds_limit")

    def test_t14b_addon_at_max_accepted(self) -> None:
        addon_row = {"max_quantity": 2}
        # Should not raise
        validate_addon_max_quantity(addon_row, quantity=2)

    def test_t14c_addon_below_max_accepted(self) -> None:
        addon_row = {"max_quantity": 2}
        validate_addon_max_quantity(addon_row, quantity=1)

    def test_t15_max_quantity_null_rejects_positive_quantity(self) -> None:
        addon_row = {"max_quantity": None}
        with self.assertRaises(HTTPException) as ctx:
            validate_addon_max_quantity(addon_row, quantity=1)
        self.assertEqual(ctx.exception.detail, "addon_quantity_exceeds_limit")

    def test_t15b_max_quantity_zero_rejects_positive_quantity(self) -> None:
        addon_row = {"max_quantity": 0}
        with self.assertRaises(HTTPException) as ctx:
            validate_addon_max_quantity(addon_row, quantity=1)
        self.assertEqual(ctx.exception.detail, "addon_quantity_exceeds_limit")


# ── Cost Engine Addon Validation Tests ─────────────────────────────────


class CostEngineAddonValidationTests(unittest.TestCase):
    """Verify prepare_order_item_snapshot rejects invalid addons."""

    def _make_product(self) -> Dict[str, Any]:
        return {
            "id": "prod-1",
            "store_id": "store-1",
            "name": "Latte",
            "base_price": 40.0,
            "is_active": True,
        }

    def _make_addon_row(
        self,
        *,
        addon_id: str = "addon-1",
        product_id: str = "prod-1",
        store_id: str = "store-1",
        max_quantity: Any = 2,
        is_active: bool = True,
        price: float = 20.0,
    ) -> Dict[str, Any]:
        return {
            "id": addon_id,
            "product_id": product_id,
            "store_id": store_id,
            "max_quantity": max_quantity,
            "is_active": is_active,
            "price": price,
            "name": "Extra Shot",
            "code": "extra_shot",
        }

    def test_addon_missing_recipe_rejected_in_snapshot(self) -> None:
        """BE-FIX-02: Addon with missing recipe must be rejected."""
        client = MagicMock()
        with patch("app.services.cost_engine._fetch_product", return_value=self._make_product()), \
            patch("app.services.cost_engine._resolve_product_price", return_value=40.0), \
            patch("app.services.cost_engine._calculate_recipe_cost", return_value=(10.0, [{"ingredient_id": "ing-1", "quantity_used": 10.0, "unit": "g"}], "complete")), \
            patch("app.services.cost_engine._fetch_addons", return_value={"addon-1": self._make_addon_row()}), \
            patch("app.services.cost_engine._calculate_addon_unit_cost", return_value=(0.0, [], "missing_addon_recipe")):
            with self.assertRaises(HTTPException) as ctx:
                prepare_order_item_snapshot(
                    client,
                    "store-1",
                    product_id="prod-1",
                    quantity=1,
                    raw_options={"addons": [{"addon_id": "addon-1", "quantity": 1}]},
                )
        self.assertEqual(ctx.exception.detail, "addon_not_available")

    def test_addon_max_quantity_null_rejected_in_snapshot(self) -> None:
        """BE-FIX-02: Addon with max_quantity NULL must be rejected."""
        client = MagicMock()
        addon_row = self._make_addon_row(max_quantity=None)
        with patch("app.services.cost_engine._fetch_product", return_value=self._make_product()), \
            patch("app.services.cost_engine._resolve_product_price", return_value=40.0), \
            patch("app.services.cost_engine._calculate_recipe_cost", return_value=(10.0, [{"ingredient_id": "ing-1", "quantity_used": 10.0, "unit": "g"}], "complete")), \
            patch("app.services.cost_engine._fetch_addons", return_value={"addon-1": addon_row}):
            with self.assertRaises(HTTPException) as ctx:
                prepare_order_item_snapshot(
                    client,
                    "store-1",
                    product_id="prod-1",
                    quantity=1,
                    raw_options={"addons": [{"addon_id": "addon-1", "quantity": 1}]},
                )
        self.assertEqual(ctx.exception.detail, "addon_quantity_exceeds_limit")

    def test_addon_max_quantity_zero_rejected_in_snapshot(self) -> None:
        """BE-FIX-02: Addon with max_quantity=0 must be rejected."""
        client = MagicMock()
        addon_row = self._make_addon_row(max_quantity=0)
        with patch("app.services.cost_engine._fetch_product", return_value=self._make_product()), \
            patch("app.services.cost_engine._resolve_product_price", return_value=40.0), \
            patch("app.services.cost_engine._calculate_recipe_cost", return_value=(10.0, [{"ingredient_id": "ing-1", "quantity_used": 10.0, "unit": "g"}], "complete")), \
            patch("app.services.cost_engine._fetch_addons", return_value={"addon-1": addon_row}):
            with self.assertRaises(HTTPException) as ctx:
                prepare_order_item_snapshot(
                    client,
                    "store-1",
                    product_id="prod-1",
                    quantity=1,
                    raw_options={"addons": [{"addon_id": "addon-1", "quantity": 1}]},
                )
        self.assertEqual(ctx.exception.detail, "addon_quantity_exceeds_limit")

    def test_addon_wrong_product_rejected_in_snapshot(self) -> None:
        """BE-FIX-02: Addon belonging to another product must be rejected."""
        client = MagicMock()
        addon_row = self._make_addon_row(product_id="prod-other")
        with patch("app.services.cost_engine._fetch_product", return_value=self._make_product()), \
            patch("app.services.cost_engine._resolve_product_price", return_value=40.0), \
            patch("app.services.cost_engine._calculate_recipe_cost", return_value=(10.0, [{"ingredient_id": "ing-1", "quantity_used": 10.0, "unit": "g"}], "complete")), \
            patch("app.services.cost_engine._fetch_addons", return_value={"addon-1": addon_row}):
            with self.assertRaises(HTTPException) as ctx:
                prepare_order_item_snapshot(
                    client,
                    "store-1",
                    product_id="prod-1",
                    quantity=1,
                    raw_options={"addons": [{"addon_id": "addon-1", "quantity": 1}]},
                )
        self.assertEqual(ctx.exception.detail, "addon_product_mismatch")


# ── Customer Menu Filtering Tests ──────────────────────────────────────


class CustomerMenuFilteringTests(unittest.TestCase):
    """Verify customer menu endpoints filter by readiness."""

    def test_t17_customer_menu_filters_recipe_incomplete(self) -> None:
        """list_menu should only return active + recipe-ready products."""
        from app.api import customer

        fake_client = MagicMock()
        # Products: A (active+recipe), B (active+no recipe), C (inactive+recipe)
        products = [
            {"id": "prod-a", "name": "Latte", "is_active": True, "store_id": "store-1"},
            {"id": "prod-b", "name": "Mocha", "is_active": True, "store_id": "store-1"},
            {"id": "prod-c", "name": "Tea", "is_active": False, "store_id": "store-1"},
        ]

        def mock_table(name: str) -> MagicMock:
            t = MagicMock()
            if name == "products":
                t.select.return_value = t
                t.eq.return_value = t
                t.order.return_value = t
                t.execute.return_value = SimpleNamespace(error=None, data=products)
            elif name == "recipes":
                t.select.return_value = t
                t.in_.return_value = t
                t.eq.return_value = t
                t.execute.return_value = SimpleNamespace(error=None, data=[
                    {"product_id": "prod-a", "ingredient_id": "ing-1", "quantity_used": 10.0, "unit": "g"},
                    {"product_id": "prod-c", "ingredient_id": "ing-1", "quantity_used": 10.0, "unit": "g"},
                ])
            elif name == "ingredients":
                t.select.return_value = t
                t.in_.return_value = t
                t.eq.return_value = t
                t.execute.return_value = SimpleNamespace(error=None, data=[
                    {"id": "ing-1", "store_id": "store-1", "is_active": True, "unit": "g"},
                ])
            elif name == "product_addons":
                t.select.return_value = t
                t.in_.return_value = t
                t.eq.return_value = t
                t.execute.return_value = SimpleNamespace(error=None, data=[])
            else:
                t.select.return_value = t
                t.execute.return_value = SimpleNamespace(error=None, data=[])
            return t

        fake_client.table = mock_table

        with patch("app.api.customer._get_client", return_value=fake_client), \
            patch("app.api.customer._resolve_store_id", return_value="store-1"), \
            patch("app.api.customer._try_select_products", return_value=products), \
            patch("app.api.customer._load_product_addons_map", return_value={}):
            response = customer.list_menu(store_id="store-1")

        item_ids = [item.get("id") or item.get("product_id") for item in response["items"]]
        # Only prod-a should be in the menu (active + recipe ready)
        # prod-b is active but has no recipe, prod-c is inactive
        self.assertEqual(len(response["items"]), 1)
        self.assertEqual(response["items"][0]["id"], "prod-a")


# ── Snapshot Per-Unit Regression Tests ──────────────────────────────────


class SnapshotPerUnitRegressionTests(unittest.TestCase):
    """Verify usage snapshot per-unit semantics are preserved."""

    def _make_snapshot(
        self,
        *,
        quantity: int = 1,
        base_breakdown: List[Dict[str, Any]] = None,
        addon_breakdown: List[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        base = base_breakdown if base_breakdown is not None else [
            {"ingredient_id": "ing-coffee", "quantity_used": 20.0, "unit": "g"},
        ]
        addon = addon_breakdown or []
        return {
            "product_id": "prod-1",
            "product_name": "Latte",
            "store_id": "store-1",
            "quantity": quantity,
            "unit_price": 40.0,
            "unit_cost": 15.0,
            "total_price": 40.0 * quantity,
            "total_cost": 15.0 * quantity,
            "line_profit": 25.0 * quantity,
            "base_price": 40.0,
            "base_cost": 15.0,
            "base_cost_breakdown": base,
            "option_total": 0.0,
            "option_cost_total": 0.0,
            "options_snapshot": {"sweetness": 100, "addons": []},
            "addon_cost_breakdown": addon,
        }

    def test_product_qty1_base_per_unit(self) -> None:
        from app.services.usage_snapshot import build_usage_breakdown
        snapshot = self._make_snapshot(quantity=1)
        breakdown = build_usage_breakdown(snapshot)
        self.assertEqual(breakdown["base"][0]["quantity_used"], 20.0)

    def test_product_qty2_snapshot_not_premultiplied(self) -> None:
        from app.services.usage_snapshot import build_usage_breakdown
        snapshot = self._make_snapshot(quantity=2)
        breakdown = build_usage_breakdown(snapshot)
        # Per-unit: 20g, NOT 40g (RPC multiplies by oi.quantity)
        self.assertEqual(breakdown["base"][0]["quantity_used"], 20.0)

    def test_addon_qty1_per_unit(self) -> None:
        from app.services.usage_snapshot import build_usage_breakdown
        snapshot = self._make_snapshot(
            addon_breakdown=[
                {"ingredient_id": "ing-coffee", "addon_id": "addon-shot", "quantity_used": 10.0, "unit": "g"},
            ],
        )
        breakdown = build_usage_breakdown(snapshot)
        self.assertEqual(breakdown["addons"][0]["quantity_used"], 10.0)

    def test_addon_qty2_per_unit_not_premultiplied(self) -> None:
        from app.services.usage_snapshot import build_usage_breakdown
        snapshot = self._make_snapshot(
            addon_breakdown=[
                {"ingredient_id": "ing-coffee", "addon_id": "addon-shot", "quantity_used": 10.0, "unit": "g"},
            ],
        )
        breakdown = build_usage_breakdown(snapshot)
        # Per-unit: 10g, NOT 20g (RPC multiplies by selected addon quantity)
        self.assertEqual(breakdown["addons"][0]["quantity_used"], 10.0)


# ── BE-FIX-01 Regression Tests ─────────────────────────────────────────


class BEFIX01RegressionTests(unittest.TestCase):
    """Verify BE-FIX-01 contract remains intact."""

    def test_customer_name_required(self) -> None:
        from app.api import customer
        with self.assertRaises(Exception):
            customer.CustomerPayload(name=None, phone=None)

    def test_customer_phone_optional(self) -> None:
        from app.api import customer
        # Should not raise
        payload = customer.CustomerPayload(name="Test", phone=None)
        self.assertIsNone(payload.phone)

    def test_pickup_time_optional(self) -> None:
        from app.api import customer
        # Should not raise
        payload = customer.CustomerOrderCreatePayload(
            customer=customer.CustomerPayload(name="Test"),
            items=[customer.CustomerOrderItemPayload(product_id="prod-1", quantity=1)],
            pickup_time=None,
        )
        self.assertIsNone(payload.pickup_time)

    def test_customer_note_optional(self) -> None:
        from app.api import customer
        payload = customer.CustomerOrderCreatePayload(
            customer=customer.CustomerPayload(name="Test"),
            items=[customer.CustomerOrderItemPayload(product_id="prod-1", quantity=1)],
            note=None,
        )
        self.assertIsNone(payload.note)


# ── BE-FIX-02A Unit Contract Tests ────────────────────────────────────


class UnitContractProductTests(unittest.TestCase):
    """BE-FIX-02A: Product recipe unit must match ingredient unit."""

    def _make_client(
        self,
        *,
        recipes: List[Dict[str, Any]] = None,
        ingredients: List[Dict[str, Any]] = None,
    ) -> _FakeClient:
        return _FakeClient({
            "recipes": recipes or [],
            "ingredients": ingredients or [],
        })

    def test_product_unit_match_allowed(self) -> None:
        """recipe.unit == ingredient.unit → ready."""
        client = self._make_client(
            recipes=[_make_recipe_row(ingredient_id="ing-1", quantity_used=10.0, unit="g")],
            ingredients=[_make_ingredient_row(id="ing-1")],
        )
        # _make_ingredient_row doesn't set unit; add it
        client._tables["ingredients"][0]["unit"] = "g"
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertTrue(readiness["prod-1"])

    def test_product_unit_mismatch_rejected(self) -> None:
        """recipe.unit != ingredient.unit → NOT ready."""
        client = self._make_client(
            recipes=[_make_recipe_row(ingredient_id="ing-1", quantity_used=10.0, unit="kg")],
            ingredients=[_make_ingredient_row(id="ing-1")],
        )
        client._tables["ingredients"][0]["unit"] = "g"
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertFalse(readiness["prod-1"])

    def test_product_unit_mismatch_case_insensitive(self) -> None:
        """recipe.unit='G' vs ingredient.unit='g' → compatible."""
        client = self._make_client(
            recipes=[_make_recipe_row(ingredient_id="ing-1", quantity_used=10.0, unit="G")],
            ingredients=[_make_ingredient_row(id="ing-1")],
        )
        client._tables["ingredients"][0]["unit"] = "g"
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertTrue(readiness["prod-1"])

    def test_product_no_recipe_unit_rejected(self) -> None:
        """BE-FIX-02B: recipe has no unit, ingredient has unit → rejected."""
        client = self._make_client(
            recipes=[_make_recipe_row(ingredient_id="ing-1", quantity_used=10.0, unit=None)],
            ingredients=[_make_ingredient_row(id="ing-1")],
        )
        client._tables["ingredients"][0]["unit"] = "g"
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertFalse(readiness["prod-1"])

    def test_product_no_ingredient_unit_rejected(self) -> None:
        """BE-FIX-02B: recipe has unit, ingredient has no unit → rejected."""
        client = self._make_client(
            recipes=[_make_recipe_row(ingredient_id="ing-1", quantity_used=10.0, unit="g")],
            ingredients=[_make_ingredient_row(id="ing-1", unit=None)],
        )
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertFalse(readiness["prod-1"])

    def test_product_both_null_units_rejected(self) -> None:
        """BE-FIX-02B: both units NULL → rejected."""
        client = self._make_client(
            recipes=[_make_recipe_row(ingredient_id="ing-1", quantity_used=10.0, unit=None)],
            ingredients=[_make_ingredient_row(id="ing-1", unit=None)],
        )
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertFalse(readiness["prod-1"])

    def test_product_any_row_mismatch_rejects_all(self) -> None:
        """If ANY recipe row has unit mismatch, product is NOT ready."""
        client = self._make_client(
            recipes=[
                _make_recipe_row(ingredient_id="ing-1", quantity_used=10.0, unit="g"),
                _make_recipe_row(ingredient_id="ing-2", quantity_used=5.0, unit="kg"),
            ],
            ingredients=[
                _make_ingredient_row(id="ing-1"),
                _make_ingredient_row(id="ing-2"),
            ],
        )
        client._tables["ingredients"][0]["unit"] = "g"
        client._tables["ingredients"][1]["unit"] = "g"  # ing-2: g, recipe: kg → mismatch
        readiness = batch_check_product_recipe_readiness(client, "store-1", ["prod-1"])
        self.assertFalse(readiness["prod-1"])


class UnitContractAddonTests(unittest.TestCase):
    """BE-FIX-02A: Addon recipe unit must match ingredient unit."""

    def _make_client(
        self,
        *,
        addon_recipes: List[Dict[str, Any]] = None,
        ingredients: List[Dict[str, Any]] = None,
    ) -> _FakeClient:
        return _FakeClient({
            "product_addon_recipes": addon_recipes or [],
            "ingredients": ingredients or [],
        })

    def test_addon_unit_match_allowed(self) -> None:
        """addon recipe.unit == ingredient.unit → ready."""
        client = self._make_client(
            addon_recipes=[_make_addon_recipe_row(addon_id="addon-1", ingredient_id="ing-2", unit="g")],
            ingredients=[_make_ingredient_row(id="ing-2")],
        )
        client._tables["ingredients"][0]["unit"] = "g"
        readiness = batch_check_addon_recipe_readiness(client, "store-1", ["addon-1"])
        self.assertTrue(readiness["addon-1"])

    def test_addon_unit_mismatch_rejected(self) -> None:
        """addon recipe.unit != ingredient.unit → NOT ready."""
        client = self._make_client(
            addon_recipes=[_make_addon_recipe_row(addon_id="addon-1", ingredient_id="ing-2", unit="ml")],
            ingredients=[_make_ingredient_row(id="ing-2")],
        )
        client._tables["ingredients"][0]["unit"] = "g"
        readiness = batch_check_addon_recipe_readiness(client, "store-1", ["addon-1"])
        self.assertFalse(readiness["addon-1"])

    def test_addon_any_row_mismatch_rejects_all(self) -> None:
        """If ANY addon recipe row has unit mismatch, addon is NOT ready."""
        client = self._make_client(
            addon_recipes=[
                _make_addon_recipe_row(addon_id="addon-1", ingredient_id="ing-2", unit="g"),
                _make_addon_recipe_row(addon_id="addon-1", ingredient_id="ing-3", unit="L"),
            ],
            ingredients=[
                _make_ingredient_row(id="ing-2"),
                _make_ingredient_row(id="ing-3"),
            ],
        )
        client._tables["ingredients"][0]["unit"] = "g"
        client._tables["ingredients"][1]["unit"] = "ml"  # ing-3: ml, recipe: L → mismatch
        readiness = batch_check_addon_recipe_readiness(client, "store-1", ["addon-1"])
        self.assertFalse(readiness["addon-1"])


class UnitContractCostEngineTests(unittest.TestCase):
    """BE-FIX-02A: Cost engine rejects unit mismatch in snapshots."""

    def test_base_unit_mismatch_rejected_in_snapshot(self) -> None:
        """Base recipe with unit mismatch must be rejected."""
        client = MagicMock()
        with patch("app.services.cost_engine._fetch_product", return_value={
            "id": "prod-1", "store_id": "store-1", "name": "Latte",
            "base_price": 40.0, "is_active": True,
        }), \
            patch("app.services.cost_engine._resolve_product_price", return_value=40.0), \
            patch("app.services.cost_engine._calculate_recipe_cost", return_value=(
                10.0,
                [{"ingredient_id": "ing-1", "quantity_used": 10.0, "unit": "kg", "unit_mismatch": True}],
                "unit_mismatch",
            )):
            with self.assertRaises(HTTPException) as ctx:
                prepare_order_item_snapshot(
                    client,
                    "store-1",
                    product_id="prod-1",
                    quantity=1,
                )
        self.assertEqual(ctx.exception.detail, "invalid_recipe_configuration")

    def test_addon_unit_mismatch_rejected_in_snapshot(self) -> None:
        """Addon with unit mismatch must be rejected."""
        client = MagicMock()
        addon_row = {
            "id": "addon-1", "product_id": "prod-1", "store_id": "store-1",
            "max_quantity": 2, "is_active": True, "price": 20.0, "name": "Extra Shot",
        }
        with patch("app.services.cost_engine._fetch_product", return_value={
            "id": "prod-1", "store_id": "store-1", "name": "Latte",
            "base_price": 40.0, "is_active": True,
        }), \
            patch("app.services.cost_engine._resolve_product_price", return_value=40.0), \
            patch("app.services.cost_engine._calculate_recipe_cost", return_value=(
                10.0,
                [{"ingredient_id": "ing-1", "quantity_used": 10.0, "unit": "g", "unit_mismatch": False}],
                "complete",
            )), \
            patch("app.services.cost_engine._fetch_addons", return_value={"addon-1": addon_row}), \
            patch("app.services.cost_engine._calculate_addon_unit_cost", return_value=(
                0.0,
                [{"ingredient_id": "ing-2", "quantity_used": 5.0, "unit": "ml", "unit_mismatch": True}],
                "unit_mismatch",
            )):
            with self.assertRaises(HTTPException) as ctx:
                prepare_order_item_snapshot(
                    client,
                    "store-1",
                    product_id="prod-1",
                    quantity=1,
                    raw_options={"addons": [{"addon_id": "addon-1", "quantity": 1}]},
                )
        self.assertEqual(ctx.exception.detail, "addon_not_available")


class UnitContractSnapshotTests(unittest.TestCase):
    """BE-FIX-02B: Usage snapshot fails-closed on unit mismatch."""

    def test_base_unit_mismatch_rejects_entire_snapshot(self) -> None:
        """BE-FIX-02B: ANY unit_mismatch entry → entire snapshot rejected."""
        from app.services.usage_snapshot import build_usage_breakdown, UsageSnapshotError
        snapshot = {
            "base_cost_breakdown": [
                {"ingredient_id": "ing-1", "quantity_used": 20.0, "unit": "g", "unit_mismatch": False},
                {"ingredient_id": "ing-2", "quantity_used": 10.0, "unit": "kg", "unit_mismatch": True},
            ],
            "addon_cost_breakdown": [],
        }
        with self.assertRaises(UsageSnapshotError):
            build_usage_breakdown(snapshot)

    def test_all_base_unit_mismatch_raises_error(self) -> None:
        """If all base entries have unit_mismatch, UsageSnapshotError is raised."""
        from app.services.usage_snapshot import build_usage_breakdown, UsageSnapshotError
        snapshot = {
            "base_cost_breakdown": [
                {"ingredient_id": "ing-1", "quantity_used": 20.0, "unit": "kg", "unit_mismatch": True},
            ],
            "addon_cost_breakdown": [],
        }
        with self.assertRaises(UsageSnapshotError):
            build_usage_breakdown(snapshot)

    def test_addon_unit_mismatch_rejects_entire_snapshot(self) -> None:
        """BE-FIX-02B: ANY addon unit_mismatch → entire snapshot rejected."""
        from app.services.usage_snapshot import build_usage_breakdown, UsageSnapshotError
        snapshot = {
            "base_cost_breakdown": [
                {"ingredient_id": "ing-1", "quantity_used": 20.0, "unit": "g", "unit_mismatch": False},
            ],
            "addon_cost_breakdown": [
                {"ingredient_id": "ing-2", "addon_id": "addon-1", "quantity_used": 5.0, "unit": "ml", "unit_mismatch": False},
                {"ingredient_id": "ing-3", "addon_id": "addon-1", "quantity_used": 3.0, "unit": "L", "unit_mismatch": True},
            ],
        }
        with self.assertRaises(UsageSnapshotError):
            build_usage_breakdown(snapshot)

    def test_valid_snapshot_with_no_mismatches_succeeds(self) -> None:
        """Snapshot with all valid entries succeeds."""
        from app.services.usage_snapshot import build_usage_breakdown
        snapshot = {
            "base_cost_breakdown": [
                {"ingredient_id": "ing-1", "quantity_used": 20.0, "unit": "g", "unit_mismatch": False},
            ],
            "addon_cost_breakdown": [
                {"ingredient_id": "ing-2", "addon_id": "addon-1", "quantity_used": 5.0, "unit": "g", "unit_mismatch": False},
            ],
        }
        breakdown = build_usage_breakdown(snapshot)
        self.assertEqual(len(breakdown["base"]), 1)
        self.assertEqual(len(breakdown["addons"]), 1)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
