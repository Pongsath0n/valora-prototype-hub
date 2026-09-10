"""Tests for BE-01: server-generated usage snapshot.

Covers:
- Base recipe usage extraction.
- Addon usage extraction with addon_id.
- Quantity aggregation (per-unit, RPC multiplies later).
- Missing/invalid recipe behaviour.
- Client ``_system`` injection being stripped.
- ``has_usage_snapshot`` detection.
- ``mask_system_from_options`` for customer responses.
"""
import unittest
from typing import Any, Dict, List

from app.services.usage_snapshot import (
    UsageSnapshotError,
    build_usage_breakdown,
    embed_usage_snapshot,
    has_usage_snapshot,
    mask_system_from_options,
    strip_client_system,
)


def _base_detail(ingredient_id: str, qty: float, unit: str = "g") -> Dict[str, Any]:
    return {
        "ingredient_id": ingredient_id,
        "quantity_used": qty,
        "unit": unit,
        "cost_per_unit": 1.0,
        "line_cost": qty,
        "ingredient_name": ingredient_id,
        "cost_type": "ingredient",
        "issues": [],
    }


def _addon_detail(ingredient_id: str, addon_id: str, qty: float, unit: str = "g") -> Dict[str, Any]:
    return {
        "ingredient_id": ingredient_id,
        "quantity_used": qty,
        "cost_per_unit": 1.0,
        "line_cost": qty,
        "ingredient_name": ingredient_id,
        "addon_id": addon_id,
        "unit": unit,
    }


def _snapshot(
    *,
    quantity: int = 1,
    base_breakdown: List[Dict[str, Any]],
    addon_breakdown: List[Dict[str, Any]] = None,
    options_snapshot: Dict[str, Any] = None,
) -> Dict[str, Any]:
    return {
        "product_id": "prod-1",
        "quantity": quantity,
        "base_cost_breakdown": base_breakdown,
        "addon_cost_breakdown": addon_breakdown or [],
        "options_snapshot": options_snapshot or {"sweetness": 100, "addons": []},
    }


class BuildUsageBreakdownTests(unittest.TestCase):
    def test_base_recipe_usage_extracted(self) -> None:
        snapshot = _snapshot(
            base_breakdown=[
                _base_detail("ing-coffee", 18.0, "g"),
                _base_detail("ing-milk", 150.0, "ml"),
            ],
        )
        breakdown = build_usage_breakdown(snapshot)
        base = breakdown["base"]
        by_ing = {row["ingredient_id"]: row for row in base}
        self.assertEqual(by_ing["ing-coffee"]["quantity_used"], 18.0)
        self.assertEqual(by_ing["ing-milk"]["quantity_used"], 150.0)
        self.assertEqual(by_ing["ing-coffee"]["unit"], "g")
        self.assertEqual(len(base), 2)
        # Addons list exists but is empty.
        self.assertEqual(breakdown["addons"], [])

    def test_addon_usage_extracted_with_addon_id(self) -> None:
        snapshot = _snapshot(
            base_breakdown=[_base_detail("ing-coffee", 18.0)],
            addon_breakdown=[_addon_detail("ing-coffee", "addon-shot", 18.0)],
        )
        breakdown = build_usage_breakdown(snapshot)
        addons = breakdown["addons"]
        self.assertEqual(len(addons), 1)
        self.assertEqual(addons[0]["ingredient_id"], "ing-coffee")
        self.assertEqual(addons[0]["addon_id"], "addon-shot")
        self.assertEqual(addons[0]["quantity_used"], 18.0)

    def test_quantity_is_per_unit_not_multiplied(self) -> None:
        # The RPC multiplies by oi.quantity; the snapshot stores per-unit.
        snapshot = _snapshot(
            quantity=3,
            base_breakdown=[_base_detail("ing-coffee", 18.0)],
        )
        breakdown = build_usage_breakdown(snapshot)
        self.assertEqual(breakdown["base"][0]["quantity_used"], 18.0)

    def test_multiple_addons_for_same_ingredient_kept_separate(self) -> None:
        snapshot = _snapshot(
            base_breakdown=[_base_detail("ing-coffee", 18.0)],
            addon_breakdown=[
                _addon_detail("ing-coffee", "addon-shot", 18.0),
                _addon_detail("ing-coffee", "addon-syrup", 5.0, "ml"),
            ],
        )
        breakdown = build_usage_breakdown(snapshot)
        self.assertEqual(len(breakdown["addons"]), 2)

    def test_missing_base_breakdown_raises(self) -> None:
        snapshot = _snapshot(base_breakdown=[])
        with self.assertRaises(UsageSnapshotError) as ctx:
            build_usage_breakdown(snapshot)
        self.assertEqual(ctx.exception.reason, "missing_recipe")

    def test_missing_base_breakdown_key_raises(self) -> None:
        snapshot = {"addon_cost_breakdown": []}
        with self.assertRaises(UsageSnapshotError) as ctx:
            build_usage_breakdown(snapshot)
        self.assertEqual(ctx.exception.reason, "missing_recipe")

    def test_zero_quantity_ingredient_skipped(self) -> None:
        snapshot = _snapshot(
            base_breakdown=[
                _base_detail("ing-coffee", 18.0),
                _base_detail("ing-water", 0.0, "ml"),
            ],
        )
        breakdown = build_usage_breakdown(snapshot)
        ids = [row["ingredient_id"] for row in breakdown["base"]]
        self.assertIn("ing-coffee", ids)
        self.assertNotIn("ing-water", ids)

    def test_missing_ingredient_id_skipped(self) -> None:
        snapshot = _snapshot(
            base_breakdown=[
                {"ingredient_id": None, "quantity_used": 18.0, "unit": "g"},
                _base_detail("ing-coffee", 18.0),
            ],
        )
        breakdown = build_usage_breakdown(snapshot)
        self.assertEqual(len(breakdown["base"]), 1)

    def test_addon_without_addon_id_skipped(self) -> None:
        snapshot = _snapshot(
            base_breakdown=[_base_detail("ing-coffee", 18.0)],
            addon_breakdown=[
                {"ingredient_id": "ing-sugar", "quantity_used": 5.0, "unit": "g"},
            ],
        )
        breakdown = build_usage_breakdown(snapshot)
        self.assertEqual(breakdown["addons"], [])


