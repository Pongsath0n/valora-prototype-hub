import unittest
from typing import Any, Dict
from unittest.mock import patch

from fastapi import HTTPException

from app.api.store_admin import _mask_order_item_fields
from app.services.cost_engine import (
    build_order_item_record,
    mask_option_costs,
    prepare_order_item_snapshot,
)


def _snapshot_template(overrides: Dict[str, Any]) -> Dict[str, Any]:
    base = {
        "product_id": "prod-1",
        "product_name": "Latte",
        "store_id": "store-1",
        "quantity": 1,
        "unit_price": 120.0,
        "unit_cost": 30.0,
        "total_price": 120.0,
        "total_cost": 30.0,
        "line_profit": 90.0,
        "option_total": 10.0,
        "option_cost_total": 5.0,
        "options_snapshot": {"sweetness": 100, "addons": []},
    }
    base.update(overrides)
    return base


class PrepareOrderItemSnapshotTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = object()
        self.store_id = "store-1"
        self.product_id = "prod-1"

    def _patch_base_product(self):
        return patch.multiple(
            "app.services.cost_engine",
            _fetch_product=lambda *_args, **_kwargs: {
                "id": self.product_id,
                "store_id": self.store_id,
                "name": "Latte",
                "base_price": 100,
            },
            _resolve_product_price=lambda *_args, **_kwargs: 110.0,
        )

    @patch("app.services.cost_engine._fetch_addons", return_value={})
    @patch("app.services.cost_engine._calculate_recipe_cost", return_value=(15.0, [], "complete"))
    def test_prepare_snapshot_complete_recipe(self, mock_recipe, _mock_addons):
        with self._patch_base_product():
            snapshot = prepare_order_item_snapshot(
                self.client,
                self.store_id,
                product_id=self.product_id,
                quantity=1,
                raw_options={},
            )
        self.assertEqual(snapshot["unit_cost"], 15.0)
        self.assertNotIn("cost_status", snapshot["options_snapshot"])
        mock_recipe.assert_called_once()

    @patch("app.services.cost_engine._fetch_addons", return_value={})
    @patch("app.services.cost_engine._calculate_recipe_cost", return_value=(0.0, [], "missing_recipe"))
    def test_prepare_snapshot_missing_recipe_sets_status(self, _mock_recipe, _mock_addons):
        with self._patch_base_product():
            snapshot = prepare_order_item_snapshot(
                self.client,
                self.store_id,
                product_id=self.product_id,
                quantity=1,
                raw_options={},
            )
        self.assertEqual(snapshot["unit_cost"], 0.0)
        self.assertEqual(snapshot["options_snapshot"].get("cost_status", {}).get("base"), "missing_recipe")

    @patch("app.services.cost_engine._calculate_addon_unit_cost", return_value=(2.0, [], "complete"))
    @patch(
        "app.services.cost_engine._fetch_addons",
        return_value={
            "addon-1": {
                "id": "addon-1",
                "price": 8,
                "max_quantity": 5,
                "is_active": True,
                "store_id": "store-1",
                "product_id": "prod-1",
                "name": "Extra shot",
            }
        },
    )
    @patch("app.services.cost_engine._calculate_recipe_cost", return_value=(10.0, [], "complete"))
    def test_addon_costs_accumulate(self, _mock_recipe, _mock_addons, _mock_addon_cost):
        with self._patch_base_product():
            snapshot = prepare_order_item_snapshot(
                self.client,
                self.store_id,
                product_id=self.product_id,
                quantity=1,
                raw_options={"addons": [{"addon_id": "addon-1", "quantity": 2}]},
            )
        self.assertEqual(snapshot["option_total"], 16.0)
        self.assertEqual(snapshot["option_cost_total"], 4.0)
        self.assertEqual(snapshot["options_snapshot"]["addons"][0]["unit_price"], 8.0)

    @patch("app.services.cost_engine._calculate_addon_unit_cost", return_value=(0.0, [], "missing_addon_recipe"))
    @patch(
        "app.services.cost_engine._fetch_addons",
        return_value={
            "addon-1": {
                "id": "addon-1",
                "price": 5,
                "max_quantity": 5,
                "is_active": True,
                "store_id": "store-1",
                "product_id": "prod-1",
                "name": "Extra shot",
            }
        },
    )
    @patch("app.services.cost_engine._calculate_recipe_cost", return_value=(10.0, [], "complete"))
    def test_addon_missing_recipe_status(self, _mock_recipe, _mock_addons, _mock_addon_cost):
        with self._patch_base_product():
            snapshot = prepare_order_item_snapshot(
                self.client,
                self.store_id,
                product_id=self.product_id,
                quantity=1,
                raw_options={"addons": [{"addon_id": "addon-1", "quantity": 1}]},
            )
        self.assertEqual(snapshot["options_snapshot"].get("cost_status", {}).get("addons", {}).get("addon-1"), "missing_addon_recipe")
        self.assertEqual(snapshot["options_snapshot"]["addons"][0].get("cost_status"), "missing_addon_recipe")

    @patch("app.services.cost_engine._fetch_addon_recipe_rows", return_value=[])
    @patch(
        "app.services.cost_engine._fetch_addons",
        return_value={
            "addon-1": {
                "id": "addon-1",
                "price": 7,
                "max_quantity": 5,
                "is_active": True,
                "store_id": "store-1",
                "product_id": "prod-1",
                "name": "Extra shot",
            }
        },
    )
    @patch("app.services.cost_engine._calculate_recipe_cost", return_value=(10.0, [], "complete"))
    def test_addon_recipe_rows_missing_preserves_totals(self, _mock_recipe, _mock_addons, _mock_addon_recipes):
        with self._patch_base_product():
            snapshot = prepare_order_item_snapshot(
                self.client,
                self.store_id,
                product_id=self.product_id,
                quantity=1,
                raw_options={"addons": [{"addon_id": "addon-1", "quantity": 1}]},
            )
        self.assertEqual(snapshot["option_total"], 7.0)
        self.assertEqual(snapshot["option_cost_total"], 0.0)
        addon_snapshot = snapshot["options_snapshot"]["addons"][0]
        self.assertEqual(addon_snapshot.get("cost_status"), "missing_addon_recipe")
        addons_status = snapshot["options_snapshot"].get("cost_status", {}).get("addons", {})
        self.assertEqual(addons_status.get("addon-1"), "missing_addon_recipe")

    @patch("app.services.cost_engine._calculate_addon_unit_cost", return_value=(1.0, [], "complete"))
    @patch(
        "app.services.cost_engine._fetch_addons",
        return_value={
            "addon-1": {
                "id": "addon-1",
                "price": 3,
                "max_quantity": 5,
                "is_active": True,
                "store_id": "store-1",
                "product_id": "prod-1",
                "name": "Extra shot",
            }
        },
    )
    @patch("app.services.cost_engine._calculate_recipe_cost", return_value=(5.0, [], "complete"))
    def test_quantity_multiplier_applies(self, _mock_recipe, _mock_addons, _mock_addon_cost):
        with self._patch_base_product():
            snapshot = prepare_order_item_snapshot(
                self.client,
                self.store_id,
                product_id=self.product_id,
                quantity=3,
                raw_options={"addons": [{"addon_id": "addon-1", "quantity": 2}]},
            )
        self.assertEqual(snapshot["total_price"], (110.0 + 6.0) * 3)
        self.assertEqual(snapshot["total_cost"], (5.0 + 2.0) * 3)

    @patch("app.services.cost_engine._calculate_addon_unit_cost", return_value=(0.5, [], "complete"))
    @patch(
        "app.services.cost_engine._fetch_addons",
        return_value={
            "addon-1": {
                "id": "addon-1",
                "price": 4,
                "max_quantity": 1,
                "is_active": True,
                "store_id": "store-1",
                "product_id": "prod-1",
                "name": "Extra shot",
            }
        },
    )
    @patch("app.services.cost_engine._calculate_recipe_cost", return_value=(5.0, [], "complete"))
    def test_addon_max_quantity_enforced(self, _mock_recipe, _mock_addons, _mock_addon_cost):
        with self._patch_base_product():
            with self.assertRaises(HTTPException) as ctx:
                prepare_order_item_snapshot(
                    self.client,
                    self.store_id,
                    product_id=self.product_id,
                    quantity=1,
                    raw_options={"addons": [{"addon_id": "addon-1", "quantity": 2}]},
                )
        self.assertEqual(ctx.exception.detail, "addon_quantity_exceeds_limit")

    @patch("app.services.cost_engine._calculate_addon_unit_cost", return_value=(0.5, [], "complete"))
    @patch(
        "app.services.cost_engine._fetch_addons",
        return_value={
            "addon-1": {
                "id": "addon-1",
                "price": 4,
                "max_quantity": 5,
                "is_active": False,
                "store_id": "store-1",
                "product_id": "prod-1",
                "name": "Extra shot",
            }
        },
    )
    @patch("app.services.cost_engine._calculate_recipe_cost", return_value=(5.0, [], "complete"))
    def test_inactive_addon_blocked(self, _mock_recipe, _mock_addons, _mock_addon_cost):
        with self._patch_base_product():
            with self.assertRaises(HTTPException) as ctx:
                prepare_order_item_snapshot(
                    self.client,
                    self.store_id,
                    product_id=self.product_id,
                    quantity=1,
                    raw_options={"addons": [{"addon_id": "addon-1", "quantity": 1}]},
                )
        self.assertEqual(ctx.exception.detail, "addon_not_available")

    @patch("app.services.cost_engine._calculate_addon_unit_cost", return_value=(0.5, [], "complete"))
    @patch(
        "app.services.cost_engine._fetch_addons",
        return_value={
            "addon-1": {
                "id": "addon-1",
                "price": 4,
                "max_quantity": 5,
                "is_active": True,
                "store_id": "store-1",
                "product_id": "prod-1",
                "name": "Extra shot",
            }
        },
    )
    @patch("app.services.cost_engine._calculate_recipe_cost", return_value=(5.0, [], "complete"))
    def test_spoofed_price_is_ignored(self, _mock_recipe, _mock_addons, _mock_addon_cost):
        with self._patch_base_product():
            snapshot = prepare_order_item_snapshot(
                self.client,
                self.store_id,
                product_id=self.product_id,
                quantity=1,
                raw_options={"addons": [{"addon_id": "addon-1", "quantity": 1, "unit_price": 999}]},
            )
        addon_snapshot = snapshot["options_snapshot"]["addons"][0]
        self.assertEqual(addon_snapshot["unit_price"], 4.0)


