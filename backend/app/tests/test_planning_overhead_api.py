import copy
import unittest
from datetime import datetime
from typing import Any, Dict, List, Optional
from unittest.mock import patch

from fastapi import HTTPException

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
        self.ordering: Optional[tuple[str, bool]] = None
        self.limit_value: Optional[int] = None
        self.payload: Any = None
        self.on_conflict: Optional[str] = None

    # Query builders -----------------------------------------------------
    def select(self, _columns: str = "*") -> "FakeTableQuery":
        self.action = "select"
        return self

    def insert(self, data: Any) -> "FakeTableQuery":
        self.action = "insert"
        self.payload = data
        return self

    def update(self, data: Dict[str, Any]) -> "FakeTableQuery":
        self.action = "update"
        self.payload = data
        return self

    def upsert(self, data: Dict[str, Any], on_conflict: Optional[str] = None) -> "FakeTableQuery":
        self.action = "upsert"
        self.payload = data
        self.on_conflict = on_conflict
        return self

    def delete(self) -> "FakeTableQuery":
        self.action = "delete"
        return self

    def eq(self, column: str, value: Any) -> "FakeTableQuery":
        self.filters.append((column, value))
        return self

    def order(self, column: str, desc: bool = False) -> "FakeTableQuery":
        self.ordering = (column, desc)
        return self

    def limit(self, value: int) -> "FakeTableQuery":
        self.limit_value = value
        return self

    # Execution ----------------------------------------------------------
    def execute(self) -> FakeResponse:
        if self.action == "select":
            rows = self._apply_filters(self.dataset)
            if self.ordering:
                column, desc = self.ordering
                rows.sort(key=lambda r: r.get(column) or "", reverse=desc)
            if self.limit_value is not None:
                rows = rows[: self.limit_value]
            return FakeResponse(data=[dict(row) for row in rows])

        if self.action == "insert":
            records = self.payload
            if not isinstance(records, list):
                records = [records]
            inserted: List[Dict[str, Any]] = []
            for record in records:
                inserted.append(self._insert_one(dict(record)))
            return FakeResponse(data=[dict(row) for row in inserted])

        if self.action == "update":
            updated: List[Dict[str, Any]] = []
            for row in self.dataset:
                if self._matches(row):
                    row.update(self.payload)
                    updated.append(dict(row))
            return FakeResponse(data=updated)

        if self.action == "upsert":
            key = self.on_conflict or "id"
            match = None
            if key in self.payload:
                for row in self.dataset:
                    if str(row.get(key)) == str(self.payload.get(key)):
                        match = row
                        break
            if match:
                match.update(self.payload)
                return FakeResponse(data=[dict(match)])
            new_row = self._insert_one(dict(self.payload))
            return FakeResponse(data=[dict(new_row)])

        if self.action == "delete":
            removed: List[Dict[str, Any]] = []
            remaining: List[Dict[str, Any]] = []
            for row in self.dataset:
                (removed if self._matches(row) else remaining).append(row)
            self.dataset[:] = remaining
            return FakeResponse(data=[dict(row) for row in removed])

        raise AssertionError(f"Unsupported action {self.action}")

    # Helpers ------------------------------------------------------------
    def _matches(self, row: Dict[str, Any]) -> bool:
        for column, value in self.filters:
            if str(row.get(column)) != str(value):
                return False
        return True

    def _apply_filters(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        matched = []
        for row in rows:
            if self._matches(row):
                matched.append(dict(row))
        return matched

    def _insert_one(self, data: Dict[str, Any]) -> Dict[str, Any]:
        record = dict(data)
        if "id" not in record:
            record["id"] = f"{self.name}-{len(self.dataset) + 1}"
        now = datetime.utcnow().isoformat()
        record.setdefault("created_at", now)
        record.setdefault("updated_at", now)
        self.dataset.append(record)
        return record


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


class PlanningOverheadApiTests(unittest.TestCase):
    store_id = "store-1"

    def _ctx(self, client: FakeClient, role: str = "owner") -> Dict[str, Any]:
        return {
            "client": client,
            "memberships": [
                {"store_id": self.store_id, "role": role},
            ],
        }

    def _ctx_patch(self, ctx: Dict[str, Any]):
        return patch("app.api.store_admin._get_ctx", return_value=ctx)

    # Overhead expenses --------------------------------------------------
    def test_owner_can_list_overhead_expenses(self) -> None:
        seed = {
            "overhead_expenses": [
                {
                    "id": "exp-1",
                    "store_id": self.store_id,
                    "name": "ค่าเช่า",
                    "category": "rent",
                    "amount": 3000,
                    "period": "monthly",
                    "is_active": True,
                    "note": "A",
                    "created_at": "2024-05-01T00:00:00Z",
                    "updated_at": "2024-05-01T00:00:00Z",
                },
                {
                    "id": "exp-2",
                    "store_id": self.store_id,
                    "name": "ค่าน้ำ",
                    "category": "water",
                    "amount": 500,
                    "period": "monthly",
                    "is_active": False,
                    "note": "B",
                    "created_at": "2024-05-02T00:00:00Z",
                    "updated_at": "2024-05-02T00:00:00Z",
                },
            ]
        }
        client = FakeClient(seed)
        with self._ctx_patch(self._ctx(client)):
            result = store_admin.list_overhead_expenses(store_id=self.store_id)
        self.assertEqual(len(result["items"]), 2)
        self.assertEqual(result["items"][0]["id"], "exp-2")  # sorted desc by created_at

    def test_staff_cannot_list_overhead_expenses(self) -> None:
        client = FakeClient()
        with self._ctx_patch(self._ctx(client, role="staff")):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.list_overhead_expenses(store_id=self.store_id)
        self.assertEqual(ctx_err.exception.status_code, 403)

    def test_owner_can_create_overhead_expense(self) -> None:
        client = FakeClient()
        payload = {
            "name": "ค่าไฟ",
            "category": "electricity",
            "amount": 1200,
            "period": "monthly",
            "note": "summer",
        }
        with self._ctx_patch(self._ctx(client)):
            created = store_admin.create_overhead_expense(payload, store_id=self.store_id)
        self.assertEqual(created["category"], "electricity")
        self.assertEqual(len(client.storage["overhead_expenses"]), 1)

    def test_invalid_category_rejected(self) -> None:
        client = FakeClient()
        payload = {
            "name": "bad",
            "category": "invalid",
            "amount": 100,
            "period": "monthly",
        }
        with self._ctx_patch(self._ctx(client)):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_overhead_expense(payload, store_id=self.store_id)
        self.assertEqual(ctx_err.exception.detail, "category_invalid")

    def test_invalid_period_rejected(self) -> None:
        client = FakeClient()
        payload = {
            "name": "bad",
            "category": "rent",
            "amount": 100,
            "period": "yearly",
        }
        with self._ctx_patch(self._ctx(client)):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_overhead_expense(payload, store_id=self.store_id)
        self.assertEqual(ctx_err.exception.detail, "period_invalid")

    def test_negative_amount_rejected(self) -> None:
        client = FakeClient()
        payload = {
            "name": "bad",
            "category": "rent",
            "amount": -5,
            "period": "monthly",
        }
        with self._ctx_patch(self._ctx(client)):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_overhead_expense(payload, store_id=self.store_id)
        self.assertEqual(ctx_err.exception.detail, "amount_non_negative")

    def test_empty_name_rejected(self) -> None:
        client = FakeClient()
        payload = {
            "name": " ",
            "category": "rent",
            "amount": 100,
            "period": "monthly",
        }
        with self._ctx_patch(self._ctx(client)):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.create_overhead_expense(payload, store_id=self.store_id)
        self.assertEqual(ctx_err.exception.detail, "name_required")

    def test_owner_can_update_overhead_expense(self) -> None:
        seed = {
            "overhead_expenses": [
                {
                    "id": "exp-1",
                    "store_id": self.store_id,
                    "name": "ค่าไฟ",
                    "category": "electricity",
                    "amount": 100,
                    "period": "monthly",
                    "is_active": True,
                }
            ]
        }
        client = FakeClient(seed)
        payload = {"amount": 200, "period": "weekly"}
        with self._ctx_patch(self._ctx(client)):
            updated = store_admin.update_overhead_expense("exp-1", payload, store_id=self.store_id)
        self.assertEqual(updated["amount"], 200)
        self.assertEqual(updated["period"], "weekly")

    def test_owner_cannot_update_other_store_expense(self) -> None:
        seed = {
            "overhead_expenses": [
                {
                    "id": "exp-1",
                    "store_id": "store-2",
                    "name": "ค่าไฟ",
                    "category": "electricity",
                    "amount": 100,
                    "period": "monthly",
                    "is_active": True,
                }
            ]
        }
        client = FakeClient(seed)
        with self._ctx_patch(self._ctx(client)):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.update_overhead_expense("exp-1", {"amount": 150}, store_id=self.store_id)
        self.assertEqual(ctx_err.exception.status_code, 404)

    def test_owner_can_soft_delete_overhead_expense(self) -> None:
        seed = {
            "overhead_expenses": [
                {
                    "id": "exp-1",
                    "store_id": self.store_id,
                    "name": "ค่าไฟ",
                    "category": "electricity",
                    "amount": 100,
                    "period": "monthly",
                    "is_active": True,
                }
            ]
        }
        client = FakeClient(seed)
        with self._ctx_patch(self._ctx(client)):
            deleted = store_admin.deactivate_overhead_expense("exp-1", store_id=self.store_id)
        self.assertFalse(deleted["is_active"])
        # Soft delete keeps the row in storage.
        self.assertEqual(len(client.storage["overhead_expenses"]), 1)

    def test_owner_can_hard_delete_overhead_expense(self) -> None:
        seed = {
            "overhead_expenses": [
                {
                    "id": "exp-1",
                    "store_id": self.store_id,
                    "name": "ค่าเช่า",
                    "category": "rent",
                    "amount": 4500,
                    "period": "monthly",
                    "is_active": True,
                }
            ]
        }
        client = FakeClient(seed)
        with self._ctx_patch(self._ctx(client)):
            result = store_admin.deactivate_overhead_expense("exp-1", store_id=self.store_id, hard=True)
        self.assertEqual(result.get("status"), "deleted")
        self.assertEqual(result.get("id"), "exp-1")
        # Hard delete removes the row from storage entirely.
        self.assertEqual(client.storage["overhead_expenses"], [])

    # Planning assumptions -----------------------------------------------
    def test_get_planning_assumptions_returns_defaults(self) -> None:
        client = FakeClient()
        with self._ctx_patch(self._ctx(client)):
            result = store_admin.get_planning_assumptions_endpoint(store_id=self.store_id)
        self.assertEqual(result["expected_cups_per_month"], store_admin._PLANNING_ASSUMPTION_DEFAULTS["expected_cups_per_month"])

    def test_patch_planning_assumptions_upserts(self) -> None:
        client = FakeClient()
        payload = {
            "expected_cups_per_month": 450,
            "operating_days_per_month": 26,
            "target_profit_monthly": 1000,
            "overhead_allocation_method": "per_cup",
        }
        with self._ctx_patch(self._ctx(client)):
            updated = store_admin.patch_planning_assumptions(payload, store_id=self.store_id)
        self.assertEqual(updated["expected_cups_per_month"], 450)
        self.assertEqual(len(client.storage["planning_assumptions"]), 1)

    def test_invalid_assumption_values_rejected(self) -> None:
        client = FakeClient()
        payload = {"expected_cups_per_month": 0}
        with self._ctx_patch(self._ctx(client)):
            with self.assertRaises(HTTPException) as ctx_err:
                store_admin.patch_planning_assumptions(payload, store_id=self.store_id)
        self.assertEqual(ctx_err.exception.detail, "expected_cups_positive")

    # Baseline + masking guards -----------------------------------------
    @patch("app.api.store_admin._load_planning_assumptions", return_value={
        "expected_cups_per_month": 300,
        "operating_days_per_month": 25,
        "target_profit_monthly": 0,
        "overhead_allocation_method": "per_cup",
    })
    @patch("app.api.store_admin._summarize_overhead_expenses", return_value={
        "monthly_overhead": 900,
        "expense_count": 1,
        "category_breakdown": {},
    })
    @patch("app.api.store_admin._load_active_overhead_expenses", return_value=[{"amount": 900, "period": "monthly"}])
    @patch("app.api.store_admin._build_planning_product_entry", return_value=(
        {
            "product_id": "prod-1",
            "name": "Latte",
            "category": "coffee",
            "is_active": True,
            "base_price": 120,
            "current_unit_cost": 60,
            "gross_profit": 60,
            "gross_margin_percent": 50,
            "cost_status": "complete",
            "recipe_complete": True,
            "ingredient_breakdown": [],
            "addons": [],
            "historical_mix_percent": 50,
            "has_addon_cost_gap": False,
            "addon_cost_status": "complete",
        },
        {
            "issue_codes": set(),
            "purchase_derived_count": 0,
            "other_cost_count": 0,
            "ingredient_count": 0,
            "has_addon_cost_gap": False,
            "missing_addon_recipe_count": 0,
        },
    ))
    @patch("app.api.store_admin._load_planning_products", return_value=[{"id": "prod-1"}])
    @patch("app.api.store_admin._collect_recent_mix", return_value=({}, "order_items"))
    @patch("app.api.store_admin._fetch_store_identity", return_value={"name": "Cafe", "timezone": "Asia/Bangkok"})
    def test_planning_baseline_still_builds(self, *_mocks) -> None:
        result = store_admin._build_planning_payload(client=object(), store_id=self.store_id, lookback_days=30)
        self.assertIn("baseline", result)
        self.assertIn("overhead", result["baseline"])
        self.assertEqual(result["baseline"]["overhead"]["monthly_overhead"], 900)
        self.assertEqual(result["items"][0]["net_profit_after_overhead_per_unit"], 60 - result["baseline"]["overhead"]["overhead_per_cup"])

    def test_customer_masking_strips_overhead_fields(self) -> None:
        items = [
            {
                "unit_cost": 10,
                "line_cost": 20,
                "line_profit": 30,
                "overhead_per_unit": 5,
                "net_profit_after_overhead_per_unit": 25,
                "options": {"addons": []},
            }
        ]
        masked = store_admin._mask_order_item_fields(items)
        self.assertIsNone(masked[0]["unit_cost"])
        self.assertNotIn("direct_cost_per_unit", masked[0])
        self.assertNotIn("gross_profit_per_unit", masked[0])
        self.assertNotIn("overhead_per_unit", masked[0])
        self.assertNotIn("net_profit_after_overhead_per_unit", masked[0])


if __name__ == "__main__":
    unittest.main()
