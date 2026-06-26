import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.api.store_admin import (
    IngredientWasteCreate,
    StockIntakeCreate,
    _sanitize_stock_intake_payload,
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
            reason="expired_waste",
            purchase_id="purchase-9",
        )

        response = create_ingredient_waste(payload, authorization="token")

        self.assertEqual(response.record.stock_movement_id, "movement-1")
        mock_insert_movement.assert_called_once()
        mock_update_stock.assert_called_once()
        updated_call = mock_update_stock.call_args.kwargs
        self.assertAlmostEqual(updated_call["new_stock"], 2.0)

        table = fake_client._tables["ingredient_waste_records"]
        self.assertIsNotNone(table.payload)
        self.assertEqual(table.payload["total_cost"], 9.0)
        self.assertEqual(table.payload["stock_movement_id"], "movement-1")

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

        payload = IngredientWasteCreate(ingredient_id="ing-1", quantity=2, reason="expired_waste")

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


if __name__ == "__main__":
    unittest.main()
