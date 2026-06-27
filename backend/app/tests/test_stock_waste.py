import unittest
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.api.store_admin import (
    IngredientWasteCreate,
    StockIntakeCreate,
    _sanitize_stock_intake_payload,
    _insert_waste_stock_movement,
    _update_ingredient_stock_for_waste,
    create_ingredient_waste,
    list_ingredient_waste_records,
)


class StockIntakeSanitizeTests(unittest.TestCase):
    def test_accepts_expiry_fields(self) -> None:
        payload = StockIntakeCreate(
            ingredient_id="ing-1",
            quantity=1,
            purchase_unit="kg",
            conversion_factor=1000,
            total_cost=200,
            is_perishable=True,
            lot_code="LOT-42",
            expires_at="2026-07-01T00:00:00Z",
            expiry_note="Keep chilled",
        )

        sanitized = _sanitize_stock_intake_payload(payload)

        self.assertTrue(sanitized["is_perishable"])
        self.assertEqual(sanitized["lot_code"], "LOT-42")
        self.assertIsNotNone(sanitized["expires_at"])
        self.assertEqual(sanitized["expiry_note"], "Keep chilled")


class FakeInsertTable:
    def __init__(self) -> None:
        self.payload: dict | None = None

    def insert(self, payload: dict):
        self.payload = payload
        return self

    def execute(self):
        record = dict(self.payload or {})
        record.setdefault("id", "waste-1")
        return SimpleNamespace(error=None, data=[record])


class FakeClient:
    def __init__(self) -> None:
        self._tables: dict[str, FakeInsertTable] = {}

    def table(self, name: str) -> FakeInsertTable:
        if name != "ingredient_waste_records":
            raise AssertionError(f"unexpected table {name}")
        table = self._tables.get(name)
        if not table:
            table = FakeInsertTable()
            self._tables[name] = table
        return table


