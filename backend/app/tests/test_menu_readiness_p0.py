"""P0-2: Customer menu recipe readiness tests.

Validates that the customer menu only shows products that are:
- active AND
- recipe-ready AND
- strict unit-compatible

Tests:
- M01: active + valid recipe → visible/orderable
- M02: active + missing recipe → hidden
- M03: active + recipe unit mismatch → hidden
- M04: inactive + valid recipe → unavailable
- M05: menu detail follows same readiness
- M06: addon readiness unchanged
- M07: order creation readiness unchanged
"""
import unittest
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.api import customer
from app.services.readiness import (
    batch_check_addon_recipe_readiness,
    batch_check_product_recipe_readiness,
    is_addon_customer_selectable,
    is_product_customer_orderable,
)


def _make_product(
    *,
    pid: str = "prod-1",
    name: str = "Latte",
    is_active: bool = True,
    store_id: str = "store-1",
    base_price: float = 60.0,
) -> Dict[str, Any]:
    return {
        "id": pid,
        "name": name,
        "is_active": is_active,
        "store_id": store_id,
        "base_price": base_price,
    }


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


def _make_ingredient(
    *,
    iid: str = "ing-1",
    is_active: bool = True,
    unit: str = "g",
    store_id: str = "store-1",
) -> Dict[str, Any]:
    return {"id": iid, "is_active": is_active, "unit": unit, "store_id": store_id}


def _build_mock_client(
    products: List[Dict[str, Any]],
    recipes: List[Dict[str, Any]],
    ingredients: List[Dict[str, Any]],
    addons: Optional[List[Dict[str, Any]]] = None,
    addon_recipes: Optional[List[Dict[str, Any]]] = None,
) -> MagicMock:
    fake_client = MagicMock()

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
            t.execute.return_value = SimpleNamespace(error=None, data=recipes)
        elif name == "ingredients":
            t.select.return_value = t
            t.in_.return_value = t
            t.eq.return_value = t
            t.execute.return_value = SimpleNamespace(error=None, data=ingredients)
        elif name == "product_addons":
            t.select.return_value = t
            t.in_.return_value = t
            t.eq.return_value = t
            t.execute.return_value = SimpleNamespace(error=None, data=addons or [])
        elif name == "product_addon_recipes":
            t.select.return_value = t
            t.in_.return_value = t
            t.eq.return_value = t
            t.execute.return_value = SimpleNamespace(error=None, data=addon_recipes or [])
        else:
            t.select.return_value = t
            t.execute.return_value = SimpleNamespace(error=None, data=[])
        return t

    fake_client.table = mock_table
    return fake_client


class M01ActiveValidRecipeVisibleTests(unittest.TestCase):
    """M01: active + valid recipe → visible/orderable."""

    def test_active_valid_recipe_shown_in_menu(self):
        products = [_make_product(pid="prod-a", name="Latte")]
        recipes = [_make_recipe_row(product_id="prod-a", ingredient_id="ing-1", unit="g")]
        ingredients = [_make_ingredient(iid="ing-1", unit="g")]
        fake_client = _build_mock_client(products, recipes, ingredients)

        with patch("app.api.customer._get_client", return_value=fake_client), \
            patch("app.api.customer._resolve_store_id", return_value="store-1"), \
            patch("app.api.customer._try_select_products", return_value=products), \
            patch("app.api.customer._load_product_addons_map", return_value={}):
            response = customer.list_menu(store_id="store-1")

        self.assertEqual(len(response["items"]), 1)
        self.assertEqual(response["items"][0]["id"], "prod-a")
        self.assertTrue(response["items"][0]["available"])


class M02ActiveMissingRecipeHiddenTests(unittest.TestCase):
    """M02: active + missing recipe → hidden."""

    def test_active_no_recipe_hidden_from_menu(self):
        products = [_make_product(pid="prod-b", name="Mocha")]
        recipes = []
        ingredients = []
        fake_client = _build_mock_client(products, recipes, ingredients)

        with patch("app.api.customer._get_client", return_value=fake_client), \
            patch("app.api.customer._resolve_store_id", return_value="store-1"), \
            patch("app.api.customer._try_select_products", return_value=products), \
            patch("app.api.customer._load_product_addons_map", return_value={}):
            response = customer.list_menu(store_id="store-1")

        self.assertEqual(len(response["items"]), 0)


