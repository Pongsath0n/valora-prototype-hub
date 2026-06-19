import unittest

from app.api.store_admin import (
    _PLANNING_ASSUMPTION_DEFAULTS,
    _build_overhead_planning_summary,
    _normalize_planning_assumptions,
    _summarize_overhead_expenses,
)


class PlanningOverheadHelperTests(unittest.TestCase):
    def test_no_overhead_rows_keeps_zero_values(self) -> None:
        summary = _summarize_overhead_expenses([])
        overhead = _build_overhead_planning_summary(
            items=[{"gross_profit": 50.0}],
            assumptions=dict(_PLANNING_ASSUMPTION_DEFAULTS),
            overhead_stats=summary,
        )
        self.assertEqual(summary["expense_count"], 0)
        self.assertEqual(overhead["monthly_overhead"], 0.0)
        self.assertEqual(overhead["overhead_per_cup"], 0.0)
        self.assertEqual(overhead["break_even_cups_per_month"], 0.0)

    def test_overhead_normalization_daily_weekly_monthly(self) -> None:
        expenses = [
            {"amount": 100, "period": "daily", "category": "rent"},
            {"amount": 200, "period": "weekly", "category": "labor"},
            {"amount": 300, "period": "monthly", "category": "rent"},
        ]
        summary = _summarize_overhead_expenses(expenses)
        expected_total = (100 * 30) + (200 * 4.345) + 300
        self.assertAlmostEqual(summary["monthly_overhead"], expected_total, places=5)
        self.assertEqual(summary["expense_count"], 3)
        self.assertAlmostEqual(summary["category_breakdown"]["rent"], (100 * 30) + 300, places=5)
        self.assertAlmostEqual(summary["category_breakdown"]["labor"], 200 * 4.345, places=5)

    def test_overhead_summary_handles_invalid_period(self) -> None:
        summary = _summarize_overhead_expenses([
            {"amount": 50, "period": "unknown", "category": "misc"}
        ])
        self.assertEqual(summary["expense_count"], 1)
        self.assertEqual(summary["monthly_overhead"], 50.0)
        self.assertEqual(summary["category_breakdown"], {"misc": 50.0})

    def test_break_even_calculation_uses_positive_gross_profit(self) -> None:
        summary = {"monthly_overhead": 900.0}
        assumptions = {
            "expected_cups_per_month": 300,
            "operating_days_per_month": 30,
            "target_profit_monthly": 0,
            "overhead_allocation_method": "per_cup",
        }
        items = [
            {"gross_profit": 30},
            {"gross_profit": -10},
            {"gross_profit": 60},
        ]
        overhead = _build_overhead_planning_summary(items, assumptions, summary)
        self.assertEqual(overhead["overhead_per_cup"], 3.0)
        self.assertAlmostEqual(overhead["break_even_cups_per_month"], 900.0 / 45.0)
        self.assertAlmostEqual(overhead["break_even_cups_per_day"], (900.0 / 45.0) / 30)

    def test_break_even_skips_when_no_positive_gross_profit(self) -> None:
        summary = {"monthly_overhead": 500.0}
        assumptions = {
            "expected_cups_per_month": 200,
            "operating_days_per_month": 25,
            "target_profit_monthly": 0,
            "overhead_allocation_method": "per_cup",
        }
        items = [
            {"gross_profit": 0},
            {"gross_profit": -5},
        ]
        overhead = _build_overhead_planning_summary(items, assumptions, summary)
        self.assertEqual(overhead["overhead_per_cup"], 2.5)
        self.assertIsNone(overhead["break_even_cups_per_month"])
        self.assertIsNone(overhead["break_even_cups_per_day"])

    def test_normalize_planning_assumptions_defaults_when_missing(self) -> None:
        normalized = _normalize_planning_assumptions(None)
        self.assertEqual(normalized, _PLANNING_ASSUMPTION_DEFAULTS)

    def test_normalize_planning_assumptions_invalid_values(self) -> None:
        normalized = _normalize_planning_assumptions(
            {
                "expected_cups_per_month": 0,
                "operating_days_per_month": -1,
                "target_profit_monthly": 1500,
                "overhead_allocation_method": " ",
            }
        )
        self.assertEqual(normalized["expected_cups_per_month"], _PLANNING_ASSUMPTION_DEFAULTS["expected_cups_per_month"])
        self.assertEqual(
            normalized["operating_days_per_month"], _PLANNING_ASSUMPTION_DEFAULTS["operating_days_per_month"]
        )
        self.assertEqual(normalized["target_profit_monthly"], 1500)
        self.assertEqual(normalized["overhead_allocation_method"], _PLANNING_ASSUMPTION_DEFAULTS["overhead_allocation_method"])
