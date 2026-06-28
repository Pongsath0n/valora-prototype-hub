import unittest
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from unittest.mock import patch

from app.api import store_admin


class FakeResponse:
    def __init__(self, data: Optional[List[Dict[str, Any]]] = None, error: Optional[Any] = None):
        self.data = data or []
        self.error = error


class FakeTableQuery:
    def __init__(self, dataset: List[Dict[str, Any]], name: str):
        self.dataset = dataset
        self.name = name
        self.action: Optional[str] = None
        self.filters: List[tuple[str, Any]] = []
        self._columns: str = "*"

    def select(self, columns: str = "*") -> "FakeTableQuery":
        self.action = "select"
        self._columns = columns
        return self

    def eq(self, column: str, value: Any) -> "FakeTableQuery":
        self.filters.append((column, value))
        return self

    def execute(self) -> FakeResponse:
        if self.action == "select":
            rows = self._apply_filters(self.dataset)
            return FakeResponse(data=[dict(row) for row in rows])
        raise AssertionError(f"Unsupported action {self.action}")

    def _matches(self, row: Dict[str, Any]) -> bool:
        for column, value in self.filters:
            if str(row.get(column)) != str(value):
                return False
        return True

    def _apply_filters(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [dict(row) for row in rows if self._matches(row)]


class FakeClient:
    def __init__(self, seed: Optional[Dict[str, List[Dict[str, Any]]]] = None):
        base = seed or {}
        self.storage: Dict[str, List[Dict[str, Any]]] = {
            name: [dict(row) for row in rows]
            for name, rows in base.items()
        }

    def table(self, name: str) -> FakeTableQuery:
        dataset = self.storage.setdefault(name, [])
        return FakeTableQuery(dataset, name)


class InventoryAlertsTests(unittest.TestCase):
    store_id = "store-1"

    def _ctx(self, client: FakeClient, role: str = "owner") -> Dict[str, Any]:
        return {
            "client": client,
            "memberships": [{"store_id": self.store_id, "role": role}],
            "user_id": "user-1",
        }

    def _ctx_patch(self, ctx: Dict[str, Any]):
        return patch("app.api.store_admin._get_ctx", return_value=ctx)

    def _resolve_patch(self, role: str = "owner"):
        return patch("app.api.store_admin._resolve_store_id", return_value=(self.store_id, role))

    # ─── _classify_low_stock ──────────────────────────────────────────────

    def test_low_stock_active_ingredient_below_threshold(self) -> None:
        rows = [
            {"id": "ing-1", "name": "Milk", "unit": "ml", "stock_on_hand": 2, "low_stock_threshold": 5, "is_active": True},
        ]
        result = store_admin._classify_low_stock(rows)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["ingredient_id"], "ing-1")
        self.assertEqual(result[0]["severity"], "low_stock")
        self.assertEqual(result[0]["current_stock"], 2.0)
        self.assertEqual(result[0]["low_stock_threshold"], 5.0)

    def test_low_stock_inactive_ingredient_excluded(self) -> None:
        rows = [
            {"id": "ing-1", "name": "Milk", "unit": "ml", "stock_on_hand": 0, "low_stock_threshold": 5, "is_active": False},
        ]
        result = store_admin._classify_low_stock(rows)
        self.assertEqual(len(result), 0)

    def test_low_stock_threshold_zero_excluded(self) -> None:
        rows = [
            {"id": "ing-1", "name": "Milk", "unit": "ml", "stock_on_hand": 0, "low_stock_threshold": 0, "is_active": True},
        ]
        result = store_admin._classify_low_stock(rows)
        self.assertEqual(len(result), 0)

    def test_low_stock_above_threshold_excluded(self) -> None:
        rows = [
            {"id": "ing-1", "name": "Milk", "unit": "ml", "stock_on_hand": 10, "low_stock_threshold": 5, "is_active": True},
        ]
        result = store_admin._classify_low_stock(rows)
        self.assertEqual(len(result), 0)

    def test_low_stock_equal_to_threshold_included(self) -> None:
        rows = [
            {"id": "ing-1", "name": "Milk", "unit": "ml", "stock_on_hand": 5, "low_stock_threshold": 5, "is_active": True},
        ]
        result = store_admin._classify_low_stock(rows)
        self.assertEqual(len(result), 1)

    def test_low_stock_fallback_current_stock_field(self) -> None:
        rows = [
            {"id": "ing-1", "name": "Milk", "unit": "ml", "current_stock": 1, "low_stock_threshold": 3, "is_active": True},
        ]
        result = store_admin._classify_low_stock(rows)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["current_stock"], 1.0)

    def test_low_stock_is_active_none_treated_as_active(self) -> None:
        rows = [
            {"id": "ing-1", "name": "Milk", "unit": "ml", "stock_on_hand": 0, "low_stock_threshold": 5, "is_active": None},
        ]
        result = store_admin._classify_low_stock(rows)
        self.assertEqual(len(result), 1)

    # ─── _classify_expiry ─────────────────────────────────────────────────

    def test_expiry_expired_lot(self) -> None:
        now = datetime(2026, 6, 28, 12, 0, tzinfo=timezone.utc)
        rows = [
            {
                "id": "pur-1",
                "ingredient_id": "ing-1",
                "is_perishable": True,
                "lot_code": "LOT-001",
                "expires_at": (now - timedelta(days=2)).isoformat(),
                "ingredients": {"id": "ing-1", "name": "Milk"},
            },
        ]
        near, expired = store_admin._classify_expiry(rows, now)
        self.assertEqual(len(near), 0)
        self.assertEqual(len(expired), 1)
        self.assertEqual(expired[0]["severity"], "expired")
        self.assertEqual(expired[0]["days_overdue"], 2)
        self.assertEqual(expired[0]["ingredient_name"], "Milk")
        self.assertEqual(expired[0]["lot_code"], "LOT-001")

    def test_expiry_near_expiry_within_3_days(self) -> None:
        now = datetime(2026, 6, 28, 12, 0, tzinfo=timezone.utc)
        rows = [
            {
                "id": "pur-1",
                "ingredient_id": "ing-1",
                "is_perishable": True,
                "lot_code": "LOT-002",
                "expires_at": (now + timedelta(days=2)).isoformat(),
                "ingredients": {"id": "ing-1", "name": "Cream"},
            },
        ]
        near, expired = store_admin._classify_expiry(rows, now)
        self.assertEqual(len(near), 1)
        self.assertEqual(len(expired), 0)
        self.assertEqual(near[0]["severity"], "near_expiry")
        self.assertEqual(near[0]["days_until_expiry"], 2)

    def test_expiry_exactly_3_days_is_near_expiry(self) -> None:
        now = datetime(2026, 6, 28, 12, 0, tzinfo=timezone.utc)
        rows = [
            {
                "id": "pur-1",
                "ingredient_id": "ing-1",
                "is_perishable": True,
                "lot_code": None,
                "expires_at": (now + timedelta(days=3)).isoformat(),
                "ingredients": {"id": "ing-1", "name": "Milk"},
            },
        ]
        near, expired = store_admin._classify_expiry(rows, now)
        self.assertEqual(len(near), 1)
        self.assertEqual(len(expired), 0)

    def test_expiry_beyond_3_days_excluded(self) -> None:
        now = datetime(2026, 6, 28, 12, 0, tzinfo=timezone.utc)
        rows = [
            {
                "id": "pur-1",
                "ingredient_id": "ing-1",
                "is_perishable": True,
                "lot_code": None,
                "expires_at": (now + timedelta(days=4)).isoformat(),
                "ingredients": {"id": "ing-1", "name": "Milk"},
            },
        ]
        near, expired = store_admin._classify_expiry(rows, now)
        self.assertEqual(len(near), 0)
        self.assertEqual(len(expired), 0)

    def test_expiry_non_perishable_excluded(self) -> None:
        now = datetime(2026, 6, 28, 12, 0, tzinfo=timezone.utc)
        rows = [
            {
                "id": "pur-1",
                "ingredient_id": "ing-1",
                "is_perishable": False,
                "lot_code": None,
                "expires_at": (now - timedelta(days=1)).isoformat(),
                "ingredients": {"id": "ing-1", "name": "Sugar"},
            },
        ]
        near, expired = store_admin._classify_expiry(rows, now)
        self.assertEqual(len(near), 0)
        self.assertEqual(len(expired), 0)

    def test_expiry_no_expires_at_excluded(self) -> None:
        now = datetime(2026, 6, 28, 12, 0, tzinfo=timezone.utc)
        rows = [
            {
                "id": "pur-1",
                "ingredient_id": "ing-1",
                "is_perishable": True,
                "lot_code": None,
                "expires_at": None,
                "ingredients": {"id": "ing-1", "name": "Milk"},
            },
        ]
        near, expired = store_admin._classify_expiry(rows, now)
        self.assertEqual(len(near), 0)
        self.assertEqual(len(expired), 0)

    def test_expiry_no_ingredient_relation(self) -> None:
        now = datetime(2026, 6, 28, 12, 0, tzinfo=timezone.utc)
        rows = [
            {
                "id": "pur-1",
                "ingredient_id": "ing-1",
                "is_perishable": True,
                "lot_code": "LOT-X",
                "expires_at": (now - timedelta(days=1)).isoformat(),
            },
        ]
        near, expired = store_admin._classify_expiry(rows, now)
        self.assertEqual(len(expired), 1)
        self.assertIsNone(expired[0]["ingredient_name"])

    # ─── Endpoint integration ─────────────────────────────────────────────

    def test_endpoint_returns_alerts_for_manager(self) -> None:
        now = datetime.now(timezone.utc)
        seed = {
            "ingredients": [
                {"id": "ing-1", "name": "Milk", "unit": "ml", "stock_on_hand": 1, "low_stock_threshold": 5, "is_active": True, "store_id": self.store_id},
                {"id": "ing-2", "name": "Sugar", "unit": "g", "stock_on_hand": 100, "low_stock_threshold": 0, "is_active": True, "store_id": self.store_id},
                {"id": "ing-3", "name": "Old", "unit": "g", "stock_on_hand": 10, "low_stock_threshold": 3, "is_active": False, "store_id": self.store_id},
            ],
            "ingredient_purchases": [
                {
                    "id": "pur-1",
                    "ingredient_id": "ing-1",
                    "is_perishable": True,
                    "lot_code": "LOT-001",
                    "expires_at": (now + timedelta(days=1)).isoformat(),
                    "store_id": self.store_id,
                    "ingredients": {"id": "ing-1", "name": "Milk"},
                },
                {
                    "id": "pur-2",
                    "ingredient_id": "ing-1",
                    "is_perishable": True,
                    "lot_code": "LOT-002",
                    "expires_at": (now - timedelta(days=5)).isoformat(),
                    "store_id": self.store_id,
                    "ingredients": {"id": "ing-1", "name": "Milk"},
                },
                {
                    "id": "pur-3",
                    "ingredient_id": "ing-2",
                    "is_perishable": False,
                    "lot_code": None,
                    "expires_at": (now - timedelta(days=1)).isoformat(),
                    "store_id": self.store_id,
                    "ingredients": {"id": "ing-2", "name": "Sugar"},
                },
            ],
        }
        client = FakeClient(seed)
        with self._ctx_patch(self._ctx(client, role="manager")), self._resolve_patch("manager"):
            result = store_admin.get_inventory_alerts(authorization="token")

        self.assertEqual(result["summary"]["low_stock_count"], 1)
        self.assertEqual(result["summary"]["near_expiry_count"], 1)
        self.assertEqual(result["summary"]["expired_count"], 1)
        self.assertEqual(result["low_stock"][0]["ingredient_id"], "ing-1")
        self.assertEqual(result["near_expiry"][0]["purchase_id"], "pur-1")
        self.assertEqual(result["expired"][0]["purchase_id"], "pur-2")

    def test_endpoint_rejects_staff(self) -> None:
        from fastapi import HTTPException

        client = FakeClient()
        with self._ctx_patch(self._ctx(client, role="staff")), self._resolve_patch("staff"):
            with self.assertRaises(HTTPException) as ctx:
                store_admin.get_inventory_alerts(authorization="token")
        self.assertEqual(ctx.exception.status_code, 403)

    def test_endpoint_no_data_returns_empty(self) -> None:
        client = FakeClient()
        with self._ctx_patch(self._ctx(client, role="owner")), self._resolve_patch("owner"):
            result = store_admin.get_inventory_alerts(authorization="token")
        self.assertEqual(result["summary"]["low_stock_count"], 0)
        self.assertEqual(result["summary"]["near_expiry_count"], 0)
        self.assertEqual(result["summary"]["expired_count"], 0)
        self.assertEqual(result["low_stock"], [])
        self.assertEqual(result["near_expiry"], [])
        self.assertEqual(result["expired"], [])

    def test_endpoint_does_not_expose_financial_fields(self) -> None:
        now = datetime.now(timezone.utc)
        seed = {
            "ingredients": [
                {"id": "ing-1", "name": "Milk", "unit": "ml", "stock_on_hand": 1, "low_stock_threshold": 5, "is_active": True, "store_id": self.store_id, "cost_per_unit": 2.5},
            ],
            "ingredient_purchases": [
                {
                    "id": "pur-1",
                    "ingredient_id": "ing-1",
                    "is_perishable": True,
                    "lot_code": "LOT-001",
                    "expires_at": (now - timedelta(days=1)).isoformat(),
                    "store_id": self.store_id,
                    "total_cost": 500,
                    "unit_cost_snapshot": 2.5,
                    "receipt_url": "https://secret/path",
                    "receipt_storage_path": "storage/secret",
                    "ingredients": {"id": "ing-1", "name": "Milk"},
                },
            ],
        }
        client = FakeClient(seed)
        with self._ctx_patch(self._ctx(client, role="owner")), self._resolve_patch("owner"):
            result = store_admin.get_inventory_alerts(authorization="token")

        for item in result["low_stock"]:
            self.assertNotIn("cost_per_unit", item)
            self.assertNotIn("total_cost", item)
        for item in result["near_expiry"] + result["expired"]:
            self.assertNotIn("total_cost", item)
            self.assertNotIn("unit_cost_snapshot", item)
            self.assertNotIn("receipt_url", item)
            self.assertNotIn("receipt_storage_path", item)