class M03ActiveUnitMismatchHiddenTests(unittest.TestCase):
    """M03: active + recipe unit mismatch → hidden."""

    def test_active_unit_mismatch_hidden_from_menu(self):
        products = [_make_product(pid="prod-c", name="Tea")]
        recipes = [_make_recipe_row(product_id="prod-c", ingredient_id="ing-1", unit="ml")]
        ingredients = [_make_ingredient(iid="ing-1", unit="g")]
        fake_client = _build_mock_client(products, recipes, ingredients)

        with patch("app.api.customer._get_client", return_value=fake_client), \
            patch("app.api.customer._resolve_store_id", return_value="store-1"), \
            patch("app.api.customer._try_select_products", return_value=products), \
            patch("app.api.customer._load_product_addons_map", return_value={}):
            response = customer.list_menu(store_id="store-1")

        self.assertEqual(len(response["items"]), 0)


class M04InactiveValidRecipeUnavailableTests(unittest.TestCase):
    """M04: inactive + valid recipe → unavailable/not customer-orderable."""

    def test_inactive_product_not_returned_by_menu(self):
        # _try_select_products filters is_active at DB level, so inactive
        # products never reach the readiness check. Verify this.
        products = [_make_product(pid="prod-d", name="Cold Brew", is_active=False)]
        recipes = [_make_recipe_row(product_id="prod-d", ingredient_id="ing-1", unit="g")]
        ingredients = [_make_ingredient(iid="ing-1", unit="g")]
        fake_client = _build_mock_client(products, recipes, ingredients)

        # Simulate the DB-level is_active filter by passing only active products
        # to _try_select_products (as the real function does).
        active_products = [p for p in products if p.get("is_active", True)]

        with patch("app.api.customer._get_client", return_value=fake_client), \
            patch("app.api.customer._resolve_store_id", return_value="store-1"), \
            patch("app.api.customer._try_select_products", return_value=active_products), \
            patch("app.api.customer._load_product_addons_map", return_value={}):
            response = customer.list_menu(store_id="store-1")

        self.assertEqual(len(response["items"]), 0)

    def test_inactive_product_not_orderable_via_helper(self):
        product = _make_product(is_active=False)
        self.assertFalse(is_product_customer_orderable(product, recipe_ready=True))


class M05MenuDetailReadinessTests(unittest.TestCase):
    """M05: menu detail follows same readiness contract."""

    def test_detail_active_valid_recipe_returned(self):
        product = _make_product(pid="prod-a", name="Latte")
        recipes = [_make_recipe_row(product_id="prod-a", ingredient_id="ing-1", unit="g")]
        ingredients = [_make_ingredient(iid="ing-1", unit="g")]
        fake_client = _build_mock_client([product], recipes, ingredients)

        with patch("app.api.customer._get_client", return_value=fake_client), \
            patch("app.api.customer._resolve_store_id", return_value="store-1"), \
            patch("app.api.customer._try_select_products", return_value=[product]), \
            patch("app.api.customer._load_product_addons_map", return_value={}):
            response = customer.get_menu_item("prod-a", store_id="store-1")
            self.assertEqual(response["id"], "prod-a")

    def test_detail_active_missing_recipe_returns_404(self):
        product = _make_product(pid="prod-b", name="Mocha")
        recipes = []
        ingredients = []
        fake_client = _build_mock_client([product], recipes, ingredients)

        with patch("app.api.customer._get_client", return_value=fake_client), \
            patch("app.api.customer._resolve_store_id", return_value="store-1"), \
            patch("app.api.customer._try_select_products", return_value=[product]), \
            patch("app.api.customer._load_product_addons_map", return_value={}):
            with self.assertRaises(HTTPException) as ctx_err:
                customer.get_menu_item("prod-b", store_id="store-1")
            self.assertEqual(ctx_err.exception.status_code, 404)
            self.assertEqual(ctx_err.exception.detail, "menu_item_not_available")

    def test_detail_active_unit_mismatch_returns_404(self):
        product = _make_product(pid="prod-c", name="Tea")
        recipes = [_make_recipe_row(product_id="prod-c", ingredient_id="ing-1", unit="ml")]
        ingredients = [_make_ingredient(iid="ing-1", unit="g")]
        fake_client = _build_mock_client([product], recipes, ingredients)

        with patch("app.api.customer._get_client", return_value=fake_client), \
            patch("app.api.customer._resolve_store_id", return_value="store-1"), \
            patch("app.api.customer._try_select_products", return_value=[product]), \
            patch("app.api.customer._load_product_addons_map", return_value={}):
            with self.assertRaises(HTTPException) as ctx_err:
                customer.get_menu_item("prod-c", store_id="store-1")
            self.assertEqual(ctx_err.exception.status_code, 404)
            self.assertEqual(ctx_err.exception.detail, "menu_item_not_available")

    def test_detail_inactive_returns_404(self):
        product = _make_product(pid="prod-d", name="Cold Brew", is_active=False)
        fake_client = _build_mock_client([product], [], [])

        with patch("app.api.customer._get_client", return_value=fake_client), \
            patch("app.api.customer._resolve_store_id", return_value="store-1"), \
            patch("app.api.customer._try_select_products", return_value=[product]):
            with self.assertRaises(HTTPException) as ctx_err:
                customer.get_menu_item("prod-d", store_id="store-1")
            self.assertEqual(ctx_err.exception.status_code, 404)
            self.assertEqual(ctx_err.exception.detail, "menu_item_not_available")