class IngredientWasteEndpointTests(unittest.TestCase):
    @patch("app.api.store_admin._update_ingredient_stock_for_waste")
    @patch("app.api.store_admin._insert_waste_stock_movement", return_value={"id": "movement-1"})
    @patch("app.api.store_admin._get_purchase_remaining_quantity", return_value=1000.0)
    @patch("app.api.store_admin._get_purchase_snapshot")
    @patch("app.api.store_admin._get_ingredient_snapshot")
    @patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner"))
    @patch("app.api.store_admin._get_ctx")
    def test_create_waste_success(
        self,
        mock_get_ctx: MagicMock,
        _mock_resolve_store: MagicMock,
        mock_get_ingredient: MagicMock,
        mock_get_purchase: MagicMock,
        mock_get_remaining: MagicMock,
        mock_insert_movement: MagicMock,
        mock_update_stock: MagicMock,
    ) -> None:
        fake_client = FakeClient()
        mock_get_ctx.return_value = {"client": fake_client, "memberships": [], "user_id": "user-1"}
        mock_get_ingredient.return_value = {
            "id": "ing-1",
            "store_id": "store-1",
            "stock_on_hand": 5,
            "unit": "g",
            "cost_per_unit": 2,
        }
        mock_get_purchase.return_value = {
            "id": "purchase-9",
            "store_id": "store-1",
            "ingredient_id": "ing-1",
            "unit_cost_snapshot": 3,
        }

        payload = IngredientWasteCreate(
            ingredient_id="ing-1",
            quantity=3,
            reason="expired",
            purchase_id="purchase-9",
        )

        response = create_ingredient_waste(payload, authorization="token")

        self.assertEqual(response.record.stock_movement_id, "movement-1")
        mock_insert_movement.assert_called_once()
        mock_update_stock.assert_called_once()
        updated_call = mock_update_stock.call_args.kwargs
        self.assertAlmostEqual(updated_call["new_stock"], 2.0)
        self.assertEqual(updated_call["ingredient_row"], mock_get_ingredient.return_value)
        movement_call = mock_insert_movement.call_args.kwargs
        self.assertEqual(movement_call["reason"], "expired_waste")
        mock_get_remaining.assert_called_once()

        table = fake_client._tables["ingredient_waste_records"]
        self.assertIsNotNone(table.payload)
        self.assertEqual(table.payload["total_cost"], 9.0)
        self.assertEqual(table.payload["stock_movement_id"], "movement-1")
        self.assertEqual(table.payload["reason"], "expired")

    @patch("app.api.store_admin._update_ingredient_stock_for_waste")
    @patch("app.api.store_admin._insert_waste_stock_movement", return_value={"id": "movement-5"})
    @patch("app.api.store_admin._get_purchase_remaining_quantity", return_value=2000.0)
    @patch("app.api.store_admin._get_purchase_snapshot")
    @patch("app.api.store_admin._get_ingredient_snapshot")
    @patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner"))
    @patch("app.api.store_admin._get_ctx")
    def test_create_waste_persists_exact_quantity_and_cost(
        self,
        mock_get_ctx: MagicMock,
        _mock_resolve_store: MagicMock,
        mock_get_ingredient: MagicMock,
        mock_get_purchase: MagicMock,
        mock_get_remaining: MagicMock,
        mock_insert_movement: MagicMock,
        mock_update_stock: MagicMock,
    ) -> None:
        fake_client = FakeClient()
        mock_get_ctx.return_value = {"client": fake_client, "memberships": [], "user_id": "user-2"}
        mock_get_ingredient.return_value = {
            "id": "ing-generic",
            "store_id": "store-1",
            "stock_on_hand": 1500,
            "unit": "ml",
            "cost_per_unit": 0.07,
        }
        mock_get_purchase.return_value = {
            "id": "purchase-10",
            "store_id": "store-1",
            "ingredient_id": "ing-generic",
            "unit_cost_snapshot": 0.07,
        }

        payload = IngredientWasteCreate(ingredient_id="ing-generic", quantity=500, reason="expired", purchase_id="purchase-10")

        response = create_ingredient_waste(payload, authorization="token")

        mock_insert_movement.assert_called_once()
        movement_call = mock_insert_movement.call_args.kwargs
        self.assertEqual(movement_call["quantity"], 500)
        mock_get_remaining.assert_called_once()

        table = fake_client._tables["ingredient_waste_records"]
        self.assertEqual(table.payload["quantity"], 500)
        self.assertEqual(table.payload["total_cost"], 35.0)
        self.assertEqual(table.payload["stock_movement_id"], "movement-5")
        self.assertEqual(response.record.quantity, 500)
        self.assertEqual(response.record.total_cost, 35.0)

        mock_update_stock.assert_called_once()
        self.assertAlmostEqual(mock_update_stock.call_args.kwargs["new_stock"], 1000.0)

    @patch("app.api.store_admin._insert_waste_stock_movement")
    @patch("app.api.store_admin._get_purchase_remaining_quantity", return_value=50.0)
    @patch("app.api.store_admin._get_purchase_snapshot")
    @patch("app.api.store_admin._get_ingredient_snapshot")
    @patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner"))
    @patch("app.api.store_admin._get_ctx")
    def test_create_waste_rejects_insufficient_purchase_remaining(
        self,
        mock_get_ctx: MagicMock,
        _mock_resolve_store: MagicMock,
        mock_get_ingredient: MagicMock,
        mock_get_purchase: MagicMock,
        mock_get_remaining: MagicMock,
        mock_insert_movement: MagicMock,
    ) -> None:
        mock_get_ctx.return_value = {"client": MagicMock(), "memberships": [], "user_id": "user-1"}
        mock_get_ingredient.return_value = {"id": "ing-1", "store_id": "store-1", "stock_on_hand": 100, "unit": "ml", "cost_per_unit": 0.07}
        mock_get_purchase.return_value = {"id": "purchase-9", "store_id": "store-1", "ingredient_id": "ing-1"}

        payload = IngredientWasteCreate(ingredient_id="ing-1", quantity=75, reason="expired", purchase_id="purchase-9")

        with self.assertRaises(HTTPException) as ctx_err:
            create_ingredient_waste(payload, authorization="token")

        self.assertEqual(ctx_err.exception.detail, "insufficient_lot_stock_for_waste")
        mock_get_remaining.assert_called_once()
        mock_insert_movement.assert_not_called()

    @patch("app.api.store_admin._update_ingredient_stock_for_waste")
    @patch("app.api.store_admin._insert_waste_stock_movement", return_value={"id": "movement-1"})
    @patch("app.api.store_admin._get_purchase_snapshot")
    @patch("app.api.store_admin._get_ingredient_snapshot")
    @patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner"))
    @patch("app.api.store_admin._get_ctx")
    def test_create_waste_rolls_back_when_record_insert_fails(
        self,
        mock_get_ctx: MagicMock,
        _mock_resolve_store: MagicMock,
        mock_get_ingredient: MagicMock,
        _mock_get_purchase: MagicMock,
        mock_insert_movement: MagicMock,
        mock_update_stock: MagicMock,
    ) -> None:
        client = MagicMock()
        waste_table = MagicMock()
        insert_call = MagicMock()
        insert_call.execute.return_value = SimpleNamespace(error="boom", data=None)
        waste_table.insert.return_value = insert_call
        movement_table = MagicMock()
        movement_table.delete.return_value = movement_table
        movement_table.eq.return_value = movement_table
        movement_table.execute.return_value = SimpleNamespace(error=None, data=[])

        def _table(name: str):
            if name == "ingredient_waste_records":
                return waste_table
            if name == "stock_movements":
                return movement_table
            raise AssertionError(f"unexpected table {name}")

        client.table.side_effect = _table
        mock_get_ctx.return_value = {"client": client, "memberships": [], "user_id": "user-1"}
        mock_get_ingredient.return_value = {
            "id": "ing-1",
            "store_id": "store-1",
            "stock_on_hand": 5,
            "unit": "g",
            "cost_per_unit": 2,
        }

        payload = IngredientWasteCreate(ingredient_id="ing-1", quantity=3, reason="expired")

        with self.assertRaises(HTTPException) as ctx_err:
            create_ingredient_waste(payload, authorization="token")

        self.assertEqual(ctx_err.exception.detail, "ingredient_waste_create_failed")
        self.assertEqual(mock_update_stock.call_count, 2)
        self.assertAlmostEqual(mock_update_stock.call_args_list[0].kwargs["new_stock"], 2.0)
        self.assertAlmostEqual(mock_update_stock.call_args_list[1].kwargs["new_stock"], 5.0)
        movement_table.delete.assert_called_once()
        movement_table.eq.assert_any_call("id", "movement-1")
        movement_table.eq.assert_any_call("store_id", "store-1")

    @patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "owner"))
    @patch("app.api.store_admin._get_ctx")
    @patch("app.api.store_admin._get_ingredient_snapshot")
    def test_create_waste_rejects_insufficient_stock(
        self,
        mock_get_ingredient: MagicMock,
        mock_get_ctx: MagicMock,
        _mock_resolve_store: MagicMock,
    ) -> None:
        mock_get_ctx.return_value = {"client": FakeClient(), "memberships": [], "user_id": "user-1"}
        mock_get_ingredient.return_value = {"id": "ing-1", "stock_on_hand": 1, "unit": "g", "cost_per_unit": 2}

        payload = IngredientWasteCreate(ingredient_id="ing-1", quantity=2, reason="expired")

        with self.assertRaises(HTTPException) as ctx_err:
            create_ingredient_waste(payload, authorization="token")

        self.assertEqual(ctx_err.exception.detail, "insufficient_stock_for_waste")

    @patch("app.api.store_admin._resolve_store_id", return_value=("store-1", "staff"))
    @patch("app.api.store_admin._get_ctx", return_value={"client": MagicMock(), "memberships": []})
    def test_staff_cannot_list_waste_records(
        self,
        _mock_get_ctx: MagicMock,
        _mock_resolve_store: MagicMock,
    ) -> None:
        with self.assertRaises(HTTPException) as ctx_err:
            list_ingredient_waste_records(authorization="token")

        self.assertEqual(ctx_err.exception.detail, "insufficient_role")


