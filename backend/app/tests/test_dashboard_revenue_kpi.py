import unittest
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.api.store_admin import (
    _DEFAULT_TZINFO,
    _build_dashboard_revenue_kpi,
    _resolve_revenue_range,
)


def _order(status: str, payment_status: str, total: float, created_at: str) -> dict:
    return {
        "status": status,
        "payment_status": payment_status,
        "total_amount": total,
        "created_at": created_at,
    }


class DashboardRevenueKpiTests(unittest.TestCase):
    def setUp(self):  # noqa: D401 - unittest hook
        self.tz = _DEFAULT_TZINFO

    def test_default_all_time_range(self):
        ctx = _resolve_revenue_range(None, self.tz)
        self.assertTrue(ctx["all_time"])
        self.assertIsNone(ctx["start"])
        self.assertIsNone(ctx["end"])
        self.assertEqual(ctx["key"], "all")

    def test_custom_range_validation(self):
        with self.assertRaises(HTTPException) as ctx:
            _resolve_revenue_range("custom", self.tz, start_date_text="2024-02-10", end_date_text="2024-02-01")
        self.assertEqual(ctx.exception.detail, "invalid_custom_range_order")

    def test_revenue_kpi_excludes_cancelled_and_counts_paid_pending(self):
        orders = [
            _order("completed", "paid", 120.0, "2024-01-05T10:00:00+07:00"),
            _order("waiting_payment_review", "pending_review", 60.0, "2024-01-06T11:00:00+07:00"),
            _order("pending_payment", "pending", 80.0, "2024-01-06T12:00:00+07:00"),
            _order("cancelled", "unpaid", 50.0, "2024-01-06T13:00:00+07:00"),
        ]
        ctx = _resolve_revenue_range("all", self.tz)
        kpi = _build_dashboard_revenue_kpi(orders, self.tz, range_ctx=ctx, timezone_name="Asia/Bangkok (UTC+7)")

        self.assertEqual(kpi["total_sales_amount"], 260.0)
        self.assertEqual(kpi["total_sales_order_count"], 3)
        self.assertEqual(kpi["paid_sales_amount"], 120.0)
        self.assertEqual(kpi["pending_sales_amount"], 140.0)
        self.assertEqual(kpi["pending_sales_order_count"], 2)
        self.assertEqual(kpi["excluded_cancelled_order_count"], 1)

    def test_custom_range_filters_by_created_at(self):
        orders = [
            _order("completed", "paid", 100.0, "2024-03-01T09:00:00+07:00"),
            _order("completed", "paid", 150.0, "2024-03-15T09:00:00+07:00"),
            _order("completed", "paid", 200.0, "2024-04-02T09:00:00+07:00"),
        ]
        tz = timezone(timedelta(hours=7))
        ctx = _resolve_revenue_range("custom", tz, start_date_text="2024-03-01", end_date_text="2024-03-31")
        kpi = _build_dashboard_revenue_kpi(orders, tz, range_ctx=ctx, timezone_name="Asia/Bangkok (UTC+7)")

        self.assertEqual(kpi["total_sales_amount"], 250.0)
        self.assertEqual(kpi["total_sales_order_count"], 2)
        # generated_at should be a valid ISO timestamp
        datetime.fromisoformat(kpi["generated_at"])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
