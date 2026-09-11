"""Phase B tests: Owner Dashboard Procurement & Waste Analytics (PWD01-PWD22).

All tests use local fakes/mocks — no real Supabase or Storage calls.
Verifies server-side aggregation of purchase/waste metrics with date ranges,
store isolation, read-only behavior, and backward compatibility.
"""
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any, Dict, List, Optional
from unittest.mock import patch

from fastapi import HTTPException

from app.api import store_admin


STORE_ID = "store-1"
OTHER_STORE_ID = "store-2"


class FakeTable:
    """Generic fake Supabase table supporting select/eq/gte/lt/execute."""

    def __init__(self, rows: List[Dict[str, Any]]):
        self._all_rows = list(rows)
        self._mode = "select"
        self._filters: Dict[str, Any] = {}
        self._range_filters: List[tuple] = []  # (op, col, val)
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

    def gte(self, column: str, value: Any):
        self._range_filters.append(("gte", column, value))
        return self

    def lt(self, column: str, value: Any):
        self._range_filters.append(("lt", column, value))
        return self

    def lte(self, column: str, value: Any):
        self._range_filters.append(("lte", column, value))
        return self

    def limit(self, value: int):
        return self

    def execute(self) -> SimpleNamespace:
        if self._mode == "select":
            rows = [r for r in self._all_rows if self._matches(r)]
            return SimpleNamespace(data=[dict(r) for r in rows], error=None)
        if self._mode == "insert":
            row = dict(self._payload)
            self._all_rows.append(row)
            return SimpleNamespace(data=[row], error=None)
        if self._mode == "update":
            for r in self._all_rows:
                if self._matches(r):
                    r.update(self._payload)
            return SimpleNamespace(data=[], error=None)
        raise AssertionError(f"unsupported mode {self._mode}")

    def _matches(self, row: Dict[str, Any]) -> bool:
        for col, val in self._filters.items():
            if str(row.get(col)) != str(val):
                return False
        for op, col, val in self._range_filters:
            row_val = row.get(col)
            if row_val is None:
                return False
            try:
                row_dt = datetime.fromisoformat(str(row_val).replace("Z", "+00:00"))
                cmp_dt = datetime.fromisoformat(str(val).replace("Z", "+00:00"))
            except (ValueError, TypeError):
                continue
            if op == "gte" and row_dt < cmp_dt:
                return False
            if op == "lt" and row_dt >= cmp_dt:
                return False
            if op == "lte" and row_dt > cmp_dt:
                return False
        return True


class FakeClient:
    def __init__(self, purchases: List[Dict[str, Any]], waste_records: List[Dict[str, Any]]):
        self._tables = {
            "ingredient_purchases": FakeTable(purchases),
            "ingredient_waste_records": FakeTable(waste_records),
            "orders": FakeTable([]),
            "stores": FakeTable([{"id": STORE_ID, "timezone": "Asia/Bangkok"}]),
        }

    def table(self, name: str):
        if name not in self._tables:
            raise AssertionError(f"unexpected table {name}")
        return self._tables[name]


def _purchase_row(
    store_id: str = STORE_ID,
    total_cost: float = 100,
    payment_status: str = "paid",
    created_at: Optional[str] = None,
) -> Dict[str, Any]:
    if created_at is None:
        created_at = datetime.now(timezone.utc).isoformat()
    return {
        "store_id": store_id,
        "total_cost": total_cost,
        "payment_status": payment_status,
        "created_at": created_at,
    }


def _waste_row(
    store_id: str = STORE_ID,
    total_cost: float = 10,
    wasted_at: Optional[str] = None,
) -> Dict[str, Any]:
    if wasted_at is None:
        wasted_at = datetime.now(timezone.utc).isoformat()
    return {
        "store_id": store_id,
        "total_cost": total_cost,
        "wasted_at": wasted_at,
    }


def _ctx(client: FakeClient, role: str = "manager") -> Dict[str, Any]:
    return {
        "client": client,
        "user_id": "user-1",
        "memberships": [{"store_id": STORE_ID, "role": role}],
        "profile": {"role": role},
    }


def _range_ctx(all_time: bool = True, start: Optional[datetime] = None, end: Optional[datetime] = None) -> Dict[str, Any]:
    return {
        "key": "all" if all_time else "today",
        "label": "ทุกวัน" if all_time else "วันนี้",
        "all_time": all_time,
        "start": start,
        "end": end,
        "start_date": start.date().isoformat() if start else None,
        "end_date": end.date().isoformat() if end else None,
    }


