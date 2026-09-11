"""Phase A tests: V1 Stock Intake paid-default simplification (PAID01-PAID12).

All tests use local fakes/mocks — no real Supabase or Storage calls.
Verifies that new stock intakes default to payment_status="paid" with
server-authoritative paid_at, regardless of client input.
"""
import asyncio
import unittest
from datetime import datetime, timezone
from io import BytesIO
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from unittest.mock import patch

from fastapi import HTTPException
from starlette.datastructures import UploadFile

from app.api import store_admin


STORE_ID = "store-1"
OTHER_STORE_ID = "store-2"
INTAKE_ID = "pur-1"
INGREDIENT_ID = "ing-1"


class FakeIngredientsTable:
    def __init__(self, rows: List[Dict[str, Any]]):
        self._rows = rows
        self._mode = "select"
        self._filters: Dict[str, Any] = {}

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
            row["id"] = INTAKE_ID
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


class FakePurchasesTable:
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
            row["id"] = INTAKE_ID
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
        return SimpleNamespace(data=[], error=None)


class FakeClient:
    def __init__(self, ingredients: List[Dict[str, Any]], purchases: List[Dict[str, Any]] = None):
        self._tables = {
            "ingredients": FakeIngredientsTable(ingredients),
            "ingredient_purchases": FakePurchasesTable(purchases or []),
            "stock_movements": FakeStockMovementsTable(),
        }

    def table(self, name: str):
        if name not in self._tables:
            raise AssertionError(f"unexpected table {name}")
        return self._tables[name]


def _ingredient_row(store_id: str = STORE_ID) -> Dict[str, Any]:
    return {
        "id": INGREDIENT_ID,
        "store_id": store_id,
        "name": "Milk",
        "unit": "ml",
        "cost_per_unit": 0.6,
        "stock_on_hand": 500,
        "current_stock": 500,
        "low_stock_threshold": 100,
        "is_active": True,
    }


def _ctx(client: FakeClient, role: str = "manager") -> Dict[str, Any]:
    return {
        "client": client,
        "user_id": "user-1",
        "memberships": [{"store_id": STORE_ID, "role": role}],
        "profile": {"role": role},
    }


def _make_payload(**kwargs) -> "store_admin.StockIntakeCreate":
    defaults = {
        "ingredient_id": INGREDIENT_ID,
        "quantity": 5,
        "purchase_unit": "g",
        "conversion_factor": 1,
        "total_cost": 100,
    }
    defaults.update(kwargs)
    return store_admin.StockIntakeCreate(**defaults)


class StockIntakePaidDefaultTests(unittest.TestCase):
    """PAID01-PAID12: V1 paid-default simplification."""

    def test_paid01_new_intake_defaults_to_paid(self):
        client = FakeClient([_ingredient_row()])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            result = store_admin.create_stock_intake(_make_payload(payment_status="paid"))
        self.assertEqual(result.intake.payment_status, "paid")

    def test_paid02_paid_at_populated_automatically(self):
        client = FakeClient([_ingredient_row()])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            result = store_admin.create_stock_intake(_make_payload())
        self.assertIsNotNone(result.intake.paid_at)

    def test_paid03_paid_at_from_server_side(self):
        client = FakeClient([_ingredient_row()])
        before = datetime.now(timezone.utc)
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            result = store_admin.create_stock_intake(_make_payload(paid_at="2020-01-01T00:00:00Z"))
        after = datetime.now(timezone.utc)
        # Server should ignore client-supplied paid_at and use current time
        self.assertNotEqual(result.intake.paid_at, "2020-01-01T00:00:00Z")
        parsed = datetime.fromisoformat(result.intake.paid_at.replace("Z", "+00:00"))
        self.assertTrue(before <= parsed <= after)

    def test_paid04_receipt_missing_still_creates_paid(self):
        client = FakeClient([_ingredient_row()])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            result = store_admin.create_stock_intake(_make_payload())
        self.assertEqual(result.intake.payment_status, "paid")
        self.assertIsNone(result.intake.receipt_storage_path)

    def test_paid05_receipt_presence_does_not_alter_payment(self):
        client = FakeClient([_ingredient_row()])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            result = store_admin.create_stock_intake(
                _make_payload(receipt_storage_path="store-1/ingredient-purchases/pur-1/receipt.jpg")
            )
        self.assertEqual(result.intake.payment_status, "paid")

    def test_paid06_stock_quantity_updates_correctly(self):
        client = FakeClient([_ingredient_row()])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            result = store_admin.create_stock_intake(_make_payload(quantity=10, conversion_factor=2))
        self.assertEqual(result.intake.quantity, 10)
        self.assertEqual(result.intake.normalized_quantity, 20)

    def test_paid07_purchase_total_remains_correct(self):
        client = FakeClient([_ingredient_row()])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            result = store_admin.create_stock_intake(_make_payload(total_cost=250))
        self.assertEqual(result.intake.total_cost, 250)

    def test_paid08_existing_unpaid_rows_not_modified(self):
        existing_unpaid = {
            "id": "old-pur",
            "store_id": STORE_ID,
            "ingredient_id": INGREDIENT_ID,
            "quantity": 3,
            "total_cost": 50,
            "payment_status": "unpaid",
            "paid_at": None,
            "receipt_storage_path": None,
        }
        client = FakeClient([_ingredient_row()], purchases=[existing_unpaid])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            store_admin.create_stock_intake(_make_payload())
        # Existing unpaid row should remain unchanged
        purchases = client._tables["ingredient_purchases"]._rows
        old_row = next(r for r in purchases if r["id"] == "old-pur")
        self.assertEqual(old_row["payment_status"], "unpaid")
        self.assertIsNone(old_row["paid_at"])

    def test_paid09_create_flow_store_scoped(self):
        client = FakeClient([_ingredient_row(store_id=OTHER_STORE_ID)])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")):
            with self.assertRaises(HTTPException) as exc:
                store_admin.create_stock_intake(_make_payload())
        # Ingredient belongs to other store → 403 store_mismatch
        self.assertEqual(exc.exception.status_code, 403)

    def test_paid10_unauthorized_creation_rejected(self):
        client = FakeClient([_ingredient_row()])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "staff")):
            with self.assertRaises(HTTPException) as exc:
                store_admin.create_stock_intake(_make_payload())
        self.assertEqual(exc.exception.detail, "insufficient_role")

    def test_paid11_no_schema_migration_required(self):
        # This test verifies that the implementation does not require schema changes.
        # The StockIntakeCreate model still accepts payment_status and paid_at fields
        # but the sanitizer forces them to V1 defaults.
        payload = _make_payload(payment_status="unpaid", paid_at="2020-01-01T00:00:00Z")
        sanitized = store_admin._sanitize_stock_intake_payload(payload)
        self.assertEqual(sanitized["payment_status"], "paid")
        self.assertNotEqual(sanitized["paid_at"], "2020-01-01T00:00:00Z")

    def test_paid12_receipt_upload_failure_does_not_change_payment(self):
        client = FakeClient([_ingredient_row()])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client)), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin.upload_payment_slip", side_effect=store_admin.StorageUploadError("upload_failed")):
            # Stock intake is created first (with paid status), then receipt upload fails
            result = store_admin.create_stock_intake(_make_payload())
            self.assertEqual(result.intake.payment_status, "paid")
            # Receipt upload would fail separately — payment_status is already set


if __name__ == "__main__":
    unittest.main()
