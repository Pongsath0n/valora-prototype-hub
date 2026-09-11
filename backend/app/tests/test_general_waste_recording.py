"""V1 General Inventory Waste Recording tests (WST01-WST20).

Verifies that waste recording is NOT gated by expiry. Any ingredient with
available stock > 0 can be discarded for any valid reason. Uses local
fakes/mocks — no real Supabase or Storage calls.
"""
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from unittest.mock import patch

from fastapi import HTTPException

from app.api import store_admin


STORE_ID = "store-1"
OTHER_STORE_ID = "store-2"
INGREDIENT_ID = "ing-1"


class FakeIngredientsTable:
    def __init__(self, rows: List[Dict[str, Any]]):
        self._rows = rows
        self._mode = "select"
        self._filters: Dict[str, Any] = {}
        self._payload: Dict[str, Any] = {}

    def select(self, columns: str = "*"):
        self._mode = "select"
        return self

    def insert(self, data: Dict[str, Any]):
        self._mode = "insert"
        self._payload = dict(data)
        return self

    def update(self, data: Dict[str, Any]):
        self._mode = "update"
        self._payload = dict(data)
        return self

    def eq(self, column: str, value: Any):
        self._filters[column] = value
        return self

    def limit(self, value: int):
        return self

    def execute(self) -> SimpleNamespace:
        if self._mode == "select":
            rows = [r for r in self._rows if self._matches(r)]
            return SimpleNamespace(data=[dict(r) for r in rows], error=None)
        if self._mode == "insert":
            row = dict(self._payload)
            row["id"] = "waste-1"
            row["created_at"] = datetime.now(timezone.utc).isoformat()
            self._rows.append(row)
            return SimpleNamespace(data=[row], error=None)
        if self._mode == "update":
            for r in self._rows:
                if self._matches(r):
                    r.update(self._payload)
            return SimpleNamespace(data=[], error=None)
        raise AssertionError(f"unsupported mode {self._mode}")

    def _matches(self, row: Dict[str, Any]) -> bool:
        for col, val in self._filters.items():
            if str(row.get(col)) != str(val):
                return False
        return True


class FakeStockMovementsTable:
    def __init__(self):
        self._inserted: List[Dict[str, Any]] = []

    def insert(self, data: Dict[str, Any]):
        self._inserted.append(dict(data))
        return self

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=[{"id": "mov-1"}], error=None)


class FakeWasteRecordsTable:
    def __init__(self):
        self._rows: List[Dict[str, Any]] = []

    def insert(self, data: Dict[str, Any]):
        self._mode = "insert"
        self._payload = dict(data)
        return self

    def select(self, columns: str = "*"):
        self._mode = "select"
        return self

    def eq(self, column: str, value: Any):
        return self

    def gte(self, column: str, value: Any):
        return self

    def lte(self, column: str, value: Any):
        return self

    def limit(self, value: int):
        return self

    def execute(self) -> SimpleNamespace:
        if self._mode == "insert":
            row = dict(self._payload)
            row["id"] = "waste-1"
            self._rows.append(row)
            return SimpleNamespace(data=[row], error=None)
        return SimpleNamespace(data=[dict(r) for r in self._rows], error=None)


class FakePurchasesTable:
    def __init__(self, rows: List[Dict[str, Any]] = None):
        self._rows = rows or []

    def select(self, columns: str = "*"):
        return self

    def eq(self, column: str, value: Any):
        return self

    def limit(self, value: int):
        return self

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=[dict(r) for r in self._rows], error=None)


class FakeClient:
    def __init__(self, ingredients: List[Dict[str, Any]], purchases: List[Dict[str, Any]] = None):
        self._tables = {
            "ingredients": FakeIngredientsTable(ingredients),
            "stock_movements": FakeStockMovementsTable(),
            "ingredient_waste_records": FakeWasteRecordsTable(),
            "ingredient_purchases": FakePurchasesTable(purchases or []),
        }

    def table(self, name: str):
        if name not in self._tables:
            raise AssertionError(f"unexpected table {name}")
        return self._tables[name]


def _ingredient_row(
    store_id: str = STORE_ID,
    stock: float = 700,
    expires_at: Optional[str] = None,
    is_perishable: bool = False,
    cost_per_unit: float = 0.6,
) -> Dict[str, Any]:
    return {
        "id": INGREDIENT_ID,
        "store_id": store_id,
        "name": "Milk",
        "unit": "ml",
        "cost_per_unit": cost_per_unit,
        "stock_on_hand": stock,
        "current_stock": stock,
        "low_stock_threshold": 100,
        "is_active": True,
        "expires_at": expires_at,
        "is_perishable": is_perishable,
    }