class ProcurementWasteAnalyticsTests(unittest.TestCase):
    """PWD01-PWD22: Owner Dashboard Procurement & Waste Analytics."""

    def test_pwd01_purchase_total_aggregates_correctly(self):
        purchases = [_purchase_row(total_cost=100), _purchase_row(total_cost=200), _purchase_row(total_cost=50)]
        client = FakeClient(purchases, [])
        result = store_admin._build_procurement_waste_summary(client, STORE_ID, timezone.utc, _range_ctx(all_time=True))
        self.assertEqual(result["purchase_total_cost"], 350.0)

    def test_pwd02_paid_purchase_total_aggregates_correctly(self):
        purchases = [
            _purchase_row(total_cost=100, payment_status="paid"),
            _purchase_row(total_cost=200, payment_status="paid"),
            _purchase_row(total_cost=50, payment_status="unpaid"),
        ]
        client = FakeClient(purchases, [])
        result = store_admin._build_procurement_waste_summary(client, STORE_ID, timezone.utc, _range_ctx(all_time=True))
        self.assertEqual(result["purchase_paid_cost"], 300.0)

    def test_pwd03_unpaid_purchase_total_aggregates_correctly(self):
        purchases = [
            _purchase_row(total_cost=100, payment_status="paid"),
            _purchase_row(total_cost=50, payment_status="unpaid"),
            _purchase_row(total_cost=25, payment_status="unpaid"),
        ]
        client = FakeClient(purchases, [])
        result = store_admin._build_procurement_waste_summary(client, STORE_ID, timezone.utc, _range_ctx(all_time=True))
        self.assertEqual(result["purchase_unpaid_cost"], 75.0)

    def test_pwd04_store_isolation(self):
        purchases = [
            _purchase_row(store_id=STORE_ID, total_cost=100),
            _purchase_row(store_id=OTHER_STORE_ID, total_cost=500),
        ]
        client = FakeClient(purchases, [])
        result = store_admin._build_procurement_waste_summary(client, STORE_ID, timezone.utc, _range_ctx(all_time=True))
        # Only store-1 purchases should be counted
        self.assertEqual(result["purchase_total_cost"], 100.0)

    def test_pwd05_today_range(self):
        now = datetime.now(timezone.utc)
        today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        today_end = today_start + timedelta(days=1)
        purchases = [
            _purchase_row(total_cost=100, created_at=now.isoformat()),
            _purchase_row(total_cost=200, created_at=(today_start - timedelta(days=1)).isoformat()),
        ]
        client = FakeClient(purchases, [])
        result = store_admin._build_procurement_waste_summary(
            client, STORE_ID, timezone.utc, _range_ctx(all_time=False, start=today_start, end=today_end)
        )
        self.assertEqual(result["purchase_total_cost"], 100.0)

    def test_pwd06_7_day_range(self):
        now = datetime.now(timezone.utc)
        today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        end = today_start + timedelta(days=1)
        start = end - timedelta(days=7)
        purchases = [
            _purchase_row(total_cost=100, created_at=now.isoformat()),
            _purchase_row(total_cost=200, created_at=(start - timedelta(days=1)).isoformat()),
        ]
        client = FakeClient(purchases, [])
        result = store_admin._build_procurement_waste_summary(
            client, STORE_ID, timezone.utc, _range_ctx(all_time=False, start=start, end=end)
        )
        self.assertEqual(result["purchase_total_cost"], 100.0)

    def test_pwd07_30_day_range(self):
        now = datetime.now(timezone.utc)
        today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        end = today_start + timedelta(days=1)
        start = end - timedelta(days=30)
        purchases = [
            _purchase_row(total_cost=100, created_at=now.isoformat()),
            _purchase_row(total_cost=200, created_at=(start - timedelta(days=1)).isoformat()),
        ]
        client = FakeClient(purchases, [])
        result = store_admin._build_procurement_waste_summary(
            client, STORE_ID, timezone.utc, _range_ctx(all_time=False, start=start, end=end)
        )
        self.assertEqual(result["purchase_total_cost"], 100.0)

    def test_pwd08_custom_range(self):
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        end = datetime(2026, 1, 31, tzinfo=timezone.utc)
        purchases = [
            _purchase_row(total_cost=100, created_at=datetime(2026, 1, 15, tzinfo=timezone.utc).isoformat()),
            _purchase_row(total_cost=200, created_at=datetime(2026, 2, 15, tzinfo=timezone.utc).isoformat()),
        ]
        client = FakeClient(purchases, [])
        result = store_admin._build_procurement_waste_summary(
            client, STORE_ID, timezone.utc, _range_ctx(all_time=False, start=start, end=end)
        )
        self.assertEqual(result["purchase_total_cost"], 100.0)

    def test_pwd09_all_time(self):
        purchases = [
            _purchase_row(total_cost=100, created_at="2020-01-01T00:00:00Z"),
            _purchase_row(total_cost=200, created_at="2026-09-01T00:00:00Z"),
        ]
        client = FakeClient(purchases, [])
        result = store_admin._build_procurement_waste_summary(client, STORE_ID, timezone.utc, _range_ctx(all_time=True))
        self.assertEqual(result["purchase_total_cost"], 300.0)

    def test_pwd10_waste_cost_uses_canonical_waste_valuation(self):
        waste = [_waste_row(total_cost=10), _waste_row(total_cost=15), _waste_row(total_cost=5)]
        client = FakeClient([], waste)
        result = store_admin._build_procurement_waste_summary(client, STORE_ID, timezone.utc, _range_ctx(all_time=True))
        self.assertEqual(result["waste_total_cost"], 30.0)

    def test_pwd11_waste_rate_formula_correct(self):
        purchases = [_purchase_row(total_cost=1000)]
        waste = [_waste_row(total_cost=25)]
        client = FakeClient(purchases, waste)
        result = store_admin._build_procurement_waste_summary(client, STORE_ID, timezone.utc, _range_ctx(all_time=True))
        self.assertEqual(result["waste_rate"], 2.5)

    def test_pwd12_purchase_total_zero_waste_rate_zero(self):
        waste = [_waste_row(total_cost=25)]
        client = FakeClient([], waste)
        result = store_admin._build_procurement_waste_summary(client, STORE_ID, timezone.utc, _range_ctx(all_time=True))
        self.assertEqual(result["waste_rate"], 0.0)
        self.assertEqual(result["purchase_total_cost"], 0.0)

    def test_pwd13_zero_data_result_valid(self):
        client = FakeClient([], [])
        result = store_admin._build_procurement_waste_summary(client, STORE_ID, timezone.utc, _range_ctx(all_time=True))
        self.assertEqual(result["purchase_total_cost"], 0.0)
        self.assertEqual(result["purchase_paid_cost"], 0.0)
        self.assertEqual(result["purchase_unpaid_cost"], 0.0)
        self.assertEqual(result["waste_total_cost"], 0.0)
        self.assertEqual(result["waste_rate"], 0.0)

    def test_pwd14_asia_bangkok_date_boundaries_correct(self):
        # Test that timezone boundaries work correctly using a fixed UTC+7 offset
        # (Asia/Bangkok may not be available in all environments without tzdata)
        from datetime import timedelta
        tz = timezone(timedelta(hours=7))
        # 2026-01-01 00:00 UTC+7 = 2025-12-31 17:00 UTC
        start = datetime(2026, 1, 1, 0, 0, tzinfo=tz)
        end = datetime(2026, 1, 2, 0, 0, tzinfo=tz)
        # Purchase at 2026-01-01 02:00 UTC+7 = within range
        purchases = [
            _purchase_row(total_cost=100, created_at=datetime(2026, 1, 1, 2, 0, tzinfo=tz).isoformat()),
            _purchase_row(total_cost=200, created_at=datetime(2025, 12, 31, 23, 0, tzinfo=tz).isoformat()),
        ]
        client = FakeClient(purchases, [])
        result = store_admin._build_procurement_waste_summary(
            client, STORE_ID, tz, _range_ctx(all_time=False, start=start, end=end)
        )
        self.assertEqual(result["purchase_total_cost"], 100.0)

    def test_pwd15_receipt_presence_does_not_affect_analytics(self):
        purchases = [
            _purchase_row(total_cost=100, payment_status="paid"),
            {**_purchase_row(total_cost=200, payment_status="paid"), "receipt_storage_path": "store-1/receipts/r1.jpg"},
        ]
        client = FakeClient(purchases, [])
        result = store_admin._build_procurement_waste_summary(client, STORE_ID, timezone.utc, _range_ctx(all_time=True))
        # Both purchases should be counted regardless of receipt presence
        self.assertEqual(result["purchase_total_cost"], 300.0)
        self.assertEqual(result["purchase_paid_cost"], 300.0)

    def test_pwd16_paid_at_does_not_determine_purchase_transaction_date(self):
        now = datetime.now(timezone.utc)
        today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        today_end = today_start + timedelta(days=1)
        # Purchase created yesterday with paid_at today — should NOT be in today's range
        yesterday = today_start - timedelta(days=1)
        purchases = [
            {
                **_purchase_row(total_cost=100, created_at=yesterday.isoformat()),
                "paid_at": now.isoformat(),
            },
        ]
        client = FakeClient(purchases, [])
        result = store_admin._build_procurement_waste_summary(
            client, STORE_ID, timezone.utc, _range_ctx(all_time=False, start=today_start, end=today_end)
        )
        # Should be 0 because created_at is yesterday, even though paid_at is today
        self.assertEqual(result["purchase_total_cost"], 0.0)

    def test_pwd17_analytics_endpoint_is_read_only(self):
        purchases = [_purchase_row(total_cost=100)]
        client = FakeClient(purchases, [])
        # Verify that _build_procurement_waste_summary only calls select, never insert/update/delete
        original_purchase_rows = list(client._tables["ingredient_purchases"]._all_rows)
        original_waste_rows = list(client._tables["ingredient_waste_records"]._all_rows)
        store_admin._build_procurement_waste_summary(client, STORE_ID, timezone.utc, _range_ctx(all_time=True))
        # No rows should have been modified or added
        self.assertEqual(client._tables["ingredient_purchases"]._all_rows, original_purchase_rows)
        self.assertEqual(client._tables["ingredient_waste_records"]._all_rows, original_waste_rows)

    def test_pwd18_unauthorized_rejected(self):
        client = FakeClient([], [])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client, role="staff")), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "staff")):
            with self.assertRaises(HTTPException) as exc:
                store_admin.get_dashboard_summary(authorization="Bearer fake")
        self.assertEqual(exc.exception.detail, "insufficient_role")

    def test_pwd19_current_dashboard_rbac_preserved(self):
        client = FakeClient([], [])
        # Manager, admin, and owner should all be allowed
        for role in ["manager", "admin", "owner"]:
            with patch("app.api.store_admin._get_ctx", return_value=_ctx(client, role=role)), \
                 patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, role)), \
                 patch("app.api.store_admin._get_store_timezone", return_value="Asia/Bangkok"), \
                 patch("app.api.store_admin._load_orders_for_dashboard", return_value=[]):
                result = store_admin.get_dashboard_summary(authorization="Bearer fake")
                self.assertIn("procurement_waste", result)

    def test_pwd20_existing_dashboard_fields_backward_compatible(self):
        client = FakeClient([], [])
        with patch("app.api.store_admin._get_ctx", return_value=_ctx(client, role="manager")), \
             patch("app.api.store_admin._resolve_store_id", return_value=(STORE_ID, "manager")), \
             patch("app.api.store_admin._get_store_timezone", return_value="Asia/Bangkok"), \
             patch("app.api.store_admin._load_orders_for_dashboard", return_value=[]):
            result = store_admin.get_dashboard_summary(authorization="Bearer fake")
            # All existing fields must still be present
            for field in ["store_id", "store_timezone", "dashboard_revenue_kpi", "today_orders_count",
                          "confirmed_revenue_today", "queues", "recent_orders", "seven_day_trend"]:
                self.assertIn(field, result, f"missing existing field: {field}")
            # New field must also be present
            self.assertIn("procurement_waste", result)

    def test_pwd21_new_v1_paid_stock_intake_contributes_to_paid_total(self):
        purchases = [_purchase_row(total_cost=150, payment_status="paid")]
        client = FakeClient(purchases, [])
        result = store_admin._build_procurement_waste_summary(client, STORE_ID, timezone.utc, _range_ctx(all_time=True))
        self.assertEqual(result["purchase_paid_cost"], 150.0)
        self.assertEqual(result["purchase_unpaid_cost"], 0.0)

    def test_pwd22_historical_unpaid_stock_intake_contributes_to_unpaid_total(self):
        purchases = [
            _purchase_row(total_cost=150, payment_status="paid"),
            _purchase_row(total_cost=50, payment_status="unpaid"),
        ]
        client = FakeClient(purchases, [])
        result = store_admin._build_procurement_waste_summary(client, STORE_ID, timezone.utc, _range_ctx(all_time=True))
        self.assertEqual(result["purchase_paid_cost"], 150.0)
        self.assertEqual(result["purchase_unpaid_cost"], 50.0)


if __name__ == "__main__":
    unittest.main()