class WasteStockUpdateTests(unittest.TestCase):
    def _make_table(self, side_effects: list[Any]):
        table = MagicMock()
        table.update.return_value = table
        table.eq.return_value = table
        table.execute.side_effect = side_effects
        return table

    def test_prefers_current_stock_when_legacy_column_missing(self) -> None:
        class MissingColumnError(Exception):
            def __init__(self, column: str) -> None:
                super().__init__(f"column {column} missing")
                self.message = f"column {column} missing"

        table = self._make_table([MissingColumnError("stock_on_hand"), SimpleNamespace(error=None, data=[])])
        client = MagicMock()
        client.table.return_value = table

        _update_ingredient_stock_for_waste(
            client,
            "ing-1",
            "store-1",
            new_stock=7.5,
            ingredient_row={"stock_on_hand": 10},
        )

        first_payload = table.update.call_args_list[0].args[0]
        second_payload = table.update.call_args_list[1].args[0]
        self.assertIn("stock_on_hand", first_payload)
        self.assertIn("current_stock", second_payload)

    def test_uses_current_stock_when_only_current_stock_available(self) -> None:
        table = self._make_table([SimpleNamespace(error=None, data=[])])
        client = MagicMock()
        client.table.return_value = table

        _update_ingredient_stock_for_waste(
            client,
            "ing-2",
            "store-1",
            new_stock=3.0,
            ingredient_row={"current_stock": 5},
        )

        (payload,) = table.update.call_args.args
        self.assertIn("current_stock", payload)
        self.assertNotIn("stock_on_hand", payload)

    def test_insert_waste_stock_movement_records_negative_quantity(self) -> None:
        class StockMovementTable:
            def __init__(self) -> None:
                self.payload: dict[str, Any] | None = None

            def insert(self, payload: dict[str, Any]):
                self.payload = payload
                return self

            def execute(self):
                record = dict(self.payload or {})
                record.setdefault("id", "movement-xyz")
                return SimpleNamespace(error=None, data=[record])

        client = MagicMock()
        table = StockMovementTable()
        client.table.return_value = table

        row = _insert_waste_stock_movement(
            client,
            "store-1",
            "ing-1",
            quantity=4,
            unit="g",
            purchase_id="purchase-7",
            reason="expired_waste",
            unit_cost_snapshot=2.5,
            created_by="user-9",
        )

        self.assertEqual(row["movement_type"], "adjust")
        self.assertEqual(row["quantity"], -4)
        self.assertEqual(row["purchase_id"], "purchase-7")


if __name__ == "__main__":
    unittest.main()