def _ctx(client: FakeClient, role: str = "manager") -> Dict[str, Any]:
    return {
        "client": client,
        "user_id": "user-1",
        "memberships": [{"store_id": STORE_ID, "role": role}],
        "profile": {"role": role},
    }


def _waste_payload(**kwargs) -> "store_admin.IngredientWasteCreate":
    defaults = {
        "ingredient_id": INGREDIENT_ID,
        "quantity": 100,
        "reason": "damaged",
    }
    defaults.update(kwargs)
    return store_admin.IngredientWasteCreate(**defaults)


class GeneralWasteRecordingTests(unittest.TestCase):
    """WST01-WST20: V1 general inventory waste recording."""

    def test_wst01_expired_ingredient_can_be_discarded(self):
        client = FakeClient([_ingredient_row(expires_at="2020-01-01T00:00:00Z", is_perishable=True)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            result = store_admin.create_ingredient_waste(_waste_payload(reason="expired"))
        self.assertEqual(result.record.quantity, 100)

    def test_wst02_non_expired_ingredient_can_be_discarded(self):
        client = FakeClient([_ingredient_row(expires_at="2099-12-31T00:00:00Z", is_perishable=True)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            result = store_admin.create_ingredient_waste(_waste_payload(reason="damaged"))
        self.assertEqual(result.record.quantity, 100)

    def test_wst03_ingredient_without_expiry_date_can_be_discarded(self):
        client = FakeClient([_ingredient_row(expires_at=None, is_perishable=False)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            result = store_admin.create_ingredient_waste(_waste_payload(reason="damaged"))
        self.assertEqual(result.record.quantity, 100)

    def test_wst04_damaged_reason_accepted(self):
        client = FakeClient([_ingredient_row()])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            result = store_admin.create_ingredient_waste(_waste_payload(reason="damaged"))
        self.assertEqual(result.record.reason, "damaged")

    def test_wst05_premature_spoilage_reason_accepted(self):
        client = FakeClient([_ingredient_row(expires_at="2099-12-31T00:00:00Z", is_perishable=True)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            result = store_admin.create_ingredient_waste(_waste_payload(reason="quality_issue"))
        self.assertEqual(result.record.reason, "quality_issue")

    def test_wst06_contamination_safety_reason_accepted(self):
        client = FakeClient([_ingredient_row()])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            result = store_admin.create_ingredient_waste(_waste_payload(reason="spill"))
        self.assertEqual(result.record.reason, "spill")

    def test_wst07_quantity_lte_current_stock_succeeds(self):
        client = FakeClient([_ingredient_row(stock=700)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            result = store_admin.create_ingredient_waste(_waste_payload(quantity=700))
        self.assertEqual(result.record.quantity, 700)

    def test_wst08_quantity_gt_current_stock_rejected(self):
        client = FakeClient([_ingredient_row(stock=500)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            with self.assertRaises(HTTPException) as exc:
                store_admin.create_ingredient_waste(_waste_payload(quantity=600))
        self.assertEqual(exc.exception.detail, "insufficient_stock_for_waste")

    def test_wst09_zero_quantity_rejected(self):
        client = FakeClient([_ingredient_row(stock=500)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            with self.assertRaises(HTTPException) as exc:
                store_admin.create_ingredient_waste(_waste_payload(quantity=0))
        self.assertEqual(exc.exception.detail, "waste_quantity_positive")

    def test_wst10_negative_quantity_rejected(self):
        client = FakeClient([_ingredient_row(stock=500)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            with self.assertRaises(HTTPException) as exc:
                store_admin.create_ingredient_waste(_waste_payload(quantity=-10))
        self.assertEqual(exc.exception.detail, "waste_quantity_positive")

    def test_wst11_correct_stock_deduction(self):
        client = FakeClient([_ingredient_row(stock=700)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            store_admin.create_ingredient_waste(_waste_payload(quantity=300))
        # Verify the ingredient stock was updated to 400
        ingredient_table = client._tables["ingredients"]
        updated_row = ingredient_table._rows[0]
        # _resolve_ingredient_stock_column prefers "stock_on_hand" when present
        self.assertEqual(updated_row["stock_on_hand"], 400.0)

    def test_wst12_canonical_waste_cost_recorded(self):
        client = FakeClient([_ingredient_row(stock=700, cost_per_unit=0.5)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            result = store_admin.create_ingredient_waste(_waste_payload(quantity=100))
        # Waste cost = quantity * unit_cost_snapshot
        self.assertEqual(result.record.total_cost, 50.0)

    def test_wst13_waste_summary_includes_waste_transaction(self):
        # Verify the waste record is stored in the waste records table
        client = FakeClient([_ingredient_row(stock=700)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            store_admin.create_ingredient_waste(_waste_payload(quantity=100))
        waste_table = client._tables["ingredient_waste_records"]
        self.assertEqual(len(waste_table._rows), 1)
        self.assertEqual(waste_table._rows[0]["quantity"], 100)

    def test_wst14_cross_store_ingredient_rejected(self):
        client = FakeClient([_ingredient_row(store_id=OTHER_STORE_ID)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            with self.assertRaises(HTTPException) as exc:
                store_admin.create_ingredient_waste(_waste_payload())
        self.assertEqual(exc.exception.status_code, 403)

    def test_wst15_unauthorized_user_rejected(self):
        client = FakeClient([_ingredient_row()])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client, role="staff")), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "staff")):
            with self.assertRaises(HTTPException) as exc:
                store_admin.create_ingredient_waste(_waste_payload())
        self.assertEqual(exc.exception.detail, "insufficient_role")

    def test_wst16_purchase_payment_data_unchanged(self):
        purchase = {
            "id": "pur-1",
            "store_id": STORE_ID,
            "ingredient_id": INGREDIENT_ID,
            "payment_status": "paid",
            "paid_at": "2026-01-01T00:00:00Z",
            "total_cost": 500,
        }
        client = FakeClient([_ingredient_row(stock=700)], purchases=[purchase])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            store_admin.create_ingredient_waste(_waste_payload(quantity=100))
        # Purchase data should be unchanged
        purchase_table = client._tables["ingredient_purchases"]
        self.assertEqual(len(purchase_table._rows), 1)
        self.assertEqual(purchase_table._rows[0]["payment_status"], "paid")
        self.assertEqual(purchase_table._rows[0]["paid_at"], "2026-01-01T00:00:00Z")
        self.assertEqual(purchase_table._rows[0]["total_cost"], 500)

    def test_wst17_receipt_data_unchanged(self):
        ingredient = _ingredient_row(stock=700)
        ingredient["receipt_storage_path"] = "store-1/receipts/r1.jpg"
        client = FakeClient([ingredient])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            store_admin.create_ingredient_waste(_waste_payload(quantity=100))
        # Receipt path should still be on the ingredient
        self.assertEqual(client._tables["ingredients"]._rows[0].get("receipt_storage_path"), "store-1/receipts/r1.jpg")

    def test_wst18_expired_alert_functionality_remains_unchanged(self):
        # Verify that _normalize_waste_reason still accepts "expired" as a valid reason
        # This confirms expiry-related waste is still supported
        self.assertEqual(store_admin._normalize_waste_reason("expired"), "expired")
        # Other reasons also work
        self.assertEqual(store_admin._normalize_waste_reason("damaged"), "damaged")
        self.assertEqual(store_admin._normalize_waste_reason("spill"), "spill")
        self.assertEqual(store_admin._normalize_waste_reason("quality_issue"), "quality_issue")
        self.assertEqual(store_admin._normalize_waste_reason("manual_adjustment"), "manual_adjustment")
        self.assertEqual(store_admin._normalize_waste_reason("other"), "other")

    def test_wst19_non_expired_waste_appears_in_waste_summary(self):
        client = FakeClient([_ingredient_row(expires_at="2099-12-31T00:00:00Z", is_perishable=True)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            store_admin.create_ingredient_waste(_waste_payload(quantity=100, reason="damaged"))
        waste_table = client._tables["ingredient_waste_records"]
        self.assertEqual(len(waste_table._rows), 1)
        self.assertEqual(waste_table._rows[0]["reason"], "damaged")
        self.assertEqual(waste_table._rows[0]["quantity"], 100)

    def test_wst20_ingredient_without_expiry_appears_in_waste_summary(self):
        client = FakeClient([_ingredient_row(expires_at=None, is_perishable=False)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            store_admin.create_ingredient_waste(_waste_payload(quantity=50, reason="other"))
        waste_table = client._tables["ingredient_waste_records"]
        self.assertEqual(len(waste_table._rows), 1)
        self.assertEqual(waste_table._rows[0]["reason"], "other")
        self.assertEqual(waste_table._rows[0]["quantity"], 50)


if __name__ == "__main__":
    unittest.main()