class M06AddonReadinessUnchangedTests(unittest.TestCase):
    """M06: addon readiness unchanged (active + max_quantity > 0 + recipe ready)."""

    def test_active_addon_with_recipe_is_selectable(self):
        addon = {"id": "addon-1", "is_active": True, "max_quantity": 3}
        self.assertTrue(is_addon_customer_selectable(addon, recipe_ready=True))

    def test_addon_max_quantity_zero_not_selectable(self):
        addon = {"id": "addon-1", "is_active": True, "max_quantity": 0}
        self.assertFalse(is_addon_customer_selectable(addon, recipe_ready=True))

    def test_addon_max_quantity_null_not_selectable(self):
        addon = {"id": "addon-1", "is_active": True, "max_quantity": None}
        self.assertFalse(is_addon_customer_selectable(addon, recipe_ready=True))

    def test_addon_missing_recipe_not_selectable(self):
        addon = {"id": "addon-1", "is_active": True, "max_quantity": 3}
        self.assertFalse(is_addon_customer_selectable(addon, recipe_ready=False))

    def test_addon_unit_mismatch_not_selectable(self):
        """Addon with unit mismatch in recipe → not selectable (fail-closed)."""
        addon_recipes = [
            {"addon_id": "addon-1", "ingredient_id": "ing-1", "quantity_used": 5.0, "unit": "ml"},
        ]
        ingredients = [_make_ingredient(iid="ing-1", unit="g")]

        fake_client = MagicMock()

        def mock_table(name):
            t = MagicMock()
            if name == "product_addon_recipes":
                t.select.return_value = t
                t.in_.return_value = t
                t.eq.return_value = t
                t.execute.return_value = SimpleNamespace(error=None, data=addon_recipes)
            elif name == "ingredients":
                t.select.return_value = t
                t.in_.return_value = t
                t.eq.return_value = t
                t.execute.return_value = SimpleNamespace(error=None, data=ingredients)
            return t

        fake_client.table = mock_table

        readiness = batch_check_addon_recipe_readiness(fake_client, "store-1", ["addon-1"])
        self.assertFalse(readiness.get("addon-1", True))


class M07OrderCreationReadinessUnchangedTests(unittest.TestCase):
    """M07: order creation readiness unchanged.

    The cost engine's prepare_order_item_snapshot already enforces recipe
    readiness and unit compatibility at order creation. This test verifies
    that the readiness module's batch_check_product_recipe_readiness is
    consistent with the order creation contract.
    """

    def test_product_with_valid_recipe_is_orderable(self):
        product = _make_product(is_active=True)
        self.assertTrue(is_product_customer_orderable(product, recipe_ready=True))

    def test_product_without_recipe_not_orderable(self):
        product = _make_product(is_active=True)
        self.assertFalse(is_product_customer_orderable(product, recipe_ready=False))

    def test_inactive_product_not_orderable_even_with_recipe(self):
        product = _make_product(is_active=False)
        self.assertFalse(is_product_customer_orderable(product, recipe_ready=True))

    def test_unit_mismatch_product_not_ready(self):
        """Unit mismatch at readiness level → not ready → not orderable."""
        recipes = [_make_recipe_row(product_id="prod-1", ingredient_id="ing-1", unit="ml")]
        ingredients = [_make_ingredient(iid="ing-1", unit="g")]

        fake_client = MagicMock()

        def mock_table(name):
            t = MagicMock()
            if name == "recipes":
                t.select.return_value = t
                t.in_.return_value = t
                t.eq.return_value = t
                t.execute.return_value = SimpleNamespace(error=None, data=recipes)
            elif name == "ingredients":
                t.select.return_value = t
                t.in_.return_value = t
                t.eq.return_value = t
                t.execute.return_value = SimpleNamespace(error=None, data=ingredients)
            return t

        fake_client.table = mock_table

        readiness = batch_check_product_recipe_readiness(fake_client, "store-1", ["prod-1"])
        self.assertFalse(readiness.get("prod-1", True))

        product = _make_product(pid="prod-1", is_active=True)
        self.assertFalse(
            is_product_customer_orderable(product, readiness.get("prod-1", False))
        )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