class StripClientSystemTests(unittest.TestCase):
    def test_strips_system_from_dict(self) -> None:
        options = {
            "sweetness": 50,
            "_system": {"usage_breakdown": {"base": [{"ingredient_id": "evil"}]}},
            "addons": [],
        }
        cleaned = strip_client_system(options)
        self.assertNotIn("_system", cleaned)
        self.assertEqual(cleaned["sweetness"], 50)

    def test_no_system_returns_copy(self) -> None:
        options = {"sweetness": 50, "addons": []}
        cleaned = strip_client_system(options)
        self.assertEqual(cleaned, options)
        self.assertIsNot(cleaned, options)

    def test_non_dict_returned_unchanged(self) -> None:
        self.assertIsNone(strip_client_system(None))
        self.assertEqual(strip_client_system("hello"), "hello")


class EmbedUsageSnapshotTests(unittest.TestCase):
    def test_embeds_server_snapshot_into_options(self) -> None:
        options = {"sweetness": 100, "addons": [{"addon_id": "a1", "quantity": 2}]}
        snapshot = _snapshot(
            base_breakdown=[_base_detail("ing-coffee", 18.0)],
            addon_breakdown=[_addon_detail("ing-milk", "a1", 10.0, "ml")],
        )
        result = embed_usage_snapshot(options, snapshot)
        self.assertIn("_system", result)
        breakdown = result["_system"]["usage_breakdown"]
        self.assertEqual(len(breakdown["base"]), 1)
        self.assertEqual(breakdown["base"][0]["ingredient_id"], "ing-coffee")
        self.assertEqual(len(breakdown["addons"]), 1)
        self.assertEqual(breakdown["addons"][0]["addon_id"], "a1")
        # Original customer-facing fields preserved.
        self.assertEqual(result["sweetness"], 100)
        self.assertEqual(len(result["addons"]), 1)

    def test_client_system_is_overwritten_by_server_snapshot(self) -> None:
        options = {
            "sweetness": 50,
            "_system": {"usage_breakdown": {"base": [{"ingredient_id": "evil", "quantity_used": 999}]}},
        }
        snapshot = _snapshot(base_breakdown=[_base_detail("ing-coffee", 18.0)])
        result = embed_usage_snapshot(options, snapshot)
        breakdown = result["_system"]["usage_breakdown"]
        base_ids = [row["ingredient_id"] for row in breakdown["base"]]
        self.assertIn("ing-coffee", base_ids)
        self.assertNotIn("evil", base_ids)

    def test_missing_recipe_raises_during_embed(self) -> None:
        options = {"sweetness": 50}
        snapshot = _snapshot(base_breakdown=[])
        with self.assertRaises(UsageSnapshotError):
            embed_usage_snapshot(options, snapshot)


class HasUsageSnapshotTests(unittest.TestCase):
    def test_detects_existing_snapshot(self) -> None:
        options = {"_system": {"usage_breakdown": {"base": [], "addons": []}}}
        self.assertTrue(has_usage_snapshot(options))

    def test_returns_false_for_missing_snapshot(self) -> None:
        self.assertFalse(has_usage_snapshot({"sweetness": 50}))

    def test_returns_false_for_non_dict(self) -> None:
        self.assertFalse(has_usage_snapshot(None))
        self.assertFalse(has_usage_snapshot("hello"))


class MaskSystemFromOptionsTests(unittest.TestCase):
    def test_removes_system_key(self) -> None:
        options = {
            "sweetness": 50,
            "addons": [],
            "_system": {"usage_breakdown": {"base": [{"ingredient_id": "ing"}]}},
        }
        masked = mask_system_from_options(options)
        self.assertNotIn("_system", masked)
        self.assertEqual(masked["sweetness"], 50)

    def test_preserves_other_keys(self) -> None:
        options = {"sweetness": 50, "addons": [{"addon_id": "a1"}], "note": "hi"}
        masked = mask_system_from_options(options)
        self.assertEqual(masked, options)

    def test_non_dict_unchanged(self) -> None:
        self.assertIsNone(mask_system_from_options(None))


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