class SnapshotRecordTests(unittest.TestCase):
    def test_build_order_item_record_contains_totals(self):
        snapshot = _snapshot_template({})
        record = build_order_item_record(snapshot, order_id="order-1", store_id="store-1", product_name="Latte")
        self.assertEqual(record["line_total"], snapshot["total_price"])
        self.assertEqual(record["line_cost"], snapshot["total_cost"])
        self.assertEqual(record["option_cost_total"], snapshot["option_cost_total"])


class MaskingTests(unittest.TestCase):
    def test_mask_option_costs_remove_sensitive_fields(self):
        masked = mask_option_costs(
            {
                "sweetness": 100,
                "cost_status": {"base": "missing_recipe"},
                "addons": [
                    {"addon_id": "a1", "unit_cost": 1.0, "total_cost": 2.0, "cost_status": "missing_recipe"}
                ],
            }
        )
        self.assertNotIn("cost_status", masked)
        self.assertNotIn("unit_cost", masked["addons"][0])
        self.assertNotIn("total_cost", masked["addons"][0])

    def test_staff_masking_removes_financial_fields(self):
        items = [
            {
                "unit_cost": 10,
                "line_cost": 20,
                "line_profit": 30,
                "option_cost_total": 5,
                "options": {"addons": [{"unit_cost": 2, "cost_status": "missing"}]},
            }
        ]
        masked = _mask_order_item_fields(items)
        self.assertIsNone(masked[0]["unit_cost"])
        self.assertIsNone(masked[0]["line_cost"])
        self.assertIsNone(masked[0]["line_profit"])
        self.assertIsNone(masked[0]["option_cost_total"])
        self.assertNotIn("unit_cost", masked[0]["options"]["addons"][0])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
